import { describe, expect, it } from "vitest";
import type { CandidateRecord } from "@/features/hiring-analytics/types";
import { extractResumeClaims } from "@/features/resume-matching/claims";
import { extractExperienceTimeline } from "@/features/resume-matching/experience";
import { matchingSkills, poolCv, readPoolQuery, searchPool, type PoolCv } from "./pool";

function applicant(id: string, name: string, repositoryCount = 0): CandidateRecord {
  return { id, name, role: "Backend Engineer", repositoryCount } as unknown as CandidateRecord;
}

function cvOf(text: string): PoolCv {
  return poolCv([...extractResumeClaims(text), ...extractExperienceTimeline(text)], "2026-10-12");
}

const people = [applicant("a", "Noor Example", 2), applicant("b", "Tariq Example"), applicant("c", "Lina Example")];
const cv = {
  a: cvOf("Noor Example\nSenior Backend Developer | Riyadh\nSkills: Django, Postgres, Docker, K8s\nBackend Engineer, Example Pay | Jan 2021 - Dec 2024"),
  b: cvOf("Tariq Example\nData Analyst\nSkills: Python, SQL, Power BI"),
  c: cvOf("Lina Example\nSkills: React Native, Go"),
};
const found = (query: string, source?: "all" | "code" | "cv") => searchPool(people, cv, query, source).map((person) => person.id);

describe("what the pool list says about a CV", () => {
  it("gives the stated role, the skills in the CV's order, what they cover, and the dated work", () => {
    expect(cv.a).toEqual({
      statedRole: "Backend Engineer",
      skills: ["Django", "PostgreSQL", "Docker", "Kubernetes"],
      covered: ["Django", "Python", "PostgreSQL", "SQL", "Docker", "Kubernetes"],
      workMonths: 48,
    });
    expect(poolCv([], "2026-10-12")).toEqual({ statedRole: null, skills: [], covered: [], workMonths: null });
  });
});

describe("searching the pool", () => {
  it("reads skills in any letter case and spelling, and leaves the other words as words", () => {
    expect(readPoolQuery("postgres react native riyadh")).toEqual({ skills: ["PostgreSQL", "React Native"], words: ["riyadh"] });
    expect(readPoolQuery("go, rest and K8S")).toEqual({ skills: ["Kubernetes", "Go", "REST"], words: [] });
    expect(readPoolQuery("  ")).toEqual({ skills: [], words: [] });
  });

  it("finds the applicants whose CV covers every skill asked for", () => {
    expect(found("docker")).toEqual(["a"]);
    expect(found("sql")).toEqual(["a", "b"]);
    // Django cannot be used without Python, so a search for Python finds the CV that names Django.
    expect(found("python")).toEqual(["a", "b"]);
    expect(found("python docker")).toEqual(["a"]);
    expect(found("react")).toEqual(["c"]);
    expect(found("java")).toEqual([]);
  });

  it("matches other words against the name and the roles, and a word being typed against the start of a skill", () => {
    expect(found("tariq")).toEqual(["b"]);
    expect(found("analyst")).toEqual(["b"]);
    expect(found("backend engineer")).toEqual(["a", "b", "c"]);
    expect(found("kub")).toEqual(["a"]);
    expect(found("noor python")).toEqual(["a"]);
    expect(found("lina python")).toEqual([]);
  });

  it("says which skills on a CV answer the search", () => {
    expect(matchingSkills(cv.a, readPoolQuery("python docker"))).toEqual(["Django", "Docker"]);
    expect(matchingSkills(cv.a, readPoolQuery("kub noor"))).toEqual(["Kubernetes"]);
    expect(matchingSkills(cv.a, readPoolQuery(""))).toEqual([]);
    expect(matchingSkills(undefined, readPoolQuery("python"))).toEqual([]);
  });

  it("filters by whether public code was read, and lists everyone for an empty search", () => {
    expect(found("")).toEqual(["a", "b", "c"]);
    expect(found("", "code")).toEqual(["a"]);
    expect(found("", "cv")).toEqual(["b", "c"]);
    expect(found("python", "cv")).toEqual(["b"]);
  });

  it("does not match an applicant nothing is known about by accident", () => {
    expect(searchPool([applicant("z", "Zed Example")], {}, "python")).toEqual([]);
    expect(searchPool([applicant("z", "Zed Example")], {}, "zed").map((person) => person.id)).toEqual(["z"]);
  });
});
