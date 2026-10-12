import { describe, expect, it } from "vitest";
import { canonicalSkill, skillsCoveredBy, skillsIn } from "./skills";

describe("reading skill names", () => {
  it("reads the common ways of writing a skill as the same skill", () => {
    expect(skillsIn("NodeJS, ReactJS, Postgres, K8s, GCP, ASP.NET Core, Golang, Vue 3, Next JS, C++17")).toEqual([
      "Node.js", "React", "PostgreSQL", "Kubernetes", "Google Cloud", ".NET", "Go", "Vue", "Next.js", "C++",
    ]);
    expect(skillsIn("HTML5/CSS3/JS, Tailwind, REST APIs, unit tests, CI CD, PL/SQL")).toEqual([
      "HTML", "CSS", "JavaScript", "Tailwind CSS", "REST", "Testing", "CI/CD", "SQL",
    ]);
  });

  it("keeps the order in which the text names the skills and names each once", () => {
    expect(skillsIn("Python and Django.\nDjango, PostgreSQL, python")).toEqual(["Python", "Django", "PostgreSQL"]);
  });

  it("does not read part of a longer name as a skill of its own", () => {
    expect(skillsIn("JavaScript, TypeScript, MySQL, NoSQL, GitHub Actions, AngularJS")).toEqual([
      "JavaScript", "TypeScript", "MySQL", "NoSQL", "GitHub Actions", "Angular",
    ]);
    expect(skillsIn("React Native and Spring Security")).toEqual(["React Native", "Spring"]);
    expect(skillsIn("Azure DevOps pipelines, SQL Server, Tailwind CSS")).toEqual(["Azure DevOps", "SQL Server", "Tailwind CSS"]);
    expect(skillsIn("C, C++, C# and Objective-C")).toEqual(["C", "C++", "C#", "Objective-C"]);
    expect(skillsIn("Three.js and Socket.IO")).toEqual(["WebSockets"]);
  });

  it("does not take an everyday word for a skill", () => {
    expect(skillsIn("Happy to go the extra mile and react quickly while the rest of the team is away.")).toEqual([]);
    expect(skillsIn("Go to market planning. Go-live support in Spring 2021, then Spring semester teaching.")).toEqual([]);
    expect(skillsIn("I express ideas clearly, excel at planning and stay at the helm.")).toEqual([]);
    expect(skillsIn("R&D team lead. Vitamin C. C-level reporting. SWIFT transfers.")).toEqual([]);
  });

  it("still reads those words when they are written as the skill", () => {
    expect(skillsIn("Languages: Go, Rust, R, C and Swift")).toEqual(["Go", "Rust", "R", "C", "Swift"]);
    expect(skillsIn("Built services in Go with Spring Boot and Express")).toEqual(["Go", "Spring", "Express"]);
    expect(skillsIn("Experience with Go is required. REST and Excel are a plus.")).toEqual(["Go", "REST", "Excel"]);
  });

  it("does not take a person's name for a skill", () => {
    expect(skillsIn("Ruby Jenkins\nSenior Engineer")).toEqual([]);
    expect(skillsIn("Tools: Jenkins, Ruby, Cassandra")).toEqual(["Jenkins", "Ruby", "Cassandra"]);
    expect(skillsIn("Software Engineer at Oracle")).toEqual([]);
    expect(skillsIn("Oracle, PL/SQL")).toEqual(["Oracle", "SQL"]);
  });

  it("ignores links and e-mail addresses", () => {
    expect(skillsIn("github.com/someone/django-shop | https://example.com/react | ruby.swift@example.com")).toEqual([]);
    expect(skillsIn("Portfolio: someone.vercel.app/angular — built with Vue")).toEqual(["Vue"]);
  });

  it("reads skill names inside Arabic text", () => {
    expect(skillsIn("خبرة في React و Node.js وقواعد بيانات PostgreSQL")).toEqual(["React", "Node.js", "PostgreSQL"]);
  });
});

describe("what a named skill covers", () => {
  it("covers the skills it cannot be used without, and says which name did it", () => {
    const covered = skillsCoveredBy(["Next.js", "Django", "PostgreSQL", "Jest"]);
    expect(covered.get("React")).toEqual(["Next.js"]);
    expect(covered.get("JavaScript")).toEqual(["Next.js"]);
    expect(covered.get("Python")).toEqual(["Django"]);
    expect(covered.get("SQL")).toEqual(["PostgreSQL"]);
    expect(covered.get("Testing")).toEqual(["Jest"]);
    expect(covered.has("Java")).toBe(false);
  });

  it("names the skill itself when the text does", () => {
    expect(skillsCoveredBy(["Python", "Django", "Flask"]).get("Python")).toEqual(["Python"]);
  });

  it("gives the listed spelling of a name", () => {
    expect(canonicalSkill("postgresql")).toBe("PostgreSQL");
    expect(canonicalSkill(" node.js ")).toBe("Node.js");
    expect(canonicalSkill("5 years of experience")).toBeNull();
  });
});
