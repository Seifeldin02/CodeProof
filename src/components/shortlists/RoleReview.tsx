import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { reviewCoverage, type CandidateRoleReview, type CriterionReview, type RoleBrief } from "@/features/shortlists/evaluate";
import type { TranslationValues } from "@/i18n/translations";
import { coverageText, yearsOfWork } from "./coverage";

type Translate = (key: string, values?: TranslationValues) => string;

const CHIP = "inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-start text-[11px] font-semibold";
/** Where there is nothing to show, plain text keeps the eye on the criteria that do have something. */
const QUIET = "text-[11px] leading-5 text-slate-500";

/** How the saved brief was read: what it asks for, how firmly, and what CodeProof can and cannot check. */
export function RoleBriefSummary({ t, role, poolSize }: { t: Translate; role: RoleBrief; poolSize: number }) {
  const groups = [
    { title: t("Required"), items: role.criteria.filter((criterion) => criterion.importance === "required") },
    { title: t("Preferred"), items: role.criteria.filter((criterion) => criterion.importance === "preferred") },
    { title: t("Also named in the brief"), items: role.criteria.filter((criterion) => criterion.importance === "context") },
  ].filter((group) => group.items.length > 0);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700">{t("Saved role brief")}</p>
          <h2 className="mt-1 break-words text-xl font-semibold text-slate-950">{role.title}</h2>
        </div>
        <span className="text-xs text-slate-500">{t("{count} candidates in pool", { count: poolSize })}</span>
      </div>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">{t("Read original job brief")}</summary>
        <p dir="auto" className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{role.description}</p>
      </details>
      {groups.length > 0 ? (
        <>
          <dl className="mt-4 space-y-3">
            {groups.map((group) => (
              <div key={group.title} className="grid gap-2 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-start">
                <dt className="pt-1 text-xs font-semibold text-slate-700">{group.title}</dt>
                <dd className="flex min-w-0 flex-wrap gap-2">
                  {group.items.map((criterion) => (
                    <span key={criterion.id} dir="ltr" className={`${CHIP} ${criterion.capabilityId ? "bg-brand-50 text-brand-800" : "border border-dashed border-slate-300 bg-white text-slate-700"}`}>{criterion.label}</span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs leading-5 text-slate-500">{t("Filled: CodeProof can also look for this skill in public code. Outlined: compared with what each CV states only.")}</p>
        </>
      ) : (
        <p className="mt-4 text-sm text-slate-600">{t("No supported technical criteria were detected. Review the full job brief manually.")}</p>
      )}
      {role.minimumYears !== null && <p className="mt-3 text-xs font-medium text-slate-700">{t("Years of experience the brief asks for: {years}+", { years: role.minimumYears })}</p>}
      {role.unassessedRequirements.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <h3 className="text-xs font-semibold text-amber-900">{t("Requirements needing human review")}</h3>
          <p className="mt-1 text-xs leading-5 text-amber-800">{t("These job-brief terms were not checked against code and must not affect a candidate's review order.")}</p>
          <p dir="auto" className="mt-2 break-words text-xs text-amber-900">{role.unassessedRequirements.join(" · ")}</p>
        </div>
      )}
      <p className="mt-4 text-xs leading-5 text-slate-500">{t("Review order uses explicit CV claims or verified citations for required criteria. It is not a hiring rank. Private code and missing information never count against a candidate.")}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{t("Read differently than you meant? Start a line with “Required:” or “Nice to have:” and save the role again.")}</p>
    </section>
  );
}

function CriterionRow({ t, item }: { t: Translate; item: CriterionReview }) {
  const stated = item.statedAs.length > 0;
  const inOwnWords = item.statedAs.length === 1 && item.statedAs[0].toLowerCase() === item.criterion.label.toLowerCase();
  const code = {
    cited_evidence: { label: t("Verified citation"), tone: `${CHIP} bg-emerald-50 text-emerald-800` },
    attribution_pending: { label: t("Repository attribution pending"), tone: `${CHIP} bg-amber-50 text-amber-800` },
    not_observed: { label: t("Not seen in public code"), tone: QUIET },
    not_checkable: { label: t("No code check"), tone: QUIET },
  }[item.status];
  return (
    <li className="grid min-w-0 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start gap-x-3 gap-y-1 border-t border-slate-100 py-2.5 first:border-0 first:pt-0 sm:grid-cols-[minmax(7rem,1fr)_minmax(0,auto)] sm:items-center">
      <div className="min-w-0"><strong dir="ltr" className="inline-block max-w-full break-words text-start text-sm text-slate-900">{item.criterion.label}</strong></div>
      <div className="flex min-w-0 flex-col items-end gap-1 text-end sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-x-3">
        <span className={stated ? `${CHIP} bg-sky-50 text-sky-800` : QUIET}>
          {stated ? (inOwnWords ? t("On the CV") : t("On the CV as {terms}", { terms: item.statedAs.join(", ") })) : t("Not on the CV")}
        </span>
        <span className={code.tone}>{code.label}</span>
      </div>
      {item.citations.length > 0 && (
        <ul className="col-span-2 mt-1 space-y-1">
          {item.citations.map((citation) => (
            <li key={citation.sourceLink} className="min-w-0">
              <a href={citation.sourceLink} target="_blank" rel="noopener noreferrer" dir="ltr" className="block break-all text-start text-xs text-brand-700 underline-offset-2 hover:underline">{citation.repositoryName}: {citation.filePath}</a>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** One applicant against one role: what their CV states and what verified code shows, criterion by criterion. */
export function CandidateReviewCard({ t, review, role, position }: { t: Translate; review: CandidateRoleReview; role: RoleBrief; position: number }) {
  const coverage = reviewCoverage(review);
  const cited = coverage.scope === "required" ? review.citedRequiredCount : review.citedCriterionCount;
  const years = review.statedWorkMonths === null ? null : yearsOfWork(review.statedWorkMonths);
  const required = review.criteria.filter((item) => item.criterion.importance === "required");
  const preferred = review.criteria.filter((item) => item.criterion.importance === "preferred");
  const context = review.criteria.filter((item) => item.criterion.importance === "context");
  // A brief that marks nothing as required or preferred has only one kind of criterion, so all of them are shown.
  const marked = required.length + preferred.length > 0;
  const groups = marked
    ? [{ title: t("Required"), items: required }, { title: t("Preferred"), items: preferred }].filter((group) => group.items.length > 0)
    : [{ title: null, items: context }].filter((group) => group.items.length > 0);
  const rest = marked ? context : [];
  const restStated = rest.filter((item) => item.statedAs.length > 0).map((item) => item.criterion.label);
  return (
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-950 font-mono text-xs font-semibold text-lime-300">{position}</span>
          <div className="min-w-0">
            <h3 className="break-words text-base font-semibold text-slate-950">{review.candidateName}</h3>
            <p className="mt-1 text-xs text-slate-500">{t(review.candidateRole || "Not recorded")}</p>
          </div>
        </div>
        {review.isDemo && <Badge tone="warning">{t("Demo")}</Badge>}
      </div>
      <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700">{coverageText(t, coverage)}</p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <li>{t("With verified code: {count}", { count: cited })}</li>
        <li>{t("From the CV only: {count}", { count: coverage.covered - cited })}</li>
        {review.statedWorkMonths !== null && <li>{years === null ? t("Years of dated work on the CV: under 1") : t("Years of dated work on the CV: {years}", { years })}</li>}
      </ul>
      {groups.map((group) => (
        <div key={group.title ?? "all"} className="mt-4">
          {group.title && <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">{group.title}</h4>}
          <ul>{group.items.map((item) => <CriterionRow key={item.criterion.id} t={t} item={item} />)}</ul>
        </div>
      ))}
      {rest.length > 0 && (
        <details className="mt-3 border-t border-slate-100 pt-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-700">
            {t("Also named in the brief: {count}", { count: rest.length })}
            {restStated.length > 0 && <span className="font-normal text-slate-500"> · {t("On the CV")}: <bdi dir="ltr">{restStated.join(" · ")}</bdi></span>}
          </summary>
          <ul className="mt-3">{rest.map((item) => <CriterionRow key={item.criterion.id} t={t} item={item} />)}</ul>
        </details>
      )}
      <div className="mt-3 space-y-1 text-xs leading-5 text-slate-500">
        {review.criteria.some((item) => item.status === "attribution_pending") && <p>{t("The repository has a relevant signal, but this candidate's contribution has not been verified.")}</p>}
        {review.criteria.some((item) => item.statedAs.length === 0 && item.status !== "cited_evidence") && <p>{t("A criterion with no CV claim and no verified code is missing information, not proof the candidate lacks the skill.")}</p>}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href={`/candidates/${review.candidateId}`} className="inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700">{t("Open full dossier")}</Link>
        <Link href={`/interviews?candidate=${encodeURIComponent(review.candidateId)}&role=${encodeURIComponent(role.id)}`} className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">{t("Prepare interview")}</Link>
      </div>
    </article>
  );
}

/** Applicants whose CV names none of this role's skills and who have no verified code for it. Kept in view, never marked down. */
export function CandidatesWithoutSignal({ t, reviews, role, open }: { t: Translate; reviews: CandidateRoleReview[]; role: RoleBrief; open: boolean }) {
  return (
    <details open={open} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      <summary className="cursor-pointer text-sm font-semibold text-slate-900">{t("No CV claim or verified code for this role yet: {count}", { count: reviews.length })}</summary>
      <p className="mt-2 text-xs leading-5 text-slate-600">{t("These applicants stay in your pool. Their CVs do not name this role's skills and no verified code covers them, which is missing information and not a judgement.")}</p>
      <ul className="mt-3 divide-y divide-slate-100">
        {reviews.map((review) => (
          <li key={review.candidateId} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2.5">
            <div className="min-w-0">
              <Link href={`/candidates/${review.candidateId}`} className="break-words text-sm font-semibold text-slate-900 hover:text-brand-700 hover:underline">{review.candidateName}</Link>
              <p className="mt-0.5 text-xs text-slate-500">{t(review.candidateRole || "Not recorded")}{review.isDemo ? ` · ${t("Demo")}` : ""}</p>
            </div>
            <Link href={`/interviews?candidate=${encodeURIComponent(review.candidateId)}&role=${encodeURIComponent(role.id)}`} className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">{t("Prepare interview")}</Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
