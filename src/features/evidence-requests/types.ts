import type { Locale } from "@/i18n/translations";

/**
 * A recruiter can ask a candidate for their own evidence. The candidate opens a
 * private link, reads what will happen to what they share, and answers once.
 *
 * This exists because public code alone misses most people: work is often
 * private, sits on another host, or was never linked on the CV. Asking is also
 * the only way to tell the candidate what is being read and to get their
 * consent, and the only way to learn whether a GitHub account is really theirs.
 */

export const EVIDENCE_REQUEST_LIMITS = {
  /** How long a link stays open. */
  validDays: 7,
  /** Public repositories a candidate may list in one answer. */
  repositoriesPerAnswer: 3,
  /** Other links (another host, a store page, a package) recorded in one answer. */
  otherLinksPerAnswer: 3,
  noteCharacters: 500,
  /** Analysed repositories one candidate may hold in total, to bound analysis cost. */
  repositoriesPerCandidate: 6,
} as const;

export type EvidenceRequestStatus = "pending" | "answered" | "expired" | "revoked";

export interface ConfirmedAccount {
  /** GitHub login whose control the candidate proved. */
  login: string;
  confirmedAt: string;
}

export interface CandidateEvidenceResponse {
  /** When the candidate agreed to the notice. An answer cannot be stored without it. */
  consentAt: string;
  /** Canonical `https://github.com/owner/repository` URLs. Analysed only when the recruiter asks. */
  repositories: string[];
  /** Links CodeProof cannot read. Recorded for the recruiter, never fetched. */
  otherLinks: string[];
  /** The candidate states that their work cannot be shared. Reported as unknown, never as negative. */
  confidential: boolean;
  note: string | null;
  confirmedAccounts: ConfirmedAccount[];
}

export interface EvidenceRequest {
  id: string;
  candidateId: string;
  /** Language the recruiter chose for the candidate's page and message. */
  locale: Locale;
  /**
   * Code the candidate can publish in a public gist to prove a GitHub account
   * is theirs. It is shown on their page and is not a secret.
   */
  verificationCode: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  answeredAt: string | null;
  response: CandidateEvidenceResponse | null;
}

export function evidenceRequestStatus(request: Pick<EvidenceRequest, "answeredAt" | "revokedAt" | "expiresAt">, now = Date.now()): EvidenceRequestStatus {
  if (request.answeredAt) return "answered";
  if (request.revokedAt) return "revoked";
  return Date.parse(request.expiresAt) <= now ? "expired" : "pending";
}

/** What a candidate stated on their CV, kept so later code can be checked against it. */
export interface CvClaimNote {
  claim: string;
  category: string;
}

export interface CandidateCvNotes {
  claims: CvClaimNote[];
  /** GitHub profile links on the CV. A profile cannot be listed without the candidate's help. */
  profiles: string[];
}

/** True when the repository sits under a GitHub account the candidate proved is theirs. */
export function repositoryOwnerConfirmed(repositoryUrl: string, confirmedLogins: readonly string[]): boolean {
  try {
    const owner = new URL(repositoryUrl).pathname.split("/").filter(Boolean)[0]?.toLowerCase();
    return Boolean(owner) && confirmedLogins.some((login) => login.toLowerCase() === owner);
  } catch {
    return false;
  }
}
