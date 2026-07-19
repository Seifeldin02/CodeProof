# Active Tasks

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

Delivered:
- Thin Node/Express + SQLite backend (server/*), seeded from the demo generator
- Candidates list + detail (src/pages/CandidatesPage, CandidateDetailPage)
- Recruiter-facing Repository Analysis view (src/pages/RepositoryAnalysisPage)
- Insights persisted to the database (insights table) instead of ad-hoc text

Integration seam for Codex:
- repositories / repo_skills tables hold repository-analysis output
- Codex's GitHub ingestion + AI verification should write these rows,
  replacing the demo seed in server/db/repoSeed.ts

Do not modify:
- GitHub ingestion internals
- AI repository pipeline
