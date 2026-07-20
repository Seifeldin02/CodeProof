import Link from "next/link";
import Card from "@/components/ui/Card";
import CandidatesTable from "@/components/candidates/CandidatesTable";
import Badge from "@/components/ui/Badge";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { SearchCodeIcon } from "@/components/ui/icons";
import { getCandidateStore } from "@/features/candidates/store";
import { getI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function CandidatesPage() {
  const { t } = await getI18n();
  const candidates = getCandidateStore().listCandidates();
  const summary = candidates.reduce((current, candidate) => ({
    real: current.real + Number(!candidate.isDemo),
    repositories: current.repositories + (candidate.repositoryCount ?? 0),
    claims: current.claims + (candidate.verifiedClaimCount ?? 0),
  }), { real: 0, repositories: 0, claims: 0 });
  const demoCount = candidates.length - summary.real;

  return <div className="space-y-6">
    <PageHeader
      eyebrow={t("Candidate intelligence")}
      title={t("Candidate dossiers")}
      description={t("Every record links CV claims to selected repository evidence.")}
      badge={demoCount > 0 ? <Badge tone={summary.real ? "neutral" : "warning"}>{demoCount} {t("Demo")}</Badge> : undefined}
      actions={<><Link href="/compare" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50">{t("Compare")}</Link><Link href="/analyze" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/10 transition hover:-translate-y-0.5 hover:bg-brand-700">{t("Analyze candidate")}</Link></>}
    />
    {candidates.length > 0 && <dl className="grid gap-3 sm:grid-cols-3">{[["Real records", summary.real], ["Repository reports", summary.repositories], ["Grounded claims", summary.claims]].map(([label, value]) => <div key={String(label)} className="metric-card rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-card"><dt className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{t(String(label))}</dt><dd className="tnum mt-2 text-2xl font-semibold tracking-[-.035em] text-slate-950">{value}</dd></div>)}</dl>}
    <Card bodyClassName={candidates.length ? "!p-0 sm:!px-5 sm:!py-5" : "!p-0"}>
      {candidates.length ? <CandidatesTable candidates={candidates} /> : <EmptyState icon={SearchCodeIcon} title={t("The candidate workspace is empty")} description={t("Completed analyses appear here automatically.")} actionLabel={t("Upload a CV")} actionHref="/analyze" />}
    </Card>
  </div>;
}
