import { useMemo } from 'react';
import KpiTile from '../components/analytics/KpiTile';
import RepositoryEvidenceCard from '../components/evidence/RepositoryEvidenceCard';
import { LoadingBlock, ErrorBlock } from '../components/ui/StateBlock';
import { ChartBarIcon, GitBranchIcon, ShieldCheckIcon } from '../components/ui/icons';
import { useApi } from '../lib/useApi';
import { api } from '../lib/api';

export default function RepositoryAnalysisPage() {
  const { data, loading, error } = useApi(() => api.repositories(), []);
  const repos = useMemo(() => data ?? [], [data]);

  const avgVerified = repos.length
    ? Math.round(repos.reduce((s, r) => s + r.verifiedOverall, 0) / repos.length)
    : 0;
  const topLanguage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of repos) counts.set(r.primaryLanguage, (counts.get(r.primaryLanguage) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
  }, [repos]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Repository Analysis</h1>
        <p className="mt-1 text-sm text-slate-500">
          Verified skill evidence extracted from candidate repositories.
        </p>
      </div>

      <div className="mb-5 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-800">
        <span className="font-semibold">Integration seam:</span> this evidence is produced by the
        intelligence engine (Codex). These are seeded demo rows — real GitHub ingestion + AI
        verification write to the same <code className="rounded bg-white/70 px-1">repositories</code>{' '}
        and <code className="rounded bg-white/70 px-1">repo_skills</code> tables.
      </div>

      {loading ? (
        <LoadingBlock label="Loading repositories…" />
      ) : error ? (
        <ErrorBlock message={error} />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
            <KpiTile label="Repositories analyzed" value={String(repos.length)} icon={GitBranchIcon} />
            <KpiTile
              label="Avg verified score"
              value={String(avgVerified)}
              icon={ShieldCheckIcon}
              iconTone="positive"
            />
            <KpiTile label="Top language" value={topLanguage} icon={ChartBarIcon} />
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {repos.map((r) => (
              <RepositoryEvidenceCard key={r.id} repo={r} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
