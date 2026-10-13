import { describe, expect, it, vi } from "vitest";
import { listProfileRepositories, profileOwner, ProfileListingError, projectsOnProfilePage } from "./profile";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const html = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/html" } });
const repo = (name: string, extra: Record<string, unknown> = {}) => ({ name, owner: { login: "Example-Dev" }, fork: false, private: false, size: 120, description: null, language: "TypeScript", pushed_at: "2026-10-01T10:00:00Z", ...extra });
const anchor = (owner: string, name: string) => `<h3><a href="/${owner}/${name}" itemprop="name codeRepository" >\n ${name}</a></h3>`;
/** Answers each request by the host it goes to, and records what was asked. */
function fetcherOf(routes: { api?: () => Response | Promise<Response>; page?: () => Response | Promise<Response> }) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const route = url.startsWith("https://api.github.com/") ? routes.api : routes.page;
    if (!route) throw new Error("network down");
    return route();
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}
const failure = async (work: Promise<unknown>) => work.then(() => null, (error: unknown) => error as ProfileListingError);

describe("GitHub profile links", () => {
  it("reads the account from a profile link, however it was typed", () => {
    expect(profileOwner("https://github.com/Example-Dev")).toBe("Example-Dev");
    expect(profileOwner("github.com/example-dev/")).toBe("example-dev");
    expect(profileOwner(" https://www.github.com/example-dev?tab=repositories ")).toBe("example-dev");
  });

  it("does not mistake other links for a profile", () => {
    for (const value of ["", "example-dev", "https://github.com/example-dev/project", "https://github.com/features", "https://gitlab.com/example-dev",
      "https://github.com/-bad", "https://github.com/bad--name", "https://github.com/under_score", "ftp://github.com/example-dev", "not a link"]) {
      expect(profileOwner(value), value).toBeNull();
    }
  });
});

describe("listing a profile's public projects", () => {
  it("lists the person's own projects, most recently updated first as GitHub returns them", async () => {
    const { fetcher, calls } = fetcherOf({ api: () => json([
      repo("booking-api", { description: " Bookings service ", language: "Python" }),
      repo("copied-library", { fork: true }),
      repo("empty-start", { size: 0 }),
      repo("hidden", { private: true }),
      repo("notes", { language: null, pushed_at: null }),
    ]) });
    const listing = await listProfileRepositories("https://github.com/example-dev", { fetcher });
    expect(listing).toEqual({
      owner: "Example-Dev",
      url: "https://github.com/Example-Dev",
      repositories: [
        { owner: "Example-Dev", repository: "booking-api", url: "https://github.com/Example-Dev/booking-api", description: "Bookings service", language: "Python", pushedAt: "2026-10-01T10:00:00Z" },
        { owner: "Example-Dev", repository: "notes", url: "https://github.com/Example-Dev/notes", description: null, language: null, pushedAt: null },
      ],
      more: false,
      source: "api",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.github.com/users/example-dev/repos?type=owner&sort=pushed&direction=desc&per_page=30");
    expect(calls[0].headers.authorization).toBeUndefined();
  });

  it("offers at most twelve and says when there are more", async () => {
    const { fetcher } = fetcherOf({ api: () => json(Array.from({ length: 20 }, (_item, index) => repo(`project-${index}`))) });
    const listing = await listProfileRepositories("github.com/example-dev", { fetcher });
    expect(listing.repositories).toHaveLength(12);
    expect(listing.repositories[0].repository).toBe("project-0");
    expect(listing.more).toBe(true);
  });

  it("reads the profile page when GitHub's interface refuses the request", async () => {
    const page = `<html>${anchor("Example-Dev", "booking-api")}<a itemprop="name codeRepository" href="/Example-Dev/notes">notes</a>`
      + `${anchor("Someone-Else", "pinned-elsewhere")}<a href="/Example-Dev/not-a-project-link">x</a><a href="/Example-Dev/booking-api" itemprop="name codeRepository">again</a></html>`;
    const { fetcher, calls } = fetcherOf({ api: () => json({ message: "API rate limit exceeded" }, 403), page: () => html(page) });
    const listing = await listProfileRepositories("https://github.com/example-dev", { fetcher, token: "  secret-value  " });
    expect(listing.source).toBe("page");
    expect(listing.owner).toBe("Example-Dev");
    expect(listing.repositories.map((item) => item.url)).toEqual(["https://github.com/Example-Dev/booking-api", "https://github.com/Example-Dev/notes"]);
    expect(calls.map((call) => call.url)).toEqual([
      "https://api.github.com/users/example-dev/repos?type=owner&sort=pushed&direction=desc&per_page=30",
      "https://github.com/example-dev?tab=repositories&type=source",
    ]);
    // The optional token raises the interface's limit and goes nowhere else.
    expect(calls[0].headers.authorization).toBe("Bearer secret-value");
    expect(calls[1].headers.authorization).toBeUndefined();
  });

  it("reads the page when the interface cannot be reached at all", async () => {
    const { fetcher } = fetcherOf({ page: () => html(anchor("example-dev", "site")) });
    expect((await listProfileRepositories("https://github.com/example-dev", { fetcher })).repositories.map((item) => item.repository)).toEqual(["site"]);
  });

  it("reports an account with nothing public as an empty list, not as a failure", async () => {
    const { fetcher } = fetcherOf({ api: () => json(null, 500), page: () => html("<p>example-dev doesn&#39;t have any public repositories yet.</p>") });
    const listing = await listProfileRepositories("https://github.com/example-dev", { fetcher });
    expect(listing.repositories).toEqual([]);
    expect(listing.url).toBe("https://github.com/example-dev");
  });

  it("says a profile does not exist without trying the second source", async () => {
    const { fetcher, calls } = fetcherOf({ api: () => json({ message: "Not Found" }, 404), page: () => html("unused") });
    const error = await failure(listProfileRepositories("https://github.com/example-dev", { fetcher }));
    expect(error).toBeInstanceOf(ProfileListingError);
    expect([error?.code, error?.status]).toEqual(["PROFILE_NOT_FOUND", 404]);
    expect(calls).toHaveLength(1);
  });

  it("asks for pasted links when neither source answers, or the page is one it cannot read", async () => {
    for (const routes of [{}, { api: () => json([], 429), page: () => html("", 503) }, { api: () => json("not a list"), page: () => html("<html><body>A layout with no project links</body></html>") }]) {
      const error = await failure(listProfileRepositories("https://github.com/example-dev", { fetcher: fetcherOf(routes).fetcher }));
      expect([error?.code, error?.status]).toEqual(["LISTING_UNAVAILABLE", 503]);
      expect(error?.message).toContain("Paste the repository links");
    }
  });

  it("refuses anything that is not a profile before asking GitHub", async () => {
    const { fetcher, calls } = fetcherOf({ api: () => json([]) });
    for (const value of ["https://github.com/example-dev/project", "https://example.com/example-dev", "https://github.com/settings", "../users/x"]) {
      const error = await failure(listProfileRepositories(value, { fetcher }));
      expect([error?.code, error?.status], value).toEqual(["INVALID_PROFILE", 400]);
    }
    expect(calls).toHaveLength(0);
  });

  it("keeps only project links that belong to the account, whatever the attribute order", () => {
    const page = `<a class="x" itemprop="name codeRepository" href="/Dev/alpha">alpha</a><a href="/dev/beta?tab=x" itemprop="name codeRepository">b</a>`
      + `<a href="/other/gamma" itemprop="name codeRepository">g</a><a href="/Dev/delta" itemprop="name">d</a><a href="/Dev/bad name" itemprop="name codeRepository">e</a>`;
    expect(projectsOnProfilePage("dev", page).map((item) => `${item.owner}/${item.repository}`)).toEqual(["Dev/alpha"]);
  });
});
