import { describe, expect, it } from "vitest";
import { translate } from "@/i18n/translations";
import { nextStepReason, REVIEW_QUEUE_WORDING } from "./wording";

describe("review queue wording", () => {
  it("has an Arabic entry for every label, since these keys are looked up dynamically", () => {
    expect(REVIEW_QUEUE_WORDING.filter((key) => translate("ar", key) === key)).toEqual([]);
  });

  it("does not claim role fit when no company requirements are saved", () => {
    expect(nextStepReason({ nextStep: "review_then_decide", requirements: null })).toContain("Role fit is unknown");
    expect(nextStepReason({ nextStep: "review_then_decide", requirements: { judged: 2, strong: 1, partial: 0, unsupported: 1, unsupportedNames: ["Go"] } })).toContain("part of the role");
  });
});
