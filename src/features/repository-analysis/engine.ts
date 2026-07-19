import { createHash, randomUUID } from "node:crypto";
import { matchJobDescription } from "@/features/job-matching/match";
import { verifyResumeClaims } from "@/features/resume-matching/claims";
import {
  groundAiOutput,
  jobExtractionSchema,
  OpenAiProvider,
  resumeExtractionSchema,
  type AiProvider,
} from "@/services/ai";
import { GitHubClient, type IngestedRepository } from "@/services/github";
import { logger } from "@/services/observability/logger";
import type {
  AnalysisInput,
  AnalysisResult,
  AnalysisStage,
  AnalysisWarning,
  ArchitectureSummary,
  EvidenceGap,
  ExtractedJobRequirement,
  ExtractedResumeClaim,
  InterviewQuestion,
  SkillEvidence,
} from "@/types/analysis";
import { getDefaultCacheStore, type AnalysisCacheStore } from "./cache";
import {
  buildDeterministicArchitecture,
  buildDeterministicQuestions,
  buildDeterministicSkills,
  detectEvidenceGaps,
  detectTechnologies,
  inferProjectType,
} from "./deterministic";
import { ANALYSIS_ENGINE_VERSION } from "./version";

interface RepositorySource {
  ingest(url: string): Promise<IngestedRepository>;
}

export interface AnalysisEngineOptions {
  github?: RepositorySource;
  aiProvider?: AiProvider | null;
  cacheStore?: AnalysisCacheStore;
  onStage?: (stage: AnalysisStage) => void;
  cache?: boolean;
}

export function buildAnalysisCacheKey(
  repository: IngestedRepository,
  input: AnalysisInput,
  aiProvider: AiProvider | null,
): string {
  return createHash("sha256")
    .update(ANALYSIS_ENGINE_VERSION)
    .update("\0")
    .update(repository.metadata.owner.toLowerCase())
    .update("\0")
    .update(repository.metadata.name.toLowerCase())
    .update("\0")
    .update(repository.metadata.commitSha)
    .update("\0")
    .update(input.resumeText ?? "")
    .update("\0")
    .update(input.jobDescription ?? "")
    .update("\0")
    .update(aiProvider ? `${aiProvider.name}:${aiProvider.model}` : "deterministic")
    .digest("hex");
}

function configuredAiProvider(): AiProvider | null {
  return process.env.OPENAI_API_KEY ? new OpenAiProvider(process.env.OPENAI_API_KEY) : null;
}

export async function analyzeRepository(
  input: AnalysisInput,
  options: AnalysisEngineOptions = {},
): Promise<AnalysisResult> {
  const analysisId = randomUUID();
  const startedAt = Date.now();
  const onStage = options.onStage ?? (() => undefined);
  const github = options.github ?? new GitHubClient();
  const aiProvider = options.aiProvider === undefined ? configuredAiProvider() : options.aiProvider;
  const cacheStore = options.cache === false ? null : options.cacheStore ?? getDefaultCacheStore();
  const warnings: AnalysisWarning[] = [];
  logger.info("analysis_started", { analysisId, engineVersion: ANALYSIS_ENGINE_VERSION, aiConfigured: Boolean(aiProvider) });

  onStage("fetching_repository");
  const repository = await github.ingest(input.repositoryUrl);
  const cacheKey = buildAnalysisCacheKey(repository, input, aiProvider);
  if (cacheStore) {
    try {
      const cached = await cacheStore.get(cacheKey, ANALYSIS_ENGINE_VERSION);
      if (cached) {
        const durationMs = Date.now() - startedAt;
        logger.info("cache_hit", { analysisId, storage: cacheStore.storage });
        logger.info("analysis_completed", { analysisId, durationMs, cacheHit: true });
        onStage("completed");
        return {
          ...cached,
          metadata: {
            ...cached.metadata,
            analysisId,
            analyzedAt: new Date().toISOString(),
            durationMs,
            cacheHit: true,
            cacheStorage: cacheStore.storage,
          },
        };
      }
      logger.info("cache_miss", { analysisId, storage: cacheStore.storage });
    } catch (error) {
      logger.warn("cache_read_failed", { analysisId, storage: cacheStore.storage, errorType: error instanceof Error ? error.name : "unknown" });
      warnings.push({ code: "CACHE_READ_FAILED", message: "Persistent cache lookup failed; analysis continued normally." });
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
  let architecture: ArchitectureSummary = buildDeterministicArchitecture(repository, technologies, projectType);
  let skills: SkillEvidence[] = buildDeterministicSkills(repository, technologies);
  let gaps: EvidenceGap[] = detectEvidenceGaps(repository);
  let interviewQuestions: InterviewQuestion[] = buildDeterministicQuestions(repository, technologies);
  logger.info("deterministic_analysis_completed", {
    analysisId,
    technologyCount: technologies.length,
    skillCount: skills.length,
    gapCount: gaps.length,
  });

  let aiStatus: AnalysisResult["metadata"]["aiStatus"] = aiProvider ? "unavailable_failed" : "unavailable_not_configured";
  let aiUnavailableReason: string | null = aiProvider
    ? "No supported source files were available for deep analysis."
    : "OPENAI_API_KEY is not configured.";
  if (aiProvider && repository.files.length > 0) {
    try {
      onStage("analyzing_architecture");
      logger.info("ai_repository_analysis_started", { analysisId, provider: aiProvider.name, model: aiProvider.model });
      const rawAiOutput = await aiProvider.analyze({
        repositoryName: `${repository.metadata.owner}/${repository.metadata.name}`,
        repositoryDescription: repository.metadata.description,
        projectType,
        technologies,
        files: repository.files,
      });
      onStage("verifying_evidence");
      const grounded = groundAiOutput(rawAiOutput, repository.files);
      if (grounded.architectureGrounded) architecture = grounded.output.architecture;
      else warnings.push({ code: "UNGROUNDED_AI_ARCHITECTURE_REJECTED", message: "AI architecture interpretation was discarded because it did not cite selected repository files." });
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
      if (grounded.downgradedSkillCount > 0) {
        warnings.push({
          code: "AI_EVIDENCE_LEVELS_DOWNGRADED",
          message: `${grounded.downgradedSkillCount} AI skill level(s) were reduced by deterministic evidence-strength rules.`,
        });
      }
      aiStatus = "completed";
      aiUnavailableReason = null;
      logger.info("ai_repository_analysis_completed", {
        analysisId,
        groundedSkillCount: grounded.output.skills.length,
        rejectedPathCount: grounded.rejectedPathCount,
        downgradedSkillCount: grounded.downgradedSkillCount,
      });
    } catch (error) {
      aiStatus = "unavailable_failed";
      aiUnavailableReason = "Provider request or structured-output validation failed.";
      logger.warn("ai_repository_analysis_failed", { analysisId, provider: aiProvider.name, errorType: error instanceof Error ? error.name : "unknown" });
      warnings.push({
        code: "AI_ANALYSIS_FAILED",
        message: "Deep AI evidence analysis unavailable. Showing deterministic repository signals only.",
      });
    }
  } else {
    onStage("analyzing_architecture");
    onStage("verifying_evidence");
    onStage("generating_interview");
    warnings.push({
      code: aiProvider ? "AI_NO_SOURCE_FILES" : "AI_NOT_CONFIGURED",
      message: "Deep AI evidence analysis unavailable. Showing deterministic repository signals only.",
    });
  }

  let extractedResumeClaims: ExtractedResumeClaim[] | undefined;
  if (input.resumeText?.trim() && aiProvider?.extractResumeClaims) {
    try {
      logger.info("ai_resume_extraction_started", { analysisId, textLength: input.resumeText.length });
      extractedResumeClaims = resumeExtractionSchema.parse({
        claims: await aiProvider.extractResumeClaims(input.resumeText),
      }).claims;
      logger.info("ai_resume_extraction_completed", { analysisId, claimCount: extractedResumeClaims.length });
    } catch (error) {
      logger.warn("ai_resume_extraction_failed", { analysisId, errorType: error instanceof Error ? error.name : "unknown" });
      warnings.push({ code: "AI_RESUME_EXTRACTION_FAILED", message: "AI résumé extraction was unavailable. Deterministic claim extraction was used." });
    }
  }
  const resumeVerification = input.resumeText?.trim()
    ? verifyResumeClaims(input.resumeText, technologies, skills, extractedResumeClaims)
    : null;

  let extractedJobRequirements: ExtractedJobRequirement[] | undefined;
  if (input.jobDescription?.trim() && aiProvider?.extractJobRequirements) {
    try {
      logger.info("ai_job_extraction_started", { analysisId, textLength: input.jobDescription.length });
      extractedJobRequirements = jobExtractionSchema.parse({
        requirements: await aiProvider.extractJobRequirements(input.jobDescription),
      }).requirements;
      logger.info("ai_job_extraction_completed", { analysisId, requirementCount: extractedJobRequirements.length });
    } catch (error) {
      logger.warn("ai_job_extraction_failed", { analysisId, errorType: error instanceof Error ? error.name : "unknown" });
      warnings.push({ code: "AI_JOB_EXTRACTION_FAILED", message: "AI job extraction was unavailable. Deterministic requirement extraction was used." });
    }
  }
  const jobMatch = input.jobDescription?.trim()
    ? matchJobDescription(input.jobDescription, technologies, skills, resumeVerification, extractedJobRequirements)
    : null;

  onStage("completed");
  const durationMs = Date.now() - startedAt;
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
    selectedFiles: repository.files.map(({ path, size, truncated, selectionReason }) => ({ path, size, truncated, selectionReason })),
    metadata: {
      analysisId,
      analyzedAt: new Date().toISOString(),
      durationMs,
      selectedFileCount: repository.files.length,
      inspectedTreeFileCount: repository.treeFileCount,
      selectedBytes: repository.files.reduce((total, file) => total + file.content.length, 0),
      cacheHit: false,
      cacheStorage: cacheStore?.storage ?? "disabled",
      engineVersion: ANALYSIS_ENGINE_VERSION,
      aiProvider: aiProvider?.name ?? null,
      aiModel: aiProvider?.model ?? null,
      aiStatus,
      aiUnavailableReason,
      warnings,
    },
  };

  if (cacheStore) {
    try {
      await cacheStore.set(cacheKey, ANALYSIS_ENGINE_VERSION, result);
    } catch (error) {
      logger.warn("cache_write_failed", { analysisId, storage: cacheStore.storage, errorType: error instanceof Error ? error.name : "unknown" });
      warnings.push({ code: "CACHE_WRITE_FAILED", message: "Persistent cache storage failed; the completed analysis is still available." });
    }
  }
  logger.info("analysis_completed", { analysisId, durationMs, cacheHit: false, aiStatus });
  return result;
}
