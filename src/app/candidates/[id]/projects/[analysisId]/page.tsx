import Link from "next/link";
import { notFound } from "next/navigation";
import CandidateEvidenceReport from "@/components/candidate-evidence-report";
import Badge from "@/components/ui/Badge";
import { getCandidateStore } from "@/features/candidates/store";

export const dynamic = "force-dynamic";

export default async function CandidateProjectPage({ params }: { params: Promise<{ id: string; analysisId: string }> }) {
  const { id, analysisId } = await params;
  const candidate = getCandidateStore().getCandidate(id);
  const analysis = candidate?.analyses.find((item) => item.id === analysisId);
  if (!candidate || !analysis) notFound();

  return <div className="space-y-6"><header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><Link href={`/candidates/${candidate.id}`} className="text-xs font-semibold text-slate-500 hover:text-brand-700">← {candidate.name}</Link><div className="mt-4 flex items-center gap-2"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-brand-700">Project drill-down</p>{candidate.isDemo && <Badge tone="warning">Demo candidate</Badge>}</div><h1 className="mt-2 text-3xl font-semibold tracking-[-.045em] text-slate-950">{analysis.repositoryName}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">A focused repository view for architecture review, exact evidence inspection, and interview preparation.</p></div>{candidate.analyses.length > 1 && <div className="flex flex-wrap gap-2">{candidate.analyses.map((item) => <Link key={item.id} href={`/candidates/${candidate.id}/projects/${item.id}`} className={`rounded-lg px-3 py-2 text-xs font-semibold ${item.id === analysis.id ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-brand-300"}`}>{item.repositoryName.split("/").at(-1)}</Link>)}</div>}</header><CandidateEvidenceReport analysis={analysis} /></div>;
}
