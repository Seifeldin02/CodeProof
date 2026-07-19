import Link from "next/link";
import CandidateComparison, { type ComparisonCandidate } from "@/components/candidates/CandidateComparison";
import { getCandidateStore } from "@/features/candidates/store";
import type { EvidenceLevel } from "@/types/analysis";

export const dynamic = "force-dynamic";

const LEVEL_WEIGHT: Record<EvidenceLevel, number> = { "Strong Evidence": 4, "Good Evidence": 3, "Partial Evidence": 2, "Limited Evidence": 1, "Insufficient Evidence": 0 };

export default function CompareCandidatesPage() {
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

  return <div className="space-y-6"><header><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-brand-700">Decision workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.045em] text-slate-950 sm:text-4xl">Compare candidate evidence</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Line up verified implementation depth, grounded CV claims, repository coverage, and evidence gaps without turning the result into a black-box ranking.</p></header>{candidates.length ? <CandidateComparison candidates={candidates} /> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white/75 px-6 py-16 text-center"><h2 className="text-lg font-semibold text-slate-900">Comparison needs candidate dossiers</h2><p className="mt-2 text-sm text-slate-500">Complete at least one repository analysis to populate this workspace.</p><Link href="/analyze" className="mt-5 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">Analyze a candidate</Link></div>}</div>;
}
