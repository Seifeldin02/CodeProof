import { z } from "zod";

export const InterviewRatingSchema = z.enum(["unassessed", "emerging", "meets", "exceeds"]);
export type InterviewRating = z.infer<typeof InterviewRatingSchema>;
export const DecisionSchema = z.enum(["advance", "hold", "decline"]);
export type InterviewDecision = z.infer<typeof DecisionSchema>;

export const CreateInterviewSchema = z.object({
  candidateId: z.string().uuid(),
  roleTitle: z.string().trim().min(3).max(160),
  criterionIds: z.array(z.string().min(1).max(160)).min(1).max(5),
  roleId: z.string().uuid().optional(),
}).strict();

const SourceSchema = z.object({
  citationId: z.string(), filePath: z.string(), sourceLink: z.string().url(),
  attributionStatus: z.enum(["unverified", "candidate_claimed", "verified_owner", "verified_contributor"]),
  discoveryOrigin: z.string(), evidenceLevel: z.string(),
}).strict();

export const InterviewPreparationSchema = z.object({
  version: z.literal("1.0"),
  roleTitle: z.string(),
  candidateName: z.string(),
  candidateRole: z.string(),
  requirementsHash: z.string(),
  analysisVersionIds: z.array(z.string()),
  criteria: z.array(z.object({
    id: z.string(), requirement: z.string(), importance: z.enum(["required", "preferred", "context"]),
    sources: z.array(SourceSchema),
    question: z.object({ en: z.string(), ar: z.string() }).strict(),
  }).strict()).min(1).max(5),
}).strict();
export type InterviewPreparation = z.infer<typeof InterviewPreparationSchema>;

export const InterviewAssessmentSchema = z.object({
  ratings: z.array(z.object({ criterionId: z.string(), rating: InterviewRatingSchema, observation: z.string().trim().max(2000) }).strict()).max(5),
  decision: DecisionSchema.nullable(),
  rationale: z.string().trim().max(3000),
  nextAction: z.string().trim().max(500),
  followUpOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }).nullable(),
  candidateMessage: z.string().trim().max(4000),
}).strict();
export type InterviewAssessment = z.infer<typeof InterviewAssessmentSchema>;

export const UpdateInterviewSchema = z.object({
  revision: z.number().int().positive(),
  action: z.enum(["save", "complete", "mark_communicated"]),
  assessment: InterviewAssessmentSchema.optional(),
}).strict();
export type UpdateInterview = z.infer<typeof UpdateInterviewSchema>;

export interface InterviewSession {
  id: string;
  candidateId: string;
  preparation: InterviewPreparation;
  assessment: InterviewAssessment;
  status: "draft" | "completed";
  revision: number;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  communicatedAt: string | null;
}

export class InterviewConflict extends Error {
  constructor(readonly code: "STALE_REVISION" | "COMPLETED_LOCKED" | "INCOMPLETE_ASSESSMENT" | "INVALID_CRITERIA") {
    super(code);
  }
}

export function applyInterviewUpdate(session: InterviewSession, input: UpdateInterview, now: string): InterviewSession {
  if (input.revision !== session.revision) throw new InterviewConflict("STALE_REVISION");
  if (input.action === "mark_communicated") {
    if (session.status !== "completed" || !session.assessment.candidateMessage.trim()) throw new InterviewConflict("INCOMPLETE_ASSESSMENT");
    return { ...session, revision: session.revision + 1, updatedAt: now, communicatedAt: session.communicatedAt ?? now };
  }
  if (session.status !== "draft") throw new InterviewConflict("COMPLETED_LOCKED");
  const assessment = input.assessment;
  if (!assessment) throw new InterviewConflict("INCOMPLETE_ASSESSMENT");
  const expected = new Set(session.preparation.criteria.map((criterion) => criterion.id));
  if (assessment.ratings.length !== expected.size || new Set(assessment.ratings.map((rating) => rating.criterionId)).size !== expected.size
    || assessment.ratings.some((rating) => !expected.has(rating.criterionId))) throw new InterviewConflict("INVALID_CRITERIA");
  if (input.action === "complete" && (
    !assessment.decision || assessment.rationale.length < 12 || assessment.nextAction.length < 3 || !assessment.followUpOn
    || assessment.candidateMessage.length < 12
    || !assessment.ratings.some((rating) => rating.rating !== "unassessed")
    || assessment.ratings.some((rating) => rating.rating !== "unassessed" && rating.observation.length < 12)
  )) throw new InterviewConflict("INCOMPLETE_ASSESSMENT");
  return {
    ...session, assessment, revision: session.revision + 1, updatedAt: now,
    status: input.action === "complete" ? "completed" : "draft",
    completedAt: input.action === "complete" ? now : null,
  };
}

export function interviewActionState(session: InterviewSession, today: string): "prepare" | "communicate" | "overdue" | "done" {
  if (session.communicatedAt) return "done";
  if (session.assessment.followUpOn && session.assessment.followUpOn < today) return "overdue";
  return session.status === "draft" ? "prepare" : "communicate";
}
