import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

const DEFAULT_BACKFILL_BATCH_SIZE = 100;
const MAX_BACKFILL_BATCH_SIZE = 1_000;

const ACCOUNT_COLUMNS = [
  ["role", "role TEXT NOT NULL DEFAULT 'RECRUITER'"],
  ["lifecycle_state", "lifecycle_state TEXT NOT NULL DEFAULT 'active'"],
  ["is_demo", "is_demo INTEGER NOT NULL DEFAULT 0"],
  ["demo_label", "demo_label TEXT DEFAULT NULL"],
  ["company_name", "company_name TEXT DEFAULT NULL"],
  ["plan_tier_id", "plan_tier_id TEXT DEFAULT NULL"],
  ["last_activity_at", "last_activity_at TEXT DEFAULT NULL"],
  ["suspended_at", "suspended_at TEXT DEFAULT NULL"],
  ["soft_deleted_at", "soft_deleted_at TEXT DEFAULT NULL"],
] as const;

const CANDIDATE_COLUMNS = [
  ["owner_user_id", "owner_user_id TEXT DEFAULT NULL"],
  ["is_demo", "is_demo INTEGER NOT NULL DEFAULT 0"],
  ["repository_count", "repository_count INTEGER NOT NULL DEFAULT 0"],
  ["verified_claim_count", "verified_claim_count INTEGER NOT NULL DEFAULT 0"],
  ["evidence_reviewed_at", "evidence_reviewed_at TEXT DEFAULT NULL"],
  ["unanalyzed_sources", "unanalyzed_sources TEXT DEFAULT NULL"],
] as const;

const REQUIREMENT_COLUMNS = [
  ["owner_user_id", "owner_user_id TEXT DEFAULT NULL"],
] as const;

const SIDECAR_SCHEMA_SQL = `
  -- Existing stores may initialize independently in tests and local tools. Creating the
  -- established account anchor here is additive and lets owner foreign keys remain valid
  -- regardless of which store opens the database first.
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS legacy_migration_markers (
    id TEXT PRIMARY KEY,
    source_table TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_table TEXT NOT NULL,
    target_id TEXT,
    status TEXT NOT NULL CHECK(status IN ('backfilled', 'owner_unresolved', 'recompute_required')),
    legacy_marker TEXT NOT NULL,
    detail_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    UNIQUE(source_table, source_id, target_table)
  );

  CREATE TABLE IF NOT EXISTS candidate_repositories (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    repository_url TEXT NOT NULL,
    repository_owner TEXT,
    repository_name TEXT NOT NULL,
    discovery_origin TEXT CHECK(discovery_origin IS NULL OR discovery_origin IN ('CV', 'portfolio', 'GitHub profile', 'manual entry')),
    attribution_status TEXT NOT NULL DEFAULT 'unverified' CHECK(attribution_status IN ('unverified', 'candidate_claimed', 'verified_owner', 'verified_contributor')),
    attribution_updated_at TEXT NOT NULL,
    verification_revision TEXT,
    linked_provider_identity_id TEXT,
    origin_confirmation_required INTEGER NOT NULL DEFAULT 0 CHECK(origin_confirmation_required IN (0, 1)),
    legacy_marker TEXT,
    UNIQUE(candidate_id, repository_url)
  );

  CREATE TABLE IF NOT EXISTS contribution_verification_events (
    id TEXT PRIMARY KEY,
    candidate_repository_id TEXT NOT NULL REFERENCES candidate_repositories(id) ON DELETE CASCADE,
    from_status TEXT NOT NULL CHECK(from_status IN ('unverified', 'candidate_claimed', 'verified_owner', 'verified_contributor')),
    to_status TEXT NOT NULL CHECK(to_status IN ('unverified', 'candidate_claimed', 'verified_owner', 'verified_contributor')),
    provider TEXT,
    provider_identity_fingerprint TEXT,
    repository_provider_id TEXT,
    immutable_revision TEXT,
    reason TEXT NOT NULL CHECK(reason IN ('candidate_source_claim', 'provider_owner_confirmed', 'provider_contribution_confirmed', 'verification_stale', 'legacy_backfill', 'recruiter_confirmed_origin')),
    verified_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS taxonomy_versions (
    version TEXT PRIMARY KEY,
    effective_at TEXT NOT NULL,
    evidence_policy_version TEXT NOT NULL,
    nodes_json TEXT NOT NULL,
    content_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS capability_nodes (
    taxonomy_version TEXT NOT NULL REFERENCES taxonomy_versions(version) ON DELETE CASCADE,
    id TEXT NOT NULL,
    label_en TEXT NOT NULL,
    label_ar TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('language', 'framework', 'library', 'database', 'testing', 'security', 'architecture', 'devops', 'domain')),
    detector_ids_json TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY(taxonomy_version, id)
  );

  CREATE TABLE IF NOT EXISTS capability_aliases (
    taxonomy_version TEXT NOT NULL,
    capability_id TEXT NOT NULL,
    alias TEXT NOT NULL,
    normalized_alias TEXT NOT NULL,
    PRIMARY KEY(taxonomy_version, normalized_alias),
    FOREIGN KEY(taxonomy_version, capability_id) REFERENCES capability_nodes(taxonomy_version, id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS capability_relations (
    taxonomy_version TEXT NOT NULL,
    source_capability_id TEXT NOT NULL,
    relation_type TEXT NOT NULL CHECK(relation_type IN ('broader_than', 'narrower_than', 'related_to', 'evidence_requires', 'incompatible_with')),
    target_capability_id TEXT NOT NULL,
    PRIMARY KEY(taxonomy_version, source_capability_id, relation_type, target_capability_id),
    FOREIGN KEY(taxonomy_version, source_capability_id) REFERENCES capability_nodes(taxonomy_version, id) ON DELETE CASCADE,
    FOREIGN KEY(taxonomy_version, target_capability_id) REFERENCES capability_nodes(taxonomy_version, id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS analysis_versions (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    legacy_analysis_id TEXT UNIQUE REFERENCES candidate_analyses(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('running', 'completed', 'failed')),
    analyzed_at TEXT NOT NULL,
    deterministic_engine_version TEXT NOT NULL,
    taxonomy_version TEXT NOT NULL,
    requisition_version_id TEXT,
    ai_request_schema_version TEXT,
    provider_id TEXT,
    model_id TEXT,
    prompt_version TEXT,
    pricing_version TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0, 1)),
    recompute_required INTEGER NOT NULL DEFAULT 0 CHECK(recompute_required IN (0, 1)),
    legacy_marker TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS detector_findings (
    id TEXT PRIMARY KEY,
    analysis_version_id TEXT NOT NULL REFERENCES analysis_versions(id) ON DELETE CASCADE,
    candidate_repository_id TEXT REFERENCES candidate_repositories(id) ON DELETE CASCADE,
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

  CREATE TABLE IF NOT EXISTS evidence_items (
    id TEXT PRIMARY KEY,
    analysis_version_id TEXT NOT NULL REFERENCES analysis_versions(id) ON DELETE CASCADE,
    finding_id TEXT NOT NULL REFERENCES detector_findings(id) ON DELETE CASCADE,
    capability_id TEXT NOT NULL,
    claim_scope TEXT NOT NULL,
    evidence_level TEXT NOT NULL CHECK(evidence_level IN ('strong', 'good', 'partial', 'limited', 'insufficient')),
    taxonomy_version TEXT NOT NULL,
    UNIQUE(analysis_version_id, finding_id, capability_id, claim_scope)
  );

  CREATE TABLE IF NOT EXISTS evidence_citations (
    id TEXT PRIMARY KEY,
    analysis_version_id TEXT NOT NULL REFERENCES analysis_versions(id) ON DELETE CASCADE,
    finding_id TEXT NOT NULL REFERENCES detector_findings(id) ON DELETE CASCADE,
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

  CREATE TABLE IF NOT EXISTS candidate_conclusions (
    id TEXT PRIMARY KEY,
    analysis_version_id TEXT NOT NULL REFERENCES analysis_versions(id) ON DELETE CASCADE,
    capability_id TEXT NOT NULL,
    evidence_level TEXT NOT NULL CHECK(evidence_level IN ('strong', 'good', 'partial')),
    citation_ids_json TEXT NOT NULL,
    eligibility TEXT NOT NULL CHECK(eligibility IN ('eligible', 'unsupported')),
    explanation TEXT NOT NULL,
    claim_scope TEXT NOT NULL,
    recompute_required INTEGER NOT NULL DEFAULT 0 CHECK(recompute_required IN (0, 1)),
    legacy_marker TEXT,
    UNIQUE(analysis_version_id, capability_id, claim_scope)
  );

  CREATE TABLE IF NOT EXISTS evidence_gaps (
    id TEXT PRIMARY KEY,
    analysis_version_id TEXT NOT NULL REFERENCES analysis_versions(id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    capability_id TEXT NOT NULL,
    claim_scope TEXT NOT NULL,
    reason TEXT NOT NULL,
    UNIQUE(analysis_version_id, candidate_id, capability_id, claim_scope)
  );

  CREATE TABLE IF NOT EXISTS interview_questions (
    id TEXT PRIMARY KEY,
    analysis_version_id TEXT NOT NULL REFERENCES analysis_versions(id) ON DELETE CASCADE,
    basis_kind TEXT NOT NULL CHECK(basis_kind IN ('evidence', 'gap')),
    basis_json TEXT NOT NULL,
    attribution_gate TEXT NOT NULL CHECK(attribution_gate IN ('unverified', 'candidate_claimed', 'verified_owner', 'verified_contributor')),
    question TEXT NOT NULL,
    redaction_applied INTEGER NOT NULL CHECK(redaction_applied IN (0, 1))
  );

  CREATE TABLE IF NOT EXISTS repository_corpus_metrics (
    id TEXT PRIMARY KEY,
    analysis_version_id TEXT NOT NULL REFERENCES analysis_versions(id) ON DELETE CASCADE,
    candidate_repository_id TEXT NOT NULL REFERENCES candidate_repositories(id) ON DELETE CASCADE,
    repository_id TEXT NOT NULL,
    revision TEXT,
    analyzed_at TEXT NOT NULL,
    metrics_json TEXT NOT NULL,
    UNIQUE(analysis_version_id, candidate_repository_id)
  );

  CREATE TABLE IF NOT EXISTS repository_run_metrics (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    analysis_version_id TEXT NOT NULL UNIQUE REFERENCES analysis_versions(id) ON DELETE CASCADE,
    state TEXT NOT NULL CHECK(state IN ('running', 'completed')),
    selected_repository_count INTEGER NOT NULL CHECK(selected_repository_count >= 0),
    successful_repository_count INTEGER NOT NULL CHECK(successful_repository_count >= 0),
    failed_repository_count INTEGER NOT NULL CHECK(failed_repository_count >= 0),
    pending_repository_count INTEGER NOT NULL CHECK(pending_repository_count >= 0),
    attribution_counts_json TEXT NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0, 1)),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS requisitions (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT,
    current_version INTEGER NOT NULL DEFAULT 0 CHECK(current_version >= 0),
    legacy_marker TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(owner_user_id, id)
  );

  CREATE TABLE IF NOT EXISTS requisition_versions (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requisition_id TEXT NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
    version INTEGER NOT NULL CHECK(version > 0),
    criteria_json TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    legacy_source_json TEXT,
    recompute_required INTEGER NOT NULL DEFAULT 0 CHECK(recompute_required IN (0, 1)),
    legacy_marker TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(requisition_id, version),
    UNIQUE(owner_user_id, requisition_id, content_hash)
  );

  CREATE TABLE IF NOT EXISTS saved_comparisons (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requisition_version_id TEXT NOT NULL REFERENCES requisition_versions(id) ON DELETE CASCADE,
    candidate_analysis_version_ids_json TEXT NOT NULL,
    result_json TEXT NOT NULL,
    idempotency_key TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(owner_user_id, idempotency_key)
  );

  CREATE TABLE IF NOT EXISTS review_orders (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requisition_version_id TEXT NOT NULL REFERENCES requisition_versions(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status = 'draft'),
    entries_json TEXT NOT NULL,
    idempotency_key TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(owner_user_id, idempotency_key)
  );

  CREATE TABLE IF NOT EXISTS evidence_checks (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    analysis_version_id TEXT NOT NULL REFERENCES analysis_versions(id) ON DELETE CASCADE,
    requisition_version_id TEXT NOT NULL REFERENCES requisition_versions(id) ON DELETE CASCADE,
    checked_at TEXT NOT NULL,
    UNIQUE(owner_user_id, candidate_id, analysis_version_id, requisition_version_id)
  );

  CREATE TABLE IF NOT EXISTS ai_telemetry (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
    estimated_cost_micros TEXT,
    actual_cost_micros TEXT,
    actual_cost_status TEXT NOT NULL CHECK(actual_cost_status IN ('available', 'unavailable')),
    currency TEXT CHECK(currency IS NULL OR currency = 'USD'),
    pricing_version TEXT,
    schema_version TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    taxonomy_version TEXT NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0, 1)),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS analysis_cache_v2 (
    cache_key TEXT PRIMARY KEY,
    analysis_version_id TEXT REFERENCES analysis_versions(id) ON DELETE CASCADE,
    result_json TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    taxonomy_version TEXT NOT NULL,
    pricing_version TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pricing_registry (
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    registry_version TEXT NOT NULL,
    currency TEXT NOT NULL CHECK(currency = 'USD'),
    units TEXT NOT NULL,
    input_micros TEXT NOT NULL,
    cached_input_micros TEXT,
    output_micros TEXT NOT NULL,
    effective_at TEXT NOT NULL,
    checked_at TEXT NOT NULL,
    official_source_url TEXT NOT NULL,
    PRIMARY KEY(provider_id, model_id, registry_version)
  );

  CREATE TABLE IF NOT EXISTS pilot_tiers (
    id TEXT NOT NULL,
    version TEXT NOT NULL,
    display_name_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(id, version)
  );

  CREATE TABLE IF NOT EXISTS pilot_entitlements (
    tier_id TEXT NOT NULL,
    tier_version TEXT NOT NULL,
    entitlement_id TEXT NOT NULL,
    enabled INTEGER NOT NULL CHECK(enabled IN (0, 1)),
    PRIMARY KEY(tier_id, tier_version, entitlement_id),
    FOREIGN KEY(tier_id, tier_version) REFERENCES pilot_tiers(id, version) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS pilot_quotas (
    tier_id TEXT NOT NULL,
    tier_version TEXT NOT NULL,
    quota_kind TEXT NOT NULL CHECK(quota_kind IN ('candidates', 'repository_analyses', 'paid_ai_usage', 'active_external_shares', 'recruiter_seats')),
    quota_limit INTEGER NOT NULL CHECK(quota_limit >= 0),
    period_id TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    PRIMARY KEY(tier_id, tier_version, quota_kind, period_id),
    FOREIGN KEY(tier_id, tier_version) REFERENCES pilot_tiers(id, version) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS usage_reservations (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    quota_kind TEXT NOT NULL CHECK(quota_kind IN ('candidates', 'repository_analyses', 'paid_ai_usage', 'active_external_shares', 'recruiter_seats')),
    usage_period_id TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK(amount > 0),
    status TEXT NOT NULL CHECK(status IN ('reserved', 'committed', 'released', 'expired')),
    is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0, 1)),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    UNIQUE(owner_user_id, idempotency_key)
  );

  CREATE TABLE IF NOT EXISTS usage_ledger (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reservation_id TEXT NOT NULL UNIQUE REFERENCES usage_reservations(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    quota_kind TEXT NOT NULL,
    usage_period_id TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK(amount > 0),
    is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0, 1)),
    committed_at TEXT NOT NULL,
    UNIQUE(owner_user_id, idempotency_key)
  );

  CREATE TABLE IF NOT EXISTS external_shares (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    analysis_version_id TEXT NOT NULL REFERENCES analysis_versions(id) ON DELETE CASCADE,
    token_digest TEXT NOT NULL UNIQUE,
    expiry_option TEXT NOT NULL DEFAULT '7d' CHECK(expiry_option IN ('24h', '7d', '30d')),
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    passcode_required INTEGER NOT NULL DEFAULT 0 CHECK(passcode_required IN (0, 1)),
    passcode_digest TEXT,
    email_verification_required INTEGER NOT NULL DEFAULT 0 CHECK(email_verification_required IN (0, 1)),
    email_address_digest TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0, 1)),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS external_report_snapshots (
    id TEXT PRIMARY KEY,
    share_id TEXT NOT NULL UNIQUE REFERENCES external_shares(id) ON DELETE CASCADE,
    projection_json TEXT NOT NULL,
    taxonomy_version TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS share_validation_limits (
    key_digest TEXT PRIMARY KEY,
    window_started_at TEXT NOT NULL,
    attempt_count INTEGER NOT NULL CHECK(attempt_count >= 0),
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS share_access_log (
    id TEXT PRIMARY KEY,
    share_id TEXT NOT NULL REFERENCES external_shares(id) ON DELETE CASCADE,
    occurred_at TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK(outcome IN ('granted', 'denied_invalid', 'denied_expired', 'denied_revoked', 'denied_passcode', 'denied_email_verification', 'rate_limited')),
    applied_controls_json TEXT NOT NULL,
    ip_fingerprint TEXT NOT NULL,
    user_agent_family TEXT,
    coarse_region TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0, 1))
  );

  CREATE TABLE IF NOT EXISTS share_email_verifications (
    id TEXT PRIMARY KEY,
    share_id TEXT NOT NULL REFERENCES external_shares(id) ON DELETE CASCADE,
    session_digest TEXT NOT NULL,
    code_digest TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
    verified_at TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(share_id, session_digest)
  );

  CREATE TABLE IF NOT EXISTS admin_audit_log (
    id TEXT PRIMARY KEY,
    sequence INTEGER NOT NULL UNIQUE CHECK(sequence > 0),
    occurred_at TEXT NOT NULL,
    actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    actor_role TEXT NOT NULL CHECK(actor_role IN ('RECRUITER', 'ADMIN')),
    impersonated_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
    action TEXT NOT NULL,
    action_category TEXT NOT NULL,
    target_kind TEXT NOT NULL CHECK(target_kind IN ('account', 'share', 'candidate', 'analysis', 'quota', 'impersonation_grant', 'none')),
    target_id TEXT,
    outcome TEXT NOT NULL CHECK(outcome IN ('succeeded', 'denied', 'failed')),
    denial_reason TEXT,
    parameters_json TEXT NOT NULL,
    before_json TEXT,
    after_json TEXT,
    request_correlation_id TEXT NOT NULL,
    request_method TEXT NOT NULL,
    route TEXT NOT NULL,
    ip_fingerprint TEXT NOT NULL,
    user_agent_family TEXT,
    previous_entry_hash TEXT NOT NULL UNIQUE,
    entry_hash TEXT NOT NULL UNIQUE
  );

  CREATE TRIGGER IF NOT EXISTS admin_audit_log_no_update
    BEFORE UPDATE ON admin_audit_log
    BEGIN SELECT RAISE(ABORT, 'admin_audit_append_only'); END;
  CREATE TRIGGER IF NOT EXISTS admin_audit_log_no_delete
    BEFORE DELETE ON admin_audit_log
    BEGIN SELECT RAISE(ABORT, 'admin_audit_append_only'); END;

  CREATE TABLE IF NOT EXISTS admin_authorization_attempts (
    key_digest TEXT PRIMARY KEY,
    window_started_at TEXT NOT NULL,
    attempt_count INTEGER NOT NULL CHECK(attempt_count >= 0),
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS impersonation_grants (
    grant_id TEXT PRIMARY KEY,
    admin_actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reason_redacted TEXT NOT NULL,
    started_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    ended_at TEXT,
    end_reason TEXT CHECK(end_reason IS NULL OR end_reason IN ('returned', 'expired', 'revoked', 'disabled')),
    start_audit_entry_id TEXT NOT NULL REFERENCES admin_audit_log(id) ON DELETE RESTRICT,
    end_audit_entry_id TEXT REFERENCES admin_audit_log(id) ON DELETE RESTRICT
  );

  CREATE TABLE IF NOT EXISTS demo_fixture_baselines (
    owner_user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    demo_fixture_version TEXT NOT NULL,
    baseline_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS verification_cycles (
    id TEXT PRIMARY KEY,
    ordinal INTEGER NOT NULL UNIQUE CHECK(ordinal > 0),
    commit_hash TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    checks_json TEXT NOT NULL,
    defects_opened_json TEXT NOT NULL,
    defects_closed_json TEXT NOT NULL,
    browser_console_artifact_id TEXT,
    server_output_artifact_id TEXT
  );

  CREATE TABLE IF NOT EXISTS release_gate_passes (
    id TEXT PRIMARY KEY,
    pass_ordinal INTEGER NOT NULL CHECK(pass_ordinal IN (1, 2)),
    commit_hash TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    check_outcomes_json TEXT NOT NULL,
    new_defects_discovered_json TEXT NOT NULL,
    reset_triggered_by_defect_id TEXT,
    UNIQUE(commit_hash, pass_ordinal, started_at)
  );

  CREATE TABLE IF NOT EXISTS defects (
    id TEXT PRIMARY KEY,
    severity TEXT NOT NULL CHECK(severity IN ('critical', 'high', 'medium', 'low')),
    status TEXT NOT NULL CHECK(status IN ('open', 'resolved')),
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    opened_at TEXT NOT NULL,
    resolved_at TEXT,
    severity_history_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS criterion_integrity_baselines (
    criterion_id TEXT PRIMARY KEY,
    criterion_text TEXT NOT NULL,
    criterion_hash TEXT NOT NULL UNIQUE,
    recorded_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS criterion_change_approvals (
    id TEXT PRIMARY KEY,
    criterion_id TEXT NOT NULL REFERENCES criterion_integrity_baselines(criterion_id) ON DELETE RESTRICT,
    approver TEXT NOT NULL,
    approved_at TEXT NOT NULL,
    prior_text TEXT NOT NULL,
    new_text TEXT NOT NULL,
    rationale TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS demo_simulation_runs (
    id TEXT PRIMARY KEY,
    account_mode TEXT NOT NULL CHECK(account_mode IN ('fresh', 'existing')),
    locale TEXT NOT NULL CHECK(locale IN ('en', 'ar')),
    viewport TEXT NOT NULL,
    commit_hash TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    outcome TEXT NOT NULL CHECK(outcome IN ('passed', 'failed', 'running')),
    steps_json TEXT NOT NULL,
    artifact_ids_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS release_verifications (
    id TEXT PRIMARY KEY,
    target TEXT NOT NULL CHECK(target IN ('local', 'vercel_preview', 'vercel_production')),
    deployment_url TEXT,
    build_metadata_json TEXT NOT NULL,
    verified_at TEXT NOT NULL,
    checks_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS release_disclosures (
    id TEXT PRIMARY KEY,
    release_commit_hash TEXT,
    generated_at TEXT NOT NULL,
    disclosure_json TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_legacy_migration_markers_source ON legacy_migration_markers(source_table, source_id);
  CREATE INDEX IF NOT EXISTS idx_candidate_repositories_owner ON candidate_repositories(owner_user_id, candidate_id);
  CREATE INDEX IF NOT EXISTS idx_candidate_repositories_attribution ON candidate_repositories(attribution_status, origin_confirmation_required);
  CREATE INDEX IF NOT EXISTS idx_contribution_events_repository ON contribution_verification_events(candidate_repository_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_analysis_versions_owner ON analysis_versions(owner_user_id, candidate_id, analyzed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_detector_findings_analysis ON detector_findings(analysis_version_id, capability_id);
  CREATE INDEX IF NOT EXISTS idx_evidence_citations_analysis ON evidence_citations(analysis_version_id, finding_id);
  CREATE INDEX IF NOT EXISTS idx_candidate_conclusions_analysis ON candidate_conclusions(analysis_version_id, capability_id);
  CREATE INDEX IF NOT EXISTS idx_repository_run_metrics_owner ON repository_run_metrics(owner_user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_requisitions_owner ON requisitions(owner_user_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_requisition_versions_owner ON requisition_versions(owner_user_id, requisition_id, version DESC);
  CREATE INDEX IF NOT EXISTS idx_saved_comparisons_owner ON saved_comparisons(owner_user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_review_orders_owner ON review_orders(owner_user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_ai_telemetry_owner ON ai_telemetry(owner_user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_usage_reservations_quota ON usage_reservations(owner_user_id, quota_kind, usage_period_id, status);
  CREATE INDEX IF NOT EXISTS idx_usage_ledger_quota ON usage_ledger(owner_user_id, quota_kind, usage_period_id);
  CREATE INDEX IF NOT EXISTS idx_external_shares_owner ON external_shares(owner_user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_external_shares_scope ON external_shares(candidate_id, analysis_version_id);
  CREATE INDEX IF NOT EXISTS idx_share_access_log_share ON share_access_log(share_id, occurred_at DESC);
  CREATE INDEX IF NOT EXISTS idx_admin_audit_sequence ON admin_audit_log(sequence);
  CREATE INDEX IF NOT EXISTS idx_impersonation_active ON impersonation_grants(admin_actor_user_id, ended_at, expires_at);
  CREATE INDEX IF NOT EXISTS idx_defects_status_severity ON defects(status, severity);
`;

interface MigrationContext {
  readonly db: DatabaseSync;
  readonly batchSize: number;
  readonly appliedAt: string;
}

export interface SQLiteMigrationInfo {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
}

interface SQLiteMigration extends SQLiteMigrationInfo {
  readonly signature: string;
  readonly eligible: (db: DatabaseSync) => boolean;
  readonly up: (context: MigrationContext) => number;
}

export interface EnsureRemediationSchemaOptions {
  /** Binds every legacy scan to a finite page size without changing transaction atomicity. */
  readonly backfillBatchSize?: number;
  /** Test/diagnostic seam used to prove rollback. Production callers leave it unset. */
  readonly beforeMigration?: (migration: SQLiteMigrationInfo) => void;
}

interface SchemaVersionRow {
  version: number;
  name: string;
  checksum: string;
}

export class SQLiteSchemaUpgradeError extends Error {
  readonly code = "SCHEMA_UPGRADE_FAILED";
  readonly migrationVersion: number | null;

  constructor(migrationVersion: number | null, options?: ErrorOptions) {
    super(
      migrationVersion === null
        ? "SQLite remediation schema upgrade failed."
        : `SQLite remediation schema upgrade failed at migration ${migrationVersion}.`,
      options,
    );
    this.name = "SQLiteSchemaUpgradeError";
    this.migrationVersion = migrationVersion;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function migrationChecksum(version: number, name: string, signature: string): string {
  return sha256(`codeproof.sqlite.migration.v1\0${version}\0${name}\0${signature}`);
}

function tableExists(db: DatabaseSync, table: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function columns(db: DatabaseSync, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info("${table.replaceAll('"', '""')}")`).all() as unknown as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function addColumns(
  db: DatabaseSync,
  table: string,
  definitions: readonly (readonly [string, string])[],
): number {
  const existing = columns(db, table);
  let changed = 0;
  for (const [name, definition] of definitions) {
    if (existing.has(name)) continue;
    db.exec(`ALTER TABLE "${table.replaceAll('"', '""')}" ADD COLUMN ${definition}`);
    existing.add(name);
    changed += 1;
  }
  return changed;
}

function changes(result: { changes: number | bigint }): number {
  return Number(result.changes);
}

function deterministicLegacyId(kind: string, ...parts: string[]): string {
  return `legacy-${kind}-${sha256(parts.join("\0"))}`;
}

function marker(
  context: MigrationContext,
  values: {
    sourceTable: string;
    sourceId: string;
    targetTable: string;
    targetId: string | null;
    status: "backfilled" | "owner_unresolved" | "recompute_required";
    detail?: Record<string, unknown>;
  },
): number {
  const id = deterministicLegacyId("marker", values.sourceTable, values.sourceId, values.targetTable);
  return changes(context.db.prepare(`INSERT OR IGNORE INTO legacy_migration_markers
    (id, source_table, source_id, target_table, target_id, status, legacy_marker, detail_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pre_remediation', ?, ?)`)
    .run(
      id,
      values.sourceTable,
      values.sourceId,
      values.targetTable,
      values.targetId,
      values.status,
      JSON.stringify(values.detail ?? {}),
      context.appliedAt,
    ));
}

function boundedRows<Row extends { source_rowid: number }>(
  context: MigrationContext,
  sql: string,
  visit: (row: Row) => number,
): number {
  let cursor = 0;
  let total = 0;
  const statement = context.db.prepare(sql);
  while (true) {
    const rows = statement.all(cursor, context.batchSize) as unknown as Row[];
    if (rows.length === 0) return total;
    for (const row of rows) {
      total += visit(row);
      cursor = Number(row.source_rowid);
    }
  }
}

function createSidecars(context: MigrationContext): number {
  context.db.exec(SIDECAR_SCHEMA_SQL);
  return 0;
}

function extendAccounts(context: MigrationContext): number {
  const count = addColumns(context.db, "users", ACCOUNT_COLUMNS);
  const invalid = context.db.prepare(`SELECT id FROM users
    WHERE role NOT IN ('RECRUITER', 'ADMIN')
       OR lifecycle_state NOT IN ('active', 'suspended', 'soft_deleted')
       OR is_demo NOT IN (0, 1)
    LIMIT 1`).get();
  if (invalid) throw new Error("Non-canonical legacy account state.");
  return count;
}

interface LegacyRepositoryRow {
  source_rowid: number;
  source_id: string;
  candidate_id: string;
  owner_user_id: string | null;
  owner_exists: number;
  repository_url: string;
  repository_name: string;
  observed_at: string;
}

function splitRepositoryName(repositoryName: string): { owner: string | null; name: string } {
  const slash = repositoryName.indexOf("/");
  if (slash <= 0 || slash === repositoryName.length - 1) return { owner: null, name: repositoryName };
  return { owner: repositoryName.slice(0, slash), name: repositoryName.slice(slash + 1) };
}

function backfillRepositorySource(
  context: MigrationContext,
  sourceTable: "candidate_repository_outcomes" | "candidate_analyses",
  timeColumn: "updated_at" | "analyzed_at",
): number {
  if (!tableExists(context.db, sourceTable)) return 0;
  const tableName = sourceTable.replaceAll('"', '""');
  const timestamp = timeColumn.replaceAll('"', '""');
  return boundedRows<LegacyRepositoryRow>(context, `
    SELECT source.rowid AS source_rowid, source.id AS source_id, source.candidate_id,
           candidate.owner_user_id,
           CASE WHEN account.id IS NULL THEN 0 ELSE 1 END AS owner_exists,
           source.repository_url, source.repository_name, source."${timestamp}" AS observed_at
      FROM "${tableName}" source
      JOIN candidates candidate ON candidate.id = source.candidate_id
      LEFT JOIN users account ON account.id = candidate.owner_user_id
     WHERE source.rowid > ?
     ORDER BY source.rowid
     LIMIT ?`, (row) => {
    if (!row.owner_user_id || Number(row.owner_exists) !== 1) {
      return marker(context, {
        sourceTable,
        sourceId: row.source_id,
        targetTable: "candidate_repositories",
        targetId: null,
        status: "owner_unresolved",
      });
    }

    const repositoryId = deterministicLegacyId("candidate-repository", row.candidate_id, row.repository_url);
    const repository = splitRepositoryName(row.repository_name);
    let count = changes(context.db.prepare(`INSERT OR IGNORE INTO candidate_repositories
      (id, owner_user_id, candidate_id, repository_url, repository_owner, repository_name,
       discovery_origin, attribution_status, attribution_updated_at, verification_revision,
       linked_provider_identity_id, origin_confirmation_required, legacy_marker)
      VALUES (?, ?, ?, ?, ?, ?, NULL, 'unverified', ?, NULL, NULL, 1, 'pre_remediation')`)
      .run(
        repositoryId,
        row.owner_user_id,
        row.candidate_id,
        row.repository_url,
        repository.owner,
        repository.name,
        row.observed_at,
      ));
    count += changes(context.db.prepare(`INSERT OR IGNORE INTO contribution_verification_events
      (id, candidate_repository_id, from_status, to_status, provider, provider_identity_fingerprint,
       repository_provider_id, immutable_revision, reason, verified_at, created_at)
      VALUES (?, ?, 'unverified', 'unverified', NULL, NULL, NULL, NULL, 'legacy_backfill', NULL, ?)`)
      .run(deterministicLegacyId("verification-event", repositoryId), repositoryId, row.observed_at));
    count += marker(context, {
      sourceTable,
      sourceId: row.source_id,
      targetTable: "candidate_repositories",
      targetId: repositoryId,
      status: "backfilled",
      detail: { attributionStatus: "unverified", originConfirmationRequired: true },
    });
    return count;
  });
}

interface LegacyAnalysisRow {
  source_rowid: number;
  id: string;
  candidate_id: string;
  owner_user_id: string | null;
  owner_exists: number;
  analyzed_at: string;
  is_demo: number;
}

function backfillAnalysisVersions(context: MigrationContext): number {
  if (!tableExists(context.db, "candidate_analyses")) return 0;
  return boundedRows<LegacyAnalysisRow>(context, `
    SELECT analysis.rowid AS source_rowid, analysis.id, analysis.candidate_id,
           candidate.owner_user_id,
           CASE WHEN account.id IS NULL THEN 0 ELSE 1 END AS owner_exists,
           analysis.analyzed_at, COALESCE(candidate.is_demo, 0) AS is_demo
      FROM candidate_analyses analysis
      JOIN candidates candidate ON candidate.id = analysis.candidate_id
      LEFT JOIN users account ON account.id = candidate.owner_user_id
     WHERE analysis.rowid > ?
     ORDER BY analysis.rowid
     LIMIT ?`, (row) => {
    if (!row.owner_user_id || Number(row.owner_exists) !== 1) {
      return marker(context, {
        sourceTable: "candidate_analyses",
        sourceId: row.id,
        targetTable: "analysis_versions",
        targetId: null,
        status: "owner_unresolved",
      });
    }
    const versionId = deterministicLegacyId("analysis-version", row.id);
    let count = changes(context.db.prepare(`INSERT OR IGNORE INTO analysis_versions
      (id, owner_user_id, candidate_id, legacy_analysis_id, status, analyzed_at,
       deterministic_engine_version, taxonomy_version, requisition_version_id,
       ai_request_schema_version, provider_id, model_id, prompt_version, pricing_version,
       is_demo, recompute_required, legacy_marker, created_at)
      VALUES (?, ?, ?, ?, 'completed', ?, 'legacy', 'legacy', NULL, NULL, NULL, NULL, NULL, NULL,
              ?, 1, 'pre_remediation', ?)`)
      .run(
        versionId,
        row.owner_user_id,
        row.candidate_id,
        row.id,
        row.analyzed_at,
        Number(row.is_demo) === 1 ? 1 : 0,
        context.appliedAt,
      ));
    count += marker(context, {
      sourceTable: "candidate_analyses",
      sourceId: row.id,
      targetTable: "analysis_versions",
      targetId: versionId,
      status: "recompute_required",
      detail: { deterministicEngineVersion: "legacy", taxonomyVersion: "legacy", sourceJsonPreserved: true },
    });
    return count;
  });
}

function extendCandidatesAndBackfill(context: MigrationContext): number {
  let count = addColumns(context.db, "candidates", CANDIDATE_COLUMNS);
  context.db.exec("CREATE INDEX IF NOT EXISTS idx_candidates_owner ON candidates(owner_user_id, applied_at DESC)");
  count += backfillRepositorySource(context, "candidate_repository_outcomes", "updated_at");
  count += backfillRepositorySource(context, "candidate_analyses", "analyzed_at");
  count += backfillAnalysisVersions(context);
  return count;
}

interface LegacyRequirementOwnerRow {
  source_rowid: number;
  owner_user_id: string | null;
  owner_exists: number;
}

interface LegacyRequirementRow {
  id: string;
  requirement: string;
  importance: string;
  category: string;
  position: number;
}

function backfillRequirements(context: MigrationContext): number {
  let count = addColumns(context.db, "company_requirements", REQUIREMENT_COLUMNS);
  context.db.exec("CREATE INDEX IF NOT EXISTS idx_company_requirements_owner ON company_requirements(owner_user_id, position)");

  const seen = new Set<string>();
  count += boundedRows<LegacyRequirementOwnerRow>(context, `
    SELECT requirement.rowid AS source_rowid, requirement.owner_user_id,
           CASE WHEN account.id IS NULL THEN 0 ELSE 1 END AS owner_exists
      FROM company_requirements requirement
      LEFT JOIN users account ON account.id = requirement.owner_user_id
     WHERE requirement.rowid > ?
     ORDER BY requirement.rowid
     LIMIT ?`, (row) => {
    const ownerKey = row.owner_user_id ?? "__unresolved__";
    if (seen.has(ownerKey)) return 0;
    seen.add(ownerKey);
    if (!row.owner_user_id || Number(row.owner_exists) !== 1) {
      const unresolved = context.db.prepare("SELECT id FROM company_requirements WHERE owner_user_id IS NULL ORDER BY position, id").all() as unknown as Array<{ id: string }>;
      return unresolved.reduce((total, item) => total + marker(context, {
        sourceTable: "company_requirements",
        sourceId: item.id,
        targetTable: "requisition_versions",
        targetId: null,
        status: "owner_unresolved",
      }), 0);
    }

    const requirements = context.db.prepare(`SELECT id, requirement, importance, category, position
      FROM company_requirements WHERE owner_user_id = ? ORDER BY position, id`).all(row.owner_user_id) as unknown as LegacyRequirementRow[];
    const sourceJson = JSON.stringify(requirements);
    const requisitionId = deterministicLegacyId("requisition", row.owner_user_id);
    const versionId = deterministicLegacyId("requisition-version", row.owner_user_id, sourceJson);
    count += changes(context.db.prepare(`INSERT OR IGNORE INTO requisitions
      (id, owner_user_id, title, current_version, legacy_marker, created_at, updated_at)
      VALUES (?, ?, NULL, 1, 'pre_remediation', ?, ?)`)
      .run(requisitionId, row.owner_user_id, context.appliedAt, context.appliedAt));
    count += changes(context.db.prepare(`INSERT OR IGNORE INTO requisition_versions
      (id, owner_user_id, requisition_id, version, criteria_json, content_hash,
       legacy_source_json, recompute_required, legacy_marker, created_at)
      VALUES (?, ?, ?, 1, '[]', ?, ?, 1, 'pre_remediation', ?)`)
      .run(versionId, row.owner_user_id, requisitionId, sha256(sourceJson), sourceJson, context.appliedAt));
    for (const requirement of requirements) {
      count += marker(context, {
        sourceTable: "company_requirements",
        sourceId: requirement.id,
        targetTable: "requisition_versions",
        targetId: versionId,
        status: "recompute_required",
        detail: { sourceRequirementPreserved: true },
      });
    }
    return 0;
  });
  return count;
}

const MIGRATION_DEFINITIONS = [
  {
    version: 1,
    name: "remediation_sidecar_schema",
    signature: SIDECAR_SCHEMA_SQL,
    eligible: () => true,
    up: createSidecars,
  },
  {
    version: 2,
    name: "account_remediation_columns",
    signature: JSON.stringify(ACCOUNT_COLUMNS),
    eligible: (db: DatabaseSync) => tableExists(db, "users"),
    up: extendAccounts,
  },
  {
    version: 3,
    name: "candidate_legacy_backfill",
    signature: `${JSON.stringify(CANDIDATE_COLUMNS)}\0legacy-candidate-backfill-v1`,
    eligible: (db: DatabaseSync) => tableExists(db, "users") && tableExists(db, "candidates"),
    up: extendCandidatesAndBackfill,
  },
  {
    version: 4,
    name: "requirements_legacy_backfill",
    signature: `${JSON.stringify(REQUIREMENT_COLUMNS)}\0legacy-requirements-backfill-v1`,
    eligible: (db: DatabaseSync) => tableExists(db, "users") && tableExists(db, "company_requirements"),
    up: backfillRequirements,
  },
].map((migration): SQLiteMigration => ({
  ...migration,
  checksum: migrationChecksum(migration.version, migration.name, migration.signature),
}));

export const SQLITE_REMEDIATION_MIGRATIONS: readonly SQLiteMigrationInfo[] = Object.freeze(
  MIGRATION_DEFINITIONS.map(({ version, name, checksum }) => Object.freeze({ version, name, checksum })),
);

function normalizedBatchSize(value: number | undefined): number {
  if (value === undefined) return DEFAULT_BACKFILL_BATCH_SIZE;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError("backfillBatchSize must be a positive safe integer.");
  }
  return Math.min(value, MAX_BACKFILL_BATCH_SIZE);
}

function ensureLedger(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_versions (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL,
    affected_rows INTEGER NOT NULL DEFAULT 0 CHECK(affected_rows >= 0)
  )`);
}

/**
 * Applies every currently eligible SQLite remediation migration in one write-locked transaction.
 * Legacy anchors may be initialized by stores in any order; a table-dependent migration is recorded
 * only after that anchor exists. Any failure rolls back all work from this invocation.
 */
export function ensureRemediationSchema(
  db: DatabaseSync,
  options: EnsureRemediationSchemaOptions = {},
): void {
  const batchSize = normalizedBatchSize(options.backfillBatchSize);
  let activeMigration: number | null = null;

  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  try {
    db.exec("BEGIN IMMEDIATE");
    ensureLedger(db);
    const appliedRows = db.prepare("SELECT version, name, checksum FROM schema_versions ORDER BY version").all() as unknown as SchemaVersionRow[];
    const applied = new Map(appliedRows.map((row) => [Number(row.version), row]));
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
      if (!migration.eligible(db)) continue;

      options.beforeMigration?.(migration);
      const affectedRows = migration.up({ db, batchSize, appliedAt });
      db.prepare(`INSERT INTO schema_versions (version, name, checksum, applied_at, affected_rows)
        VALUES (?, ?, ?, ?, ?)`)
        .run(migration.version, migration.name, migration.checksum, appliedAt, affectedRows);
      applied.set(migration.version, {
        version: migration.version,
        name: migration.name,
        checksum: migration.checksum,
      });
    }

    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // The original migration error is the useful diagnostic when BEGIN itself failed.
    }
    throw new SQLiteSchemaUpgradeError(activeMigration, { cause: error });
  }
}
