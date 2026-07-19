import ComingSoon from '../components/ui/ComingSoon';
import { UsersIcon } from '../components/ui/icons';

export default function CandidatesPage() {
  return (
    <ComingSoon
      icon={UsersIcon}
      title="Candidates"
      description="Candidate management — profiles, pipeline stages, and evidence-linked records — is the next slice of the recruiter workspace."
      owner="Recruiter layer · Planned"
      points={[
        'Candidate list with current stage and source',
        'Detail view linking CodeProof skill evidence',
        'Move candidates through recruitment stages',
      ]}
    />
  );
}
