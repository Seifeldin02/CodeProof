import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional access gate.
 *
 * Uploading a CV is the expensive, data-creating action: it accepts a file,
 * triggers outbound archive downloads, and writes a candidate dossier. Reading
 * the workspace is cheap and is what a public demo needs to stay open.
 *
 * So when `CODEPROOF_ACCESS_CODE` is set, the gate protects the upload path —
 * the `/analyze` page plus every mutating request — and leaves browsing open.
 * Gating the page as well as the API matters: the browser then prompts once on
 * navigation and reuses the credentials for the uploads the page fires, instead
 * of the form failing with an opaque error.
 *
 * `CODEPROOF_PROTECT_ALL=true` additionally closes read access, for deployments
 * holding real candidate data rather than demo records.
 *
 * When no access code is set the gate is a no-op, so the documented
 * zero-configuration local and demo flow is unchanged.
 *
 * Note: Basic credentials are base64, not encrypted. Only enable behind HTTPS
 * (Replit deployments terminate TLS, so that holds there).
 */
const REALM = 'Basic realm="CodeProof", charset="UTF-8"';
const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Constant-time compare so the code cannot be recovered by timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

function isAuthorized(request: NextRequest, accessCode: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  try {
    const decoded = atob(header.slice(6));
    return safeEqual(decoded.slice(decoded.indexOf(":") + 1), accessCode);
  } catch {
    return false;
  }
}

/** Which requests require the access code. */
export function requiresAuth(pathname: string, method: string, protectAll: boolean): boolean {
  // Deployment monitoring must always be reachable.
  if (pathname === "/api/health") return false;
  if (protectAll) return true;
  // Anything that creates or changes data, i.e. the upload/analysis path.
  if (!READ_ONLY_METHODS.has(method.toUpperCase())) return true;
  // The upload page itself, so credentials are in place before it posts.
  return pathname === "/analyze" || pathname.startsWith("/analyze/");
}

export function proxy(request: NextRequest): NextResponse {
  const accessCode = process.env.CODEPROOF_ACCESS_CODE?.trim();
  if (!accessCode) return NextResponse.next();

  const protectAll = process.env.CODEPROOF_PROTECT_ALL?.trim().toLowerCase() === "true";
  if (!requiresAuth(request.nextUrl.pathname, request.method, protectAll)) return NextResponse.next();
  if (isAuthorized(request, accessCode)) return NextResponse.next();

  return new NextResponse("Authentication required to upload or analyze.", {
    status: 401,
    headers: { "WWW-Authenticate": REALM, "Cache-Control": "no-store" },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
