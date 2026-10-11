import { describe, expect, it } from "vitest";
import { createRequestToken } from "@/features/evidence-requests/token";
import { GET } from "./route";

function open(token: string, query: string, cookie?: string) {
  return GET(new Request(`https://codeproof.example/evidence/${token}/open${query}`, { headers: cookie ? { cookie } : {} }), { params: Promise.resolve({ token }) });
}

describe("opening a candidate link in the recruiter's chosen language", () => {
  it("stores the language for a first-time visitor and returns to the candidate page", async () => {
    const { token } = createRequestToken();
    const response = await open(token, "?lang=ar");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`/evidence/${token}?lang=ar&opened=1`);
    expect(response.headers.get("set-cookie")).toBe("codeproof-locale=ar; Path=/; Max-Age=31536000; SameSite=Lax");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("keeps a language the visitor already chose", async () => {
    const { token } = createRequestToken();
    const response = await open(token, "?lang=ar", "other=1; codeproof-locale=en");
    expect(response.headers.get("location")).toBe(`/evidence/${token}?lang=ar&opened=1`);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("falls back to English for a language it does not have", async () => {
    const { token } = createRequestToken();
    const response = await open(token, "?lang=fr%0d%0aSet-Cookie:x=1");
    expect(response.headers.get("location")).toBe(`/evidence/${token}?lang=en&opened=1`);
    expect(response.headers.get("set-cookie")).toBe("codeproof-locale=en; Path=/; Max-Age=31536000; SameSite=Lax");
  });

  it("only ever sends the visitor to this app's own evidence page", async () => {
    for (const token of ["short", "..%2f..%2fadmin", "https:evil.example"]) {
      const response = await open(token, "?lang=ar");
      expect(response.headers.get("location")).toBe("/evidence/unavailable");
    }
  });
});
