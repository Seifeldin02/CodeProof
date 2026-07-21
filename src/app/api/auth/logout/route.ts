import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/features/auth/session";
import { denyCrossOrigin } from "@/features/auth/guard";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const crossOrigin = denyCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return response;
}
