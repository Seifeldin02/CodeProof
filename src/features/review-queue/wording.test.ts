import { describe, expect, it } from "vitest";
import { translate } from "@/i18n/translations";
import { nextStepReason, REVIEW_QUEUE_WORDING } from "./wording";

describe("review queue wording", () => {
  it("has an Arabic entry for every label, since these keys are looked up dynamically", () => {
    expect(REVIEW_QUEUE_WORDING.filter((key) => translate("ar", key) === key)).toEqual([]);
  });

  it("does not claim role fit when no company requirements are saved", () => {
    const base = { tier: "review" as const, evidenceRequestedAt: null };
    expect(nextStepReason({ ...base, nextStep: "review_then_decide", requirements: null })).toContain("Role fit is unknown");
    expect(nextStepReason({ ...base, nextStep: "review_then_decide", requirements: { judged: 2, strong: 1, partial: 0, unsupported: 1, unsupportedNames: ["Go"] } })).toContain("part of the role");
  });

  it("says when an answer is awaited and when the candidate's work is confidential", () => {
    const incomplete = { tier: "evidence_incomplete" as const, requirements: null };
    expect(nextStepReason({ ...incomplete, nextStep: "ask_for_evidence", evidenceRequestedAt: "2026-10-10T00:00:00.000Z" })).toContain("has not arrived yet");
    expect(nextStepReason({ ...incomplete, nextStep: "ask_for_evidence", evidenceRequestedAt: null })).toContain("Ask the candidate");
    expect(nextStepReason({ ...incomplete, nextStep: "test_or_verify", evidenceRequestedAt: null })).toContain("confidential");
  });
});
