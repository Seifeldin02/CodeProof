import { describe, expect, it } from "vitest";
import { fetchPortfolioPage, isBlockedAddress, PortfolioFetchError } from "./fetch";
import { htmlToText, readPortfolio } from "./extract";

describe("SSRF address guard", () => {
  it("blocks loopback, private, link-local and reserved ranges", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fc00::1", "fd12::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it("allows ordinary public addresses", () => {
    for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:2800:220:1:248:1893:25c8:1946"]) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });

  it("treats anything that is not an IP as blocked", () => {
    expect(isBlockedAddress("not-an-ip")).toBe(true);
  });
});

describe("portfolio fetching", () => {
  it("refuses a non-web scheme before any request is made", async () => {
    let called = false;
    const spy = (() => { called = true; throw new Error("should not run"); }) as unknown as typeof fetch;
    await expect(fetchPortfolioPage("file:///etc/passwd", spy)).rejects.toBeInstanceOf(PortfolioFetchError);
    expect(called).toBe(false);
  });

  it("refuses a non-standard port", async () => {
    await expect(fetchPortfolioPage("https://example.com:2375/", (() => { throw new Error("no"); }) as unknown as typeof fetch))
      .rejects.toMatchObject({ code: "UNSUPPORTED_PORT" });
  });

  it("re-checks the host on every redirect hop", async () => {
    const requested: string[] = [];
    const impl = (async (url: string) => {
      requested.push(url);
      // A public host bouncing us at cloud metadata: the next hop must be
      // re-resolved and rejected rather than followed.
      return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } });
    }) as unknown as typeof fetch;
    await expect(fetchPortfolioPage("https://example.com", impl)).rejects.toMatchObject({ code: "BLOCKED_ADDRESS" });
    expect(requested).toHaveLength(1);
  });
});

describe("portfolio reading", () => {
  it("strips scripts and markup without executing them", () => {
    const text = htmlToText("<p>Hello</p><script>alert('x')</script><style>p{color:red}</style><p>World</p>");
    expect(text).toBe("Hello World");
  });

  it("finds repositories linked from anchors as well as visible text", () => {
    const scan = readPortfolio("https://amina.dev", `
      <title>Amina — Projects</title>
      <a href="https://github.com/amina/checkout-service">Checkout service</a>
      <p>Also see https://github.com/amina/design-system built with TypeScript and React.</p>
      <a href="https://www.linkedin.com/in/amina">LinkedIn</a>
    `);
    expect(scan.repositories.map((repository) => repository.url)).toEqual([
      "https://github.com/amina/checkout-service",
      "https://github.com/amina/design-system",
    ]);
    expect(scan.title).toBe("Amina — Projects");
  });

  it("returns page technologies as candidate claims, not evidence", () => {
    const scan = readPortfolio("https://amina.dev", "<p>I build with TypeScript, React and PostgreSQL.</p>");
    expect(scan.claims.map((claim) => claim.claim)).toEqual(expect.arrayContaining(["TypeScript", "React", "PostgreSQL"]));
    expect(scan.claims.every((claim) => claim.source === "Candidate Claim")).toBe(true);
  });
});
