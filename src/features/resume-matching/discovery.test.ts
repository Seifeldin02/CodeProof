import { describe, expect, it } from "vitest";
import { discoverCandidateLinks } from "./discovery";

describe("CV GitHub discovery", () => {
  it("extracts and deduplicates repository links while suggesting candidate context", () => {
    const result = discoverCandidateLinks(`
      Ada Lovelace
      Full-stack Engineer
      Portfolio: github.com/ada/compiler
      Case study: https://github.com/ada/compiler/tree/main/src
      Also: https://github.com/ada/runtime.
    `);
    expect(result.candidateName).toBe("Ada Lovelace");
    expect(result.suggestedRole).toBe("Full-Stack Engineer");
    expect(result.repositories.map((repository) => repository.url)).toEqual([
      "https://github.com/ada/compiler",
      "https://github.com/ada/runtime",
    ]);
    expect(result.manualSelectionRequired).toBe(false);
  });

  it("suggests the role the CV's headline states over a word found elsewhere in it", () => {
    const role = (text: string) => discoverCandidateLinks(text).suggestedRole;
    expect(role("Noor Example\nSenior Backend Developer | Riyadh\nSkills: Python, Kubernetes, Terraform")).toBe("Backend Engineer");
    expect(role("Noor Example\nSkills: Python, Kubernetes, Terraform")).toBeNull();
    expect(role("Noor Example\nData Analyst\nSkills: SQL, ETL")).toBe("Data Analyst");
    expect(role("Noor Example\nMobile Engineer\nSkills: Flutter")).toBe("Mobile Engineer");
  });

  it("extracts names from labeled and decorated CV headers without inventing one from a filename", () => {
    expect(discoverCandidateLinks("Name: Sara Al-Hassan\nSoftware Engineer\nGitHub: https://github.com/sara").candidateName).toBe("Sara Al-Hassan");
    expect(discoverCandidateLinks("Mariam Noor | Senior Software Engineer\nmariam@example.com").candidateName).toBe("Mariam Noor");
    expect(discoverCandidateLinks("Amina Hassan • +966 555 000 000\nDeveloper").candidateName).toBe("Amina Hassan");
    expect(discoverCandidateLinks("Noura\nAlharbi\nSoftware Engineer\nemail@example.com").candidateName).toBe("Noura Alharbi");
    expect(discoverCandidateLinks("Software Engineer\nSkills\nJavaScript, TypeScript").candidateName).toBeNull();
  });

  it("provides a manual repository fallback for profile-only CVs", () => {
    const result = discoverCandidateLinks("Grace Hopper\nGitHub: https://github.com/grace");
    expect(result.profiles).toEqual([{ owner: "grace", url: "https://github.com/grace" }]);
    expect(result.repositories).toEqual([]);
    expect(result.manualSelectionRequired).toBe(true);
    expect(result.notes[0]).toContain("List its public projects");
  });
});

describe("portfolio and non-GitHub source discovery", () => {
  it("detects a portfolio site and a non-GitHub code host", () => {
    const discovery = discoverCandidateLinks([
      "Amina Hassan",
      "Portfolio: https://amina.dev/projects",
      "Also: https://gitlab.com/amina/api",
      "Repo: https://github.com/amina/toolkit",
    ].join("\n"));
    expect(discovery.otherSources.map((source) => source.url)).toEqual([
      "https://amina.dev/projects",
      "https://gitlab.com/amina/api",
    ]);
    expect(discovery.otherSources.find((source) => source.host === "gitlab.com")?.kind).toBe("code_host");
    expect(discovery.otherSources.find((source) => source.host === "amina.dev")?.kind).toBe("portfolio");
  });

  it("ignores GitHub, social profiles and ordinary prose", () => {
    const discovery = discoverCandidateLinks([
      "Skills: Node.js, Next.js, package.json tooling",
      "https://www.linkedin.com/in/amina",
      "https://github.com/amina/toolkit",
    ].join("\n"));
    expect(discovery.otherSources).toEqual([]);
  });
});
