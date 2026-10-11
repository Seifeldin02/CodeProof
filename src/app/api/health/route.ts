import { NextResponse } from "next/server";
import { signInOptions } from "@/features/auth/options";
import { sessionSecretConfigured } from "@/features/auth/session";
import { ANALYSIS_ENGINE_VERSION } from "@/features/repository-analysis/version";

export function GET() {
  const postgresConfigured = Boolean(process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim());
  const durablePersistence = postgresConfigured || !process.env.VERCEL;
  const sessionConfigured = sessionSecretConfigured();
  const ready = durablePersistence && sessionConfigured;
  const signIn = signInOptions();
  return NextResponse.json({
    status: ready ? "ok" : "degraded",
    engineVersion: ANALYSIS_ENGINE_VERSION,
    buildCommit: process.env.CODEPROOF_BUILD_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || null,
    paidApisRequired: false,
    persistence: postgresConfigured ? "postgres" : "sqlite",
    durablePersistence,
    sessionConfigured,
    // Which ways of signing in this deployment has switched on. None of them is required.
    signIn: { emailCode: signIn.emailCode, google: signIn.google, textMessage: signIn.sms, password: signIn.password },
    timestamp: new Date().toISOString(),
  }, { status: ready ? 200 : 503 });
}
