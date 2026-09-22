import { createHash } from "node:crypto";
import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import {
  divergentAdminDiagnostic,
  noMatchingAdminDiagnostic,
  normalizeAdminBootstrap,
  type AdminBootstrapDiagnostic,
} from "@/features/admin/bootstrap";

const DEFAULT_BACKFILL_BATCH_SIZE = 100;
const MAX_BACKFILL_BATCH_SIZE = 1_000;
const MIGRATION_ADVISORY_LOCK_KEY = 1_128_878_925;

const PARITY_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS codeproof_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS codeproof_candidates (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    source TEXT NOT NULL,
    evidence_index INTEGER NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL,
    outcome TEXT NOT NULL,
    furthest_stage TEXT NOT NULL,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    repository_count INTEGER NOT NULL DEFAULT 0,
    verified_claim_count INTEGER NOT NULL DEFAULT 0,
    evidence_reviewed_at TIMESTAMPTZ,
    unanalyzed_sources JSONB
  );

  CREATE TABLE IF NOT EXISTS codeproof_stage_events (
    id BIGSERIAL PRIMARY KEY,
    candidate_id TEXT NOT NULL REFERENCES codeproof_candidates(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    entered_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS codeproof_candidate_analyses (
    id TEXT PRIMARY KEY,
    candidate_id TEXT NOT NULL REFERENCES codeproof_candidates(id) ON DELETE CASCADE,
    repository_url TEXT NOT NULL,
    repository_name TEXT NOT NULL,
    primary_language TEXT,
    project_type TEXT NOT NULL,
    evidence_index INTEGER NOT NULL,
    summary TEXT NOT NULL,
    analyzed_at TIMESTAMPTZ NOT NULL,
    analysis_json JSONB NOT NULL,
    UNIQUE(candidate_id, repository_url)
  );

  CREATE TABLE IF NOT EXISTS codeproof_candidate_repository_outcomes (
    id TEXT PRIMARY KEY,
    candidate_id TEXT NOT NULL REFERENCES codeproof_candidates(id) ON DELETE CASCADE,
    repository_url TEXT NOT NULL,
    repository_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('analyzed', 'failed')),
    code TEXT,
    message TEXT,
    updated_at TIMESTAMPTZ NOT NULL,
    UNIQUE(candidate_id, repository_url)
  );

  CREATE TABLE IF NOT EXISTS codeproof_company_requirements (
    id TEXT NOT NULL,
    owner_user_id TEXT NOT NULL,
    requirement TEXT NOT NULL,
    importance TEXT NOT NULL,
    category TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY(owner_user_id, id)
  );

  CREATE TABLE IF NOT EXISTS codeproof_analysis_cache (
    cache_key TEXT PRIMARY KEY,
    analysis_version TEXT NOT NULL,
    result JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS codeproof_legacy_migration_markers (
    id TEXT PRIMARY KEY,
    source_table TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_table TEXT NOT NULL,
    target_id TEXT,
    status TEXT NOT NULL CHECK(status IN ('backfilled', 'owner_unresolved', 'recompute_required')),
    legacy_marker TEXT NOT NULL,
    detail_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE(source_table, source_id, target_table)
  );

  CREATE TABLE IF NOT EXISTS codeproof_candidate_repositories (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES codeproof_users(id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL REFERENCES codeproof_candidates(id) ON DELETE CASCADE,
    repository_url TEXT NOT NULL,
    repository_owner TEXT,
    repository_name TEXT NOT NULL,
    discovery_origin TEXT CHECK(discovery_origin IS NULL OR discovery_origin IN ('CV', 'portfolio', 'GitHub profile', 'manual entry')),
    attribution_status TEXT NOT NULL DEFAULT 'unverified' CHECK(attribution_status IN ('unverified', 'candidate_claimed', 'verified_owner', 'verified_contributor')),
    attribution_updated_at TIMESTAMPTZ NOT NULL,
    verification_revision TEXT,
    linked_provider_identity_id TEXT,
    origin_confirmation_required BOOLEAN NOT NULL DEFAULT FALSE,
    legacy_marker TEXT,
    UNIQUE(candidate_id, repository_url)
  );

  CREATE TABLE IF NOT EXISTS codeproof_contribution_verification_events (
    id TEXT PRIMARY KEY,
    candidate_repository_id TEXT NOT NULL REFERENCES codeproof_candidate_repositories(id) ON DELETE CASCADE,
    from_status TEXT NOT NULL CHECK(from_status IN ('unverified', 'candidate_claimed', 'verified_owner', 'verified_contributor')),
    to_status TEXT NOT NULL CHECK(to_status IN ('unverified', 'candidate_claimed', 'verified_owner', 'verified_contributor')),
    provider TEXT,
    provider_identity_fingerprint TEXT,
    repository_provider_id TEXT,
    immutable_revision TEXT,
    reason TEXT NOT NULL CHECK(reason IN ('candidate_source_claim', 'provider_owner_confirmed', 'provider_contribution_confirmed', 'verification_stale', 'legacy_backfill', 'recruiter_confirmed_origin')),
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS codeproof_taxonomy_versions (
    version TEXT PRIMARY KEY,
    effective_at TIMESTAMPTZ NOT NULL,
    evidence_policy_version TEXT NOT NULL,
    nodes_json JSONB NOT NULL,
    content_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS codeproof_capability_nodes (
    taxonomy_version TEXT NOT NULL REFERENCES codeproof_taxonomy_versions(version) ON DELETE CASCADE,
    id TEXT NOT NULL,
    label_en TEXT NOT NULL,
    label_ar TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('language', 'framework', 'library', 'database', 'testing', 'security', 'architecture', 'devops', 'domain')),
    detector_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    PRIMARY KEY(taxonomy_version, id)
  );

  CREATE TABLE IF NOT EXISTS codeproof_capability_aliases (
    taxonomy_version TEXT NOT NULL,
    capability_id TEXT NOT NULL,
    alias TEXT NOT NULL,
    normalized_alias TEXT NOT NULL,
    PRIMARY KEY(taxonomy_version, normalized_alias),
    FOREIGN KEY(taxonomy_version, capability_id) REFERENCES codeproof_capability_nodes(taxonomy_version, id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS codeproof_capability_relations (
    taxonomy_version TEXT NOT NULL,
    source_capability_id TEXT NOT NULL,
    relation_type TEXT NOT NULL CHECK(relation_type IN ('broader_than', 'narrower_than', 'related_to', 'evidence_requires', 'incompatible_with')),
    target_capability_id TEXT NOT NULL,
    PRIMARY KEY(taxonomy_version, source_capability_id, relation_type, target_capability_id),
    FOREIGN KEY(taxonomy_version, source_capability_id) REFERENCES codeproof_capability_nodes(taxonomy_version, id) ON DELETE CASCADE,
    FOREIGN KEY(taxonomy_version, target_capability_id) REFERENCES codeproof_capability_nodes(taxonomy_version, id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS codeproof_analysis_versions (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES codeproof_users(id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL REFERENCES codeproof_candidates(id) ON DELETE CASCADE,
    legacy_analysis_id TEXT UNIQUE REFERENCES codeproof_candidate_analyses(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('running', 'completed', 'failed')),
    analyzed_at TIMESTAMPTZ NOT NULL,
    deterministic_engine_version TEXT NOT NULL,
    taxonomy_version TEXT NOT NULL,
    requisition_version_id TEXT,
    ai_request_schema_version TEXT,
    provider_id TEXT,
    model_id TEXT,
    prompt_version TEXT,
    pricing_version TEXT,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    recompute_required BOOLEAN NOT NULL DEFAULT FALSE,
    legacy_marker TEXT,
    created_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS codeproof_detector_findings (
    id TEXT PRIMARY KEY,
    analysis_version_id TEXT NOT NULL REFERENCES codeproof_analysis_versions(id) ON DELETE CASCADE,
    candidate_repository_id TEXT REFERENCES codeproof_candidate_repositories(id) ON DELETE CASCADE,
    detector_id TEXT NOT NULL,
    detector_version TEXT NOT NULL,
    capability_id TEXT NOT NULL,
    signal_class TEXT NOT NULL CHECK(signal_class IN ('implementation', 'test', 'architecture', 'dependency', 'configuration', 'documentation', 'generated', 'trivial')),
    repository_id TEXT NOT NULL,
    revision TEXT,
    file_path TEXT NOT NULL,
    symbol TEXT,
    start_line INTEGER CHECK(start_line IS NULL OR start_line > 0),
    end_line INTEGER CHECK(end_line IS NULL OR end_line > 0),
    excerpt_start_offset INTEGER CHECK(excerpt_start_offset IS NULL OR excerpt_start_offset >= 0),
    excerpt_end_offset INTEGER CHECK(excerpt_end_offset IS NULL OR excerpt_end_offset >= 0)
  );

  CREATE TABLE IF NOT EXISTS codeproof_evidence_items (
    id TEXT PRIMARY KEY,
    analysis_version_id TEXT NOT NULL REFERENCES codeproof_analysis_versions(id) ON DELETE CASCADE,
    finding_id TEXT NOT NULL REFERENCES codeproof_detector_findings(id) ON DELETE CASCADE,
    capability_id TEXT NOT NULL,
    claim_scope TEXT NOT NULL,
    evidence_level TEXT NOT NULL CHECK(evidence_level IN ('strong', 'good', 'partial', 'limited', 'insufficient')),
    taxonomy_version TEXT NOT NULL,
    UNIQUE(analysis_version_id, finding_id, capability_id, claim_scope)
  );

  CREATE TABLE IF NOT EXISTS codeproof_evidence_citations (
    id TEXT PRIMARY KEY,
    analysis_version_id TEXT NOT NULL REFERENCES codeproof_analysis_versions(id) ON DELETE CASCADE,
    finding_id TEXT NOT NULL REFERENCES codeproof_detector_findings(id) ON DELETE CASCADE,
    detector_id TEXT NOT NULL,
    detector_version TEXT NOT NULL,
    repository_id TEXT NOT NULL,
    repository_url TEXT NOT NULL,
    repository_name TEXT NOT NULL,
    revision TEXT,
    revision_availability TEXT NOT NULL CHECK(revision_availability IN ('available', 'unavailable')),
    file_path TEXT NOT NULL,
    symbol TEXT,
    start_line INTEGER CHECK(start_line IS NULL OR start_line > 0),
    end_line INTEGER CHECK(end_line IS NULL OR end_line > 0),
    excerpt TEXT,
    source_link TEXT NOT NULL,
    discovery_origin TEXT NOT NULL CHECK(discovery_origin IN ('CV', 'portfolio', 'GitHub profile', 'manual entry')),
    attribution_status TEXT NOT NULL CHECK(attribution_status IN ('unverified', 'candidate_claimed', 'verified_owner', 'verified_contributor')),
    evidence_level TEXT NOT NULL CHECK(evidence_level IN ('strong', 'good', 'partial', 'limited', 'insufficient')),
    taxonomy_version TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS codeproof_candidate_conclusions (
    id TEXT PRIMARY KEY,
    analysis_version_id TEXT NOT NULL REFERENCES codeproof_analysis_versions(id) ON DELETE CASCADE,
    capability_id TEXT NOT NULL,
    evidence_level TEXT NOT NULL CHECK(evidence_level IN ('strong', 'good', 'partial')),
    citation_ids_json JSONB NOT NULL,
    eligibility TEXT NOT NULL CHECK(eligibility IN ('eligible', 'unsupported')),
    explanation TEXT NOT NULL,
    claim_scope TEXT NOT NULL,
    recompute_required BOOLEAN NOT NULL DEFAULT FALSE,
    legacy_marker TEXT,
    UNIQUE(analysis_version_id, capability_id, claim_scope)
  );

  CREATE TABLE IF NOT EXISTS codeproof_evidence_gaps (
    id TEXT PRIMARY KEY,
    analysis_version_id TEXT NOT NULL REFERENCES codeproof_analysis_versions(id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL REFERENCES codeproof_candidates(id) ON DELETE CASCADE,
    capability_id TEXT NOT NULL,
    claim_scope TEXT NOT NULL,
    reason TEXT NOT NULL,
    UNIQUE(analysis_version_id, candidate_id, capability_id, claim_scope)
  );

  CREATE TABLE IF NOT EXISTS codeproof_interview_questions (
    id TEXT PRIMARY KEY,
    analysis_version_id TEXT NOT NULL REFERENCES codeproof_analysis_versions(id) ON DELETE CASCADE,
    basis_kind TEXT NOT NULL CHECK(basis_kind IN ('evidence', 'gap')),
    basis_json JSONB NOT NULL,
    attribution_gate TEXT NOT NULL CHECK(attribution_gate IN ('unverified', 'candidate_claimed', 'verified_owner', 'verified_contributor')),
    question TEXT NOT NULL,
    redaction_applied BOOLEAN NOT NULL
  );

  CREATE TABLE IF NOT EXISTS codeproof_repository_corpus_metrics (
    id TEXT PRIMARY KEY,
    analysis_version_id TEXT NOT NULL REFERENCES codeproof_analysis_versions(id) ON DELETE CASCADE,
    candidate_repository_id TEXT NOT NULL REFERENCES codeproof_candidate_repositories(id) ON DELETE CASCADE,
    repository_id TEXT NOT NULL,
    revision TEXT,
    analyzed_at TIMESTAMPTZ NOT NULL,
    metrics_json JSONB NOT NULL,
    UNIQUE(analysis_version_id, candidate_repository_id)
  );

  CREATE TABLE IF NOT EXISTS codeproof_repository_run_metrics (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES codeproof_users(id) ON DELETE CASCADE,
    analysis_version_id TEXT NOT NULL UNIQUE REFERENCES codeproof_analysis_versions(id) ON DELETE CASCADE,
    state TEXT NOT NULL CHECK(state IN ('running', 'completed')),
    selected_repository_count INTEGER NOT NULL CHECK(selected_repository_count >= 0),
    successful_repository_count INTEGER NOT NULL CHECK(successful_repository_count >= 0),
    failed_repository_count INTEGER NOT NULL CHECK(failed_repository_count >= 0),
    pending_repository_count INTEGER NOT NULL CHECK(pending_repository_count >= 0),
    attribution_counts_json JSONB NOT NULL,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS codeproof_requisitions (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES codeproof_users(id) ON DELETE CASCADE,
    title TEXT,
    current_version INTEGER NOT NULL DEFAULT 0 CHECK(current_version >= 0),
    legacy_marker TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    UNIQUE(owner_user_id, id)
  );

  CREATE TABLE IF NOT EXISTS codeproof_requisition_versions (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES codeproof_users(id) ON DELETE CASCADE,
    requisition_id TEXT NOT NULL REFERENCES codeproof_requisitions(id) ON DELETE CASCADE,
    version INTEGER NOT NULL CHECK(version > 0),
    criteria_json JSONB NOT NULL,
    content_hash TEXT NOT NULL,
    legacy_source_json JSONB,
    recompute_required BOOLEAN NOT NULL DEFAULT FALSE,
    legacy_marker TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE(requisition_id, version),
    UNIQUE(owner_user_id, requisition_id, content_hash)
  );

  CREATE TABLE IF NOT EXISTS codeproof_saved_comparisons (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES codeproof_users(id) ON DELETE CASCADE,
    requisition_version_id TEXT NOT NULL REFERENCES codeproof_requisition_versions(id) ON DELETE CASCADE,
    candidate_analysis_version_ids_json JSONB NOT NULL,
    result_json JSONB NOT NULL,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE(owner_user_id, idempotency_key)
  );

  CREATE TABLE IF NOT EXISTS codeproof_review_orders (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES codeproof_users(id) ON DELETE CASCADE,
    requisition_version_id TEXT NOT NULL REFERENCES codeproof_requisition_versions(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status = 'draft'),
    entries_json JSONB NOT NULL,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE(owner_user_id, idempotency_key)
  );

  CREATE TABLE IF NOT EXISTS codeproof_evidence_checks (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES codeproof_users(id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL REFERENCES codeproof_candidates(id) ON DELETE CASCADE,
    analysis_version_id TEXT NOT NULL REFERENCES codeproof_analysis_versions(id) ON DELETE CASCADE,
    requisition_version_id TEXT NOT NULL REFERENCES codeproof_requisition_versions(id) ON DELETE CASCADE,
    checked_at TIMESTAMPTZ NOT NULL,
    UNIQUE(owner_user_id, candidate_id, analysis_version_id, requisition_version_id)
  );

  CREATE TABLE IF NOT EXISTS codeproof_ai_telemetry (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES codeproof_users(id) ON DELETE CASCADE,
    operation TEXT NOT NULL,
    provider_id TEXT,
    model_id TEXT,
    status TEXT NOT NULL CHECK(status IN ('success', 'failed', 'fallback', 'skipped')),
    fallback_reason TEXT,
    latency_ms INTEGER NOT NULL CHECK(latency_ms >= 0),
    cache_status TEXT NOT NULL CHECK(cache_status IN ('hit', 'miss', 'not_applicable')),
    attempt_count INTEGER NOT NULL CHECK(attempt_count >= 0),
    input_units INTEGER CHECK(input_units IS NULL OR input_units >= 0),
    cached_input_units INTEGER CHECK(cached_input_units IS NULL OR cached_input_units >= 0),
    output_units INTEGER CHECK(output_units IS NULL OR output_units >= 0),
    estimated_cost_micros BIGINT,
    actual_cost_micros BIGINT,
    actual_cost_status TEXT NOT NULL CHECK(actual_cost_status IN ('available', 'unavailable')),
    currency TEXT CHECK(currency IS NULL OR currency = 'USD'),
    pricing_version TEXT,
    schema_version TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    taxonomy_version TEXT NOT NULL,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS codeproof_analysis_cache_v2 (
    cache_key TEXT PRIMARY KEY,
    analysis_version_id TEXT REFERENCES codeproof_analysis_versions(id) ON DELETE CASCADE,
    result_json JSONB NOT NULL,
    schema_version TEXT NOT NULL,
    taxonomy_version TEXT NOT NULL,
    pricing_version TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS codeproof_pricing_registry (
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    registry_version TEXT NOT NULL,
    currency TEXT NOT NULL CHECK(currency = 'USD'),
    units TEXT NOT NULL,
    input_micros BIGINT NOT NULL,
    cached_input_micros BIGINT,
    output_micros BIGINT NOT NULL,
    effective_at TIMESTAMPTZ NOT NULL,
    checked_at TIMESTAMPTZ NOT NULL,
    official_source_url TEXT NOT NULL,
    PRIMARY KEY(provider_id, model_id, registry_version)
  );

  CREATE TABLE IF NOT EXISTS codeproof_pilot_tiers (
    id TEXT NOT NULL,
    version TEXT NOT NULL,
    display_name_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(id, version)
  );

  CREATE TABLE IF NOT EXISTS codeproof_pilot_entitlements (
    tier_id TEXT NOT NULL,
    tier_version TEXT NOT NULL,
    entitlement_id TEXT NOT NULL,
    enabled BOOLEAN NOT NULL,
    PRIMARY KEY(tier_id, tier_version, entitlement_id),
    FOREIGN KEY(tier_id, tier_version) REFERENCES codeproof_pilot_tiers(id, version) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS codeproof_pilot_quotas (
    tier_id TEXT NOT NULL,
    tier_version TEXT NOT NULL,
    quota_kind TEXT NOT NULL CHECK(quota_kind IN ('candidates', 'repository_analyses', 'paid_ai_usage', 'active_external_shares', 'recruiter_seats')),
    quota_limit INTEGER NOT NULL CHECK(quota_limit >= 0),
    period_id TEXT NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(tier_id, tier_version, quota_kind, period_id),
    FOREIGN KEY(tier_id, tier_version) REFERENCES codeproof_pilot_tiers(id, version) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS codeproof_usage_reservations (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES codeproof_users(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    quota_kind TEXT NOT NULL CHECK(quota_kind IN ('candidates', 'repository_analyses', 'paid_ai_usage', 'active_external_shares', 'recruiter_seats')),
    usage_period_id TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK(amount > 0),
    status TEXT NOT NULL CHECK(status IN ('reserved', 'committed', 'released', 'expired')),
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    UNIQUE(owner_user_id, idempotency_key)
  );

  CREATE TABLE IF NOT EXISTS codeproof_usage_ledger (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES codeproof_users(id) ON DELETE CASCADE,
    reservation_id TEXT NOT NULL UNIQUE REFERENCES codeproof_usage_reservations(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    quota_kind TEXT NOT NULL,
    usage_period_id TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK(amount > 0),
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    committed_at TIMESTAMPTZ NOT NULL,
    UNIQUE(owner_user_id, idempotency_key)
  );

  CREATE TABLE IF NOT EXISTS codeproof_external_shares (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES codeproof_users(id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL REFERENCES codeproof_candidates(id) ON DELETE CASCADE,
    analysis_version_id TEXT NOT NULL REFERENCES codeproof_analysis_versions(id) ON DELETE CASCADE,
    token_digest TEXT NOT NULL UNIQUE,
    expiry_option TEXT NOT NULL DEFAULT '7d' CHECK(expiry_option IN ('24h', '7d', '30d')),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    passcode_required BOOLEAN NOT NULL DEFAULT FALSE,
    passcode_digest TEXT,
    email_verification_required BOOLEAN NOT NULL DEFAULT FALSE,
    email_address_digest TEXT,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS codeproof_external_report_snapshots (
    id TEXT PRIMARY KEY,
    share_id TEXT NOT NULL UNIQUE REFERENCES codeproof_external_shares(id) ON DELETE CASCADE,
    projection_json JSONB NOT NULL,
    taxonomy_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS codeproof_share_validation_limits (
    key_digest TEXT PRIMARY KEY,
    window_started_at TIMESTAMPTZ NOT NULL,
    attempt_count INTEGER NOT NULL CHECK(attempt_count >= 0),
    expires_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS codeproof_share_access_log (
    id TEXT PRIMARY KEY,
    share_id TEXT NOT NULL REFERENCES codeproof_external_shares(id) ON DELETE CASCADE,
    occurred_at TIMESTAMPTZ NOT NULL,
    outcome TEXT NOT NULL CHECK(outcome IN ('granted', 'denied_invalid', 'denied_expired', 'denied_revoked', 'denied_passcode', 'denied_email_verification', 'rate_limited')),
    applied_controls_json JSONB NOT NULL,
    ip_fingerprint TEXT NOT NULL,
    user_agent_family TEXT,
    coarse_region TEXT,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE
  );

  CREATE TABLE IF NOT EXISTS codeproof_share_email_verifications (
    id TEXT PRIMARY KEY,
    share_id TEXT NOT NULL REFERENCES codeproof_external_shares(id) ON DELETE CASCADE,
    session_digest TEXT NOT NULL,
    code_digest TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE(share_id, session_digest)
  );

  CREATE TABLE IF NOT EXISTS codeproof_admin_audit_log (
    id TEXT PRIMARY KEY,
    sequence BIGINT NOT NULL UNIQUE CHECK(sequence > 0),
    occurred_at TIMESTAMPTZ NOT NULL,
    actor_user_id TEXT NOT NULL REFERENCES codeproof_users(id) ON DELETE RESTRICT,
    actor_role TEXT NOT NULL CHECK(actor_role IN ('RECRUITER', 'ADMIN')),
    impersonated_user_id TEXT REFERENCES codeproof_users(id) ON DELETE RESTRICT,
    action TEXT NOT NULL,
    action_category TEXT NOT NULL,
    target_kind TEXT NOT NULL CHECK(target_kind IN ('account', 'share', 'candidate', 'analysis', 'quota', 'impersonation_grant', 'none')),
    target_id TEXT,
    outcome TEXT NOT NULL CHECK(outcome IN ('succeeded', 'denied', 'failed')),
    denial_reason TEXT,
    parameters_json JSONB NOT NULL,
    before_json JSONB,
    after_json JSONB,
    request_correlation_id TEXT NOT NULL,
    request_method TEXT NOT NULL,
    route TEXT NOT NULL,
    ip_fingerprint TEXT NOT NULL,
    user_agent_family TEXT,
    previous_entry_hash TEXT NOT NULL UNIQUE,
    entry_hash TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS codeproof_admin_authorization_attempts (
    key_digest TEXT PRIMARY KEY,
    window_started_at TIMESTAMPTZ NOT NULL,
    attempt_count INTEGER NOT NULL CHECK(attempt_count >= 0),
    expires_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS codeproof_impersonation_grants (
    grant_id TEXT PRIMARY KEY,
    admin_actor_user_id TEXT NOT NULL REFERENCES codeproof_users(id) ON DELETE RESTRICT,
    target_user_id TEXT NOT NULL REFERENCES codeproof_users(id) ON DELETE RESTRICT,
    reason_redacted TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    end_reason TEXT CHECK(end_reason IS NULL OR end_reason IN ('returned', 'expired', 'revoked', 'disabled')),
    start_audit_entry_id TEXT NOT NULL REFERENCES codeproof_admin_audit_log(id) ON DELETE RESTRICT,
    end_audit_entry_id TEXT REFERENCES codeproof_admin_audit_log(id) ON DELETE RESTRICT
  );

  CREATE TABLE IF NOT EXISTS codeproof_demo_fixture_baselines (
    owner_user_id TEXT PRIMARY KEY REFERENCES codeproof_users(id) ON DELETE CASCADE,
    demo_fixture_version TEXT NOT NULL,
    baseline_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS codeproof_verification_cycles (
    id TEXT PRIMARY KEY,
    ordinal INTEGER NOT NULL UNIQUE CHECK(ordinal > 0),
    commit_hash TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    checks_json JSONB NOT NULL,
    defects_opened_json JSONB NOT NULL,
    defects_closed_json JSONB NOT NULL,
    browser_console_artifact_id TEXT,
    server_output_artifact_id TEXT
  );

  CREATE TABLE IF NOT EXISTS codeproof_release_gate_passes (
    id TEXT PRIMARY KEY,
    pass_ordinal INTEGER NOT NULL CHECK(pass_ordinal IN (1, 2)),
    commit_hash TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL,
    check_outcomes_json JSONB NOT NULL,
    new_defects_discovered_json JSONB NOT NULL,
    reset_triggered_by_defect_id TEXT,
    UNIQUE(commit_hash, pass_ordinal, started_at)
  );

  CREATE TABLE IF NOT EXISTS codeproof_defects (
    id TEXT PRIMARY KEY,
    severity TEXT NOT NULL CHECK(severity IN ('critical', 'high', 'medium', 'low')),
    status TEXT NOT NULL CHECK(status IN ('open', 'resolved')),
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    opened_at TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ,
    severity_history_json JSONB NOT NULL
  );

  CREATE TABLE IF NOT EXISTS codeproof_criterion_integrity_baselines (
    criterion_id TEXT PRIMARY KEY,
    criterion_text TEXT NOT NULL,
    criterion_hash TEXT NOT NULL UNIQUE,
    recorded_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS codeproof_criterion_change_approvals (
    id TEXT PRIMARY KEY,
    criterion_id TEXT NOT NULL REFERENCES codeproof_criterion_integrity_baselines(criterion_id) ON DELETE RESTRICT,
    approver TEXT NOT NULL,
    approved_at TIMESTAMPTZ NOT NULL,
    prior_text TEXT NOT NULL,
    new_text TEXT NOT NULL,
    rationale TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS codeproof_demo_simulation_runs (
    id TEXT PRIMARY KEY,
    account_mode TEXT NOT NULL CHECK(account_mode IN ('fresh', 'existing')),
    locale TEXT NOT NULL CHECK(locale IN ('en', 'ar')),
    viewport TEXT NOT NULL,
    commit_hash TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    outcome TEXT NOT NULL CHECK(outcome IN ('passed', 'failed', 'running')),
    steps_json JSONB NOT NULL,
    artifact_ids_json JSONB NOT NULL
  );

  CREATE TABLE IF NOT EXISTS codeproof_release_verifications (
    id TEXT PRIMARY KEY,
    target TEXT NOT NULL CHECK(target IN ('local', 'vercel_preview', 'vercel_production')),
    deployment_url TEXT,
    build_metadata_json JSONB NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL,
    checks_json JSONB NOT NULL
  );

  CREATE TABLE IF NOT EXISTS codeproof_release_disclosures (
    id TEXT PRIMARY KEY,
    release_commit_hash TEXT,
    generated_at TIMESTAMPTZ NOT NULL,
    disclosure_json JSONB NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_codeproof_legacy_migration_markers_source ON codeproof_legacy_migration_markers(source_table, source_id);
  CREATE INDEX IF NOT EXISTS idx_codeproof_candidate_repositories_owner ON codeproof_candidate_repositories(owner_user_id, candidate_id);
  CREATE INDEX IF NOT EXISTS idx_codeproof_candidate_repositories_attribution ON codeproof_candidate_repositories(attribution_status, origin_confirmation_required);
  CREATE INDEX IF NOT EXISTS idx_codeproof_contribution_events_repository ON codeproof_contribution_verification_events(candidate_repository_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_codeproof_analysis_versions_owner ON codeproof_analysis_versions(owner_user_id, candidate_id, analyzed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_codeproof_detector_findings_analysis ON codeproof_detector_findings(analysis_version_id, capability_id);
  CREATE INDEX IF NOT EXISTS idx_codeproof_evidence_citations_analysis ON codeproof_evidence_citations(analysis_version_id, finding_id);
  CREATE INDEX IF NOT EXISTS idx_codeproof_candidate_conclusions_analysis ON codeproof_candidate_conclusions(analysis_version_id, capability_id);
  CREATE INDEX IF NOT EXISTS idx_codeproof_repository_run_metrics_owner ON codeproof_repository_run_metrics(owner_user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_codeproof_requisitions_owner ON codeproof_requisitions(owner_user_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_codeproof_requisition_versions_owner ON codeproof_requisition_versions(owner_user_id, requisition_id, version DESC);
  CREATE INDEX IF NOT EXISTS idx_codeproof_saved_comparisons_owner ON codeproof_saved_comparisons(owner_user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_codeproof_review_orders_owner ON codeproof_review_orders(owner_user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_codeproof_ai_telemetry_owner ON codeproof_ai_telemetry(owner_user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_codeproof_usage_reservations_quota ON codeproof_usage_reservations(owner_user_id, quota_kind, usage_period_id, status);
  CREATE INDEX IF NOT EXISTS idx_codeproof_usage_ledger_quota ON codeproof_usage_ledger(owner_user_id, quota_kind, usage_period_id);
  CREATE INDEX IF NOT EXISTS idx_codeproof_external_shares_owner ON codeproof_external_shares(owner_user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_codeproof_external_shares_scope ON codeproof_external_shares(candidate_id, analysis_version_id);
  CREATE INDEX IF NOT EXISTS idx_codeproof_share_access_log_share ON codeproof_share_access_log(share_id, occurred_at DESC);
  CREATE INDEX IF NOT EXISTS idx_codeproof_admin_audit_sequence ON codeproof_admin_audit_log(sequence);
  CREATE INDEX IF NOT EXISTS idx_codeproof_impersonation_active ON codeproof_impersonation_grants(admin_actor_user_id, ended_at, expires_at);
  CREATE INDEX IF NOT EXISTS idx_codeproof_defects_status_severity ON codeproof_defects(status, severity);

  CREATE OR REPLACE FUNCTION codeproof_reject_admin_audit_mutation()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $function$
  BEGIN
    RAISE EXCEPTION 'admin_audit_append_only' USING ERRCODE = '55000';
  END;
  $function$;

  DO $trigger$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'codeproof_admin_audit_log_append_only'
        AND tgrelid = 'codeproof_admin_audit_log'::regclass
        AND NOT tgisinternal
    ) THEN
      CREATE TRIGGER codeproof_admin_audit_log_append_only
      BEFORE UPDATE OR DELETE OR TRUNCATE ON codeproof_admin_audit_log
      FOR EACH STATEMENT EXECUTE FUNCTION codeproof_reject_admin_audit_mutation();
    END IF;
  END;
  $trigger$;
`;

const ACCOUNT_AND_LEGACY_COLUMNS_SQL = `
  ALTER TABLE codeproof_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'RECRUITER';
  ALTER TABLE codeproof_users ADD COLUMN IF NOT EXISTS lifecycle_state TEXT NOT NULL DEFAULT 'active';
  ALTER TABLE codeproof_users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE codeproof_users ADD COLUMN IF NOT EXISTS demo_label TEXT;
  ALTER TABLE codeproof_users ADD COLUMN IF NOT EXISTS company_name TEXT;
  ALTER TABLE codeproof_users ADD COLUMN IF NOT EXISTS plan_tier_id TEXT;
  ALTER TABLE codeproof_users ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;
  ALTER TABLE codeproof_users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
  ALTER TABLE codeproof_users ADD COLUMN IF NOT EXISTS soft_deleted_at TIMESTAMPTZ;

  ALTER TABLE codeproof_candidates ADD COLUMN IF NOT EXISTS owner_user_id TEXT;
  ALTER TABLE codeproof_candidates ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE codeproof_candidates ADD COLUMN IF NOT EXISTS repository_count INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE codeproof_candidates ADD COLUMN IF NOT EXISTS verified_claim_count INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE codeproof_candidates ADD COLUMN IF NOT EXISTS evidence_reviewed_at TIMESTAMPTZ;
  ALTER TABLE codeproof_candidates ADD COLUMN IF NOT EXISTS unanalyzed_sources JSONB;
  ALTER TABLE codeproof_company_requirements ADD COLUMN IF NOT EXISTS owner_user_id TEXT;

  DO $constraints$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'codeproof_users_role_check'
        AND conrelid = 'codeproof_users'::regclass
    ) THEN
      ALTER TABLE codeproof_users ADD CONSTRAINT codeproof_users_role_check CHECK(role IN ('RECRUITER', 'ADMIN'));
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'codeproof_users_lifecycle_state_check'
        AND conrelid = 'codeproof_users'::regclass
    ) THEN
      ALTER TABLE codeproof_users ADD CONSTRAINT codeproof_users_lifecycle_state_check CHECK(lifecycle_state IN ('active', 'suspended', 'soft_deleted'));
    END IF;
  END;
  $constraints$;

  CREATE INDEX IF NOT EXISTS idx_codeproof_candidates_owner ON codeproof_candidates(owner_user_id, applied_at DESC);
  CREATE INDEX IF NOT EXISTS idx_codeproof_company_requirements_owner ON codeproof_company_requirements(owner_user_id, position);
`;

const CANDIDATE_BACKFILL_SIGNATURE = "postgres-candidate-backfill-v1";
const REQUIREMENTS_BACKFILL_SIGNATURE = "postgres-requirements-backfill-v1";

export interface PostgreSQLMigrationInfo {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
}

export interface EnsurePostgreSQLRemediationSchemaOptions {
  /** Bounds every source-table read while preserving one migration transaction. */
  readonly backfillBatchSize?: number;
  /** Test/diagnostic seam used to prove rollback. Production callers leave it unset. */
  readonly beforeMigration?: (migration: PostgreSQLMigrationInfo) => void;
  /** Runs account validation and the idempotent ADMIN_EMAIL bootstrap under the migration lock. */
  readonly initializeAccounts?: boolean;
  readonly adminEmail?: string;
  readonly onAdminBootstrapDiagnostic?: (diagnostic: AdminBootstrapDiagnostic) => void;
}

interface MigrationContext {
  readonly client: PoolClient;
  readonly batchSize: number;
  readonly appliedAt: string;
}

interface PostgreSQLMigration extends PostgreSQLMigrationInfo {
  readonly signature: string;
  readonly up: (context: MigrationContext) => Promise<number>;
}

interface SchemaVersionRow {
  version: number;
  name: string;
  checksum: string;
}

interface LegacyRepositoryRow extends QueryResultRow {
  source_id: string;
  candidate_id: string;
  owner_user_id: string | null;
  owner_exists: boolean;
  repository_url: string;
  repository_name: string;
  observed_at: string | Date;
}

interface LegacyAnalysisRow extends QueryResultRow {
  id: string;
  candidate_id: string;
  owner_user_id: string | null;
  owner_exists: boolean;
  analyzed_at: string | Date;
  is_demo: boolean;
}

interface LegacyRequirementOwnerRow extends QueryResultRow {
  source_id: string;
  owner_user_id: string | null;
  owner_exists: boolean;
}

interface LegacyRequirementRow extends QueryResultRow {
  id: string;
  requirement: string;
  importance: string;
  category: string;
  position: number;
}

export class PostgreSQLSchemaUpgradeError extends Error {
  readonly code = "SCHEMA_UPGRADE_FAILED";
  readonly migrationVersion: number | null;

  constructor(migrationVersion: number | null, options?: ErrorOptions) {
    super(
      migrationVersion === null
        ? "PostgreSQL remediation schema upgrade failed."
        : `PostgreSQL remediation schema upgrade failed at migration ${migrationVersion}.`,
      options,
    );
    this.name = "PostgreSQLSchemaUpgradeError";
    this.migrationVersion = migrationVersion;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function deterministicLegacyId(kind: string, ...parts: string[]): string {
  return `legacy-${kind}-${sha256(parts.join("\0"))}`;
}

function migrationChecksum(version: number, name: string, signature: string): string {
  return sha256(`codeproof.postgresql.migration.v1\0${version}\0${name}\0${signature}`);
}

function normalizedBatchSize(value: number | undefined): number {
  if (value === undefined) return DEFAULT_BACKFILL_BATCH_SIZE;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError("backfillBatchSize must be a positive safe integer.");
  }
  return Math.min(value, MAX_BACKFILL_BATCH_SIZE);
}

function splitRepositoryName(repositoryName: string): { owner: string | null; name: string } {
  const slash = repositoryName.indexOf("/");
  if (slash <= 0 || slash === repositoryName.length - 1) return { owner: null, name: repositoryName };
  return { owner: repositoryName.slice(0, slash), name: repositoryName.slice(slash + 1) };
}

function affected(result: QueryResult): number {
  return result.rowCount ?? 0;
}

async function insertMarker(
  context: MigrationContext,
  values: {
    sourceTable: string;
    sourceId: string;
    targetTable: string;
    targetId: string | null;
    status: "backfilled" | "owner_unresolved" | "recompute_required";
    detail?: Record<string, unknown>;
  },
): Promise<number> {
  const id = deterministicLegacyId("marker", values.sourceTable, values.sourceId, values.targetTable);
  const result = await context.client.query(
    `INSERT INTO codeproof_legacy_migration_markers
      (id, source_table, source_id, target_table, target_id, status, legacy_marker, detail_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'pre_remediation', $7::jsonb, $8)
     ON CONFLICT (source_table, source_id, target_table) DO NOTHING`,
    [
      id,
      values.sourceTable,
      values.sourceId,
      values.targetTable,
      values.targetId,
      values.status,
      JSON.stringify(values.detail ?? {}),
      context.appliedAt,
    ],
  );
  return affected(result);
}

async function createParitySchema(context: MigrationContext): Promise<number> {
  await context.client.query(PARITY_SCHEMA_SQL);
  return 0;
}

async function extendLegacyTables(context: MigrationContext): Promise<number> {
  await context.client.query(ACCOUNT_AND_LEGACY_COLUMNS_SQL);
  return 0;
}

async function backfillRepositorySource(
  context: MigrationContext,
  sourceTable: "codeproof_candidate_repository_outcomes" | "codeproof_candidate_analyses",
  timeColumn: "updated_at" | "analyzed_at",
): Promise<number> {
  let cursor: string | null = null;
  let total = 0;

  while (true) {
    const rows: QueryResult<LegacyRepositoryRow> = await context.client.query<LegacyRepositoryRow>(`
      SELECT source.id AS source_id, source.candidate_id, candidate.owner_user_id,
             (account.id IS NOT NULL) AS owner_exists,
             source.repository_url, source.repository_name, source.${timeColumn} AS observed_at
        FROM ${sourceTable} source
        JOIN codeproof_candidates candidate ON candidate.id = source.candidate_id
        LEFT JOIN codeproof_users account ON account.id = candidate.owner_user_id
       WHERE ($1::text IS NULL OR source.id > $1)
       ORDER BY source.id
       LIMIT $2`, [cursor, context.batchSize]);
    if (rows.rows.length === 0) return total;

    for (const row of rows.rows) {
      cursor = row.source_id;
      if (!row.owner_user_id || !row.owner_exists) {
        total += await insertMarker(context, {
          sourceTable,
          sourceId: row.source_id,
          targetTable: "codeproof_candidate_repositories",
          targetId: null,
          status: "owner_unresolved",
        });
        continue;
      }

      const deterministicRepositoryId = deterministicLegacyId("candidate-repository", row.candidate_id, row.repository_url);
      const repository = splitRepositoryName(row.repository_name);
      const inserted = await context.client.query<{ id: string }>(`
        INSERT INTO codeproof_candidate_repositories
          (id, owner_user_id, candidate_id, repository_url, repository_owner, repository_name,
           discovery_origin, attribution_status, attribution_updated_at, verification_revision,
           linked_provider_identity_id, origin_confirmation_required, legacy_marker)
        VALUES ($1, $2, $3, $4, $5, $6, NULL, 'unverified', $7, NULL, NULL, TRUE, 'pre_remediation')
        ON CONFLICT (candidate_id, repository_url) DO NOTHING
        RETURNING id`, [
        deterministicRepositoryId,
        row.owner_user_id,
        row.candidate_id,
        row.repository_url,
        repository.owner,
        repository.name,
        row.observed_at,
      ]);
      total += affected(inserted);

      const repositoryId = inserted.rows[0]?.id ?? (await context.client.query<{ id: string }>(
        `SELECT id FROM codeproof_candidate_repositories
          WHERE candidate_id = $1 AND repository_url = $2`,
        [row.candidate_id, row.repository_url],
      )).rows[0]?.id;
      if (!repositoryId) throw new Error("Candidate repository backfill lost its conflict target.");

      total += affected(await context.client.query(`
        INSERT INTO codeproof_contribution_verification_events
          (id, candidate_repository_id, from_status, to_status, provider, provider_identity_fingerprint,
           repository_provider_id, immutable_revision, reason, verified_at, created_at)
        VALUES ($1, $2, 'unverified', 'unverified', NULL, NULL, NULL, NULL, 'legacy_backfill', NULL, $3)
        ON CONFLICT (id) DO NOTHING`, [
        deterministicLegacyId("verification-event", repositoryId),
        repositoryId,
        row.observed_at,
      ]));
      total += await insertMarker(context, {
        sourceTable,
        sourceId: row.source_id,
        targetTable: "codeproof_candidate_repositories",
        targetId: repositoryId,
        status: "backfilled",
        detail: { attributionStatus: "unverified", originConfirmationRequired: true },
      });
    }
  }
}

async function backfillAnalysisVersions(context: MigrationContext): Promise<number> {
  let cursor: string | null = null;
  let total = 0;

  while (true) {
    const result: QueryResult<LegacyAnalysisRow> = await context.client.query<LegacyAnalysisRow>(`
      SELECT analysis.id, analysis.candidate_id, candidate.owner_user_id,
             (account.id IS NOT NULL) AS owner_exists,
             analysis.analyzed_at, COALESCE(candidate.is_demo, FALSE) AS is_demo
        FROM codeproof_candidate_analyses analysis
        JOIN codeproof_candidates candidate ON candidate.id = analysis.candidate_id
        LEFT JOIN codeproof_users account ON account.id = candidate.owner_user_id
       WHERE ($1::text IS NULL OR analysis.id > $1)
       ORDER BY analysis.id
       LIMIT $2`, [cursor, context.batchSize]);
    if (result.rows.length === 0) return total;

    for (const row of result.rows) {
      cursor = row.id;
      if (!row.owner_user_id || !row.owner_exists) {
        total += await insertMarker(context, {
          sourceTable: "codeproof_candidate_analyses",
          sourceId: row.id,
          targetTable: "codeproof_analysis_versions",
          targetId: null,
          status: "owner_unresolved",
        });
        continue;
      }

      const versionId = deterministicLegacyId("analysis-version", row.id);
      total += affected(await context.client.query(`
        INSERT INTO codeproof_analysis_versions
          (id, owner_user_id, candidate_id, legacy_analysis_id, status, analyzed_at,
           deterministic_engine_version, taxonomy_version, requisition_version_id,
           ai_request_schema_version, provider_id, model_id, prompt_version, pricing_version,
           is_demo, recompute_required, legacy_marker, created_at)
        VALUES ($1, $2, $3, $4, 'completed', $5, 'legacy', 'legacy', NULL, NULL, NULL, NULL, NULL, NULL,
                $6, TRUE, 'pre_remediation', $7)
        ON CONFLICT (legacy_analysis_id) DO NOTHING`, [
        versionId,
        row.owner_user_id,
        row.candidate_id,
        row.id,
        row.analyzed_at,
        Boolean(row.is_demo),
        context.appliedAt,
      ]));
      total += await insertMarker(context, {
        sourceTable: "codeproof_candidate_analyses",
        sourceId: row.id,
        targetTable: "codeproof_analysis_versions",
        targetId: versionId,
        status: "recompute_required",
        detail: { deterministicEngineVersion: "legacy", taxonomyVersion: "legacy", sourceJsonPreserved: true },
      });
    }
  }
}

async function backfillCandidates(context: MigrationContext): Promise<number> {
  let total = await backfillRepositorySource(
    context,
    "codeproof_candidate_repository_outcomes",
    "updated_at",
  );
  total += await backfillRepositorySource(
    context,
    "codeproof_candidate_analyses",
    "analyzed_at",
  );
  total += await backfillAnalysisVersions(context);
  return total;
}

async function loadRequirementsForOwner(
  context: MigrationContext,
  ownerUserId: string,
): Promise<LegacyRequirementRow[]> {
  let cursor: string | null = null;
  const requirements: LegacyRequirementRow[] = [];
  while (true) {
    const result: QueryResult<LegacyRequirementRow> = await context.client.query<LegacyRequirementRow>(`
      SELECT id, requirement, importance, category, position
        FROM codeproof_company_requirements
       WHERE owner_user_id = $1
         AND ($2::text IS NULL OR id > $2)
       ORDER BY id
       LIMIT $3`, [ownerUserId, cursor, context.batchSize]);
    if (result.rows.length === 0) return requirements.sort((left, right) =>
      left.position - right.position || left.id.localeCompare(right.id));
    requirements.push(...result.rows);
    cursor = result.rows.at(-1)?.id ?? cursor;
  }
}

async function backfillRequirements(context: MigrationContext): Promise<number> {
  let total = 0;
  let unresolvedCursor: string | null = null;

  while (true) {
    const result: QueryResult<LegacyRequirementOwnerRow> = await context.client.query<LegacyRequirementOwnerRow>(`
      SELECT requirement.id AS source_id, requirement.owner_user_id,
             (account.id IS NOT NULL) AS owner_exists
        FROM codeproof_company_requirements requirement
        LEFT JOIN codeproof_users account ON account.id = requirement.owner_user_id
       WHERE ($1::text IS NULL OR requirement.id > $1)
       ORDER BY requirement.id
       LIMIT $2`, [unresolvedCursor, context.batchSize]);
    if (result.rows.length === 0) break;
    for (const row of result.rows) {
      unresolvedCursor = row.source_id;
      if (!row.owner_user_id || !row.owner_exists) {
        total += await insertMarker(context, {
          sourceTable: "codeproof_company_requirements",
          sourceId: row.source_id,
          targetTable: "codeproof_requisition_versions",
          targetId: null,
          status: "owner_unresolved",
        });
      }
    }
  }

  let ownerCursor: string | null = null;
  while (true) {
    const owners: QueryResult<{ owner_user_id: string }> = await context.client.query<{ owner_user_id: string }>(`
      SELECT requirement.owner_user_id
        FROM codeproof_company_requirements requirement
        JOIN codeproof_users account ON account.id = requirement.owner_user_id
       WHERE ($1::text IS NULL OR requirement.owner_user_id > $1)
       GROUP BY requirement.owner_user_id
       ORDER BY requirement.owner_user_id
       LIMIT $2`, [ownerCursor, context.batchSize]);
    if (owners.rows.length === 0) return total;

    for (const { owner_user_id: ownerUserId } of owners.rows) {
      ownerCursor = ownerUserId;
      const requirements = await loadRequirementsForOwner(context, ownerUserId);
      const sourceJson = JSON.stringify(requirements);
      const requisitionId = deterministicLegacyId("requisition", ownerUserId);
      const versionId = deterministicLegacyId("requisition-version", ownerUserId, sourceJson);

      total += affected(await context.client.query(`
        INSERT INTO codeproof_requisitions
          (id, owner_user_id, title, current_version, legacy_marker, created_at, updated_at)
        VALUES ($1, $2, NULL, 1, 'pre_remediation', $3, $3)
        ON CONFLICT (id) DO NOTHING`, [requisitionId, ownerUserId, context.appliedAt]));
      total += affected(await context.client.query(`
        INSERT INTO codeproof_requisition_versions
          (id, owner_user_id, requisition_id, version, criteria_json, content_hash,
           legacy_source_json, recompute_required, legacy_marker, created_at)
        VALUES ($1, $2, $3, 1, '[]'::jsonb, $4, $5::jsonb, TRUE, 'pre_remediation', $6)
        ON CONFLICT (id) DO NOTHING`, [
        versionId,
        ownerUserId,
        requisitionId,
        sha256(sourceJson),
        sourceJson,
        context.appliedAt,
      ]));
      for (const requirement of requirements) {
        total += await insertMarker(context, {
          sourceTable: "codeproof_company_requirements",
          sourceId: requirement.id,
          targetTable: "codeproof_requisition_versions",
          targetId: versionId,
          status: "recompute_required",
          detail: { sourceRequirementPreserved: true },
        });
      }
    }
  }
}

const MIGRATION_DEFINITIONS = [
  {
    version: 1,
    name: "remediation_sidecar_schema",
    signature: PARITY_SCHEMA_SQL,
    up: createParitySchema,
  },
  {
    version: 2,
    name: "account_remediation_columns",
    signature: ACCOUNT_AND_LEGACY_COLUMNS_SQL,
    up: extendLegacyTables,
  },
  {
    version: 3,
    name: "candidate_legacy_backfill",
    signature: CANDIDATE_BACKFILL_SIGNATURE,
    up: backfillCandidates,
  },
  {
    version: 4,
    name: "requirements_legacy_backfill",
    signature: REQUIREMENTS_BACKFILL_SIGNATURE,
    up: backfillRequirements,
  },
].map((migration): PostgreSQLMigration => ({
  ...migration,
  checksum: migrationChecksum(migration.version, migration.name, migration.signature),
}));

export const POSTGRESQL_REMEDIATION_MIGRATIONS: readonly PostgreSQLMigrationInfo[] = Object.freeze(
  MIGRATION_DEFINITIONS.map(({ version, name, checksum }) => Object.freeze({ version, name, checksum })),
);

async function ensureLedger(client: PoolClient): Promise<void> {
  await client.query(`CREATE TABLE IF NOT EXISTS codeproof_schema_versions (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL,
    affected_rows INTEGER NOT NULL DEFAULT 0 CHECK(affected_rows >= 0)
  )`);
}

async function initializeAccountSchema(
  client: PoolClient,
  options: EnsurePostgreSQLRemediationSchemaOptions,
): Promise<void> {
  const invalid = await client.query(`SELECT id FROM codeproof_users
    WHERE role NOT IN ('RECRUITER', 'ADMIN')
       OR lifecycle_state NOT IN ('active', 'suspended', 'soft_deleted')
    LIMIT 1`);
  if (invalid.rowCount) throw new Error("Persisted account role or lifecycle state is invalid.");

  const bootstrap = normalizeAdminBootstrap(options.adminEmail);
  if (!bootstrap.normalizedEmail) {
    if (bootstrap.unresolvedDiagnostic) options.onAdminBootstrapDiagnostic?.(bootstrap.unresolvedDiagnostic);
    return;
  }

  const normalizedEmail = bootstrap.normalizedEmail;
  const existingAdmins = await client.query<{ id: string; email: string }>(
    "SELECT id, email FROM codeproof_users WHERE role = 'ADMIN' ORDER BY id",
  );
  if (existingAdmins.rows.length > 0) {
    const matchingAdmin = existingAdmins.rows.some((account) => account.email.trim().toLowerCase() === normalizedEmail);
    if (!matchingAdmin) options.onAdminBootstrapDiagnostic?.(divergentAdminDiagnostic(normalizedEmail));
    return;
  }

  const result = await client.query(`UPDATE codeproof_users SET role = 'ADMIN'
    WHERE lower(trim(email)) = $1 AND role <> 'ADMIN'`, [normalizedEmail]);
  if (!result.rowCount) options.onAdminBootstrapDiagnostic?.(noMatchingAdminDiagnostic(normalizedEmail));
}

/**
 * Applies the PostgreSQL remediation schema in one transaction serialized by an advisory xact lock.
 * Any DDL, backfill, checksum, or ledger failure rolls back and prevents the calling store from
 * becoming ready. Legacy source tables and JSON are read only; all derived data is conflict-safe.
 */
export async function ensurePostgreSQLRemediationSchema(
  pool: Pool,
  options: EnsurePostgreSQLRemediationSchemaOptions = {},
): Promise<void> {
  const batchSize = normalizedBatchSize(options.backfillBatchSize);
  const client = await pool.connect();
  let activeMigration: number | null = null;
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;
    await client.query("SELECT pg_advisory_xact_lock($1)", [MIGRATION_ADVISORY_LOCK_KEY]);
    await ensureLedger(client);

    const ledger = await client.query<SchemaVersionRow>(
      "SELECT version, name, checksum FROM codeproof_schema_versions ORDER BY version",
    );
    const applied = new Map(ledger.rows.map((row) => [Number(row.version), row]));
    const appliedAt = new Date().toISOString();

    for (const migration of MIGRATION_DEFINITIONS) {
      activeMigration = migration.version;
      const existing = applied.get(migration.version);
      if (existing) {
        if (existing.name !== migration.name || existing.checksum !== migration.checksum) {
          throw new Error("Migration ledger checksum mismatch.");
        }
        continue;
      }

      options.beforeMigration?.(migration);
      const affectedRows = await migration.up({ client, batchSize, appliedAt });
      await client.query(
        `INSERT INTO codeproof_schema_versions
          (version, name, checksum, applied_at, affected_rows)
         VALUES ($1, $2, $3, $4, $5)`,
        [migration.version, migration.name, migration.checksum, appliedAt, affectedRows],
      );
      applied.set(migration.version, migration);
    }

    if (options.initializeAccounts) await initializeAccountSchema(client, options);

    await client.query("COMMIT");
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original upgrade failure as the readiness diagnostic.
      }
    }
    throw new PostgreSQLSchemaUpgradeError(activeMigration, { cause: error });
  } finally {
    client.release();
  }
}
