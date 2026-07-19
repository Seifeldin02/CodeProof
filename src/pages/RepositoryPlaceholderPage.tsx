import ComingSoon from '../components/ui/ComingSoon';
import { GitBranchIcon } from '../components/ui/icons';

/**
 * Placeholder for the Codex-owned intelligence engine (GitHub ingestion +
 * AI evidence verification). Kept intentionally minimal — Codex owns the
 * real implementation and route registration.
 */
export default function RepositoryPlaceholderPage() {
  return (
    <ComingSoon
      icon={GitBranchIcon}
      title="Repository Analysis"
      description="GitHub ingestion and AI skill-evidence verification are built by the intelligence engine. This surface will show verified skills extracted from real source code."
      owner="Intelligence engine"
      points={[
        'GitHub repository ingestion and technology detection',
        'Skill evidence with citations to source files',
        'Verified scores that feed into Hiring Insights',
      ]}
    />
  );
}
