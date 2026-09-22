import { describe, expect, it } from "vitest";
import {
  ATTRIBUTION_STATUSES,
  AttributionStatusSchema,
  DISCOVERY_ORIGINS,
  DiscoveryOriginSchema,
  type AttributionStatus,
  type DiscoveryOrigin,
  type LegacyAttributionProof,
} from "@/types/remediation";
import {
  parseCanonicalCandidateRepositoryWrite,
  projectLegacyCandidateRepositoryRecord,
  type LegacyCandidateRepositoryRecord,
} from "@/features/persistence/legacy-adapters";
import {
  applyCandidateSourceClaim,
  applyProviderVerification,
  createRepositoryAttributionState,
  markAttributionVerificationStale,
  type ProviderVerificationProof,
  type RepositoryAttributionState,
} from "./attribution-transitions";

const GENERATED_CASE_COUNT = 256;
const timestamp = "2025-02-03T04:05:06.000Z";
const LEGACY_TERMS = [
  "unknown_contributor",
  "unverified_contributor",
  "cv_link",
  "recruiter_entry",
  "profile_discovery",
  "git_provider",
] as const;
const LEGACY_ATTRIBUTION_INPUTS = [
  undefined,
  "unknown_contributor",
  "unverified_contributor",
  "unverified",
  "candidate_claimed",
  "verified_owner",
  "verified_contributor",
] as const;
const LEGACY_ORIGIN_INPUTS = [
  undefined,
  "CV",
  "portfolio",
  "GitHub profile",
  "manual entry",
  "cv_link",
  "recruiter_entry",
  "profile_discovery",
  "git_provider",
  "invented_source",
] as const;
const INCOMPLETE_PROOFS: readonly ProviderVerificationProof[] = [
  {
    providerConfigured: false,
    hasAuthenticatedProviderIdentity: true,
    hasRepositoryIdentity: true,
    hasRepositoryOwnershipProof: true,
    immutableContributionRevision: "revision-without-provider",
  },
  {
    providerConfigured: true,
    hasAuthenticatedProviderIdentity: false,
    hasRepositoryIdentity: true,
    hasRepositoryOwnershipProof: true,
    immutableContributionRevision: "revision-without-identity",
  },
  {
    providerConfigured: true,
    hasAuthenticatedProviderIdentity: true,
    hasRepositoryIdentity: false,
    hasRepositoryOwnershipProof: true,
    immutableContributionRevision: "revision-without-repository",
  },
  {
    providerConfigured: true,
    hasAuthenticatedProviderIdentity: true,
    hasRepositoryIdentity: true,
    hasRepositoryOwnershipProof: false,
    immutableContributionRevision: null,
  },
];

function legacyRepositoryRecord(
  index: number,
  overrides: Partial<LegacyCandidateRepositoryRecord> = {},
): LegacyCandidateRepositoryRecord {
  return {
    sourceTable: "candidate_repository_outcomes",
    sourceId: `legacy-repository-${index}`,
    ownerUserId: `owner-${index}`,
    candidateId: `candidate-${index}`,
    repositoryUrl: `https://github.com/example/repository-${index}`,
    repositoryOwner: "example",
    repositoryName: `repository-${index}`,
    attributionUpdatedAt: timestamp,
    ...overrides,
  };
}

function canonicalWrite(
  index: number,
  origin: DiscoveryOrigin,
  status: AttributionStatus,
) {
  const providerVerified = status === "verified_owner" || status === "verified_contributor";
  return {
    id: `repository-${index}`,
    ownerUserId: `owner-${index}`,
    candidateId: `candidate-${index}`,
    repositoryUrl: `https://github.com/example/repository-${index}`,
    repositoryOwner: "example",
    repositoryName: `repository-${index}`,
    discoveryOrigin: origin,
    attributionStatus: status,
    attributionUpdatedAt: timestamp,
    verificationRevision: status === "verified_contributor" ? `revision-${index}` : null,
    linkedProviderIdentityId: providerVerified ? `provider-identity-${index}` : null,
    originConfirmationRequired: false as const,
  };
}

function expectCanonicalState(state: RepositoryAttributionState): void {
  expect(DiscoveryOriginSchema.safeParse(state.discoveryOrigin).success).toBe(true);
  expect(AttributionStatusSchema.safeParse(state.attributionStatus).success).toBe(true);
  expect(state.history.every((entry) => (
    AttributionStatusSchema.safeParse(entry.fromStatus).success
    && AttributionStatusSchema.safeParse(entry.toStatus).success
  ))).toBe(true);
}

function expectedLegacyAttribution(
  value: (typeof LEGACY_ATTRIBUTION_INPUTS)[number],
  proof: LegacyAttributionProof,
): AttributionStatus {
  if (value === "candidate_claimed" && proof.hasCandidateSourceClaim) return "candidate_claimed";
  if (
    value === "verified_owner"
    && proof.hasAuthenticatedProviderIdentity
    && proof.hasRepositoryIdentity
    && proof.hasRepositoryOwnershipProof
  ) return "verified_owner";
  if (
    value === "verified_contributor"
    && proof.hasAuthenticatedProviderIdentity
    && proof.hasRepositoryIdentity
    && proof.hasImmutableRevision
  ) return "verified_contributor";
  return "unverified";
}

function expectedLegacyOrigin(
  value: (typeof LEGACY_ORIGIN_INPUTS)[number],
  persistedOrigin: DiscoveryOrigin | undefined,
): DiscoveryOrigin | null {
  if (DiscoveryOriginSchema.safeParse(value).success) return value as DiscoveryOrigin;
  if (value === "cv_link") return "CV";
  if (value === "recruiter_entry") return "manual entry";
  if (value === "profile_discovery") return "GitHub profile";
  if (value === "git_provider") return persistedOrigin ?? null;
  return null;
}

function completeOwnerProof(): ProviderVerificationProof {
  return {
    providerConfigured: true,
    hasAuthenticatedProviderIdentity: true,
    hasRepositoryIdentity: true,
    hasRepositoryOwnershipProof: true,
    immutableContributionRevision: null,
  };
}

function completeContributorProof(index: number): ProviderVerificationProof {
  return {
    providerConfigured: true,
    hasAuthenticatedProviderIdentity: true,
    hasRepositoryIdentity: true,
    hasRepositoryOwnershipProof: false,
    immutableContributionRevision: `immutable-revision-${index}`,
  };
}

describe("canonical attribution transitions", () => {
  it("handles manual add, candidate claim, provider elevation, and stale-history preservation", () => {
    const manual = createRepositoryAttributionState({
      discoveryOrigin: "manual entry",
      candidateSourceClaim: true,
    });
    expect(manual).toMatchObject({
      discoveryOrigin: "manual entry",
      attributionStatus: "unverified",
      activeProviderVerification: null,
    });

    const claimed = applyCandidateSourceClaim(createRepositoryAttributionState({
      discoveryOrigin: "CV",
      candidateSourceClaim: false,
    }));
    expect(claimed.attributionStatus).toBe("candidate_claimed");

    const owner = applyProviderVerification(claimed, completeOwnerProof());
    expect(owner.attributionStatus).toBe("verified_owner");

    const contributor = applyProviderVerification(owner, completeContributorProof(1));
    expect(contributor.attributionStatus).toBe("verified_contributor");

    const stale = markAttributionVerificationStale(contributor);
    expect(stale.attributionStatus).toBe("unverified");
    expect(stale.activeProviderVerification).toBeNull();
    expect(stale.history.slice(0, -1)).toEqual(contributor.history);
    expect(stale.history.at(-1)).toMatchObject({
      fromStatus: "verified_contributor",
      toStatus: "unverified",
      reason: "verification_stale",
    });
  });
});

describe("Feature: codeproof-audit-remediation, Property 1: Attribution and discovery state safety", () => {
  // **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.12, 14.4, 14.5, 14.6, 15.2**
  it(`holds for ${GENERATED_CASE_COUNT} deterministic generated cases`, () => {
    const observedWriteStatuses = new Set<AttributionStatus>();
    const observedWriteOrigins = new Set<DiscoveryOrigin>();
    const observedWritePairs = new Set<string>();
    const observedTransitionStatuses = new Set<AttributionStatus>();

    for (let index = 0; index < GENERATED_CASE_COUNT; index += 1) {
      const origin = DISCOVERY_ORIGINS[index % DISCOVERY_ORIGINS.length];
      const matrixStatus = ATTRIBUTION_STATUSES[
        Math.floor(index / DISCOVERY_ORIGINS.length) % ATTRIBUTION_STATUSES.length
      ];
      const parsedWrite = parseCanonicalCandidateRepositoryWrite(canonicalWrite(index, origin, matrixStatus));
      observedWriteStatuses.add(parsedWrite.attributionStatus);
      observedWriteOrigins.add(parsedWrite.discoveryOrigin);
      observedWritePairs.add(`${parsedWrite.attributionStatus}:${parsedWrite.discoveryOrigin}`);
      for (const legacyTerm of LEGACY_TERMS) {
        expect(JSON.stringify(parsedWrite)).not.toContain(legacyTerm);
      }

      const added = createRepositoryAttributionState({
        discoveryOrigin: origin,
        candidateSourceClaim: index % 2 === 0,
      });
      if (origin === "manual entry") expect(added.attributionStatus).toBe("unverified");
      expectCanonicalState(added);

      const afterClaim = applyCandidateSourceClaim(added);
      if (origin === "CV" || origin === "portfolio") {
        expect(afterClaim.attributionStatus).toBe("candidate_claimed");
      } else {
        expect(afterClaim).toBe(added);
      }
      expectCanonicalState(afterClaim);

      const owner = applyProviderVerification(added, completeOwnerProof());
      expect(owner.attributionStatus).toBe("verified_owner");
      expect(owner.activeProviderVerification).toEqual({
        kind: "owner",
        immutableContributionRevision: null,
      });
      expectCanonicalState(owner);

      const contributorProof = completeContributorProof(index);
      const contributor = applyProviderVerification(added, contributorProof);
      expect(contributor.attributionStatus).toBe("verified_contributor");
      expect(contributor.activeProviderVerification).toEqual({
        kind: "contributor",
        immutableContributionRevision: contributorProof.immutableContributionRevision,
      });
      expect(contributor.history.at(-1)?.proof).toMatchObject({
        providerConfigured: true,
        hasAuthenticatedProviderIdentity: true,
        hasRepositoryIdentity: true,
        immutableContributionRevision: contributorProof.immutableContributionRevision,
      });
      expectCanonicalState(contributor);

      const claimOrigin = index % 2 === 0 ? "CV" : "portfolio";
      const candidateClaimed = createRepositoryAttributionState({
        discoveryOrigin: claimOrigin,
        candidateSourceClaim: true,
      });
      const incomplete = applyProviderVerification(
        candidateClaimed,
        INCOMPLETE_PROOFS[index % INCOMPLETE_PROOFS.length],
      );
      expect(incomplete.attributionStatus).toBe("candidate_claimed");
      expect(incomplete.activeProviderVerification).toBeNull();
      expectCanonicalState(incomplete);

      const stale = markAttributionVerificationStale(contributor);
      expect(stale).toMatchObject({
        discoveryOrigin: origin,
        attributionStatus: "unverified",
        activeProviderVerification: null,
      });
      expect(stale.history).toHaveLength(contributor.history.length + 1);
      expect(stale.history.slice(0, contributor.history.length)).toEqual(contributor.history);
      expectCanonicalState(stale);

      for (const state of [added, afterClaim, owner, contributor, incomplete, stale]) {
        observedTransitionStatuses.add(state.attributionStatus);
      }

      const legacyAttribution = LEGACY_ATTRIBUTION_INPUTS[index % LEGACY_ATTRIBUTION_INPUTS.length];
      const proofVariant = index % 4;
      const legacyProof: LegacyAttributionProof = {
        hasCandidateSourceClaim: proofVariant >= 1,
        hasAuthenticatedProviderIdentity: proofVariant >= 2,
        hasRepositoryIdentity: proofVariant >= 3,
        hasRepositoryOwnershipProof: proofVariant >= 3,
        hasImmutableRevision: proofVariant >= 3,
      };
      const legacyOrigin = LEGACY_ORIGIN_INPUTS[index % LEGACY_ORIGIN_INPUTS.length];
      const persistedOrigin = legacyOrigin === "git_provider" && index % 3 === 0 ? origin : undefined;
      const backfill = projectLegacyCandidateRepositoryRecord(legacyRepositoryRecord(index, {
        attributionStatus: legacyAttribution,
        attributionProof: legacyProof,
        discoveryOrigin: legacyOrigin,
        persistedProviderDiscoveryOrigin: persistedOrigin,
      }));
      expect(backfill.view.attributionStatus).toBe(expectedLegacyAttribution(legacyAttribution, legacyProof));
      expect(backfill.view.discoveryOrigin).toBe(expectedLegacyOrigin(legacyOrigin, persistedOrigin));
      expect(AttributionStatusSchema.safeParse(backfill.view.attributionStatus).success).toBe(true);
      if (backfill.view.discoveryOrigin === null) {
        expect(backfill.view.originConfirmationRequired).toBe(true);
        expect(backfill.view.eligibleForNewAnalysis).toBe(false);
      } else {
        expect(DiscoveryOriginSchema.safeParse(backfill.view.discoveryOrigin).success).toBe(true);
        expect(backfill.view.originConfirmationRequired).toBe(false);
      }

      const ambiguousOrigin = [undefined, "git_provider", "invented_source"] as const;
      const ambiguous = projectLegacyCandidateRepositoryRecord(legacyRepositoryRecord(index, {
        discoveryOrigin: ambiguousOrigin[index % ambiguousOrigin.length],
      }));
      expect(ambiguous.view).toMatchObject({
        discoveryOrigin: null,
        originConfirmationRequired: true,
        eligibleForNewAnalysis: false,
      });
    }

    expect([...observedWriteStatuses].sort()).toEqual([...ATTRIBUTION_STATUSES].sort());
    expect([...observedWriteOrigins].sort()).toEqual([...DISCOVERY_ORIGINS].sort());
    expect([...observedTransitionStatuses].sort()).toEqual([...ATTRIBUTION_STATUSES].sort());
    expect(observedWritePairs.size).toBe(ATTRIBUTION_STATUSES.length * DISCOVERY_ORIGINS.length);
    for (const status of ATTRIBUTION_STATUSES) {
      for (const origin of DISCOVERY_ORIGINS) {
        expect(observedWritePairs).toContain(`${status}:${origin}`);
      }
    }
  });
});
