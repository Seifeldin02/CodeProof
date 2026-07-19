import Link from "next/link";
import Card from "@/components/ui/Card";
import CandidatesTable from "@/components/candidates/CandidatesTable";
import { getCandidateStore } from "@/features/candidates/store";

export const dynamic = "force-dynamic";

export default function CandidatesPage() {
  const candidates = getCandidateStore().listCandidates();
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-brand-700">Candidate intelligence</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] text-slate-950">Candidates</h1><p className="mt-2 text-sm text-slate-500">Every record links CV claims to selected repository evidence.</p></div><Link href="/analyze" className="rounded-lg bg-slate-900 px-4 py-2.5 text-center text-sm font-semibold text-white">Analyze candidate</Link></header>
      <Card>
        {candidates.length ? <CandidatesTable candidates={candidates} /> : <div className="py-14 text-center"><h2 className="text-lg font-semibold text-slate-900">The candidate workspace is empty</h2><p className="mt-2 text-sm text-slate-500">Completed analyses appear here automatically.</p><Link href="/analyze" className="mt-5 inline-flex rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white">Upload a CV</Link></div>}
      </Card>
    </div>
  );
}
