import { describe, expect, it } from "vitest";
import { formatDate } from "./format";

describe("formatDate", () => {
  it("formats date-only analytics values", () => {
    expect(formatDate("2026-07-20")).toBe("Jul 20, 2026");
  });

  it("formats full ISO timestamps from persisted candidate events", () => {
    expect(formatDate("2026-07-20T01:23:45.000Z")).toBe("Jul 20, 2026");
  });
});
