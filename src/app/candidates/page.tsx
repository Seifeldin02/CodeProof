import Link from "next/link";
import Card from "@/components/ui/Card";
import CandidatesTable from "@/components/candidates/CandidatesTable";
import Badge from "@/components/ui/Badge";
import { getCandidateStore } from "@/features/candidates/store";

export const dynamic = "force-dynamic";

export default function CandidatesPage() {
  const candidates = getCandidateStore().listCandidates();
  const realCount = candidates.filter((candidate) => !candidate.isDemo).length;
  const demoCount = candidates.length - realCount;
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-brand-700">Candidate intelligence</p>{demoCount > 0 && <Badge tone={realCount ? "neutral" : "warning"}>{demoCount} demo</Badge>}</div><h1 className="mt-2 text-3xl font-semibold tracking-[-.045em] text-slate-950 sm:text-4xl">Candidate dossiers</h1><p className="mt-2 text-sm text-slate-500">Every record links CV claims to selected repository evidence.</p></div><div className="flex gap-2"><Link href="/compare" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-center text-sm font-semibold text-slate-700 transition hover:border-brand-300 hover:bg-brand-50">Compare</Link><Link href="/analyze" className="rounded-xl bg-slate-950 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-brand-700">Analyze candidate</Link></div></header>
      {candidates.length > 0 && <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-white/85 p-4"><span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Real records</span><strong className="mt-2 block text-2xl text-slate-900">{realCount}</strong></div><div className="rounded-2xl border border-slate-200 bg-white/85 p-4"><span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Repository reports</span><strong className="mt-2 block text-2xl text-slate-900">{candidates.reduce((sum, candidate) => sum + (candidate.repositoryCount ?? 0), 0)}</strong></div><div className="rounded-2xl border border-slate-200 bg-white/85 p-4"><span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Grounded claims</span><strong className="mt-2 block text-2xl text-slate-900">{candidates.reduce((sum, candidate) => sum + (candidate.verifiedClaimCount ?? 0), 0)}</strong></div></div>}
      <Card>
        {candidates.length ? <CandidatesTable candidates={candidates} /> : <div className="py-14 text-center"><h2 className="text-lg font-semibold text-slate-900">The candidate workspace is empty</h2><p className="mt-2 text-sm text-slate-500">Completed analyses appear here automatically.</p><Link href="/analyze" className="mt-5 inline-flex rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white">Upload a CV</Link></div>}
      </Card>
    </div>
  );
}
