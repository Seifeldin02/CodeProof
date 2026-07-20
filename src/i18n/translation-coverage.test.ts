import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { translate } from "./translations";

/**
 * `translate()` falls back to the English key when an Arabic entry is missing,
 * so a forgotten translation is invisible at runtime and silently leaks English
 * into the Arabic RTL UI. This walks every literal `t("...")` call site and
 * fails if any of them lack an Arabic entry.
 */

const SRC_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Keys whose Arabic form is intentionally identical to the English source. */
const IDENTICAL_BY_DESIGN = new Set(["English"]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) return sourceFiles(fullPath);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [fullPath] : [];
  });
}

function literalTranslationKeys(): string[] {
  const keys = new Set<string>();
  const callSite = /\bt\(\s*"((?:[^"\\]|\\.)*)"/g;
  for (const file of sourceFiles(SRC_ROOT)) {
    for (const match of readFileSync(file, "utf8").matchAll(callSite)) {
      const key = match[1].replace(/\\"/g, '"').replace(/\\n/g, "\n");
      if (key.trim()) keys.add(key);
    }
  }
  return [...keys];
}

describe("Arabic translation coverage", () => {
  it("discovers translation call sites to verify", () => {
    expect(literalTranslationKeys().length).toBeGreaterThan(50);
  });

  it('has an Arabic entry for every literal t("...") key', () => {
    const untranslated = literalTranslationKeys()
      .filter((key) => !IDENTICAL_BY_DESIGN.has(key))
      .filter((key) => translate("ar", key) === key)
      .sort();

    expect(untranslated).toEqual([]);
  });
});
