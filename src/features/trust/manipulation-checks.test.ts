import { describe, expect, it } from "vitest";
import { runManipulationChecks } from "./manipulation-checks";

describe("attempts to move a result without changing the code", () => {
  it("leaves the evidence and the order where the code put them", async () => {
    const results = await runManipulationChecks();
    expect(results.filter((check) => !check.passed).map((check) => check.id)).toEqual([]);
    expect(results).toHaveLength(7);
  });
});
