# Active Tasks

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
