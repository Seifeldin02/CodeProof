# Requirements Document

## Introduction

CodeProof Audit Remediation strengthens the existing evidence-based developer hiring workflow without replacing the established Next.js architecture, deterministic bounded repository analysis, owner-scoped authentication, or SQLite/PostgreSQL persistence model. The release adds verifiable contribution attribution, a canonical evidence taxonomy, richer citations, requisition-bound review ordering, provider-neutral AI controls and cost telemetry, secure external reports, pricing-ready pilot controls, bilingual recruiter presentation, public methodology, release traceability, and comprehensive verification. The release additionally adds a server-enforced internal owner administration console with audited account, plan, credit, demo, and impersonation controls; entitlement-gated external sharing that limits a guest to one reduced read-only dossier; and continuous verification with explicit completion gates covering an end-to-end recruiter demo simulation and production confirmation. Repository source remains untrusted text input and is never executed. This release uses Vercel preview and production verification as the launch gate while retaining documented Replit compatibility under an explicit product-owner exception.

## Glossary

- **CodeProof Platform**: The complete evidence-based developer hiring product, including recruiter interfaces, application programming interfaces, analysis services, and persistence services.
- **CV**: Candidate-provided curriculum vitae text or a text-based Portable Document Format file.
- **AI**: Optional artificial-intelligence processing used only to augment deterministic output.
- **API**: An application programming interface exposed or consumed by the CodeProof Platform.
- **PII**: Personally identifiable information associated with a Candidate, Recruiter, or account.
- **LTR**: Left-to-right document or content direction.
- **RTL**: Right-to-left document or content direction.
- **Dual Database Persistence**: The existing SQLite local persistence path and PostgreSQL durable persistence path supported by one product data model.
- **Established Architecture**: The existing Next.js application, bounded ingestion services, deterministic analysis services, owner-scoped signed-cookie authentication, and dual SQLite/PostgreSQL persistence paths.
- **Primary Workflow**: Sign-up or sign-in, CV ingestion, Repository discovery or manual selection, bounded deterministic analysis, Recruiter Report review, Candidate persistence, Requisition creation, requisition-bound comparison, Review-First Order review, external sharing, and Hiring Insights access.
- **Allowed Repository URL**: A public URL matching the `https://github.com/{owner}/{repository}` form.
- **Supported Legacy Schema**: A SQLite or PostgreSQL schema produced by the pre-remediation repository through commit `0757554`.
- **WCAG 2.2 Level AA**: The Level A and Level AA success criteria in Web Content Accessibility Guidelines version 2.2.
- **Vercel**: The launch hosting environment used for preview and production verification in the Remediation Release.
- **Replit**: The compatible hosting environment retained in documentation but exempted from live launch verification for the Remediation Release.
- **Hiring Insights**: The existing Recruiter-facing view of account-derived candidate pipeline and hiring metrics.
- **Remediation Release**: The audit-remediation changes governed by this requirements document.
- **Recruiter**: An authenticated account owner who creates requisitions, candidates, analyses, comparisons, and shares.
- **Candidate**: A person whose CV and selected public repositories are reviewed by a Recruiter.
- **Owner Scope**: The authorization boundary that limits private records and actions to the Recruiter who owns the records.
- **Repository**: A public Git source project selected for bounded text analysis.
- **Repository Corpus**: The bounded set of eligible text files accepted for static analysis after archive safety and exclusion rules are applied.
- **Deterministic Analysis Engine**: The existing bounded static-analysis path that derives repeatable evidence without a paid provider and without executing Repository source.
- **Authenticated Git Provider**: An optional Git-host integration that authenticates a provider account and returns provider-verifiable repository contribution data.
- **Contribution Verification Service**: The CodeProof component that records contribution identity, attribution status, and verification provenance.
- **Attribution Status**: Exactly one candidate-to-evidence relationship value: `unverified`, `candidate_claimed`, `verified_owner`, or `verified_contributor`.
- **Discovery Origin**: Exactly one source by which a Repository entered a Candidate review: `CV`, `portfolio`, `GitHub profile`, or `manual entry`.
- **Verified Contribution**: Contribution data tied by the Authenticated Git Provider to the authenticated provider identity, Repository identity, and immutable revision identifier.
- **Unverified Evidence**: Repository evidence for which Attribution Status is `unverified`, `candidate_claimed`, or `verified_owner`; it is not eligible for Candidate Conclusions.
- **Candidate Conclusion**: A Candidate-level skill statement, evidence level, requisition match, comparison factor, recommendation, or review-order factor.
- **Canonical Evidence Taxonomy**: The versioned CodeProof vocabulary and rules shared by analysis, storage, APIs, recruiter interfaces, external reports, and documentation.
- **Evidence Level**: Exactly one ordered classification: `strong`, `good`, `partial`, `limited`, or `insufficient`.
- **Contradiction Invariant**: A rule that prevents mutually incompatible evidence facts or classifications from coexisting in one analysis version.
- **Evidence Citation**: A source reference containing Repository identity, Repository URL, revision identifier when available, file path, line span when available, bounded excerpt, discovery origin, Attribution Status, and Evidence Level.
- **Context-Safe Interview Question**: A question grounded in visible evidence or an explicit evidence gap that avoids undisclosed personal data, secrets, protected-trait inferences, and unverified authorship statements.
- **Provider-Neutral AI Layer**: An optional server-side interface that can use any configured AI provider while preserving a schema-validated response contract and deterministic fallback.
- **Hybrid Analysis**: An analysis that starts with Deterministic Analysis Engine output and optionally adds schema-valid Provider-Neutral AI Layer output.
- **AI Request Schema**: The versioned structured input and output contract for an AI operation.
- **Pricing Metadata Registry**: Versioned per-provider and per-model pricing data with currency, billable units, effective date, and an official provider source URL.
- **AI Budget**: A configured per-request or per-Owner-Scope monetary or token limit for optional AI usage.
- **Estimated Cost**: The pre-request monetary projection calculated from expected billable usage and the Pricing Metadata Registry.
- **Actual Cost**: The post-request monetary value calculated from provider-reported usage and the Pricing Metadata Registry.
- **AI Telemetry Record**: A record of AI operation identity, provider, model, status, latency, cache result, retries, token or billable usage, Estimated Cost, Actual Cost, currency, pricing version, and fallback reason.
- **Analysis Cache**: Reusable analysis output keyed by normalized non-secret inputs and all behavior-affecting versions.
- **Repository Metric**: A measured count, byte total, language quantity, or evidence quantity derived from an explicitly named Repository Corpus stage.
- **Requisition**: A Recruiter-owned role definition containing role requirements and evaluation criteria.
- **Requisition Version**: An immutable snapshot of a Requisition used for a comparison or review order.
- **Review-First Order**: A draft, explainable ordering of Candidates for Recruiter review that does not reject or advance a Candidate automatically.
- **Evidence-Checked Mark**: A Recruiter acknowledgement that cited evidence for a specific Candidate analysis version was reviewed.
- **External Share Service**: The component that creates and validates read-only external report access.
- **External Share Token**: A cryptographically random bearer credential with at least 128 bits of entropy that grants access to one External Report until expiry or revocation.
- **External Report**: A reduced, read-only, PII-safe Candidate report available through a valid External Share Token without Recruiter authentication.
- **PII-Safe**: Limited to a Recruiter-selected Candidate display label and job-relevant evidence while excluding contact details, addresses, account identifiers, authentication data, internal notes, protected-trait data, and private workflow metadata.
- **Recruiter Report**: The authenticated report containing a decision-oriented summary and expandable technical evidence.
- **Robust State**: A loading, empty, partial-data, success, validation-error, provider-fallback, permission-denied, expired-share, revoked-share, quota-exhausted, or unexpected-error presentation.
- **Technical Token**: A source path, Repository name, URL, code fragment, command, revision, technology name, or identifier that remains left-to-right in both languages.
- **Pilot Tier**: A configurable product tier that grants named Entitlements and Quotas without processing payment.
- **Entitlement**: Permission for an Owner Scope to use a named product capability.
- **Quota**: A measurable Owner-Scope usage limit for a named capability and usage period.
- **Pilot Access Service**: The boundary that evaluates Pilot Tier Entitlements and Quotas before a metered operation.
- **Build Metadata**: Commit hash, build identifier, deployment environment, and release timestamp associated with a running CodeProof deployment.
- **Analysis Metadata**: Deterministic engine version, Canonical Evidence Taxonomy version, Requisition Version, AI Request Schema version, provider and model identifiers, prompt version, and pricing version associated with an analysis.
- **Inline Schema Upgrade**: An additive, idempotent schema change applied by the existing application persistence initialization path.
- **Legacy Record**: A record created before the Remediation Release and missing one or more new fields.
- **Synthetic Fixture**: A generated, non-production CV, Repository Corpus, contribution history, Requisition, Candidate, or share record used for repeatable testing.
- **Tracked E2E Suite**: Automated end-to-end tests committed to the Repository and executed in a non-watch mode.
- **Browser Matrix**: Desktop English left-to-right, desktop Arabic right-to-left, mobile English left-to-right, and mobile Arabic right-to-left.
- **Vercel Launch Verification**: Recorded full-flow verification against both a Vercel preview deployment and the Vercel production deployment for the same release commit.
- **Replit Compatibility Path**: Documented Replit install, build, start, durable-storage, and health-check instructions retained for future use.
- **Product-Owner Exception**: The approved release-specific replacement of live Replit deployment verification with Vercel Launch Verification.
- **Release Disclosure**: A release record that identifies every incomplete, blocked, skipped, failed, or externally unverifiable requirement and validation check.
- **Admin Role**: The server-persisted account role value `ADMIN` that authorizes internal owner administration of the CodeProof Platform.
- **Admin Actor**: An authenticated account that holds the Admin Role.
- **Admin Console**: The internal `/admin` administration interface together with its supporting administrative APIs.
- **Admin Bootstrap Variable**: The server-side environment variable, such as `ADMIN_EMAIL`, that designates which existing account receives the Admin Role during application initialization.
- **Administrative Audit Log**: An append-only immutable record of administrative actions, impersonation events, and administrative authorization denials.
- **Account Lifecycle State**: Exactly one account state value: `active`, `suspended`, or `soft_deleted`.
- **Demo Account**: A labeled non-customer account populated with Synthetic Fixtures for demonstration and training use.
- **Demo Activity**: Analyses, AI requests, usage records, shares, and telemetry produced by a Demo Account.
- **Real Commercial Aggregate**: A billing total, cost total, revenue figure, customer count, conversion metric, retention metric, or customer usage analytic presented as real business data.
- **Credit Balance**: The remaining Owner-Scope allowance for a metered capability within the applicable usage period.
- **Impersonation Session**: A time-limited audited session in which an Admin Actor views the CodeProof Platform in the context of a target account without receiving that account's credentials.
- **Impersonation Banner**: The persistent visible indicator displayed on every route while an Impersonation Session is active.
- **Return To Admin Control**: The control inside the Impersonation Banner that ends an Impersonation Session and restores the Admin Actor session.
- **Dangerous Impersonated Action**: A password change, email or authentication-method change, billing or payment change, plan purchase, account ownership transfer, account deletion, Admin Role change, provider-credential change, or secret disclosure.
- **Guest Reviewer**: An unauthenticated external person who opens an External Share link.
- **Guest Dossier**: The single restricted read-only External Report presented to a Guest Reviewer for exactly one Candidate report.
- **Sharing Entitlement**: The named Entitlement that authorizes an Owner Scope to generate, manage, revoke, and regenerate External Shares.
- **Share Expiry Option**: Exactly one selectable external-share lifetime value: 24 hours, 7 days, or 30 days.
- **Share Passcode**: An optional Recruiter-set secret required in addition to a valid External Share Token before Guest Dossier access.
- **Guest Email Verification**: An optional one-time verification code delivered to a Recruiter-specified email address and required before Guest Dossier access.
- **Share Access Log**: The record of External Share access attempts, outcomes, and applied access controls within Owner Scope.
- **Enterprise Sharing Extension Point**: A documented, Entitlement-gated seam that a future paid enterprise plan can enable for authenticated organization access, company-domain restriction, single sign-on, permanent internal sharing, or detailed per-viewer share audit.
- **Verification Loop**: The autonomous cycle of implementation, automated testing, browser inspection, defect correction, and regression re-runs applied until the Release Gate is satisfied.
- **Defect Masking**: Concealing a defect through substituted fallback data, mocked success in place of real behavior, silently handled exceptions, or disabled and skipped assertions.
- **Release Gate**: The complete recorded set of lint, typecheck, build, automated suite, migration, browser, security, Recruiter Demo Simulation, and deployment checks required before a completion claim.
- **Recruiter Demo Simulation**: The required end-to-end simulated recruiter session executed across the Browser Matrix on both a Fresh Account Run and an Existing Account Run.
- **Fresh Account Run**: A Recruiter Demo Simulation execution that begins with a newly registered account holding no prior records.
- **Existing Account Run**: A Recruiter Demo Simulation execution that begins with an account holding pre-existing candidates, requisitions, analyses, and shares.
- **Live Provider Check**: A verification step that requires real external provider credentials or real external infrastructure.
- **Blocked Live Check**: A Live Provider Check that could not execute because required credentials or infrastructure were unavailable.
- **Defect Severity**: Exactly one severity value: `critical`, `high`, `medium`, or `low`.
- **Unexpected Runtime Error**: An unhandled browser-console error, unhandled promise rejection, or server runtime exception that the applicable Robust State does not intentionally produce.
- **Final Release Conditions**: The complete set of conditions in Requirement 29 that must hold before the Remediation Release is declared complete.
- **Demo-Readiness Verdict**: The explicit final statement of whether the Remediation Release is ready for a recruiter demonstration, including remaining risks and known limitations.

## Requirements

### Requirement 1: Contribution attribution and discovery provenance

**User Story:** As a recruiter, I want repository evidence to distinguish verified contribution from unverified association, so that candidate-level claims remain defensible.

#### Acceptance Criteria

1. WHEN a Repository is added to a Candidate review, THE Contribution Verification Service SHALL record exactly one Discovery Origin from `CV`, `portfolio`, `GitHub profile`, or `manual entry`.
2. WHEN repository evidence is persisted, THE Contribution Verification Service SHALL record exactly one Attribution Status from `unverified`, `candidate_claimed`, `verified_owner`, or `verified_contributor` for the Candidate-to-evidence relationship.
3. WHEN a Repository is entered manually, THE Contribution Verification Service SHALL initially assign `manual entry` and `unverified`.
4. WHEN candidate-supplied CV or portfolio material explicitly claims a Repository relationship, THE Contribution Verification Service MAY assign `candidate_claimed` while preserving the applicable Discovery Origin, but SHALL NOT treat the claim as verified authorship.
5. WHERE the Authenticated Git Provider is configured, THE Contribution Verification Service SHALL offer an authenticated verification path before assigning `verified_owner` or `verified_contributor`.
6. WHEN the Authenticated Git Provider confirms an authenticated provider identity and Repository ownership or control but not immutable contribution proof, THE Contribution Verification Service SHALL assign `verified_owner`.
7. WHEN the Authenticated Git Provider confirms an authenticated provider identity, Repository identity, and immutable contribution revision, THE Contribution Verification Service SHALL assign `verified_contributor` to the confirmed contribution evidence.
8. IF provider confirmation lacks authenticated identity, Repository identity, or the proof required for the requested elevation, THEN THE Contribution Verification Service SHALL retain or assign the safest applicable non-elevated status.
9. IF evidence has any Attribution Status other than `verified_contributor`, THEN THE CodeProof Platform SHALL exclude the evidence from Candidate Conclusions, role matching, saved-comparison factors, and Review-First Order factors.
10. WHEN evidence with any Attribution Status other than `verified_contributor` is displayed, THE Recruiter Report SHALL label the exact Attribution Status and Discovery Origin adjacent to the evidence.
11. WHEN non-`verified_contributor` evidence suggests a relevant ownership uncertainty, THE CodeProof Platform SHALL permit the evidence to support a Context-Safe Interview Question without converting the evidence into a Candidate Conclusion.
12. IF contribution verification becomes stale because the Repository identity, revision, or linked provider identity changes, THEN THE Contribution Verification Service SHALL replace the active status with `unverified` pending new verification while preserving audit history.
13. WHEN an Authenticated Git Provider credential is received, THE CodeProof Platform SHALL keep the credential server-side and exclude the credential from persistence, client responses, telemetry, cache material, serialized errors, and logs.

### Requirement 2: Canonical evidence taxonomy and consistency

**User Story:** As a recruiter, I want one evidence vocabulary across every surface, so that CodeProof never presents contradictory interpretations.

#### Acceptance Criteria

1. THE CodeProof Platform SHALL use the Canonical Evidence Taxonomy for analysis, persistence, APIs, Recruiter Reports, External Reports, comparisons, and public methodology.
2. WHEN an evidence item is classified, THE Deterministic Analysis Engine SHALL assign exactly one Evidence Level.
3. IF an evidence item contains only dependency, manifest, configuration, documentation, generated-output, or trivial-usage signals, THEN THE Deterministic Analysis Engine SHALL limit the Evidence Level to `limited` or `insufficient`.
4. WHEN `strong` is assigned, THE Deterministic Analysis Engine SHALL require meaningful implementation across at least three files and multiple implementation areas plus tests or multiple architectural boundaries.
5. WHEN `good` is assigned, THE Deterministic Analysis Engine SHALL require at least two meaningful implementation files or repeated non-trivial use across modules.
6. WHEN `partial` is assigned, THE Deterministic Analysis Engine SHALL require one meaningful implementation example or narrow test-backed use.
7. WHEN `limited` is assigned, THE Deterministic Analysis Engine SHALL identify the evidence as non-conclusive support.
8. WHEN `insufficient` is assigned, THE Deterministic Analysis Engine SHALL represent the result as an evidence gap rather than a Candidate deficiency.
9. WHEN the same evidence fact appears on multiple CodeProof surfaces, THE CodeProof Platform SHALL present the same Attribution Status, Discovery Origin, Evidence Level, and taxonomy version.
10. IF a Candidate Conclusion has no eligible Verified Contribution citation, THEN THE CodeProof Platform SHALL classify the Candidate Conclusion as unsupported and exclude the Candidate Conclusion from role matching and Review-First Order factors.
11. IF one analysis version contains both an evidence-gap assertion and an eligible supporting citation for the same claim scope, THEN THE CodeProof Platform SHALL reject the contradictory result before persistence.
12. IF one analysis version assigns multiple Evidence Levels to the same canonical evidence item, THEN THE CodeProof Platform SHALL reject the contradictory result before persistence.
13. WHEN the Canonical Evidence Taxonomy changes, THE CodeProof Platform SHALL assign a new taxonomy version without silently reinterpreting completed analysis versions.

### Requirement 3: Rich citations and interview-question safety

**User Story:** As a recruiter, I want inspectable citations and safe interview prompts, so that I can validate technical claims without exposing inappropriate context.

#### Acceptance Criteria

1. WHEN a Candidate Conclusion is produced, THE CodeProof Platform SHALL attach at least one eligible Evidence Citation.
2. WHEN an Evidence Citation is displayed, THE Recruiter Report SHALL expose Repository identity, file path, Evidence Level, Attribution Status, and Discovery Origin.
3. WHERE revision and line-span data are available, THE Evidence Citation SHALL expose the immutable revision identifier and line span.
4. WHEN an Evidence Citation includes an excerpt, THE CodeProof Platform SHALL bound the excerpt to the cited evidence context and preserve the source text without generated claims.
5. WHEN a Context-Safe Interview Question is generated from evidence, THE CodeProof Platform SHALL link the question to the supporting Evidence Citation.
6. WHEN a Context-Safe Interview Question is generated from an evidence gap, THE CodeProof Platform SHALL label the question as gap-based and identify the missing evidence category.
7. IF a question would state unverified authorship as fact, THEN THE CodeProof Platform SHALL rewrite the question as an ownership-verification question.
8. IF a citation or question contains a detected secret, contact detail, authentication value, or protected-trait inference, THEN THE CodeProof Platform SHALL redact the unsafe value before presentation or sharing.
9. WHEN an External Report presents a citation, THE External Report SHALL omit bounded excerpts that contain personal data or secret-like values.

### Requirement 4: Provider-neutral hybrid AI and cost governance

**User Story:** As a product operator, I want optional AI to be bounded, measurable, and replaceable, so that provider failures or costs cannot break the core workflow.

#### Acceptance Criteria

1. THE Provider-Neutral AI Layer SHALL accept provider implementations through one versioned AI Request Schema contract.
2. WHEN Hybrid Analysis runs, THE CodeProof Platform SHALL complete Deterministic Analysis Engine output before optional AI output is accepted.
3. WHEN an AI provider returns output, THE Provider-Neutral AI Layer SHALL validate the output against the applicable AI Request Schema before using the output.
4. IF AI output fails schema validation, THEN THE Provider-Neutral AI Layer SHALL discard the AI output and return deterministic fallback output.
5. IF no AI provider is configured, THEN THE CodeProof Platform SHALL complete the core recruiter workflow with deterministic fallback output.
6. IF an AI Budget would be exceeded by Estimated Cost, THEN THE Provider-Neutral AI Layer SHALL skip the provider request and return deterministic fallback output.
7. WHEN an AI request starts, THE Provider-Neutral AI Layer SHALL enforce a configurable timeout no greater than 60 seconds.
8. IF an AI request fails with a transient provider error, THEN THE Provider-Neutral AI Layer SHALL perform no more than two retry attempts.
9. IF an AI request fails with a non-transient error, THEN THE Provider-Neutral AI Layer SHALL return deterministic fallback output without retrying the request.
10. WHEN an AI request is eligible for reuse, THE Analysis Cache SHALL key the result by normalized analysis inputs, provider, model, prompt version, AI Request Schema version, Canonical Evidence Taxonomy version, and pricing version.
11. WHEN a cache key matches an unexpired valid result, THE Provider-Neutral AI Layer SHALL return the cached result without incurring a new provider request.
12. WHEN a provider and model are enabled, THE Pricing Metadata Registry SHALL contain currency, billable units, unit prices, effective date, and an official provider pricing source URL.
13. IF current Pricing Metadata Registry data is missing for an enabled provider model, THEN THE Provider-Neutral AI Layer SHALL disable paid requests for the provider model and return deterministic fallback output.
14. WHEN a provider request is ready to be sent, THE Provider-Neutral AI Layer SHALL calculate Estimated Cost from expected usage and versioned pricing metadata.
15. WHEN provider-reported usage is available, THE Provider-Neutral AI Layer SHALL calculate Actual Cost from provider-reported usage and the pricing version used by the request.
16. WHEN an AI operation completes, skips, falls back, or fails, THE CodeProof Platform SHALL persist an AI Telemetry Record within Owner Scope.
17. IF provider-reported usage is unavailable, THEN THE AI Telemetry Record SHALL label Actual Cost as unavailable rather than zero.
18. WHEN provider input is assembled, THE Provider-Neutral AI Layer SHALL delimit untrusted CV and Repository Corpus text from system instructions.
19. IF provider output introduces a claim without an eligible Evidence Citation, THEN THE CodeProof Platform SHALL exclude the claim from Candidate Conclusions.
20. WHEN Owner-Scope AI usage reaches an AI Budget, THE Pilot Access Service SHALL block additional paid AI requests for the applicable usage period and preserve deterministic fallback access.

### Requirement 5: Accurate and transparent metrics

**User Story:** As a recruiter, I want repository and candidate metrics to state exactly what was measured, so that I do not mistake partial analysis for repository-wide facts.

#### Acceptance Criteria

1. WHEN repository ingestion completes, THE CodeProof Platform SHALL record separate counts for raw archive entries, eligible text files, selected files, and analyzed files.
2. WHEN repository ingestion completes, THE CodeProof Platform SHALL record separate byte totals for downloaded archive content, eligible text content, selected text content, and analyzed text content.
3. WHEN a language metric is displayed, THE CodeProof Platform SHALL identify the Repository Corpus stage and denominator used by the metric.
4. WHEN an evidence metric is displayed, THE CodeProof Platform SHALL identify the Evidence Level weighting and eligible evidence population used by the metric.
5. IF archive metadata does not contain a repository-wide fact, THEN THE CodeProof Platform SHALL omit the fact rather than infer the fact from selected files.
6. IF stars, issue counts, pull-request counts, contributor counts, or profile repository listings are unavailable, THEN THE CodeProof Platform SHALL label the corresponding metric as unavailable rather than zero.
7. WHEN a percentage or ratio is displayed, THE CodeProof Platform SHALL display the numerator, denominator, and rounding rule.
8. WHEN Repository Metrics are persisted, THE CodeProof Platform SHALL associate the metrics with the Repository identity, analyzed revision when available, analysis timestamp, and Analysis Metadata.
9. IF a bounded analysis excludes files, THEN THE Recruiter Report SHALL disclose the applicable file and byte limits adjacent to Repository Metrics.

### Requirement 6: Requisition-bound comparison and review order

**User Story:** As a recruiter, I want candidates compared only against the selected role through an explainable draft order, so that review remains relevant and human-controlled.

#### Acceptance Criteria

1. WHEN a Candidate comparison starts, THE CodeProof Platform SHALL require one Recruiter-owned Requisition Version.
2. WHEN a Candidate comparison is persisted, THE CodeProof Platform SHALL bind the comparison to the selected Requisition Version.
3. IF a Candidate lacks evidence for a Requisition criterion, THEN THE CodeProof Platform SHALL represent the criterion as unknown or an evidence gap without applying a negative penalty.
4. WHEN a Review-First Order is generated, THE CodeProof Platform SHALL use only eligible Verified Contribution evidence mapped to the selected Requisition Version.
5. WHEN a Review-First Order is displayed, THE CodeProof Platform SHALL label the order as a draft for Recruiter review.
6. WHEN a Candidate appears in a Review-First Order, THE CodeProof Platform SHALL display the requisition criteria, evidence factors, uncertainty factors, and Evidence Citations that explain the position.
7. IF Review-First Order factors are equal, THEN THE CodeProof Platform SHALL apply a documented stable tie-break rule unrelated to protected traits.
8. THE CodeProof Platform SHALL require a Recruiter action before a Review-First Order changes a Candidate workflow state.
9. WHEN a Recruiter records an Evidence-Checked Mark, THE CodeProof Platform SHALL bind the mark to the Candidate analysis version and Requisition Version.
10. WHEN new repository evidence changes a Candidate analysis version, THE CodeProof Platform SHALL clear the prior Evidence-Checked Mark.
11. IF a Requisition belongs to a different Owner Scope, THEN THE CodeProof Platform SHALL deny comparison access without disclosing Requisition content.

### Requirement 7: Secure external sharing

**User Story:** As a recruiter, I want to share a reduced report through a controlled external link, so that reviewers can inspect evidence without entering the private workspace.

#### Acceptance Criteria

1. WHEN a Recruiter creates an external share, THE External Share Service SHALL require Owner-Scope authorization for the source Candidate report.
2. WHEN an external share is created, THE External Share Service SHALL generate an External Share Token with at least 128 bits of cryptographic entropy.
3. WHEN an external share is created, THE External Share Service SHALL require an expiration timestamp.
4. WHEN an external share is created, THE External Share Service SHALL store a non-reversible token digest instead of the plaintext External Share Token.
5. WHEN a valid External Share Token is presented before expiration, THE External Share Service SHALL return only the associated External Report.
6. IF an External Share Token is invalid, expired, or revoked, THEN THE External Share Service SHALL return a non-disclosing unavailable response.
7. WHEN a Recruiter revokes an external share, THE External Share Service SHALL invalidate subsequent access to the associated External Report.
8. WHEN an External Report is rendered, THE External Share Service SHALL enforce read-only behavior without private Candidate, Requisition, note, account, or mutation APIs.
9. WHEN an External Report is rendered, THE CodeProof Platform SHALL include `noindex` and `nofollow` directives plus a `noindex` search-engine response header.
10. WHEN an External Report is rendered, THE CodeProof Platform SHALL apply a no-referrer policy and exclude the External Share Token from analytics and application logs.
11. WHEN an External Report is assembled, THE CodeProof Platform SHALL apply the PII-Safe field allowlist.
12. IF an unauthenticated request lacks a valid External Share Token, THEN THE CodeProof Platform SHALL deny External Report access.
13. IF a Recruiter from another Owner Scope requests share management, THEN THE External Share Service SHALL deny the request without disclosing share existence.
14. WHEN repeated invalid share requests exceed the configured security threshold, THE External Share Service SHALL rate-limit further validation attempts.
15. WHEN an External Report exposes an Evidence Citation, THE External Report SHALL preserve evidence provenance while excluding internal workflow metadata.

### Requirement 8: Recruiter-oriented report presentation and robust states

**User Story:** As a recruiter, I want a concise decision summary with optional technical depth, so that I can triage candidates and inspect evidence when needed.

#### Acceptance Criteria

1. WHEN a Recruiter Report loads successfully, THE Recruiter Report SHALL present a recruiter summary before technical evidence sections.
2. WHEN a recruiter summary is displayed, THE Recruiter Report SHALL identify role relevance, strongest eligible evidence, material evidence gaps, attribution coverage, uncertainty, and the next Recruiter action.
3. WHEN technical evidence is available, THE Recruiter Report SHALL place file-level details in keyboard-operable expandable sections.
4. WHEN an expandable technical section changes state, THE Recruiter Report SHALL expose the expanded state to assistive technology.
5. WHILE an analysis or report request is pending, THE CodeProof Platform SHALL present a translated loading state that identifies the pending operation.
6. IF no Candidates, Requisitions, eligible evidence, comparisons, shares, or telemetry records exist for a view, THEN THE CodeProof Platform SHALL present a translated empty state with a valid next action.
7. IF only deterministic fallback output is available, THEN THE Recruiter Report SHALL present the deterministic result and the provider-fallback reason.
8. IF partial repository data is available, THEN THE Recruiter Report SHALL display available evidence plus the specific unavailable data categories.
9. IF validation, permission, quota, share, or unexpected errors occur, THEN THE CodeProof Platform SHALL present the corresponding Robust State without exposing secrets or stack traces.
10. WHEN a Robust State permits recovery, THE CodeProof Platform SHALL provide a keyboard-operable recovery action.
11. WHEN synthetic or demonstration content is displayed, THE CodeProof Platform SHALL label the content as non-production data adjacent to the content.

### Requirement 9: English, Arabic, RTL, responsiveness, and accessibility

**User Story:** As an English-speaking or Arabic-speaking recruiter, I want the complete workflow to remain usable across devices and assistive technologies, so that language or access needs do not block evaluation.

#### Acceptance Criteria

1. THE CodeProof Platform SHALL provide English and Arabic translations for every recruiter-facing route, External Report, Robust State, control, tooltip, chart label, table label, validation message, explanatory message, and export view introduced or changed by the Remediation Release.
2. WHEN a Recruiter selects a language, THE CodeProof Platform SHALL persist the language preference across authenticated sessions.
3. WHEN Arabic is active, THE CodeProof Platform SHALL set the root document language to Arabic and direction to right-to-left.
4. WHEN English is active, THE CodeProof Platform SHALL set the root document language to English and direction to left-to-right.
5. WHEN Arabic is active, THE CodeProof Platform SHALL mirror directional layout and directional icons that convey navigation or sequence.
6. WHEN a Technical Token appears in Arabic content, THE CodeProof Platform SHALL render the Technical Token left-to-right with safe selection and copying.
7. THE CodeProof Platform SHALL provide the Primary Workflow at phone widths from 320 pixels, tablet widths from 768 pixels, and desktop widths from 1280 pixels.
8. WHEN a primary workflow is displayed at a supported width, THE CodeProof Platform SHALL prevent viewport-level horizontal overflow at 200 percent browser zoom.
9. THE CodeProof Platform SHALL provide semantic landmarks, ordered headings, programmatic names, visible focus indicators, and status announcements for changed Remediation Release interfaces.
10. THE CodeProof Platform SHALL support keyboard-only operation for every primary interaction introduced or changed by the Remediation Release.
11. WHEN reduced motion is requested by the operating system, THE CodeProof Platform SHALL suppress non-essential animation introduced or changed by the Remediation Release.
12. THE CodeProof Platform SHALL meet WCAG 2.2 Level AA contrast criteria for text, controls, focus indicators, and status information introduced or changed by the Remediation Release.
13. WHEN validation fails, THE CodeProof Platform SHALL associate each translated error message with the affected control and move focus to an error summary or the first invalid control.
14. WHEN the Browser Matrix is exercised, THE CodeProof Platform SHALL preserve content meaning, interaction order, citation readability, and touch-target usability in every matrix mode.

### Requirement 10: Public methodology and value-led positioning

**User Story:** As a buyer or recruiter, I want a public explanation of CodeProof's evidence method and limits, so that I can assess product value before trusting a report.

#### Acceptance Criteria

1. THE CodeProof Platform SHALL publish a public methodology view accessible without Recruiter authentication.
2. WHEN the public methodology view is displayed, THE CodeProof Platform SHALL explain the Canonical Evidence Taxonomy, contribution attribution, evidence-gap treatment, Repository Corpus bounds, metric denominators, optional AI role, deterministic fallback, and no-code-execution boundary.
3. WHEN the public methodology view describes a Candidate Conclusion, THE CodeProof Platform SHALL state that Recruiters remain the final decision-makers.
4. WHEN the public methodology view describes Review-First Order, THE CodeProof Platform SHALL state that the order is a draft and does not auto-reject Candidates.
5. WHEN public product positioning is displayed, THE CodeProof Platform SHALL lead with source-linked role-relevant evidence, review efficiency, bilingual access, and defensible human review.
6. IF a public claim lacks measured supporting data, THEN THE CodeProof Platform SHALL present the claim as a product capability or hypothesis rather than a quantified outcome.
7. THE CodeProof Platform SHALL provide the public methodology and product positioning in English and Arabic.
8. WHEN methodology rules change, THE CodeProof Platform SHALL display the effective Canonical Evidence Taxonomy version and update date.

### Requirement 11: Pilot pricing readiness and access boundaries

**User Story:** As a product operator, I want configurable pilot tiers and measurable limits without billing, so that the product can run controlled pilots and prepare for later monetization.

#### Acceptance Criteria

1. THE CodeProof Platform SHALL define at least two configurable Pilot Tiers with stable tier identifiers and translated display names.
2. WHEN a Pilot Tier is configured, THE Pilot Access Service SHALL associate the tier with named Entitlements and numeric Quotas.
3. THE Pilot Access Service SHALL support Quotas for Candidates, Repository analyses, paid AI usage, active external shares, and Recruiter seats per configured usage period.
4. WHEN a metered operation starts, THE Pilot Access Service SHALL evaluate the applicable Entitlement before the operation executes.
5. WHEN a metered operation starts, THE Pilot Access Service SHALL evaluate the applicable remaining Quota before the operation executes.
6. IF an Entitlement is absent, THEN THE Pilot Access Service SHALL deny the operation with a translated capability-unavailable response.
7. IF a Quota is exhausted, THEN THE Pilot Access Service SHALL deny the operation with the usage amount, limit, reset boundary, and translated next action.
8. WHEN a metered operation succeeds, THE Pilot Access Service SHALL record Owner-Scope usage exactly once.
9. IF a metered operation fails before producing a billable or retained result, THEN THE Pilot Access Service SHALL release the reserved usage amount.
10. WHEN concurrent metered operations occur, THE Pilot Access Service SHALL prevent successful usage from exceeding the applicable Quota.
11. THE CodeProof Platform SHALL expose Owner-Scope Entitlement, Quota, usage, and AI cost telemetry to authorized Recruiters or product operators.
12. THE Remediation Release SHALL omit checkout, payment collection, invoicing, subscription renewal, and payment-provider integration.
13. WHEN a public Pilot Tier description is displayed, THE CodeProof Platform SHALL distinguish pilot limits from future paid billing commitments.

### Requirement 12: Build and analysis traceability

**User Story:** As an operator or recruiter, I want reports and deployments tied to exact software and analysis versions, so that audit findings can be reproduced.

#### Acceptance Criteria

1. WHEN the CodeProof Platform builds for deployment, THE CodeProof Platform SHALL capture Build Metadata from the release commit and deployment environment.
2. WHEN an authorized diagnostic or health view is requested, THE CodeProof Platform SHALL expose non-secret Build Metadata.
3. WHEN an analysis is persisted, THE CodeProof Platform SHALL persist Analysis Metadata with the analysis record.
4. WHEN a Recruiter Report is displayed, THE Recruiter Report SHALL expose a human-readable analysis timestamp and non-secret analysis version identifiers.
5. WHEN an External Report is displayed, THE External Report SHALL expose the analysis timestamp and Canonical Evidence Taxonomy version without exposing internal provider credentials or account identifiers.
6. IF required commit or build identifiers are unavailable in a production build, THEN THE CodeProof Platform SHALL report the metadata gap through release diagnostics and the Release Disclosure.
7. WHEN AI output contributes to a displayed analysis section, THE Recruiter Report SHALL identify the optional AI contribution and deterministic fallback availability.

### Requirement 13: Repository-ingestion and application security

**User Story:** As a recruiter, I want CodeProof to treat uploaded and repository content as hostile input, so that evidence review cannot execute code or cross account boundaries.

#### Acceptance Criteria

1. WHEN a Repository is ingested, THE Deterministic Analysis Engine SHALL process Repository source only as bounded untrusted text.
2. THE CodeProof Platform SHALL omit Repository source execution, dependency installation, build execution, test execution, hook execution, macro execution, and embedded command execution from all analysis paths.
3. WHEN an archive is received, THE CodeProof Platform SHALL enforce archive transport, entry-count, path, decompression, file-count, file-size, selected-file, and selected-byte limits before analysis.
4. IF an archive entry attempts path traversal, symbolic-link escape, absolute-path extraction, decompression-limit bypass, or generated-path inclusion, THEN THE CodeProof Platform SHALL reject or exclude the entry before file materialization.
5. IF a Repository URL is not an Allowed Repository URL, THEN THE CodeProof Platform SHALL reject the Repository URL.
6. WHEN CV or Repository text reaches rendering, logging, telemetry, caching, or an optional provider, THE CodeProof Platform SHALL apply the applicable encoding, redaction, and untrusted-content boundary.
7. WHEN an authenticated private record is requested, THE CodeProof Platform SHALL enforce Owner Scope before returning existence or content information.
8. IF one Recruiter requests another Owner Scope's Candidate, Requisition, analysis, comparison, telemetry, quota, or share-management record, THEN THE CodeProof Platform SHALL return a non-disclosing authorization response.
9. WHEN signed-cookie authentication is used, THE CodeProof Platform SHALL preserve secure production cookie attributes, signature validation, expiration validation, and server-side Owner-Scope lookup.
10. IF untrusted input contains instructions that conflict with analysis rules, THEN THE CodeProof Platform SHALL treat the instructions as Repository Corpus evidence text rather than executable or controlling instructions.
11. WHEN security-relevant validation fails, THE CodeProof Platform SHALL log a redacted event without CV text, Repository source, External Share Token, session credential, or provider credential.

### Requirement 14: Persistence compatibility and inline upgrades

**User Story:** As an operator, I want remediation data to work with existing SQLite and PostgreSQL installations, so that deployment upgrades preserve current records and architecture.

#### Acceptance Criteria

1. THE CodeProof Platform SHALL support the Remediation Release data model on both SQLite and PostgreSQL persistence paths.
2. WHEN an existing database uses a Supported Legacy Schema, THE Inline Schema Upgrade SHALL add required remediation fields and records through the existing application initialization path.
3. WHEN an Inline Schema Upgrade runs more than once, THE Inline Schema Upgrade SHALL produce the same schema state without duplicate records or repeated data transformation.
4. WHEN a Legacy Record is read, THE CodeProof Platform SHALL assign explicit safe defaults for missing attribution, taxonomy, metadata, share, tier, quota, and telemetry fields.
5. IF a Legacy Record lacks contribution verification, THEN THE CodeProof Platform SHALL default Attribution Status to `unverified` and SHALL NOT infer `candidate_claimed`, `verified_owner`, or `verified_contributor`.
6. IF a Legacy Record lacks Discovery Origin, THEN THE CodeProof Platform SHALL derive one of `CV`, `portfolio`, `GitHub profile`, or `manual entry` only from persisted provenance and otherwise require explicit Recruiter confirmation before new analysis without emitting an invented origin.
7. WHEN an Inline Schema Upgrade completes, THE CodeProof Platform SHALL preserve existing accounts, candidates, requisitions, analyses, comparisons, and ownership links.
8. IF an Inline Schema Upgrade cannot complete, THEN THE CodeProof Platform SHALL stop the affected persistence initialization with a diagnostic error before serving partially upgraded writes.
9. WHEN legacy analysis data cannot satisfy a new Contradiction Invariant, THE CodeProof Platform SHALL preserve the source record and mark the affected Candidate Conclusion for recomputation.
10. THE Remediation Release SHALL preserve existing bounded-ingestion, analysis-service, authentication, routing, and dual-database architectural boundaries.
11. WHEN existing API consumers omit new optional fields, THE CodeProof Platform SHALL preserve supported pre-release behavior through documented defaults.

### Requirement 15: Automated regression, security, responsive, and E2E coverage

**User Story:** As a maintainer, I want committed automated coverage for audit-remediation risks, so that future changes cannot silently restore the audited defects.

#### Acceptance Criteria

1. THE Tracked E2E Suite SHALL use Synthetic Fixtures without production Candidate data, credentials, or External Share Tokens.
2. WHEN automated regression tests run, THE CodeProof Platform SHALL verify all Attribution Status values and all Discovery Origin values.
3. WHEN automated regression tests run, THE CodeProof Platform SHALL verify exclusion of Unverified Evidence from Candidate Conclusions, requisition matching, comparisons, and Review-First Order factors.
4. WHEN automated regression tests run, THE CodeProof Platform SHALL verify every Contradiction Invariant and Evidence Level threshold.
5. WHEN automated regression tests run, THE CodeProof Platform SHALL verify complete Evidence Citation fields and Context-Safe Interview Question redaction.
6. WHEN automated regression tests run, THE CodeProof Platform SHALL verify AI schema rejection, missing-pricing fallback, budget fallback, timeout fallback, transient retry bounds, non-transient no-retry behavior, cache reuse, Estimated Cost, Actual Cost, and unavailable-usage labeling.
7. WHEN automated regression tests run, THE CodeProof Platform SHALL verify Repository Metrics against known Synthetic Fixture file counts, byte counts, language denominators, and bounded exclusions.
8. WHEN automated regression tests run, THE CodeProof Platform SHALL verify Requisition Version binding, neutral unknown treatment, stable ties, explanatory factors, and Evidence-Checked Mark invalidation.
9. WHEN automated security tests run, THE CodeProof Platform SHALL verify Owner-Scope isolation across Candidates, Requisitions, analyses, comparisons, telemetry, Pilot Tiers, Quotas, and share management.
10. WHEN automated security tests run, THE CodeProof Platform SHALL verify valid, invalid, expired, revoked, cross-share, and rate-limited External Share Token behavior.
11. WHEN automated security tests run, THE CodeProof Platform SHALL verify External Report read-only boundaries, PII-Safe allowlisting, no-index directives, no-referrer policy, and secret redaction.
12. WHEN automated security tests run, THE CodeProof Platform SHALL verify archive traversal, decompression bounds, generated-path exclusion, oversized input rejection, prompt-injection containment, output encoding, and the no-code-execution boundary.
13. WHEN persistence tests run, THE CodeProof Platform SHALL verify fresh and Legacy Record upgrades on SQLite and PostgreSQL-compatible test paths.
14. WHEN persistence tests run, THE CodeProof Platform SHALL verify idempotent Inline Schema Upgrades and preservation of Owner Scope.
15. WHEN responsive browser tests run, THE Tracked E2E Suite SHALL exercise the Browser Matrix at representative 320-pixel mobile, 768-pixel tablet, and 1280-pixel desktop viewports.
16. WHEN responsive browser tests run, THE Tracked E2E Suite SHALL verify no viewport overflow, keyboard operation, focus visibility, expandable-state semantics, root language, root direction, Technical Token direction, translated Robust States, and reduced-motion behavior.
17. WHEN core E2E tests run, THE Tracked E2E Suite SHALL complete sign-up or sign-in, CV ingestion, repository discovery or manual selection, bounded deterministic analysis, report review, Candidate persistence, Requisition creation, requisition-bound comparison, Review-First Order review, External Share creation, External Report access, revocation, and Hiring Insights access.
18. WHEN optional-provider E2E tests run without provider credentials, THE Tracked E2E Suite SHALL verify successful deterministic fallback through the complete core workflow.
19. WHEN pilot-access tests run, THE CodeProof Platform SHALL verify Entitlement denial, Quota exhaustion, usage reset boundaries, failed-operation release, concurrent usage enforcement, and omission of billing behavior.
20. WHEN public-page tests run, THE Tracked E2E Suite SHALL verify English and Arabic methodology content, value-led positioning, taxonomy version, and human-decision disclaimers.

### Requirement 16: Release validation and Vercel launch verification

**User Story:** As a product owner, I want the remediation release validated in source, browsers, and the launch environment, so that completion claims correspond to a working deployment.

#### Acceptance Criteria

1. WHEN release validation begins, THE Remediation Release SHALL run lint in non-watch mode and record the result.
2. WHEN release validation begins, THE Remediation Release SHALL run TypeScript type checking in non-watch mode and record the result.
3. WHEN release validation begins, THE Remediation Release SHALL run all unit, integration, regression, security, and Tracked E2E Suite tests in non-watch mode and record the result.
4. WHEN release validation begins, THE Remediation Release SHALL run a production build and record the result.
5. WHEN release validation begins, THE Remediation Release SHALL run a dependency vulnerability audit and record the reviewed result.
6. WHEN release validation begins, THE Remediation Release SHALL run fresh-database and upgrade-path migration checks for SQLite and PostgreSQL and record the result.
7. WHEN release validation begins, THE Remediation Release SHALL run Browser Matrix checks for the changed public, recruiter, report, comparison, pricing, and external-share surfaces.
8. WHEN a Vercel preview is built from the release commit, THE Vercel Launch Verification SHALL exercise health, authentication, deterministic core workflow, persistence, requisition-bound comparison, Recruiter Report, External Share creation, External Report access, and revocation against the preview URL.
9. WHEN the release commit is promoted to Vercel production, THE Vercel Launch Verification SHALL repeat the preview verification flow against the production URL.
10. WHEN Vercel Launch Verification completes, THE Remediation Release SHALL record deployment URL, commit hash, build identifier, environment, verification timestamp, and check outcomes.
11. IF the preview and production deployments do not use the same release commit, THEN THE Vercel Launch Verification SHALL fail the launch gate.
12. IF any required lint, typecheck, test, build, dependency audit, migration, browser, preview, or production check fails, THEN THE Remediation Release SHALL remain incomplete until correction or Release Disclosure.
13. WHERE the Product-Owner Exception applies to the Remediation Release, THE CodeProof Platform SHALL use Vercel Launch Verification instead of live Replit URL verification as the launch gate.
14. WHERE the Product-Owner Exception applies to the Remediation Release, THE CodeProof Platform SHALL retain the Replit Compatibility Path and document that live Replit verification was not required for this release.
15. WHEN deployment documentation is updated, THE CodeProof Platform SHALL identify the Product-Owner Exception as release-specific rather than a permanent removal of Replit compatibility.

### Requirement 17: Completion disclosure and preservation obligations

**User Story:** As a product owner, I want an explicit completion record, so that unresolved audit items or verification gaps cannot be hidden by a release claim.

#### Acceptance Criteria

1. WHEN the Remediation Release is presented for review, THE Release Disclosure SHALL enumerate every requirement and validation check with a completed, incomplete, blocked, skipped, failed, or externally unverifiable status.
2. IF any requirement or validation check is not completed, THEN THE Release Disclosure SHALL state the affected scope, reason, user impact, available evidence, and required next action.
3. IF a check depends on unavailable credentials, external infrastructure, or product-owner action, THEN THE Release Disclosure SHALL label the check as externally unverifiable rather than passed.
4. WHEN baseline verification results are cited, THE Release Disclosure SHALL distinguish pre-remediation results from post-remediation results.
5. WHEN repository changes are summarized, THE Release Disclosure SHALL identify all modified spec, source, test, schema, documentation, and deployment files.
6. IF an existing user change conflicts with a remediation edit, THEN THE Remediation Release SHALL preserve the user change and record the unresolved conflict in the Release Disclosure.
7. THE Remediation Release SHALL preserve existing supported functionality unless a changed behavior is explicitly required by this requirements document.
8. WHEN the Remediation Release is declared complete, THE Release Disclosure SHALL contain no undisclosed incomplete, blocked, skipped, failed, or externally unverifiable items.

### Requirement 18: Authoritative audit scenarios and economic projections

**User Story:** As a product owner, I want the audit-specific examples, terminology, economic assumptions, and validation evidence stated normatively, so that implementation cannot satisfy a broad requirement while missing the defects and workflows that triggered remediation.

#### Acceptance Criteria

1. THE Canonical Evidence Taxonomy SHALL resolve `Testing` and `Automated testing` to one canonical general-testing capability and SHALL resolve `unit`, `unit testing`, `integration`, and `integration testing` through explicit narrower aliases or relationships without conflating their evidence scopes.
2. THE Canonical Evidence Taxonomy SHALL resolve meaningful GitHub Actions workflow evidence to the canonical `CI/CD` capability; a file name, empty workflow, documentation mention, or dependency-only signal SHALL NOT by itself establish meaningful CI/CD implementation.
3. WHEN an Evidence Citation is persisted or exposed to an authorized Recruiter, THE CodeProof Platform SHALL preserve detector identifier and version, Repository identity, Repository name, Repository URL, immutable revision or explicit revision-unavailable state, file path, symbol when available, line span when available, bounded exact excerpt when safe, direct source link, Discovery Origin, Attribution Status, Evidence Level, and taxonomy version.
4. WHEN revision and line data permit an immutable direct link, THE Evidence Citation SHALL link directly to the cited GitHub blob and line range; otherwise it SHALL provide the most specific safe Repository or file link and explicitly state that an immutable revision or line link is unavailable.
5. IF a Repository contains a Flask `schema.sql` or other database-schema signal without Flask application-route or HTTP-handler evidence, THEN THE CodeProof Platform SHALL NOT generate a Flask HTTP-flow question or conclusion and SHALL instead present route evidence as unknown or an explicit evidence gap.
6. WHEN a repository-analysis batch is displayed or persisted, THE CodeProof Platform SHALL report selected, successful, failed, and pending Repository counts plus separate `unverified`, `candidate_claimed`, `verified_owner`, and `verified_contributor` counts; completed-batch and attribution-total reconciliation invariants SHALL be enforced.
7. WHEN Candidates are compared, THE CodeProof Platform SHALL test and support Candidates evaluated against the same selected Requisition Version and SHALL reject or require recomputation for saved factors or analyses bound to a mismatched Requisition Version rather than silently mixing role criteria.
8. WHEN an unauthenticated signed-out visitor opens an External Share, THE CodeProof Platform SHALL support a valid unexpired share and SHALL present the same non-disclosing localized unavailable contract for invalid, expired, or revoked shares without redirecting the visitor to Recruiter sign-in.
9. THE Remediation Release SHALL inventory and provide English and Arabic content, correct LTR/RTL document behavior, WCAG 2.2 AA interaction semantics, and responsive/mobile coverage for every existing or added user-facing route, including `/`, `/signin`, `/analyze`, `/candidates`, `/candidates/[id]`, `/candidates/[id]/projects/[analysisId]`, `/candidates/[id]/share`, `/compare`, `/review`, `/requirements`, `/insights`, `/about`, `/methodology`, `/pilot`, and the public `/share` External Report route.
10. WHEN evidence is absent, unverified, unavailable, or ineligible, Recruiter and public wording SHALL say `unknown`, `not verified`, `not available`, or `not enough visible evidence` as applicable and SHALL NOT describe the Candidate as deficient or as lacking the skill.
11. FOR every enabled paid provider/model, THE Pricing Metadata Registry SHALL store provider identifier, model identifier, billable units, input price, cached-input price when applicable, output price, currency, effective date, source-check date, registry version, and a direct official primary-source pricing URL; no secondary-source or guessed price SHALL enable paid requests.
12. THE CodeProof Platform SHALL calculate and display estimated and, when usage exists, actual AI cost per analyzed Candidate and normalized cost per 100 Candidates, using the same pinned provider/model pricing row and explicit rounding rules.
13. WHEN cost projections are displayed, THE CodeProof Platform SHALL expose configurable assumptions including repositories per Candidate, AI operations per Candidate, expected input/cached-input/output units, cache-hit rate, provider/model, and Candidate volume; changing any assumption SHALL deterministically recompute both per-Candidate and per-100-Candidate projections without changing historical actuals.
14. WHEN build identity is displayed or recorded, THE CodeProof Platform SHALL include the release commit SHA and build or release date, plus build identifier, environment, and verification timestamp when applicable; missing production SHA/date SHALL be disclosed rather than fabricated.
15. THE regression and smoke matrices SHALL exercise the exact public repositories `sindresorhus/is`, `chalk/chalk`, and `sindresorhus/p-limit` at recorded immutable revisions when network access is available, while treating their source strictly as bounded non-executed text.
16. THE Synthetic Fixture workflows SHALL cover: the sample CV discovering `sindresorhus/is`; portfolio discovery and Recruiter confirmation of `sindresorhus/p-limit`; a second clearly labeled synthetic Candidate using `chalk/chalk` plus an unavailable portfolio source; Testing/Automated testing/unit/integration aliases; meaningful and non-meaningful GitHub Actions workflows; neutral PostgreSQL unknown evidence; same and mismatched requisitions; valid, expired, and revoked signed-out shares; and deterministic fallback without provider credentials.
17. WHEN release validation is recorded, THE Remediation Release SHALL include non-watch lint, typecheck, the full unit/property/integration/regression/security suite, production build, fresh and upgrade migration matrix, tracked E2E, production-build runtime smoke, scoped diff and generated-artifact review, secret/security review, no-execution assertions, and legacy data-compatibility results.
18. THE release integration plan SHALL remain on the inspected existing `deploy/vercel-production` branch, preserve unrelated work, and verify the same release commit on Vercel preview and Vercel production without claiming success when deployment access is unavailable.
19. WHEN any requirement, exact Repository smoke, provider check, deployment check, migration path, browser mode, or other validation cannot be completed, THE Release Disclosure SHALL mark it incomplete, blocked, failed, skipped, or externally unverifiable with scope, impact, evidence, and next action; no completion claim may hide it.

### Requirement 19: Internal owner administration role and access enforcement

**User Story:** As the product owner, I want a server-enforced internal administration role bootstrapped only from a secure environment variable, so that platform operation stays under my control without exposing an administrative attack surface.

#### Acceptance Criteria

1. THE CodeProof Platform SHALL implement the Admin Role as a server-persisted account role on the Established Architecture authentication path and both Dual Database Persistence paths.
2. WHEN application initialization runs, THE CodeProof Platform SHALL grant the Admin Role only to an existing account whose registered email address exactly matches the Admin Bootstrap Variable value.
3. IF the Admin Bootstrap Variable is absent, empty, or matches no existing account, THEN THE CodeProof Platform SHALL start with no Admin Role granted and SHALL record a redacted diagnostic event that identifies the unresolved administrative bootstrap.
4. THE CodeProof Platform SHALL omit hardcoded administrative email addresses, passwords, password hashes, tokens, and recovery credentials from source files, configuration defaults, Synthetic Fixtures, and client bundles.
5. THE CodeProof Platform SHALL omit every public, self-service, invitation-free, and unauthenticated path that grants the Admin Role.
6. WHEN an Admin Console route or administrative API receives a request, THE CodeProof Platform SHALL evaluate the Admin Role from server-side account state on every request before returning administrative data or executing an administrative action.
7. IF an Admin Console route or administrative API request carries no authenticated session, THEN THE CodeProof Platform SHALL deny the request with a non-disclosing response that omits administrative route existence, administrative data shape, and account existence.
8. IF an Admin Console route or administrative API request carries an authenticated session without the Admin Role, THEN THE CodeProof Platform SHALL deny the request with a non-disclosing authorization response and SHALL append an Administrative Audit Log entry for the denied attempt.
9. IF a request supplies a role, permission, or administrative claim through a cookie value, request body, query parameter, header, or client-side state, THEN THE CodeProof Platform SHALL ignore the supplied claim and SHALL derive the effective role only from server-side account state.
10. WHEN an administrative request arrives from a non-browser client, command-line tool, script, or direct API call, THE CodeProof Platform SHALL apply the same server-side Admin Role evaluation applied to browser requests.
11. WHEN repeated denied administrative requests exceed the configured security threshold, THE CodeProof Platform SHALL rate-limit further administrative authorization attempts for the originating requester.
12. WHEN an Admin Actor executes an administrative action, THE Administrative Audit Log SHALL record Admin Actor identity, action name, target account or record identity, non-secret action parameters, prior and new values for state changes, outcome, timestamp, and request correlation identifier.
13. THE Administrative Audit Log SHALL accept append operations and SHALL deny update, overwrite, and delete operations from every application path, including the Admin Console and administrative APIs.
14. IF an Administrative Audit Log append fails for a state-changing administrative action, THEN THE CodeProof Platform SHALL fail the administrative action and SHALL leave the target state unchanged.
15. WHEN any Admin Console view, administrative API response, administrative export, or Administrative Audit Log entry is produced, THE CodeProof Platform SHALL exclude password values, password hashes, session credentials, reset secrets, External Share Tokens, Share Passcode values, provider API keys, and every other secret value.

### Requirement 20: Administration dashboard metrics and account inventory

**User Story:** As the product owner, I want one responsive administration dashboard with platform metrics and a searchable account table, so that I can assess adoption, usage, cost, and account health at a glance.

#### Acceptance Criteria

1. THE Admin Console SHALL provide an `/admin` dashboard restricted to the Admin Role.
2. WHEN the `/admin` dashboard loads, THE Admin Console SHALL display total accounts, active accounts, new accounts within the selected period, free-plan accounts, paid-plan accounts, suspended accounts, and Demo Accounts.
3. WHEN the `/admin` dashboard loads, THE Admin Console SHALL display the count of Candidates analyzed and the count of Repositories analyzed.
4. WHEN the `/admin` dashboard loads, THE Admin Console SHALL display AI request count, token or billable usage totals, Estimated Cost totals, Actual Cost totals, and failed analysis and AI job counts.
5. WHEN a dashboard metric is displayed, THE Admin Console SHALL display the period boundary, population denominator, and rounding rule used by the metric.
6. IF source data for a dashboard metric is unavailable, THEN THE Admin Console SHALL label the metric as unavailable rather than zero.
7. THE Admin Console SHALL provide an account table containing account identifier, account email address, company name when recorded, Account Lifecycle State, plan identifier, usage totals, applicable Quotas, registration timestamp, and last activity timestamp.
8. WHEN an Admin Actor submits a search term, THE Admin Console SHALL filter the account table by account identifier, account email address, and company name.
9. WHEN an Admin Actor applies a filter, THE Admin Console SHALL filter the account table by Account Lifecycle State, plan identifier, and Demo Account designation.
10. WHEN the account table result set exceeds one page, THE Admin Console SHALL paginate the result set with a documented stable ordering.
11. WHEN an Admin Actor selects an account row, THE Admin Console SHALL open the administrative detail view for that account.
12. THE Admin Console SHALL present the `/admin` dashboard and account table at phone widths from 320 pixels, tablet widths from 768 pixels, and desktop widths from 1280 pixels without viewport-level horizontal overflow at 200 percent browser zoom.
13. THE Admin Console SHALL provide English and Arabic translations, correct root language and direction, left-to-right Technical Token rendering, keyboard-only operation, visible focus indicators, programmatic names, and WCAG 2.2 Level AA contrast for every administrative view and control.
14. WHEN an administrative request is pending, returns no records, returns partial data, is denied, or fails unexpectedly, THE Admin Console SHALL present the corresponding translated Robust State without exposing secrets or stack traces.

### Requirement 21: Administrative account, plan, credit, and demo management

**User Story:** As the product owner, I want audited administrative control over account state, plans, credits, demo data, and external shares, so that I can operate pilots and support customers without direct database access.

#### Acceptance Criteria

1. WHEN an Admin Actor opens an administrative account detail view, THE Admin Console SHALL display the account's Candidates, repository analyses, Requisitions, usage records, AI Telemetry Records, and external share records.
2. WHEN the Admin Console displays external share records, THE Admin Console SHALL display share status, Share Expiry Option, expiration timestamp, passcode requirement, email-verification requirement, and Share Access Log entries while excluding the plaintext External Share Token.
3. WHEN an Admin Actor activates, suspends, reactivates, soft-deletes, or restores an account, THE CodeProof Platform SHALL set exactly one Account Lifecycle State and SHALL append an Administrative Audit Log entry containing the prior and new state.
4. WHILE an account is `suspended`, THE CodeProof Platform SHALL deny that account's sign-in, authenticated session use, metered operations, and external share validation with a translated account-unavailable response.
5. WHILE an account is `soft_deleted`, THE CodeProof Platform SHALL retain the account records, deny sign-in, deny external share validation, and exclude the account from active-account metrics while preserving restoration capability.
6. WHEN an Admin Actor restores a `soft_deleted` account, THE CodeProof Platform SHALL set the Account Lifecycle State to `active` and SHALL preserve the account's prior Candidates, repository analyses, Requisitions, comparisons, share records, and ownership links.
7. WHEN an Admin Actor changes an account's plan, THE CodeProof Platform SHALL apply the target Pilot Tier Entitlements and Quotas to subsequent Pilot Access Service evaluations without processing payment.
8. WHEN an Admin Actor adjusts or resets a Credit Balance or a Quota, THE CodeProof Platform SHALL persist the new limit and remaining usage values, apply the new values to the next metered evaluation, and append an Administrative Audit Log entry containing the prior and new values.
9. WHEN an Admin Actor creates a Demo Account, THE CodeProof Platform SHALL require an Admin-supplied label and SHALL populate the account with Synthetic Fixtures covering Requisitions, Candidates, repository analyses, Evidence Citations, a requisition-bound comparison, a Review-First Order, and an external share record.
10. WHEN a Demo Account or Demo Activity is displayed on any Admin Console, recruiter-facing, or externally shared surface, THE CodeProof Platform SHALL display the Demo Account designation and label adjacent to the content.
11. WHEN an Admin Actor resets a Demo Account, THE CodeProof Platform SHALL return that account to its defined Synthetic Fixture baseline, SHALL append an Administrative Audit Log entry, and SHALL leave every non-demo account unchanged.
12. WHEN an Admin Actor revokes an external share, THE External Share Service SHALL invalidate subsequent Guest Dossier access for the associated External Share Token and SHALL append an Administrative Audit Log entry.
13. WHEN an Admin Actor triggers a password reset for an account, THE CodeProof Platform SHALL initiate the reset through the existing authentication provider path and SHALL exclude the current password, the new password, the password hash, and the reset secret from the Admin Console response, the administrative API response, and the Administrative Audit Log.
14. IF an administrative action targets a non-existent account or a record outside the administrative authorization boundary, THEN THE CodeProof Platform SHALL return a non-disclosing response that omits record existence.
15. WHEN an administrative action changes account state, plan, Credit Balance, Quota, demo baseline, or share validity, THE CodeProof Platform SHALL require a state-changing request method and SHALL reject the same action through a read-only request path.

### Requirement 22: Time-limited audited impersonation with safe return

**User Story:** As the product owner, I want to reproduce a customer's view through bounded audited impersonation, so that I can diagnose issues without learning credentials or performing dangerous changes.

#### Acceptance Criteria

1. WHEN an Admin Actor starts an Impersonation Session, THE CodeProof Platform SHALL require the Admin Role, an explicit target account, and a recorded reason, and SHALL append an Administrative Audit Log entry.
2. WHEN an Impersonation Session starts, THE CodeProof Platform SHALL assign a configured maximum duration no greater than 60 minutes.
3. WHEN the assigned Impersonation Session duration elapses, THE CodeProof Platform SHALL end the Impersonation Session, restore the Admin Actor session context, and append an Administrative Audit Log entry.
4. WHILE an Impersonation Session is active, THE CodeProof Platform SHALL display the Impersonation Banner on every rendered route, identifying the impersonated account label and the remaining session time.
5. WHILE an Impersonation Session is active, THE CodeProof Platform SHALL present the keyboard-operable Return To Admin Control inside the Impersonation Banner on every rendered route.
6. WHEN the Return To Admin Control is activated, THE CodeProof Platform SHALL end the Impersonation Session, restore the Admin Actor session context, return the Admin Actor to the Admin Console, and append an Administrative Audit Log entry.
7. WHILE an Impersonation Session is active, THE CodeProof Platform SHALL deny every Dangerous Impersonated Action with a translated blocked-action response that names the blocked action category.
8. WHILE an Impersonation Session is active, THE CodeProof Platform SHALL enforce Dangerous Impersonated Action denial on the server for interface requests and direct API requests alike.
9. WHILE an Impersonation Session is active, THE Administrative Audit Log SHALL record each impersonated state-changing request with both the Admin Actor identity and the impersonated account identity.
10. WHILE an Impersonation Session is active, THE CodeProof Platform SHALL exclude the impersonated account's password, password hash, session credential, provider credentials, and External Share Tokens from every response and log.
11. IF an Impersonation Session credential is presented after expiry, revocation, or completion, THEN THE CodeProof Platform SHALL deny the request with a non-disclosing response and SHALL require a new authorized Impersonation Session.
12. IF an authenticated account without the Admin Role requests Impersonation Session creation, continuation, or extension, THEN THE CodeProof Platform SHALL deny the request with a non-disclosing authorization response.
13. WHEN the Impersonation Banner renders, THE CodeProof Platform SHALL provide English and Arabic text, correct direction, WCAG 2.2 Level AA contrast, and a programmatic status announcement.

### Requirement 23: Demo data exclusion from commercial aggregates

**User Story:** As the product owner, I want demo accounts and demo activity excluded from real money and customer numbers, so that business reporting reflects only genuine customer behavior.

#### Acceptance Criteria

1. WHEN a Real Commercial Aggregate is computed, THE CodeProof Platform SHALL exclude Demo Accounts and Demo Activity from the aggregate population.
2. WHEN Demo Activity produces AI usage, THE CodeProof Platform SHALL persist the AI Telemetry Record with a demo designation and SHALL exclude the record from Real Commercial Aggregate cost totals.
3. WHEN the Admin Console displays account, usage, or cost totals, THE Admin Console SHALL display real totals and demo totals as separately labeled values.
4. IF a metric mixes real and demo populations, THEN THE Admin Console SHALL label the metric as a combined operational metric rather than a Real Commercial Aggregate.
5. WHEN an account's Demo Account designation changes, THE CodeProof Platform SHALL apply the new designation to subsequently computed aggregates and SHALL preserve previously persisted telemetry and usage records without retroactive alteration.
6. WHEN Demo Activity is exported, shared externally, or presented in a Recruiter Report or External Report, THE CodeProof Platform SHALL label the content as non-production data.
7. THE CodeProof Platform SHALL exclude Demo Accounts and Demo Activity from customer analytics covering registration conversion, retention, activation, and customer usage distribution.

### Requirement 24: Paid-account-controlled external sharing

**User Story:** As a paying recruiter, I want exclusive control over external share links with configurable protection and expiry, so that only I decide who can see a candidate dossier and for how long.

#### Acceptance Criteria

1. THE Pilot Access Service SHALL define the Sharing Entitlement as a named Entitlement required for External Share creation, management, revocation, and regeneration.
2. WHEN External Share creation, management, revocation, or regeneration is requested, THE External Share Service SHALL require an authenticated session, Owner-Scope authorization for the source Candidate report, and the Sharing Entitlement.
3. IF the Sharing Entitlement is absent for the requesting Owner Scope, THEN THE External Share Service SHALL deny the request with a translated capability-unavailable response that names the required plan capability without processing payment.
4. IF an unauthenticated request attempts External Share creation, management, revocation, or regeneration, THEN THE External Share Service SHALL deny the request with a non-disclosing response.
5. WHEN a Recruiter creates or regenerates an External Share, THE External Share Service SHALL display the plaintext External Share Token exactly once to the authorized Recruiter and SHALL exclude the plaintext External Share Token from later retrieval.
6. WHEN a Recruiter regenerates an External Share, THE External Share Service SHALL issue a new External Share Token, invalidate the prior External Share Token, and preserve the existing Share Access Log entries.
7. WHEN a Recruiter selects an external-share lifetime, THE External Share Service SHALL offer exactly the Share Expiry Options of 24 hours, 7 days, and 30 days.
8. WHEN a Recruiter creates an External Share without selecting a Share Expiry Option, THE External Share Service SHALL apply the 7-day Share Expiry Option.
9. WHEN the expiration timestamp of an External Share is reached, THE External Share Service SHALL deny further Guest Dossier access without requiring a Recruiter action.
10. WHERE a Recruiter sets a Share Passcode, THE External Share Service SHALL require the Share Passcode in addition to a valid External Share Token, SHALL store only a non-reversible passcode digest, and SHALL rate-limit failed passcode attempts.
11. WHERE a Recruiter enables Guest Email Verification, THE External Share Service SHALL require a one-time verification code delivered to the Recruiter-specified email address before granting Guest Dossier access.
12. WHEN a Guest Dossier access attempt occurs, THE Share Access Log SHALL record the timestamp, outcome, applied access controls, and coarse request metadata while excluding the plaintext External Share Token and the plaintext Share Passcode.
13. WHEN a Recruiter opens external share management, THE CodeProof Platform SHALL display share status, Share Expiry Option, expiration timestamp, passcode requirement, email-verification requirement, and Share Access Log entries within Owner Scope.
14. WHEN a Recruiter revokes an External Share, THE External Share Service SHALL deny subsequent Guest Dossier access for the associated External Share Token and SHALL retain the Share Access Log entries.

### Requirement 25: Guest dossier isolation and data reduction

**User Story:** As a recruiter sharing externally, I want a guest to see exactly one reduced read-only dossier, so that external review never exposes other candidates, private notes, or account capability.

#### Acceptance Criteria

1. WHEN a Guest Reviewer presents a valid unexpired External Share Token and satisfies every applied access control, THE External Share Service SHALL render exactly one read-only Guest Dossier for the single associated Candidate report.
2. WHEN a Guest Dossier renders, THE CodeProof Platform SHALL exclude internal notes, Recruiter workflow metadata, Evidence-Checked Marks, Review-First Order factors, and Candidate workflow stage data.
3. WHEN a Guest Dossier renders, THE CodeProof Platform SHALL apply the PII-Safe field allowlist and SHALL exclude contact details, addresses, account identifiers, authentication data, and personal data that role-relevant evidence does not require.
4. WHEN a Guest Dossier renders, THE CodeProof Platform SHALL exclude every other Candidate, Candidate list, comparison view, Requisition list, Hiring Insights view, account-settings capability, pricing capability, and Admin Console surface.
5. WHEN a Guest Dossier renders, THE CodeProof Platform SHALL exclude export actions, download actions, and bulk-retrieval actions.
6. WHEN a Guest Dossier renders, THE CodeProof Platform SHALL exclude AI-analysis features, AI request initiation, re-analysis actions, and every mutation API.
7. IF a Guest Dossier request targets a Candidate, analysis, share, account, or administrative resource outside the single associated Candidate report, THEN THE CodeProof Platform SHALL return a non-disclosing unavailable response.
8. WHEN a Guest Dossier renders, THE CodeProof Platform SHALL apply the `noindex` and `nofollow` directives, the `noindex` search-engine response header, the no-referrer policy, and the External Share Token log-exclusion rules defined in Requirement 7.
9. IF an External Share Token is invalid, expired, or revoked, THEN THE External Share Service SHALL return the same non-disclosing translated unavailable response and SHALL avoid redirecting the Guest Reviewer to Recruiter sign-in.
10. WHEN a Guest Dossier renders, THE CodeProof Platform SHALL provide English and Arabic content, correct root language and direction, left-to-right Technical Token rendering, keyboard-only operation, visible focus indicators, and WCAG 2.2 Level AA contrast at 320-pixel, 768-pixel, and 1280-pixel viewports.
11. WHEN a Guest Dossier presents an Evidence Citation, THE Guest Dossier SHALL preserve Attribution Status, Discovery Origin, Evidence Level, and taxonomy version while excluding bounded excerpts that contain personal data or secret-like values.

### Requirement 26: Extensible enterprise sharing without billing

**User Story:** As the product owner, I want enterprise sharing capabilities designed as configurable extension points, so that a future paid plan can enable them without re-architecting sharing.

#### Acceptance Criteria

1. THE CodeProof Platform SHALL define an Enterprise Sharing Extension Point for authenticated organization-member access to a shared Candidate report.
2. THE CodeProof Platform SHALL define an Enterprise Sharing Extension Point for restricting Guest Dossier access to a configured company email domain.
3. THE CodeProof Platform SHALL define an Enterprise Sharing Extension Point for external identity-provider single sign-on applied to shared-report access.
4. THE CodeProof Platform SHALL define an Enterprise Sharing Extension Point for a permanent internal share that remains valid while the owning account is `active`.
5. THE CodeProof Platform SHALL define an Enterprise Sharing Extension Point for detailed per-viewer share audit records.
6. WHEN an Enterprise Sharing Extension Point is defined, THE CodeProof Platform SHALL express the capability through the existing Entitlement model so that a future paid plan enables the capability by configuration.
7. THE Remediation Release SHALL omit checkout, payment collection, invoicing, subscription renewal, and payment-provider integration for every Enterprise Sharing Extension Point.
8. WHILE an Enterprise Sharing Extension Point remains unimplemented, THE CodeProof Platform SHALL deny the associated capability with a translated capability-unavailable response.
9. WHEN a public or recruiter-facing surface describes an Enterprise Sharing Extension Point, THE CodeProof Platform SHALL label the capability as planned rather than available.

### Requirement 27: Continuous verification loop and acceptance-criterion integrity

**User Story:** As the product owner, I want an autonomous verification loop that fixes defects instead of lowering standards, so that a passing test suite means the product actually works.

#### Acceptance Criteria

1. WHILE any acceptance criterion in this requirements document remains unimplemented or failing, THE Verification Loop SHALL repeat implementation, automated testing, browser inspection, defect correction, and regression re-runs.
2. WHEN one Verification Loop cycle completes, THE Verification Loop SHALL re-run the previously passing automated checks and SHALL record each outcome.
3. THE Verification Loop SHALL preserve every acceptance criterion in this requirements document without weakening, deleting, skipping, disabling, or rewriting the criterion to make a test pass.
4. IF an acceptance criterion cannot be satisfied, THEN THE Remediation Release SHALL retain the original criterion text and SHALL record the criterion in the Release Disclosure as incomplete, blocked, failed, skipped, or externally unverifiable.
5. IF a criterion change is genuinely required, THEN THE Remediation Release SHALL obtain recorded product-owner approval before the criterion text changes and SHALL record the approval in the Release Disclosure.
6. THE Verification Loop SHALL omit Defect Masking through substituted fallback data, mocked success in place of a real failing behavior, silently handled exceptions, and disabled or skipped assertions.
7. IF an automated check fails, THEN THE Verification Loop SHALL diagnose the underlying defect and correct the implementation, and SHALL modify the assertion only when the assertion contradicts this requirements document.
8. IF a fallback path executes during verification, THEN THE Verification Loop SHALL record the fallback reason and SHALL verify the corresponding primary path as a separate check.
9. WHEN an exception is handled during a user-facing operation, THE CodeProof Platform SHALL present the applicable Robust State and log a redacted diagnostic event rather than return a success result.
10. WHEN a browser inspection runs, THE Verification Loop SHALL record browser-console output and server runtime output and SHALL treat any Unexpected Runtime Error as a defect.
11. THE Release Gate SHALL pass twice consecutively with no newly discovered defect between the two passes.
12. IF a defect is discovered during either Release Gate pass, THEN THE Verification Loop SHALL correct the defect and SHALL restart the twice-consecutive Release Gate requirement from the first pass.
13. WHEN a Release Gate pass completes, THE Remediation Release SHALL record the commit hash, start timestamp, completion timestamp, and per-check outcome for that pass.

### Requirement 28: End-to-end recruiter demo simulation

**User Story:** As the product owner, I want a full simulated recruiter session verified on fresh and existing accounts, so that the demo I show works end to end in both languages and on both device classes.

#### Acceptance Criteria

1. THE Recruiter Demo Simulation SHALL execute a Fresh Account Run and an Existing Account Run.
2. WHEN the Recruiter Demo Simulation runs, THE Recruiter Demo Simulation SHALL complete account registration or sign-in and initial workspace access.
3. WHEN the Recruiter Demo Simulation runs, THE Recruiter Demo Simulation SHALL create a Requisition containing role requirements and evaluation criteria.
4. WHEN the Recruiter Demo Simulation runs, THE Recruiter Demo Simulation SHALL import a realistic CV and confirm bounded CV text ingestion.
5. WHEN the Recruiter Demo Simulation runs, THE Recruiter Demo Simulation SHALL complete portfolio and Repository discovery plus Recruiter confirmation of the discovered Repositories.
6. WHEN the Recruiter Demo Simulation runs, THE Recruiter Demo Simulation SHALL verify contribution attribution, including the recorded Discovery Origin and Attribution Status for every reviewed Repository.
7. WHEN the Recruiter Demo Simulation runs, THE Recruiter Demo Simulation SHALL analyze multiple valid Repositories and exactly one invalid Repository within one batch.
8. WHEN the batch containing the invalid Repository completes, THE Recruiter Demo Simulation SHALL verify partial-failure handling, reconciled selected, successful, failed, and pending Repository counts, and disclosure of the failed Repository.
9. WHEN the Recruiter Demo Simulation reviews a Recruiter Report, THE Recruiter Demo Simulation SHALL verify file-level evidence, Evidence Citations, bounded snippets, and working source links.
10. WHEN the Recruiter Demo Simulation reviews a Recruiter Report, THE Recruiter Demo Simulation SHALL verify that every displayed Candidate Conclusion carries at least one eligible Evidence Citation and that no Contradiction Invariant is violated.
11. WHEN the Recruiter Demo Simulation reviews generated questions, THE Recruiter Demo Simulation SHALL verify that each question is a Context-Safe Interview Question grounded in a cited evidence item or a labeled evidence gap.
12. WHEN the Recruiter Demo Simulation runs, THE Recruiter Demo Simulation SHALL complete a comparison bound to a compatible Requisition Version.
13. WHEN the Recruiter Demo Simulation runs, THE Recruiter Demo Simulation SHALL review the ranked Review-First Order queue and complete a Recruiter-initiated Candidate stage update.
14. WHEN the Recruiter Demo Simulation runs, THE Recruiter Demo Simulation SHALL generate an External Share, open the Guest Dossier as a Guest Reviewer, verify expiry behavior, and verify revocation behavior.
15. WHEN the Recruiter Demo Simulation opens a Guest Dossier, THE Recruiter Demo Simulation SHALL verify guest isolation and personal-data reduction against the PII-Safe field allowlist.
16. WHEN the Recruiter Demo Simulation runs, THE Recruiter Demo Simulation SHALL verify Pilot Tier limits, Entitlement denial, Quota exhaustion blocked states, AI usage telemetry, and AI cost telemetry.
17. WHEN the Recruiter Demo Simulation runs, THE Recruiter Demo Simulation SHALL verify the complete `/admin` dashboard, including every dashboard metric, account table search, account table filtering, Account Lifecycle State changes, plan change, and Credit Balance adjustment.
18. WHEN the Recruiter Demo Simulation runs, THE Recruiter Demo Simulation SHALL verify Demo Account creation and Demo Account reset.
19. WHEN the Recruiter Demo Simulation runs, THE Recruiter Demo Simulation SHALL verify Impersonation Session start, Impersonation Banner presence, Dangerous Impersonated Action denial, and safe return through the Return To Admin Control.
20. WHEN the Recruiter Demo Simulation runs, THE Recruiter Demo Simulation SHALL execute every preceding step in English left-to-right and Arabic right-to-left.
21. WHEN the Recruiter Demo Simulation runs, THE Recruiter Demo Simulation SHALL execute every preceding step at a desktop viewport and a mobile viewport without viewport-level horizontal overflow.
22. WHEN the Recruiter Demo Simulation runs, THE Recruiter Demo Simulation SHALL verify keyboard-only operation, visible focus order, programmatic labels, and WCAG 2.2 Level AA contrast for every exercised interface.
23. WHEN the Recruiter Demo Simulation runs, THE Recruiter Demo Simulation SHALL verify the absence of Unexpected Runtime Errors in browser-console output and server runtime output.
24. WHERE real provider credentials and real external infrastructure are configured, THE Recruiter Demo Simulation SHALL execute the corresponding Live Provider Check against the real provider.
25. IF real provider credentials or real external infrastructure are unavailable, THEN THE Recruiter Demo Simulation SHALL complete the deterministic and mocked contract checks, SHALL record the affected step as a Blocked Live Check naming the exact unavailable credential or infrastructure, and SHALL avoid claiming that the Live Provider Check passed.
26. WHEN the Recruiter Demo Simulation completes, THE Remediation Release SHALL record per-step outcomes, captured evidence artifacts, the commit hash, and the run timestamp for each Fresh Account Run and Existing Account Run.
27. IF any Recruiter Demo Simulation step fails, THEN THE Remediation Release SHALL record the Recruiter Demo Simulation as failed and THE Release Gate SHALL remain unsatisfied.

### Requirement 29: Final release conditions and honest completion reporting

**User Story:** As the product owner, I want completion defined by verified production behavior and an honest report, so that a completion claim is never stronger than the evidence behind it.

#### Acceptance Criteria

1. THE Final Release Conditions SHALL require recorded passing results for non-watch lint, TypeScript type checking, the full automated suite, and a production build.
2. THE Final Release Conditions SHALL require recorded passing fresh-database migration checks and existing-data migration checks on the SQLite and PostgreSQL persistence paths.
3. IF a migration check detects record loss, ownership loss, Owner-Scope reassignment, or irreversible transformation of existing data, THEN THE Remediation Release SHALL fail the Final Release Conditions.
4. THE Final Release Conditions SHALL require recorded passing authorization and tenant-isolation verification across Owner Scope, the Admin Role, Impersonation Sessions, and Guest Dossier access.
5. THE Final Release Conditions SHALL require zero unresolved `critical` and zero unresolved `high` Defect Severity items.
6. IF an unresolved `medium` Defect Severity item materially affects a Recruiter Demo Simulation step, THEN THE Remediation Release SHALL fail the Final Release Conditions until the item is resolved or a product-owner-approved Release Disclosure records the item.
7. THE Final Release Conditions SHALL require two consecutive passing Recruiter Demo Simulation runs covering both the Fresh Account Run and the Existing Account Run.
8. THE Final Release Conditions SHALL require that the exact commit verified by the Release Gate is the commit deployed to Vercel production.
9. IF the commit reported by the Vercel production deployment differs from the Release Gate verified commit, THEN THE Remediation Release SHALL fail the Final Release Conditions.
10. THE Final Release Conditions SHALL require recorded passing production smoke checks for health, authentication, analysis, external sharing, the Admin Console, English content, Arabic content, a desktop viewport, and a mobile viewport.
11. WHEN production smoke checks run, THE CodeProof Platform SHALL expose verifiable non-secret Build Metadata containing the release commit hash and build or release date.
12. IF the production Build Metadata is unavailable or does not match the Release Gate verified commit, THEN THE Remediation Release SHALL fail the Final Release Conditions and SHALL record the mismatch in the Release Disclosure.
13. IF observed production behavior diverges from the verified behavior of the tested commit, THEN THE Remediation Release SHALL fail the Final Release Conditions and SHALL record the divergence in the Release Disclosure.
14. WHEN the Remediation Release is presented for completion, THE Release Disclosure SHALL contain a final report stating per-requirement status, per-check outcomes, recorded evidence, known limitations, every Blocked Live Check, and the Demo-Readiness Verdict.
15. WHEN the Demo-Readiness Verdict is stated, THE Release Disclosure SHALL identify remaining risks and known limitations and SHALL avoid claiming perfection, defect-free status, or completeness beyond the recorded evidence.
16. IF any Final Release Condition is unmet, THEN THE Remediation Release SHALL withhold the completion claim until the condition is met or a product-owner-approved Release Disclosure records the unmet condition.
