import { createHash } from "node:crypto";
import type { IngestedRepository } from "@/services/github";
import type {
  GroundedEvidenceBundle,
  InterviewQuestion,
  SkillEvidence,
} from "@/types/analysis";
import {
  ContextSafeInterviewQuestionSchema,
  DetectorFindingSchema,
  EvidenceCitationSchema,
  type AttributionStatus,
  type CanonicalEvidenceLevel,
  type ContextSafeInterviewQuestion,
  type DiscoveryOrigin,
  type EvidenceCitation,
} from "@/types/remediation";
import {
  PINNED_CAPABILITY_TAXONOMY_VERSION,
  resolveCapabilityAlias,
} from "./capability-taxonomy";

const DETECTOR_VERSION = "1.0.0";
const MAX_EXCERPT_LINES = 5;
const MAX_EXCERPT_CHARACTERS = 800;
const EXCLUDED_PATH = /(^|\/)(node_modules|vendor|dist|build|coverage|\.next|\.cache|generated)(\/|$)/iu;
const SECRET_SHAPE = /(bearer\s+[A-Za-z0-9._~-]+|scrypt\$|gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]+PRIVATE KEY-----)/iu;
const CONTACT_SHAPE = /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+?\d[\d ()-]{8,}\d)/iu;
const PROTECTED_TRAIT = /\b(?:race|ethnicity|religion|pregnan(?:t|cy)|disability|sexual orientation|marital status)\b/iu;

const LEVELS: Record<SkillEvidence["level"], CanonicalEvidenceLevel> = {
  "Strong Evidence": "strong",
  "Good Evidence": "good",
  "Partial Evidence": "partial",
  "Limited Evidence": "limited",
  "Insufficient Evidence": "insufficient",
};

function stableId(prefix: string, ...parts: string[]): string {
  return `${prefix}-${createHash("sha256").update(parts.join("\0"), "utf8").digest("hex").slice(0, 24)}`;
}

function encodedPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function safeExcerpt(value: string): string | null {
  if (SECRET_SHAPE.test(value) || CONTACT_SHAPE.test(value) || PROTECTED_TRAIT.test(value)) return null;
  return value.length > MAX_EXCERPT_CHARACTERS ? value.slice(0, MAX_EXCERPT_CHARACTERS) : value;
}

export function redactEvidenceText(value: string): string | null {
  return safeExcerpt(value);
}

function meaningfulLine(content: string, capability: string): number {
  const lines = content.split(/\r?\n/u);
  const escaped = capability.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const direct = new RegExp(escaped, "iu");
  const directIndex = lines.findIndex((line) => direct.test(line));
  if (directIndex >= 0) return directIndex;
  const codeIndex = lines.findIndex((line) => line.trim().length >= 8 && !/^\s*(?:\/\/|#|\*|<!--)/u.test(line));
  return Math.max(0, codeIndex);
}

function excerptFor(content: string, capability: string) {
  const lines = content.split(/\r?\n/u);
  const startIndex = meaningfulLine(content, capability);
  const endIndex = Math.min(lines.length, startIndex + MAX_EXCERPT_LINES);
  const excerpt = lines.slice(startIndex, endIndex).join("\n");
  const before = lines.slice(0, startIndex).join("\n");
  const startOffset = before.length + (startIndex > 0 ? 1 : 0);
  return {
    startLine: startIndex + 1,
    endLine: Math.max(startIndex + 1, endIndex),
    startOffset,
    endOffset: startOffset + excerpt.length,
    excerpt: safeExcerpt(excerpt),
  };
}

function symbolFor(content: string): string | null {
  return [
    /\b(?:class|interface|record|enum)\s+([A-Za-z_$][\w$]*)/u,
    /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/u,
    /\b(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/u,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/u,
  ].map((pattern) => content.match(pattern)?.[1]).find(Boolean) ?? null;
}

function immutableRevision(repository: IngestedRepository): string | null {
  if (repository.ingestionMethod !== "provider") return null;
  return /^[a-f0-9]{7,64}$/iu.test(repository.metadata.commitSha) ? repository.metadata.commitSha : null;
}

export function buildGroundedEvidenceBundle(input: {
  repository: IngestedRepository;
  analysisVersionId: string;
  skills: readonly SkillEvidence[];
  questions: readonly InterviewQuestion[];
  discoveryOrigin?: DiscoveryOrigin;
  attributionStatus?: AttributionStatus;
}): GroundedEvidenceBundle {
  const taxonomyVersion = PINNED_CAPABILITY_TAXONOMY_VERSION;
  const discoveryOrigin = input.discoveryOrigin ?? "manual entry";
  const attributionStatus = input.attributionStatus ?? "unverified";
  const repositoryId = stableId("repository", input.repository.metadata.url.toLowerCase());
  const revision = immutableRevision(input.repository);
  const fileByPath = new Map(input.repository.files.map((file) => [file.path, file]));
  const findings = [];
  const citations: EvidenceCitation[] = [];

  for (const skill of input.skills) {
    const capability = resolveCapabilityAlias(skill.skill, taxonomyVersion);
    if (!capability) continue;
    const capabilityId = capability.id;
    for (const evidence of skill.evidence) {
      const file = fileByPath.get(evidence.file);
      if (!file || EXCLUDED_PATH.test(file.path)) continue;
      const location = excerptFor(file.content, skill.skill);
      const findingId = stableId("finding", input.analysisVersionId, capabilityId, file.path, String(location.startOffset));
      const detectorId = `deterministic.skill.${capabilityId}`;
      const finding = DetectorFindingSchema.parse({
        id: findingId,
        detectorId,
        detectorVersion: DETECTOR_VERSION,
        capabilityId,
        signalClass: skill.level === "Limited Evidence" ? "configuration" : "implementation",
        repositoryId,
        revision,
        filePath: file.path,
        symbol: symbolFor(file.content),
        startLine: location.startLine,
        endLine: location.endLine,
        excerptStartOffset: location.startOffset,
        excerptEndOffset: location.endOffset,
      });
      findings.push(finding);
      const lineFragment = `#L${location.startLine}-L${location.endLine}`;
      const target = revision ?? "HEAD";
      citations.push(EvidenceCitationSchema.parse({
        id: stableId("citation", findingId),
        findingId,
        detectorId,
        detectorVersion: DETECTOR_VERSION,
        repositoryId,
        repositoryUrl: input.repository.metadata.url,
        repositoryName: `${input.repository.metadata.owner}/${input.repository.metadata.name}`,
        revision,
        revisionAvailability: revision ? "available" : "unavailable",
        filePath: file.path,
        symbol: finding.symbol,
        startLine: location.startLine,
        endLine: location.endLine,
        excerpt: location.excerpt,
        sourceLink: `${input.repository.metadata.url}/blob/${target}/${encodedPath(file.path)}${lineFragment}`,
        discoveryOrigin,
        attributionStatus,
        evidenceLevel: LEVELS[skill.level],
        taxonomyVersion,
      }));
    }
  }

  return {
    taxonomyVersion,
    findings,
    citations,
    interviewQuestions: contextSafeQuestions({
      analysisVersionId: input.analysisVersionId,
      questions: input.questions,
      citations,
      files: input.repository.files,
      attributionStatus,
    }),
  };
}

function hasFlaskHttpEvidence(files: IngestedRepository["files"]): boolean {
  return files.some((file) => /\b(?:Flask\s*\(|Blueprint\s*\(|@\w+\.route\s*\(|from\s+flask\s+import)\b/iu.test(file.content));
}

export function contextSafeQuestions(input: {
  analysisVersionId: string;
  questions: readonly InterviewQuestion[];
  citations: readonly EvidenceCitation[];
  files: IngestedRepository["files"];
  attributionStatus: AttributionStatus;
}): ContextSafeInterviewQuestion[] {
  const citationsByPath = new Map<string, EvidenceCitation[]>();
  for (const citation of input.citations) {
    citationsByPath.set(citation.filePath, [...(citationsByPath.get(citation.filePath) ?? []), citation]);
  }
  const output: ContextSafeInterviewQuestion[] = [];
  for (const [index, question] of input.questions.entries()) {
    const flaskHttpQuestion = /\bflask\b/iu.test(question.question) && /\b(?:http|route|request|endpoint)\b/iu.test(question.question);
    if (flaskHttpQuestion && !hasFlaskHttpEvidence(input.files)) {
      output.push(ContextSafeInterviewQuestionSchema.parse({
        id: stableId("question", input.analysisVersionId, String(index), "flask-gap"),
        analysisVersionId: input.analysisVersionId,
        basis: { kind: "gap", missingCapabilityId: "framework.flask.http" },
        attributionGate: input.attributionStatus,
        question: "No Flask HTTP route evidence was found. Which framework handles request routing, and where is that boundary implemented?",
        redactionApplied: false,
      }));
      continue;
    }
    const citationIds = question.files.flatMap((path) => citationsByPath.get(path) ?? []).map((citation) => citation.id);
    if (citationIds.length === 0) continue;
    const redacted = redactEvidenceText(question.question);
    if (!redacted) continue;
    const safeQuestion = input.attributionStatus === "verified_contributor"
      ? redacted
      : `To verify your relationship to this repository, ${redacted.charAt(0).toLowerCase()}${redacted.slice(1)}`;
    output.push(ContextSafeInterviewQuestionSchema.parse({
      id: stableId("question", input.analysisVersionId, String(index), safeQuestion),
      analysisVersionId: input.analysisVersionId,
      basis: { kind: "evidence", citationIds: [...new Set(citationIds)] },
      attributionGate: input.attributionStatus,
      question: safeQuestion,
      redactionApplied: safeQuestion !== question.question,
    }));
  }
  return output;
}

export function reprojectGroundedEvidence(
  bundle: GroundedEvidenceBundle,
  discoveryOrigin: DiscoveryOrigin,
  attributionStatus: AttributionStatus,
): GroundedEvidenceBundle {
  const citations = bundle.citations.map((citation) => ({ ...citation, discoveryOrigin, attributionStatus }));
  return {
    ...bundle,
    citations,
    interviewQuestions: bundle.interviewQuestions.map((question) => ({
      ...question,
      attributionGate: attributionStatus,
      question: attributionStatus === "verified_contributor" || question.basis.kind === "gap"
        ? question.question.replace(/^To verify your relationship to this repository,\s*/u, "")
        : question.question.startsWith("To verify your relationship")
          ? question.question
          : `To verify your relationship to this repository, ${question.question.charAt(0).toLowerCase()}${question.question.slice(1)}`,
      redactionApplied: question.redactionApplied || attributionStatus !== "verified_contributor",
    })),
  };
}
