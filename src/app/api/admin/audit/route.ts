import { NextResponse } from "next/server";
import { getAdminAuditStore } from "@/features/admin/store";
import { redactAdministrativeValue } from "@/features/admin/audit";
import {
  AdminAccessDenied,
  adminApiDenial,
  requireAdmin,
} from "@/features/auth/admin-guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdmin(request);
  } catch (error) {
    if (error instanceof AdminAccessDenied) return adminApiDenial();
    throw error;
  }
  const entries = await getAdminAuditStore().list();
  return NextResponse.json(
    { entries: redactAdministrativeValue(entries) },
    { headers: { "cache-control": "private, no-store" } },
  );
}
