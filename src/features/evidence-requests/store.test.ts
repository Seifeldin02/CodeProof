import { describe, expect, it } from "vitest";
import { EvidenceRequestStore } from "./store";
import { evidenceRequestStatus, type CandidateEvidenceResponse } from "./types";

const FUTURE = "2099-01-01T00:00:00.000Z";

const answer: CandidateEvidenceResponse = {
  consentAt: "2026-10-10T10:00:00.000Z",
  repositories: ["https://github.com/amina/api"],
  otherLinks: [],
  confidential: false,
  note: null,
  confirmedAccounts: [],
};

function open(store: EvidenceRequestStore, owner: string, candidateId: string, tokenDigest: string, expiresAt = FUTURE) {
  return store.create(owner, { candidateId, locale: "ar", tokenDigest, verificationCode: "codeproof-abc", expiresAt });
}

describe("evidence request persistence", () => {
  it("keeps requests inside the account that opened them", async () => {
    const store = new EvidenceRequestStore(":memory:");
    const request = await open(store, "owner-a", "candidate-1", "digest-1");

    expect(request).toMatchObject({ candidateId: "candidate-1", locale: "ar", answeredAt: null, revokedAt: null, response: null });
    expect(await store.listForCandidate("owner-a", "candidate-1")).toHaveLength(1);
    expect(await store.listForCandidate("owner-b", "candidate-1")).toEqual([]);
    expect(await store.listForOwner("owner-b")).toEqual([]);
    expect(await store.get("owner-b", request.id)).toBeNull();
    expect(await store.revoke("owner-b", request.id)).toBe(false);
    store.db.close();
  });

  it("finds a request by the digest of its token and never stores the token", async () => {
    const store = new EvidenceRequestStore(":memory:");
    await open(store, "owner-a", "candidate-1", "digest-1");

    expect(await store.findByTokenDigest("digest-1")).toMatchObject({ ownerUserId: "owner-a", candidateId: "candidate-1" });
    expect(await store.findByTokenDigest("unknown")).toBeNull();
    const columns = (store.db.prepare("PRAGMA table_info(evidence_requests)").all() as unknown as Array<{ name: string }>).map((column) => column.name);
    expect(columns).toContain("token_digest");
    expect(columns).not.toContain("token");
    store.db.close();
  });

  it("accepts one answer, and none after the request is closed or expired", async () => {
    const store = new EvidenceRequestStore(":memory:");
    const first = await open(store, "owner-a", "candidate-1", "digest-1");
    expect(await store.recordResponse(first.id, answer, "2026-10-10T10:00:00.000Z")).toBe(true);
    expect(await store.recordResponse(first.id, { ...answer, confidential: true }, "2026-10-10T11:00:00.000Z")).toBe(false);
    expect((await store.get("owner-a", first.id))?.response).toEqual(answer);

    const closed = await open(store, "owner-a", "candidate-2", "digest-2");
    expect(await store.revoke("owner-a", closed.id)).toBe(true);
    expect(await store.recordResponse(closed.id, answer, "2026-10-10T10:00:00.000Z")).toBe(false);

    const expired = await open(store, "owner-a", "candidate-3", "digest-3", "2026-10-01T00:00:00.000Z");
    expect(await store.recordResponse(expired.id, answer, "2026-10-10T10:00:00.000Z")).toBe(false);
    expect(evidenceRequestStatus(expired, Date.parse("2026-10-10T10:00:00.000Z"))).toBe("expired");
    store.db.close();
  });

  it("closes an earlier unanswered request when a new one is opened, and keeps an answered one", async () => {
    const store = new EvidenceRequestStore(":memory:");
    const answered = await open(store, "owner-a", "candidate-1", "digest-1");
    await store.recordResponse(answered.id, answer, "2026-10-10T10:00:00.000Z");
    const waiting = await open(store, "owner-a", "candidate-1", "digest-2");
    const latest = await open(store, "owner-a", "candidate-1", "digest-3");

    const byId = new Map((await store.listForCandidate("owner-a", "candidate-1")).map((request) => [request.id, request]));
    expect(evidenceRequestStatus(byId.get(answered.id)!)).toBe("answered");
    expect(evidenceRequestStatus(byId.get(waiting.id)!)).toBe("revoked");
    expect(evidenceRequestStatus(byId.get(latest.id)!)).toBe("pending");
    store.db.close();
  });

  it("keeps CV notes per candidate and removes everything with the candidate", async () => {
    const store = new EvidenceRequestStore(":memory:");
    await open(store, "owner-a", "candidate-1", "digest-1");
    await store.saveCvNotes("owner-a", "candidate-1", { claims: [{ claim: "TypeScript", category: "technology" }], profiles: ["https://github.com/amina"] });

    expect(await store.getCvNotes("owner-b", "candidate-1")).toBeNull();
    expect(await store.listCvNotedCandidateIds("owner-a")).toEqual(["candidate-1"]);
    expect(await store.listCvNotedCandidateIds("owner-b")).toEqual([]);
    expect(await store.getCvNotes("owner-a", "candidate-1")).toEqual({ claims: [{ claim: "TypeScript", category: "technology" }], profiles: ["https://github.com/amina"] });

    await store.deleteForCandidate("owner-b", "candidate-1");
    expect(await store.listForCandidate("owner-a", "candidate-1")).toHaveLength(1);
    await store.deleteForCandidate("owner-a", "candidate-1");
    expect(await store.listForCandidate("owner-a", "candidate-1")).toEqual([]);
    expect(await store.getCvNotes("owner-a", "candidate-1")).toBeNull();
    expect(await store.findByTokenDigest("digest-1")).toBeNull();
    store.db.close();
  });
});
