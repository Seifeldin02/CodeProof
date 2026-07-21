import Link from "next/link";
import { notFound } from "next/navigation";
import CandidateEvidenceReport from "@/components/candidate-evidence-report";
import Badge from "@/components/ui/Badge";
import { getCandidateStore } from "@/features/candidates/store";
import { getI18n } from "@/i18n/server";
import { requirePageUser } from "@/features/auth/page-guard";

export const dynamic = "force-dynamic";

export default async function CandidateProjectPage({ params }: { params: Promise<{ id: string; analysisId: string }> }) {
  const { id, analysisId } = await params;
  const user = await requirePageUser(`/candidates/${id}/projects/${analysisId}`);
  const candidate = await getCandidateStore().getCandidate(user.id, id);
  const analysis = candidate?.analyses.find((item) => item.id === analysisId);
  if (!candidate || !analysis) notFound();
  const { locale, t } = await getI18n();

  return <div className="space-y-6"><header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><Link href={`/candidates/${candidate.id}`} className="inline-flex min-h-11 items-center text-xs font-semibold text-slate-500 hover:text-brand-700"><span className="directional-icon me-1">←</span> {candidate.name}</Link><div className="mt-3 flex flex-wrap items-center gap-2"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-brand-700">{t("Project drill-down")}</p>{candidate.isDemo && <Badge tone="warning">{t("Demo candidate")}</Badge>}</div><h1 dir="ltr" className="mt-2 break-all text-start text-3xl font-semibold tracking-[-.045em] text-slate-950">{analysis.repositoryName}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{t("A focused repository view for architecture review, exact evidence inspection, and interview preparation.")}</p></div>{candidate.analyses.length > 1 && <nav className="flex max-w-full flex-wrap gap-2" aria-label={t("Project portfolio")}>{candidate.analyses.map((item) => <Link key={item.id} dir="ltr" href={`/candidates/${candidate.id}/projects/${item.id}`} className={`min-h-11 rounded-lg px-3 py-3 text-start text-xs font-semibold ${item.id === analysis.id ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-brand-300"}`}>{item.repositoryName.split("/").at(-1)}</Link>)}</nav>}</header><CandidateEvidenceReport analysis={analysis} locale={locale} /></div>;
}
