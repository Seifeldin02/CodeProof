import { createHash, randomUUID } from "node:crypto";
import { matchJobDescription } from "@/features/job-matching/match";
import { verifyResumeClaims } from "@/features/resume-matching/claims";
import { GitHubClient, type IngestedRepository } from "@/services/github";
import { groundAiOutput, OpenAiProvider, type AiProvider } from "@/services/ai";
import type {
  ArchitectureSummary,
  AnalysisInput,
  AnalysisResult,
  AnalysisStage,
  AnalysisWarning,
  EvidenceGap,
  InterviewQuestion,
  SkillEvidence,
} from "@/types/analysis";
import { getCachedAnalysis, setCachedAnalysis } from "./cache";
import {
  buildDeterministicArchitecture,
  buildDeterministicQuestions,
  buildDeterministicSkills,
  detectEvidenceGaps,
  detectTechnologies,
  inferProjectType,
} from "./deterministic";

interface RepositorySource {
  ingest(url: string): Promise<IngestedRepository>;
}

export interface AnalysisEngineOptions {
  github?: RepositorySource;
  aiProvider?: AiProvider | null;
  onStage?: (stage: AnalysisStage) => void;
  cache?: boolean;
}

function inputFingerprint(repository: IngestedRepository, input: AnalysisInput): string {
  return createHash("sha256")
    .update(repository.metadata.owner.toLowerCase())
    .update("\0")
    .update(repository.metadata.name.toLowerCase())
    .update("\0")
    .update(repository.metadata.commitSha)
    .update("\0")
    .update(input.resumeText ?? "")
    .update("\0")
    .update(input.jobDescription ?? "")
    .digest("hex");
}

function configuredAiProvider(): AiProvider | null {
  return process.env.OPENAI_API_KEY ? new OpenAiProvider(process.env.OPENAI_API_KEY) : null;
}

export async function analyzeRepository(
  input: AnalysisInput,
  options: AnalysisEngineOptions = {},
): Promise<AnalysisResult> {
  const startedAt = Date.now();
  const onStage = options.onStage ?? (() => undefined);
  const github = options.github ?? new GitHubClient();
  const aiProvider = options.aiProvider === undefined ? configuredAiProvider() : options.aiProvider;
  const warnings: AnalysisWarning[] = [];

  onStage("fetching_repository");
  const repository = await github.ingest(input.repositoryUrl);
  const cacheKey = inputFingerprint(repository, input);
  if (options.cache !== false) {
    const cached = getCachedAnalysis(cacheKey);
    if (cached) {
      onStage("completed");
      return {
        ...cached,
        metadata: {
          ...cached.metadata,
          analysisId: randomUUID(),
          analyzedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
          cacheHit: true,
        },
      };
    }
  }

  if (repository.treeTruncated) {
    warnings.push({
      code: "GITHUB_TREE_TRUNCATED",
      message: "GitHub truncated the recursive tree response. Results cover only the paths GitHub returned.",
    });
  }
  if (repository.files.length === 0) {
    warnings.push({
      code: "NO_SUPPORTED_SOURCE_FILES",
      message: "No supported text source files passed the selection limits. Metadata and language analysis are still available.",
    });
  }

  onStage("detecting_technologies");
  const technologies = detectTechnologies(repository);
  const projectType = inferProjectType(repository, technologies);
  onStage("selecting_files");

  let architecture: ArchitectureSummary;
  let skills: SkillEvidence[];
  let gaps: EvidenceGap[];
  let interviewQuestions: InterviewQuestion[];

  if (aiProvider && repository.files.length > 0) {
    architecture = buildDeterministicArchitecture(repository, technologies, projectType);
    skills = buildDeterministicSkills(repository, technologies);
    gaps = detectEvidenceGaps(repository);
    interviewQuestions = buildDeterministicQuestions(repository, technologies);
    try {
      onStage("analyzing_architecture");
      const rawAiOutput = await aiProvider.analyze({
        repositoryName: `${repository.metadata.owner}/${repository.metadata.name}`,
        repositoryDescription: repository.metadata.description,
        projectType,
        technologies,
        files: repository.files,
      });
      onStage("verifying_evidence");
      const grounded = groundAiOutput(rawAiOutput, repository.files.map((file) => file.path));
      architecture = grounded.output.architecture;
      if (grounded.output.skills.length) skills = grounded.output.skills;
      if (grounded.output.gaps.length) gaps = grounded.output.gaps;
      onStage("generating_interview");
      if (grounded.output.interviewQuestions.length) interviewQuestions = grounded.output.interviewQuestions;
      if (grounded.rejectedPathCount > 0) {
        warnings.push({
          code: "UNGROUNDED_AI_PATHS_REJECTED",
          message: `${grounded.rejectedPathCount} AI file reference(s) were removed because they were not in the selected repository evidence.`,
        });
      }
    } catch (error) {
      warnings.push({
        code: "AI_ANALYSIS_FAILED",
        message: `AI interpretation was unavailable; deterministic evidence is shown instead. ${error instanceof Error ? error.message : "Unknown provider error."}`,
      });
    }
  } else {
    onStage("analyzing_architecture");
    architecture = buildDeterministicArchitecture(repository, technologies, projectType);
    onStage("verifying_evidence");
    skills = buildDeterministicSkills(repository, technologies);
    gaps = detectEvidenceGaps(repository);
    onStage("generating_interview");
    interviewQuestions = buildDeterministicQuestions(repository, technologies);
    warnings.push({
      code: "AI_NOT_CONFIGURED",
      message: "OPENAI_API_KEY is not configured. Results contain deterministic repository evidence only.",
    });
  }

  const resumeVerification = input.resumeText?.trim()
    ? verifyResumeClaims(input.resumeText, technologies, skills)
    : null;
  const jobMatch = input.jobDescription?.trim()
    ? matchJobDescription(input.jobDescription, technologies, skills, resumeVerification)
    : null;

  onStage("completed");
  const result: AnalysisResult = {
    repository: repository.metadata,
    languages: repository.languages,
    technologies,
    projectType,
    architecture,
    skills,
    gaps,
    resumeVerification,
    jobMatch,
    interviewQuestions,
    selectedFiles: repository.files.map(({ path, size, truncated, selectionReason }) => ({
      path,
      size,
      truncated,
      selectionReason,
    })),
    metadata: {
      analysisId: randomUUID(),
      analyzedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      selectedFileCount: repository.files.length,
      inspectedTreeFileCount: repository.treeFileCount,
      selectedBytes: repository.files.reduce((total, file) => total + file.content.length, 0),
      cacheHit: false,
      aiProvider: aiProvider?.name ?? null,
      aiModel: aiProvider?.model ?? null,
      warnings,
    },
  };
  if (options.cache !== false) setCachedAnalysis(cacheKey, result);
  return result;
}
