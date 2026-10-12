import { describe, expect, it, vi } from "vitest";
import { configuredAiProvider } from "./configured";
import { GeminiProvider, geminiJsonSchema } from "./gemini-provider";
import type { AiAnalysisOutput, AiAnalysisContext } from "./provider";

const context: AiAnalysisContext = {
  repositoryName: "example/service",
  repositoryDescription: "A service",
  projectType: "API",
  technologies: [],
  files: [{ path: "src/service.ts", content: "export function serve() { return true; }", size: 40, sha: "a", truncated: false, selectionReason: "Implementation" }],
};

const analysis: AiAnalysisOutput = {
  architecture: {
    purpose: "A service", overview: "One service module", majorModules: ["src/service.ts"],
    boundaries: [], dataFlow: [], engineeringDecisions: [], importantFiles: ["src/service.ts"],
    origin: "ai_interpretation", source: "AI Interpretation",
  },
  skills: [{
    skill: "TypeScript", level: "Partial Evidence", explanation: "A typed implementation file is present.",
    evidence: [{ file: "src/service.ts", summary: "Service implementation", implementationExample: "Exports a serve function", origin: "ai_interpretation", source: "AI Interpretation" }],
    origin: "ai_interpretation", source: "AI Interpretation",
  }],
  gaps: [], interviewQuestions: [],
};

function providerResponse(value: unknown): Response {
  return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(value) }] } }] });
}

describe("Gemini provider", () => {
  it("uses a server-side header, bounded structured output, and untrusted repository data", async () => {
    const fetcher = vi.fn(async () => providerResponse(analysis));
    const provider = new GeminiProvider("test-placeholder-key", "gemini-2.5-flash", fetcher);
    expect(await provider.analyze(context)).toEqual(analysis);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
    expect(options.headers).toMatchObject({ "x-goog-api-key": "test-placeholder-key" });
    expect(url).not.toContain("test-placeholder-key");
    const body = JSON.parse(String(options.body)) as {
      generationConfig: { responseMimeType: string; responseJsonSchema: Record<string, unknown>; thinkingConfig: { thinkingBudget: number } };
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseJsonSchema).toBeUndefined();
    expect(body.generationConfig.thinkingConfig.thinkingBudget).toBe(0);
    expect(body.contents[0].parts[0].text).toContain("UNTRUSTED_REPOSITORY_DATA");
    expect(body.contents[0].parts[0].text).toContain('"architecture"');
  });

  it("extracts validated CV and brief claims with the same provider", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(providerResponse({ claims: [{ claim: "TypeScript", category: "technology", source: "Candidate Claim" }] }))
      .mockResolvedValueOnce(providerResponse({ requirements: [{ requirement: "TypeScript", importance: "required", category: "skill", source: "Job Requirement" }] }));
    const provider = new GeminiProvider("test-placeholder-key", undefined, fetcher);
    expect(await provider.extractResumeClaims("TypeScript")).toMatchObject([{ claim: "TypeScript" }]);
    expect(await provider.extractJobRequirements("TypeScript required")).toMatchObject([{ requirement: "TypeScript" }]);
  });

  it("rejects invalid output and does not echo private provider error bodies", async () => {
    const invalid = new GeminiProvider("test-placeholder-key", undefined, async () => providerResponse({ invented: true }));
    await expect(invalid.analyze(context)).rejects.toThrow();
    const failing = new GeminiProvider("test-placeholder-key", undefined, async () => new Response("PRIVATE_CV_CONTENT", { status: 429 }));
    await expect(failing.analyze(context)).rejects.toThrow("HTTP 429");
    await expect(failing.analyze(context)).rejects.not.toThrow("PRIVATE_CV_CONTENT");
  });

  it("keeps the free fallback and selects Gemini before optional OpenAI", () => {
    expect(configuredAiProvider({})).toBeNull();
    const provider = configuredAiProvider({ GEMINI_API_KEY: "test-placeholder-key", OPENAI_API_KEY: "other-placeholder" });
    expect(provider).toBeInstanceOf(GeminiProvider);
    expect(provider?.model).toBe("gemini-3.1-flash-lite");
  });

  it("preserves property names while projecting the provider's JSON schema subset", () => {
    expect(geminiJsonSchema({ type: "object", properties: { claims: { type: "array", items: { type: "string" } } }, required: ["claims"] }))
      .toEqual({ type: "object", properties: { claims: { type: "array", items: { type: "string" } } }, required: ["claims"] });
  });
});
