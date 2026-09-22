import type { AttributionStatus, DiscoveryOrigin } from "@/types/remediation";

export type AttributionTransitionReason =
  | "repository_added"
  | "candidate_source_claim"
  | "provider_owner_confirmed"
  | "provider_contribution_confirmed"
  | "provider_proof_incomplete"
  | "verification_stale";

export interface ProviderVerificationProof {
  readonly providerConfigured: boolean;
  readonly hasAuthenticatedProviderIdentity: boolean;
  readonly hasRepositoryIdentity: boolean;
  readonly hasRepositoryOwnershipProof: boolean;
  readonly immutableContributionRevision: string | null;
}

export interface AttributionTransition {
  readonly fromStatus: AttributionStatus;
  readonly toStatus: AttributionStatus;
  readonly reason: AttributionTransitionReason;
  readonly proof: Readonly<ProviderVerificationProof> | null;
}

export interface ActiveProviderVerification {
  readonly kind: "owner" | "contributor";
  readonly immutableContributionRevision: string | null;
}

export interface RepositoryAttributionState {
  readonly discoveryOrigin: DiscoveryOrigin;
  readonly attributionStatus: AttributionStatus;
  readonly activeProviderVerification: Readonly<ActiveProviderVerification> | null;
  readonly history: readonly Readonly<AttributionTransition>[];
}

function freezeProof(proof: ProviderVerificationProof): Readonly<ProviderVerificationProof> {
  return Object.freeze({ ...proof });
}

function appendTransition(
  state: RepositoryAttributionState,
  toStatus: AttributionStatus,
  reason: AttributionTransitionReason,
  proof: ProviderVerificationProof | null,
  activeProviderVerification: ActiveProviderVerification | null,
): RepositoryAttributionState {
  const transition = Object.freeze({
    fromStatus: state.attributionStatus,
    toStatus,
    reason,
    proof: proof === null ? null : freezeProof(proof),
  });
  return Object.freeze({
    discoveryOrigin: state.discoveryOrigin,
    attributionStatus: toStatus,
    activeProviderVerification: activeProviderVerification === null
      ? null
      : Object.freeze({ ...activeProviderVerification }),
    history: Object.freeze([...state.history, transition]),
  });
}

function isCandidateSuppliedOrigin(origin: DiscoveryOrigin): boolean {
  return origin === "CV" || origin === "portfolio";
}

/** Creates the canonical active relationship for a newly added repository. */
export function createRepositoryAttributionState(input: Readonly<{
  discoveryOrigin: DiscoveryOrigin;
  candidateSourceClaim: boolean;
}>): RepositoryAttributionState {
  const claimed = input.candidateSourceClaim && isCandidateSuppliedOrigin(input.discoveryOrigin);
  const attributionStatus: AttributionStatus = claimed ? "candidate_claimed" : "unverified";
  const initialTransition = Object.freeze({
    fromStatus: "unverified" as const,
    toStatus: attributionStatus,
    reason: claimed ? "candidate_source_claim" as const : "repository_added" as const,
    proof: null,
  });
  return Object.freeze({
    discoveryOrigin: input.discoveryOrigin,
    attributionStatus,
    activeProviderVerification: null,
    history: Object.freeze([initialTransition]),
  });
}

/** Records a candidate-supplied claim without treating it as provider verification. */
export function applyCandidateSourceClaim(
  state: RepositoryAttributionState,
): RepositoryAttributionState {
  if (!isCandidateSuppliedOrigin(state.discoveryOrigin)) return state;
  if (state.attributionStatus === "verified_owner" || state.attributionStatus === "verified_contributor") {
    return state;
  }
  return appendTransition(state, "candidate_claimed", "candidate_source_claim", null, null);
}

/**
 * Applies request-local provider proof. Contributor status requires provider configuration,
 * authenticated identity, repository identity, and a non-empty immutable revision.
 */
export function applyProviderVerification(
  state: RepositoryAttributionState,
  proof: ProviderVerificationProof,
): RepositoryAttributionState {
  const immutableRevision = proof.immutableContributionRevision?.trim() || null;
  const normalizedProof = { ...proof, immutableContributionRevision: immutableRevision };
  const hasVerifiedIdentity = normalizedProof.providerConfigured
    && normalizedProof.hasAuthenticatedProviderIdentity
    && normalizedProof.hasRepositoryIdentity;

  if (hasVerifiedIdentity && immutableRevision !== null) {
    return appendTransition(
      state,
      "verified_contributor",
      "provider_contribution_confirmed",
      normalizedProof,
      { kind: "contributor", immutableContributionRevision: immutableRevision },
    );
  }
  if (hasVerifiedIdentity && normalizedProof.hasRepositoryOwnershipProof) {
    return appendTransition(
      state,
      "verified_owner",
      "provider_owner_confirmed",
      normalizedProof,
      { kind: "owner", immutableContributionRevision: null },
    );
  }

  const safeStatus = state.attributionStatus === "candidate_claimed"
    ? "candidate_claimed"
    : "unverified";
  return appendTransition(
    state,
    safeStatus,
    "provider_proof_incomplete",
    normalizedProof,
    null,
  );
}

/** Clears stale active verification while retaining the append-only transition history. */
export function markAttributionVerificationStale(
  state: RepositoryAttributionState,
): RepositoryAttributionState {
  return appendTransition(state, "unverified", "verification_stale", null, null);
}
