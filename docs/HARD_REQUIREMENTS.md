# CodeProof Hard Requirements

This file is the authoritative, non-optional product contract for CodeProof. Every contributor and AI agent, including Codex and Claude, must read it before starting any task. A change is incomplete if it violates any requirement below.

## 1. English and Arabic

- Every recruiter-facing route and state must be available in English and Arabic.
- Navigation, forms, dashboards, reports, errors, empty/loading states, tooltips, analysis views, export views, and explanatory copy must be translated.
- Language preference must persist across sessions.
- Arabic must set the application to right-to-left direction globally.
- Directional layout and icons must mirror where appropriate.
- Source paths, repository names, GitHub URLs, commands, code, technology names, and other technical tokens must remain left-to-right and copy safely in either language.

## 2. Full mobile responsiveness

- The recruiter journey must work at phone, tablet, and desktop widths: CV upload, GitHub discovery, repository confirmation, analysis, report review, candidate comparison, dashboard, and Hiring Insights.
- Pages must not create viewport-level horizontal overflow.
- Tables, charts, cards, navigation, dialogs, and report sections must have intentional responsive behavior.
- Controls must be touch-friendly and keyboard accessible.
- English LTR and Arabic RTL must both be tested at mobile breakpoints.

## 3. Public working Replit deployment

- The repository must keep a Replit-compatible install, build, run, and health-check path.
- A public deployment is only considered complete after its live URL and core workflow have been verified. Configuration alone is not a deployed demo.
- Ephemeral filesystem limitations must remain documented until a durable production store is configured.

## 4. Zero-paid-API core demo

- The core recruiter workflow must work without `GITHUB_TOKEN`, `OPENAI_API_KEY`, or any paid API.
- Public repositories must use bounded archive ingestion and repository code must never be executed.
- Optional providers must remain optional, server-side, and unable to break the deterministic fallback.

## 5. Recruiter-first workflow

- The primary path is: upload CV PDF, extract GitHub links, confirm projects, analyze repositories, review candidate evidence, compare/evaluate, and inspect Hiring Insights.
- A profile-only CV must lead to clear manual repository selection instead of failure.
- Synthetic sample data is fallback-only and must always be visibly labeled.

## 6. Real evidence only

- Never fabricate repository claims, source files, implementation details, percentages, scores, or hiring outcomes.
- Engineering claims and interview prompts must retain exact source-file grounding.
- Missing signals must be described as evidence gaps, not proof that a candidate lacks a skill.
- Demo analytics must be explicitly separated from real candidate-derived metrics.

## 7. Visual polish and professional branding

- CodeProof must feel like one premium, credible recruiter product across all routes.
- Prioritize evidence hierarchy, recruiter clarity, technical credibility, restrained motion, responsive performance, and consistent brand language.
- Avoid generic AI decoration, clutter, fake functionality, excessive gradients, and meaningless scores.

## 8. Accessibility basics

- Use semantic controls and headings, visible focus states, sufficient contrast, descriptive labels, and useful empty/error/loading states.
- All primary interactions must work by keyboard.
- Motion must respect `prefers-reduced-motion`.
- Language and text direction must be exposed on the root document.

## Completion gate

Before merging a task, run lint, typecheck, tests, production build, and relevant browser checks. For UI work, verify desktop English, desktop Arabic RTL, mobile English, and mobile Arabic RTL. Do not remove or weaken these requirements without explicit product-owner approval.
