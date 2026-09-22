import type {
  CanonicalEvidenceLevel,
  DetectorSignalClass,
} from "@/types/remediation";

export const CAPABILITY_RELATION_TYPES = [
  "broader_than",
  "narrower_than",
  "related_to",
  "evidence_requires",
  "incompatible_with",
] as const;
export type CapabilityRelationType = (typeof CAPABILITY_RELATION_TYPES)[number];

export const CAPABILITY_CATEGORIES = [
  "language",
  "framework",
  "library",
  "database",
  "testing",
  "security",
  "architecture",
  "devops",
  "domain",
] as const;
export type CapabilityCategory = (typeof CAPABILITY_CATEGORIES)[number];

const DETECTOR_SIGNAL_CLASSES = [
  "implementation",
  "test",
  "architecture",
  "dependency",
  "configuration",
  "documentation",
  "generated",
  "trivial",
] as const satisfies readonly DetectorSignalClass[];

const CONCLUSIVE_SIGNAL_CLASSES = [
  "implementation",
  "test",
  "architecture",
] as const satisfies readonly DetectorSignalClass[];

const NON_CONCLUSIVE_SIGNAL_CLASSES = [
  "dependency",
  "configuration",
  "documentation",
  "generated",
  "trivial",
] as const satisfies readonly DetectorSignalClass[];

export const GITHUB_ACTIONS_MEANINGFUL_DETECTOR_ID = "workflow.github-actions.meaningful";
export const CI_CD_CAPABILITY_ID = "delivery.ci_cd";

export interface CapabilityRelation {
  readonly type: CapabilityRelationType;
  readonly targetId: string;
}

export interface DetectorEvidenceRule {
  readonly detectorId: string;
  readonly requirement: "meaningful_github_actions_workflow";
}

export interface CapabilityEvidencePolicy {
  readonly conclusiveSignalClasses: readonly DetectorSignalClass[];
  readonly nonConclusiveSignalClasses: readonly DetectorSignalClass[];
  readonly weakSignalMaximumEvidenceLevel: Extract<CanonicalEvidenceLevel, "limited">;
  readonly absentEvidenceLevel: Extract<CanonicalEvidenceLevel, "insufficient">;
  readonly detectorEvidenceRules: readonly DetectorEvidenceRule[];
}

export interface CapabilityNode {
  readonly id: string;
  readonly labels: Readonly<{ en: string; ar: string }>;
  readonly aliases: readonly string[];
  readonly category: CapabilityCategory;
  readonly signalClasses: readonly DetectorSignalClass[];
  readonly evidencePolicy: CapabilityEvidencePolicy;
  readonly relations: readonly CapabilityRelation[];
  readonly detectorIds: readonly string[];
  /**
   * Explicit evidence-flow edges. These are deliberately separate from semantic
   * hierarchy relations: only listed targets may receive rolled-up evidence.
   */
  readonly rollUpTo: readonly string[];
}

export interface CapabilityTaxonomyVersion {
  readonly version: string;
  readonly effectiveAt: string;
  readonly evidencePolicyVersion: string;
  readonly nodes: readonly CapabilityNode[];
}

export interface CapabilityTaxonomyDefinition {
  readonly version: string;
  readonly effectiveAt: string;
  readonly evidencePolicyVersion: string;
  readonly nodes: readonly CapabilityNode[];
}

const STANDARD_EVIDENCE_POLICY: CapabilityEvidencePolicy = {
  conclusiveSignalClasses: CONCLUSIVE_SIGNAL_CLASSES,
  nonConclusiveSignalClasses: NON_CONCLUSIVE_SIGNAL_CLASSES,
  weakSignalMaximumEvidenceLevel: "limited",
  absentEvidenceLevel: "insufficient",
  detectorEvidenceRules: [],
};

const CI_CD_EVIDENCE_POLICY: CapabilityEvidencePolicy = {
  ...STANDARD_EVIDENCE_POLICY,
  detectorEvidenceRules: [{
    detectorId: GITHUB_ACTIONS_MEANINGFUL_DETECTOR_ID,
    requirement: "meaningful_github_actions_workflow",
  }],
};

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

function cloneNode(node: CapabilityNode): CapabilityNode {
  return {
    id: node.id,
    labels: { ...node.labels },
    aliases: [...node.aliases],
    category: node.category,
    signalClasses: [...node.signalClasses],
    evidencePolicy: {
      conclusiveSignalClasses: [...node.evidencePolicy.conclusiveSignalClasses],
      nonConclusiveSignalClasses: [...node.evidencePolicy.nonConclusiveSignalClasses],
      weakSignalMaximumEvidenceLevel: node.evidencePolicy.weakSignalMaximumEvidenceLevel,
      absentEvidenceLevel: node.evidencePolicy.absentEvidenceLevel,
      detectorEvidenceRules: node.evidencePolicy.detectorEvidenceRules.map((rule) => ({ ...rule })),
    },
    relations: node.relations.map((relation) => ({ ...relation })),
    detectorIds: [...node.detectorIds],
    rollUpTo: [...node.rollUpTo],
  };
}

/** Unicode NFKC, trim, whitespace collapse, then locale-independent case folding. */
export function normalizeCapabilityAlias(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

function hasRelation(
  nodesById: ReadonlyMap<string, CapabilityNode>,
  sourceId: string,
  type: CapabilityRelationType,
  targetId: string,
): boolean {
  return nodesById.get(sourceId)?.relations.some(
    (relation) => relation.type === type && relation.targetId === targetId,
  ) ?? false;
}

function assertAcyclic(
  nodes: readonly CapabilityNode[],
  adjacent: (node: CapabilityNode) => readonly string[],
  description: string,
): void {
  const state = new Map<string, "visiting" | "visited">();
  const visit = (nodeId: string, path: readonly string[]): void => {
    const current = state.get(nodeId);
    if (current === "visiting") {
      throw new Error(`${description} cycle detected: ${[...path, nodeId].join(" -> ")}`);
    }
    if (current === "visited") return;

    state.set(nodeId, "visiting");
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node) throw new Error(`Unknown capability node "${nodeId}"`);
    for (const targetId of adjacent(node)) visit(targetId, [...path, nodeId]);
    state.set(nodeId, "visited");
  };

  for (const node of nodes) visit(node.id, []);
}

function assertUniqueStrings(values: readonly string[], description: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value.trim()) throw new Error(`${description} contains an empty value`);
    if (seen.has(value)) throw new Error(`${description} contains duplicate "${value}"`);
    seen.add(value);
  }
}

function validateTaxonomy(taxonomy: CapabilityTaxonomyVersion): void {
  if (!taxonomy.version.trim()) throw new Error("Taxonomy version must not be empty");
  if (!taxonomy.evidencePolicyVersion.trim()) throw new Error("Evidence policy version must not be empty");
  if (Number.isNaN(Date.parse(taxonomy.effectiveAt))) throw new Error("Taxonomy effectiveAt must be an ISO date-time");
  if (taxonomy.nodes.length === 0) throw new Error("Taxonomy must contain at least one capability node");

  const nodesById = new Map<string, CapabilityNode>();
  for (const node of taxonomy.nodes) {
    if (!node.id.trim()) throw new Error("Capability IDs must not be empty");
    if (nodesById.has(node.id)) throw new Error(`Duplicate capability ID "${node.id}"`);
    if (!node.labels.en.trim() || !node.labels.ar.trim()) {
      throw new Error(`Capability "${node.id}" must have non-empty English and Arabic labels`);
    }
    nodesById.set(node.id, node);
  }

  const aliasOwners = new Map<string, string>();
  for (const node of taxonomy.nodes) {
    const aliases = [node.id, node.labels.en, node.labels.ar, ...node.aliases];
    for (const alias of aliases) {
      const normalized = normalizeCapabilityAlias(alias);
      if (!normalized) throw new Error(`Capability "${node.id}" contains an empty alias`);
      const owner = aliasOwners.get(normalized);
      if (owner && owner !== node.id) {
        throw new Error(`Normalized alias "${normalized}" resolves to both "${owner}" and "${node.id}"`);
      }
      aliasOwners.set(normalized, node.id);
    }

    assertUniqueStrings(node.detectorIds, `Detector IDs for "${node.id}"`);
    assertUniqueStrings(node.rollUpTo, `Roll-up targets for "${node.id}"`);
    assertUniqueStrings(node.signalClasses, `Signal classes for "${node.id}"`);

    const acceptedSignalClasses = new Set(node.signalClasses);
    const conclusive = new Set(node.evidencePolicy.conclusiveSignalClasses);
    const nonConclusive = new Set(node.evidencePolicy.nonConclusiveSignalClasses);
    for (const signalClass of acceptedSignalClasses) {
      if (!(DETECTOR_SIGNAL_CLASSES as readonly string[]).includes(signalClass)) {
        throw new Error(`Capability "${node.id}" has unknown signal class "${signalClass}"`);
      }
      if (conclusive.has(signalClass) === nonConclusive.has(signalClass)) {
        throw new Error(`Signal class "${signalClass}" must have exactly one evidence policy in "${node.id}"`);
      }
    }
    for (const signalClass of [...conclusive, ...nonConclusive]) {
      if (!acceptedSignalClasses.has(signalClass)) {
        throw new Error(`Evidence policy for "${node.id}" references unaccepted signal class "${signalClass}"`);
      }
    }
    for (const rule of node.evidencePolicy.detectorEvidenceRules) {
      if (!node.detectorIds.includes(rule.detectorId)) {
        throw new Error(`Evidence rule for "${node.id}" references undeclared detector "${rule.detectorId}"`);
      }
    }

    const relationKeys = node.relations.map((relation) => `${relation.type}:${relation.targetId}`);
    assertUniqueStrings(relationKeys, `Relations for "${node.id}"`);
    for (const relation of node.relations) {
      if (!nodesById.has(relation.targetId)) {
        throw new Error(`Capability "${node.id}" relates to unknown target "${relation.targetId}"`);
      }
      if (relation.targetId === node.id) throw new Error(`Capability "${node.id}" cannot relate to itself`);
    }
  }

  for (const node of taxonomy.nodes) {
    for (const relation of node.relations) {
      const inverse = relation.type === "broader_than"
        ? "narrower_than"
        : relation.type === "narrower_than"
          ? "broader_than"
          : relation.type === "related_to" || relation.type === "incompatible_with"
            ? relation.type
            : null;
      if (inverse && !hasRelation(nodesById, relation.targetId, inverse, node.id)) {
        throw new Error(`Relation ${node.id} ${relation.type} ${relation.targetId} is missing its ${inverse} counterpart`);
      }
      if (
        relation.type === "related_to"
        && hasRelation(nodesById, node.id, "incompatible_with", relation.targetId)
      ) {
        throw new Error(`Capabilities "${node.id}" and "${relation.targetId}" cannot be both related and incompatible`);
      }
    }

    for (const targetId of node.rollUpTo) {
      if (!nodesById.has(targetId)) {
        throw new Error(`Capability "${node.id}" rolls up to unknown target "${targetId}"`);
      }
      if (
        !hasRelation(nodesById, node.id, "narrower_than", targetId)
        || !hasRelation(nodesById, targetId, "broader_than", node.id)
      ) {
        throw new Error(`Roll-up ${node.id} -> ${targetId} must follow an inverse narrower/broader relation`);
      }
    }
  }

  assertAcyclic(
    taxonomy.nodes,
    (node) => node.relations
      .filter((relation) => relation.type === "broader_than")
      .map((relation) => relation.targetId),
    "Broader/narrower hierarchy",
  );
  assertAcyclic(taxonomy.nodes, (node) => node.rollUpTo, "Evidence roll-up");
}

/**
 * Defines, validates, clones, and deeply freezes one immutable taxonomy version.
 * Invalid aliases or graph relationships therefore fail while the source module loads.
 */
export function defineCapabilityTaxonomy(
  definition: CapabilityTaxonomyDefinition,
): CapabilityTaxonomyVersion {
  const taxonomy: CapabilityTaxonomyVersion = {
    version: definition.version,
    effectiveAt: definition.effectiveAt,
    evidencePolicyVersion: definition.evidencePolicyVersion,
    nodes: definition.nodes.map(cloneNode),
  };
  validateTaxonomy(taxonomy);
  return deepFreeze(taxonomy);
}

const FRONTEND_FRAMEWORK_IDS = [
  "web.framework.react",
  "web.framework.nextjs",
  "web.framework.vue",
  "web.framework.nuxt",
  "web.framework.angular",
  "web.framework.svelte",
] as const;

const BACKEND_FRAMEWORK_IDS = [
  "web.framework.express",
  "web.framework.fastify",
  "web.framework.nestjs",
  "web.framework.django",
  "web.framework.fastapi",
  "web.framework.flask",
  "web.framework.laravel",
  "web.framework.spring",
] as const;

const TAXONOMY_2025_1 = defineCapabilityTaxonomy({
  version: "2025.1",
  effectiveAt: "2025-02-03T00:00:00.000Z",
  evidencePolicyVersion: "evidence-policy.2025.1",
  nodes: [
    {
      id: "engineering.testing",
      labels: { en: "Testing", ar: "اختبار البرمجيات" },
      aliases: ["Testing", "Automated testing", "automated tests"],
      category: "testing",
      signalClasses: DETECTOR_SIGNAL_CLASSES,
      evidencePolicy: STANDARD_EVIDENCE_POLICY,
      relations: [
        { type: "broader_than", targetId: "engineering.testing.unit" },
        { type: "broader_than", targetId: "engineering.testing.integration" },
        { type: "related_to", targetId: CI_CD_CAPABILITY_ID },
      ],
      detectorIds: ["test.executable-specification", "test.framework-usage"],
      rollUpTo: [],
    },
    {
      id: "engineering.testing.unit",
      labels: { en: "Unit testing", ar: "اختبار الوحدات" },
      aliases: ["unit", "unit testing", "unit tests"],
      category: "testing",
      signalClasses: DETECTOR_SIGNAL_CLASSES,
      evidencePolicy: STANDARD_EVIDENCE_POLICY,
      relations: [{ type: "narrower_than", targetId: "engineering.testing" }],
      detectorIds: ["test.unit.executable-specification"],
      rollUpTo: ["engineering.testing"],
    },
    {
      id: "engineering.testing.integration",
      labels: { en: "Integration testing", ar: "اختبار التكامل" },
      aliases: ["integration", "integration testing", "integration tests"],
      category: "testing",
      signalClasses: DETECTOR_SIGNAL_CLASSES,
      evidencePolicy: STANDARD_EVIDENCE_POLICY,
      relations: [{ type: "narrower_than", targetId: "engineering.testing" }],
      detectorIds: ["test.integration.executable-specification"],
      rollUpTo: ["engineering.testing"],
    },
    {
      id: CI_CD_CAPABILITY_ID,
      labels: { en: "CI/CD", ar: "التكامل والتسليم المستمران" },
      aliases: ["CI CD", "continuous integration", "continuous delivery", "continuous integration and delivery"],
      category: "devops",
      signalClasses: DETECTOR_SIGNAL_CLASSES,
      evidencePolicy: CI_CD_EVIDENCE_POLICY,
      relations: [{ type: "related_to", targetId: "engineering.testing" }],
      detectorIds: [GITHUB_ACTIONS_MEANINGFUL_DETECTOR_ID, "delivery.pipeline.implementation"],
      rollUpTo: [],
    },
    {
      id: "web.frontend",
      labels: { en: "Frontend development", ar: "تطوير الواجهات الأمامية" },
      aliases: ["frontend", "front-end", "frontend development"],
      category: "architecture",
      signalClasses: DETECTOR_SIGNAL_CLASSES,
      evidencePolicy: STANDARD_EVIDENCE_POLICY,
      relations: FRONTEND_FRAMEWORK_IDS.map((targetId) => ({ type: "broader_than" as const, targetId })),
      detectorIds: ["pattern.frontend-application"],
      rollUpTo: [],
    },
    {
      id: "web.backend_api",
      labels: { en: "Backend API", ar: "واجهة برمجة تطبيقات خلفية" },
      aliases: ["backend", "backend API", "backend APIs", "HTTP API"],
      category: "architecture",
      signalClasses: DETECTOR_SIGNAL_CLASSES,
      evidencePolicy: STANDARD_EVIDENCE_POLICY,
      relations: BACKEND_FRAMEWORK_IDS.map((targetId) => ({ type: "broader_than" as const, targetId })),
      detectorIds: ["pattern.http-api"],
      rollUpTo: [],
    },
    {
      id: "web.framework.react",
      labels: { en: "React", ar: "رياكت" },
      aliases: ["React.js", "ReactJS"],
      category: "framework",
      signalClasses: DETECTOR_SIGNAL_CLASSES,
      evidencePolicy: STANDARD_EVIDENCE_POLICY,
      relations: [
        { type: "narrower_than", targetId: "web.frontend" },
        { type: "related_to", targetId: "web.framework.nextjs" },
      ],
      detectorIds: ["technology.react"],
      rollUpTo: ["web.frontend"],
    },
    {
      id: "web.framework.nextjs",
      labels: { en: "Next.js", ar: "نكست جي إس" },
      aliases: ["next", "nextjs"],
      category: "framework",
      signalClasses: DETECTOR_SIGNAL_CLASSES,
      evidencePolicy: STANDARD_EVIDENCE_POLICY,
      relations: [
        { type: "narrower_than", targetId: "web.frontend" },
        { type: "related_to", targetId: "web.framework.react" },
      ],
      detectorIds: ["technology.nextjs"],
      rollUpTo: ["web.frontend"],
    },
    {
      id: "web.framework.vue",
      labels: { en: "Vue", ar: "فيو" },
      aliases: ["Vue.js", "VueJS"],
      category: "framework",
      signalClasses: DETECTOR_SIGNAL_CLASSES,
      evidencePolicy: STANDARD_EVIDENCE_POLICY,
      relations: [
        { type: "narrower_than", targetId: "web.frontend" },
        { type: "related_to", targetId: "web.framework.nuxt" },
      ],
      detectorIds: ["technology.vue"],
      rollUpTo: ["web.frontend"],
    },
    {
      id: "web.framework.nuxt",
      labels: { en: "Nuxt", ar: "نكست" },
      aliases: ["Nuxt.js", "NuxtJS"],
      category: "framework",
      signalClasses: DETECTOR_SIGNAL_CLASSES,
      evidencePolicy: STANDARD_EVIDENCE_POLICY,
      relations: [
        { type: "narrower_than", targetId: "web.frontend" },
        { type: "related_to", targetId: "web.framework.vue" },
      ],
      detectorIds: ["technology.nuxt"],
      rollUpTo: ["web.frontend"],
    },
    {
      id: "web.framework.angular",
      labels: { en: "Angular", ar: "أنغولار" },
      aliases: ["Angular framework"],
      category: "framework",
      signalClasses: DETECTOR_SIGNAL_CLASSES,
      evidencePolicy: STANDARD_EVIDENCE_POLICY,
      relations: [{ type: "narrower_than", targetId: "web.frontend" }],
      detectorIds: ["technology.angular"],
      rollUpTo: ["web.frontend"],
    },
    {
      id: "web.framework.svelte",
      labels: { en: "Svelte", ar: "سفيلت" },
      aliases: ["Svelte framework"],
      category: "framework",
      signalClasses: DETECTOR_SIGNAL_CLASSES,
      evidencePolicy: STANDARD_EVIDENCE_POLICY,
      relations: [{ type: "narrower_than", targetId: "web.frontend" }],
      detectorIds: ["technology.svelte"],
      rollUpTo: ["web.frontend"],
    },
    {
      id: "web.framework.express",
      labels: { en: "Express", ar: "إكسبريس" },
      aliases: ["Express.js", "ExpressJS"],
      category: "framework",
      signalClasses: DETECTOR_SIGNAL_CLASSES,
      evidencePolicy: STANDARD_EVIDENCE_POLICY,
      relations: [{ type: "narrower_than", targetId: "web.backend_api" }],
      detectorIds: ["technology.express"],
      rollUpTo: ["web.backend_api"],
    },
    {
      id: "web.framework.fastify",
      labels: { en: "Fastify", ar: "فاستيفاي" },
      aliases: ["Fastify framework"],
      category: "framework",
      signalClasses: DETECTOR_SIGNAL_CLASSES,
      evidencePolicy: STANDARD_EVIDENCE_POLICY,
      relations: [{ type: "narrower_than", targetId: "web.backend_api" }],
      detectorIds: ["technology.fastify"],
      rollUpTo: ["web.backend_api"],
    },
    {
      id: "web.framework.nestjs",
      labels: { en: "NestJS", ar: "نست جي إس" },
      aliases: ["Nest", "Nest.js"],
      category: "framework",
      signalClasses: DETECTOR_SIGNAL_CLASSES,
      evidencePolicy: STANDARD_EVIDENCE_POLICY,
      relations: [{ type: "narrower_than", targetId: "web.backend_api" }],
      detectorIds: ["technology.nestjs"],
      rollUpTo: ["web.backend_api"],
    },
    {
      id: "web.framework.django",
      labels: { en: "Django", ar: "جانغو" },
      aliases: ["Django framework"],
      category: "framework",
      signalClasses: DETECTOR_SIGNAL_CLASSES,
      evidencePolicy: STANDARD_EVIDENCE_POLICY,
      relations: [{ type: "narrower_than", targetId: "web.backend_api" }],
      detectorIds: ["technology.django"],
      rollUpTo: ["web.backend_api"],
    },
    {
      id: "web.framework.fastapi",
      labels: { en: "FastAPI", ar: "فاست API" },
      aliases: ["Fast API"],
      category: "framework",
      signalClasses: DETECTOR_SIGNAL_CLASSES,
      evidencePolicy: STANDARD_EVIDENCE_POLICY,
      relations: [{ type: "narrower_than", targetId: "web.backend_api" }],
      detectorIds: ["technology.fastapi"],
      rollUpTo: ["web.backend_api"],
    },
    {
      id: "web.framework.flask",
      labels: { en: "Flask", ar: "فلاسك" },
      aliases: ["Flask framework"],
      category: "framework",
      signalClasses: DETECTOR_SIGNAL_CLASSES,
      evidencePolicy: STANDARD_EVIDENCE_POLICY,
      relations: [{ type: "narrower_than", targetId: "web.backend_api" }],
      detectorIds: ["framework.flask.route", "framework.flask.application-handler"],
      rollUpTo: ["web.backend_api"],
    },
    {
      id: "web.framework.laravel",
      labels: { en: "Laravel", ar: "لارافيل" },
      aliases: ["Laravel framework"],
      category: "framework",
      signalClasses: DETECTOR_SIGNAL_CLASSES,
      evidencePolicy: STANDARD_EVIDENCE_POLICY,
      relations: [{ type: "narrower_than", targetId: "web.backend_api" }],
      detectorIds: ["technology.laravel"],
      rollUpTo: ["web.backend_api"],
    },
    {
      id: "web.framework.spring",
      labels: { en: "Spring", ar: "سبرينغ" },
      aliases: ["Spring Framework", "Spring Boot"],
      category: "framework",
      signalClasses: DETECTOR_SIGNAL_CLASSES,
      evidencePolicy: STANDARD_EVIDENCE_POLICY,
      relations: [{ type: "narrower_than", targetId: "web.backend_api" }],
      detectorIds: ["technology.spring"],
      rollUpTo: ["web.backend_api"],
    },
    {
      id: "language.typescript",
      labels: { en: "TypeScript", ar: "تايب سكريبت" },
      aliases: ["ts"],
      category: "language",
      signalClasses: DETECTOR_SIGNAL_CLASSES,
      evidencePolicy: STANDARD_EVIDENCE_POLICY,
      relations: [],
      detectorIds: ["language.archive-statistics", "language.typescript.syntax"],
      rollUpTo: [],
    },
    {
      id: "data.database.postgresql",
      labels: { en: "PostgreSQL", ar: "بوستغري إس كيو إل" },
      aliases: ["postgres", "postgre sql"],
      category: "database",
      signalClasses: DETECTOR_SIGNAL_CLASSES,
      evidencePolicy: STANDARD_EVIDENCE_POLICY,
      relations: [],
      detectorIds: ["technology.postgresql"],
      rollUpTo: [],
    },
  ],
});

/** The version pinned by new analyses in this release. */
export const PINNED_CAPABILITY_TAXONOMY_VERSION = TAXONOMY_2025_1.version;
export const ACTIVE_CAPABILITY_TAXONOMY_VERSION = PINNED_CAPABILITY_TAXONOMY_VERSION;

/**
 * Completed analyses keep their version string and resolve through this immutable
 * history instead of being silently reinterpreted by a future active version.
 */
export const CAPABILITY_TAXONOMY_VERSIONS: Readonly<Record<string, CapabilityTaxonomyVersion>> = deepFreeze({
  [TAXONOMY_2025_1.version]: TAXONOMY_2025_1,
});

export function getCapabilityTaxonomyVersion(version: string): CapabilityTaxonomyVersion {
  const taxonomy = CAPABILITY_TAXONOMY_VERSIONS[version];
  if (!taxonomy) throw new RangeError(`Unknown capability taxonomy version "${version}"`);
  return taxonomy;
}

export function getPinnedCapabilityTaxonomy(): CapabilityTaxonomyVersion {
  return getCapabilityTaxonomyVersion(PINNED_CAPABILITY_TAXONOMY_VERSION);
}

export function resolveCapabilityAliasInTaxonomy(
  alias: string,
  taxonomy: CapabilityTaxonomyVersion,
): CapabilityNode | null {
  const normalized = normalizeCapabilityAlias(alias);
  if (!normalized) return null;
  return taxonomy.nodes.find((node) => [node.id, node.labels.en, node.labels.ar, ...node.aliases]
    .some((candidate) => normalizeCapabilityAlias(candidate) === normalized)) ?? null;
}

/** Version is required so completed analyses cannot accidentally use the active registry. */
export function resolveCapabilityAlias(
  alias: string,
  taxonomyVersion: string,
): CapabilityNode | null {
  return resolveCapabilityAliasInTaxonomy(alias, getCapabilityTaxonomyVersion(taxonomyVersion));
}

export function getCapabilityNode(
  capabilityId: string,
  taxonomyVersion: string,
): CapabilityNode | null {
  return getCapabilityTaxonomyVersion(taxonomyVersion).nodes.find((node) => node.id === capabilityId) ?? null;
}

/** Returns true only for identity or a path composed entirely of explicit upward roll-up edges. */
export function canRollUpEvidence(
  sourceCapabilityId: string,
  targetCapabilityId: string,
  taxonomyVersion: string,
): boolean {
  const taxonomy = getCapabilityTaxonomyVersion(taxonomyVersion);
  if (sourceCapabilityId === targetCapabilityId) {
    return taxonomy.nodes.some((node) => node.id === sourceCapabilityId);
  }

  const nodesById = new Map(taxonomy.nodes.map((node) => [node.id, node]));
  if (!nodesById.has(sourceCapabilityId) || !nodesById.has(targetCapabilityId)) return false;
  const pending = [...(nodesById.get(sourceCapabilityId)?.rollUpTo ?? [])];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const capabilityId = pending.shift();
    if (!capabilityId || visited.has(capabilityId)) continue;
    if (capabilityId === targetCapabilityId) return true;
    visited.add(capabilityId);
    pending.push(...(nodesById.get(capabilityId)?.rollUpTo ?? []));
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasMeaningfulTrigger(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((item) => typeof item === "string" && item.trim().length > 0);
  return isRecord(value) && Object.keys(value).length > 0;
}

function hasMeaningfulRunner(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  return Array.isArray(value) && value.some((item) => typeof item === "string" && item.trim().length > 0);
}

function isExecutableStep(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return [value.run, value.uses].some((command) => typeof command === "string" && command.trim().length > 0);
}

/**
 * A workflow is meaningful only when parsed structure proves a trigger and at
 * least one executable job with a runner and a run/action step.
 */
export function isMeaningfulGitHubActionsWorkflow(workflow: unknown): boolean {
  if (!isRecord(workflow) || !Object.prototype.hasOwnProperty.call(workflow, "on")) return false;
  if (!hasMeaningfulTrigger(workflow.on) || !isRecord(workflow.jobs)) return false;
  const jobs = Object.values(workflow.jobs);
  if (jobs.length === 0) return false;
  return jobs.some((job) => isRecord(job)
    && hasMeaningfulRunner(job["runs-on"])
    && Array.isArray(job.steps)
    && job.steps.length > 0
    && job.steps.some(isExecutableStep));
}

export type GitHubActionsEvidenceInput =
  | Readonly<{ source: "parsed_workflow"; workflow: unknown }>
  | Readonly<{ source: "file_presence" | "documentation" | "dependency" }>;

export interface GitHubActionsEvidenceDecision {
  readonly capabilityId: typeof CI_CD_CAPABILITY_ID | null;
  readonly detectorId: typeof GITHUB_ACTIONS_MEANINGFUL_DETECTOR_ID | null;
  readonly signalClass: DetectorSignalClass;
  readonly conclusive: boolean;
  readonly evidenceLevelCeiling: Extract<CanonicalEvidenceLevel, "limited"> | null;
  readonly reason:
    | "meaningful_executable_workflow"
    | "workflow_structure_not_meaningful"
    | "file_presence_only"
    | "documentation_only"
    | "dependency_only";
}

/**
 * Maps only meaningful parsed GitHub Actions workflow structure to CI/CD.
 * All weaker origins remain non-conclusive and do not resolve a capability.
 */
export function classifyGitHubActionsEvidence(
  input: GitHubActionsEvidenceInput,
): GitHubActionsEvidenceDecision {
  if (input.source === "parsed_workflow" && isMeaningfulGitHubActionsWorkflow(input.workflow)) {
    return {
      capabilityId: CI_CD_CAPABILITY_ID,
      detectorId: GITHUB_ACTIONS_MEANINGFUL_DETECTOR_ID,
      signalClass: "architecture",
      conclusive: true,
      evidenceLevelCeiling: null,
      reason: "meaningful_executable_workflow",
    };
  }

  const reason = input.source === "parsed_workflow"
    ? "workflow_structure_not_meaningful"
    : input.source === "file_presence"
      ? "file_presence_only"
      : input.source === "documentation"
        ? "documentation_only"
        : "dependency_only";
  const signalClass: DetectorSignalClass = input.source === "documentation"
    ? "documentation"
    : input.source === "dependency"
      ? "dependency"
      : "configuration";
  return {
    capabilityId: null,
    detectorId: null,
    signalClass,
    conclusive: false,
    evidenceLevelCeiling: "limited",
    reason,
  };
}
