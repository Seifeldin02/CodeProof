# Verification suites

These tracked suite roots keep each non-watch verification command stable while remediation coverage is added incrementally:

- `integration/` — cross-module, route, provider, persistence, and log checks run by Vitest.
- `security/` — owner-scope, input-boundary, redaction, and authorization checks run by Vitest.
- `migrations/` — fresh and upgrade-path checks for the inline SQLite/PostgreSQL persistence paths run by Vitest.
- `e2e/` — core synthetic Playwright flows.
- `browser/` — responsive, locale, direction, accessibility, and Browser Matrix Playwright checks.
- `fixtures/` — synthetic-only inputs; production candidate data, credentials, and live share tokens are prohibited.
