import type {
  ArchitectureSummary,
  EvidenceGap,
  InterviewQuestion,
  SelectedFile,
  SkillEvidence,
  TechnologySignal,
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

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  analyze(context: AiAnalysisContext): Promise<AiAnalysisOutput>;
}
