import { describe, expect, it } from "vitest";
import { localizeAnalysisText, translate } from "./translations";

describe("recruiter localization", () => {
  it("translates primary workflow and state labels into Arabic", () => {
    for (const key of ["Dashboard", "Analyze Candidate", "Upload the candidate CV", "Hiring Insights", "Workspace error", "Shareable candidate report"]) {
      expect(translate("ar", key)).not.toBe(key);
    }
  });

  it("keeps exact technical paths while localizing deterministic analysis text", () => {
    const path = "src/app/api/candidates/route.ts";
    const localized = localizeAnalysisText("ar", `Trace one request through ${path}. Where are inputs validated, responses shaped, and failure cases converted into a stable API contract?`);
    expect(localized).toContain(path);
    expect(localized).toContain("تتبّع");
  });

  it("localizes project types and source-selection reasons", () => {
    expect(localizeAnalysisText("ar", "Full-stack application")).toBe("تطبيق متكامل");
    expect(localizeAnalysisText("ar", "Request routing or API boundary")).toBe("توجيه الطلبات أو حدود API");
  });
});
