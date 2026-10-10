/**
 * Lets a candidate prove that a GitHub account is theirs, without a GitHub
 * token, an OAuth app or any paid API.
 *
 * The candidate creates a public gist containing a code shown on their request
 * page and sends the gist link. GitHub serves a gist's raw content only under
 * its owner's login, so finding the code at
 * `gist.githubusercontent.com/<login>/<id>/raw` shows that whoever answered can
 * publish as `<login>`.
 *
 * This confirms control of an account. It does not show who wrote a particular
 * commit, and it is reported in those words.
 */

export const GIST_LIMITS = { timeoutMs: 8_000, maxBytes: 64 * 1024 } as const;

export type AccountConfirmationFailure = "INVALID_GIST_URL" | "GIST_UNAVAILABLE" | "CODE_NOT_FOUND";

export type AccountConfirmation = { ok: true; login: string } | { ok: false; reason: AccountConfirmationFailure };

const GIST_PAGE = /^https:\/\/gist\.github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([a-f0-9]{20,40})\/?$/i;

export function parseGistUrl(input: string): { login: string; gistId: string } | null {
  const match = input.trim().match(GIST_PAGE);
  return match ? { login: match[1], gistId: match[2].toLowerCase() } : null;
}

async function readBounded(response: Response): Promise<string | null> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > GIST_LIMITS.maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), received).toString("utf8");
}

/**
 * The request goes to one fixed host with a path built from validated parts, and
 * redirects are refused, so a candidate cannot point this fetch anywhere else.
 */
export async function confirmGitHubAccount(gistUrl: string, verificationCode: string, fetchImpl: typeof fetch = fetch): Promise<AccountConfirmation> {
  const gist = parseGistUrl(gistUrl);
  if (!gist) return { ok: false, reason: "INVALID_GIST_URL" };

  let response: Response;
  try {
    response = await fetchImpl(`https://gist.githubusercontent.com/${gist.login}/${gist.gistId}/raw`, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(GIST_LIMITS.timeoutMs),
      headers: { accept: "text/plain", "user-agent": "CodeProof-AccountConfirmation" },
    });
  } catch {
    return { ok: false, reason: "GIST_UNAVAILABLE" };
  }
  if (response.status !== 200) return { ok: false, reason: "GIST_UNAVAILABLE" };

  const content = await readBounded(response).catch(() => null);
  if (content === null) return { ok: false, reason: "GIST_UNAVAILABLE" };
  return content.includes(verificationCode) ? { ok: true, login: gist.login } : { ok: false, reason: "CODE_NOT_FOUND" };
}
