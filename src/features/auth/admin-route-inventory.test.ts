import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(target) : [target];
  });
}

describe("administrative route inventory", () => {
  it("guards every page in addition to the layout", () => {
    const root = path.join(process.cwd(), "src", "app", "admin");
    const pages = filesBelow(root).filter((file) => file.endsWith("page.tsx"));
    expect(pages.length).toBeGreaterThan(0);
    for (const file of [path.join(root, "layout.tsx"), ...pages]) {
      expect(readFileSync(file, "utf8"), file).toContain("requireAdminPage");
    }
  });

  it("guards every administrative route handler and never exports a mutation as GET", () => {
    const root = path.join(process.cwd(), "src", "app", "api", "admin");
    const routes = filesBelow(root).filter((file) => file.endsWith("route.ts"));
    expect(routes.length).toBeGreaterThan(0);
    for (const file of routes) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("requireAdmin");
      if (source.includes("withAdminAudit")) expect(source, file).not.toMatch(/export\s+(?:async\s+)?function\s+GET/u);
    }
  });
});
