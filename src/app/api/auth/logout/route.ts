import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/features/auth/session";

export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return response;
}
