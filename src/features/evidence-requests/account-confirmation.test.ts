import { describe, expect, it, vi } from "vitest";
import { confirmGitHubAccount, GIST_LIMITS, parseGistUrl } from "./account-confirmation";
import { repositoryOwnerConfirmed } from "./types";

const GIST = "https://gist.github.com/amina-hassan/0123456789abcdef0123456789abcdef";
const CODE = "codeproof-abcdefghjkmn";

const respond = (body: string, status = 200) => vi.fn(async () => new Response(body, { status }));

describe("GitHub account confirmation", () => {
  it("accepts only a gist page address under gist.github.com", () => {
    expect(parseGistUrl(GIST)).toEqual({ login: "amina-hassan", gistId: "0123456789abcdef0123456789abcdef" });
    expect(parseGistUrl(`${GIST}/`)).not.toBeNull();
    for (const bad of [
      "http://gist.github.com/amina/0123456789abcdef0123",
      "https://gist.github.com/amina",
      "https://gist.github.com/amina/not-hex",
      "https://gist.github.com.evil.example/amina/0123456789abcdef0123",
      "https://evil.example/gist.github.com/amina/0123456789abcdef0123",
      "https://gist.github.com/amina/0123456789abcdef0123/../../other",
      "https://gist.github.com/-amina/0123456789abcdef0123",
    ]) expect(parseGistUrl(bad)).toBeNull();
  });

  it("confirms the login when the gist under that login contains the code", async () => {
    const fetchImpl = respond(`my proof\n${CODE}\n`);
    expect(await confirmGitHubAccount(GIST, CODE, fetchImpl)).toEqual({ ok: true, login: "amina-hassan" });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://gist.githubusercontent.com/amina-hassan/0123456789abcdef0123456789abcdef/raw");
    // A redirect could carry the request to another host, so it is never followed.
    expect(init.redirect).toBe("manual");
  });

  it("does not confirm when the code is missing, the gist is unavailable, or the address is wrong", async () => {
    expect(await confirmGitHubAccount(GIST, CODE, respond("something else"))).toEqual({ ok: false, reason: "CODE_NOT_FOUND" });
    expect(await confirmGitHubAccount(GIST, CODE, respond("404: Not Found", 404))).toEqual({ ok: false, reason: "GIST_UNAVAILABLE" });
    expect(await confirmGitHubAccount(GIST, CODE, respond("", 302))).toEqual({ ok: false, reason: "GIST_UNAVAILABLE" });
    expect(await confirmGitHubAccount(GIST, CODE, vi.fn(async () => { throw new Error("offline"); }))).toEqual({ ok: false, reason: "GIST_UNAVAILABLE" });

    const neverCalled = respond(CODE);
    expect(await confirmGitHubAccount("https://example.com/amina/0123456789abcdef0123", CODE, neverCalled)).toEqual({ ok: false, reason: "INVALID_GIST_URL" });
    expect(neverCalled).not.toHaveBeenCalled();
  });

  it("stops reading a gist that is larger than the limit", async () => {
    const oversized = `${"x".repeat(GIST_LIMITS.maxBytes + 10)}${CODE}`;
    expect(await confirmGitHubAccount(GIST, CODE, respond(oversized))).toEqual({ ok: false, reason: "GIST_UNAVAILABLE" });
  });

  it("matches a repository to a confirmed account by its owner, whatever the letter case", () => {
    expect(repositoryOwnerConfirmed("https://github.com/Amina-Hassan/api", ["amina-hassan"])).toBe(true);
    expect(repositoryOwnerConfirmed("https://github.com/someone-else/api", ["amina-hassan"])).toBe(false);
    expect(repositoryOwnerConfirmed("https://github.com/amina-hassan-fan/api", ["amina-hassan"])).toBe(false);
    expect(repositoryOwnerConfirmed("not a url", ["amina-hassan"])).toBe(false);
    expect(repositoryOwnerConfirmed("https://github.com/amina-hassan/api", [])).toBe(false);
  });
});
