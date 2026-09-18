# Product focus: the AI-shaped problem

This records the conclusions of the "AI-Shaped Problem" worksheet (hackathon Session 1) as
product rules, so that feature work keeps pointing at the task that scored highest and keeps
the two weaknesses the worksheet exposed from creeping back.

## The one-sentence problem

An in-house technical recruiter screening software-engineering applicants, and deciding who
deserves deeper technical review about 100 times a week, relies on CVs and ATS filters and,
when stronger evidence is needed, opens portfolio and public-repository links one candidate at
a time. That breaks because the evidence is scattered, needs technical judgment, and takes too
long to compare consistently across the pool.

The AI move is a **drafted review order for the applicant pool**, where every recommendation
is backed by source-linked evidence and missing evidence is clearly identified. Right about 80%
of the time, that lets the recruiter check the evidence, surface candidates whose CVs undersell
their work, and prepare a defensible shortlist with grounded interview questions, while
remaining the final decision-maker.

## Task split (Andrew Ng's method)

| # | Task inside the recruiter's job | Score /27 | Where it lives |
|---|---|---|---|
| 3 | Extract and map source-linked, role-relevant evidence from every CV, portfolio and public repository | **18** | Repository analysis, résumé verification (Codex) |
| 1 | Turn the job description and hiring-manager brief into a role-specific evidence rubric | 12 | Company requirements (`/requirements`) |
| 4 | Recommend who to review first, with source-linked rationale and explicit uncertainty | 12 | Review queue (`/review`) |
| 5 | Draft candidate-specific interview questions that verify ownership and uncertain claims | 12 | Interview generation (Codex) |
| 2 | Check administrative and legal eligibility | 9 | Out of scope: a form does this |

Task 3 is the core and stays the core. Tasks 1, 4 and 5 are the recruiter-facing layer built on
top of it. Task 2 is deliberately not built.

## The two tests that scored 2, and the rules that follow

**Test 3, inputs in hand (2/3).** Private code, deleted projects and proof of authorship are not
always available. Rule: a missing input is reported as *unknown* and never reduces a candidate.
The review queue treats unknown as zero, the same as "nothing found", never as a penalty, and
labels each unknown input on the candidate ("No CV text provided, so claim verification is
unknown"). See `src/features/review-queue/queue.ts`.

**Test 4, cost of being wrong (2/3).** The recruiter sees the draft before any candidate does,
and nothing is auto-rejected, but a rushed recruiter could accept a recommendation without
opening the cited files. Rule: the order is explicitly a draft, every entry names its cited
files, and the recruiter records an "evidence checked" mark per candidate. The mark is cleared
automatically when new repository evidence lands, so a stale check never covers unseen files.

## Anti-pattern to watch: motivation

The worksheet flagged *motivation* (trust and habit, not lack of output) as the most likely way
this product could be pointed at the wrong problem. A recruiter who does not trust the tool
falls back to the CV. Everything recruiter-facing therefore favours transparent rules over
scores, exact file paths over summaries, and "unknown" over silence.

## Market direction (Opportunity Map)

Skills verification is a live gap: Arab States youth unemployment reached 26.2% in 2025 against
12.4% globally, and employers do not trust informally acquired skills, so capable people stay
invisible. CodeProof's bilingual Arabic/English, RTL-first requirement in
`docs/HARD_REQUIREMENTS.md` exists for this market, not as decoration.

## Still owed: five conversations

The worksheet's "Five Conversations" tab is empty. Session 2 opens with what the buyer spends
today on the workaround, and that number cannot be invented. Before the next pitch, log five
recruiter conversations (role, hardest part, last time it happened, why it was hard, what they
tried, what they spend today in hours or salary) and replace the guessed "100 a week" with a
measured one.
