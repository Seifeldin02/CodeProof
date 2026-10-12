import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import CreateRoleForm from "@/components/shortlists/CreateRoleForm";
import CandidateCvIntakeForm from "@/components/shortlists/CandidateCvIntakeForm";
import CandidateBatchIntakeForm from "@/components/shortlists/CandidateBatchIntakeForm";
import { CandidateReviewCard, CandidatesWithoutSignal, RoleBriefSummary } from "@/components/shortlists/RoleReview";
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
  // Applicants with something to look at come first, in review order. The rest stay listed, and are never marked down.
  const withSignal = (items: CandidateRoleReview[]) => items.filter((review) => review.signaledCriterionCount > 0);
  const real = reviews.filter((review) => !review.isDemo);
  const demo = reviews.filter((review) => review.isDemo);
  const quiet = reviews.filter((review) => review.signaledCriterionCount === 0);

  function candidateCards(role: RoleBrief, items: CandidateRoleReview[]) {
    return <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">{items.map((review, index) => <CandidateReviewCard key={review.candidateId} t={t} review={review} role={role} position={index + 1} />)}</div>;
  }

  return <div className="space-y-6">
    <PageHeader eyebrow={t("Technical hiring workflow")} title={t("Role-based candidate review")} description={t("Revisit your private candidate pool for a specific role. Inspect cited code evidence and unresolved questions before involving an engineer.")} />
    <CreateRoleForm />
    <CandidateCvIntakeForm />
    <CandidateBatchIntakeForm />
    {roles.length > 0 && <section aria-label={t("Saved roles")} className="flex flex-wrap gap-2">{roles.map((role) => <Link key={role.id} href={`/shortlists?role=${encodeURIComponent(role.id)}`} aria-current={selected?.id === role.id ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-xl border px-4 py-2 text-sm font-semibold ${selected?.id === role.id ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-brand-300"}`}>{role.title}</Link>)}</section>}
    {selected ? <>
      <RoleBriefSummary t={t} role={selected} poolSize={reviews.length} />
      {withSignal(real).length > 0 && <section className="space-y-3"><h2 className="text-lg font-semibold text-slate-950">{t("Your candidates")}</h2>{candidateCards(selected, withSignal(real))}</section>}
      {withSignal(demo).length > 0 && <section className="space-y-3"><h2 className="text-lg font-semibold text-slate-950">{t("Demo candidates - examples only")}</h2>{candidateCards(selected, withSignal(demo))}</section>}
      {quiet.length > 0 && <CandidatesWithoutSignal t={t} reviews={quiet} role={selected} open={quiet.length === reviews.length} />}
      {reviews.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><h2 className="text-base font-semibold text-slate-900">{t("No candidates in this account yet")}</h2><p className="mt-2 text-sm text-slate-600">{t("Add candidates, then return to this saved role to review them.")}</p><Link href="/analyze" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">{t("Analyze candidate")}</Link></div>}
    </> : <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">{t("Create a role to start a private-pool review.")}</p>}
  </div>;
}
