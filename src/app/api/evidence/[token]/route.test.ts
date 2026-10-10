import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetEvidenceAnswerAttemptsForTests } from "@/features/evidence-requests/rate-limit";
import type { EvidenceAnswerResult } from "@/features/evidence-requests/service";

const answerEvidenceRequest = vi.fn<(token: string, payload: unknown) => Promise<EvidenceAnswerResult>>();
vi.mock("@/features/evidence-requests/service", () => ({ answerEvidenceRequest: (token: string, payload: unknown) => answerEvidenceRequest(token, payload) }));

const { POST } = await import("./route");

const TOKEN = "t".repeat(43);

function post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new Request(`https://codeproof.example/api/evidence/${TOKEN}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://codeproof.example", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ token: TOKEN }) },
  );
}

describe("POST /api/evidence/[token]", () => {
  beforeEach(() => {
    answerEvidenceRequest.mockReset();
    resetEvidenceAnswerAttemptsForTests();
  });

  it("stores an answer without a session and keeps the address out of caches, indexes and referrers", async () => {
    answerEvidenceRequest.mockResolvedValue({ ok: true });
    const response = await post({ consent: true, repositories: [], otherLinks: [], confidential: true });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ received: true });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(answerEvidenceRequest).toHaveBeenCalledWith(TOKEN, { consent: true, repositories: [], otherLinks: [], confidential: true });
  });

  it("gives every unusable link the same answer", async () => {
    answerEvidenceRequest.mockResolvedValue({ ok: false, code: "UNAVAILABLE" });
    const response = await post({ consent: true, repositories: [], otherLinks: [], confidential: true });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "UNAVAILABLE", message: "This link is no longer available." } });
  });

  it("explains what the candidate can fix", async () => {
    answerEvidenceRequest.mockResolvedValue({ ok: false, code: "CODE_NOT_FOUND" });
    const response = await post({ consent: true, repositories: [], otherLinks: [], confidential: true, gistUrl: "https://gist.github.com/a/0123456789abcdef0123" });
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("CODE_NOT_FOUND");
  });

  it("rejects a request sent from another site and a body that is not JSON", async () => {
    const foreign = await post({ consent: true }, { origin: "https://attacker.example" });
    expect(foreign.status).toBe(403);
    expect(answerEvidenceRequest).not.toHaveBeenCalled();

    const malformed = await post("{not json");
    expect(malformed.status).toBe(400);
    expect(answerEvidenceRequest).not.toHaveBeenCalled();
  });

  it("limits repeated attempts from one address", async () => {
    answerEvidenceRequest.mockResolvedValue({ ok: false, code: "UNAVAILABLE" });
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 22; attempt += 1) {
      statuses.push((await post({ consent: true }, { "x-forwarded-for": "203.0.113.9" })).status);
    }
    expect(statuses.slice(0, 20).every((status) => status === 404)).toBe(true);
    expect(statuses.slice(20)).toEqual([429, 429]);

    // Another address is not affected.
    expect((await post({ consent: true }, { "x-forwarded-for": "203.0.113.10" })).status).toBe(404);
  });
});
