# CodeProof Development Guidelines

CodeProof is an evidence-based developer hiring intelligence platform.

Core product concept:

A candidate's résumé says what they know.
Their actual code provides evidence of what they can build.

The platform combines:

1. GitHub repository analysis
2. AI-backed skill evidence verification
3. CV and job requirement matching
4. Personalized technical interview generation
5. Candidate management
6. Hiring funnel and recruitment analytics

## Development Rules

- Never work directly on main.
- Preserve existing working functionality.
- Do not perform large unrelated refactors.
- Do not redesign existing interfaces unless explicitly requested.
- Reuse existing components before creating duplicates.
- Keep TypeScript types explicit.
- Avoid `any` unless unavoidable.
- Keep feature logic modular.
- Never expose API keys client-side.
- Secrets must use environment variables.
- Do not fabricate AI results when real analysis is expected.
- Mock/demo data must be clearly separated from production analysis.
- Do not modify another developer's feature unless required for integration.
- Before changing shared types, navigation, routing, database schemas, or global state, inspect existing usage carefully.
- Run tests/type checks/build before completing a task.
- Fix errors caused by your changes.
- Do not silently remove functionality to fix errors.

## Feature Ownership

Codex primarily owns:
- GitHub ingestion
- Repository analysis
- AI pipeline
- Skill verification
- CV/job matching
- Interview generation
- Backend intelligence

Claude primarily owns:
- Candidate management
- Hiring analytics
- Hiring funnel
- Source analytics
- Recruiter dashboards
- Hiring Insights UI

Shared areas must be changed conservatively.

## Git Rules

Use small, focused commits.

Preferred commit format:

feat: ...
fix: ...
refactor: ...
ui: ...
docs: ...

Do not commit secrets, API keys, generated build files, or unnecessary dependencies.

## Product Design

CodeProof should feel like a premium professional developer/recruitment intelligence SaaS.

Avoid:
- generic AI aesthetics
- excessive gradients
- excessive glassmorphism
- clutter
- fake functionality
- meaningless scores
- decorative complexity

Prioritize:
- evidence
- clarity
- trustworthy data
- technical credibility
- recruiter usability