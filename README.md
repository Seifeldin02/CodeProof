# CodeProof

CodeProof is an evidence-based developer hiring platform. A recruiter uploads a candidate CV, confirms detected public GitHub projects, and receives an auditable evidence dossier that becomes part of the candidate pipeline and hiring dashboard.

## Free core workflow

1. Upload a text-based CV PDF or paste CV text.
2. CodeProof extracts GitHub repository and profile links locally.
3. Confirm up to three public repositories or paste repository URLs manually.
4. CodeProof downloads bounded public source archives without GitHub REST or a token.
5. Static analysis produces languages, technologies, project type, architecture, implementation patterns, complexity indicators, strengths, gaps, file-backed skills, CV matching, and interview prompts.
6. The completed report is stored as a candidate record and feeds the recruiter dashboard and Hiring Insights.

The core flow needs no `GITHUB_TOKEN` and no `OPENAI_API_KEY`.

## What the recruiter does with the evidence

- **Review queue (`/review`).** A drafted order with its rules written out. Each candidate gets a drafted next step: interview on the evidence, review then decide, test or verify, or ask for evidence. Candidates whose code shows skills their CV never mentions are listed at the top. The order reads repository evidence only: CV wording and names never move anyone, and equal evidence is settled by who was added first. The order can be exported as a spreadsheet.
- **Candidate's own evidence.** A CV with no readable repository can still be saved, with no code read. The recruiter can send any candidate a private link (`/evidence/<token>`) where the candidate reads what will happen to what they share, agrees to it, lists public repositories or other links, says that their work is confidential, and can prove that a GitHub account is theirs by publishing a short code in a public gist. CodeProof sends no email: the recruiter copies the link and a ready message. The link opens in the language the recruiter chose for the candidate, Arabic or English, from the first page load.
- **CV coverage check (`/cv-coverage`).** Counts, for a batch of CVs, how many name code that can be read. Nothing is stored and no candidate is created.
- **Trust sheet (`/trust`).** A public page with the rules the product follows, what was measured about them and what was not. Its figures come from `npm run trust:measure`.

The recruiter workspace includes a persistent English/Arabic switch, global RTL behavior, responsive phone/tablet layouts, and a printable/shareable candidate report. The permanent product contract is documented in [`docs/HARD_REQUIREMENTS.md`](docs/HARD_REQUIREMENTS.md).

## Safety boundaries

- Repository code is downloaded as an untrusted ZIP archive and is never executed.
- Only public `https://github.com/owner/repository` URLs are accepted.
- Archive transport is capped at 96 MB and 25,000 raw ZIP entries. Generated/build paths are never decompressed and do not consume the stricter 80 MB / 5,000-file analyzable-source budgets.
- Generated output, dependencies, binaries, lockfile contents, and oversized files are excluded.
- At most 32 bounded text files and 600 KB of selected evidence are inspected.
- PDF input is capped at 5 MB, parsed server-side, and never written as an uploaded file.
- A dependency or config-only signal cannot become Good or Strong Evidence.
- Every implementation claim and interview prompt retains exact source-file references.
- Missing evidence is reported as a gap, never as proof that a candidate lacks a skill.
- Every candidate, report, company requirement, and hiring metric is private to the authenticated recruiter account that created it. Product routes and data APIs require sign-in.
- An evidence request link carries 256 random bits and is shown once. Only its digest is stored. It accepts one answer, expires after seven days, can be closed by the recruiter, and is replaced by a newer one. The answer endpoint is rate limited and answers every unusable link the same way.
- The account proof fetches one fixed host (`gist.githubusercontent.com`) with a path built from validated parts, refuses redirects and reads at most 64 KB. It shows control of an account, not who wrote each commit, and is labelled that way.
- Nothing a candidate sends or proves changes the review order. Only analysed code does.

## Evidence method

| Level | Rule |
| --- | --- |
| Strong Evidence | Meaningful implementation across at least three files and multiple areas, plus tests or multiple architectural boundaries. |
| Good Evidence | At least two meaningful implementation files or repeated non-trivial use across modules. |
| Partial Evidence | One meaningful implementation example or narrow test-backed use. |
| Limited Evidence | Manifest, dependency, configuration, documentation, or trivial usage only. |
| Insufficient Evidence | No grounded implementation evidence remains. |

CodeProof does not rate people. Wherever a screen summarises a candidate, it shows how many skills the analysed code supports at each level, and says so plainly when no code was read. No screen shows a single number for a person.

## Run locally

Requirements: Node.js 22.5 or newer and npm 10 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. No environment file is required.

Optional configuration is documented in `.env.example`:

- `OPENAI_API_KEY` and `OPENAI_MODEL` enable the optional grounded AI provider.
- `DATABASE_URL` (or Vercel's `POSTGRES_URL`) enables durable PostgreSQL accounts, candidates, requirements, and analysis caching. It is required on Vercel.
- `CODEPROOF_CACHE_DIR` changes the local analysis-cache directory.
- `CODEPROOF_DB_PATH` changes the local SQLite candidate-database path.
- `CODEPROOF_SESSION_SECRET` signs session cookies. Required in production.
- `CODEPROOF_ALLOW_SIGNUP=false` closes public registration for a private pilot. Registration is open by default.

## Accounts

The public landing page supports sign-in and account creation. Each recruiter
gets an isolated candidate workspace and account-derived Hiring Insights.
Passwords are hashed with scrypt and sessions use Secure, HttpOnly, signed
cookies. No third-party authentication service or paid API is required.

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for production setup.

## Verification

```bash
npm run verify
npm audit
```

`npm run trust:measure` repeats the measurement behind the trust sheet. It downloads a fixed set of public repositories, analyses each one five times with AI off, checks that every cited file exists in the archive, runs the manipulation checks and writes `src/features/trust/measurements.json`. It needs network access, so it is not part of `npm test`. Run it again whenever the engine version changes; until then the trust sheet says the figures are from an earlier engine.

## Replit

1. Import the `development` branch.
2. Confirm Node.js 22.5 or newer and run `npm ci`.
3. Do not add secrets for the free core demo.
4. Run preview with `npm run dev -- --hostname 0.0.0.0`.
5. Use an Autoscale or Reserved VM deployment because CodeProof has server routes.
6. Build with `npm ci && npm run build`.
7. Run with `npm start -- --hostname 0.0.0.0`.
8. Configure the deployment health check to request `/api/health`; a healthy instance returns `status: "ok"` and `paidApisRequired: false`.

Replit's published filesystem is not durable. Configure `DATABASE_URL` for durable accounts and recruiter data, or use SQLite only for a disposable local/demo session.

The checked-in Replit configuration is deployment-ready, but a public demo is not claimed until its live URL has been exercised through the full recruiter flow.

## Architecture

- `src/services/github`: bounded public-archive download, ZIP safety validation, and file selection.
- `src/features/repository-analysis`: static analysis, evidence scoring, patterns, strengths, complexity, caching, and orchestration.
- `src/features/resume-matching`: PDF parsing, GitHub discovery, deterministic claim extraction, and evidence comparison.
- `src/features/candidates`: account-scoped SQLite/PostgreSQL persistence and the evidence profile that screens show in place of a score.
- `src/features/hiring-analytics`: Claude's explainable recruiter pipeline and hiring metrics.
- `src/features/review-queue`: the drafted review order, its next steps and its wording.
- `src/features/evidence-requests`: private links for a candidate's own evidence, the account proof, and the claims noted from a CV.
- `src/features/cv-coverage`: the link census behind the CV coverage check.
- `src/features/trust`: the manipulation checks and the recorded trust measurement.
- `src/services/ai`: optional provider interface, strict schemas, injection boundaries, and evidence grounding.
- `src/app`: the single Next.js recruiter application and server API.

## Current limitations

- Public GitHub repositories only.
- Source archives do not include stars, issue counts, private repositories, or profile repository listings.
- A GitHub profile's repositories cannot be listed. For a profile-only CV, paste repository URLs or send the candidate an evidence request.
- Intake is one CV at a time. The coverage check reads a batch, but it only counts links.
- The account proof shows that a GitHub account is the candidate's. Nothing shows who wrote a particular file, because archives carry no history.
- Scanned/image-only PDFs require pasted text because OCR is not included.
- Archives beyond the safety limits are rejected instead of partially analyzed.
- SQLite is local-only; ephemeral deployments require `DATABASE_URL` or `POSTGRES_URL`.
