import { describe, expect, it } from "vitest";
import type { SelectedFile, TechnologySignal } from "@/types/analysis";
import { collectTechnologyEvidenceFiles, maximumEvidenceLevel } from "./evidence-scoring";

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

describe("which files count as using a technology", () => {
  const signal = (name: string, evidence: string[]): TechnologySignal => ({ name, category: "library", evidence, source: "Deterministic Fact" });
  const manifest = file("package.json", "Project manifest", '{"dependencies":{}}');
  const paths = (name: string, files: SelectedFile[], evidence = ["package.json: dependency"]) => collectTechnologyEvidenceFiles(signal(name, evidence), files).map((item) => item.path);

  // Ordinary code that a loose pattern would mistake for a state library, a test runner or a browser tool.
  const helpers = file("src/lib/helpers.ts", "Representative source file", [
    "export function latest(values: number[]) { return values[values.length - 1]; }",
    "export const index = Object.create(null);",
    "export const title = (policy: { allow: boolean }, page: { title: string }) => (policy.allow ? page.title : '');",
    "export const navi = { route: '/' }; export const commit = (value: string) => value;",
  ].join("\n").repeat(4));

  it("does not count ordinary code for a dependency the project never uses", () => {
    for (const technology of ["Zustand", "Jest", "Vitest", "Playwright", "Cypress"]) {
      expect(paths(technology, [manifest, helpers])).toEqual(["package.json"]);
      expect(maximumEvidenceLevel(collectTechnologyEvidenceFiles(signal(technology, ["package.json: dependency"]), [manifest, helpers]))).toBe("Limited Evidence");
    }
  });

  it("still counts files that really use the tool", () => {
    const store = file("src/stores/cart.ts", "State management or application hook", "import { create } from \"zustand\";\nexport const useCart = create(() => ({ items: [] }));\n".repeat(6));
    const unit = file("tests/cart.test.ts", "Test implementation", "describe('cart', () => { it('adds', () => { expect(1).toBe(1); }); });\n".repeat(6));
    const mocked = file("tests/api.test.ts", "Test implementation", "import { vi } from 'vitest';\nconst send = vi.fn();\n".repeat(8));
    const browser = file("e2e/checkout.spec.ts", "Test implementation", "import { test } from '@playwright/test';\ntest('pays', async ({ page }) => { await page.goto('/checkout'); });\n".repeat(5));
    const journey = file("cypress/e2e/login.cy.ts", "Test implementation", "it('logs in', () => { cy.visit('/login'); cy.get('button').click(); });\n".repeat(6));

    expect(paths("Zustand", [manifest, helpers, store])).toEqual(["package.json", "src/stores/cart.ts"]);
    expect(paths("Jest", [manifest, helpers, unit])).toEqual(["package.json", "tests/cart.test.ts"]);
    expect(paths("Vitest", [manifest, helpers, mocked])).toEqual(["package.json", "tests/api.test.ts"]);
    expect(paths("Playwright", [manifest, helpers, browser])).toEqual(["package.json", "e2e/checkout.spec.ts"]);
    expect(paths("Cypress", [manifest, helpers, journey])).toEqual(["package.json", "cypress/e2e/login.cy.ts"]);
  });

  it("does not count a test written for one runner as evidence for the other", () => {
    const vitestSpec = file("tests/cart.test.ts", "Test implementation", "import { describe, expect, it } from 'vitest';\ndescribe('cart', () => { it('adds', () => { expect(1).toBe(1); }); });\n".repeat(5));
    const jestSpec = file("tests/api.test.ts", "Test implementation", "import { describe, expect, it } from '@jest/globals';\ndescribe('api', () => { it('answers', () => { expect(1).toBe(1); }); });\n".repeat(5));

    expect(paths("Jest", [manifest, vitestSpec, jestSpec])).toEqual(["package.json", "tests/api.test.ts"]);
    expect(paths("Vitest", [manifest, vitestSpec, jestSpec])).toEqual(["package.json", "tests/cart.test.ts"]);
  });

  it("finds Docker by its own files, never by a Python import or a SQL query", () => {
    const dockerfile = file("Dockerfile", "Infrastructure or deployment configuration", "FROM python:3.13-slim\nCOPY . /app\nCMD [\"python\", \"-m\", \"orders\"]\n");
    const python = file("orders/place.py", "Service or domain logic", "from orders.models import Order\n\ndef place(order):\n    return order\n".repeat(8));
    const sql = file("db/report.sql", "Database schema or migration", "SELECT id\nFROM orders\nWHERE total > 0;\n".repeat(10));

    const evidence = collectTechnologyEvidenceFiles(signal("Docker", ["Dockerfile"]), [dockerfile, python, sql]);
    expect(evidence.map((item) => item.path)).toEqual(["Dockerfile"]);
    expect(maximumEvidenceLevel(evidence)).toBe("Limited Evidence");
  });
});
