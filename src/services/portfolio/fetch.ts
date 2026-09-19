import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Fetches a candidate's portfolio page as bounded, untrusted text.
 *
 * The URL comes from a candidate CV, so it is attacker-influenced input and
 * this request is made by our server: without a guard it is a server-side
 * request forgery primitive against the deployment's own network. Every hop is
 * therefore resolved and checked against private address space before it is
 * requested, redirects are followed manually so a public host cannot bounce us
 * onto an internal one, and the response is read under a hard byte cap.
 *
 * The page is never executed or rendered — only read as text.
 */

export const PORTFOLIO_LIMITS = {
  timeoutMs: 8_000,
  maxBytes: 2 * 1024 * 1024,
  maxRedirects: 3,
} as const;

export class PortfolioFetchError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
    this.name = "PortfolioFetchError";
  }
}

/** Blocks loopback, private, link-local (cloud metadata), CGNAT and reserved ranges. */
export function isBlockedAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("::ffff:")) {
      const mapped = lower.slice(7);
      return isIP(mapped) === 4 ? isBlockedAddress(mapped) : true;
    }
    // Unique-local (fc00::/7) and link-local (fe80::/10).
    if (/^f[cd]/.test(lower) || lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true;
    return false;
  }
  return true;
}

async function assertPublicHost(url: URL): Promise<void> {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new PortfolioFetchError("UNSUPPORTED_SCHEME", "Only http and https portfolio links can be scanned.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new PortfolioFetchError("UNSUPPORTED_PORT", "Only standard web ports can be scanned.");
  }
  let address: string;
  try {
    ({ address } = await lookup(url.hostname));
  } catch {
    throw new PortfolioFetchError("DNS_FAILED", "The portfolio address could not be resolved.", 502);
  }
  if (isBlockedAddress(address)) {
    throw new PortfolioFetchError("BLOCKED_ADDRESS", "That address is not publicly routable and was not requested.", 403);
  }
}

async function readBounded(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > PORTFOLIO_LIMITS.maxBytes) {
    throw new PortfolioFetchError("PAGE_TOO_LARGE", "The portfolio page exceeds the 2 MB scan limit.", 413);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > PORTFOLIO_LIMITS.maxBytes) {
        await reader.cancel();
        throw new PortfolioFetchError("PAGE_TOO_LARGE", "The portfolio page exceeds the 2 MB scan limit.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), received).toString("utf8");
}

export interface FetchedPortfolio {
  finalUrl: string;
  html: string;
}

export async function fetchPortfolioPage(rawUrl: string, fetchImpl: typeof fetch = fetch): Promise<FetchedPortfolio> {
  let current: URL;
  try {
    current = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch {
    throw new PortfolioFetchError("INVALID_URL", "Enter a valid portfolio URL.");
  }

  for (let hop = 0; hop <= PORTFOLIO_LIMITS.maxRedirects; hop += 1) {
    await assertPublicHost(current);
    let response: Response;
    try {
      response = await fetchImpl(current.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(PORTFOLIO_LIMITS.timeoutMs),
        headers: { accept: "text/html,application/xhtml+xml", "user-agent": "CodeProof-PortfolioScan" },
        // The framework patches global fetch with a data cache. A recruiter
        // scanning a portfolio must see the page as it is now, not a cached copy.
        cache: "no-store",
      });
    } catch {
      throw new PortfolioFetchError("FETCH_FAILED", "The portfolio page could not be reached.", 502);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new PortfolioFetchError("FETCH_FAILED", "The portfolio page redirected without a target.", 502);
      // Re-checked on the next loop, so a public host cannot redirect inward.
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) {
      throw new PortfolioFetchError("PAGE_UNAVAILABLE", `The portfolio page returned ${response.status}.`, 502);
    }
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType && !/text\/html|application\/xhtml|text\/plain/.test(contentType)) {
      throw new PortfolioFetchError("UNSUPPORTED_CONTENT", "That link is not a readable web page.");
    }
    return { finalUrl: current.toString(), html: await readBounded(response) };
  }
  throw new PortfolioFetchError("TOO_MANY_REDIRECTS", "The portfolio page redirected too many times.", 502);
}
