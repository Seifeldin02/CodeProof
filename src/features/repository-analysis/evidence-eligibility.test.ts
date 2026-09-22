import { describe, expect, it } from "vitest";
import type { AttributionStatus, EvidenceCitation } from "@/types/remediation";
import { filterEligibleCitations, isConclusionEligibleAttribution } from "./evidence-eligibility";

const statuses: AttributionStatus[] = [
  "unverified",
  "candidate_claimed",
  "verified_owner",
  "verified_contributor",
];

describe("Property 2: unverified evidence cannot influence candidate conclusions", () => {
  it("admits exactly verified contributor attribution for every generated status sequence", () => {
    for (let mask = 0; mask < 256; mask += 1) {
      const sequence = Array.from({ length: 4 }, (_, index) => statuses[(mask >> (index * 2)) & 3]);
      const citations = sequence.map((attributionStatus, index) => ({
        id: `citation-${index}`,
        attributionStatus,
      })) as Array<Pick<EvidenceCitation, "id" | "attributionStatus">>;
      expect(filterEligibleCitations(citations).map((citation) => citation.id)).toEqual(
        citations.filter((citation) => citation.attributionStatus === "verified_contributor").map((citation) => citation.id),
      );
      for (const status of sequence) expect(isConclusionEligibleAttribution(status)).toBe(status === "verified_contributor");
    }
  });
});
