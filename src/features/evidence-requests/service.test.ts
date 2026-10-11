import { describe, expect, it, vi } from "vitest";
import type { CandidateDetail } from "@/features/candidates/types";
import { translate } from "@/i18n/translations";
import { buildEvidenceRequestMessage, CLAIM_QUESTION_KEY, claimQuestionSkills, EVIDENCE_MESSAGE_KEYS } from "./message";
import { answerEvidenceRequest, claimsText, cvNotesFromResume, evidenceContextByCandidate, findOpenRequest, openEvidenceRequest } from "./service";
import { EvidenceRequestStore } from "./store";
import { createRequestToken, createVerificationCode, digestRequestToken, isWellFormedRequestToken } from "./token";
import { EVIDENCE_REQUEST_LIMITS, type EvidenceRequest } from "./types";

const NOW = Date.parse("2026-10-10T10:00:00.000Z");

async function opened() {
  const store = new EvidenceRequestStore(":memory:");
  const { request, token } = await openEvidenceRequest("owner-a", "candidate-1", "ar", store, NOW);
  return { store, request, token };
}

const base = { consent: true, repositories: [] as string[], otherLinks: [] as string[], confidential: false };

describe("request tokens", () => {
  it("creates an unguessable link token and stores only its digest", async () => {
    const { token, digest } = createRequestToken();
    expect(isWellFormedRequestToken(token)).toBe(true);
    expect(digest).toBe(digestRequestToken(token));
    expect(digest).not.toContain(token);
    expect(new Set(Array.from({ length: 50 }, () => createRequestToken().token)).size).toBe(50);

    const { store, request, token: linkToken } = await opened();
    expect(JSON.stringify(await store.listForOwner("owner-a"))).not.toContain(linkToken);
    expect(Date.parse(request.expiresAt) - NOW).toBe(EVIDENCE_REQUEST_LIMITS.validDays * 86_400_000);
    store.db.close();
  });

  it("creates a verification code that is easy to read and type", () => {
    expect(createVerificationCode()).toMatch(/^codeproof-[abcdefghjkmnpqrstuvwxyz23456789]{12}$/);
  });
});

describe("answering an evidence request", () => {
  it("treats a malformed, unknown, expired or closed link the same way", async () => {
    const { store, request, token } = await opened();
    expect(await findOpenRequest("short", store, NOW)).toBeNull();
    expect(await answerEvidenceRequest("short", base, { store, now: NOW })).toEqual({ ok: false, code: "UNAVAILABLE" });
    expect(await answerEvidenceRequest(createRequestToken().token, { ...base, confidential: true }, { store, now: NOW })).toEqual({ ok: false, code: "UNAVAILABLE" });

    const afterExpiry = NOW + (EVIDENCE_REQUEST_LIMITS.validDays + 1) * 86_400_000;
    expect(await answerEvidenceRequest(token, { ...base, confidential: true }, { store, now: afterExpiry })).toEqual({ ok: false, code: "UNAVAILABLE" });

    await store.revoke("owner-a", request.id);
    expect(await answerEvidenceRequest(token, { ...base, confidential: true }, { store, now: NOW })).toEqual({ ok: false, code: "UNAVAILABLE" });
    store.db.close();
  });

  it("stores nothing without the candidate's agreement or without something to share", async () => {
    const { store, token } = await opened();
    expect(await answerEvidenceRequest(token, { ...base, consent: false, confidential: true }, { store, now: NOW })).toEqual({ ok: false, code: "CONSENT_REQUIRED" });
    expect(await answerEvidenceRequest(token, base, { store, now: NOW })).toEqual({ ok: false, code: "NOTHING_SHARED" });
    expect(await answerEvidenceRequest(token, { ...base, unexpected: true }, { store, now: NOW })).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(await answerEvidenceRequest(token, { ...base, repositories: ["a", "b", "c", "d"] }, { store, now: NOW })).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect((await store.listForOwner("owner-a"))[0].response).toBeNull();
    store.db.close();
  });

  it("normalises the links people paste and rejects ones that are not repositories", async () => {
    const { store, request, token } = await opened();
    expect(await answerEvidenceRequest(token, { ...base, repositories: ["https://github.com/amina-hassan"] }, { store, now: NOW })).toEqual({ ok: false, code: "INVALID_REPOSITORY" });
    expect(await answerEvidenceRequest(token, { ...base, otherLinks: ["javascript:alert(1)"] }, { store, now: NOW })).toEqual({ ok: false, code: "INVALID_LINK" });

    const result = await answerEvidenceRequest(token, {
      ...base,
      repositories: ["github.com/Amina-Hassan/api/tree/main/src", "https://github.com/Amina-Hassan/api.git", "https://github.com/amina-hassan/mobile"],
      otherLinks: ["gitlab.com/amina/private-api/", "https://www.kaggle.com/amina?tab=code"],
      note: "  The API is my final-year project.  ",
    }, { store, now: NOW });
    expect(result).toEqual({ ok: true });

    const stored = await store.get("owner-a", request.id);
    expect(stored?.answeredAt).toBe("2026-10-10T10:00:00.000Z");
    expect(stored?.response).toEqual({
      consentAt: "2026-10-10T10:00:00.000Z",
      repositories: ["https://github.com/Amina-Hassan/api", "https://github.com/amina-hassan/mobile"],
      otherLinks: ["https://gitlab.com/amina/private-api", "https://www.kaggle.com/amina"],
      confidential: false,
      note: "The API is my final-year project.",
      confirmedAccounts: [],
    });
    // The link accepts one answer.
    expect(await answerEvidenceRequest(token, { ...base, confidential: true }, { store, now: NOW })).toEqual({ ok: false, code: "UNAVAILABLE" });
    store.db.close();
  });

  it("treats the same repository in another letter case as one, and accepts an Arabic-script domain", async () => {
    const { store, request, token } = await opened();
    expect(await answerEvidenceRequest(token, {
      ...base,
      repositories: ["https://github.com/Amina-Hassan/API", "github.com/amina-hassan/api"],
      otherLinks: ["https://موقع.السعودية/أعمالي", "http://10.0.0.1/admin"],
    }, { store, now: NOW })).toEqual({ ok: false, code: "INVALID_LINK" });

    expect(await answerEvidenceRequest(token, {
      ...base,
      repositories: ["https://github.com/Amina-Hassan/API", "github.com/amina-hassan/api"],
      otherLinks: ["https://موقع.السعودية/work"],
    }, { store, now: NOW })).toEqual({ ok: true });
    const stored = await store.get("owner-a", request.id);
    expect(stored?.response?.repositories).toEqual(["https://github.com/Amina-Hassan/API"]);
    expect(stored?.response?.otherLinks).toEqual(["https://xn--4gbrim.xn--mgberp4a5d4ar/work"]);
    store.db.close();
  });

  it("records a confirmed account only when the gist really contains this request's code", async () => {
    const { store, request, token } = await opened();
    const gistUrl = "https://gist.github.com/amina-hassan/0123456789abcdef0123456789abcdef";

    const wrongCode = vi.fn(async () => new Response("codeproof-someoneelses"));
    expect(await answerEvidenceRequest(token, { ...base, confidential: true, gistUrl }, { store, now: NOW, fetchImpl: wrongCode })).toEqual({ ok: false, code: "CODE_NOT_FOUND" });
    // A failed confirmation does not use up the link.
    expect((await store.get("owner-a", request.id))?.response).toBeNull();

    const rightCode = vi.fn(async () => new Response(`proof: ${request.verificationCode}`));
    expect(await answerEvidenceRequest(token, { ...base, repositories: ["https://github.com/amina-hassan/api"], gistUrl }, { store, now: NOW, fetchImpl: rightCode })).toEqual({ ok: true });
    expect((await store.get("owner-a", request.id))?.response?.confirmedAccounts).toEqual([{ login: "amina-hassan", confirmedAt: "2026-10-10T10:00:00.000Z" }]);
    store.db.close();
  });
});

describe("what the queue and the pipeline learn from a candidate's own evidence", () => {
  const request = (overrides: Partial<EvidenceRequest>): EvidenceRequest => ({
    id: "r", candidateId: "c1", locale: "en", verificationCode: "codeproof-x", createdAt: "2026-10-09T00:00:00.000Z",
    expiresAt: "2026-10-16T00:00:00.000Z", revokedAt: null, answeredAt: null, response: null, ...overrides,
  });
  const response = { consentAt: "2026-10-09T01:00:00.000Z", repositories: [], otherLinks: [], confidential: false, note: null, confirmedAccounts: [] };

  it("reports a waiting request, a confidentiality statement, confirmed accounts and unread links", () => {
    const contexts = evidenceContextByCandidate([
      request({ id: "r1" }),
      request({ id: "r2", candidateId: "c2", answeredAt: "2026-10-09T01:00:00.000Z", response: { ...response, confidential: true, otherLinks: ["https://gitlab.com/x/y"], confirmedAccounts: [{ login: "Amina", confirmedAt: "2026-10-09T01:00:00.000Z" }] } }),
      request({ id: "r3", candidateId: "c2", answeredAt: "2026-10-09T02:00:00.000Z", response: { ...response, otherLinks: ["https://gitlab.com/x/y"], confirmedAccounts: [{ login: "amina", confirmedAt: "2026-10-09T02:00:00.000Z" }] } }),
      request({ id: "r4", candidateId: "c3", expiresAt: "2026-10-09T12:00:00.000Z" }),
    ], [], NOW);

    expect(contexts.get("c1")).toEqual({ requestedAt: "2026-10-09T00:00:00.000Z", confidential: false, confirmedLogins: [], otherLinks: [], cvNoted: false });
    expect(contexts.get("c2")).toEqual({ requestedAt: null, confidential: true, confirmedLogins: ["Amina"], otherLinks: ["https://gitlab.com/x/y"], cvNoted: false });
    // An expired request is no longer waiting for anything.
    expect(contexts.get("c3")?.requestedAt).toBeNull();
  });

  it("remembers which candidates had their CV claims noted, with or without a request", () => {
    const contexts = evidenceContextByCandidate([request({ id: "r1" })], ["c1", "c9"], NOW);
    expect(contexts.get("c1")).toMatchObject({ cvNoted: true, requestedAt: "2026-10-09T00:00:00.000Z" });
    expect(contexts.get("c9")).toEqual({ requestedAt: null, confidential: false, confirmedLogins: [], otherLinks: [], cvNoted: true });
  });

  it("keeps the claims of a CV, not the CV, so later code can be checked against them", () => {
    const notes = cvNotesFromResume("Amina Hassan\ngithub.com/amina-hassan\nSkills: TypeScript, Docker\n- Built a payments API handling refunds and retries");
    expect(notes.profiles).toEqual(["https://github.com/amina-hassan"]);
    expect(notes.claims.map((item) => item.claim)).toEqual(["TypeScript", "Docker", "Built a payments API handling refunds and retries"]);
    expect(claimQuestionSkills(notes.claims)).toEqual(["TypeScript", "Docker"]);
    expect(claimsText(notes, { analyses: [] })).toBe("TypeScript\nDocker\nBuilt a payments API handling refunds and retries");

    const fromAnalyses = { analyses: [{ result: { resumeVerification: { claims: [{ claim: "Go" }, { claim: "Redis" }] } } }, { result: { resumeVerification: { claims: [{ claim: "Go" }] } } }, { result: { resumeVerification: null } }] } as unknown as Pick<CandidateDetail, "analyses">;
    expect(claimsText(null, fromAnalyses)).toBe("Go\nRedis");
  });
});

describe("the message a recruiter sends", () => {
  it("is written in the candidate's language and carries the link", () => {
    const values = { name: "Amina", link: "https://codeproof.example/evidence/token", days: 7 };
    const english = buildEvidenceRequestMessage("en", values);
    const arabic = buildEvidenceRequestMessage("ar", values);
    expect(english).toContain("Hello Amina,");
    expect(english).toContain(values.link);
    expect(english).toContain("works for 7 days");
    expect(arabic).toContain(values.link);
    expect(arabic).toContain("مرحباً Amina");
    expect(arabic).not.toContain("Sharing is optional");
  });

  it("has Arabic for every sentence, since these keys are looked up dynamically", () => {
    const keys = [...Object.values(EVIDENCE_MESSAGE_KEYS), CLAIM_QUESTION_KEY];
    expect(keys.filter((key) => translate("ar", key) === key)).toEqual([]);
  });
});
