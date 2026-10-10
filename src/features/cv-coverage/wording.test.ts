import { describe, expect, it } from "vitest";
import { translate } from "@/i18n/translations";
import { COVERAGE_WORDING } from "./wording";

describe("coverage check wording", () => {
  it("has an Arabic entry for every label, since these keys are looked up dynamically", () => {
    expect(COVERAGE_WORDING.filter((key) => translate("ar", key) === key)).toEqual([]);
  });
});
