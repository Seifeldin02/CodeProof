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

  it("localizes engine sentences that embed a selection reason, count, or trailing full stop", () => {
    expect(localizeAnalysisText("ar", "Test implementation; meaningful usage is evaluated by file role and content depth."))
      .toBe("تنفيذ الاختبارات؛ يُقيَّم الاستخدام الفعلي حسب دور الملف وعمق محتواه.");
    expect(localizeAnalysisText("ar", "Library or package with 2 grounded skill signals.")).toContain("مكتبة أو حزمة");
    expect(localizeAnalysisText("ar", "Library or package.")).toBe("مكتبة أو حزمة.");
    expect(localizeAnalysisText("ar", "Executable test specifications cover application behavior. The cited files are the repository evidence for this prompt."))
      .toBe("تغطي مواصفات اختبار قابلة للتنفيذ سلوك التطبيق. الملفات المذكورة هي دليل المستودع لهذا السؤال.");
    // A sentence with no pattern still falls back to the plain dictionary lookup.
    expect(localizeAnalysisText("ar", "Executable test specifications cover application behavior.")).toBe("تغطي مواصفات اختبار قابلة للتنفيذ سلوك التطبيق.");
  });
});
