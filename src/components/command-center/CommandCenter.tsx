import Link from "next/link";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import { coverageText } from "@/components/shortlists/coverage";
import type { ApplicantRow, AttentionItem, CommandCenter, RoleBoard } from "@/features/command-center/overview";
import { formatDateForLocale, type Locale, type TranslationValues } from "@/i18n/translations";

type Translate = (key: string, values?: TranslationValues) => string;

/** The first thing a recruiter sees: what is in the pool, which roles are open, and what is waiting. */
export function CommandHero({ t, overview }: { t: Translate; overview: CommandCenter }) {
  const interviews = [
    [t("Awaiting next step"), overview.interviews.awaiting],
    [t("Ready to communicate"), overview.interviews.readyToCommunicate],
    [t("Overdue follow-ups"), overview.interviews.overdue],
  ] as const;
  return (
    <section className="hero-grid overflow-hidden rounded-[28px] bg-[#0b1210] px-6 py-8 text-white shadow-[0_28px_70px_rgba(6,18,13,.2)] lg:px-10 lg:py-10">
      <div className="grid gap-9 xl:grid-cols-[1.1fr_.9fr] xl:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[.2em] text-lime-300">{t("Recruiter command center")}</p>
            <span className="rounded-full border border-white/10 bg-white/[.05] px-2.5 py-1 text-[11px] font-medium text-slate-300">{t("No paid API required")}</span>
            {overview.demoOnly && <Badge tone="warning">{t("Demo-only view")}</Badge>}
          </div>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.12] tracking-[-.05em] sm:text-5xl">{t("Your candidate pool, ready for the next role.")}</h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">{t("Add applicants once. When a role opens, see who to look at first, what supports it, what is still unverified, and what to ask in the interview.")}</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href="/shortlists" className="group inline-flex min-h-12 items-center justify-between gap-5 rounded-xl bg-lime-300 px-5 py-3.5 text-sm font-semibold text-slate-950 transition-all duration-300 hover:-translate-y-0.5 hover:bg-lime-200">{t("Open role review")} <span className="directional-icon transition-transform group-hover:translate-x-1">→</span></Link>
            <Link href="/analyze" className="group inline-flex min-h-12 items-center justify-between gap-5 rounded-xl border border-white/15 bg-white/[.025] px-5 py-3.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/[.07]">{t("Add one applicant")} <span className="directional-icon transition-transform group-hover:translate-x-1">→</span></Link>
            <Link href="/interviews" className="group inline-flex min-h-12 items-center justify-between gap-5 rounded-xl border border-white/15 bg-white/[.025] px-5 py-3.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/[.07]">{t("Interview desk")} <span className="directional-icon transition-transform group-hover:translate-x-1">→</span></Link>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[.035] p-4 shadow-2xl backdrop-blur sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-[.16em] text-slate-300">{t("Workflow status")}</h2>
            <span className="flex items-center gap-2 text-[11px] text-lime-300"><i className="live-dot" /> {t("Live")}</span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Link href="/candidates" className="rounded-xl border border-white/[.07] bg-black/10 p-4 transition hover:border-white/20 hover:bg-white/[.04]">
              <span className="text-xs text-slate-300">{t("Applicants in your pool")}</span>
              <strong className="tnum mt-1 block text-4xl font-semibold tracking-[-.04em] text-white">{overview.pool.total}</strong>
              <span className="mt-2 block text-[11px] leading-5 text-slate-400">{t("With public code read: {code} · From CV only: {cv}", { code: overview.pool.withPublicCode, cv: overview.pool.cvOnly })}</span>
            </Link>
            <Link href="/shortlists" className="rounded-xl border border-white/[.07] bg-black/10 p-4 transition hover:border-white/20 hover:bg-white/[.04]">
              <span className="text-xs text-slate-300">{t("Open roles")}</span>
              <strong className="tnum mt-1 block text-4xl font-semibold tracking-[-.04em] text-white">{overview.roles}</strong>
              <span className="mt-2 block text-[11px] leading-5 text-slate-400">{t("Each role reviews the same pool against its own job brief.")}</span>
            </Link>
          </div>
          <Link href="/interviews" className="mt-2.5 block rounded-xl border border-white/[.07] bg-black/10 p-4 transition hover:border-white/20 hover:bg-white/[.04]">
            <span className="text-xs text-slate-300">{t("Interviews")}</span>
            <dl className="mt-2 grid grid-cols-3 gap-3">
              {interviews.map(([label, value], index) => (
                <div key={label} className="min-w-0">
                  <dd className={`tnum text-2xl font-semibold tracking-[-.03em] ${index === 2 && value > 0 ? "text-amber-300" : "text-white"}`}>{value}</dd>
                  <dt className="mt-1 text-[11px] leading-4 text-slate-400">{label}</dt>
                </div>
              ))}
            </dl>
          </Link>
        </div>
      </div>
    </section>
  );
}

function RoleBoardCard({ t, board, wide }: { t: Translate; board: RoleBoard; wide: boolean }) {
  const first = board.leads[0];
  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700">{t("Open role")}</p>
          <h3 className="mt-1 break-words text-lg font-semibold tracking-[-.02em] text-slate-950">{board.title}</h3>
        </div>
        <span className="text-xs text-slate-500">{t("In pool: {count}", { count: board.poolSize })}</span>
      </div>
      {board.criteria.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={t("Role criteria")}>
          {board.criteria.slice(0, 6).map((label) => <li key={label} dir="ltr" className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-medium text-brand-800">{label}</li>)}
          {board.criteria.length > 6 && <li dir="ltr" className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">+{board.criteria.length - 6}</li>}
        </ul>
      )}
      {board.needsHumanReview > 0 && <p className="mt-2 text-[11px] text-amber-800">{t("Requirements left to a person: {count}", { count: board.needsHumanReview })}</p>}

      {board.leads.length > 0 ? (
        <ol className={wide ? "mt-4 grid grid-cols-[minmax(0,1fr)] gap-2.5 lg:grid-cols-3" : "mt-4 space-y-2.5"}>
          {board.leads.map((lead, index) => (
            <li key={lead.candidateId} className="flex min-w-0 gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-950 font-mono text-[11px] font-semibold text-lime-300">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <Link href={`/candidates/${lead.candidateId}`} className="break-words text-sm font-semibold text-slate-900 hover:text-brand-700 hover:underline">{lead.candidateName}</Link>
                <p className="mt-0.5 text-xs leading-5 text-slate-600">{coverageText(t, lead.coverage)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {lead.cited > 0 && <Badge tone="positive">{t("Verified code: {count}", { count: lead.cited })}</Badge>}
                  {lead.attributionPending && <Badge tone="warning">{t("Repository attribution pending")}</Badge>}
                  {lead.reported.length > 0 && <Badge tone="neutral">{t("CV claims")}</Badge>}
                  {lead.reported.length > 0 && <span dir="ltr" className="break-words text-start text-[11px] text-slate-500">{lead.reported.join(" · ")}</span>}
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-3 text-xs leading-5 text-slate-600">{t("Nobody in your pool has a CV claim or verified code for this role's criteria yet. That is missing information, not a judgement.")}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2 pt-1">
        <Link href={`/shortlists?role=${encodeURIComponent(board.roleId)}`} className="inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700">{t("Review the pool")}</Link>
        {first && <Link href={`/interviews?candidate=${encodeURIComponent(first.candidateId)}&role=${encodeURIComponent(board.roleId)}`} className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">{t("Prepare interview")}</Link>}
      </div>
    </article>
  );
}

/** One card for each saved role: who in the pool to look at first, and where each signal comes from. */
export function RoleBoards({ t, boards }: { t: Translate; boards: RoleBoard[] }) {
  return (
    <section aria-labelledby="role-boards-heading" className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-brand-700">{t("Role review")}</p>
        <h2 id="role-boards-heading" className="mt-1 text-xl font-semibold tracking-[-.025em] text-slate-950">{t("Roles you are hiring for")}</h2>
        <p className="mt-1 text-sm text-slate-600">{t("Who in your pool to look at first for each saved role.")}</p>
      </div>
      {boards.length > 0 ? (
        <>
          <div className={`grid grid-cols-[minmax(0,1fr)] gap-4 ${boards.length > 1 ? "xl:grid-cols-2" : ""}`}>{boards.map((board) => <RoleBoardCard key={board.roleId} t={t} board={board} wide={boards.length === 1} />)}</div>
          <p className="text-xs leading-5 text-slate-500">{t("Review order uses explicit CV claims or verified citations for required criteria. It is not a hiring rank. Private code and missing information never count against a candidate.")}</p>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-8 text-center">
          <h3 className="text-base font-semibold text-slate-900">{t("No role is open yet")}</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{t("Open a role with its job brief to see who in your pool to look at first.")}</p>
          <Link href="/shortlists" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700">{t("Open a role")}</Link>
        </div>
      )}
    </section>
  );
}

/** The newest applicants, with what their CV states and the saved role it covers best. */
export function ApplicantList({ t, locale, applicants }: { t: Translate; locale: Locale; applicants: ApplicantRow[] }) {
  return (
    <Card
      title={t("Recently added applicants")}
      subtitle={t("What each CV states, and the saved role it covers best.")}
      action={<Link href="/candidates" className="whitespace-nowrap text-xs font-semibold text-brand-700 hover:text-brand-500">{t("View all")} <span className="directional-icon">→</span></Link>}
    >
      <ul className="divide-y divide-slate-100">
        {applicants.map((applicant) => (
          <li key={applicant.id} className="min-w-0 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/candidates/${applicant.id}`} className="break-words text-sm font-semibold text-slate-900 hover:text-brand-700 hover:underline">{applicant.name}</Link>
                <p className="mt-0.5 text-xs text-slate-600">
                  {applicant.statedRole ? t("CV states: {role}", { role: t(applicant.statedRole) }) : t(applicant.role || "Not recorded")}
                  <span className="text-slate-400"> · {formatDateForLocale(locale, applicant.appliedAt)}</span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={applicant.hasPublicCode ? "brand" : "neutral"}>{applicant.hasPublicCode ? t("Public code read") : t("From CV only")}</Badge>
                {applicant.claimCount > 0 && <Badge tone="neutral">{t("CV claims: {count}", { count: applicant.claimCount })}</Badge>}
              </div>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              {applicant.closestRole ? (
                <>
                  <span className="font-semibold text-slate-700">{t("Closest saved role")}:</span>{" "}
                  <Link href={`/shortlists?role=${encodeURIComponent(applicant.closestRole.roleId)}`} className="font-semibold text-brand-700 hover:underline">{applicant.closestRole.title}</Link>
                  <span> · {coverageText(t, applicant.closestRole.coverage)}</span>
                </>
              ) : t("No saved role matches their CV yet")}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] leading-5 text-slate-500">{t("A lead to explore, not a verdict on fit.")}</p>
    </Card>
  );
}

/** Interviews that are waiting on the recruiter, most urgent first. */
export function AttentionList({ t, locale, items }: { t: Translate; locale: Locale; items: AttentionItem[] }) {
  const label = { overdue: t("Follow-up overdue"), communicate: t("Tell the candidate"), prepare: t("Interview being prepared") } as const;
  const tone = { overdue: "negative", communicate: "warning", prepare: "neutral" } as const;
  return (
    <Card title={t("Needs your attention")} subtitle={t("A decision is not finished until the candidate knows the next step.")}>
      {items.length > 0 ? (
        <ul className="divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.sessionId} className="min-w-0 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/interviews/${item.sessionId}`} className="break-words text-sm font-semibold text-slate-900 hover:text-brand-700 hover:underline">{item.candidateName}</Link>
                  <p className="mt-0.5 break-words text-xs text-slate-600">{item.roleTitle}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {item.isDemo && <Badge tone="warning">{t("Demo")}</Badge>}
                  <Badge tone={tone[item.state]}>{label[item.state]}</Badge>
                </div>
              </div>
              {item.followUpOn && <p className="mt-1.5 text-[11px] text-slate-500">{t("Follow up by")}: {formatDateForLocale(locale, item.followUpOn)}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-600">{t("Nothing is waiting on you.")}</p>
      )}
      <Link href="/interviews" className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">{t("Open interview desk")}</Link>
    </Card>
  );
}
