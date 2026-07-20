import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { denyUnlessSignedIn } from "@/features/auth/guard";
import {
  getRequirementsStore,
  isCategory,
  isImportance,
  type CompanyRequirement,
} from "@/features/requirements/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUIREMENTS = 40;
const MAX_LENGTH = 200;

export async function GET(): Promise<Response> {
  return NextResponse.json({ requirements: getRequirementsStore().list() });
}

export async function PUT(request: Request): Promise<Response> {
  // Requirements define the hiring bar, so changing them needs an account.
  const denied = await denyUnlessSignedIn();
  if (denied) return denied;

  let incoming: unknown;
  try {
    incoming = ((await request.json()) as { requirements?: unknown }).requirements;
  } catch {
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Send a requirements array." } }, { status: 400 });
  }

  if (!Array.isArray(incoming)) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Send a requirements array." } }, { status: 400 });
  }
  if (incoming.length > MAX_REQUIREMENTS) {
    return NextResponse.json(
      { error: { code: "TOO_MANY", message: `Keep the list to ${MAX_REQUIREMENTS} requirements or fewer.` } },
      { status: 400 },
    );
  }

  const cleaned: CompanyRequirement[] = [];
  for (const entry of incoming as Array<Record<string, unknown>>) {
    const requirement = typeof entry?.requirement === "string" ? entry.requirement.trim() : "";
    if (!requirement) continue;
    if (requirement.length > MAX_LENGTH) {
      return NextResponse.json(
        { error: { code: "REQUIREMENT_TOO_LONG", message: `Keep each requirement under ${MAX_LENGTH} characters.` } },
        { status: 400 },
      );
    }
    const importance = typeof entry.importance === "string" && isImportance(entry.importance) ? entry.importance : "required";
    const category = typeof entry.category === "string" && isCategory(entry.category) ? entry.category : "skill";
    cleaned.push({ id: typeof entry.id === "string" && entry.id ? entry.id : randomUUID(), requirement, importance, category });
  }

  return NextResponse.json({ requirements: getRequirementsStore().replaceAll(cleaned) });
}
