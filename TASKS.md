# Active Tasks

## Permanent product contract

Every task is subject to `docs/HARD_REQUIREMENTS.md`. Codex and Claude must read it before work begins. A feature may not be marked complete if it breaks bilingual RTL, mobile responsiveness, the zero-paid-API workflow, exact evidence grounding, accessibility basics, or Replit readiness.

### CP-400 Kanz hard requirements
Status: BROWSER QA COMPLETE — awaiting Replit deployment access
Branch: development (QA pass on claude/four-mode-qa)

Required completion evidence:
- English and Arabic recruiter UI with persistent language preference
- Global RTL and isolated LTR technical content
- Desktop and mobile QA in both languages
- Responsive end-to-end recruiter workflow
- Professional employer-facing story and shareable candidate report
- Replit build/run/health path and a separately verified public URL
- Lint, typecheck, tests, and production build

Completed locally:
- Persistent English/Arabic UI, global RTL, and LTR technical-token isolation
- Responsive recruiter flow surfaces plus printable/shareable report and employer story
- Zero-paid PDF-to-public-repository analysis verified against `sindresorhus/is`
- Replit build/run configuration and `/api/health`
- Lint, typecheck, 45 tests, and production build

Four-mode browser QA (completed on claude/four-mode-qa):
- Executed across desktop 1280 and mobile 375 x English LTR and Arabic RTL, on
  `/`, `/analyze`, `/candidates`, `/candidates/[id]`, `/candidates/[id]/projects/[analysisId]`,
  `/candidates/[id]/share`, `/compare`, `/insights`, `/about`, in both empty and populated states
- Zero viewport-level horizontal overflow in all four modes
- `lang`/`dir` correct on the root document; RTL global; directional icons mirror
- One `h1` per route, no heading-level skips, `main`/`nav`/`banner` landmarks present
- Full recruiter workflow re-verified end-to-end with no paid API: sample CV ->
  GitHub discovery -> `sindresorhus/is` archive -> persisted candidate (`isDemo: true`)
- Method note: assertions are DOM/layout/accessibility measurements; the sandbox
  screenshot capture was unavailable, so pixel-level aesthetic review is not claimed

Defects found and fixed:
- CV paste textarea on `/analyze` had no accessible name (screen-reader gap on the
  primary entry point) — added translated `aria-label` (EN + AR)
- Candidate detail header links were 16 px tall on mobile, below touch-target
  guidance — now 44 px in both locales

Open release gates:
- Public Replit URL deployment and live workflow verification require deployment access

## Shared integration

### CP-300 Recruiter-first unified demo
Status: READY FOR REVIEW
Branch: development

Integrated:
- Codex repository intelligence and CV matching
- Claude candidate management and Hiring Insights
- One Next.js recruiter application and navigation
- Free public archive ingestion with no GitHub token
- CV-first project discovery and persisted candidate reports

## Codex

### CP-101 Core Intelligence Engine
Status: READY FOR REVIEW
Branch: codex/core-intelligence-engine

Files expected:
- src/services/github/*
- src/features/repository-analysis/*
- src/services/ai/*
- src/features/resume-matching/*
- src/features/job-matching/*
- src/app/api/analyze/*

Do not modify:
- hiring analytics
- candidate dashboard


## Claude

### CP-201 Hiring Insights Dashboard
Status: IN REVIEW (pushed on claude/hiring-insights)
Branch: claude/hiring-insights

Files expected:
- src/features/hiring-analytics/*
- src/components/analytics/*
- src/pages/HiringInsightsPage.tsx

Do not modify:
- GitHub ingestion
- AI repository pipeline


### CP-202 Candidate Management + Persistence
Status: IN REVIEW (pushed on claude/candidates-and-persistence)
Branch: claude/candidates-and-persistence (stacked on claude/hiring-insights)

Integrated into development:
- SQLite candidate persistence now runs inside the shared Next.js server
- Candidate list/detail and evidence reports are App Router pages
- Hiring Insights derives from real stored candidate records
- Automatic fake seeding was removed; the sample candidate is opt-in and labeled

Do not modify:
- GitHub ingestion internals
- AI repository pipeline
