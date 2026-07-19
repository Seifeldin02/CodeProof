import { useMemo, useState } from 'react';
import Card from '../components/ui/Card';
import CandidatesTable from '../components/candidates/CandidatesTable';
import { LoadingBlock, ErrorBlock } from '../components/ui/StateBlock';
import { useApi } from '../lib/useApi';
import { api } from '../lib/api';
import { availableRoles, filterByRole } from '../features/hiring-analytics/analytics';

export default function CandidatesPage() {
  const { data, loading, error } = useApi(() => api.candidates(), []);
  const [role, setRole] = useState<string>('all');
  const [query, setQuery] = useState('');

  const all = useMemo(() => data ?? [], [data]);
  const roles = useMemo(() => availableRoles(all), [all]);
  const filtered = useMemo(() => {
    const byRole = filterByRole(all, role);
    const q = query.trim().toLowerCase();
    return q ? byRole.filter((c) => c.name.toLowerCase().includes(q)) : byRole;
  }, [all, role, query]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Candidates</h1>
        <p className="mt-1 text-sm text-slate-500">
          {all.length} candidates in the pipeline, with verified-skill evidence from their code.
        </p>
      </div>

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name…"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 sm:max-w-xs"
          />
          <div className="flex items-center gap-2">
            <label htmlFor="cand-role" className="text-xs font-medium text-slate-500">
              Role
            </label>
            <select
              id="cand-role"
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

        {loading ? (
          <LoadingBlock label="Loading candidates…" />
        ) : error ? (
          <ErrorBlock message={error} />
        ) : (
          <CandidatesTable candidates={filtered} />
        )}
      </Card>
    </div>
  );
}
