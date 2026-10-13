import { requirePageUser } from "@/features/auth/page-guard";
import { getCandidateStore } from "@/features/candidates/store";
import { getRequirementsStore } from "@/features/requirements/store";
import { getInterviewStore } from "@/features/interviews/store";
import { criterionSignal, suggestInterviewCriteria, type CriterionSignal } from "@/features/interviews/suggest";
import { getI18n } from "@/i18n/server";
import PageHeader from "@/components/ui/PageHeader";
import InterviewDesk from "@/components/interviews/InterviewDesk";
import { evaluateCandidateForRole } from "@/features/shortlists/evaluate";
import { getCandidateResumeStore } from "@/features/shortlists/resume-store";
import { getRoleStore } from "@/features/shortlists/store";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function InterviewsPage({ searchParams }: { searchParams: Promise<{ candidate?: string; role?: string }> }) {
  const user = await requirePageUser("/interviews"), { t } = await getI18n();
  const [allCandidates, companyRequirements, sessions, query, roles] = await Promise.all([getCandidateStore().listCandidates(user.id), getRequirementsStore().list(user.id), getInterviewStore().list(user.id), searchParams, getRoleStore().list(user.id)]);
  const candidates = allCandidates.filter((candidate) => !candidate.isDemo);
  const selectedRole = query.role ? await getRoleStore().get(user.id, query.role) : null;
  if (query.role && !selectedRole) notFound();
  let requirements = selectedRole ? selectedRole.criteria.map((criterion) => ({
    id: criterion.id, requirement: criterion.label, importance: criterion.importance, category: "skill" as const,
  })) : companyRequirements;
  const selectedCandidate = candidates.some((c) => c.id === query.candidate) ? query.candidate : undefined;
  // For a chosen applicant and role, the plan starts from what the role needs most and the evidence settles least.
  let suggested: string[] | undefined;
  let signals: Record<string, CriterionSignal> | undefined;
  if (selectedRole && selectedCandidate) {
    const [detail, claims] = await Promise.all([getCandidateStore().getCandidate(user.id, selectedCandidate), getCandidateResumeStore().list(user.id)]);
    if (detail) {
      const review = evaluateCandidateForRole(detail, selectedRole, claims.get(detail.id) ?? []);
      suggested = suggestInterviewCriteria(review);
      // The whole list follows the same order, so the suggested criteria sit at the top of it.
      const order = suggestInterviewCriteria(review, review.criteria.length);
      requirements = [...requirements].sort((left, right) => order.indexOf(left.id) - order.indexOf(right.id));
      signals = Object.fromEntries(review.criteria.map((item) => [item.criterion.id, criterionSignal(item)]));
    }
  }
  return <div className="space-y-6"><PageHeader eyebrow={t("Human-led hiring")} title={t("Interview desk")} description={t("Turn uncertain claims into a focused conversation, a defensible decision, and a clear candidate update.")} /><InterviewDesk key={`${selectedRole?.id ?? "company"}:${query.candidate ?? ""}`} candidates={candidates} roles={roles.map((role) => ({ id: role.id, title: role.title }))} requirements={requirements} sessions={sessions.filter((session) => !session.isDemo)} selectedCandidate={selectedCandidate} selectedRole={selectedRole ? { id: selectedRole.id, title: selectedRole.title } : undefined} suggested={suggested} signals={signals} /></div>;
}
