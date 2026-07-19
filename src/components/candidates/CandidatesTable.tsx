import { Link } from 'react-router-dom';
import { type CandidateRecord, STAGE_LABELS } from '../../features/hiring-analytics/types';
import { OutcomeBadge, VerifiedScoreChip } from './badges';

export default function CandidatesTable({ candidates }: { candidates: CandidateRecord[] }) {
  if (candidates.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-400">No candidates match your filters.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
            <th className="px-4 py-2.5 font-medium">Candidate</th>
            <th className="px-4 py-2.5 font-medium">Role</th>
            <th className="px-4 py-2.5 font-medium">Source</th>
            <th className="px-4 py-2.5 font-medium">Furthest stage</th>
            <th className="px-4 py-2.5 text-right font-medium">Verified</th>
            <th className="px-4 py-2.5 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => (
            <tr key={c.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70">
              <td className="px-4 py-3">
                <Link
                  to={`/candidates/${c.id}`}
                  className="font-medium text-slate-800 hover:text-brand-700"
                >
                  {c.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-slate-600">{c.role}</td>
              <td className="px-4 py-3 text-slate-600">{c.source}</td>
              <td className="px-4 py-3 text-slate-600">{STAGE_LABELS[c.furthestStage]}</td>
              <td className="px-4 py-3 text-right">
                <VerifiedScoreChip score={c.verifiedSkillScore} />
              </td>
              <td className="px-4 py-3 text-right">
                <OutcomeBadge outcome={c.outcome} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
