import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional access gate for public deployments.
 *
 * CodeProof stores candidate dossiers derived from real CVs. On a public URL
 * those records must not be world-readable, so setting `CODEPROOF_ACCESS_CODE`
 * puts the whole workspace (pages and API) behind HTTP Basic auth.
 *
 * When the variable is unset the gate is a no-op, so the documented
 * zero-configuration local and demo flow is unchanged.
 *
 * Note: Basic credentials are base64, not encrypted. Only enable this behind
 * HTTPS (Replit deployments terminate TLS, so that holds there).
 */
const REALM = 'Basic realm="CodeProof", charset="UTF-8"';

/** Constant-time compare so the code cannot be recovered by timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

export function middleware(request: NextRequest): NextResponse {
  const accessCode = process.env.CODEPROOF_ACCESS_CODE?.trim();
  if (!accessCode) return NextResponse.next();

  // The deployment health check must stay reachable for Replit monitoring.
  if (request.nextUrl.pathname === "/api/health") return NextResponse.next();

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const supplied = decoded.slice(decoded.indexOf(":") + 1);
      if (safeEqual(supplied, accessCode)) return NextResponse.next();
    } catch {
      // Malformed credentials fall through to the challenge below.
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": REALM, "Cache-Control": "no-store" },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
