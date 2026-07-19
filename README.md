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

The recruiter workspace includes a persistent English/Arabic switch, global RTL behavior, responsive phone/tablet layouts, and a printable/shareable candidate report. The permanent product contract is documented in [`docs/HARD_REQUIREMENTS.md`](docs/HARD_REQUIREMENTS.md).

## Safety boundaries

- Repository code is downloaded as an untrusted ZIP archive and is never executed.
- Only public `https://github.com/owner/repository` URLs are accepted.
- Archive download is capped at 20 MB, declared expansion at 80 MB, and the tree at 5,000 files.
- Generated output, dependencies, binaries, lockfile contents, and oversized files are excluded.
- At most 32 bounded text files and 600 KB of selected evidence are inspected.
- PDF input is capped at 5 MB, parsed server-side, and never written as an uploaded file.
- A dependency or config-only signal cannot become Good or Strong Evidence.
- Every implementation claim and interview prompt retains exact source-file references.
- Missing evidence is reported as a gap, never as proof that a candidate lacks a skill.

## Evidence method

| Level | Rule |
| --- | --- |
| Strong Evidence | Meaningful implementation across at least three files and multiple areas, plus tests or multiple architectural boundaries. |
| Good Evidence | At least two meaningful implementation files or repeated non-trivial use across modules. |
| Partial Evidence | One meaningful implementation example or narrow test-backed use. |
| Limited Evidence | Manifest, dependency, configuration, documentation, or trivial usage only. |
| Insufficient Evidence | No grounded implementation evidence remains. |

Candidate evidence indices use the visible weighting Strong=4, Good=3, Partial=2, Limited=1, Insufficient=0. They are not AI confidence scores.

## Run locally

Requirements: Node.js 22.5 or newer and npm 10 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. No environment file is required.

Optional configuration is documented in `.env.example`:

- `OPENAI_API_KEY` and `OPENAI_MODEL` enable the optional grounded AI provider.
- `DATABASE_URL` enables PostgreSQL analysis caching.
- `CODEPROOF_CACHE_DIR` changes the local analysis-cache directory.
- `CODEPROOF_DB_PATH` changes the local SQLite candidate-database path.

## Verification

```bash
npm run verify
npm audit
```

## Replit

1. Import the `development` branch.
2. Confirm Node.js 22.5 or newer and run `npm ci`.
3. Do not add secrets for the free core demo.
4. Run preview with `npm run dev -- --hostname 0.0.0.0`.
5. Use an Autoscale or Reserved VM deployment because CodeProof has server routes.
6. Build with `npm ci && npm run build`.
7. Run with `npm start -- --hostname 0.0.0.0`.
8. Configure the deployment health check to request `/api/health`; a healthy instance returns `status: "ok"` and `paidApisRequired: false`.

Replit's published filesystem is not durable. SQLite candidate records and filesystem cache entries work during a live demo session but reset after deployment restarts or republishing. A durable candidate-store adapter remains a production follow-up.

The checked-in Replit configuration is deployment-ready, but a public demo is not claimed until its live URL has been exercised through the full recruiter flow.

## Architecture

- `src/services/github`: bounded public-archive download, ZIP safety validation, and file selection.
- `src/features/repository-analysis`: static analysis, evidence scoring, patterns, strengths, complexity, caching, and orchestration.
- `src/features/resume-matching`: PDF parsing, GitHub discovery, deterministic claim extraction, and evidence comparison.
- `src/features/candidates`: SQLite candidate persistence and transparent evidence-index calculation.
- `src/features/hiring-analytics`: Claude's explainable recruiter pipeline and hiring metrics.
- `src/services/ai`: optional provider interface, strict schemas, injection boundaries, and evidence grounding.
- `src/app`: the single Next.js recruiter application and server API.

## Current limitations

- Public GitHub repositories only.
- Source archives do not include stars, issue counts, private repositories, or profile repository listings.
- Profile-only CVs require manual public repository selection.
- Scanned/image-only PDFs require pasted text because OCR is not included.
- Archives beyond the safety limits are rejected instead of partially analyzed.
- SQLite is local and not durable on an ephemeral deployment filesystem.
