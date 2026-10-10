import { describe, expect, it } from "vitest";
import { discoverCandidateLinks } from "@/features/resume-matching/discovery";
import { classifyCv, coverageShare, summarizeCoverage } from "./census";

describe("CV coverage census", () => {
  it("sorts a CV by the strongest kind of code link it names", () => {
    expect(classifyCv(discoverCandidateLinks("Amina\nhttps://github.com/amina/api\ngithub.com/amina\nhttps://amina.dev"))).toBe("repository");
    expect(classifyCv(discoverCandidateLinks("Amina\ngithub.com/amina\nhttps://amina.dev"))).toBe("profile_only");
    expect(classifyCv(discoverCandidateLinks("Amina\nhttps://gitlab.com/amina/api"))).toBe("other_source_only");
    expect(classifyCv(discoverCandidateLinks("Amina\nhttps://amina.dev"))).toBe("other_source_only");
    expect(classifyCv(discoverCandidateLinks("Amina\nlinkedin.com/in/amina\nNode.js, Next.js"))).toBe("no_link");
  });

  it("counts unreadable files apart and leaves them out of every share", () => {
    const summary = summarizeCoverage(["repository", "repository", "profile_only", "no_link", "unreadable", "unreadable"]);
    expect(summary).toEqual({ total: 6, readable: 4, counts: { repository: 2, profile_only: 1, other_source_only: 0, no_link: 1, unreadable: 2 } });
    expect(coverageShare(summary.counts.repository, summary.readable)).toBe(50);
    expect(coverageShare(summary.counts.profile_only, summary.readable)).toBe(25);
  });

  it("rounds to one decimal and refuses to divide by zero", () => {
    expect(coverageShare(1, 3)).toBe(33.3);
    expect(coverageShare(2, 3)).toBe(66.7);
    expect(coverageShare(1, 8)).toBe(12.5);
    expect(coverageShare(0, 0)).toBeNull();
    expect(summarizeCoverage([])).toMatchObject({ total: 0, readable: 0 });
  });
});
