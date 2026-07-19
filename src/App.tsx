import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import HiringInsightsPage from './pages/HiringInsightsPage';
import CandidatesPage from './pages/CandidatesPage';
import RepositoryPlaceholderPage from './pages/RepositoryPlaceholderPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/insights" replace />} />
        <Route path="insights" element={<HiringInsightsPage />} />
        {/* Recruiter/business intelligence layer (Claude-owned). Candidate
            management is a future slice (Phase 5) — placeholder for now. */}
        <Route path="candidates" element={<CandidatesPage />} />
        {/* Intelligence engine (Codex-owned). Placeholder until CP-101+ land.
            Codex should register its real routes here. */}
        <Route path="repository" element={<RepositoryPlaceholderPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
