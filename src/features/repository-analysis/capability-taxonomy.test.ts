import { describe, expect, it } from "vitest";
import type {
  CapabilityEvidencePolicy,
  CapabilityNode,
  CapabilityRelation,
  CapabilityTaxonomyDefinition,
  GitHubActionsEvidenceInput,
} from "./capability-taxonomy";
import {
  CAPABILITY_TAXONOMY_VERSIONS,
  CI_CD_CAPABILITY_ID,
  GITHUB_ACTIONS_MEANINGFUL_DETECTOR_ID,
  PINNED_CAPABILITY_TAXONOMY_VERSION,
  canRollUpEvidence,
  classifyGitHubActionsEvidence,
  defineCapabilityTaxonomy,
  getCapabilityNode,
  getCapabilityTaxonomyVersion,
  getPinnedCapabilityTaxonomy,
  isMeaningfulGitHubActionsWorkflow,
  normalizeCapabilityAlias,
  resolveCapabilityAlias,
} from "./capability-taxonomy";

const TEST_POLICY: CapabilityEvidencePolicy = {
  conclusiveSignalClasses: ["implementation"],
  nonConclusiveSignalClasses: ["dependency"],
  weakSignalMaximumEvidenceLevel: "limited",
  absentEvidenceLevel: "insufficient",
  detectorEvidenceRules: [],
};

function fixtureNode(
  id: string,
  relations: readonly CapabilityRelation[] = [],
  aliases: readonly string[] = [],
  rollUpTo: readonly string[] = [],
): CapabilityNode {
  return {
    id,
    labels: { en: `English ${id}`, ar: `عربي ${id}` },
    aliases,
    category: "domain",
    signalClasses: ["implementation", "dependency"],
    evidencePolicy: TEST_POLICY,
    relations,
    detectorIds: [`detector.${id}`],
    rollUpTo,
  };
}

function fixtureTaxonomy(nodes: readonly CapabilityNode[]): CapabilityTaxonomyDefinition {
  return {
    version: "test.1",
    effectiveAt: "2025-02-03T00:00:00.000Z",
    evidencePolicyVersion: "test-policy.1",
    nodes,
  };
}

function expectDeeplyFrozen(value: unknown, visited = new Set<unknown>()): void {
  if (value === null || typeof value !== "object" || visited.has(value)) return;
  visited.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Object.values(value)) expectDeeplyFrozen(nested, visited);
}

function assertBroaderGraphIsAcyclic(nodes: readonly CapabilityNode[]): void {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    expect(visiting.has(id)).toBe(false);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const relation of byId.get(id)?.relations ?? []) {
      if (relation.type === "broader_than") visit(relation.targetId);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const node of nodes) visit(node.id);
}

describe("canonical capability aliases", () => {
  it("normalizes with NFKC, trimming, whitespace collapse, and locale-independent casing", () => {
    expect(normalizeCapabilityAlias("  Ａｕｔｏｍａｔｅｄ\u00a0\n TESTING  ")).toBe("automated testing");
    expect(normalizeCapabilityAlias("  Next.JS\t")).toBe("next.js");
  });

  it("resolves every canonical ID, bilingual label, and declared alias to exactly its node", () => {
    const taxonomy = getPinnedCapabilityTaxonomy();
    for (const node of taxonomy.nodes) {
      for (const alias of [node.id, node.labels.en, node.labels.ar, ...node.aliases]) {
        expect(resolveCapabilityAlias(alias, taxonomy.version)?.id).toBe(node.id);
      }
    }
  });

  it("canonicalizes general, unit, and integration testing without conflating their scopes", () => {
    const version = PINNED_CAPABILITY_TAXONOMY_VERSION;
    for (const alias of ["Testing", " automated   testing ", "ＴＥＳＴＩＮＧ"]) {
      expect(resolveCapabilityAlias(alias, version)?.id).toBe("engineering.testing");
    }
    for (const alias of ["unit", "Unit Testing", "unit tests"]) {
      expect(resolveCapabilityAlias(alias, version)?.id).toBe("engineering.testing.unit");
    }
    for (const alias of ["integration", "Integration Testing", "integration tests"]) {
      expect(resolveCapabilityAlias(alias, version)?.id).toBe("engineering.testing.integration");
    }
    expect(resolveCapabilityAlias("unit", version)?.id).not.toBe(resolveCapabilityAlias("integration", version)?.id);
  });

  it("retains framework specificity while mapping each current framework safely upward", () => {
    const version = PINNED_CAPABILITY_TAXONOMY_VERSION;
    const expectedAliases: Readonly<Record<string, string>> = {
      ReactJS: "web.framework.react",
      next: "web.framework.nextjs",
      "Vue.js": "web.framework.vue",
      NuxtJS: "web.framework.nuxt",
      Angular: "web.framework.angular",
      Svelte: "web.framework.svelte",
      "Express.js": "web.framework.express",
      Fastify: "web.framework.fastify",
      Nest: "web.framework.nestjs",
      Django: "web.framework.django",
      "Fast API": "web.framework.fastapi",
      Flask: "web.framework.flask",
      Laravel: "web.framework.laravel",
      "Spring Boot": "web.framework.spring",
    };

    for (const [alias, capabilityId] of Object.entries(expectedAliases)) {
      const node = resolveCapabilityAlias(alias, version);
      expect(node?.id).toBe(capabilityId);
      const broadCapabilityId = capabilityId === "web.framework.react"
        || capabilityId === "web.framework.nextjs"
        || capabilityId === "web.framework.vue"
        || capabilityId === "web.framework.nuxt"
        || capabilityId === "web.framework.angular"
        || capabilityId === "web.framework.svelte"
        ? "web.frontend"
        : "web.backend_api";
      expect(canRollUpEvidence(capabilityId, broadCapabilityId, version)).toBe(true);
      expect(canRollUpEvidence(broadCapabilityId, capabilityId, version)).toBe(false);
    }
    expect(resolveCapabilityAlias("Flask", version)?.id).toBe("web.framework.flask");
    expect(canRollUpEvidence("web.framework.flask", "web.backend_api", version)).toBe(true);
  });

  it("fails taxonomy construction on a normalized alias collision", () => {
    expect(() => defineCapabilityTaxonomy(fixtureTaxonomy([
      fixtureNode("capability.alpha", [], ["Testing"]),
      fixtureNode("capability.beta", [], ["ＴＥＳＴＩＮＧ"]),
    ]))).toThrow(/resolves to both/);
  });
});

describe("taxonomy relationships and safe evidence roll-up", () => {
  it("keeps broader/narrower inverse and acyclic and symmetric relations bidirectional", () => {
    const taxonomy = getPinnedCapabilityTaxonomy();
    const byId = new Map(taxonomy.nodes.map((node) => [node.id, node]));
    for (const node of taxonomy.nodes) {
      for (const relation of node.relations) {
        const inverse = relation.type === "broader_than"
          ? "narrower_than"
          : relation.type === "narrower_than"
            ? "broader_than"
            : relation.type === "related_to" || relation.type === "incompatible_with"
              ? relation.type
              : null;
        if (!inverse) continue;
        expect(byId.get(relation.targetId)?.relations).toContainEqual({
          type: inverse,
          targetId: node.id,
        });
      }
    }
    assertBroaderGraphIsAcyclic(taxonomy.nodes);
  });

  it("allows only identity and explicit upward roll-up, never downward or sideways inference", () => {
    const version = PINNED_CAPABILITY_TAXONOMY_VERSION;
    expect(canRollUpEvidence("engineering.testing.unit", "engineering.testing", version)).toBe(true);
    expect(canRollUpEvidence("engineering.testing.integration", "engineering.testing", version)).toBe(true);
    expect(canRollUpEvidence("engineering.testing.unit", "engineering.testing.unit", version)).toBe(true);
    expect(canRollUpEvidence("engineering.testing", "engineering.testing.unit", version)).toBe(false);
    expect(canRollUpEvidence("engineering.testing.unit", "engineering.testing.integration", version)).toBe(false);
    expect(canRollUpEvidence("engineering.testing.integration", "engineering.testing.unit", version)).toBe(false);
    expect(canRollUpEvidence("web.framework.nextjs", "web.framework.react", version)).toBe(false);
    expect(canRollUpEvidence("missing", "missing", version)).toBe(false);
  });

  it("rejects missing inverse, asymmetric, cyclic, and non-hierarchical roll-up counterexamples", () => {
    expect(() => defineCapabilityTaxonomy(fixtureTaxonomy([
      fixtureNode("capability.alpha", [{ type: "broader_than", targetId: "capability.beta" }]),
      fixtureNode("capability.beta"),
    ]))).toThrow(/missing its narrower_than counterpart/);

    for (const type of ["related_to", "incompatible_with"] as const) {
      expect(() => defineCapabilityTaxonomy(fixtureTaxonomy([
        fixtureNode("capability.alpha", [{ type, targetId: "capability.beta" }]),
        fixtureNode("capability.beta"),
      ]))).toThrow(new RegExp(`missing its ${type} counterpart`));
    }

    expect(() => defineCapabilityTaxonomy(fixtureTaxonomy([
      fixtureNode("capability.alpha", [
        { type: "broader_than", targetId: "capability.beta" },
        { type: "narrower_than", targetId: "capability.gamma" },
      ]),
      fixtureNode("capability.beta", [
        { type: "narrower_than", targetId: "capability.alpha" },
        { type: "broader_than", targetId: "capability.gamma" },
      ]),
      fixtureNode("capability.gamma", [
        { type: "narrower_than", targetId: "capability.beta" },
        { type: "broader_than", targetId: "capability.alpha" },
      ]),
    ]))).toThrow(/hierarchy cycle detected/);

    expect(() => defineCapabilityTaxonomy(fixtureTaxonomy([
      fixtureNode("capability.alpha", [], [], ["capability.beta"]),
      fixtureNode("capability.beta"),
    ]))).toThrow(/must follow an inverse narrower\/broader relation/);
  });

  it("accepts symmetric incompatibility and directed evidence requirements", () => {
    expect(() => defineCapabilityTaxonomy(fixtureTaxonomy([
      fixtureNode("capability.alpha", [
        { type: "incompatible_with", targetId: "capability.beta" },
        { type: "evidence_requires", targetId: "capability.gamma" },
      ]),
      fixtureNode("capability.beta", [{ type: "incompatible_with", targetId: "capability.alpha" }]),
      fixtureNode("capability.gamma"),
    ]))).not.toThrow();
  });
});

describe("immutable version history and evidence policies", () => {
  it("deeply freezes the registry, every completed version, and every nested policy", () => {
    expectDeeplyFrozen(CAPABILITY_TAXONOMY_VERSIONS);
    const taxonomy = getPinnedCapabilityTaxonomy();
    expect(taxonomy.version).toBe(PINNED_CAPABILITY_TAXONOMY_VERSION);
    expect(Reflect.set(taxonomy, "version", "future.1")).toBe(false);
    expect(Reflect.set(taxonomy.nodes[0].labels, "en", "Changed")).toBe(false);
    expect(() => (taxonomy.nodes as CapabilityNode[]).push(taxonomy.nodes[0])).toThrow();
    expect(getCapabilityTaxonomyVersion(taxonomy.version)).toBe(taxonomy);
    expect(() => getCapabilityTaxonomyVersion("future.unknown")).toThrow(/Unknown capability taxonomy version/);
  });

  it("clones caller-owned definitions before freezing a completed version", () => {
    const sourceNode = fixtureNode("capability.original", [], ["original"]);
    const taxonomy = defineCapabilityTaxonomy(fixtureTaxonomy([sourceNode]));
    (sourceNode.labels as { en: string; ar: string }).en = "Mutated source";
    (sourceNode.aliases as string[]).push("mutated alias");
    expect(taxonomy.nodes[0].labels.en).toBe("English capability.original");
    expect(taxonomy.nodes[0].aliases).toEqual(["original"]);
  });

  it("classifies every accepted detector signal as exactly conclusive or non-conclusive", () => {
    const taxonomy = getPinnedCapabilityTaxonomy();
    for (const node of taxonomy.nodes) {
      const conclusive = new Set(node.evidencePolicy.conclusiveSignalClasses);
      const nonConclusive = new Set(node.evidencePolicy.nonConclusiveSignalClasses);
      for (const signalClass of node.signalClasses) {
        expect(Number(conclusive.has(signalClass)) + Number(nonConclusive.has(signalClass))).toBe(1);
      }
      expect(node.evidencePolicy.weakSignalMaximumEvidenceLevel).toBe("limited");
      expect(node.evidencePolicy.absentEvidenceLevel).toBe("insufficient");
      for (const weakSignal of ["dependency", "configuration", "documentation", "generated", "trivial"] as const) {
        expect(nonConclusive.has(weakSignal)).toBe(true);
      }
    }

    const ciCd = getCapabilityNode(CI_CD_CAPABILITY_ID, taxonomy.version);
    expect(ciCd?.detectorIds).toContain(GITHUB_ACTIONS_MEANINGFUL_DETECTOR_ID);
    expect(ciCd?.evidencePolicy.detectorEvidenceRules).toContainEqual({
      detectorId: GITHUB_ACTIONS_MEANINGFUL_DETECTOR_ID,
      requirement: "meaningful_github_actions_workflow",
    });
  });
});

describe("GitHub Actions CI/CD evidence semantics", () => {
  it("maps a parsed workflow only when triggers, jobs, runners, and executable steps/actions are present", () => {
    const workflows = [
      {
        on: { push: null },
        jobs: {
          build: {
            "runs-on": "ubuntu-latest",
            steps: [{ uses: "actions/checkout@v4" }],
          },
        },
      },
      {
        on: ["push", "pull_request"],
        jobs: {
          test: {
            "runs-on": ["self-hosted", "linux"],
            steps: [{ run: "npm test" }],
          },
        },
      },
    ];

    for (const workflow of workflows) {
      expect(isMeaningfulGitHubActionsWorkflow(workflow)).toBe(true);
      expect(classifyGitHubActionsEvidence({ source: "parsed_workflow", workflow })).toEqual({
        capabilityId: CI_CD_CAPABILITY_ID,
        detectorId: GITHUB_ACTIONS_MEANINGFUL_DETECTOR_ID,
        signalClass: "architecture",
        conclusive: true,
        evidenceLevelCeiling: null,
        reason: "meaningful_executable_workflow",
      });
    }
  });

  it("keeps empty or structurally incomplete parsed workflows non-conclusive", () => {
    const counterexamples: unknown[] = [
      null,
      {},
      { on: "push" },
      { on: {}, jobs: {} },
      { on: "push", jobs: {} },
      { on: "push", jobs: { build: { steps: [{ run: "npm test" }] } } },
      { on: "push", jobs: { build: { "runs-on": "ubuntu-latest" } } },
      { on: "push", jobs: { build: { "runs-on": "ubuntu-latest", steps: [] } } },
      { on: "push", jobs: { build: { "runs-on": "ubuntu-latest", steps: [{ name: "No action" }] } } },
      { on: "push", jobs: { build: { "runs-on": "ubuntu-latest", steps: [{ run: "   " }] } } },
    ];

    for (const workflow of counterexamples) {
      expect(isMeaningfulGitHubActionsWorkflow(workflow)).toBe(false);
      expect(classifyGitHubActionsEvidence({ source: "parsed_workflow", workflow })).toEqual({
        capabilityId: null,
        detectorId: null,
        signalClass: "configuration",
        conclusive: false,
        evidenceLevelCeiling: "limited",
        reason: "workflow_structure_not_meaningful",
      });
    }
  });

  it("does not convert filenames, documentation, dependencies, or the words GitHub Actions into CI/CD", () => {
    const weakInputs: readonly GitHubActionsEvidenceInput[] = [
      { source: "file_presence" },
      { source: "documentation" },
      { source: "dependency" },
    ];
    const expected = [
      ["configuration", "file_presence_only"],
      ["documentation", "documentation_only"],
      ["dependency", "dependency_only"],
    ] as const;

    weakInputs.forEach((input, index) => {
      const decision = classifyGitHubActionsEvidence(input);
      expect(decision.capabilityId).toBeNull();
      expect(decision.detectorId).toBeNull();
      expect(decision.signalClass).toBe(expected[index][0]);
      expect(decision.reason).toBe(expected[index][1]);
      expect(decision.conclusive).toBe(false);
      expect(decision.evidenceLevelCeiling).toBe("limited");
    });
    expect(resolveCapabilityAlias("GitHub Actions", PINNED_CAPABILITY_TAXONOMY_VERSION)).toBeNull();
    expect(resolveCapabilityAlias(".github/workflows/ci.yml", PINNED_CAPABILITY_TAXONOMY_VERSION)).toBeNull();
  });
});

describe("Feature: codeproof-audit-remediation, Property 4: Taxonomy aliases resolve uniquely and relationships remain valid", () => {
  // **Validates: Requirements 2.1, 2.9, 2.13, 18.1, 18.2**
  it("holds across 256 deterministic alias, relationship, version, and workflow cases", () => {
    const generatedCaseCount = 256;
    const taxonomy = getPinnedCapabilityTaxonomy();
    const serializedBefore = JSON.stringify(CAPABILITY_TAXONOMY_VERSIONS);
    const aliases = taxonomy.nodes.flatMap((node) => (
      [node.id, node.labels.en, node.labels.ar, ...node.aliases]
        .map((alias) => ({ alias, capabilityId: node.id }))
    ));
    const normalizedOwners = new Map<string, string>();

    for (const { alias, capabilityId } of aliases) {
      const normalized = normalizeCapabilityAlias(alias);
      const existing = normalizedOwners.get(normalized);
      expect(existing === undefined || existing === capabilityId).toBe(true);
      normalizedOwners.set(normalized, capabilityId);
    }

    for (let index = 0; index < generatedCaseCount; index += 1) {
      const sample = aliases[index % aliases.length];
      const whitespace = index % 3 === 0 ? "\u00a0\n" : index % 3 === 1 ? "\t" : "  ";
      const cased = index % 2 === 0 ? sample.alias.toLocaleUpperCase("en-US") : sample.alias.toLocaleLowerCase("en-US");
      const expanded = cased.replace(/\s+/gu, index % 4 === 0 ? "   " : " ");
      const decoratedAlias = `${whitespace}${expanded}${whitespace}`;
      expect(resolveCapabilityAlias(decoratedAlias, taxonomy.version)?.id).toBe(sample.capabilityId);

      const node = taxonomy.nodes[index % taxonomy.nodes.length];
      const relation = node.relations[index % Math.max(node.relations.length, 1)];
      if (relation) {
        const target = getCapabilityNode(relation.targetId, taxonomy.version);
        expect(target).not.toBeNull();
        if (relation.type === "broader_than") {
          expect(target?.relations).toContainEqual({ type: "narrower_than", targetId: node.id });
        } else if (relation.type === "narrower_than") {
          expect(target?.relations).toContainEqual({ type: "broader_than", targetId: node.id });
        } else if (relation.type === "incompatible_with") {
          expect(target?.relations).toContainEqual({ type: "incompatible_with", targetId: node.id });
        }
      }

      const meaningfulWorkflow = {
        on: index % 2 === 0 ? { push: null } : ["push", "pull_request"],
        jobs: {
          [`job_${index}`]: {
            "runs-on": index % 2 === 0 ? "ubuntu-latest" : ["self-hosted", "linux"],
            steps: index % 3 === 0
              ? [{ uses: `actions/checkout@v${(index % 4) + 1}` }]
              : [{ run: `npm run test:${index}` }],
          },
        },
      };
      expect(classifyGitHubActionsEvidence({ source: "parsed_workflow", workflow: meaningfulWorkflow })).toMatchObject({
        capabilityId: CI_CD_CAPABILITY_ID,
        detectorId: GITHUB_ACTIONS_MEANINGFUL_DETECTOR_ID,
        conclusive: true,
      });

      const weakInput: GitHubActionsEvidenceInput = index % 4 === 0
        ? { source: "file_presence" }
        : index % 4 === 1
          ? { source: "documentation" }
          : index % 4 === 2
            ? { source: "dependency" }
            : { source: "parsed_workflow", workflow: { on: "push", jobs: {} } };
      expect(classifyGitHubActionsEvidence(weakInput)).toMatchObject({
        capabilityId: null,
        detectorId: null,
        conclusive: false,
        evidenceLevelCeiling: "limited",
      });

      expect(resolveCapabilityAlias("Testing", taxonomy.version)?.id).toBe("engineering.testing");
      expect(resolveCapabilityAlias("Automated testing", taxonomy.version)?.id).toBe("engineering.testing");
      expect(resolveCapabilityAlias("unit testing", taxonomy.version)?.id).toBe("engineering.testing.unit");
      expect(resolveCapabilityAlias("integration testing", taxonomy.version)?.id).toBe("engineering.testing.integration");
      expect(canRollUpEvidence("engineering.testing.unit", "engineering.testing", taxonomy.version)).toBe(true);
      expect(canRollUpEvidence("engineering.testing.unit", "engineering.testing.integration", taxonomy.version)).toBe(false);
      expect(getCapabilityTaxonomyVersion(taxonomy.version)).toBe(taxonomy);
    }

    assertBroaderGraphIsAcyclic(taxonomy.nodes);
    expect(JSON.stringify(CAPABILITY_TAXONOMY_VERSIONS)).toBe(serializedBefore);
    expectDeeplyFrozen(CAPABILITY_TAXONOMY_VERSIONS);
  });
});
