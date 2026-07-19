import { useMemo, useState } from 'react';
import Card from '../components/ui/Card';
import KpiTile from '../components/analytics/KpiTile';
import HiringFunnel from '../components/analytics/HiringFunnel';
import StageDropoff from '../components/analytics/StageDropoff';
import TimeToHireTrend from '../components/analytics/TimeToHireTrend';
import TimeInStage from '../components/analytics/TimeInStage';
import SourceDonut from '../components/analytics/SourceDonut';
import SourceQualityTable from '../components/analytics/SourceQualityTable';
import SkillsVsOutcome from '../components/analytics/SkillsVsOutcome';
import DerivedInsights from '../components/analytics/DerivedInsights';
import { LoadingBlock, ErrorBlock } from '../components/ui/StateBlock';
import { CheckCircleIcon, ClockIcon, TrendingUpIcon, UsersIcon } from '../components/ui/icons';
import { formatDays, formatPercent } from '../lib/format';
import { useApi } from '../lib/useApi';
import { api } from '../lib/api';
import {
  availableRoles,
  computeFunnel,
  computeSkillBands,
  computeSourceMetrics,
  computeStageDropOff,
  computeSummary,
  computeTimeInStage,
  computeTimeToHireTrend,
  filterByRole,
} from '../features/hiring-analytics/analytics';

export default function HiringInsightsPage() {
  const [role, setRole] = useState<string>('all');
  const candidatesState = useApi(() => api.candidates(), []);
  const insightsState = useApi(() => api.insights(), []);

  const all = useMemo(() => candidatesState.data ?? [], [candidatesState.data]);
  const roles = useMemo(() => availableRoles(all), [all]);
  const candidates = useMemo(() => filterByRole(all, role), [all, role]);

  const summary = useMemo(() => computeSummary(candidates), [candidates]);
  const funnel = useMemo(() => computeFunnel(candidates), [candidates]);
  const dropOff = useMemo(() => computeStageDropOff(candidates), [candidates]);
  const trend = useMemo(() => computeTimeToHireTrend(candidates), [candidates]);
  const timeInStage = useMemo(() => computeTimeInStage(candidates), [candidates]);
  const sources = useMemo(() => computeSourceMetrics(candidates), [candidates]);
  const skillBands = useMemo(() => computeSkillBands(candidates), [candidates]);

  if (candidatesState.loading) return <LoadingBlock label="Loading pipeline…" />;
  if (candidatesState.error) return <ErrorBlock message={candidatesState.error} />;

  return (
    <div>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Hiring Insights</h1>
          <p className="mt-1 text-sm text-slate-500">
            Funnel, velocity, and source performance across your pipeline.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="role-filter" className="text-xs font-medium text-slate-500">
            Role
          </label>
          <select
            id="role-filter"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="all">All roles</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Active pipeline"
          value={String(summary.activePipeline)}
          hint={`${summary.totalCandidates} candidates tracked`}
          icon={UsersIcon}
        />
        <KpiTile
          label="Avg time-to-hire"
          value={formatDays(summary.avgTimeToHireDays)}
          hint="Application to hire"
          icon={ClockIcon}
        />
        <KpiTile
          label="Offer acceptance"
          value={formatPercent(summary.offerAcceptanceRate)}
          hint={`${summary.hires} hires from offers`}
          icon={CheckCircleIcon}
          iconTone="positive"
        />
        <KpiTile
          label="Hires"
          value={String(summary.hires)}
          hint="Over the tracked period"
          icon={TrendingUpIcon}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card
          title="Hiring funnel"
          subtitle="Candidates reaching each stage, with stage-to-stage conversion"
          className="lg:col-span-2"
        >
          <HiringFunnel data={funnel} />
        </Card>
        <Card title="Insights" subtitle="Persisted signals from your pipeline">
          {insightsState.loading ? (
            <LoadingBlock label="Loading insights…" />
          ) : (
            <DerivedInsights items={insightsState.data ?? []} />
          )}
        </Card>

        <Card
          title="Time-to-hire trend"
          subtitle="Monthly average, by hire date"
          className="lg:col-span-2"
        >
          <TimeToHireTrend data={trend} />
        </Card>
        <Card title="Time in stage" subtitle="Avg days before advancing">
          <TimeInStage data={timeInStage} />
        </Card>

        <Card title="Stage drop-off" subtitle="Where candidates exit the funnel">
          <StageDropoff data={dropOff} />
        </Card>
        <Card
          title="Verified skills vs. outcome"
          subtitle="Do CodeProof-verified skills predict hires?"
          className="lg:col-span-2"
        >
          <SkillsVsOutcome data={skillBands} />
        </Card>

        <Card title="Source of hire" subtitle="Applicant distribution by channel">
          <SourceDonut data={sources} />
        </Card>
        <Card
          title="Source quality"
          subtitle="Conversion and verified-skill strength by channel"
          className="lg:col-span-2"
        >
          <SourceQualityTable data={sources} />
        </Card>
      </div>
    </div>
  );
}
