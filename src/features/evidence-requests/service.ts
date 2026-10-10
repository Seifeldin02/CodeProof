import { z } from "zod";
import type { CandidateDetail } from "@/features/candidates/types";
import { extractResumeClaims } from "@/features/resume-matching/claims";
import { discoverCandidateLinks, extractGitHubLinks } from "@/features/resume-matching/discovery";
import type { Locale } from "@/i18n/translations";
import { confirmGitHubAccount, type AccountConfirmationFailure } from "./account-confirmation";
import { getEvidenceRequestStore, type EvidenceRequestPersistence } from "./store";
import { createRequestToken, createVerificationCode, digestRequestToken, isWellFormedRequestToken } from "./token";
import {
  EVIDENCE_REQUEST_LIMITS,
  evidenceRequestStatus,
  type CandidateCvNotes,
  type CandidateEvidenceResponse,
  type EvidenceRequest,
} from "./types";

export async function openEvidenceRequest(
  ownerUserId: string,
  candidateId: string,
  locale: Locale,
  store: EvidenceRequestPersistence = getEvidenceRequestStore(),
  now = Date.now(),
): Promise<{ request: EvidenceRequest; token: string }> {
  const { token, digest } = createRequestToken();
  const request = await store.create(ownerUserId, {
    candidateId,
    locale,
    tokenDigest: digest,
    verificationCode: createVerificationCode(),
    expiresAt: new Date(now + EVIDENCE_REQUEST_LIMITS.validDays * 86_400_000).toISOString(),
  });
  return { request, token };
}

/** The open request behind a link, or null. Every unusable link looks the same from outside. */
export async function findOpenRequest(
  token: string,
  store: EvidenceRequestPersistence = getEvidenceRequestStore(),
  now = Date.now(),
): Promise<{ request: EvidenceRequest & { ownerUserId: string }; status: ReturnType<typeof evidenceRequestStatus> } | null> {
  if (!isWellFormedRequestToken(token)) return null;
  const request = await store.findByTokenDigest(digestRequestToken(token));
  return request ? { request, status: evidenceRequestStatus(request, now) } : null;
}

const answerSchema = z.object({
  consent: z.boolean(),
  repositories: z.array(z.string().trim().max(300)).max(EVIDENCE_REQUEST_LIMITS.repositoriesPerAnswer),
  otherLinks: z.array(z.string().trim().max(300)).max(EVIDENCE_REQUEST_LIMITS.otherLinksPerAnswer),
  confidential: z.boolean(),
  note: z.string().trim().max(EVIDENCE_REQUEST_LIMITS.noteCharacters).optional(),
  gistUrl: z.string().trim().max(200).optional(),
}).strict();

export type EvidenceAnswerFailure =
  | "UNAVAILABLE"
  | "INVALID_INPUT"
  | "CONSENT_REQUIRED"
  | "NOTHING_SHARED"
  | "INVALID_REPOSITORY"
  | "INVALID_LINK"
  | AccountConfirmationFailure;

export type EvidenceAnswerResult = { ok: true } | { ok: false; code: EvidenceAnswerFailure };

/** Accepts the forms people actually paste: with or without a scheme, with a branch path or `.git`. */
function normalizeRepository(value: string): string | null {
  return extractGitHubLinks(value).repositories[0]?.url ?? null;
}

/** A link is only recorded as text for the recruiter. It is never requested by the server. */
function normalizeOtherLink(value: string): string | null {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)) return null;
    return `https://${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

export async function answerEvidenceRequest(
  token: string,
  payload: unknown,
  options: { store?: EvidenceRequestPersistence; fetchImpl?: typeof fetch; now?: number } = {},
): Promise<EvidenceAnswerResult> {
  const store = options.store ?? getEvidenceRequestStore();
  const now = options.now ?? Date.now();
  const found = await findOpenRequest(token, store, now);
  if (!found || found.status !== "pending") return { ok: false, code: "UNAVAILABLE" };

  const parsed = answerSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const answer = parsed.data;
  if (!answer.consent) return { ok: false, code: "CONSENT_REQUIRED" };

  const repositories: string[] = [];
  for (const value of answer.repositories.filter(Boolean)) {
    const repository = normalizeRepository(value);
    if (!repository) return { ok: false, code: "INVALID_REPOSITORY" };
    if (!repositories.includes(repository)) repositories.push(repository);
  }
  const otherLinks: string[] = [];
  for (const value of answer.otherLinks.filter(Boolean)) {
    const link = normalizeOtherLink(value);
    if (!link) return { ok: false, code: "INVALID_LINK" };
    if (!otherLinks.includes(link)) otherLinks.push(link);
  }
  if (repositories.length === 0 && otherLinks.length === 0 && !answer.confidential) return { ok: false, code: "NOTHING_SHARED" };

  const answeredAt = new Date(now).toISOString();
  const confirmedAccounts: CandidateEvidenceResponse["confirmedAccounts"] = [];
  if (answer.gistUrl) {
    const confirmation = await confirmGitHubAccount(answer.gistUrl, found.request.verificationCode, options.fetchImpl);
    if (!confirmation.ok) return { ok: false, code: confirmation.reason };
    confirmedAccounts.push({ login: confirmation.login, confirmedAt: answeredAt });
  }

  const stored = await store.recordResponse(found.request.id, {
    consentAt: answeredAt,
    repositories,
    otherLinks,
    confidential: answer.confidential,
    note: answer.note || null,
    confirmedAccounts,
  }, answeredAt);
  return stored ? { ok: true } : { ok: false, code: "UNAVAILABLE" };
}

/** What to keep from a CV when no repository could be analysed yet. The CV text itself is not stored. */
export function cvNotesFromResume(resumeText: string): CandidateCvNotes {
  return {
    claims: extractResumeClaims(resumeText).map(({ claim, category }) => ({ claim, category })),
    profiles: discoverCandidateLinks(resumeText).profiles.map((profile) => profile.url),
  };
}

/**
 * Rebuilds the claims a candidate made, as text the analysis pipeline can check
 * new code against: from the notes kept at intake, or from earlier analyses.
 */
export function claimsText(notes: CandidateCvNotes | null, candidate: Pick<CandidateDetail, "analyses">): string {
  const claims = notes?.claims.map((item) => item.claim)
    ?? candidate.analyses.flatMap((analysis) => analysis.result.resumeVerification?.claims.map((claim) => claim.claim) ?? []);
  return [...new Set(claims)].join("\n");
}

/** What the review queue needs to know about a candidate's own evidence. */
export interface CandidateEvidenceContext {
  /** When an unanswered, still-open request was sent. */
  requestedAt: string | null;
  /** The candidate stated that their work cannot be shared. */
  confidential: boolean;
  /** GitHub logins the candidate proved they control. */
  confirmedLogins: string[];
  /** Links the candidate sent that CodeProof cannot read. */
  otherLinks: string[];
  /** The claims on the candidate's CV were noted at intake, although no code could be checked against them yet. */
  cvNoted: boolean;
}

export function evidenceContextByCandidate(
  requests: readonly EvidenceRequest[],
  cvNotedCandidateIds: readonly string[] = [],
  now = Date.now(),
): Map<string, CandidateEvidenceContext> {
  const empty = (): CandidateEvidenceContext => ({ requestedAt: null, confidential: false, confirmedLogins: [], otherLinks: [], cvNoted: false });
  const contexts = new Map<string, CandidateEvidenceContext>();
  for (const candidateId of cvNotedCandidateIds) contexts.set(candidateId, { ...empty(), cvNoted: true });
  for (const request of requests) {
    const context = contexts.get(request.candidateId) ?? empty();
    if (evidenceRequestStatus(request, now) === "pending" && (!context.requestedAt || request.createdAt > context.requestedAt)) context.requestedAt = request.createdAt;
    if (request.response?.confidential) context.confidential = true;
    for (const link of request.response?.otherLinks ?? []) if (!context.otherLinks.includes(link)) context.otherLinks.push(link);
    for (const account of request.response?.confirmedAccounts ?? []) {
      if (!context.confirmedLogins.some((login) => login.toLowerCase() === account.login.toLowerCase())) context.confirmedLogins.push(account.login);
    }
    contexts.set(request.candidateId, context);
  }
  return contexts;
}
