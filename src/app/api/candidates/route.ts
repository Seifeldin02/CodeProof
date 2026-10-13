import { authenticateRequest, denyCrossOrigin } from "@/features/auth/guard";
import { getCandidateStore } from "@/features/candidates/store";
import { SOURCE_CHANNELS } from "@/features/hiring-analytics/types";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const user = await authenticateRequest();
  if (user instanceof Response) return user;
  return Response.json(await getCandidateStore().listCandidates(user.id));
}

/** Alternative intake for candidates whose relevant code is private. No evidence is invented. */
export async function POST(request: Request): Promise<Response> {
  const denied = denyCrossOrigin(request); if (denied) return denied;
  const user = await authenticateRequest(); if (user instanceof Response) return user;
  if (user.lifecycleState !== "active") return Response.json({ error: { code: "ACCOUNT_UNAVAILABLE" } }, { status: 403 });
  const input = z.object({ name: z.string().trim().min(2).max(120), role: z.string().trim().max(120).default(""), source: z.enum(SOURCE_CHANNELS).optional() }).strict().safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: { code: "INVALID_INPUT" } }, { status: 400 });
  return Response.json({ candidate: await getCandidateStore().createCandidate(user.id, { ...input.data, results: [], intakeOnly: true }) }, { status: 201 });
}
