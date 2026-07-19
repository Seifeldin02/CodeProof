import { Link, useParams } from 'react-router-dom';
import Card from '../components/ui/Card';
import StageTimeline from '../components/candidates/StageTimeline';
import RepositoryEvidenceCard from '../components/evidence/RepositoryEvidenceCard';
import { OutcomeBadge } from '../components/candidates/badges';
import { LoadingBlock, ErrorBlock } from '../components/ui/StateBlock';
import { useApi } from '../lib/useApi';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';

export default function CandidateDetailPage() {
  const { id = '' } = useParams();
  const { data, loading, error } = useApi(() => api.candidate(id), [id]);

  if (loading) return <LoadingBlock label="Loading candidate…" />;
  if (error) return <ErrorBlock message={error} />;
  if (!data) return <ErrorBlock message="Candidate not found." />;

  return (
    <div>
      <Link to="/candidates" className="text-sm text-slate-500 transition-colors hover:text-brand-700">
        &larr; Candidates
      </Link>

      <div className="mb-6 mt-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{data.name}</h1>
          <OutcomeBadge outcome={data.outcome} />
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {data.role} · {data.source} · applied {formatDate(data.appliedAt)}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="Pipeline progress" subtitle="Stage history" className="lg:col-span-1">
          <StageTimeline events={data.stageHistory} />
        </Card>

        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Verified skill evidence</h2>
          {data.repository ? (
            <RepositoryEvidenceCard repo={data.repository} showCandidate={false} />
          ) : (
            <Card>
              <p className="py-4 text-center text-sm text-slate-400">
                No analyzed repository yet for this candidate.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
