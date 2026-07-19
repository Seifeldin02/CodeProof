import { describe, expect, it } from "vitest";
import type { SelectedFile } from "@/types/analysis";
import { maximumEvidenceLevel } from "./evidence-scoring";

function file(path: string, reason: string, content = "implementation ".repeat(30)): SelectedFile {
  return { path, size: content.length, sha: path, content, truncated: false, selectionReason: reason };
}

describe("evidence strength", () => {
  it("keeps dependency and configuration-only signals limited", () => {
    expect(maximumEvidenceLevel([
      file("package.json", "Project manifest", '{"dependencies":{"react":"19"}}'),
      file("vite.config.ts", "Framework or build configuration"),
    ])).toBe("Limited Evidence");
  });

  it("requires meaningful implementation for partial or good evidence", () => {
    expect(maximumEvidenceLevel([file("src/service.ts", "Service or domain logic")])).toBe("Partial Evidence");
    expect(maximumEvidenceLevel([
      file("src/service.ts", "Service or domain logic"),
      file("src/api.ts", "Request routing or API boundary"),
    ])).toBe("Good Evidence");
  });

  it("requires breadth plus tests or architectural ownership for strong evidence", () => {
    expect(maximumEvidenceLevel([
      file("src/domain/service.ts", "Service or domain logic"),
      file("src/api/route.ts", "Request routing or API boundary"),
      file("tests/service.test.ts", "Test implementation"),
    ])).toBe("Strong Evidence");
  });
});
