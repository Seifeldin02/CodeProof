# CodeProof

CodeProof is an evidence-based developer hiring intelligence platform. It inspects a public GitHub repository selectively, detects factual engineering signals, and builds a reviewable evidence dossier for recruiters and technical interviewers.

## What is implemented

- Strict public GitHub repository URL parsing, metadata, commit, recursive tree, and language ingestion
- Bounded smart file selection that prioritizes manifests, entry points, APIs, services, auth, schemas, tests, and infrastructure
- Deterministic language, framework, library, database, ORM, testing, state, build, and infrastructure detection
- Project-type inference without fabricated confidence percentages
- Optional server-side OpenAI analysis and AI-assisted résumé/job extraction through strict Zod structured outputs
- File-path grounding that removes invented references and caps unsupported AI evidence levels
- Pasted-text and server-parsed PDF résumé verification with explicit evidence limitations
- Repository-specific interview questions and evidence-gap reporting
- Streamed backend stages consumed by the frontend without simulated progress
- Versioned persistent caching keyed by repository commit, context hash, provider profile, and engine version
- Postgres persistence in production with an atomic filesystem fallback for local development
- Structured, content-safe observability events for GitHub, deterministic, AI, cache, and duration stages

## Requirements

- Node.js 22.3 or newer
- npm 10 or newer

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `GITHUB_TOKEN` | No | Raises GitHub API rate limits for public repository metadata and trees. Never exposed to the browser. |
| `OPENAI_API_KEY` | No | Enables AI architecture, skill-evidence, gap, and interview interpretation. Without it, deterministic evidence is returned. |
| `OPENAI_MODEL` | No | Overrides the provider model. Defaults to `gpt-5.6-luna`. |
| `DATABASE_URL` | Production caching | PostgreSQL connection used for durable, versioned analysis caching. The cache table is created automatically. |
| `CODEPROOF_CACHE_DIR` | No | Local file-cache location when `DATABASE_URL` is absent. Defaults to `.data/analysis-cache`. |

On Windows PowerShell, replace the copy command with `Copy-Item .env.example .env.local`.

No manual migration is required. When `DATABASE_URL` is configured, CodeProof creates `codeproof_analysis_cache` with `CREATE TABLE IF NOT EXISTS` on first cache access.

## Verification

```bash
npm run verify
npm audit
```

Individual commands are available as `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.

## Architecture

- `src/services/github`: GitHub API isolation, errors, and source-file selection
- `src/features/repository-analysis`: deterministic analysis, defensible evidence scoring, orchestration, versioning, and cache providers
- `src/services/ai`: provider contract, OpenAI implementation, structured schema, and grounding filter
- `src/features/resume-matching`: pasted/PDF extraction, claim extraction, and evidence comparison
- `src/features/job-matching`: transparent requirement-by-requirement matching
- `src/services/observability`: structured logs without source, résumé, job, or secret contents
- `src/app/api/analyze`: server-only streamed analysis endpoint
- `src/types/analysis.ts`: stable result contract shared by backend and frontend

## Security and evidence boundaries

- Repository code is fetched as untrusted text and is never executed.
- Only `https://github.com/owner/repository` URLs are accepted.
- File counts, individual file sizes, total selected bytes, and AI prompt text are bounded.
- Generated files, dependencies, binaries, lockfile contents, and build outputs are excluded.
- AI prompts explicitly treat repository content as data, not instructions.
- Repository files are JSON-quoted as `UNTRUSTED_REPOSITORY_DATA`; comments and README instructions have no authority.
- AI output is runtime-validated, file references are filtered against the exact selected-file allowlist, and unsupported evidence strength is reduced or discarded.
- PDFs are parsed server-side only, limited to 5 MB, checked by MIME type, extension, and file signature, and never persisted as files.
- PDF JavaScript evaluation, remote worker fetching, and font rendering are disabled during text extraction.
- Logs contain identifiers, counts, durations, provider/model names, and error types only. They do not contain source files, résumé/job text, or API keys.
- A missing repository signal does not prove that a candidate lacks a claimed skill.

## Evidence levels

CodeProof never treats a package dependency or a single configuration file as strong evidence.

| Level | Grounding rule |
| --- | --- |
| Strong Evidence | Meaningful implementation across at least three files and multiple areas, plus tests or multiple architectural boundaries. |
| Good Evidence | At least two meaningful implementation files or repeated non-trivial use across modules. |
| Partial Evidence | One meaningful implementation example or narrow test-backed usage. |
| Limited Evidence | Manifest, dependency, configuration, documentation, or trivial usage signals only. |
| Insufficient Evidence | No grounded implementation evidence remains after validation. |

AI may select a lower level, but it cannot exceed the deterministic maximum derived from the selected files.

## Replit import and deployment

1. Push or import the `codex/core-intelligence-engine` branch from GitHub into a new Replit App.
2. Confirm Replit uses Node.js 22 or newer and run `npm ci` if dependencies are not installed automatically.
3. Open Secrets and add `GITHUB_TOKEN`, `OPENAI_API_KEY`, and optionally `OPENAI_MODEL`.
4. Add a Replit PostgreSQL database. Replit supplies `DATABASE_URL`; no manual schema command is needed.
5. Select Run. The checked-in `.replit` configuration starts preview with `npm run dev -- --hostname 0.0.0.0`.
6. Verify the Preview URL, then choose an Autoscale or Reserved VM deployment. Do not choose Static because CodeProof has server API routes.
7. Use build command `npm ci && npm run build` and run command `npm start -- --hostname 0.0.0.0`.
8. Add the same GitHub/OpenAI secrets and the production database to the Publishing configuration before publishing.

Replit published filesystems are not persistent. `DATABASE_URL` is therefore required if analysis cache entries must survive deployment restarts or republishing. The file cache is intended for local development only.

## Current limitations

- Public repositories only; private GitHub authentication is intentionally not implemented.
- GitHub may truncate exceptionally large recursive trees; the result reports this explicitly.
- Deterministic mode establishes repository signals but does not claim the same implementation-depth review as configured AI analysis.
- AI-assisted extraction is more complete than the deterministic keyword fallback, but both report only claims visible in the provided text.
- PDF OCR is not included. Image-only/scanned PDFs must be supplied as pasted text.
- Cached results include extracted candidate claims and job requirements, but never the raw uploaded PDF or full input text. Configure production data retention accordingly.
