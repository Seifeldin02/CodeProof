import { describe, expect, it } from "vitest";
import { extractExperienceTimeline, statementsOf, timelineOf } from "./experience";

const entries = (text: string) => extractExperienceTimeline(text).map((entry) => [entry.claim, entry.period?.start, entry.period?.end, entry.period?.kind]);

describe("CV experience timeline", () => {
  it("reads a dated line in the forms CVs use, keeping the CV's own wording", () => {
    expect(entries([
      "Senior Backend Engineer, Acme Payments | Mar 2021 - Present",
      "Backend Engineer at Northwind (2018 – 2021)",
      "Software Developer — Contoso, 06/2016 to 12/2017",
      "Intern, Fabrikam: January 2015 until June 2015",
    ].join("\n"))).toEqual([
      ["Senior Backend Engineer, Acme Payments", "2021-03", null, "work"],
      ["Backend Engineer at Northwind", "2018", "2021", "work"],
      ["Software Developer — Contoso", "2016-06", "2017-12", "work"],
      ["Intern, Fabrikam", "2015-01", "2015-06", "work"],
    ]);
  });

  it("takes the title from the line above or below when a line holds only dates", () => {
    expect(entries("Data Engineer, Retail Group\n2019 - 2023\n\n2016 - 2019\nAnalyst, City Bank")).toEqual([
      ["Data Engineer, Retail Group", "2019", "2023", "work"],
      ["Analyst, City Bank", "2016", "2019", "work"],
    ]);
  });

  it("tells a course of study from a job", () => {
    expect(entries("B.Sc. Computer Science, Cairo University, 2012 - 2016\nFull-Stack Bootcamp 2017 - 2017")).toEqual([
      ["Full-Stack Bootcamp", "2017", "2017", "education"],
      ["B.Sc. Computer Science, Cairo University", "2012", "2016", "education"],
    ]);
  });

  it("puts what is still going on first, then the most recent", () => {
    const order = extractExperienceTimeline("Role A 2015 - 2017\nRole B 2020 - present\nRole C 2017 - 2020").map((entry) => entry.claim);
    expect(order).toEqual(["Role B", "Role C", "Role A"]);
  });

  it("does not read a link, an address, a single year or a backwards range as a period", () => {
    expect(entries([
      "Project: https://github.com/example/advent-2019-2020",
      "Contact: someone2019-2020@example.invalid",
      "Graduated 2016",
      "Built the billing service in 2021",
      "Strange 2023 - 2019",
      "13/2020 - 14/2021 not months",
    ].join("\n"))).toEqual([]);
  });

  it("marks every entry as a candidate-reported experience claim and keeps it apart from statements", () => {
    const timeline = extractExperienceTimeline("Engineer, Acme 2019 - 2022\nEngineer, Acme 2019 - 2022");
    expect(timeline).toEqual([{ claim: "Engineer, Acme", category: "experience", source: "Candidate Claim", period: { start: "2019", end: "2022", kind: "work" } }]);
    const saved = [{ claim: "TypeScript", category: "technology" as const, source: "Candidate Claim" as const }, ...timeline];
    expect(timelineOf(saved).map((entry) => entry.claim)).toEqual(["Engineer, Acme"]);
    expect(statementsOf(saved).map((entry) => entry.claim)).toEqual(["TypeScript"]);
  });

  it("keeps at most eight entries", () => {
    const text = Array.from({ length: 12 }, (_, index) => `Role ${index} ${2000 + index} - ${2001 + index}`).join("\n");
    expect(extractExperienceTimeline(text)).toHaveLength(8);
  });
});
