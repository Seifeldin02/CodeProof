import { describe, expect, it } from "vitest";
import { readJobBrief } from "./brief";

function importanceByName(text: string): Record<string, string> {
  return Object.fromEntries(readJobBrief(text).skills.map((skill) => [skill.name, skill.importance]));
}

const SECTIONED = `Senior Backend Engineer (Python)

About us
We are a fintech in Riyadh. Our stack: Kafka on AWS.

Responsibilities
- Design and build REST APIs
- Own CI/CD pipelines

Requirements
- 5+ years of backend experience
- Strong Python and Django
- PostgreSQL
- Bachelor's degree in Computer Science

Nice to have
- Go or Rust
- Experience with Terraform`;

describe("reading a job brief", () => {
  it("applies a heading to the lines under it", () => {
    expect(importanceByName(SECTIONED)).toEqual({
      Python: "required", Kafka: "context", AWS: "context", REST: "context", "CI/CD": "context",
      Django: "required", PostgreSQL: "required", Go: "preferred", Rust: "preferred", Terraform: "preferred",
    });
  });

  it("applies a heading that shares its line with text to that text only", () => {
    expect(importanceByName("Must have: Python, Django\nWe also use AWS.\nNice to have: Docker")).toEqual({
      Python: "required", Django: "required", AWS: "context", Docker: "preferred",
    });
  });

  it("reads a heading it has never seen from its own wording", () => {
    expect(importanceByName("You must have:\n- React\nBonus if you know:\n- GraphQL")).toEqual({ React: "required", GraphQL: "preferred" });
  });

  it("lets a line's own wording outrank the heading above it", () => {
    expect(importanceByName("Requirements\n- TypeScript\n- Docker is a plus")).toEqual({ TypeScript: "required", Docker: "preferred" });
  });

  it("reads a sentence that marks skills differently phrase by phrase", () => {
    expect(importanceByName("Python and Django are required, and Docker is nice to have.")).toEqual({
      Python: "required", Django: "required", Docker: "preferred",
    });
    expect(importanceByName("React, TypeScript required, AWS preferred")).toEqual({ React: "required", TypeScript: "required", AWS: "preferred" });
  });

  it("keeps the strongest wording when a skill is named more than once", () => {
    expect(importanceByName("We use React.\nReact is required.\nReact is a plus.")).toEqual({ React: "required" });
  });

  it("treats a skill as expected when nothing clearer is said", () => {
    expect(importanceByName("Strong knowledge of Vue. We also have some Angular.")).toEqual({ Vue: "required", Angular: "context" });
    expect(importanceByName("React developer with TypeScript and Node.js")).toEqual({ React: "context", TypeScript: "context", "Node.js": "context" });
  });

  it("leaves a list that marks each of its own lines exactly as marked", () => {
    // The text the app builds from saved company requirements: no mark on a line means it is context only.
    expect(importanceByName("Company requirements:\n- TypeScript (required)\n- Docker (preferred)\n- Kafka")).toEqual({
      TypeScript: "required", Docker: "preferred", Kafka: "context",
    });
    expect(importanceByName("Nice to have:\n- Docker\nOther requirements:\n- Kafka")).toEqual({ Docker: "preferred", Kafka: "required" });
  });

  it("reads Arabic headings and wording", () => {
    expect(importanceByName("المتطلبات:\n- خبرة في React و Node.js\nيفضل:\n- Docker")).toEqual({
      React: "required", "Node.js": "required", Docker: "preferred",
    });
    expect(importanceByName("يشترط إجادة Python ويفضل معرفة AWS")).toEqual({ Python: "required", AWS: "preferred" });
  });
});

describe("the years of experience a brief asks for", () => {
  it("takes the lower end of a range and the largest ask", () => {
    expect(readJobBrief("3-5 years of experience with React").minimumYears).toBe(3);
    expect(readJobBrief("5+ years of software experience, including 2+ years of React experience").minimumYears).toBe(5);
    expect(readJobBrief("Minimum of 4 years in a similar role").minimumYears).toBe(4);
    expect(readJobBrief("Experience: at least 2 yrs").minimumYears).toBe(2);
    expect(readJobBrief("Requirements: Flutter & Dart (3 yrs+), Firebase").minimumYears).toBe(3);
  });

  it("ignores figures that are not about experience", () => {
    expect(readJobBrief("We have been in business for 10 years. Applicants must be 18 years old.").minimumYears).toBeNull();
    expect(readJobBrief("React developer").minimumYears).toBeNull();
  });

  it("reads an Arabic ask, in either kind of digit", () => {
    expect(readJobBrief("خبرة لا تقل عن 3 سنوات في تطوير الويب").minimumYears).toBe(3);
    expect(readJobBrief("٥ سنوات خبرة").minimumYears).toBe(5);
  });
});

describe("what a brief leaves to a person", () => {
  it("lists the sentences about years, degrees and ways of working", () => {
    expect(readJobBrief(SECTIONED).humanReview).toEqual(["5+ years of backend experience", "Bachelor's degree in Computer Science"]);
  });
});
