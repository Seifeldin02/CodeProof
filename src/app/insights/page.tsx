import Card from "@/components/ui/Card";
import KpiTile from "@/components/analytics/KpiTile";
import HiringFunnel from "@/components/analytics/HiringFunnel";
import StageDropoff from "@/components/analytics/StageDropoff";
import SourceQualityTable from "@/components/analytics/SourceQualityTable";
import SkillsVsOutcome from "@/components/analytics/SkillsVsOutcome";
import DerivedInsights from "@/components/analytics/DerivedInsights";
import EvidenceCoverage, { type EvidenceCoverageData } from "@/components/analytics/EvidenceCoverage";
import Badge from "@/components/ui/Badge";
import Link from "next/link";
import { CheckCircleIcon, ClockIcon, TrendingUpIcon, UsersIcon } from "@/components/ui/icons";
import { computeFunnel, computeSkillBands, computeSourceMetrics, computeStageDropOff, computeSummary, deriveInsights } from "@/features/hiring-analytics/analytics";
import { getCandidateStore } from "@/features/candidates/store";

export const dynamic = "force-dynamic";

export default function HiringInsightsPage() {
  const candidates = getCandidateStore().listCandidates();
  const realCandidates = candidates.filter((candidate) => !candidate.isDemo);
  const demoCandidates = candidates.filter((candidate) => candidate.isDemo);
  const activeCandidates = realCandidates.length ? realCandidates : demoCandidates;
  const summary = computeSummary(activeCandidates);
  const store = getCandidateStore();
  const details = activeCandidates.map((candidate) => store.getCandidate(candidate.id)).filter((candidate) => candidate !== null);
  const patternCounts = new Map<string, number>();
  for (const detail of details) for (const analysis of detail.analyses) for (const category of new Set(analysis.result.patterns.map((pattern) => pattern.category))) patternCounts.set(category, (patternCounts.get(category) ?? 0) + 1);
  const coverage: EvidenceCoverageData = {
    repositories: details.reduce((sum, candidate) => sum + candidate.analyses.length, 0),
    groundedClaims: activeCandidates.reduce((sum, candidate) => sum + (candidate.verifiedClaimCount ?? 0), 0),
    selectedFiles: details.reduce((sum, candidate) => sum + candidate.analyses.reduce((analysisSum, analysis) => analysisSum + analysis.result.selectedFiles.length, 0), 0),
    strongOrGoodSkills: details.reduce((sum, candidate) => sum + candidate.analyses.reduce((analysisSum, analysis) => analysisSum + analysis.result.skills.filter((skill) => skill.level === "Strong Evidence" || skill.level === "Good Evidence").length, 0), 0),
    patterns: [...patternCounts].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
  };
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-brand-700">Hiring operations</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.045em] text-slate-950 sm:text-4xl">Hiring Insights</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Explainable hiring metrics connected to the same repository evidence recruiters review in each candidate dossier.</p></div>{activeCandidates.length > 0 && <Badge tone={realCandidates.length ? "positive" : "warning"}>{realCandidates.length ? `${realCandidates.length} real candidate${realCandidates.length === 1 ? "" : "s"}` : "Synthetic demo analytics"}</Badge>}</header>
      {candidates.length === 0 ? <Card bodyClassName="py-16"><div className="text-center"><h2 className="text-lg font-semibold text-slate-900">Insights need candidate records</h2><p className="mt-2 text-sm text-slate-500">Analyze candidates first; this dashboard remains empty instead of inventing metrics.</p><Link href="/analyze" className="mt-5 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">Analyze a candidate</Link></div></Card> : <>
        {realCandidates.length ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800"><span><strong>Live evidence view.</strong> Every metric below is derived from {realCandidates.length} persisted candidate record{realCandidates.length === 1 ? "" : "s"}.</span>{demoCandidates.length > 0 && <span className="font-semibold">{demoCandidates.length} demo record{demoCandidates.length === 1 ? "" : "s"} excluded</span>}</div> : <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800"><strong>Synthetic demo view.</strong> These metrics come only from clearly labeled sample candidate records and must not be treated as real hiring outcomes.</div>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><KpiTile label="Total candidates" value={String(summary.totalCandidates)} icon={UsersIcon} /><KpiTile label="Active pipeline" value={String(summary.activePipeline)} icon={TrendingUpIcon} /><KpiTile label="Hires" value={String(summary.hires)} icon={CheckCircleIcon} iconTone="positive" /><KpiTile label="Avg time to hire" value={summary.avgTimeToHireDays === null ? "—" : `${summary.avgTimeToHireDays}d`} icon={ClockIcon} /></div>
        <div className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]"><Card title="Repository evidence coverage" subtitle="Signals connected to analyzed candidate projects"><EvidenceCoverage data={coverage} /></Card><Card title="Hiring funnel" subtitle="Candidates reaching each recorded stage"><HiringFunnel data={computeFunnel(activeCandidates)} /></Card></div>
        <div className="grid gap-5 xl:grid-cols-2"><Card title="Resolved stage drop-off" subtitle="Rejected or withdrawn records only; active candidates are excluded"><StageDropoff data={computeStageDropOff(activeCandidates)} /></Card><Card title="Evidence and outcomes" subtitle="Observed outcomes by transparent evidence index"><SkillsVsOutcome data={computeSkillBands(activeCandidates)} /></Card></div>
        <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><Card title="Source quality" subtitle="Performance by candidate source"><SourceQualityTable data={computeSourceMetrics(activeCandidates)} /></Card><Card title="Explainable hiring signals" subtitle="Rule-based observations over the current pipeline"><DerivedInsights items={deriveInsights(activeCandidates)} /></Card></div>
      </>}
    </div>
  );
}
