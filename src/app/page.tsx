import Link from "next/link";
import Card from "@/components/ui/Card";
import KpiTile from "@/components/analytics/KpiTile";
import HiringFunnel from "@/components/analytics/HiringFunnel";
import CandidatesTable from "@/components/candidates/CandidatesTable";
import { CheckCircleIcon, GitBranchIcon, SearchCodeIcon, UsersIcon } from "@/components/ui/icons";
import { computeFunnel } from "@/features/hiring-analytics/analytics";
import { getCandidateStore } from "@/features/candidates/store";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const candidates = getCandidateStore().listCandidates();
  const repositories = candidates.reduce((sum, candidate) => sum + (candidate.repositoryCount ?? 0), 0);
  const claims = candidates.reduce((sum, candidate) => sum + (candidate.verifiedClaimCount ?? 0), 0);
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl bg-slate-950 px-6 py-8 text-white shadow-card lg:px-10 lg:py-10">
        <div className="grid gap-8 lg:grid-cols-[1.3fr_.7fr] lg:items-end">
          <div><p className="text-[11px] font-semibold uppercase tracking-[.2em] text-lime-300">Recruiter command center</p><h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-[-.04em] sm:text-5xl">Turn candidate claims into inspectable engineering evidence.</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">Start with a CV. CodeProof finds linked public projects, scans source archives without executing code, and builds a candidate record your hiring team can actually audit.</p></div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col"><Link href="/analyze" className="inline-flex items-center justify-between gap-6 rounded-xl bg-lime-300 px-5 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-lime-200">Analyze a candidate <span>→</span></Link><Link href="/candidates" className="inline-flex items-center justify-between gap-6 rounded-xl border border-white/15 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-white/5">Review candidates <span>↗</span></Link></div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Candidates analyzed" value={String(candidates.length)} hint="Real records only" icon={UsersIcon} />
        <KpiTile label="Repositories inspected" value={String(repositories)} hint="Bounded public archives" icon={GitBranchIcon} />
        <KpiTile label="CV claims grounded" value={String(claims)} hint="Backed by repository files" icon={CheckCircleIcon} iconTone="positive" />
        <KpiTile label="Core API cost" value="$0" hint="No token required" icon={SearchCodeIcon} iconTone="positive" />
      </div>

      {candidates.length === 0 ? (
        <Card className="border-dashed" bodyClassName="py-14">
          <div className="mx-auto max-w-xl text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-700"><SearchCodeIcon /></span><h2 className="mt-4 text-xl font-semibold text-slate-900">No candidate evidence yet</h2><p className="mt-2 text-sm leading-6 text-slate-500">Upload a CV PDF to create the first evidence report. A clearly labeled sample candidate is available inside the analysis flow if you need a backup demo.</p><Link href="/analyze" className="mt-5 inline-flex rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Start first analysis</Link></div>
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1.45fr_.55fr]">
          <Card title="Recent candidates" subtitle="Newest CodeProof evidence reports"><CandidatesTable candidates={candidates.slice(0, 6)} /></Card>
          <Card title="Pipeline movement" subtitle="Derived from candidate stage records"><HiringFunnel data={computeFunnel(candidates)} /></Card>
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        {[['01','CV-first intake','Local PDF text extraction and explicit GitHub link discovery.'],['02','Static evidence scan','Languages, architecture, patterns, tests, auth, API, database and state signals.'],['03','Recruiter handoff','Evidence reports become candidate records and hiring analytics inputs.']].map(([number,title,copy]) => <article key={number} className="rounded-xl border border-slate-200 bg-white p-5"><span className="font-mono text-xs font-semibold text-brand-700">{number}</span><h3 className="mt-6 text-base font-semibold text-slate-900">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{copy}</p></article>)}
      </section>
    </div>
  );
}
