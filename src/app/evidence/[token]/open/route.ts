import { isWellFormedRequestToken } from "@/features/evidence-requests/token";
import { isLocale } from "@/i18n/translations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOCALE_COOKIE = "codeproof-locale";

function hasStoredLocale(request: Request): boolean {
  return (request.headers.get("cookie") ?? "").split(";").some((part) => {
    const [name, value] = part.trim().split("=");
    return name === LOCALE_COOKIE && isLocale(value);
  });
}

/**
 * The address a recruiter sends. It stores the language the recruiter chose
 * for the candidate, then shows the candidate's page. A page cannot set a
 * cookie while it renders, so starting here is what lets the page arrive in
 * the candidate's language instead of switching after it loads.
 *
 * Nothing is looked up, so this reveals nothing about whether a token exists.
 * A language the visitor already chose is never replaced.
 */
export async function GET(request: Request, context: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await context.params;
  const requested = new URL(request.url).searchParams.get("lang");
  const locale = isLocale(requested) ? requested : "en";
  // The destination is always this app's own evidence page, never a caller-supplied address.
  const destination = isWellFormedRequestToken(token) ? `/evidence/${token}?lang=${locale}&opened=1` : "/evidence/unavailable";
  const headers = new Headers({
    Location: destination,
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  });
  if (!hasStoredLocale(request)) headers.append("Set-Cookie", `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`);
  return new Response(null, { status: 307, headers });
}
