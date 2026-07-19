import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import HiringInsightsPage from './pages/HiringInsightsPage';
import CandidatesPage from './pages/CandidatesPage';
import CandidateDetailPage from './pages/CandidateDetailPage';
import RepositoryAnalysisPage from './pages/RepositoryAnalysisPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/insights" replace />} />
        <Route path="insights" element={<HiringInsightsPage />} />
        {/* Recruiter/business-intelligence layer (Claude-owned). */}
        <Route path="candidates" element={<CandidatesPage />} />
        <Route path="candidates/:id" element={<CandidateDetailPage />} />
        {/* Recruiter-facing view of the intelligence engine's output (Codex-owned).
            Reads the repositories/repo_skills tables; Codex's real ingestion fills them. */}
        <Route path="repository" element={<RepositoryAnalysisPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
