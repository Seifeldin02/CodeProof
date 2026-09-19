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
   - **Sample Candidate B** (Backend Engineer, `chalk/chalk`, `isDemo: true`) → tier **Review**,
     carrying one unreadable portfolio source so the "unknown, not negative" panel is populated
4. **Portfolio reachable** — the sample CV points at
   `raw.githubusercontent.com/Seifeldin02/CodeProof/development/docs/demo/portfolio.html`,
   a synthetic sample page in this repository. It needs network access, and edits to it
   take up to 5 minutes to clear GitHub's CDN.
5. **Evidence checks cleared** — the `/review` header must read `EVIDENCE CHECKED BY YOU: 0`.
6. **Warm the cache** — run the take once end to end and delete the candidate afterwards.
   A warm analysis of `sindresorhus/is` + `p-limit` returns in **~1.5 s**; cold it downloads
   both archives.

Reset between takes: open the candidate you created, **Delete candidate**. Requirements and
Sample Candidate B stay untouched.

## The 60-second click path

| Time | Click | What is on screen |
| --- | --- | --- |
| 0:00–0:06 | Start on `/review` | Queue with one candidate; the rules panel is visible |
| 0:06–0:12 | **Analyze Candidate** in the sidebar | Step 1 of 2, CV intake |
| 0:11–0:16 | **Use sample candidate** | Step 2 of 2; `sindresorhus/is` auto-detected, **Demo candidate** badge, **Portfolio and other sources detected** |
| 0:16–0:24 | **Scan for projects** | "Found 3 public repositories — added below for you to confirm." Two were never on the CV. Claims listed as claims |
| 0:24–0:28 | Tick **sindresorhus/p-limit** | A portfolio-only project becomes selectable evidence |
| 0:28–0:32 | **Build candidate evidence report** | ~1.5 s, lands on the dossier, 2 repositories |
| 0:32–0:44 | Scroll to **Requirement evaluation** | TypeScript strong + cited files, GitHub Actions partial, PostgreSQL weak point |
| 0:44–0:50 | Scroll to **Repository-specific interview** | Questions naming real symbols (`nanCheck`, `SymbolConstructor`) |
| 0:50–0:58 | Sidebar → **Review Queue** | Demo Candidate **#1 Review first**, Sample Candidate B **#2 Review** |
| 0:58–1:00 | Point at **Mark evidence as checked** | Human-in-the-loop; do not click |

## Spoken script (~150 words, comfortable at 60 s)

> "A technical recruiter can't open every applicant's GitHub and read it properly.
>
> So CodeProof does it. I drop in a CV — it pulls out the candidate's public project and
> downloads the source. No code is ever executed.
>
> It also found her portfolio. One click, and CodeProof reads that page — three projects, two of which were never on the CV. What the page *says* about her stays a claim. What it *links to* becomes evidence.
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
PDF (source text alongside it) that parses correctly, discovers `sindresorhus/is`, and also
carries a portfolio link, a GitLab link and a LinkedIn link — so it exercises source detection
including the social links that are correctly ignored.

Use it when you want to show the real file-upload gesture instead of the one-click sample.
**Caveat:** the upload path creates a record with `isDemo: false`, so it is counted as a real
candidate in Hiring Insights. If you use it, either rename the candidate to carry `DEMO` on
step 2, or keep Hiring Insights out of the recording. The one-click sample has no such caveat,
which is why it is the default above.

## Honesty guardrails for the script

- Do **not** claim an accuracy percentage. There is no eval harness yet, so "right about 80% of the time" is a guess from the worksheet, not a measurement.
- Do **not** say a portfolio is *analysed as evidence*. It is fetched and read for the
  repositories it links; the page's own prose becomes candidate claims pending verification.
- Do **not** say "a hundred a week" as though measured. Intake is one candidate at a time today.

## Do not show

- **Hiring Insights** with only demo records — it correctly renders a "Synthetic demo view"
  warning, which reads as a caveat on camera.
- A cold first analysis — the archive download makes the pause look like a hang.
