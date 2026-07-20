import CandidateComparison, { type ComparisonCandidate } from "@/components/candidates/CandidateComparison";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import { SearchCodeIcon } from "@/components/ui/icons";
import { getCandidateStore } from "@/features/candidates/store";
import type { EvidenceLevel } from "@/types/analysis";
import { getI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";

const LEVEL_WEIGHT: Record<EvidenceLevel, number> = { "Strong Evidence": 4, "Good Evidence": 3, "Partial Evidence": 2, "Limited Evidence": 1, "Insufficient Evidence": 0 };

export default async function CompareCandidatesPage() {
  const { t } = await getI18n();
  const store = getCandidateStore();
  const candidates = store.listCandidates().map((record): ComparisonCandidate => {
    const detail = store.getCandidate(record.id);
    const skills = new Map<string, { name: string; level: EvidenceLevel; files: string[] }>();
    for (const analysis of detail?.analyses ?? []) {
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
      patternCategories: [...new Set((detail?.analyses ?? []).flatMap((analysis) => analysis.result.patterns.map((pattern) => pattern.category)))],
      gapCount: (detail?.analyses ?? []).reduce((sum, analysis) => sum + analysis.result.gaps.length, 0),
    };
  });

  return <div className="space-y-6"><PageHeader eyebrow={t("Decision workspace")} title={t("Compare candidate evidence")} description={t("Line up verified implementation depth, grounded CV claims, repository coverage, and evidence gaps without turning the result into a black-box ranking.")} />{candidates.length ? <CandidateComparison candidates={candidates} /> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white/75"><EmptyState icon={SearchCodeIcon} title={t("Comparison needs candidate dossiers")} description={t("Complete at least one repository analysis to populate this workspace.")} actionLabel={t("Analyze a candidate")} actionHref="/analyze" /></div>}</div>;
}
