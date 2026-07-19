import type { RepositoryEvidence } from '../../lib/apiTypes';
import { GitBranchIcon } from '../ui/icons';
import { VerifiedScoreChip } from '../candidates/badges';

interface Props {
  repo: RepositoryEvidence;
  /** Show which candidate the repo belongs to (hidden on a candidate's own page). */
  showCandidate?: boolean;
}

export default function RepositoryEvidenceCard({ repo, showCandidate = true }: Props) {
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <GitBranchIcon className="h-4 w-4 shrink-0 text-slate-400" />
            <a
              href={repo.url}
              target="_blank"
              rel="noreferrer"
              className="truncate font-medium text-slate-800 hover:text-brand-700"
            >
              {repo.name}
            </a>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{repo.summary}</p>
        </div>
        <VerifiedScoreChip score={repo.verifiedOverall} />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-brand-400" />
          {repo.primaryLanguage}
        </span>
        <span className="tnum">★ {repo.stars}</span>
        {showCandidate && <span>{repo.candidateName}</span>}
      </div>

      <ul className="mt-4 space-y-3">
        {repo.skills.map((s) => (
          <li key={s.skill}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-slate-600">{s.skill}</span>
              <span className="tnum text-slate-400">{s.score}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${s.score}%` }} />
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{s.evidence}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
