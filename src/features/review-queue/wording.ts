import type { TranslationValues } from "@/i18n/translations";
import type { NextStep, ReviewQueueEntry, ReviewTier, UnknownSignal } from "./queue";

/**
 * Recruiter-facing wording for the review queue, kept in one place so the
 * screen and the export say the same thing. Every string is a translation key.
 *
 * The drafted next step is a suggestion about where a test or an engineer's
 * hour is best spent. CodeProof never sends a test, moves a stage or rejects
 * anyone.
 */

export const TIER_LABEL: Record<ReviewTier, string> = {
  review_first: "Review first",
  review: "Review",
  verify_in_interview: "Verify in interview",
  evidence_incomplete: "Evidence incomplete",
};

export const UNKNOWN_LABEL: Record<UnknownSignal, string> = {
  no_repositories: "No repository analyzed yet",
  failed_repositories: "{count} selected repositories could not be analyzed",
  no_cv: "No CV text provided, so claim verification is unknown",
  no_requirements: "No company requirements saved, so role fit is unknown",
  sources_not_analyzed: "{count} portfolio or non-GitHub source(s) the candidate named cannot be read yet",
  evidence_requested: "You asked the candidate for evidence on {date}. No answer yet",
  work_confidential: "The candidate says their work is confidential, so code evidence is unknown",
};

/** The placeholder values each unknown label needs. */
export function unknownValues(
  entry: Pick<ReviewQueueEntry, "unanalyzedSources" | "repositories" | "evidenceRequestedAt">,
  signal: UnknownSignal,
  formatDate: (iso: string) => string,
): TranslationValues {
  if (signal === "sources_not_analyzed") return { count: entry.unanalyzedSources.length };
  if (signal === "failed_repositories") return { count: entry.repositories.failed };
  if (signal === "evidence_requested") return { date: entry.evidenceRequestedAt ? formatDate(entry.evidenceRequestedAt) : "" };
  return {};
}

export const NEXT_STEP_ORDER: NextStep[] = ["interview_on_evidence", "review_then_decide", "test_or_verify", "ask_for_evidence"];

export const NEXT_STEP_LABEL: Record<NextStep, string> = {
  interview_on_evidence: "Interview on the evidence",
  review_then_decide: "Review, then decide",
  test_or_verify: "Test or verify",
  ask_for_evidence: "Ask for evidence",
};

/** One sentence on what each step means, for the summary above the queue. */
export const NEXT_STEP_MEANING: Record<NextStep, string> = {
  interview_on_evidence: "The code covers every required requirement. The test can be skipped.",
  review_then_decide: "Some evidence. Open the dossier, then choose an interview or a test.",
  test_or_verify: "The code does not cover what the role requires, or the work is confidential.",
  ask_for_evidence: "No code has been read yet.",
};

const REVIEW_WITHOUT_REQUIREMENTS = "Role fit is unknown because no company requirements are saved. Open the dossier, then choose an interview or a test.";
const WAITING_FOR_ANSWER = "You asked the candidate for their own evidence. Their answer has not arrived yet.";
const CONFIDENTIAL_WORK = "The candidate says their work is confidential. A test or an interview is the way to learn more.";

const NEXT_STEP_REASON: Record<NextStep, string> = {
  interview_on_evidence: "Every required requirement has repository evidence. The test can be skipped; use the drafted questions in the interview.",
  review_then_decide: "The code supports part of the role. Open the dossier, then choose an interview or a test.",
  test_or_verify: "Code was read, but none of it covers the required requirements. A test or an interview question will show more.",
  ask_for_evidence: "No code has been read. Ask the candidate for their own evidence, or send your test.",
};

export function nextStepReason(entry: Pick<ReviewQueueEntry, "nextStep" | "requirements" | "tier" | "evidenceRequestedAt">): string {
  if (entry.nextStep === "review_then_decide" && !entry.requirements) return REVIEW_WITHOUT_REQUIREMENTS;
  if (entry.nextStep === "ask_for_evidence" && entry.evidenceRequestedAt) return WAITING_FOR_ANSWER;
  if (entry.nextStep === "test_or_verify" && entry.tier === "evidence_incomplete") return CONFIDENTIAL_WORK;
  return NEXT_STEP_REASON[entry.nextStep];
}

/** Every key above, for the translation coverage check. */
export const REVIEW_QUEUE_WORDING: string[] = [
  ...Object.values(TIER_LABEL),
  ...Object.values(UNKNOWN_LABEL),
  ...Object.values(NEXT_STEP_LABEL),
  ...Object.values(NEXT_STEP_MEANING),
  ...Object.values(NEXT_STEP_REASON),
  REVIEW_WITHOUT_REQUIREMENTS,
  WAITING_FOR_ANSWER,
  CONFIDENTIAL_WORK,
];
