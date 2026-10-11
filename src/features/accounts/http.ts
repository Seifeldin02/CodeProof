import { NextResponse } from "next/server";
import { authenticateRequest, denyCrossOrigin } from "@/features/auth/guard";
import type { AuthUser } from "@/features/auth/store";
import type { OrganizationFailure } from "@/features/organizations/service";

/** Shared plumbing for the account and organisation routes. */

export const NO_STORE = { "cache-control": "private, no-store" } as const;

export function fail(status: number, code: string, extra: Record<string, unknown> = {}): Response {
  return NextResponse.json({ error: { code, ...extra } }, { status, headers: NO_STORE });
}

export function ok(body: Record<string, unknown> = {}, status = 200): Response {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** A same-site request from a signed-in person, or the response to send back instead. */
export async function signedInRequest(request: Request): Promise<AuthUser | Response> {
  return denyCrossOrigin(request) ?? authenticateRequest();
}

export async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export const text = (value: unknown, max = 500): string => (typeof value === "string" && value.length <= max ? value : "");

const ORGANIZATION_STATUS: Record<OrganizationFailure, number> = {
  INVALID_NAME: 400,
  INVALID_KIND: 400,
  INVALID_EMAIL: 400,
  INVALID_MEMBER_ROLE: 400,
  ALREADY_IN_ORGANIZATION: 409,
  ALREADY_A_MEMBER: 409,
  NOT_A_MEMBER: 403,
  NOT_ORGANIZATION_ADMIN: 403,
  ORGANIZATION_UNAVAILABLE: 403,
  SEAT_LIMIT_REACHED: 409,
  INVITATION_UNAVAILABLE: 404,
  EMAIL_MISMATCH: 403,
  MEMBER_NOT_FOUND: 404,
  LAST_ADMIN: 409,
};

export function organizationFailure(code: OrganizationFailure): Response {
  return fail(ORGANIZATION_STATUS[code], code);
}
