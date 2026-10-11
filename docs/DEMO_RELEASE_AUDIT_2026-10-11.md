# Demo release audit — 11 October 2026

## What changed today

The release branch `deploy/demo-2026-10-12` integrates both actual Claude branches, without modifying main or discarding the original local worktree:

- `claude/mena-evidence-first`, tip `5ffd2df`, timestamp 11 October 2026, 05:17 Arabia time: evidence profiles instead of a person score, review queue, CV-only intake, candidate evidence requests, consent, confidential-work alternative, bilingual candidate pages, batch CV coverage and measured trust disclosures.
- `claude/accounts-teams-admin`, tip `b2679a3`, timestamp 11 October 2026, 21:13 Arabia time: accounts/onboarding, organisations, invitations, seats, owner administration and optional sign-in providers.

Integration corrections: preserve canonical contribution-verification gates; record CV-only candidates at screening without fabricated code-review events; distinguish inspected code from verified candidate contributions; warn in comparison; keep assessment decisions human; prevent decorative layers intercepting mobile taps; prevent pre-hydration file selections being lost; handle brief local SQLite write contention; patch production dependencies; expose a non-secret build commit in `/api/health`. Live testing also found missing PDF native/worker assets in the serverless package; explicit route-scoped tracing and a post-build asset regression check address this runtime blocker. The original interview-workspace WIP remains separate and uncommitted, not silently included or overwritten.

The optional contribution-verification API now requires the authenticated GitHub identity to match an account confirmed in that candidate's scoped evidence response. An ambient operator token cannot establish an unrelated candidate's authorship. Without this binding, proof remains incomplete and deterministic repository inspection still works.

## Recent market evidence, not invented validation

- **Recruiter verification burden:** [Robert Half, published 10 March 2026](https://press.roberthalf.com/2026-03-10-Robert-Half-survey-67-of-HR-leaders-report-AI-generated-applications-are-slowing-hiring) reports 67% of US HR leaders saying AI applications slow hiring and 65% of hiring managers finding skill verification harder. Survey fieldwork was November 2025, with over 2,000 US hiring managers. This supports a problem hypothesis, not CodeProof purchase intent or GCC prevalence.
- **Candidate trust and human oversight:** [Morgan McKinley, Q3 2026 research](https://www.morganmckinley.com/uk/resource/our-2026-global-ai-report-8-key-workplace-ai-trends) surveyed 2,106 people, including 144 employers, in seven markets outside MENA. Only 5% of candidates trusted AI-only recruitment decisions; 44% supported AI paired with human decision-making. Small employer subsamples and vendor sponsorship limit generalisation.
- **Transparency matters on both sides:** [Greenhouse, 24 February 2026](https://www.greenhouse.com/guidance/the-2026-ai-in-hiring-report) describes verification and opaque-screening concerns among 1,200 US jobseekers, 219 recruiters and 446 hiring managers. It is a vendor report, not an independent CodeProof trial.
- **Competition is substantial:** [HackerRank's July 2026 release](https://support.hackerrank.com/articles/8142080826-july-2026-release-notes?lang=en) already includes repository-based work simulations, AI-fluency evaluation, must-have requirements, reports and ATS integrations. Interview questions, AI analysis and dashboards alone are not a defensible differentiator.
- **Regional limitation:** [Hays GCC's 2026 guide](https://www.hays.ae/salary-guide) is current regional context, but its public landing page does not establish demand for repository-evidence screening. No buyer interviews, willingness-to-pay results, MENA coverage percentages or measured time savings were obtained here. Do not present the repository's earlier numerical hypotheses as research findings.

**Inference:** a narrower plausible offering is the recruiter-to-engineer verification handoff: collect candidate-authorised evidence, distinguish claims/inspected code/contribution proof, preserve confidential-work alternatives, and record what a human actually checked. Arabic/RTL and a zero-paid-provider path make it accessible for a regional pilot; they do not by themselves prove a moat or demand.

## Recording narrative

1. Upload a CV PDF; confirm the exact projects. Explain that code is read, never executed.
2. Open an actual file-backed report. Separate repository implementation from candidate authorship; do not claim account ownership proves contribution.
3. Show the review queue and human evidence-check action. Export the next-step list; no automatic rejection or assessment waiver.
4. Show a CV-only/private-work candidate. Create an expiring, revocable request; the candidate sees a plain-language notice and can declare confidentiality without a negative score.
5. Switch English/Arabic and demonstrate a phone layout. Show team roles and the owner console only from a locally verified owner account unless production owner access has been configured.

Synthetic candidates must remain labelled; analysis of a public project is not proof that a synthetic candidate wrote it. Copy-link functionality is not automatic email delivery.

## Prioritised workflow/UI audit

| Priority | Finding | Consequence / next action |
| --- | --- | --- |
| P0 — recording | Authorship and missing-code states previously contradicted each other; decorative art blocked the mobile analysis CTA | Corrected with regression coverage. Keep the verification limitation visible in the recording. |
| P0 — recording | Email/SMS/Google depend on external credentials; production owner access needs a deliberate bootstrap account | Use the existing password path and manual link delivery. Never imply provider delivery or owner access was verified if it was not. |
| P1 — product | Requirements remain one mutable account-level list, not a versioned requisition per candidate | Multiple jobs can change the comparison basis. Introduce requisition IDs, immutable evaluation versions and recruiter/engineer decisions before pitching a reliable multi-role hiring workspace. |
| P1 — product | Private-work candidates have a confidential declaration but no in-app work-sample assessment | Provide a bounded, candidate-consented work-sample/interview handoff rather than penalising lack of public GitHub. |
| P1 — product | Export/share is an authenticated print/report screen, not secure external dossier-token sharing | Add separately scoped read-only shares with expiry, revocation, redaction and access audit. Candidate evidence-request tokens do not implement dossier sharing. |
| P1 — product | AI provider adapter exists, but production usage budgets/cost telemetry and billing are not established by this release | Do not sell unlimited AI. Enforce tenant budgets, entitlement checks and measured costs before enabling paid production usage. Seats alone are not comprehensive tier enforcement. |
| P1 — trust | Small repository benchmarks and deterministic detection are not validated hiring predictions. Observed: `sindresorhus/p-limit/benchmark.js` simulates SQL queries, but the legacy pattern panel labels it database integration | Separate benchmark/test/example signals from production implementation before claiming capability. Measure false positives/negatives and recruiter task time against manual review; obtain consent and actual pilot buyers. No hiring-outcome guarantees. This semantic defect remains an audit finding, not a claimed fix. |
| P2 — UX | Seven mobile navigation items truncate, dense dossiers demand substantial scrolling, GitHub gist proof is technical | Simplify the primary recruiter actions; progressively reveal engineering detail; explain proof in plain language. Preserve RTL and technical LTR tokens. |
| P2 — operations | Public-answer limits are instance-local; retention/deletion, impersonation workflow, distributed abuse protection and production admin setup remain incomplete | Treat this as a bounded demo/pilot, not enterprise readiness. Guard denial is not a complete impersonation feature. |

## Verification scope and limits

Automated coverage includes unit/property tests, migration tests and browser workflows across desktop English/Arabic, tablet, mobile English/Arabic and a 320px phone. Browser fixtures exercise PDF extraction, real public archive analysis, dossier/project review, comparison, CSV export, private candidate consent, one-use/revoked links, account editing, invitations, seat limits, team read-only visibility, cross-owner mutation denial, and local owner suspension/reactivation with audit entries. Candidate fixtures are deleted after checks; local QA accounts/organisations live only in the isolated test database.

The migration suite tests fresh/existing SQLite and PostgreSQL-compatible migration logic. Its live PostgreSQL test does not run without a usable `DATABASE_URL`/`POSTGRES_URL`; a passing suite must not be described as a successful fresh live PostgreSQL migration. Existing production PostgreSQL is exercised separately during production smoke testing, not by destructive reset.

Production dependency audit reports zero vulnerabilities after the patch. The complete dependency audit still reports seven high and two moderate development-tool advisories (including the currently unpatched braces chain). Consequently the existing full `verify:release` audit threshold is not green; do not claim the entire release gate is clean. No forced Tailwind major migration or unreviewed audit fix was performed immediately before demo day.

Production identity must be confirmed by comparing `/api/health.buildCommit` with the pushed branch tip. A build success or deployment URL alone is not proof that production workflows work. Provider delivery, paid AI behaviour and production owner/admin access must be reported as unverified unless separately exercised.

## Confirmed release verification

On 11 October 2026, application commit `2af428e` passed lint, typecheck, 374 unit/property tests, 13 migration tests, all 24 local browser workflows and a production build with PDF runtime tracing checks. The final application code passed two consecutive `verify:ci` runs. The production dependency audit remained clear; the development-tool audit limitation above is unchanged.

The existing Vercel project reported `READY` and aliased `https://codeproof-teal.vercel.app/`. Its public health response confirmed the exact application commit, engine `3.2.1`, configured sessions and durable PostgreSQL. Live browser checks exercised password registration/onboarding, PDF discovery, real public archive analysis, dossiers/project review, comparison, review checks, CSV download and persisted language switching. Twelve recruiter routes were checked at desktop English/Arabic and mobile English/Arabic widths, including RTL and viewport overflow. Production consent, one-use/revoked requests, ordinary-user admin denial, team invitations/seat limits, last-admin protection, read-only team visibility and cross-owner mutation denial also passed.

The local test runner had intermittent DNS failures; its public hostname was resolved through the OS and pinned only within that test process, preserving HTTPS hostname/certificate checks. A five-second navigation assertion was extended for production latency. Neither workaround changes the application or its protection rules.

Four temporary production candidates were deleted, and QA team memberships were removed. Five synthetic QA accounts and one empty synthetic organisation remain because no production-owner deletion authority was assumed. No real user accounts, privileges or candidates were modified. Owner-console mutations were tested only in the explicitly isolated local database. This final record changes documentation only; the deployed application source is the same verified source.
