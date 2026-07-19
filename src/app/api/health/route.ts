import { NextResponse } from "next/server";
import { ANALYSIS_ENGINE_VERSION } from "@/features/repository-analysis/version";

export function GET() {
  return NextResponse.json({ status: "ok", engineVersion: ANALYSIS_ENGINE_VERSION, paidApisRequired: false, timestamp: new Date().toISOString() });
}
