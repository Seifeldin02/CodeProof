import CandidateComparison, { type ComparisonCandidate } from "@/components/candidates/CandidateComparison";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import { SearchCodeIcon } from "@/components/ui/icons";
import { getCandidateStore } from "@/features/candidates/store";
import type { EvidenceLevel } from "@/types/analysis";
import { getI18n } from "@/i18n/server";
import { requirePageUser } from "@/features/auth/page-guard";
import { eligibleCandidateAnalyses } from "@/features/repository-analysis/evidence-eligibility";

export const dynamic = "force-dynamic";

const LEVEL_WEIGHT: Record<EvidenceLevel, number> = { "Strong Evidence": 4, "Good Evidence": 3, "Partial Evidence": 2, "Limited Evidence": 1, "Insufficient Evidence": 0 };

export default async function CompareCandidatesPage() {
  const [{ t }, user] = await Promise.all([getI18n(), requirePageUser("/compare")]);
  const store = getCandidateStore();
  const records = await store.listCandidates(user.id);
  const candidates = await Promise.all(records.filter((record) => !record.isDemo).map(async (record): Promise<ComparisonCandidate> => {
    const detail = await store.getCandidate(user.id, record.id);
    const skills = new Map<string, { name: string; level: EvidenceLevel; files: string[] }>();
    const eligibleAnalyses = detail ? eligibleCandidateAnalyses(detail) : [];
    for (const analysis of eligibleAnalyses) {
      for (const skill of analysis.result.skills) {
        const existing = skills.get(skill.skill);
        if (!existing || LEVEL_WEIGHT[skill.level] > LEVEL_WEIGHT[existing.level]) skills.set(skill.skill, { name: skill.skill, level: skill.level, files: skill.evidence.map((evidence) => evidence.file) });
      }
    }
    return {
      id: record.id,
      name: record.name,
      role: record.role,
      isDemo: Boolean(record.isDemo),
      evidenceIndex: record.verifiedSkillScore,
      repositoryCount: record.repositoryCount ?? 0,
      groundedClaims: record.verifiedClaimCount ?? 0,
      topSkills: [...skills.values()].sort((a, b) => LEVEL_WEIGHT[b.level] - LEVEL_WEIGHT[a.level]).slice(0, 5),
      patternCategories: [...new Set(eligibleAnalyses.flatMap((analysis) => analysis.result.patterns.map((pattern) => pattern.category)))],
      gapCount: eligibleAnalyses.reduce((sum, analysis) => sum + analysis.result.gaps.length, 0),
    };
  }));

  const comparable = candidates.some((candidate) => candidate.topSkills.length > 0 || candidate.groundedClaims > 0 || candidate.patternCategories.length > 0);
  return <div className="space-y-6"><PageHeader eyebrow={t("Decision workspace")} title={t("Compare candidate evidence")} description={t("Line up verified implementation depth, grounded CV claims, repository coverage, and evidence gaps without turning the result into a black-box ranking.")} />{comparable ? <CandidateComparison candidates={candidates} /> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white/75"><EmptyState icon={SearchCodeIcon} title={t(candidates.length ? "No verified evidence to compare yet" : "Comparison needs candidate dossiers")} description={t(candidates.length ? "These candidates have no verified code evidence yet. Check repository attribution in their dossiers, or review their CV claims against a saved role." : "Analyze a real candidate to populate this workspace. Demo records are not included.")} actionLabel={t(candidates.length ? "Role review" : "Analyze a candidate")} actionHref={candidates.length ? "/shortlists" : "/analyze"} /></div>}</div>;
}
