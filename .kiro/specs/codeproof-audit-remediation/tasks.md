# Implementation Plan: CodeProof Audit Remediation

## Overview

Evolve the existing Next.js 16/React 19/TypeScript application in place. Preserve App Router boundaries, bounded deterministic repository analysis, signed-cookie owner scope, dual SQLite/PostgreSQL persistence, existing routes, and all unrelated uncommitted work. Execute this as one continuous dependency-ordered plan on the existing `deploy/vercel-production` branch; do not create, switch, reset, clean, rebase, or force-update branches. Before every edit, inspect the current diff for the target file and merge remediation changes around user work rather than overwriting it.

The requirements and design use the same authoritative canonical values: new code and data use only attribution statuses `unverified`, `candidate_claimed`, `verified_owner`, and `verified_contributor`, and origins `CV`, `portfolio`, `GitHub profile`, and `manual entry`. Legacy persisted values are accepted only by conservative migration/read adapters and are never emitted by new writes. Repository content remains bounded untrusted text and is never executed.

Requirements 19-29 and design sections 4.10-4.14 and 12.1-12.7 extend the same plan with owner administration, bounded impersonation, entitlement-gated sharing with guest isolation, demo isolation, the continuous verification loop, the recruiter demo simulation, and the final release conditions. These are additive: the Admin Role is a column on the existing account table rather than a second identity system, impersonation is a second cookie rather than a mutated session, and `is_demo` is a write-time dimension on existing records rather than a read-time join. Task groups 15-25 carry stable identifiers that do not renumber any existing task; they are placed at their dependency-correct position in this document, and the execution waves at the end of the file remain authoritative for order.

## Tasks

- [x] 1. Establish the repository baseline and execution safety rails
  - [x] 1.1 Capture and persist the pre-remediation Git and validation baseline
    - Verify the current branch is `deploy/vercel-production`; record `git status`, staged/unstaged/untracked paths, HEAD/upstream, and scoped diffs without changing branch or worktree state.
    - Run the existing non-watch lint, typecheck, test, and build commands separately, recording each result as pre-remediation evidence so existing failures are distinguishable from new regressions.
    - Stop and create a blocker disclosure instead of switching branches, discarding work, or overwriting a conflicting user edit.
    - _Requirements: 14.10, 16.1, 16.2, 16.3, 16.4, 17.4, 17.6, 17.7_
  - [x] 1.2 Inventory established boundaries and create the release-verification manifest
    - Map current App Router routes, authentication/owner guards, repository ingestion and deterministic analysis seams, SQLite/PostgreSQL stores, feature flags, deployment files, tests, and environment contracts.
    - Create a machine-readable manifest covering Requirements 1-18, validation checks, external prerequisites, modified-file categories, and allowed disclosure statuses; seed it with baseline evidence rather than completion claims.
    - _Requirements: 12.1, 14.10, 16.10, 17.1, 17.4, 17.5, 17.7_
  - [x] 1.3 Normalize non-watch test and CI/CD entry points without changing architecture
    - Add an exact-pinned Playwright development dependency and tracked configuration, synthetic fixture directories, `test:unit`, `test:integration`, `test:security`, `test:e2e`, `test:migrations`, `test:browser`, and aggregate verification scripts that terminate without watch mode.
    - Create the repository's first GitHub Actions CI workflow (no `.github` workflow exists at the inspected baseline) to run pinned-Node install, lint, typecheck, all Vitest suites, tracked Playwright E2E, production build, migration matrix, and dependency audit with archived check results.
    - _Requirements: 15.1, 15.13, 15.15, 15.17, 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_

- [ ] 15. Establish the continuous verification loop, defect ledger, and criterion-integrity rails
  - [~] 15.1 Implement the recorded verification cycle and the defect ledger
    - Add `VerificationCycle` with ordinal, commit hash, start/completion timestamps, and per-check records (`lint`, `typecheck`, `unit`, `property`, `integration`, `e2e`, `build`, `migration`, `browser`, `security`, `demo_simulation`) carrying the non-watch command, `outcome` in `passed | failed | blocked_live_check | externally_unverifiable`, `previouslyPassing`, detail, defects opened/closed, and browser-console and server-output artifact ids.
    - Add the cycle runner for `implement -> automated test -> browser inspection -> defect triage -> fix -> regress` that re-runs every previously passing check rather than only the changed ones, opens a regression defect when a `previouslyPassing` check fails, and treats any Unexpected Runtime Error in browser-console or server runtime output as a defect rather than a log line.
    - Add the defect ledger with `critical`, `high`, `medium`, and `low` severities, the release effect of each, and a recorded rationale for every severity change so a blocking item cannot be reclassified downward silently. Persist cycles, defects, and outcomes rather than inferring them from a log, and register the non-watch scripts alongside the task 1.3 entry points.
    - _Requirements: 27.1, 27.2, 27.10, 29.5, 29.6_
  - [~] 15.2 Add criterion-integrity baselines and the anti-masking scanners
    - Add `criterion_integrity_baselines` storing one hash per acceptance-criterion line of `requirements.md`, plus a tracked check that recomputes the set and fails when any criterion changes, disappears, or is reworded without a recorded product-owner approval carrying approver, timestamp, prior text, new text, and rationale for exactly that criterion.
    - Add a tracked scanner rejecting `describe.skip`, `it.skip`, `test.skip`, `.todo`, `.only`, commented-out assertions, and disabled suites anywhere in the tracked Vitest and Playwright suites.
    - Add Defect Masking detectors that fail the gate when a fallback path executed during verification without its primary path verified as a separate check, when a handled exception returned a success result on a user-facing operation instead of the applicable Robust State plus a redacted diagnostic, when a mocked success stood in for a real failing behavior, or when an assertion was weakened without a recorded contradiction against this requirements document.
    - _Requirements: 27.3, 27.4, 27.5, 27.6, 27.7, 27.8, 27.9_
  - [~] 15.3 Write property test for criterion survival and the masking prohibition
    - **Property 44: Acceptance criteria survive verification and defects are not masked**
    - **Validates: Requirements 27.3, 27.4, 27.5, 27.6, 27.7, 27.8, 27.9**

- [x] 2. Add canonical domain contracts, taxonomy, invariants, and compatible persistence
  - [x] 2.1 Implement canonical remediation domain types and versioned schemas
    - Add TypeScript/Zod contracts for the exact four attribution statuses and origins, canonical evidence levels, detector findings, citations, conclusions, questions, repository metrics, analysis metadata, requisition versions, comparisons, shares, AI telemetry, pilot access, build metadata, release verification, and release disclosure.
    - Reject legacy enum spellings at new write boundaries while exposing explicit migration-only parsers.
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 5.8, 12.3, 14.4, 14.11_
  - [x] 2.2 Implement the immutable canonical capability taxonomy and aliases
    - Add a versioned registry with bilingual labels, signal classes, evidence policies, unique NFKC/case-folded alias resolution, inverse/acyclic broader relationships, symmetric relationships, and explicit roll-up rules.
    - Canonicalize `Testing` and `Automated testing` to general testing; map `unit`/`unit testing` and `integration`/`integration testing` to distinct narrower nodes that may roll up but never prove one another. Map meaningful parsed `GitHub Actions` workflows to canonical `CI/CD`, while keeping file-only, empty, documentation-only, and dependency-only signals non-conclusive. Retain completed analyses on their pinned taxonomy versions.
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.13, 10.2, 10.8, 18.1, 18.2_
  - [x] 2.3 Implement the pure contradiction and eligibility invariant validator
    - Reject duplicate evidence levels, gap-and-support contradictions, unsupported conclusions, weak-signal promotion, invalid thresholds, citation/corpus mismatches, cross-surface provenance drift, mutable completed versions, and metric reconciliation failures before canonical persistence.
    - Return stable redacted domain errors and preserve source legacy records marked for recomputation.
    - _Requirements: 2.10, 2.11, 2.12, 3.1, 5.1, 14.9, 15.4_
  - [x] 2.4 Add additive, atomic, idempotent SQLite migrations and bounded backfills
    - Extend the existing inline initialization path with numbered/checksummed sidecar tables, indexes, foreign keys, owner columns, immutable/version/idempotency constraints, guarded column additions, and bounded transactional backfills using `BEGIN IMMEDIATE`.
    - Preserve legacy tables/JSON and all accounts, candidates, requisitions, analyses, comparisons, outcomes, and ownership links; fail initialization before partial writes.
    - _Requirements: 14.1, 14.2, 14.3, 14.7, 14.8, 14.10_
  - [x] 2.5 Add parity PostgreSQL migrations and bounded backfills
    - Implement the same logical schema through the existing PostgreSQL initialization path with transaction-scoped locking, JSONB/boolean adaptations, guarded DDL, conflict-safe bounded backfills, checksums, rollback-on-failure, and readiness failure.
    - Keep migration behavior and domain projections equivalent to SQLite without replacing either adapter.
    - _Requirements: 14.1, 14.2, 14.3, 14.7, 14.8, 14.10_
  - [x] 2.6 Implement conservative legacy read/write adapters and reconciliation audit
    - Map supported legacy attribution/origin values only from persisted provenance to the exact canonical set; default unverifiable attribution to `unverified`, keep ambiguous origin migration-only with `origin_confirmation_required`, and never emit an invented origin.
    - Map title-cased levels into versioned projections, pin missing metadata to explicit `legacy` markers, quarantine contradictory conclusions, preserve old aggregate fields for compatible readers, and generate reconciliation counts for every mapping outcome.
    - _Requirements: 1.1, 1.2, 14.4, 14.5, 14.6, 14.9, 14.11, 17.7_
  - [x] 2.7 Write property test for canonical attribution and discovery transitions
    - **Property 1: Attribution and discovery state safety**
    - Generate repository-add, backfill, verification, and staleness events across every canonical status/origin and ambiguous migration case; assert no new write emits legacy requirement terminology.
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.12, 14.4, 14.5, 14.6, 15.2**
  - [x] 2.8 Write property test for taxonomy uniqueness, alias semantics, and version immutability
    - **Property 4: Taxonomy aliases resolve uniquely and relationships remain valid**
    - Cover `Testing`, `Automated testing`, `unit`, `unit testing`, `integration`, `integration testing`, meaningful GitHub Actions => `CI/CD`, and empty/file-only/documentation-only counterexamples.
    - **Validates: Requirements 2.1, 2.9, 2.13, 18.1, 18.2**
  - [x] 2.9 Write property test for canonical evidence thresholds
    - **Property 5: Evidence classification obeys canonical thresholds**
    - Cover exact boundary cases for `strong`, `good`, `partial`, `limited`, and `insufficient`, including Testing/CI/CD, config-only, generated, documentation, and trivial signals.
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.12, 15.4**
  - [x] 2.10 Write property test for contradiction rejection
    - **Property 6: Contradictory analyses are rejected before persistence**
    - Assert failed validation produces no canonical partial writes on either persistence adapter.
    - **Validates: Requirements 2.11, 2.12, 14.9, 15.4**
  - [x] 2.11 Write property test for conservative inline upgrades
    - **Property 30: Inline upgrades are idempotent, atomic, and conservative**
    - Exercise fresh and supported legacy SQLite/PostgreSQL-compatible fixtures, repeated runs, injected failures, provenance mappings, owner preservation, and schema/data fingerprints.
    - **Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 14.9, 14.10, 14.11, 15.13, 15.14**

- [ ] 16. Add additive account role, lifecycle, demo, and administrative audit persistence
  - [~] 16.1 Add account role, lifecycle, company, plan, activity, and demo columns with dual-engine parity
    - Add a shared `ensureAccountSchema()` that runs inside the same inline initialization already used by the `AuthStore` constructor and `PostgresAuthStore.initialize()`, adding `role`, `lifecycle_state`, `is_demo`, `demo_label`, `company_name`, `plan_tier_id`, `last_activity_at`, `soft_deleted_at`, and `suspended_at` as guarded additive columns with legacy defaults `RECRUITER`, `active`, non-demo, and `NULL`; an unresolved `plan_tier_id` resolves to the default pilot tier and an absent `last_activity_at` presents as unavailable.
    - Add PostgreSQL named `CHECK` constraints for `role` and `lifecycle_state`, created only when `pg_constraint` lacks the name. Preserve SQLite parity through the shared `AccountRoleSchema`/`AccountLifecycleStateSchema` Zod enums validating every write, a write-path assertion that rejects a non-canonical value before the statement executes, and a startup validation query that fails readiness when a persisted row holds a non-canonical value.
    - Extend `AuthUser` with `role`, `lifecycleState`, `isDemo`, `demoLabel`, and `companyName`; keep `passwordHash` only on `AuthUserWithPassword` and off every administrative and impersonation read path; name columns explicitly in administrative queries and keep `SELECT *` on the account table limited to `findByEmail` for credential verification.
    - _Requirements: 19.1, 19.4, 20.7, 14.1, 14.2, 14.3, 14.7, 14.8_
  - [~] 16.2 Implement the idempotent ADMIN_EMAIL bootstrap and its redacted diagnostics
    - Add `ensureAdminBootstrap()` running once per process after `ensureAccountSchema()` inside the same transaction and lock (SQLite `BEGIN IMMEDIATE`; the PostgreSQL transaction-scoped advisory migration lock), implemented as one conditional `UPDATE ... SET role = 'ADMIN' WHERE lower(trim(email)) = lower(trim(:adminEmail)) AND role <> 'ADMIN'` so it elevates only an already-registered account, never inserts a row, never writes `password_hash`, and never issues a reset or invitation. Repeated and concurrent initialization affect zero additional rows.
    - Start with no Admin Role when the variable is absent, empty after trimming, or matches no account, recording one redacted `admin_bootstrap_unresolved` diagnostic with `reason` in `variable_absent | variable_empty | no_matching_account` and an `emailDigestPrefix` of the first 8 hex characters of `SHA-256(normalizedEmail)` present only for `no_matching_account`; never log the address. Report an existing `ADMIN` account whose email no longer matches as `admin_bootstrap_divergence` in authorized diagnostics rather than demoting it or elevating a second account.
    - Document `ADMIN_EMAIL` in `.env.example` with an empty value, read it only from server modules so it cannot reach a client bundle, and add a tracked scan asserting no administrative email address, password, password hash, token, or recovery credential appears in source files, configuration defaults, Synthetic Fixtures, or client bundles.
    - _Requirements: 19.2, 19.3, 19.4, 19.5_
  - [~] 16.3 Add the append-only hash-chained administrative audit log on both engines
    - Add `admin_audit_log` with `AdminAuditEntry` fields: dense monotonic `UNIQUE` `sequence`, `UNIQUE` `previousEntryHash`, `entryHash = SHA-256(canonicalJson(entryWithoutHash))` over lexicographically sorted keys with no insignificant whitespace, UTF-8 encoding, and preserved nulls, a 64-zero genesis link, actor identity and role, impersonated identity, action, action category, target kind and id, outcome, denial reason, non-secret parameters, `before`/`after`, request correlation identifier, request method, route, ip fingerprint digest, and user-agent family.
    - Enforce insert-only storage on both engines: SQLite `BEFORE UPDATE` and `BEFORE DELETE` triggers raising `RAISE(ABORT, 'admin_audit_append_only')`, and a PostgreSQL `BEFORE UPDATE OR DELETE OR TRUNCATE` trigger plus `REVOKE UPDATE, DELETE, TRUNCATE` where the deployment's grants permit, with the trigger as the portable guarantee. Expose only `appendAdminAuditEntry()` and read methods so no update or delete method exists for the Admin Console, an administrative API, a server action, or a migration to call; migrations may add defaulted columns but never rewrite a row.
    - Add `verifyAdminAuditChain(from, to)` recomputation; treat a mismatch as a `critical` defect that fails authorized diagnostics readiness and is recorded in the Release Disclosure.
    - _Requirements: 19.12, 19.13, 14.1, 14.2, 14.3_
  - [~] 16.4 Implement administrative redaction and the transactional withAdminAudit wrapper
    - Add `redactAdministrativeValue()` applied recursively to `parameters`, `before`, `after`, and array elements, replacing a value with `"[redacted]"` on a key denylist match (`password`, `newPassword`, `passwordHash`, `password_hash`, `hash`, `token`, `shareToken`, `tokenDigest`, `passcode`, `passcodeDigest`, `secret`, `resetToken`, `verificationCode`, `apiKey`, `authorization`, `cookie`, `sessionToken`) or a secret shape (`scrypt$` prefix, JWT-like three-segment value, bearer-like opaque string, high-entropy string above the configured length and entropy thresholds). Apply redaction **before** hashing so the chain covers exactly the stored bytes, and reuse the same function for administrative API responses, Admin Console view models, administrative exports, and diagnostics.
    - Add `withAdminAudit(actor, descriptor, mutate)` that opens one transaction (SQLite `BEGIN IMMEDIATE`; PostgreSQL a single transaction taking `SELECT ... FOR UPDATE` on the chain head row to serialize `sequence`), performs the domain mutation, appends the audit entry as the last statement, then commits. Any append failure — trigger, `sequence` or `previousEntryHash` unique violation, I/O error, serialization failure — rolls back and returns `ADMIN_AUDIT_APPEND_FAILED` with the target state unchanged. Route every state-changing administrative command through this wrapper so no path mutates account state, plan, credit, quota, demo baseline, or share validity outside it and no path commits a mutation before its entry is durable. Append denied-attempt entries standalone, and when that append fails still return the standard unavailable envelope plus a redacted diagnostic rather than failing open.
    - _Requirements: 19.12, 19.14, 19.15_
  - [~] 16.5 Write property test for administrative bootstrap safety
    - **Property 34: Administrative bootstrap only elevates an already-registered account**
    - Generate absent, empty, whitespace-only, case-differing, matching, and non-matching variable values against generated account sets, with repeated and concurrent initialization; assert unchanged account count, password hashes, and creation timestamps.
    - **Validates: Requirements 19.2, 19.3, 19.4, 19.5**
  - [~] 16.6 Write property test for the append-only chained audit log and its action gate
    - **Property 35: The administrative audit log is append-only, chained, and gates its action**
    - Include chain recomputation, attempted update/delete/truncate on both engines, and injected append failure with a byte-identical pre-command state assertion for account state, plan, Credit Balance, Quota, demo baseline, and share validity.
    - **Validates: Requirements 19.12, 19.13, 19.14, 21.3, 21.8, 21.11, 21.12, 22.1, 22.3, 22.6, 22.9**

- [ ] 17. Enforce administrative authorization at the handler and page level
  - [~] 17.1 Implement requireAdmin, requireAdminPage, and one non-disclosing denial envelope
    - Resolve authority on every request with no cached or memoized decision: verify session signature and expiry with the existing `readSessionToken()`, load the account row by id selecting `id, email, role, lifecycle_state, is_demo` explicitly, require `lifecycle_state = 'active'`, require `role = 'ADMIN'` as read from that row, require that no impersonation grant is active (`impersonation_active`), then check the administrative denial limiter.
    - Make the effective role a pure function of the persisted row: administrative request schemas are `z.object({...}).strict()` and a shared `rejectPrivilegeClaimKeys()` runs first, so a `role`, `isAdmin`, `permissions`, or `adminToken` field arriving in a cookie value, request body, query parameter, header, or client-submitted form state is discarded before validation and returns the standard unavailable envelope.
    - Return denials identical to a nonexistent resource: `notFound()` rendering the standard `src/app/not-found.tsx` for `/admin` pages and layouts, HTTP 404 with the shared `{ error: { code: "RESOURCE_UNAVAILABLE" } }` envelope with identical body, headers, and shape for administrative API routes, and the same result for administrative server actions. Never redirect to sign-in, never name the Admin Console, an administrative data shape, an account, or the reason; record the reason only in the audit log and a redacted diagnostic, and append a denied-attempt audit entry for an authenticated session without the Admin Role.
    - Call `requireAdminPage()` in `src/app/admin/layout.tsx` and again in every admin `page.tsx`, and call `requireAdmin()` inside every `src/app/api/admin/**/route.ts` handler rather than in middleware, so a browser request, a command-line tool, a script, and a direct API call traverse one identical path; add a route-inventory test asserting every administrative route module imports the guard.
    - _Requirements: 19.6, 19.7, 19.8, 19.9, 19.10, 20.1, 21.14_
  - [~] 17.2 Implement administrative denial rate limiting
    - Add `adminAuthorizationRateLimited(request, subject)` following the established `src/features/auth/rate-limit.ts` shape with key `SHA-256(forwardedIp + ":" + (sessionUserId ?? "anonymous") + ":admin")`, a 15-minute window, and threshold `CODEPROOF_ADMIN_DENIAL_THRESHOLD` defaulting to 10; past the threshold return the same unavailable envelope without reading the database.
    - Persist bounded-window counters in `admin_authorization_attempts` keyed by the same digest for PostgreSQL deployments, read the durable counter when a pool is configured and the per-instance memory counter otherwise, and clear the subject's counter on successful administrative authorization.
    - _Requirements: 19.11_
  - [~] 17.3 Enforce state-changing methods and cross-origin denial on administrative commands
    - Place each administrative command in a `POST`-only route module exporting no `GET`, so a read-only request path receives 405 and cannot execute a state change; have Admin Console forms use server actions that call `requireAdmin()` and then the same command function as the API route so both paths share one authorization implementation, one dangerous-action check, and one audit wrapper; apply `denyCrossOrigin()` from the existing guard module to every administrative mutation.
    - Return the non-disclosing envelope when an administrative action targets a non-existent account or a record outside the administrative authorization boundary.
    - _Requirements: 21.14, 21.15, 13.7, 13.8_
  - [~] 17.4 Write property test for persisted-state-only administrative authority
    - **Property 33: Administrative authority comes only from persisted account state**
    - Generate injected `role`/`permission`/`isAdmin`/administrative claims across cookie, body, query, header, and client state; absent, non-admin, admin, suspended, and soft-deleted sessions; browser, command-line, script, and direct API clients; and denial-threshold crossings. Assert identical envelopes for absent versus forbidden targets and that no read-only method executes a state change.
    - **Validates: Requirements 19.1, 19.6, 19.7, 19.8, 19.9, 19.10, 19.11, 20.1, 21.14, 21.15, 22.12**

- [ ] 3. Implement discovery, attribution verification, owner scope, and conclusion eligibility
  - [~] 3.1 Extend repository discovery and manual-add flows with exact provenance
    - Record one canonical origin and initial status at add time; ensure manual entry starts `unverified`, candidate-supplied CV/portfolio claims can become `candidate_claimed`, and ambiguous migrated origins require confirmation before analysis.
    - Keep supported pre-release requests working through documented defaults.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.10, 14.6, 14.11_
  - [~] 3.2 Implement server-only authenticated provider verification
    - Add the provider port and route/service checks for authenticated identity, repository identity, immutable revision, contribution proof, owner-only proof, incomplete proof, and verification staleness.
    - Keep provider credentials request-local and redact them from persistence, serialization, errors, logs, cache, telemetry, and client props.
    - _Requirements: 1.5, 1.6, 1.7, 1.8, 1.12, 1.13, 13.6, 13.11_
  - [~] 3.3 Implement one canonical evidence eligibility filter across conclusions and ranking
    - Make only `verified_contributor` citations eligible for candidate conclusions, role matching, saved-comparison factors, and Review-First Order; retain all other evidence in clearly labeled association/question contexts without negative penalties.
    - Re-ground optional AI claims through the same filter.
    - _Requirements: 1.9, 1.11, 2.10, 3.1, 4.19, 6.3, 6.4_
  - [~] 3.4 Enforce owner-scoped stores and non-disclosing API boundaries
    - Require `ownerUserId` in candidate repository, verification, analysis, requisition, comparison, telemetry, pilot/quota, and share-management queries and constrain joins before existence is returned.
    - Preserve signed-cookie signature, expiry, secure production attributes, and server-side lookup.
    - _Requirements: 6.11, 7.1, 7.13, 11.11, 13.7, 13.8, 13.9_
  - [~] 3.5 Write property test for attribution eligibility filtering
    - **Property 2: Unverified evidence cannot influence candidate conclusions**
    - **Validates: Requirements 1.9, 1.11, 2.10, 3.1, 4.19, 6.3, 6.4, 15.3**
  - [~] 3.6 Write property test for provider credential containment
    - **Property 3: Verification credentials never escape server memory**
    - Test persistence writes, API payloads, cache material, telemetry, logs, thrown errors, and rendered props with unique secret canaries.
    - **Validates: Requirements 1.13, 13.6, 13.11**
  - [~] 3.7 Write property test for cross-surface evidence consistency
    - **Property 7: Cross-surface evidence projection is consistent**
    - **Validates: Requirements 1.10, 2.1, 2.9, 7.15**

- [ ] 4. Preserve detector-to-source integrity and generate context-safe questions
  - [~] 4.1 Extend deterministic detectors to emit canonical grounded findings
    - Preserve detector/version, repository/revision, normalized file, symbol, exact line span, byte offsets, signal class, and canonical capability for every finding; exclude generated/vendor/build/cache paths.
    - Keep analysis deterministic and never invoke repository code, packages, hooks, macros, interpreters, builds, tests, or dynamic imports.
    - _Requirements: 2.2, 2.3, 3.2, 3.3, 13.1, 13.2_
  - [~] 4.2 Implement complete citation construction, exact excerpts, and direct source links
    - Persist and project detector ID/version, repository ID/name/URL, revision or explicit unavailable state, file path, optional symbol, optional lines, bounded exact safe excerpt, direct source link, origin, attribution, evidence level, and taxonomy version from analyzed bytes only.
    - Validate symbol/line membership, cap excerpts by lines and characters, encode paths, use immutable GitHub blob/line links when revision and lines are known, and otherwise surface the most specific safe link without implying immutability.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 5.8, 18.3, 18.4_
  - [~] 4.3 Implement framework/context gates for interview questions
    - Generate evidence-linked or explicitly gap-based questions after attribution gating and rewrite unverified authorship into neutral ownership/contribution verification.
    - Add language/framework/schema-aware capability gates so a repository containing Flask's `schema.sql` without Flask HTTP route/application evidence cannot support Flask HTTP-flow questions; represent missing route evidence as a gap instead.
    - _Requirements: 1.11, 2.3, 2.10, 3.5, 3.6, 3.7, 15.4, 15.5, 18.5_
  - [~] 4.4 Implement centralized citation/question redaction and public-safe projection
    - Redact secret, authentication, contact, and protected-trait canaries before recruiter display; omit unsafe excerpts from external reports and drop questions that cannot be safely rewritten.
    - Preserve safe source text and technical-token copy values.
    - _Requirements: 3.8, 3.9, 7.11, 13.6_
  - [~] 4.5 Write property test for citation round-trip integrity
    - **Property 8: Citation round-trip preserves grounded source context**
    - Include detector ID/version, repository ID/name/URL, origin, attribution, evidence level, taxonomy version, optional symbols/lines, bounded exact excerpts, encoded paths, immutable/missing revisions, and direct source-link consistency.
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 15.5, 18.3, 18.4**
  - [~] 4.6 Write property test for attribution- and context-safe questions
    - **Property 9: Interview questions respect evidence context**
    - Include the negative Flask `schema.sql`/HTTP-flow regression and candidate-claimed, owner-only, unverified, verified, and gap bases.
    - **Validates: Requirements 1.11, 3.5, 3.6, 3.7, 15.5, 18.5**
  - [~] 4.7 Write property test for unsafe content removal
    - **Property 10: Unsafe citation and question content is removed**
    - **Validates: Requirements 3.8, 3.9, 7.11, 15.5, 15.11**
  - [~] 4.8 Write property test for untrusted-text policy containment
    - **Property 16: Untrusted text cannot control analysis**
    - **Validates: Requirements 4.18, 13.1, 13.2, 13.6, 13.10, 15.12**

- [ ] 5. Make ingestion safety and repository metrics exact and reproducible
  - [~] 5.1 Extend bounded archive ingestion with stage accounting
    - Measure raw entries, eligible text, selected files, analyzed files, downloaded compressed bytes, eligible/selected/analyzed text bytes, exclusions by reason, configured limits, and per-run selected/successful/failed/pending repositories.
    - Persist and display separate `unverified`, `candidate_claimed`, `verified_owner`, and `verified_contributor` counts; enforce completed/active run equations and exact attribution-total reconciliation without collapsing owner verification into contributor verification.
    - Preserve URL allowlisting, transport/entry/path/symlink/device/expansion/nested archive/file/count/byte limits before affected content reaches analysis.
    - _Requirements: 5.1, 5.2, 5.8, 5.9, 13.3, 13.4, 13.5, 18.6_
  - [~] 5.2 Implement metric projection contracts with explicit denominators
    - Return stage, eligible population, weighting, attribution filter, numerator, denominator, and rounding rule; disclose bounded exclusions and keep missing provider-wide metrics `null`/unavailable rather than zero.
    - Omit repository-wide facts not supplied by archive/provider metadata.
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7, 5.9_
  - [~] 5.3 Add synthetic archive and metric fixture builders
    - Generate deterministic valid, traversal, absolute, symlink, generated/vendor, nested/compression-bomb, oversized, binary, prompt-injection, mixed-language, partial-failure, and known-byte/count corpora without production data.
    - _Requirements: 15.1, 15.7, 15.12_
  - [~] 5.4 Write property test for exact corpus accounting
    - **Property 17: Repository corpus accounting is exact**
    - **Validates: Requirements 5.1, 5.2, 5.8, 5.9, 15.7, 18.6**
  - [~] 5.5 Write property test for reproducible displayed metrics
    - **Property 18: Displayed metrics are reproducible from disclosed denominators**
    - **Validates: Requirements 5.3, 5.4, 5.5, 5.6, 5.7, 15.7**
  - [~] 5.6 Write property test for bounded non-executing archive ingestion
    - **Property 28: Archive ingestion is bounded and non-executing**
    - Assert accepted and rejected inputs never reach process execution APIs or browser-loaded repository HTML.
    - **Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 15.12**

- [ ] 6. Implement provider-neutral hybrid AI, pricing, budgets, telemetry, and pilot access
  - [~] 6.1 Implement the versioned provider-neutral AI port and deterministic-first orchestrator
    - Adapt the current provider behind one strict request/response schema; complete and validate deterministic output first, delimit untrusted text, schema-check provider output, re-ground citations, and preserve deterministic fallback for absent/invalid/failing providers.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.18, 4.19_
  - [~] 6.2 Implement the single versioned pricing registry and configurable cost projections
    - Store provider/model identifiers, integer-micro input/cached-input/output prices, billable units, currency, effective/checked dates, registry version, and a direct official provider primary-source pricing URL; verify configured metadata at implementation time without request-time scraping, secondary-source substitution, or guessed prices.
    - Disable paid requests when a current matching row is absent and expose safe readiness diagnostics.
    - Add deterministic projections for cost per Candidate, cost per 100 Candidates, and configured volume using adjustable repositories/Candidate, AI operations/Candidate, input/cached-input/output units, cache-hit rate, provider/model, and volume assumptions. Display assumptions, rounding, dates, unit costs, and source links without rewriting historical actuals.
    - _Requirements: 4.12, 4.13, 4.14, 4.15, 12.2, 18.11, 18.12, 18.13_
  - [~] 6.3 Implement AI budgets, cache identity, retry/timeout bounds, and owner telemetry
    - Calculate estimates before reservation, enforce at-most-60-second timeout and at most two retries after the first transient failure, skip non-transient retries, include every behavior version in cache keys, and reuse only unexpired schema-valid results.
    - Persist exactly one safe owner-scoped telemetry terminal record with latency, attempts, cache, usage, pinned pricing, estimate/actual, and unavailable usage semantics; never store prompts, CV/source text, tokens, or credentials.
    - _Requirements: 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.14, 4.15, 4.16, 4.17, 4.20_
  - [~] 6.4 Implement pilot tiers, entitlements, quotas, and atomic reservations
    - Add at least two stable translated tier definitions and quotas for candidates, analyses, paid AI, active shares, and recruiter seats; use idempotent reserve/commit/release/expiry operations with SQLite `BEGIN IMMEDIATE` and PostgreSQL atomic locking.
    - Return localized denial/exhaustion/reset details, expose authorized usage/cost views, and add no checkout, invoice, renewal, subscription, or payment-provider behavior.
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 11.11, 11.12_
  - [~] 6.5 Write property test for deterministic-first fallback
    - **Property 11: Deterministic output precedes and survives optional AI**
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6, 4.13, 4.19, 4.20, 15.6, 15.18**
  - [~] 6.6 Write property test for timeout and retry bounds
    - **Property 12: AI execution is time- and retry-bounded**
    - **Validates: Requirements 4.7, 4.8, 4.9, 15.6**
  - [~] 6.7 Write property test for cache identity and reuse
    - **Property 13: Analysis cache identity is complete and reusable**
    - **Validates: Requirements 4.10, 4.11, 15.6**
  - [~] 6.8 Write property test for pinned integer cost calculations and projections
    - **Property 14: AI cost uses one pinned pricing version**
    - Include absent, explicit-zero, input, cached-input, output, stale/missing pricing, rounding, per-Candidate, per-100-Candidate, configured-volume, and assumption-change cases; assert primary-source provider/model metadata remains visible and historical actuals immutable.
    - **Validates: Requirements 4.12, 4.13, 4.14, 4.15, 4.17, 15.6, 18.11, 18.12, 18.13**
  - [~] 6.9 Write property test for safe terminal telemetry
    - **Property 15: Every AI terminal state produces safe owner-scoped telemetry**
    - **Validates: Requirements 4.16, 4.17, 11.11, 13.11**
  - [~] 6.10 Write property test for atomic exactly-once quota reservations
    - **Property 26: Pilot quota reservations are atomic and exactly once**
    - Generate interleaved reserve/commit/release/expiry/idempotency operations on both adapters.
    - **Validates: Requirements 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 15.19**

- [~] Checkpoint A - Validate foundational services before workflow features
  - Ensure all tests pass, ask the user if questions arise.
  - Confirm migration parity, canonical enum reconciliation, contradiction enforcement, attribution eligibility, citation/context integrity, exact metrics, deterministic AI fallback, and quota reservations before continuing.
  - _Requirements: 1.1-1.13, 2.1-2.13, 3.1-3.9, 4.1-4.20, 5.1-5.9, 11.1-11.12, 13.1-13.11, 14.1-14.11, 18.1-18.6, 18.10-18.13_

- [ ] 7. Implement immutable requisition comparisons and explainable Review-First Order
  - [~] 7.1 Add owner-scoped immutable requisition versions and saved comparisons
    - Snapshot canonical criteria/content hashes, require one owner-visible requisition version and owner-visible candidate analysis versions, persist exact inputs/results, and keep saved results unchanged after later edits.
    - _Requirements: 6.1, 6.2, 6.11, 12.3_
  - [~] 7.2 Implement neutral matching, requisition-mismatch rejection, and deterministic draft review order
    - Recompute every Candidate against the same selected Requisition Version; reject stale saved factors or analysis/comparison artifacts bound to a different Requisition Version instead of mixing criteria.
    - Use only eligible `verified_contributor` conclusions, treat missing/unverified evidence as uncertainty with zero positive and no negative points, expose criteria/factors/citations, and use inclusion ordinal then opaque UUID as the protected-trait-neutral stable tie break.
    - Use neutral `unknown`/`not enough visible evidence` wording, label the order as a review-first draft, and never mutate candidate workflow state.
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 18.7, 18.10_
  - [~] 7.3 Implement version-bound Evidence-Checked Marks
    - Key acknowledgement to owner, candidate, analysis version, and requisition version; retain history while making prior marks non-current after a new analysis or requisition version.
    - _Requirements: 6.9, 6.10_
  - [~] 7.4 Write property test for immutable owner/requisition binding and mismatch rejection
    - **Property 19: Comparisons are immutable and owner/requisition bound**
    - Generate same-Requisition and mismatched-Requisition candidate artifacts; assert mismatches are rejected or explicitly recomputed and never silently mixed.
    - **Validates: Requirements 6.1, 6.2, 6.11, 12.3, 15.8, 15.9, 18.7**
  - [~] 7.5 Write property test for neutral explainable stable ordering
    - **Property 20: Review order is neutral, explainable, stable, and non-mutating**
    - **Validates: Requirements 6.3, 6.4, 6.6, 6.7, 6.8, 15.8**
  - [~] 7.6 Write property test for version-specific acknowledgement
    - **Property 21: Evidence acknowledgement is version specific**
    - **Validates: Requirements 6.9, 6.10, 15.8**

- [ ] 8. Implement expiring, revocable, read-only external sharing
  - [~] 8.1 Implement digest-only share lifecycle persistence
    - Generate at least 128 bits of cryptographic entropy, require expiry, persist only a non-reversible digest, freeze one allowlisted report snapshot, enforce owner management, and support revocation.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.7_
  - [~] 8.2 Implement fragment-token exchange and non-disclosing signed-out public access
    - Let a signed-out visitor resolve a valid unexpired fragment token through a one-time POST into a short-lived path-scoped secure HttpOnly cookie and render the report without recruiter authentication or a sign-in redirect.
    - Remove the fragment, return one localized unavailable envelope for absent/invalid/expired/revoked/cross-share grants, and rate-limit privacy-preserving fingerprints.
    - Apply read-only routes, restrictive CSP, `private, no-store`, no analytics/log tokens, no-referrer, robots meta, and `X-Robots-Tag: noindex, nofollow`.
    - _Requirements: 7.5, 7.6, 7.8, 7.9, 7.10, 7.12, 7.14, 18.8_
  - [~] 8.3 Implement the constructive PII-safe external report projection
    - Include only selected display label, role label, timestamps/version, safe capabilities, evidence provenance, redacted citations/source links, and human-review disclaimer; exclude private candidate/requisition/note/workflow/comparison/account/provider/telemetry/quota/mutation data.
    - _Requirements: 3.9, 7.8, 7.11, 7.15, 12.5_
  - [~] 8.4 Write property test for token entropy and signed-out lifecycle
    - **Property 22: Share tokens are high-entropy, digest-only, and lifecycle safe**
    - Include signed-out valid, invalid, expired, revoked, absent, and cross-share access; assert valid access needs no recruiter session and unavailable states never redirect to sign-in.
    - **Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.12, 7.14, 15.10, 18.8**
  - [~] 8.5 Write property test for read-only PII-safe projection
    - **Property 23: External report is a read-only PII-safe projection**
    - **Validates: Requirements 7.1, 7.8, 7.11, 7.13, 7.15, 15.11**

- [ ] 18. Gate external sharing on entitlements and reduce the guest dossier
  - [~] 18.1 Add the Sharing Entitlement gate and the one-dossier-per-grant schema
    - Define `Entitlement.external_sharing` as the Sharing Entitlement and run one ordered gate on create, manage, revoke, and regenerate: authenticated session -> `requireActiveUser()` -> Owner-Scope authorization of the source candidate report -> `PilotAccessService.requireEntitlement(ownerUserId, "external_sharing")`. Wire `POST /api/shares`, `GET`/`PATCH /api/shares/:id`, `POST /api/shares/:id/regenerate`, and `DELETE /api/shares/:id` through it.
    - Return a translated `ENTITLEMENT_UNAVAILABLE` capability-unavailable response naming the required plan capability with no checkout, upgrade purchase, or payment path when the entitlement is absent, and the shared non-disclosing envelope for an unauthenticated attempt or a foreign or absent share.
    - Make single-dossier scope a schema property: `external_shares.candidate_id` and `external_shares.analysis_version_id` are single-valued `NOT NULL` columns with no join table, array column, or list parameter. Add `ShareGrantScope` and have `buildGuestDossier(scope)` accept only that scope, returning the shared unavailable envelope for any guest request whose path, query, or body names a different candidate, analysis, share, account, or administrative resource.
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 25.1, 25.7_
  - [~] 18.2 Implement one-time token disclosure, expiry options, passcode digests, and guest email verification
    - Display the plaintext token with at least 128 bits of cryptographic entropy exactly once to the authorized Recruiter at creation and regeneration, persist only the non-reversible digest, and provide no later retrieval path; keep the token in the URL fragment so it stays out of the initial request, the referrer, the access log, and the search index. Regeneration issues a new token, invalidates the prior digest, and contains no delete statement against `share_access_log`.
    - Offer exactly the `24h`, `7d`, and `30d` Share Expiry Options, store the chosen option plus the computed `expires_at`, apply `7d` when the option is omitted, and evaluate expiry server-side on every resolution so access stops with no recruiter action and no scheduled job.
    - Add optional `passcode_required` and `passcode_digest` hashed with the existing `hashPassword()` and verified with `verifyPassword()` from `src/features/auth/store.ts`, so the release keeps one password-hash implementation and one constant-time comparison; never store, log, or return plaintext. Limit failures through `share_validation_limits` keyed by `SHA-256(ipFingerprint + ":" + shareDigestPrefix)` at a default 5 per 15 minutes and return the **same** unavailable envelope as an invalid share so the limiter does not confirm that a share exists.
    - Add optional Guest Email Verification: the Recruiter specifies the address at creation, a 6-digit code is delivered there and stored as a digest with a 10-minute expiry and an attempt counter shared with the passcode limiter, and the verified state binds to the share cookie issued by the resolve step rather than to the token so a correct code cannot be replayed from another browser.
    - _Requirements: 24.5, 24.6, 24.7, 24.8, 24.9, 24.10, 24.11_
  - [~] 18.3 Implement the share access log and the owner-scoped share management view
    - Record `share_id`, `occurred_at`, `outcome` in `granted | denied_invalid | denied_expired | denied_revoked | denied_passcode | denied_email_verification | rate_limited`, `applied_controls` naming which of passcode and email verification were in force, and coarse metadata (`ip_fingerprint` digest, `user_agent_family`, coarse region when available). Exclude the plaintext token and plaintext passcode by construction: neither value is passed to the logging function and the schema has no column able to hold either, and the token digest is not written because correlation uses `share_id`. Log rows survive regeneration, revocation, and expiry.
    - Display share status, Share Expiry Option, expiration timestamp, passcode requirement, email-verification requirement, and Share Access Log entries inside Owner Scope; revocation sets `revoked_at` so subsequent resolution returns the shared unavailable envelope while the log is retained.
    - _Requirements: 24.12, 24.13, 24.14_
  - [~] 18.4 Build the reduced guest segment and its isolation posture
    - Make `src/app/share/` a separate route segment with its own layout that does **not** mount `AppShell`, `Sidebar`, `Topbar`, or `MobileNav`, so recruiter navigation and account affordances cannot leak in by inheritance.
    - Build the projection constructively from the allowlist rather than by subtracting from a private object, excluding internal notes, Recruiter workflow metadata, Evidence-Checked Marks, Review-First Order factors, and candidate stage data; contact details, addresses, account identifiers, authentication data, and personal data role-relevant evidence does not require; every other candidate, candidate list, comparison view, requisition list, and Hiring Insights view; account-settings, pricing, and Admin Console surfaces; export, download, and bulk-retrieval actions; and AI-analysis features, AI request initiation, re-analysis, and every mutation API.
    - Preserve Attribution Status, Discovery Origin, Evidence Level, and taxonomy version on every Evidence Citation while omitting rather than partially showing any bounded excerpt that fails the public PII and secret allowlist. Apply `noindex, nofollow`, the `X-Robots-Tag` header, `Referrer-Policy: no-referrer`, `Cache-Control: private, no-store`, and the established restrictive CSP; return one identical translated unavailable response for invalid, expired, and revoked tokens with no redirect to recruiter sign-in; label demo-sourced content as non-production data adjacent to the content.
    - _Requirements: 25.2, 25.3, 25.4, 25.5, 25.6, 25.8, 25.9, 25.11, 23.6_
  - [~] 18.5 Register the fail-closed enterprise sharing extension points
    - Add an `EnterpriseSharingExtensionPoint` registry mapping authenticated organization-member access, Guest Dossier restriction to a configured company email domain, external identity-provider single sign-on for shared-report access, a permanent internal share valid while the owning account is `active`, and detailed per-viewer share audit records to `share_organization_access`, `share_domain_restriction`, `share_sso`, `share_permanent_internal`, and `share_viewer_audit`, each with `availability: "planned"` and a translated capability label.
    - Express every seam only through the existing Entitlement model so a future paid plan enables it by configuration; deny each unimplemented capability with the translated `ENTITLEMENT_UNAVAILABLE` response; label the capability planned rather than available on every public and recruiter-facing surface that describes it; add a dependency and route scan asserting no checkout, payment collection, invoicing, subscription renewal, or payment-provider integration exists.
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7, 26.8, 26.9_
  - [~] 18.6 Write property test for entitlement-gated single-dossier share lifecycle
    - **Property 41: Share grants are entitlement-gated, single-dossier, and lifecycle-correct**
    - Cover entitlement present/absent, one-time plaintext disclosure, all three expiry options plus omission, clock-driven expiry, passcode set/unset/wrong/rate-limited, email verification correct/expired/replayed-from-another-browser, regeneration with log retention, revocation, and owner-inactive outcomes sharing one identical unavailable envelope.
    - **Validates: Requirements 21.12, 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.7, 24.8, 24.9, 24.10, 24.11, 24.12, 24.14**
  - [~] 18.7 Write property test for reduced read-only single-candidate guest projection
    - **Property 42: The Guest Dossier is a reduced read-only single-candidate projection**
    - Seed an owner holding multiple candidates, requisitions, comparisons, notes, and telemetry with canary internal notes, workflow metadata, contact details, addresses, account identifiers, and authentication data; assert allowlisted fields only, no canary value, no out-of-scope surface or capability, and the same non-disclosing response for out-of-scope identifiers.
    - **Validates: Requirements 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7, 25.8, 25.9, 25.11**
  - [~] 18.8 Write property test for fail-closed enterprise extension points
    - **Property 43: Enterprise sharing extension points fail closed through entitlements**
    - **Validates: Requirements 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.8, 26.9**

- [ ] 19. Propagate demo designation as a write-time aggregate dimension
  - [~] 19.1 Denormalize is_demo onto owned records at write time
    - Add `is_demo` to `ai_telemetry`, `usage_ledger`, `usage_reservations`, `external_shares`, `share_access_log`, `analysis_versions`, and `repository_run_metrics`, alongside `users.is_demo`/`users.demo_label` and the existing `candidates.is_demo`, as guarded additive columns on both engines with the non-demo default for legacy rows.
    - Source the value from the owning account designation at insert time: request time for telemetry, reservation time for usage and reservations, creation time for shares and access log rows, and analysis time for analysis versions and run metrics. No read path resolves the designation by joining to the account's current value.
    - _Requirements: 23.1, 23.2, 14.1, 14.2, 14.3, 14.7, 14.8_
  - [~] 19.2 Compute dual real and demo aggregates and keep designation forward-only
    - Filter every Real Commercial Aggregate on the record's stored `is_demo`, produce real and demo totals as separately labeled values from one parameterized computation, emit any value mixing the two populations as a combined operational metric rather than a Real Commercial Aggregate, and exclude Demo Accounts and Demo Activity from both numerator and denominator of registration-conversion, retention, activation, and customer usage-distribution analytics.
    - Make the designation command write only the `users` row, append an audit entry with prior and new values, and record an effective-from timestamp that the Admin Console displays, so previously persisted telemetry and usage records are never retroactively altered. Add a tracked source scan asserting no `UPDATE ... SET is_demo` statement exists against telemetry, usage, reservation, share, or analysis history anywhere in the release.
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 23.7_
  - [~] 19.3 Write property test for forward-only demo designation and aggregate separation
    - **Property 40: Demo designation is forward-only and separates real from demo aggregates**
    - Generate mixed real and demo populations; assert real aggregates are unchanged by added Demo Activity, demo telemetry is excluded from real cost totals, a designation flip leaves previously persisted records byte-identical, a demo reset leaves every non-demo record byte-identical, and every demo-bearing projection carries the designation and label adjacent to the content.
    - **Validates: Requirements 21.9, 21.10, 21.11, 23.1, 23.2, 23.5, 23.6, 23.7**

- [ ] 9. Build the recruiter dossier, robust states, localization, RTL, and accessibility
  - [~] 9.1 Implement the recruiter-first dossier summary and expandable evidence detail
    - Order the report as decision summary, exact repository/attribution outcomes, requisition fit, keyboard-operable canonical evidence, explicitly excluded unverified evidence, interview questions, and methodology/version/fallback disclosure.
    - Include role relevance, strongest eligible evidence, material gaps, attribution coverage, uncertainty, next action, and `aria-expanded`/`aria-controls` detail sections.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 12.4, 12.7_
  - [~] 9.2 Implement complete translated robust-state view models
    - Cover loading, empty, partial, fallback, validation, permission, quota, expired/revoked/unavailable share, rate limit, and unexpected errors with safe messages, unavailable categories, status announcements, valid keyboard recovery, and adjacent synthetic labels.
    - _Requirements: 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11_
  - [~] 9.3 Complete English/Arabic localization and persistent document direction across the route inventory
    - Inventory and cover `/`, `/signin`, `/analyze`, `/candidates`, `/candidates/[id]`, `/candidates/[id]/projects/[analysisId]`, `/candidates/[id]/share`, `/compare`, `/review`, `/requirements`, `/insights`, `/about`, `/methodology`, `/pilot`, and the public `/share` route, plus every user-facing route added during remediation.
    - Add every route/control/tooltip/table/chart/validation/explanation/export key in both locales, persist preference on the user with cookie fallback, set root `lang`/`dir`, mirror directional UI, and isolate paths/URLs/revisions/code/commands/identifiers with LTR bidi markup.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 18.9_
  - [~] 9.4 Make all changed surfaces responsive and WCAG 2.2 AA operable
    - Support the complete route inventory at 320/768/1280 widths and 200% zoom without viewport overflow; use mobile cards where needed, wrapping citations, ordered headings/landmarks, names, labels, focus, error association/focus, touch targets, contrast, reduced motion, and keyboard-only operation.
    - _Requirements: 9.7, 9.8, 9.9, 9.10, 9.11, 9.12, 9.13, 9.14, 18.9_
  - [~] 9.5 Write property test for safe robust-state projections
    - **Property 24: Robust view models disclose partial and synthetic states safely**
    - **Validates: Requirements 8.2, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11**
  - [~] 9.6 Write property test for technical-token bidi integrity
    - **Property 25: Technical tokens preserve direction and copy value**
    - **Validates: Requirements 9.3, 9.4, 9.6, 9.14**

- [ ] 20. Build the /admin console, metrics, account inventory, and administrative commands
  - [~] 20.1 Add the administrative route structure, shell, and caching posture
    - Create `src/app/admin/layout.tsx`, `page.tsx`, `accounts/page.tsx`, `accounts/[accountId]/page.tsx`, `demo/page.tsx`, and `audit/page.tsx`, plus `src/app/api/admin/metrics/route.ts` (GET), `accounts/route.ts` (GET search/filter/paginate), `accounts/[accountId]/route.ts` (GET detail), `accounts/[accountId]/lifecycle|plan|credits|demo|password-reset/route.ts` (POST), `accounts/[accountId]/shares/[shareId]/revoke/route.ts` (POST), `impersonation/route.ts` (POST start/end), and `audit/route.ts` (GET, read-only paginated).
    - Mark admin pages `dynamic = "force-dynamic"` so a role decision is never served from a static or shared cache, send `Cache-Control: private, no-store` on every administrative response, and render an `AdminShell` distinct from the recruiter `AppShell` navigation set so administrative navigation never appears to a Recruiter and administrative routes are not linked from recruiter surfaces.
    - _Requirements: 20.1, 19.6, 19.7_
  - [~] 20.2 Implement dashboard metrics with explicit populations and denominators
    - Represent every figure as an `AdminMetric` carrying id, value, `availability`, `unavailableReason`, `population`, `aggregateClass`, denominator label and value, period start/end/label, `roundingRule`, and `coverage`; never emit a bare number.
    - Compute the dashboard set once for `population: "real"` and once for `population: "demo"` from one parameterized SQL shape: total accounts, active accounts, new accounts in period, free-plan and paid-plan accounts, suspended accounts, Demo Accounts, Candidates analyzed, Repositories analyzed, AI request count, billable usage totals, Estimated Cost totals, Actual Cost totals, and failed analysis and failed AI counts, keeping money in integer micros end to end and reconciling repository counts with the established run-metric invariants.
    - Use a parity helper for conditional counting (`COUNT(*) FILTER (WHERE ...)` on PostgreSQL, `SUM(CASE WHEN ... THEN 1 ELSE 0 END)` on SQLite). Resolve a metric whose source table is absent, whose period holds no records, or whose query fails to `value: null` with `availability: "unavailable"` and a reason rendered as a translated unavailable label rather than `0`; exclude requests with absent usage from the usage denominator instead of counting them as zero; report `coverage` as available/total for Actual Cost so partial reporting is not read as lower spend; label an unresolved plan as unavailable rather than free. Emit any mixed population as `combined_operational` and reserve Real Commercial Aggregate presentation for `population: "real"`.
    - _Requirements: 20.2, 20.3, 20.4, 20.5, 20.6, 23.3, 23.4_
  - [~] 20.3 Implement the paginated searchable account inventory and account detail view
    - Add `AdminAccountQuery` (search, `lifecycleState`, `planTierId`, `isDemo`, opaque cursor, page size default 25 and maximum 100) and `AdminAccountRow` (id, email, company name, lifecycle state, plan tier, demo designation and label, usage totals, quota limit/remaining pairs, registration timestamp, last activity timestamp).
    - Order by the total order `(created_at DESC, id DESC)` and paginate by keyset rather than offset: the cursor is a base64url encoding of that tuple and the next page uses `WHERE (created_at, id) < (:cursorCreatedAt, :cursorId)`, so concurrent inserts cannot skip or duplicate a row; validate and reject a malformed cursor rather than trusting it. Parameterize every search branch with exact match on `id` and case-folded `LIKE`/`ILIKE` on `email` and `company_name`, escaping `%`, `_`, and the escape character in user input so a wildcard cannot widen the match; compose filters as conjunctions; render an absent `lastActivityAt` or usage value as unavailable rather than zero.
    - Build the detail view over the account's Candidates, repository analyses, Requisitions, usage records, AI Telemetry Records, and external share records, each read with the account id as the owner scope so no foreign record can appear; show share status, Share Expiry Option, expiration timestamp, passcode requirement, email-verification requirement, and Share Access Log entries while excluding both the plaintext External Share Token and the `token_digest` column from the projection.
    - Reuse the established `src/components/ui/StateBlock.tsx` and `EmptyState.tsx` primitives for pending, empty, partial, denied, and unexpected Robust States with translated copy and no stack trace or secret.
    - _Requirements: 20.7, 20.8, 20.9, 20.10, 20.11, 20.14, 21.1, 21.2_
  - [~] 20.4 Implement lifecycle commands and suspended/soft-deleted enforcement
    - Implement `activate`, `suspend`, `reactivate`, `soft_delete`, and `restore` against the documented transition table so exactly one `lifecycle_state` is set per command, an illegal transition changes nothing and returns `ACCOUNT_STATE_TRANSITION_INVALID`, and each applied command appends an audit entry whose `before`/`after` carry the prior and new state.
    - Make soft delete write `lifecycle_state = 'soft_deleted'` and `soft_deleted_at` and nothing else: no row deleted, no `owner_user_id` rewritten, no record reparented to a placeholder account, and no cascade, so restore only clears `soft_deleted_at` and sets `active` and the prior record set becomes visible exactly as it was.
    - Enforce lifecycle at the authentication and API boundaries: `requireActiveUser()` wrapping `getCurrentUser()` and called by `requirePageUser`, `authenticateRequest`, and `denyUnlessSignedIn`, yielding the translated `ACCOUNT_UNAVAILABLE` state and clearing the session cookie on the page path so an issued session stops working immediately; `POST /api/auth/login` checking lifecycle **after** password verification so the form is not an account-existence oracle; `PilotAccessService.reserve()` refusing a metered operation before any quota arithmetic; `POST /api/public/shares/resolve` returning the one shared unavailable envelope when the owning account is not `active`; and `soft_deleted` accounts excluded from active-account metrics and customer analytics while remaining readable in the Admin Console.
    - _Requirements: 21.3, 21.4, 21.5, 21.6_
  - [~] 20.5 Implement plan, credit, demo, share-revocation, and password-reset commands
    - Plan change writes `plan_tier_id` and lets the existing Pilot Access Service resolve entitlements and quotas from the tier registry on the next evaluation, introducing no payment field, checkout, invoice, or provider call.
    - Credit and quota adjust and reset persist the new limit and the new remaining value together in one transaction so an evaluation can never see a new limit against a stale remaining value, apply to the next metered evaluation, audit prior and new values, and restore the tier default on reset.
    - Demo designation and creation require an Admin-supplied `demo_label` of 1-80 characters stored and rendered as supplied, and seed the account from a versioned `src/features/demo/fixtures.ts` (`demoFixtureVersion`) covering Requisitions, Candidates, repository analyses, Evidence Citations, one requisition-bound comparison, one Review-First Order, and one external share record built only from the release's synthetic corpus, so no real person's contact data and no live repository text enters a demo account.
    - Demo reset runs in one transaction that first asserts `is_demo` on the target (`SELECT is_demo FROM users WHERE id = :id FOR UPDATE` on PostgreSQL, the same read inside `BEGIN IMMEDIATE` on SQLite) and aborts with `DEMO_RESET_TARGET_INVALID` otherwise, and carries `owner_user_id = :demoAccountId` on every delete and insert so there is no unscoped statement in the reset path and no non-demo account can be matched.
    - Demo labeling renders the designation and label adjacent to demo content on administrative, recruiter-facing, and externally shared surfaces, reusing the established `Badge tone="warning"` pattern from `src/app/candidates/[id]/share/page.tsx` and `src/components/review/ReviewQueueList.tsx` and extending it to Admin Console rows and the guest dossier.
    - Share revocation sets `revoked_at` so subsequent resolution returns the shared unavailable envelope, with no delete statement against `share_access_log`.
    - Password reset is provider-mediated and secret-free: the command calls the existing authentication path's reset initiation, which mints a single-use secret, stores only its digest with an expiry, and delivers it to the account's **registered** address. The administrative response is `{ initiated: true, deliveredToRegisteredAddress: true, expiresAt }`, and the current password, new password, password hash, reset secret, and any reset URL are absent from the response, the Admin Console view, the audit entry (whose `parameters` record only `{ method: "provider_email_reset" }`), and the logs. No administrative path sets a password directly or renders a reset link.
    - _Requirements: 21.7, 21.8, 21.9, 21.10, 21.11, 21.12, 21.13_
  - [~] 20.6 Localize, mirror, and make the administrative console responsive and accessible
    - Add every administrative view, control, table, filter, validation message, and Robust State key in English and Arabic, set correct root language and direction, render Technical Tokens left-to-right with bidi isolation, mirror directional UI, and provide keyboard-only operation, visible focus indicators, programmatic names, error association, touch targets, reduced motion, and WCAG 2.2 Level AA contrast.
    - Present `/admin` and the account table at 320, 768, and 1280 pixel widths and at 200 percent browser zoom without viewport-level horizontal overflow, using mobile card layouts where a table cannot fit; extend the task 9.3 route inventory with `/admin`, `/admin/accounts`, `/admin/accounts/[accountId]`, `/admin/demo`, and `/admin/audit`.
    - _Requirements: 20.12, 20.13, 20.14, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11, 9.12, 9.13, 9.14, 18.9_
  - [~] 20.7 Write property test for single-valued lifecycle transitions and ownership preservation
    - **Property 37: Account lifecycle transitions are single-valued and preserve ownership**
    - Fingerprint every owned record before soft delete and assert an identical fingerprint after restore with no record deleted and no `owner_user_id` reassigned; assert denial of sign-in, session use, metered operations, and share validation while suspended or soft-deleted; assert a plan, credit, or quota change governs the next metered evaluation from the newly persisted limit and remaining values together.
    - **Validates: Requirements 21.1, 21.3, 21.4, 21.5, 21.6, 21.7, 21.8**
  - [~] 20.8 Write property test for reproducible administrative metrics and stable pagination
    - **Property 38: Administrative metrics are reproducible and never substitute zero**
    - Generate account, usage, telemetry, and share populations across selected periods; assert each metric is reproducible from its numerator, denominator, period boundary, and rounding rule, that absent/empty/failing sources resolve to unavailable rather than zero, and that paginated traversal reconstructs exactly the reference filtered set in the documented order with no duplicate or omission, including when rows are inserted mid-traversal.
    - **Validates: Requirements 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8, 20.9, 20.10, 23.3, 23.4**

- [ ] 21. Implement bounded audited impersonation with safe restoration
  - [~] 21.1 Implement the separate signed grant, duration clamp, and server-side grant lookup
    - Issue a second cookie rather than rewriting, replacing, or re-signing the admin's session cookie: `__Host-codeproof_impersonation` in production and `codeproof_impersonation` otherwise, `HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/`, and `maxAge` equal to the remaining grant lifetime, with payload `base64url(canonicalJson(grant)) + "." + HMAC-SHA256(canonicalJson(grant), sessionSecret() + ":impersonation.v1")`. The distinct `purpose: "impersonation.v1"` label and distinct key derivation prevent replaying a session token as a grant or a grant as a session.
    - Clamp duration with `min(configured, 60)` from `CODEPROOF_IMPERSONATION_MAX_MINUTES`, falling back to 15 minutes for an absent, non-numeric, zero, or negative value, so the assigned duration is never greater than 60 minutes regardless of configuration.
    - Resolve `impersonation_grants` (`grant_id`, `admin_actor_user_id`, `target_user_id`, `reason_redacted`, `started_at`, `expires_at`, `ended_at`, `end_reason`, `start_audit_entry_id`, `end_audit_entry_id`) on every request so a signature alone is insufficient: deny a grant with `ended_at IS NOT NULL` or `expires_at <= now` with the non-disclosing envelope and require a new authorized grant. Have the first request observing expiry close the grant with `end_reason = "expired"` and append the end audit entry, and add a reconciliation pass that closes abandoned grants so expiry is always audited.
    - Require the Admin Role, an explicit target account, and a recorded reason bounded to 200 characters with secret shapes redacted at start, appending the start audit entry; deny a non-admin request to create, continue, or extend a grant with the non-disclosing authorization response.
    - _Requirements: 22.1, 22.2, 22.3, 22.11, 22.12_
  - [~] 21.2 Implement principal resolution and the deny-by-default dangerous-action list
    - Add `resolveRequestPrincipal()` returning `actingUserId`, `adminActorUserId`, and the impersonation context, and keep passing existing owner-scoped stores exactly one `ownerUserId` set to `actingUserId` so no store signature changes and the established owner-scope guarantees continue to hold. Have `requireAdmin()` deny while a grant is active with `denial_reason: "impersonation_active"` so an administrative command cannot execute with an ambiguous acting identity.
    - Add `DANGEROUS_IMPERSONATED_ACTIONS` covering `password_change`, `email_change`, `authentication_method_change`, `billing_change`, `payment_method_change`, `plan_purchase`, `account_ownership_transfer`, `account_deletion`, `admin_role_change`, `provider_credential_change`, and `secret_disclosure`, and enforce `assertImpersonationAllowed(category, principal)` in the command layer beneath both the route handler and the server action so an interface request, a direct API call, a script, and a command-line tool are denied identically with `IMPERSONATION_ACTION_BLOCKED` and a translated message naming the blocked category. Treat hiding or disabling a control as presentation only, never as the enforcement.
    - Require every mutating command to declare an `actionCategory` and block a command with an undeclared category under impersonation; add a route-inventory test asserting each mutating handler declares one and treat a missing declaration as a `high` defect rather than a silent allow.
    - Append an entry carrying both `actor_user_id` and `impersonated_user_id` for every impersonated state-changing request, plus start, end-by-control, end-by-expiry, each blocked dangerous action, and each denied non-admin grant attempt. Keep impersonation credential-free: the grant carries only identifiers and a reason and never reads, stores, transmits, or derives a password, password hash, session credential, provider credential, or External Share Token, and every impersonated response and log is built from explicitly selected columns.
    - _Requirements: 22.7, 22.8, 22.9, 22.10_
  - [~] 21.3 Render the root-layout impersonation banner and implement safe return
    - Have `src/app/layout.tsx` additionally await `resolveRequestPrincipal()` and render `<ImpersonationBanner>` above **both** the signed-in and signed-out shell variants, so because the root layout wraps every App Router route no rendered route can omit the banner.
    - Render the impersonated account label wrapped in `<bdi>` so an email or company name cannot flip the surrounding direction; server-render remaining time as whole minutes from `expiresAt` and refine it with a client countdown so the banner is never blank without JavaScript; announce state changes through a restrained `role="status"` `aria-live="polite"` region rather than every tick; provide the Return To Admin Control as a real `<button type="submit">` inside a `POST` form that is keyboard reachable and operable with a visible focus indicator; supply English and Arabic text, correct direction, and WCAG 2.2 AA contrast in both locales; switch to an expired state at zero remaining time while keeping the server-side grant lookup, not the countdown, as the enforcement.
    - Have Return To Admin post to the impersonation end endpoint, which sets `ended_at` and `end_reason = "returned"`, appends the end audit entry, deletes the impersonation cookie, and redirects to `/admin`; because the admin session cookie was never touched, the original principal is restored with no re-authentication and start-then-return is an exact round trip.
    - _Requirements: 22.4, 22.5, 22.6, 22.13_
  - [~] 21.4 Write property test for bounded restorable impersonation
    - **Property 39: Impersonation is bounded, restorable, and cannot act dangerously**
    - Generate absent, zero, negative, and oversized duration configuration; expiry, revocation, and completion replays; return round trips; every dangerous and undeclared category through both the form and direct API paths; and banner presence across the full route inventory while a grant is active.
    - **Validates: Requirements 22.2, 22.4, 22.5, 22.6, 22.7, 22.8, 22.11, 22.12**
  - [~] 21.5 Write property test for secret-free administrative and impersonated surfaces
    - **Property 36: Administrative and impersonated surfaces never emit secrets**
    - Seed generated canary password values, password hashes, session credentials, reset secrets, External Share Tokens, Share Passcode values, and provider API keys, then serialize every Admin Console view model, administrative API response, administrative export, Administrative Audit Log entry, impersonated response, and emitted log or diagnostic and assert no canary value and no reversible derivative appears.
    - **Validates: Requirements 19.15, 21.2, 21.13, 22.10, 24.12**

- [ ] 10. Add public methodology, pilot positioning, and build/analysis traceability
  - [~] 10.1 Implement bilingual public methodology
    - Explain the active taxonomy/version/effective date, exact contribution statuses, eligible-contribution rule, neutral gaps, corpus bounds, denominators, exact citations, optional AI/fallback, no-code-execution boundary, draft order, and recruiter final responsibility.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.7, 10.8_
  - [~] 10.2 Implement bilingual value-led pilot presentation
    - Lead with source-linked role evidence, review efficiency, bilingual access, and defensible human review; present at least two configurable pilot tiers/limits without unsupported quantified outcomes, billing promises, checkout, or payment behavior.
    - _Requirements: 10.5, 10.6, 10.7, 11.1, 11.12, 11.13_
  - [~] 10.3 Implement build metadata, health/diagnostics, and report traceability
    - Capture release commit SHA, build ID, deployment environment, build/release date, and verification timestamp as applicable in a server-only module; expose minimal non-secret public health and authorized persistence/migration/provider-pricing diagnostics.
    - Round-trip engine, taxonomy, requisition, AI schema/provider/model/prompt/pricing, analysis timestamp, and applicable build identifiers; mark missing production SHA/date/build IDs degraded and disclose rather than fabricate.
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 18.14_
  - [~] 10.4 Write property test for traceability projections
    - **Property 27: Build and analysis traceability round-trips**
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.7**

- [ ] 11. Add required synthetic unit, integration, security, and persistence regressions
  - [~] 11.1 Add attribution, taxonomy, detector, citation, and contradiction suites
    - Cover all four statuses x all four origins, manual default, staleness, origin confirmation, exact thresholds, `Testing`/`Automated testing`/`unit`/`unit testing`/`integration`/`integration testing` alias boundaries, meaningful GitHub Actions => `CI/CD` and non-meaningful workflow rejection, symbol/line/excerpt/direct-source-link fields, unsupported claims, redaction, and the Flask `schema.sql` HTTP-context gate.
    - _Requirements: 15.2, 15.3, 15.4, 15.5, 18.1, 18.2, 18.3, 18.4, 18.5_
  - [~] 11.2 Add provider-neutral AI and pilot-access integration suites
    - Use provider/clock/store mocks for absent/valid/malformed output, provider/model primary-source metadata, effective/check dates and unit prices, missing/stale pricing, estimate/actual cost, per-Candidate/per-100/configured-volume projections, assumption changes, absent-vs-zero usage, budget skip, timeout, retry bounds, no-retry errors, cache reuse, telemetry, entitlement denial, quota exhaustion/reset, failure release, concurrency, and omitted billing behavior.
    - _Requirements: 15.6, 15.18, 15.19, 18.11, 18.12, 18.13_
  - [~] 11.3 Add exact metrics, requisition, comparison, and review-order suites
    - Assert known file/byte/language/evidence denominators and exclusions; exact selected/successful/failed/pending and per-status attribution counts; completed/active reconciliation; immutable same-Requisition binding; explicit mismatched-Requisition rejection/recompute; neutral unknown wording; stable ties; explanatory factors/citations; no workflow mutation; saved comparison reload; and Evidence-Checked invalidation.
    - _Requirements: 15.7, 15.8, 18.6, 18.7, 18.10_
  - [~] 11.4 Add owner-isolation and external-sharing security suites
    - Cover candidates, requisitions, analyses, comparisons, telemetry, pilot tiers, quotas, and share management across foreign/nonexistent IDs plus signed-out valid/invalid/expired/revoked/cross-share/rate-limited token behavior, no sign-in redirect, headers, read-only APIs, PII allowlist, and secret canaries.
    - _Requirements: 15.9, 15.10, 15.11, 18.8_
  - [~] 11.5 Add repository/CV hostile-input security suites
    - Cover URL confusion, traversal, absolute/symlink/device paths, nested archives, expansion/file/byte bounds, generated paths, oversized inputs, prompt-injection containment, output encoding, redacted logging, and spies proving no code/dependency/build/test/hook/macro execution.
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.10, 13.11, 15.12_
  - [~] 11.6 Add dual-database migration and data-compatibility contract suites
    - Exercise fresh and commit-`0757554` legacy fixtures, exact status/origin reconciliation counts, repeated upgrades, injected rollback, recompute quarantine, old request defaults, old response fields, existing owner links/data, and SQLite/PostgreSQL parity.
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 14.9, 14.11, 15.13, 15.14_
  - [~] 11.7 Write property test for non-disclosing owner scope
    - **Property 29: Owner scope is non-disclosing across private resources**
    - **Validates: Requirements 6.11, 7.1, 7.13, 11.11, 13.7, 13.8, 15.9**

- [ ] 22. Add administrative, impersonation, guest, demo, and RTL regression suites
  - [~] 22.1 Add admin authorization, bootstrap, audit, and lifecycle suites
    - Admin authorization matrix: no session, non-admin session, admin session, suspended admin, soft-deleted admin, an injected role claim in cookie/body/query/header/form state, browser and non-browser clients, denial-threshold crossing with limiter reset on success, and identical response shape, status, headers, and body for an absent target versus a forbidden target. Assert every administrative route module imports the guard and that no `GET` path executes a state change.
    - Admin bootstrap matrix: variable absent, empty, whitespace-only, case-differing, matching, non-matching, repeated initialization, concurrent initialization, and an existing admin whose email no longer matches, asserting the divergence diagnostic instead of demotion or a second elevation, and asserting `.env.example` documentation plus the no-hardcoded-credential source and client-bundle scan.
    - Audit matrix: exactly one entry per command, chain recomputation over canonical content, attempted update, delete, and truncate on both engines, injected append failure with a byte-identical target-state assertion, and redaction canaries in `parameters`, `before`, and `after` including nested objects and array elements.
    - Lifecycle matrix: every command from every state, sign-in and authenticated session use while suspended and soft-deleted, login lifecycle check ordering after credential verification, metered-operation refusal, share-validation refusal for an inactive owner, active-account metric exclusion, and a record and ownership fingerprint across soft delete then restore.
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7, 19.8, 19.9, 19.10, 19.11, 19.12, 19.13, 19.14, 19.15, 21.3, 21.4, 21.5, 21.6, 21.7, 21.8, 21.14, 21.15, 15.9_
  - [~] 22.2 Add impersonation, sharing, guest dossier, and demo isolation suites
    - Impersonation matrix: oversized, zero, negative, and absent duration configuration, clock advance to and past expiry, the return round trip, every dangerous category through both the form and the direct API path, an undeclared category, non-admin creation/continuation/extension, dual-identity audit entries, and banner presence across the route inventory.
    - Sharing matrix: entitlement present and absent, one-time plaintext disclosure with no retrieval path, regeneration with prior-token invalidation and access-log retention, all three expiry options plus omission defaulting to 7 days, clock-driven expiry, passcode set/unset/wrong/rate-limited with an envelope identical to an invalid share, guest email verification correct/expired/replayed-from-another-browser, revocation with log retention, and a suspended owner.
    - Guest dossier matrix: a multi-candidate owner with canary notes, PII, workflow metadata, export affordances, and AI affordances; out-of-scope candidate, analysis, share, account, and administrative identifiers; response headers and CSP; and the same translated unavailable envelope with no sign-in redirect across invalid, expired, and revoked tokens. Add the enterprise extension-point fail-closed and no-payment-path scan.
    - Demo matrix: mixed real and demo populations, reset isolation fingerprints proving non-demo records are untouched, a designation flip with byte comparison of historical telemetry and usage rows, the no-`UPDATE ... SET is_demo` source scan, and demo labeling on administrative, recruiter-facing, and guest surfaces.
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7, 22.8, 22.9, 22.10, 22.11, 22.12, 22.13, 23.1, 23.2, 23.3, 23.4, 23.5, 23.6, 23.7, 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.7, 24.8, 24.9, 24.10, 24.11, 24.12, 24.13, 24.14, 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7, 25.8, 25.9, 25.11, 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7, 26.8, 26.9, 15.9, 15.10, 15.11_
  - [~] 22.3 Extend the Browser Matrix with administrative, banner, and guest coverage
    - Exercise desktop English LTR, desktop Arabic RTL, mobile English, and mobile Arabic RTL at 320, 768, and 1280 pixel widths and 200 percent zoom across `/admin`, `/admin/accounts`, `/admin/accounts/[accountId]`, `/admin/demo`, `/admin/audit`, the guest dossier route, and the impersonation banner on a representative route from every segment while a grant is active.
    - Assert no viewport-level horizontal overflow, keyboard-only operation and focus order, visible focus indicators, programmatic names and expanded semantics, ordered headings and landmarks, root language and direction, left-to-right Technical Token rendering with preserved copy values, translated Robust States, touch targets, contrast checks, and reduced motion.
    - _Requirements: 20.12, 20.13, 22.13, 25.10, 15.15, 15.16, 18.9_

- [~] Checkpoint B - Validate integrated domain and security regressions
  - Ensure all tests pass, ask the user if questions arise.
  - Confirm every correctness-property task scheduled through this checkpoint and all synthetic unit/integration/security/migration suites pass before adding browser automation.
  - _Requirements: 15.1-15.14, 17.2, 17.4_

- [ ] 12. Add tracked synthetic E2E, responsive, and public-page coverage
  - [~] 12.1 Build isolated synthetic E2E fixtures and deterministic seeding
    - Create no-production-data candidates/CVs, safe public archive fixtures, identities, requisitions/versions, analyses, shares, pilot usage, clocks, cleanup, and SQLite/PostgreSQL-compatible seed helpers; never commit credentials or plaintext production tokens.
    - Reproduce the established demo scenarios: sample CV -> `sindresorhus/is`, candidate-linked portfolio confirmation -> `sindresorhus/p-limit`, and a second Demo-labeled Candidate -> `chalk/chalk` plus an unavailable portfolio. Include meaningful/empty GitHub Actions, testing aliases, neutral PostgreSQL unknown, same/mismatched requisitions, and signed-out share lifecycle fixtures.
    - _Requirements: 15.1, 15.13, 15.17, 18.15, 18.16_
  - [~] 12.2 Automate the complete authenticated core workflow
    - Cover sign-up/sign-in, sample CV discovery of `sindresorhus/is`, portfolio confirmation of `sindresorhus/p-limit`, bounded deterministic analysis, recruiter dossier, candidate persistence, a Demo-labeled `chalk/chalk` Candidate with unavailable portfolio, requisition/version, same-role saved comparison, explicit mismatched-role rejection, Review-First Order, evidence acknowledgement, signed-out share create/access/expire/revoke, and Hiring Insights.
    - For network-enabled repository checks, record immutable revisions and treat unavailable network access as externally unverifiable; never execute repository source.
    - _Requirements: 15.17, 18.7, 18.8, 18.15, 18.16_
  - [~] 12.3 Automate deterministic fallback and robust-state workflows
    - Run the complete core workflow without provider credentials and cover loading, empty, partial repository failure, missing pricing, budget/quota exhaustion, permission, validation, unavailable/expired/revoked share, recovery, and synthetic labeling.
    - _Requirements: 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 15.18_
  - [~] 12.4 Automate the full Browser Matrix and accessibility regressions
    - Exercise desktop English LTR, desktop Arabic RTL, mobile English, mobile Arabic RTL, 320/768/1280 viewports, and 200% zoom across every route inventoried in task 9.3, using synthetic IDs for parameterized routes.
    - Assert no overflow, keyboard order, focus visibility, expanded semantics, landmarks/headings, root language/direction, token direction/copy, translated states, touch targets, contrast checks, and reduced motion.
    - _Requirements: 9.1, 9.3, 9.4, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11, 9.12, 9.13, 9.14, 15.15, 15.16, 18.9_
  - [~] 12.5 Automate public methodology, value, pilot, and build metadata regressions
    - Verify unauthenticated English/Arabic methodology content, taxonomy version/date, exact attribution and denominator explanations, neutral unknown wording, no-execution and human-decision disclaimers, draft-order disclaimer, recruiter-value positioning, capability-not-outcome language, pilot limits/no billing, provider/model pricing source/date/unit costs, configurable assumptions, per-Candidate/per-100 projections, commit SHA/build date, health metadata, and external allowlist.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 11.13, 12.2, 15.20, 18.10, 18.11, 18.12, 18.13, 18.14_
  - [ ]* 12.6 Add a bounded live-provider smoke that runs only when an existing key is present
    - Gate the smoke with explicit environment detection; send only synthetic minimal content, cap expected input/output and budget, use a current officially sourced pricing row, perform one request with timeout, redact recorded output, and skip as externally unverifiable when no key exists.
    - Never create, request, print, persist, or commit a provider key, and never make this optional smoke a prerequisite for deterministic workflow success.
    - _Requirements: 4.6, 4.7, 4.12, 4.13, 4.16, 4.18, 17.3_

- [ ] 23. Automate the 21-step recruiter demo simulation
  - [~] 23.1 Build the parameterized simulation project and its synthetic account fixtures
    - Add the tracked Playwright project `recruiter-demo-simulation` parameterized over `{ accountMode: fresh | existing } x { locale: en | ar } x { viewport: desktop 1280 | mobile 390 }`, so the Fresh Account Run and the Existing Account Run both execute across the full Browser Matrix and both device classes.
    - Extend the task 12.1 fixtures with a realistic synthetic CV, a requisition carrying role requirements and evaluation criteria, a batch of multiple valid repository archives plus exactly one invalid archive, share grants across all three expiry options, pilot usage at and past quota, demo fixture baselines, and seeded existing-account state; commit no production data, no credentials, and no plaintext production tokens.
    - _Requirements: 28.1, 28.20, 28.21, 15.1, 15.17_
  - [~] 23.2 Automate steps 1-11 from onboarding through grounded questions
    - Register (fresh) or sign in (existing) and reach the initial workspace; create a Requisition with role requirements and evaluation criteria; import the realistic CV and confirm bounded CV text ingestion; complete portfolio and repository discovery then Recruiter confirmation of the discovered repositories; verify the recorded Discovery Origin and Attribution Status for every reviewed repository.
    - Analyze multiple valid repositories plus exactly one invalid repository in one batch, then verify partial-failure handling with reconciled selected, successful, failed, and pending counts and the failed repository disclosed; verify file-level evidence, Evidence Citations, bounded snippets, and working source links; verify every displayed Candidate Conclusion carries at least one eligible Evidence Citation with no Contradiction Invariant violated; verify each generated question is a Context-Safe Interview Question grounded in a cited evidence item or a labeled evidence gap.
    - _Requirements: 28.2, 28.3, 28.4, 28.5, 28.6, 28.7, 28.8, 28.9, 28.10, 28.11_
  - [~] 23.3 Automate steps 12-19 across comparison, sharing, telemetry, admin, demo, and impersonation
    - Complete a comparison bound to a compatible Requisition Version; review the ranked Review-First Order queue and complete a Recruiter-initiated Candidate stage update.
    - Generate an External Share, open the Guest Dossier as a Guest Reviewer, verify expiry behavior and revocation behavior, and verify guest isolation and personal-data reduction against the PII-Safe field allowlist; verify Pilot Tier limits, Entitlement denial, Quota exhaustion blocked states, AI usage telemetry, and AI cost telemetry.
    - Verify the complete `/admin` dashboard including every dashboard metric, account table search, account table filtering, Account Lifecycle State changes, a plan change, and a Credit Balance adjustment; verify Demo Account creation and Demo Account reset; verify Impersonation Session start, Impersonation Banner presence, Dangerous Impersonated Action denial, and safe return through the Return To Admin Control.
    - _Requirements: 28.12, 28.13, 28.14, 28.15, 28.16, 28.17, 28.18, 28.19_
  - [~] 23.4 Automate the cross-cutting assertions, evidence capture, and blocked-check disclosure
    - Assert keyboard-only operation, visible focus order, programmatic labels, and WCAG 2.2 Level AA contrast on every exercised interface; assert no viewport-level horizontal overflow at either viewport in either locale; assert no Unexpected Runtime Error in browser-console output or server runtime output.
    - Record each step's outcome plus captured artifacts (screenshot, console log, server log, trace), the commit hash, and the run timestamp for each Fresh Account Run and Existing Account Run; mark the simulation failed and leave the Release Gate unsatisfied on any failing step.
    - Run the capability probe before the run and execute each Live Provider Check only where its credential or infrastructure exists; otherwise run the deterministic and mocked contract checks and record a Blocked Live Check naming the exact unavailable input (`OPENAI_API_KEY` plus a current pricing row, `DATABASE_URL`/`POSTGRES_URL`, `github_network_egress`, `email_transport`, or the exact missing deployment input), never recording it as passed and never substituting a mocked equivalent presented as the real dependency.
    - _Requirements: 28.22, 28.23, 28.24, 28.25, 28.26, 28.27_

- [ ] 13. Run and record all required source, data, build, and runtime validation
  - [~] 13.1 Run lint and TypeScript checks in non-watch mode
    - Run the normalized commands from a clean dependency install, fix remediation-caused failures without rewriting unrelated code, and attach command/version/result evidence to the release manifest.
    - _Requirements: 16.1, 16.2, 17.4_
  - [~] 13.2 Run all unit, property, integration, regression, security, and E2E suites
    - Execute every required synthetic suite in non-watch mode, including at least 100 generated cases per correctness property and the tracked core/Browser Matrix E2E; fix failures or disclose exact blockers.
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9, 15.10, 15.11, 15.12, 15.13, 15.14, 15.15, 15.16, 15.17, 15.18, 15.19, 15.20, 16.3_
  - [~] 13.3 Run production build, dependency audit, and migration/data-compatibility matrix
    - Record production build and dependency-vulnerability results with reviewed severity/disposition; run fresh, legacy, repeated, failure-injection, and parity checks against SQLite and a PostgreSQL-compatible path.
    - Do not silently waive a vulnerability, migration mismatch, missing database prerequisite, or build warning that affects launch.
    - _Requirements: 16.4, 16.5, 16.6, 16.12, 17.2_
  - [~] 13.4 Perform scoped diff, generated-artifact, and secret review
    - Compare final worktree state to the recorded baseline, list every changed spec/source/test/schema/documentation/deployment file, confirm unrelated user changes remain intact, reject accidental archives/databases/logs/build output, and scan diffs for credentials, tokens, PII, unsafe logs, and guessed pricing.
    - _Requirements: 1.13, 7.10, 13.6, 13.11, 17.5, 17.6, 17.7, 18.17_
  - [~] 13.5 Run automated runtime browser verification against the production build
    - Use the tracked Playwright web-server lifecycle rather than a watch process to verify changed public, auth, analysis, dossier, comparison, pilot/pricing, sharing, localization, robust-state, and Hiring Insights routes plus health/build identity.
    - Record browser/viewport/locale outcomes and ensure the process terminates after the suite.
    - _Requirements: 9.14, 15.15, 15.16, 15.17, 16.7, 18.9, 18.17_

- [ ] 24. Run the continuous verification loop and evaluate the release gate
  - [~] 24.1 Execute verification-loop cycles until every criterion is implemented or disclosed
    - This is a recurring required task, not a one-shot step. Repeat the cycle while any acceptance criterion in Requirements 1-29 remains unimplemented or failing: implement, run the unit, property, integration, authorization, migration, security, and UI suites in non-watch mode, exercise every affected workflow in a real browser, then inspect browser-console output, server runtime output, network activity, data integrity, security posture, responsiveness, accessibility, and Arabic RTL rendering.
    - Fix every reproducible defect rather than working around it, add a regression test for each meaningful defect, then re-run the previously passing checks in addition to the changed ones and record each outcome. Open a regression defect for any check whose `previouslyPassing` flag was true and now fails, and treat every Unexpected Runtime Error — an unhandled console error, an unhandled promise rejection, or a server exception no Robust State intentionally produces — as a defect.
    - Run the criterion-integrity, skip/exclusive-assertion, and Defect Masking scanners from task 15.2 on every cycle. Fail the cycle rather than weakening, deleting, skipping, disabling, or rewriting a criterion; when an assertion genuinely contradicts this requirements document, record the contradicting criterion and the rationale with the change. When a fallback executes, record `fallbackReason` and enqueue the corresponding primary-path check as a separate recorded check, and ensure every handled exception on a user-facing operation renders the applicable Robust State and a redacted diagnostic rather than a success result.
    - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6, 27.7, 27.8, 27.9, 27.10_
  - [~] 24.2 Enforce the persisted release-gate counter and severity triage thresholds
    - Persist `ReleaseGatePass` with `passOrdinal`, commit hash, start and completion timestamps, every per-check outcome, newly discovered defect ids, and `resetTriggeredByDefectId`, so a reset cannot be lost by inferring state from a log. Satisfy the gate only after two consecutive completed passes with no defect discovered between them, and on a defect discovered during either pass correct it and restart from `passOrdinal: 1` with the triggering defect id recorded.
    - Apply the severity thresholds: zero unresolved `critical` and zero unresolved `high` as a hard condition, and an unresolved `medium` item blocking only when it materially affects a Recruiter Demo Simulation step unless resolved or recorded in a product-owner-approved Release Disclosure; record the rationale for every severity change.
    - _Requirements: 27.11, 27.12, 27.13, 29.5, 29.6, 29.7_
  - [~] 24.3 Add build-metadata equivalence and the extended production smoke script
    - Extend `GET /api/health` with non-secret `commitSha` and `buildDate` injected at build time from `VERCEL_GIT_COMMIT_SHA`/`CODEPROOF_COMMIT_SHA` and `CODEPROOF_BUILD_DATE` through the server-only build-metadata module, added beside the existing readiness fields rather than replacing them.
    - Extend the task 14.1 smoke scripts to cover health, authentication, analysis, external sharing, the Admin Console, English content, Arabic content, a desktop viewport, and a mobile viewport, consuming URLs through environment variables and logging no credential or share token. Add the equivalence check comparing the Release Gate verified commit, the commit reported by the verified deployment, and the production `commitSha`, requiring all three non-empty and equal.
    - _Requirements: 29.10, 29.11, 29.12, 12.1, 12.2, 16.13, 16.14_
  - [~] 24.4 Write property test for the twice-consecutive defect-free release gate
    - **Property 45: The release gate requires two consecutive defect-free passes**
    - Generate interleavings of recorded pass completions and defect discoveries; assert satisfaction only after two consecutive clean passes, a reset to the first pass after a defect with the triggering defect recorded, and per-pass commit hash, timestamps, and check outcomes.
    - **Validates: Requirements 27.2, 27.11, 27.12, 27.13, 29.7**
  - [~] 24.5 Write property test for honest final-release evaluation and commit equivalence
    - **Property 46: Final release conditions and commit equivalence are evaluated honestly**
    - Generate evidence sets, credential and infrastructure availability vectors, and triples of gate commit, deployed commit, and production Build Metadata; assert a blocked live check is never recorded as passed, and that any absence, mismatch, or observed production divergence fails the conditions and is recorded with the Demo-Readiness Verdict, known limitations, and every Blocked Live Check.
    - **Validates: Requirements 28.24, 28.25, 29.1, 29.2, 29.3, 29.4, 29.5, 29.6, 29.8, 29.9, 29.10, 29.11, 29.12, 29.13, 29.14, 29.15, 29.16**

- [~] Checkpoint C - Confirm the local launch gate
  - Ensure all tests pass, ask the user if questions arise.
  - Require recorded lint, typecheck, full test, build, dependency audit, migration, diff/secret review, and runtime Browser Matrix results before commit or deployment.
  - _Requirements: 16.1-16.7, 16.12, 17.2, 17.4, 17.5, 17.6_

- [ ] 14. Complete release integration, deployment verification, and disclosure
  - [~] 14.1 Update deployment compatibility and release-operation code/configuration
    - Preserve Replit install/build/start, durable-storage, and health-check compatibility instructions while recording the release-specific product-owner exception that uses Vercel launch verification; do not characterize it as permanent Replit removal.
    - Add repeatable preview/production smoke scripts that consume URLs through environment variables, write structured results, and never log credentials or share tokens.
    - _Requirements: 16.8, 16.9, 16.10, 16.13, 16.14, 16.15, 18.18_
  - [~] 14.2 Implement explicit blocker handling and release-disclosure generation
    - Assign every requirement/check one allowed status and include affected scope, reason, user impact, evidence, and next action for every incomplete/blocked/skipped/failed/externally-unverifiable item.
    - Treat unavailable credentials/infrastructure/product-owner actions as externally unverifiable, preserve conflicting user changes, distinguish baseline/post-remediation evidence, and block an undisclosed complete state.
    - _Requirements: 12.6, 16.12, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.8, 18.19_
  - [~] 14.3 Write property test for truthful complete release disclosure
    - **Property 32: Release disclosure is complete and truthful**
    - **Validates: Requirements 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.8**
  - [~] 14.4 Commit and push only the reviewed remediation changes on the existing branch
    - Reconfirm `deploy/vercel-production`, rerun status/diff/secret checks, stage only reviewed remediation paths, retain hooks, create a new non-amended commit, and push the same commit to the existing remote branch without force.
    - If branch, upstream, authentication, hooks, remote, or user-change conflicts block the operation, do not bypass them; record the blocker and required owner action.
    - _Requirements: 16.8, 16.10, 16.11, 16.12, 17.2, 17.5, 17.6_
  - [~] 14.5 Deploy the pushed release commit to Vercel preview and run critical smoke
    - Deploy/build from the recorded release commit, capture preview URL/commit/build ID/environment/timestamp, then verify health, authentication, deterministic analysis, persistence, requisition comparison, dossier, share create/access/revoke, and build metadata.
    - Record each outcome; never mark unavailable Vercel access or credentials passed.
    - _Requirements: 16.8, 16.10, 16.12, 16.13, 17.3_
  - [~] 14.6 Promote the identical release commit to Vercel production and repeat critical smoke
    - Confirm production uses the exact preview commit, capture production URL/build ID/environment/timestamp, repeat the critical workflow, verify persisted build identity from health/report surfaces, and fail the launch gate on commit/build mismatch or any undisclosed check failure.
    - _Requirements: 12.1, 12.2, 12.6, 16.9, 16.10, 16.11, 16.12, 16.13_
  - [~] 14.7 Write property test for the same-commit launch gate
    - **Property 31: Launch verification requires the same release commit**
    - **Validates: Requirements 16.8, 16.9, 16.10, 16.11, 16.12, 16.13**
  - [~] 14.8 Perform the final requirement-by-requirement self-check and publish disclosure
    - Reconcile every acceptance criterion in Requirements 1-18 to implementation files and post-remediation evidence; verify exact canonical attribution/origin reconciliation, all 32 property results, exact public-repository and synthetic matrices, migration compatibility, CI/build/browser/runtime/diff/security checks, pushed commit, and preview/production build identities.
    - Enumerate every incomplete, blocked, skipped, failed, or externally unverifiable item with impact and next action; declare completion only when no non-complete item is undisclosed.
    - _Requirements: 1.1-1.13, 2.1-2.13, 3.1-3.9, 4.1-4.20, 5.1-5.9, 6.1-6.11, 7.1-7.15, 8.1-8.11, 9.1-9.14, 10.1-10.8, 11.1-11.13, 12.1-12.7, 13.1-13.11, 14.1-14.11, 15.1-15.20, 16.1-16.15, 17.1-17.8, 18.1-18.19_

- [ ] 25. Satisfy the final release conditions and publish the honest completion report
  - [~] 25.1 Record the complete final-release evidence set
    - Require recorded passing results for non-watch lint, TypeScript type checking, the full automated suite, and a production build, and recorded passing fresh-database and existing-data migration checks on both the SQLite and PostgreSQL persistence paths; fail the conditions when a migration check detects record loss, ownership loss, Owner-Scope reassignment, or irreversible transformation of existing data.
    - Require recorded passing authorization and tenant-isolation verification across Owner Scope, the Admin Role, Impersonation Sessions, and Guest Dossier access, zero unresolved `critical` and zero unresolved `high` Defect Severity items, and every unresolved `medium` item that materially affects a Recruiter Demo Simulation step either resolved or recorded in a product-owner-approved Release Disclosure.
    - Require two consecutive passing Recruiter Demo Simulation runs covering both the Fresh Account Run and the Existing Account Run, using the persisted release-gate counter from task 24.2 rather than an inferred tally.
    - _Requirements: 29.1, 29.2, 29.3, 29.4, 29.5, 29.6, 29.7_
  - [~] 25.2 Verify deployed-commit equivalence and run the extended production smoke
    - Confirm the exact commit verified by the satisfied Release Gate is the commit committed and pushed to the existing `deploy/vercel-production` branch in task 14.4, deployed to Vercel preview in task 14.5, and promoted to Vercel production in task 14.6, with no branch switch, reset, clean, rebase, force update, or hook bypass at any point.
    - Run the extended production smoke from task 24.3 against production for health, authentication, analysis, external sharing, the Admin Console, English content, Arabic content, a desktop viewport, and a mobile viewport, and verify the non-secret Build Metadata exposes the release commit hash and build or release date.
    - Fail the Final Release Conditions and record the mismatch or divergence in the Release Disclosure when the production `commitSha` or `buildDate` is absent, when the gate commit, the deployment-reported commit, and the production `commitSha` are not all non-empty and equal, or when observed production behavior diverges from the verified behavior of the tested commit.
    - _Requirements: 29.8, 29.9, 29.10, 29.11, 29.12, 29.13, 16.8, 16.9, 16.10, 16.11, 16.12_
  - [~] 25.3 Publish the honest final report and Demo-Readiness Verdict
    - Reconcile every acceptance criterion in Requirements 1-29 to implementation files and post-remediation evidence, superseding the task 14.8 reconciliation scoped to Requirements 1-18, and include all 46 property results, the administrative, impersonation, guest, demo, and RTL suites, the migration matrix, the CI, build, browser, runtime, diff, and security checks, the pushed commit, and both deployment build identities.
    - State per-requirement status, per-check outcomes, recorded evidence, known limitations, every Blocked Live Check with the exact unavailable credential or infrastructure, and the Demo-Readiness Verdict naming remaining risks and known limitations.
    - Claim neither perfection, defect-free status, nor completeness beyond the recorded evidence, and withhold the completion claim while any Final Release Condition is unmet unless a product-owner-approved Release Disclosure records the unmet condition.
    - _Requirements: 29.14, 29.15, 29.16, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.8_

## Notes

- Every task inherits the branch/worktree guardrail in the Overview: remain on `deploy/vercel-production`, inspect target-file diffs before edits, and preserve all unrelated uncommitted changes.
- Tasks are intentionally one continuous launch path rather than sprints. Later tasks consume the persisted contracts, migrations, services, projections, and evidence produced by earlier tasks.
- Property tests are required launch-critical audit regressions, use at least 100 generated cases, and include `Feature: codeproof-audit-remediation, Property {n}: {property title}`. This applies to Properties 33-46 exactly as it applies to Properties 1-32.
- Task 12.6 is the only optional task because deterministic provider mocks fully verify required behavior and a live credential may not exist. If no key exists, record it as externally unverifiable rather than passed. Every task in groups 15-25 is required.
- Task groups 15-25 use stable identifiers that deliberately do not renumber tasks 1-14; their number is an identity, not a position. Their dependency-correct position is where they appear in this document and in the execution waves below.
- Task 24.1 is recurring by design. It is complete only when no acceptance criterion in Requirements 1-29 remains unimplemented or failing without a recorded non-complete status, and it re-executes whenever a later task discovers a defect.
- Task 14.8 remains scoped to Requirements 1-18 and Properties 1-32 as originally written. Task 25.3 supersedes it with the full Requirements 1-29 and Properties 1-46 reconciliation, so the release publishes one final report rather than two.
- No task authorizes architectural replacement, repository-source execution, destructive migration, destructive Git commands, branch switching, force push, hook bypass, or silent waiver of validation failures.
- No task authorizes weakening, deleting, skipping, disabling, or rewriting an acceptance criterion, or masking a defect through substituted fallback data, mocked success in place of a real failing behavior, a silently handled exception, or a disabled assertion. Retaining the original criterion text and recording a non-complete status is the only sanctioned path when a criterion cannot be satisfied.

## Non-normative fine-grained task index

The generated index below lists individual checklist items in dependency order for traceability only. It is not an execution schedule and does not require 144 serial handoffs; the authoritative dependency-ordered execution waves follow it. Task identifiers are stable, so groups 15-25 appear at their dependency position rather than at the end.

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["15.1"] },
    { "id": 4, "tasks": ["15.2"] },
    { "id": 5, "tasks": ["15.3"] },
    { "id": 6, "tasks": ["2.1"] },
    { "id": 7, "tasks": ["2.2"] },
    { "id": 8, "tasks": ["2.3"] },
    { "id": 9, "tasks": ["2.4"] },
    { "id": 10, "tasks": ["2.5"] },
    { "id": 11, "tasks": ["2.6"] },
    { "id": 12, "tasks": ["2.7"] },
    { "id": 13, "tasks": ["2.8"] },
    { "id": 14, "tasks": ["2.9"] },
    { "id": 15, "tasks": ["2.10"] },
    { "id": 16, "tasks": ["2.11"] },
    { "id": 17, "tasks": ["16.1"] },
    { "id": 18, "tasks": ["16.2"] },
    { "id": 19, "tasks": ["16.3"] },
    { "id": 20, "tasks": ["16.4"] },
    { "id": 21, "tasks": ["16.5"] },
    { "id": 22, "tasks": ["16.6"] },
    { "id": 23, "tasks": ["17.1"] },
    { "id": 24, "tasks": ["17.2"] },
    { "id": 25, "tasks": ["17.3"] },
    { "id": 26, "tasks": ["17.4"] },
    { "id": 27, "tasks": ["3.1"] },
    { "id": 28, "tasks": ["3.2"] },
    { "id": 29, "tasks": ["3.3"] },
    { "id": 30, "tasks": ["3.4"] },
    { "id": 31, "tasks": ["3.5"] },
    { "id": 32, "tasks": ["3.6"] },
    { "id": 33, "tasks": ["3.7"] },
    { "id": 34, "tasks": ["4.1"] },
    { "id": 35, "tasks": ["4.2"] },
    { "id": 36, "tasks": ["4.3"] },
    { "id": 37, "tasks": ["4.4"] },
    { "id": 38, "tasks": ["4.5"] },
    { "id": 39, "tasks": ["4.6"] },
    { "id": 40, "tasks": ["4.7"] },
    { "id": 41, "tasks": ["4.8"] },
    { "id": 42, "tasks": ["5.1"] },
    { "id": 43, "tasks": ["5.2"] },
    { "id": 44, "tasks": ["5.3"] },
    { "id": 45, "tasks": ["5.4"] },
    { "id": 46, "tasks": ["5.5"] },
    { "id": 47, "tasks": ["5.6"] },
    { "id": 48, "tasks": ["6.1"] },
    { "id": 49, "tasks": ["6.2"] },
    { "id": 50, "tasks": ["6.3"] },
    { "id": 51, "tasks": ["6.4"] },
    { "id": 52, "tasks": ["6.5"] },
    { "id": 53, "tasks": ["6.6"] },
    { "id": 54, "tasks": ["6.7"] },
    { "id": 55, "tasks": ["6.8"] },
    { "id": 56, "tasks": ["6.9"] },
    { "id": 57, "tasks": ["6.10"] },
    { "id": 58, "tasks": ["7.1"] },
    { "id": 59, "tasks": ["7.2"] },
    { "id": 60, "tasks": ["7.3"] },
    { "id": 61, "tasks": ["7.4"] },
    { "id": 62, "tasks": ["7.5"] },
    { "id": 63, "tasks": ["7.6"] },
    { "id": 64, "tasks": ["8.1"] },
    { "id": 65, "tasks": ["8.2"] },
    { "id": 66, "tasks": ["8.3"] },
    { "id": 67, "tasks": ["8.4"] },
    { "id": 68, "tasks": ["8.5"] },
    { "id": 69, "tasks": ["18.1"] },
    { "id": 70, "tasks": ["18.2"] },
    { "id": 71, "tasks": ["18.3"] },
    { "id": 72, "tasks": ["18.4"] },
    { "id": 73, "tasks": ["18.5"] },
    { "id": 74, "tasks": ["18.6"] },
    { "id": 75, "tasks": ["18.7"] },
    { "id": 76, "tasks": ["18.8"] },
    { "id": 77, "tasks": ["19.1"] },
    { "id": 78, "tasks": ["19.2"] },
    { "id": 79, "tasks": ["19.3"] },
    { "id": 80, "tasks": ["9.1"] },
    { "id": 81, "tasks": ["9.2"] },
    { "id": 82, "tasks": ["9.3"] },
    { "id": 83, "tasks": ["9.4"] },
    { "id": 84, "tasks": ["9.5"] },
    { "id": 85, "tasks": ["9.6"] },
    { "id": 86, "tasks": ["20.1"] },
    { "id": 87, "tasks": ["20.2"] },
    { "id": 88, "tasks": ["20.3"] },
    { "id": 89, "tasks": ["20.4"] },
    { "id": 90, "tasks": ["20.5"] },
    { "id": 91, "tasks": ["20.6"] },
    { "id": 92, "tasks": ["20.7"] },
    { "id": 93, "tasks": ["20.8"] },
    { "id": 94, "tasks": ["21.1"] },
    { "id": 95, "tasks": ["21.2"] },
    { "id": 96, "tasks": ["21.3"] },
    { "id": 97, "tasks": ["21.4"] },
    { "id": 98, "tasks": ["21.5"] },
    { "id": 99, "tasks": ["10.1"] },
    { "id": 100, "tasks": ["10.2"] },
    { "id": 101, "tasks": ["10.3"] },
    { "id": 102, "tasks": ["10.4"] },
    { "id": 103, "tasks": ["11.1"] },
    { "id": 104, "tasks": ["11.2"] },
    { "id": 105, "tasks": ["11.3"] },
    { "id": 106, "tasks": ["11.4"] },
    { "id": 107, "tasks": ["11.5"] },
    { "id": 108, "tasks": ["11.6"] },
    { "id": 109, "tasks": ["11.7"] },
    { "id": 110, "tasks": ["22.1"] },
    { "id": 111, "tasks": ["22.2"] },
    { "id": 112, "tasks": ["22.3"] },
    { "id": 113, "tasks": ["12.1"] },
    { "id": 114, "tasks": ["12.2"] },
    { "id": 115, "tasks": ["12.3"] },
    { "id": 116, "tasks": ["12.4"] },
    { "id": 117, "tasks": ["12.5"] },
    { "id": 118, "tasks": ["12.6"] },
    { "id": 119, "tasks": ["23.1"] },
    { "id": 120, "tasks": ["23.2"] },
    { "id": 121, "tasks": ["23.3"] },
    { "id": 122, "tasks": ["23.4"] },
    { "id": 123, "tasks": ["13.1"] },
    { "id": 124, "tasks": ["13.2"] },
    { "id": 125, "tasks": ["13.3"] },
    { "id": 126, "tasks": ["13.4"] },
    { "id": 127, "tasks": ["13.5"] },
    { "id": 128, "tasks": ["24.1"] },
    { "id": 129, "tasks": ["24.2"] },
    { "id": 130, "tasks": ["24.3"] },
    { "id": 131, "tasks": ["24.4"] },
    { "id": 132, "tasks": ["24.5"] },
    { "id": 133, "tasks": ["14.1"] },
    { "id": 134, "tasks": ["14.2"] },
    { "id": 135, "tasks": ["14.3"] },
    { "id": 136, "tasks": ["14.4"] },
    { "id": 137, "tasks": ["14.5"] },
    { "id": 138, "tasks": ["14.6"] },
    { "id": 139, "tasks": ["14.7"] },
    { "id": 140, "tasks": ["14.8"] },
    { "id": 141, "tasks": ["25.1"] },
    { "id": 142, "tasks": ["25.2"] },
    { "id": 143, "tasks": ["25.3"] }
  ]
}
```

## Authoritative dependency-ordered execution waves

These waves keep ownership coarse enough for execution while permitting independent work in parallel. A wave completes only after its checkpoint evidence passes or the exact blocker is disclosed.

1. **Baseline and harness:** tasks 1.1-1.3, then tasks 15.1-15.3 so the verification loop, defect ledger, criterion-integrity baselines, and anti-masking scanners exist before any implementation cycle runs.
2. **Canonical foundation:** tasks 2.1-2.6; SQLite and PostgreSQL migrations may proceed in parallel after contracts and invariants stabilize.
3. **Administrative persistence and authorization:** tasks 16.1-16.4 after the migration paths exist, then tasks 17.1-17.3. Tasks 16.5-16.6 and 17.4 verify them and may run in parallel with each other.
4. **Foundation verification:** tasks 2.7-2.11, then tasks 3.1-6.10 grouped by domain; independent attribution, citation, metrics, and AI/pilot work may proceed in parallel against the same contracts. Complete Checkpoint A.
5. **Workflow features:** tasks 7.1-8.5, then tasks 18.1-18.5 on top of the share lifecycle and pilot entitlements, then tasks 19.1-19.2 once telemetry, usage, reservation, share, and analysis writes exist. Tasks 18.6-18.8 and 19.3 verify them.
6. **Presentation and administrative surfaces:** tasks 9.1-9.6, then tasks 20.1-20.6 and 21.1-21.3; the console and impersonation surfaces reuse the localization, RTL, robust-state, and accessibility primitives from group 9 and extend its route inventory. Tasks 20.7-20.8 and 21.4-21.5 verify them. Tasks 10.1-10.4 are independent and may run in parallel.
7. **Integrated regression:** tasks 11.1-11.7, then tasks 22.1-22.3, then Checkpoint B.
8. **Tracked browser coverage:** tasks 12.1-12.5, then tasks 23.1-23.4; task 12.6 remains optional and externally unverifiable without an existing provider key, and any unavailable simulation dependency is recorded as a Blocked Live Check.
9. **Local launch gate:** tasks 13.1-13.5, then tasks 24.1-24.5, then Checkpoint C. Task 24.1 recurs until no criterion is unimplemented or failing without a recorded non-complete status, and task 24.2 must record two consecutive defect-free passes. Validation commands may run in parallel only when they do not contend for the same database, build directory, port, or fixture state.
10. **Release integration:** tasks 14.1-14.3, then 14.4 only after local gates pass; task 14.5 must finish before 14.6; tasks 14.7-14.8 consume both deployment records.
11. **Final release conditions:** tasks 25.1-25.3 last, consuming the gate counter, the two passing demo simulation runs, both deployment records, and the production build metadata, and publishing the single final report and Demo-Readiness Verdict.

No wave authorizes application work beyond its listed tasks, and no downstream success may erase an upstream incomplete, failed, blocked, skipped, or externally unverifiable result. A defect discovered in any wave reopens task 24.1 and resets the task 24.2 pass counter to the first pass.
