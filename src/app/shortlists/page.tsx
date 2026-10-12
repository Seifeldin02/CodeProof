import Link from "next/link";
import Badge from "@/components/ui/Badge";
import PageHeader from "@/components/ui/PageHeader";
import CreateRoleForm from "@/components/shortlists/CreateRoleForm";
import CandidateCvIntakeForm from "@/components/shortlists/CandidateCvIntakeForm";
import CandidateBatchIntakeForm from "@/components/shortlists/CandidateBatchIntakeForm";
import { requirePageUser } from "@/features/auth/page-guard";
import { getCandidateStore } from "@/features/candidates/store";
import { compareCandidateRoleReviews, evaluateCandidateForRole, type CandidateRoleReview, type RoleBrief } from "@/features/shortlists/evaluate";
import { getRoleStore } from "@/features/shortlists/store";
import { getCandidateResumeStore } from "@/features/shortlists/resume-store";
import { getI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";

async function reviewsForRole(ownerUserId: string, role: RoleBrief): Promise<CandidateRoleReview[]> {
  const store = getCandidateStore();
  const [candidates, resumeClaims] = await Promise.all([store.listCandidates(ownerUserId), getCandidateResumeStore().list(ownerUserId)]);
  const reviews: CandidateRoleReview[] = [];
  // Bound concurrent database reads without silently omitting candidates from the pool.
  for (let offset = 0; offset < candidates.length; offset += 16) {
    const details = await Promise.all(candidates.slice(offset, offset + 16)
      .map((candidate) => store.getCandidate(ownerUserId, candidate.id)));
    for (const detail of details) if (detail) reviews.push(evaluateCandidateForRole(detail, role, resumeClaims.get(detail.id) ?? []));
  }
  return reviews.sort(compareCandidateRoleReviews);
}

export default async function ShortlistsPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const [user, { t }, query] = await Promise.all([requirePageUser("/shortlists"), getI18n(), searchParams]);
  const roles = await getRoleStore().list(user.id);
  const selected = roles.find((role) => role.id === query.role) ?? roles[0] ?? null;
  const reviews = selected ? await reviewsForRole(user.id, selected) : [];
  const real = reviews.filter((review) => !review.isDemo);
  const demo = reviews.filter((review) => review.isDemo);

  function candidateCards(items: CandidateRoleReview[]) {
    return <div className="grid gap-4 xl:grid-cols-2">{items.map((review) => <article key={review.candidateId} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><h3 className="break-words text-base font-semibold text-slate-950">{review.candidateName}</h3><p className="mt-1 text-xs text-slate-500">{t(review.candidateRole)}</p></div>
        {review.isDemo && <Badge tone="warning">{t("Demo")}</Badge>}
      </div>
      <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700">
        {t("{count} of {total} required criteria have a CV claim or verified citation", {
          count: review.signaledRequiredCount,
          total: review.criteria.filter((item) => item.criterion.importance === "required").length,
        })}
      </p>
      <p className="mt-2 text-xs text-slate-500">{t("{count} required criteria have verified code citations; CV-only matches still need assessment", { count: review.citedRequiredCount })}</p>
      {(review.reportedCriteria.length > 0 || review.reportedUnassessedRequirements.length > 0) && <p className="mt-3 text-xs leading-5 text-slate-600"><span className="font-semibold">{t("CV mentions (candidate-reported, not verified)")}:</span> <span dir="ltr" className="inline-block text-start">{[...review.reportedCriteria, ...review.reportedUnassessedRequirements].join(" · ")}</span></p>}
      <ul className="mt-4 space-y-3">{review.criteria.map((item) => <li key={item.criterion.id} className="min-w-0 border-t border-slate-100 pt-3 first:border-0 first:pt-0">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong dir="ltr" className="text-start text-sm text-slate-900">{item.criterion.label}</strong><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.status === "cited_evidence" ? "bg-emerald-50 text-emerald-800" : item.status === "attribution_pending" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{t(item.status === "cited_evidence" ? "Verified citation" : item.status === "attribution_pending" ? "Repository attribution pending" : "Not observed in available public code")}</span></div>
        {item.citations.length > 0 ? <ul className="mt-2 space-y-1">{item.citations.map((citation) => <li key={citation.sourceLink} className="min-w-0"><a href={citation.sourceLink} target="_blank" rel="noopener noreferrer" dir="ltr" className="block break-all text-start text-xs text-brand-700 underline-offset-2 hover:underline">{citation.repositoryName}: {citation.filePath}</a></li>)}</ul> : <p className="mt-2 text-xs leading-5 text-slate-500">{t(item.status === "attribution_pending" ? "The repository has a relevant signal, but this candidate's contribution has not been verified." : "This is an evidence gap, not proof the candidate lacks this skill.")}</p>}
      </li>)}</ul>
      {review.criteria.length === 0 && <p className="mt-4 text-sm text-slate-600">{t("No supported technical criteria were detected. Review the full job brief manually.")}</p>}
      <div className="mt-5 flex flex-wrap gap-2"><Link href={`/candidates/${review.candidateId}`} className="inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700">{t("Open full dossier")}</Link><Link href={`/interviews?candidate=${encodeURIComponent(review.candidateId)}&role=${encodeURIComponent(selected.id)}`} className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">{t("Prepare interview")}</Link></div>
    </article>)}</div>;
  }

  return <div className="space-y-6">
    <PageHeader eyebrow={t("Technical hiring workflow")} title={t("Role-based candidate review")} description={t("Revisit your private candidate pool for a specific role. Inspect cited code evidence and unresolved questions before involving an engineer.")} />
    <CreateRoleForm />
    <CandidateCvIntakeForm />
    <CandidateBatchIntakeForm />
    {roles.length > 0 && <section aria-label={t("Saved roles")} className="flex flex-wrap gap-2">{roles.map((role) => <Link key={role.id} href={`/shortlists?role=${encodeURIComponent(role.id)}`} aria-current={selected?.id === role.id ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-xl border px-4 py-2 text-sm font-semibold ${selected?.id === role.id ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-brand-300"}`}>{role.title}</Link>)}</section>}
    {selected ? <>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700">{t("Saved role brief")}</p><h2 className="mt-1 text-xl font-semibold text-slate-950">{selected.title}</h2></div><span className="text-xs text-slate-500">{t("{count} candidates in pool", { count: reviews.length })}</span></div>
        <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-slate-700">{t("Read original job brief")}</summary><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{selected.description}</p></details>
        <div className="mt-4 flex flex-wrap gap-2">{selected.criteria.map((criterion) => <span key={criterion.id} dir="ltr" className="rounded-full bg-brand-50 px-3 py-1.5 text-start text-xs font-medium text-brand-800">{criterion.label}</span>)}</div>
        {selected.unassessedRequirements.length > 0 && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3"><h3 className="text-xs font-semibold text-amber-900">{t("Requirements needing human review")}</h3><p className="mt-1 text-xs leading-5 text-amber-800">{t("These job-brief terms were not checked against code and must not affect a candidate's review order.")}</p><p dir="auto" className="mt-2 break-words text-xs text-amber-900">{selected.unassessedRequirements.join(" · ")}</p></div>}
        <p className="mt-4 text-xs leading-5 text-slate-500">{t("Review order uses explicit CV claims or verified citations for required criteria. It is not a hiring rank. Private code and missing information never count against a candidate.")}</p>
      </section>
      {real.length > 0 && <section className="space-y-3"><h2 className="text-lg font-semibold text-slate-950">{t("Your candidates")}</h2>{candidateCards(real)}</section>}
      {demo.length > 0 && <section className="space-y-3"><h2 className="text-lg font-semibold text-slate-950">{t("Demo candidates - examples only")}</h2>{candidateCards(demo)}</section>}
      {reviews.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><h2 className="text-base font-semibold text-slate-900">{t("No candidates in this account yet")}</h2><p className="mt-2 text-sm text-slate-600">{t("Add candidates, then return to this saved role to review them.")}</p><Link href="/analyze" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">{t("Analyze candidate")}</Link></div>}
    </> : <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">{t("Create a role to start a private-pool review.")}</p>}
  </div>;
}
