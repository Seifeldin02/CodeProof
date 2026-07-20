# Deploying CodeProof

How to put CodeProof on a real URL, and what must be true before real candidate
CVs go through it.

Read this together with [`HARD_REQUIREMENTS.md`](HARD_REQUIREMENTS.md).

---

## 1. Environment variables

| Variable | When | Purpose |
| --- | --- | --- |
| `CODEPROOF_SESSION_SECRET` | **Required in production** | Signs session cookies. Without it each instance generates its own key, so sessions break across restarts and across multiple instances. |
| `CODEPROOF_DB_PATH` | **Required in production** | Points SQLite at a persistent volume. The default (`.data/codeproof.db`) is wiped on redeploy. |
| `CODEPROOF_PROTECT_ALL` | Required if storing **real** candidates | `true` also requires sign-in to read candidate records. Without it, stored dossiers are readable by anyone with the URL. |
| `CODEPROOF_ALLOW_SIGNUP` | Optional | `true` keeps registration open for teammates. Left unset, registration closes after the first account claims the workspace. |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Optional | Enables the optional grounded AI provider. The core flow works without it. |
| `DATABASE_URL` | Optional | PostgreSQL analysis cache. |

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Never commit these. Set them in your host's secret manager.

## 2. First run

The first visitor to `/signin` creates the owner account, then registration
closes automatically. **Claim that account yourself immediately after deploying**,
before sharing the URL — otherwise the first stranger to find it becomes the owner.

## 3. Deploy on Replit

1. Import the repository.
2. Confirm Node.js 22.5 or newer, then `npm ci`.
3. Add the environment variables above as Replit Secrets.
4. Use an **Autoscale** or **Reserved VM** deployment — CodeProof has server routes and cannot run as a static site.
5. Build: `npm ci && npm run build`
6. Run: `npm start -- --hostname 0.0.0.0`
7. Health check: `/api/health` — a healthy instance returns `status: "ok"` and `paidApisRequired: false`.

Replit's published filesystem is **not durable**: SQLite records and the
filesystem cache survive a live session but reset on restart or republish.
Point `CODEPROOF_DB_PATH` at a mounted persistent volume, or move to Postgres,
before treating any data as retained.

## 4. Deploy on a generic Node host

```bash
npm ci
npm run build
npm start -- --hostname 0.0.0.0 --port ${PORT:-3000}
```

Requirements: Node.js 22.5+, a writable persistent path for `CODEPROOF_DB_PATH`,
and TLS terminated in front of the app. Session cookies are marked `Secure` in
production, so **the app must be served over HTTPS or sign-in will not work**.

Vercel note: the serverless filesystem is ephemeral and read-only, so SQLite
will not persist there. Use a long-lived container host, or migrate the store to
Postgres first.

## 5. Pre-launch checklist

- [ ] `CODEPROOF_SESSION_SECRET` set to a random 32-byte value
- [ ] `CODEPROOF_DB_PATH` on persistent storage
- [ ] Owner account claimed before the URL is shared
- [ ] `CODEPROOF_PROTECT_ALL=true` if any real candidate data will be stored
- [ ] HTTPS enforced
- [ ] `npm run verify` passes
- [ ] `npm audit` reviewed
- [ ] `/api/health` wired to the platform health check

## 6. Verify after deploying

```bash
curl -s https://YOUR_URL/api/health           # {"status":"ok",...,"paidApisRequired":false}
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST https://YOUR_URL/api/cv/discover     # 401 before sign-in
```

Then in a browser: open `/analyze` signed out and confirm it redirects to
`/signin`; sign in; upload a CV; confirm the dossier is created and cites real
source files. A deployment is not "done" until that full path has run on the
live URL.

## 7. Known gaps before real production use

These are tracked honestly rather than hidden:

- **Durability.** SQLite on an ephemeral filesystem loses data on redeploy. Needs a Postgres-backed candidate store.
- **No candidate deletion.** Candidate records expose read routes only. Storing CV-derived data on real people without a delete path is a GDPR/right-to-erasure problem. Add delete + export before processing real applicants.
- **Single-role accounts.** Every account has identical access; there is no per-recruiter permission model and no audit trail of who viewed a dossier.
- **No rate limiting.** Uploading triggers outbound archive downloads. Authenticated abuse or a shared account can still generate load.
- **Content Security Policy.** Baseline HSTS, framing, MIME-sniffing, referrer, and permissions headers are configured; a strict CSP remains a production-hardening follow-up.

Suitable today for a **demo or internal pilot with the gate on**. Not yet
suitable for storing real applicant data at scale.
