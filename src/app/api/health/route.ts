import { NextResponse } from "next/server";
import { ANALYSIS_ENGINE_VERSION } from "@/features/repository-analysis/version";

export function GET() {
  const postgresConfigured = Boolean(process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim());
  const durablePersistence = postgresConfigured || !process.env.VERCEL;
  const sessionConfigured = Boolean(process.env.CODEPROOF_SESSION_SECRET?.trim()) || process.env.NODE_ENV !== "production";
  const ready = durablePersistence && sessionConfigured;
  return NextResponse.json({
    status: ready ? "ok" : "degraded",
    engineVersion: ANALYSIS_ENGINE_VERSION,
    paidApisRequired: false,
    persistence: postgresConfigured ? "postgres" : "sqlite",
    durablePersistence,
    sessionConfigured,
    timestamp: new Date().toISOString(),
  }, { status: ready ? 200 : 503 });
}
