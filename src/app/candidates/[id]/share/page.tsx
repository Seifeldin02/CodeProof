import Link from "next/link";
import { notFound } from "next/navigation";
import Badge from "@/components/ui/Badge";
import ReportActions from "@/components/candidates/ReportActions";
import { getCandidateStore } from "@/features/candidates/store";
import { getI18n } from "@/i18n/server";
import { localizeAnalysisText } from "@/i18n/translations";
import type { EvidenceLevel } from "@/types/analysis";

export const dynamic = "force-dynamic";
const WEIGHT: Record<EvidenceLevel, number> = { "Strong Evidence": 4, "Good Evidence": 3, "Partial Evidence": 2, "Limited Evidence": 1, "Insufficient Evidence": 0 };

export default async function CandidateSharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const candidate = getCandidateStore().getCandidate(id);
  if (!candidate) notFound();
  const { locale, t } = await getI18n();
  const skills = new Map<string, { skill: string; level: EvidenceLevel; files: string[] }>();
  for (const analysis of candidate.analyses) for (const skill of analysis.result.skills) {
    const current = skills.get(skill.skill);
    if (!current || WEIGHT[skill.level] > WEIGHT[current.level]) skills.set(skill.skill, { skill: skill.skill, level: skill.level, files: skill.evidence.map((item) => item.file) });
  }
  const topSkills = [...skills.values()].sort((a, b) => WEIGHT[b.level] - WEIGHT[a.level]).slice(0, 6);
  const gaps = candidate.analyses.flatMap((analysis) => analysis.result.gaps.map((gap) => ({ repository: analysis.repositoryName, ...gap }))).slice(0, 6);
  const questions = candidate.analyses.flatMap((analysis) => analysis.result.interviewQuestions.map((question) => ({ repository: analysis.repositoryName, ...question }))).slice(0, 6);

  return <div className="space-y-5">
    <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Link href={`/candidates/${candidate.id}`} className="inline-flex min-h-11 items-center text-xs font-semibold text-slate-500 hover:text-brand-700"><span className="directional-icon me-1">←</span>{t("Back to dossier")}</Link>
      <ReportActions />
    </div>
    <article className="print-report overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-card">
      <header className="hero-grid bg-slate-950 p-6 text-white sm:p-9">
        <div className="flex flex-wrap items-center gap-2"><Badge tone="positive">{t("Recruiter evidence summary")}</Badge>{candidate.isDemo && <Badge tone="warning">{t("Demo data")}</Badge>}</div>
        <h1 className="mt-5 text-3xl font-semibold tracking-[-.045em] sm:text-5xl">{candidate.name}</h1>
        <p className="mt-2 text-sm text-slate-400">{t(candidate.role)} · CodeProof</p>
        <dl className="mt-8 grid grid-cols-3 gap-2">
          <div><dt className="text-[9px] uppercase text-slate-500">{t("Evidence index")}</dt><dd className="mt-1 text-2xl font-semibold text-lime-300">{candidate.verifiedSkillScore}</dd></div>
          <div><dt className="text-[9px] uppercase text-slate-500">{t("Verified repositories")}</dt><dd className="mt-1 text-2xl font-semibold">{candidate.analyses.length}</dd></div>
          <div><dt className="text-[9px] uppercase text-slate-500">{t("Grounded CV claims")}</dt><dd className="mt-1 text-2xl font-semibold">{candidate.verifiedClaimCount ?? 0}</dd></div>
        </dl>
      </header>
      <div className="space-y-8 p-5 sm:p-9">
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-brand-700">{t("Repository analysis status")}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">{candidate.repositoryOutcomes.map((outcome) => <article key={outcome.id} className={`rounded-xl border p-4 ${outcome.status === "failed" ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`}><div className="flex items-start justify-between gap-3"><strong dir="ltr" className="break-all text-start text-sm text-slate-900">{outcome.repositoryName}</strong><span className={`shrink-0 text-[9px] font-semibold uppercase ${outcome.status === "failed" ? "text-rose-700" : "text-emerald-700"}`}>{t(outcome.status === "failed" ? "Failed" : "Analyzed successfully")}</span></div>{outcome.message && <p className="mt-2 text-xs leading-5 text-rose-800">{localizeAnalysisText(locale, outcome.message)}</p>}{outcome.code && <code dir="ltr" className="mt-2 block text-start text-[9px] text-rose-600">{outcome.code}</code>}</article>)}</div>
        </section>
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-brand-700">{t("Top grounded skills")}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">{topSkills.map((skill) => <div key={skill.skill} className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><strong dir="ltr" className="text-start text-sm">{skill.skill}</strong><span className="text-[10px] font-semibold text-brand-700">{t(skill.level)}</span></div><code dir="ltr" className="mt-2 block break-all text-start text-[9px] text-slate-400">{skill.files.slice(0, 2).join(" · ")}</code></div>)}</div>
        </section>
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-brand-700">{t("Project evidence")}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">{candidate.analyses.map((analysis) => <article key={analysis.id} className="rounded-xl bg-slate-50 p-4"><strong dir="ltr" className="block break-all text-start text-sm text-slate-900">{analysis.repositoryName}</strong><p className="mt-2 text-xs leading-5 text-slate-500">{localizeAnalysisText(locale, analysis.projectType)} · {analysis.result.patterns.length} {t("Patterns")} · {analysis.result.selectedFiles.length} {t("Evidence files")}</p><div dir="ltr" className="mt-3 flex flex-wrap gap-1.5">{analysis.result.selectedFiles.slice(0, 4).map((file) => <code key={file.path} className="rounded bg-white px-2 py-1 text-[9px] text-brand-700">{file.path}</code>)}</div></article>)}</div>
        </section>
        <div className="grid gap-6 lg:grid-cols-2">
          <section><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-amber-700">{t("Evidence gaps to probe")}</p><ul className="mt-4 space-y-2">{gaps.map((gap, index) => <li key={`${gap.repository}-${gap.area}-${index}`} className="rounded-xl border border-amber-200 bg-amber-50 p-4"><strong className="text-sm text-amber-950">{localizeAnalysisText(locale, gap.area)}</strong><p className="mt-1 text-xs leading-5 text-amber-800">{localizeAnalysisText(locale, gap.explanation)}</p></li>)}</ul></section>
          <section><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-brand-700">{t("Suggested interview focus")}</p><ol className="mt-4 space-y-2">{questions.map((question, index) => <li key={`${question.repository}-${index}`} className="rounded-xl border border-slate-200 p-4"><strong className="text-sm leading-6 text-slate-900">{localizeAnalysisText(locale, question.question)}</strong><p className="mt-2 text-[10px] font-semibold text-slate-700">{t("Why ask this?")}</p><p className="mt-1 text-[10px] leading-5 text-slate-500">{localizeAnalysisText(locale, question.relevance)}</p><code dir="ltr" className="mt-2 block break-all text-start text-[9px] text-brand-700">{question.files.join(" · ")}</code></li>)}</ol></section>
        </div>
        <footer className="border-t border-slate-100 pt-5 text-[10px] leading-5 text-slate-400">{t("Generated by CodeProof’s deterministic evidence engine. This report is not a hiring recommendation.")}</footer>
      </div>
    </article>
  </div>;
}
