import Link from "next/link";
import { notFound } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import StageTimeline from "@/components/candidates/StageTimeline";
import CandidateEvidenceReport from "@/components/candidate-evidence-report";
import { getCandidateStore } from "@/features/candidates/store";

export const dynamic = "force-dynamic";

export default async function CandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const candidate = getCandidateStore().getCandidate(id);
  if (!candidate) notFound();
  const skillCount = candidate.analyses.reduce((sum, analysis) => sum + analysis.result.skills.length, 0);
  return (
    <div className="space-y-6">
      <Link href="/candidates" className="text-xs font-semibold text-slate-500 hover:text-brand-700">← Back to candidates</Link>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card"><div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-end lg:p-8"><div><div className="flex flex-wrap gap-2"><Badge tone="brand">{candidate.role}</Badge>{candidate.isDemo && <Badge tone="warning">Demo data</Badge>}</div><h1 className="mt-4 text-3xl font-semibold tracking-[-.04em] text-slate-950 sm:text-4xl">{candidate.name}</h1><p className="mt-2 text-sm text-slate-500">Candidate evidence dossier · created {new Date(candidate.appliedAt).toLocaleDateString()}</p></div><dl className="grid grid-cols-3 gap-2"><div className="rounded-xl bg-slate-950 p-4 text-white"><dt className="text-[9px] uppercase tracking-wider text-slate-500">Evidence index</dt><dd className="mt-1 text-2xl font-semibold text-lime-300">{candidate.verifiedSkillScore}</dd></div><div className="rounded-xl bg-slate-100 p-4"><dt className="text-[9px] uppercase tracking-wider text-slate-400">Repositories</dt><dd className="mt-1 text-2xl font-semibold text-slate-900">{candidate.repositoryCount ?? 0}</dd></div><div className="rounded-xl bg-slate-100 p-4"><dt className="text-[9px] uppercase tracking-wider text-slate-400">Skill signals</dt><dd className="mt-1 text-2xl font-semibold text-slate-900">{skillCount}</dd></div></dl></div><div className="border-t border-slate-100 bg-slate-50 px-6 py-3 text-xs text-slate-500 lg:px-8">Evidence index is derived from categorical implementation depth, not an AI confidence score.</div></section>
      <div className="grid gap-5 lg:grid-cols-[.35fr_.65fr]"><Card title="Pipeline progress" subtitle="Candidate stage history"><StageTimeline events={candidate.stageHistory} /></Card><Card title="Recruiter summary" subtitle="Evidence available for review"><div className="grid gap-4 sm:grid-cols-3"><div><span className="text-xs text-slate-400">CV claims grounded</span><strong className="mt-1 block text-2xl text-slate-900">{candidate.verifiedClaimCount ?? 0}</strong></div><div><span className="text-xs text-slate-400">Repository reports</span><strong className="mt-1 block text-2xl text-slate-900">{candidate.analyses.length}</strong></div><div><span className="text-xs text-slate-400">Current stage</span><strong className="mt-1 block text-lg capitalize text-slate-900">{candidate.furthestStage.replace("_", " ")}</strong></div></div></Card></div>
      <div className="space-y-6">{candidate.analyses.map((analysis) => <CandidateEvidenceReport key={analysis.id} analysis={analysis} />)}</div>
    </div>
  );
}
