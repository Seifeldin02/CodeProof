import Card from "@/components/ui/Card";
import KpiTile from "@/components/analytics/KpiTile";
import HiringFunnel from "@/components/analytics/HiringFunnel";
import StageDropoff from "@/components/analytics/StageDropoff";
import SourceQualityTable from "@/components/analytics/SourceQualityTable";
import SkillsVsOutcome from "@/components/analytics/SkillsVsOutcome";
import DerivedInsights from "@/components/analytics/DerivedInsights";
import { CheckCircleIcon, ClockIcon, TrendingUpIcon, UsersIcon } from "@/components/ui/icons";
import { computeFunnel, computeSkillBands, computeSourceMetrics, computeStageDropOff, computeSummary, deriveInsights } from "@/features/hiring-analytics/analytics";
import { getCandidateStore } from "@/features/candidates/store";

export const dynamic = "force-dynamic";

export default function HiringInsightsPage() {
  const candidates = getCandidateStore().listCandidates();
  const summary = computeSummary(candidates);
  return (
    <div className="space-y-6">
      <header><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-brand-700">Hiring operations</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] text-slate-950">Hiring Insights</h1><p className="mt-2 text-sm text-slate-500">Explainable metrics derived from candidate and pipeline records, not generated claims.</p></header>
      {candidates.length === 0 ? <Card bodyClassName="py-16"><div className="text-center"><h2 className="text-lg font-semibold text-slate-900">Insights need candidate records</h2><p className="mt-2 text-sm text-slate-500">Analyze candidates first; this dashboard remains empty instead of inventing demo metrics.</p></div></Card> : <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><KpiTile label="Total candidates" value={String(summary.totalCandidates)} icon={UsersIcon} /><KpiTile label="Active pipeline" value={String(summary.activePipeline)} icon={TrendingUpIcon} /><KpiTile label="Hires" value={String(summary.hires)} icon={CheckCircleIcon} iconTone="positive" /><KpiTile label="Avg time to hire" value={summary.avgTimeToHireDays === null ? "—" : `${summary.avgTimeToHireDays}d`} icon={ClockIcon} /></div>
        <div className="grid gap-5 xl:grid-cols-2"><Card title="Hiring funnel" subtitle="Candidates reaching each recorded stage"><HiringFunnel data={computeFunnel(candidates)} /></Card><Card title="Stage drop-off" subtitle="Observed transition losses"><StageDropoff data={computeStageDropOff(candidates)} /></Card></div>
        <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><Card title="Source quality" subtitle="Performance by candidate source"><SourceQualityTable data={computeSourceMetrics(candidates)} /></Card><Card title="Evidence and outcomes" subtitle="Observed outcomes by transparent evidence index"><SkillsVsOutcome data={computeSkillBands(candidates)} /></Card></div>
        <Card title="Explainable hiring signals" subtitle="Rule-based observations over the current pipeline"><DerivedInsights items={deriveInsights(candidates)} /></Card>
      </>}
    </div>
  );
}
