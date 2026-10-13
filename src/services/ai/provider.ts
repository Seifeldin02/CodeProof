import type {
  ArchitectureSummary,
  EvidenceGap,
  InterviewQuestion,
  SelectedFile,
  SkillEvidence,
  TechnologySignal,
  ExtractedJobRequirement,
  ExtractedResumeClaim,
} from "@/types/analysis";

export interface AiAnalysisContext {
  repositoryName: string;
  repositoryDescription: string | null;
  projectType: string;
  technologies: TechnologySignal[];
  files: SelectedFile[];
}

export interface AiAnalysisOutput {
  architecture: ArchitectureSummary;
  skills: SkillEvidence[];
  gaps: EvidenceGap[];
  interviewQuestions: InterviewQuestion[];
}

/** Provider-reported tokens for one completed API request; never inferred from prompt length. */
export interface AiTokenUsage {
  operation: "repository" | "resume" | "job";
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
}
export type AiUsageReporter = (usage: AiTokenUsage) => void;

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  analyze(context: AiAnalysisContext, onUsage?: AiUsageReporter): Promise<AiAnalysisOutput>;
  extractResumeClaims?(resumeText: string, onUsage?: AiUsageReporter): Promise<ExtractedResumeClaim[]>;
  extractJobRequirements?(jobDescription: string, onUsage?: AiUsageReporter): Promise<ExtractedJobRequirement[]>;
}
