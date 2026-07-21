# Deploying CodeProof

Read this together with [`HARD_REQUIREMENTS.md`](HARD_REQUIREMENTS.md).

## Environment variables

| Variable | When | Purpose |
| --- | --- | --- |
| `CODEPROOF_SESSION_SECRET` | **Required in production** | Signs session cookies consistently across instances. |
| `DATABASE_URL` or `POSTGRES_URL` | **Required on Vercel and other ephemeral hosts** | Durable account-scoped users, candidates, requirements, and analysis cache. |
| `CODEPROOF_DB_PATH` | Optional local/container | Changes the SQLite file used when PostgreSQL is absent. Use only on a persistent volume in production. |
| `CODEPROOF_ALLOW_SIGNUP` | Optional | Registration is public by default. Set `false` only for a closed pilot. |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Optional | Enables the grounded AI provider. The deterministic core remains free. |

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Never commit secrets. Store them in the hosting platform's secret manager.

## Accounts and privacy boundary

Visitors land on sign-in/account creation before seeing recruiter features. All
candidate, report, requirement, and analytics queries are scoped by the signed-in
user ID. Hiring Insights is derived only from that account's candidate records.

Passwords use salted scrypt hashes. Sessions use signed Secure, HttpOnly,
SameSite cookies in production. State-changing endpoints reject cross-origin
browser requests, and private API responses are marked `no-store`.

## Vercel

1. Import the repository and select the `development` branch while testing.
2. Connect a PostgreSQL provider/integration. Expose `DATABASE_URL` or `POSTGRES_URL` to Production and Preview.
3. Set a random `CODEPROOF_SESSION_SECRET` in Production and Preview.
4. Build with `npm run build`; use the standard Next.js output.
5. Verify `/api/health`, registration, sign-in, candidate creation, sign-out, and sign-in again.

Do not point `CODEPROOF_DB_PATH` at `/tmp` on Vercel. Each function has isolated,
disposable filesystem state, which causes registrations and sessions to appear
to vanish between requests.

## Replit or a generic Node host

```bash
npm ci
npm run build
npm start -- --hostname 0.0.0.0 --port ${PORT:-3000}
```

Use Node.js 22.5 or newer and HTTPS. Replit's published filesystem is not
durable; configure PostgreSQL or treat SQLite data as disposable.

## Pre-launch checklist

- [ ] `CODEPROOF_SESSION_SECRET` is a random 32-byte value
- [ ] `DATABASE_URL` or `POSTGRES_URL` is configured on an ephemeral host
- [ ] HTTPS is enforced
- [ ] `npm run verify` passes
- [ ] `npm audit` is reviewed
- [ ] `/api/health` responds successfully
- [ ] Two test accounts cannot read or modify each other's candidate IDs
- [ ] Sign-out removes access to all recruiter routes and APIs

## Live verification

```bash
curl -s https://YOUR_URL/api/health
curl -s -o /dev/null -w '%{http_code}\n' https://YOUR_URL/api/candidates
```

The second request must return `401` without a session. Then test in a browser:
create an account, upload a CV, analyze a public repository, update the candidate
stage, confirm Hiring Insights changes, sign out, and sign back in.

## Remaining production considerations

- Retention periods and account-level data export/deletion should be reviewed against the applicable privacy policy before processing applicants at scale.
- Every account currently has recruiter permissions; team organizations and role-based access are not implemented.
- Authentication has a per-instance limiter. High-traffic production should add a shared edge rate limiter.
