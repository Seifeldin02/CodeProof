import { requirePageUser } from "@/features/auth/page-guard";
import { getCandidateStore } from "@/features/candidates/store";
import { getRequirementsStore } from "@/features/requirements/store";
import { getInterviewStore } from "@/features/interviews/store";
import { getI18n } from "@/i18n/server";
import PageHeader from "@/components/ui/PageHeader";
import InterviewDesk from "@/components/interviews/InterviewDesk";
import { getRoleStore } from "@/features/shortlists/store";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function InterviewsPage({ searchParams }: { searchParams: Promise<{ candidate?: string; role?: string }> }) {
  const user = await requirePageUser("/interviews"), { t } = await getI18n();
  const candidates = await getCandidateStore().listCandidates(user.id);
  const [companyRequirements, sessions, query] = await Promise.all([getRequirementsStore().list(user.id), getInterviewStore().list(user.id), searchParams]);
  const selectedRole = query.role ? await getRoleStore().get(user.id, query.role) : null;
  if (query.role && !selectedRole) notFound();
  const requirements = selectedRole ? selectedRole.criteria.map((criterion) => ({
    id: criterion.id, requirement: criterion.label, importance: criterion.importance, category: "skill" as const,
  })) : companyRequirements;
  return <div className="space-y-6"><PageHeader eyebrow={t("Human-led hiring")} title={t("Interview desk")} description={t("Turn uncertain claims into a focused conversation, a defensible decision, and a clear candidate update.")} /><InterviewDesk key={`${selectedRole?.id ?? "company"}:${query.candidate ?? ""}`} candidates={candidates} requirements={requirements} sessions={sessions} selectedCandidate={candidates.some((c) => c.id === query.candidate) ? query.candidate : undefined} selectedRole={selectedRole ? { id: selectedRole.id, title: selectedRole.title } : undefined} /></div>;
}
