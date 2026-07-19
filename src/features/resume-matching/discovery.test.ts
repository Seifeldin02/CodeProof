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

  it("provides a manual repository fallback for profile-only CVs", () => {
    const result = discoverCandidateLinks("Grace Hopper\nGitHub: https://github.com/grace");
    expect(result.profiles).toEqual([{ owner: "grace", url: "https://github.com/grace" }]);
    expect(result.repositories).toEqual([]);
    expect(result.manualSelectionRequired).toBe(true);
    expect(result.notes[0]).toContain("Paste one or more public repository URLs");
  });
});
