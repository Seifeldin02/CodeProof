import { loadEnvConfig } from "@next/env";
import { expect, it } from "vitest";
import { GeminiProvider } from "@/services/ai/gemini-provider";

// Opt in explicitly: ordinary CI must never spend quota or send candidate data externally.
loadEnvConfig(process.cwd(), true);
const enabled = process.env.CODEPROOF_LIVE_AI_TEST === "1" && Boolean(process.env.GEMINI_API_KEY?.trim());

it.skipIf(!enabled)("accepts real Gemini structured CV, role and repository responses", async () => {
  const provider = new GeminiProvider(process.env.GEMINI_API_KEY!);
  const requirements = await provider.extractJobRequirements("Required: TypeScript. Nice to have: Python.");
  expect(requirements.some((item) => item.requirement.toLowerCase().includes("typescript") && item.importance === "required")).toBe(true);

  const claims = await provider.extractResumeClaims("I built TypeScript services for two years. No public portfolio.");
  expect(claims.some((claim) => claim.claim.toLowerCase().includes("typescript"))).toBe(true);

  const analysis = await provider.analyze({
    repositoryName: "synthetic/service",
    repositoryDescription: "A tiny synthetic test service",
    projectType: "API",
    technologies: [{ name: "TypeScript", category: "language", evidence: ["src/service.ts"], source: "Deterministic Fact" }],
    files: [{ path: "src/service.ts", content: "export function greet(name: string): string { return `Hello, ${name}`; }", size: 75, sha: "synthetic", truncated: false, selectionReason: "Implementation" }],
  });
  expect(analysis.architecture.purpose.length).toBeGreaterThan(0);
  expect(analysis.skills.every((skill) => skill.evidence.every((item) => item.file === "src/service.ts"))).toBe(true);


}, 180_000);
