import { describe, expect, it } from "vitest";
import { extractExperienceTimeline, statedWorkMonths, statementsOf, timelineOf } from "./experience";

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

  it("keeps a bracketed part of the title whole when the date beside it is removed", () => {
    expect(entries("Example Telecom — Trainee (Co-op)      Jun 2018 – Aug 2018")).toEqual([["Example Telecom — Trainee (Co-op)", "2018-06", "2018-08", "work"]]);
    expect(entries("Backend Engineer at Northwind (2018 – 2021)")).toEqual([["Backend Engineer at Northwind", "2018", "2021", "work"]]);
  });

  it("keeps at most eight entries", () => {
    const text = Array.from({ length: 12 }, (_, index) => `Role ${index} ${2000 + index} - ${2001 + index}`).join("\n");
    expect(extractExperienceTimeline(text)).toHaveLength(8);
  });
});

describe("dated work on a CV, added up", () => {
  const months = (text: string) => statedWorkMonths(extractExperienceTimeline(text), "2026-10-12");

  it("counts whole months, and a job still going on up to this month", () => {
    expect(months("Engineer, Acme | Mar 2021 - Jun 2021")).toBe(4);
    expect(months("Engineer, Acme | Jan 2026 - Present")).toBe(10);
  });

  it("reads two bare years as the years between them, and one bare year as part of that year", () => {
    expect(months("Engineer, Acme 2018 - 2021")).toBe(36);
    expect(months("Engineer, Acme 2020 - 2020")).toBe(6);
  });

  it("counts jobs that overlap once and leaves gaps out", () => {
    expect(months("Engineer, Acme | Jan 2019 - Dec 2020\nConsultant, Contoso | Jul 2020 - Jun 2021")).toBe(30);
    expect(months("Engineer, Acme | Jan 2019 - Dec 2019\nEngineer, Contoso | Jan 2021 - Dec 2021")).toBe(24);
  });

  it("does not count study as work, and says nothing when the CV dates no work", () => {
    expect(months("B.Sc. Computer Science, Example University, 2012 - 2016")).toBeNull();
    expect(months("TypeScript, React, Node.js")).toBeNull();
    expect(statedWorkMonths([{ claim: "TypeScript", category: "technology", source: "Candidate Claim" }], "2026-10-12")).toBeNull();
  });
});
