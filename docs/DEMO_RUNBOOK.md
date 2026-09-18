# 60-second demo runbook

Everything here is real analysis of real public repositories. Nothing is fabricated.
Synthetic *candidates* are flagged `isDemo` and render a visible **Demo** badge, as
[`HARD_REQUIREMENTS.md`](HARD_REQUIREMENTS.md) §5 requires.

## The story in one line

A recruiter does not get an AI score. CodeProof reads the candidate's real code against
the role, drafts who to open first, shows the exact files behind every line of that
recommendation and what is still missing, and leaves the recruiter deciding.

## Pre-recording state (set this up once, before you hit record)

1. **Account** — sign in as the demo recruiter.
   - `demo@codeproof.local` / `CodeProofDemo2026!`
   - Synthetic test credentials created for this demo. Not a real person's account.
     Recreate on any environment with: *Create account* on the landing page.
2. **Company requirements** — `/requirements` must hold exactly these three.
   They are chosen because they resolve honestly against the demo repositories:
   | Requirement | Importance | Resolves to |
   | --- | --- | --- |
   | `TypeScript` | required | Strong for `sindresorhus/is`, Partial for `chalk/chalk` |
   | `GitHub Actions` | required | Partial for both |
   | `PostgreSQL` | preferred | No repository evidence — a genuine, visible gap |
3. **Queue population** — exactly one candidate already analysed:
   - **Sample Candidate B** (Backend Engineer, `chalk/chalk`, `isDemo: true`) → tier **Review**
4. **Evidence checks cleared** — the `/review` header must read `EVIDENCE CHECKED BY YOU: 0`.
5. **Warm the cache** — run the take once end to end and delete the candidate afterwards.
   A warm analysis returns in **~0.8 s**; a cold one downloads the archive and takes ~15 s.

Reset between takes: open the candidate you created, **Delete candidate**. Requirements and
Sample Candidate B stay untouched.

## The 60-second click path

| Time | Click | What is on screen |
| --- | --- | --- |
| 0:00–0:06 | Start on `/review` | Queue with one candidate; the rules panel is visible |
| 0:06–0:12 | **Analyze Candidate** in the sidebar | Step 1 of 2, CV intake |
| 0:12–0:18 | **Use sample candidate** | Step 2 of 2; `sindresorhus/is` auto-detected, **Demo candidate** badge |
| 0:18–0:24 | **Build candidate evidence report** | ~1 s, lands on the dossier |
| 0:24–0:38 | Scroll to **Requirement evaluation** | TypeScript strong + 3 cited files, GitHub Actions partial, PostgreSQL weak point |
| 0:38–0:46 | Scroll to **Evidence gaps** and **Repository-specific interview** | Gaps framed as probes; questions naming real symbols (`nanCheck`, `SymbolConstructor`) |
| 0:46–0:56 | Sidebar → **Review Queue** | Demo Candidate is now **#1 Review first**, Sample Candidate B **#2 Review** |
| 0:56–1:00 | Hover **Mark evidence as checked** | The human-in-the-loop step; do not dwell |

## Spoken script (~150 words, comfortable at 60 s)

> "A recruiter screening a hundred applicants a week can't open everyone's GitHub.
>
> So CodeProof does it. I drop in a CV — it pulls out the candidate's public project and
> downloads the source. No code is ever executed.
>
> Now look at what comes back. This isn't a score. Against *our* saved requirements:
> TypeScript — strong, and here are the three files that prove it. GitHub Actions — partial,
> one workflow file. PostgreSQL — nothing in this repository, and it says so plainly:
> that's a gap to ask about, not proof they can't do it.
>
> These interview questions name real symbols from their actual code.
>
> And here's the payoff — the review queue. Who to open first, drafted from that evidence,
> with the rules written out and no hidden score. Missing evidence never pushes anyone down.
>
> CodeProof tells you where to look. You still decide."

## Alternative input: real PDF upload

[`demo/sample-cv-amina-hassan.pdf`](demo/sample-cv-amina-hassan.pdf) is a genuine text-based
PDF (source text alongside it) that parses correctly and discovers `sindresorhus/is`.

Use it when you want to show the real file-upload gesture instead of the one-click sample.
**Caveat:** the upload path creates a record with `isDemo: false`, so it is counted as a real
candidate in Hiring Insights. If you use it, either rename the candidate to carry `DEMO` on
step 2, or keep Hiring Insights out of the recording. The one-click sample has no such caveat,
which is why it is the default above.

## Do not show

- **Hiring Insights** with only demo records — it correctly renders a "Synthetic demo view"
  warning, which reads as a caveat on camera.
- A cold first analysis — the archive download makes the pause look like a hang.
