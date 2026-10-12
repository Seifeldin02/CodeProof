import Link from "next/link";
import { notFound } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import StageTimeline from "@/components/candidates/StageTimeline";
import CandidateEvidenceReport from "@/components/candidate-evidence-report";
import RepositoryOutcomeList from "@/components/candidates/RepositoryOutcomeList";
import PipelineEditor from "@/components/candidates/PipelineEditor";
import DeleteCandidateButton from "@/components/candidates/DeleteCandidateButton";
import EvidenceReviewedToggle from "@/components/review/EvidenceReviewedToggle";
import { getCandidateStore } from "@/features/candidates/store";
import { getI18n } from "@/i18n/server";
import { formatDateForLocale, localizeAnalysisText } from "@/i18n/translations";
import { requirePageUser } from "@/features/auth/page-guard";
import { getCandidateResumeStore } from "@/features/shortlists/resume-store";
import OptionalPublicCodeForm from "@/components/candidates/OptionalPublicCodeForm";
import { getRoleStore } from "@/features/shortlists/store";
import { evaluateCandidateForRole } from "@/features/shortlists/evaluate";

export const dynamic = "force-dynamic";

export default async function CandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ locale, t }, user] = await Promise.all([getI18n(), requirePageUser(`/candidates/${id}`)]);
  const candidate = await getCandidateStore().getCandidate(user.id, id);
  if (!candidate) notFound();
  const cvClaims = (await getCandidateResumeStore().list(user.id)).get(id) ?? [];
  const statedCvRole = cvClaims.find((claim) => claim.category === "role" && / Engineer$/.test(claim.claim))?.claim;
  const savedRoles = await getRoleStore().list(user.id);
  const roleLeads = savedRoles.map((role) => ({
    role,
    review: evaluateCandidateForRole(candidate, role, cvClaims),
    requiredCount: role.criteria.filter((criterion) => criterion.importance === "required").length,
  })).sort((left, right) => right.review.signaledRequiredCount - left.review.signaledRequiredCount || left.role.title.localeCompare(right.role.title));
  const skillCount = candidate.analyses.reduce((sum, analysis) => sum + analysis.result.skills.length, 0);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><Link href="/candidates" className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-brand-700"><span className="directional-icon">←</span> {t("Back to candidates")}</Link><div className="flex flex-wrap items-center gap-3"><DeleteCandidateButton candidateId={candidate.id} candidateName={candidate.name} /><Link href={`/candidates/${candidate.id}/share`} className="inline-flex min-h-11 items-center text-xs font-semibold text-brand-700 hover:text-brand-500">{t("Export / share report")}</Link><Link href="/compare" className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-500">{t("Compare this candidate")} <span className="directional-icon">→</span></Link></div></div>
      <section className="hero-grid overflow-hidden rounded-[28px] bg-slate-950 text-white shadow-[0_24px_60px_rgba(15,23,42,.18)]"><div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-end lg:p-8"><div><div className="flex flex-wrap gap-2"><Badge tone="brand">{t(candidate.role)}</Badge>{candidate.isDemo && <Badge tone="warning">{t("Demo data")}</Badge>}{candidate.analyses.length > 0 ? <Badge tone="positive">{t("File-grounded")}</Badge> : <Badge tone="neutral">{t("No public-code evidence")}</Badge>}</div><h1 className="mt-4 text-3xl font-semibold tracking-[-.045em] sm:text-5xl">{candidate.name}</h1><p className="mt-3 text-sm text-slate-400">{t("Candidate evidence dossier")} · {t("created {date}", { date: formatDateForLocale(locale, candidate.appliedAt) })}</p></div><dl className="grid grid-cols-3 gap-2"><div className="rounded-xl border border-lime-300/20 bg-lime-300/[.06] p-3 sm:p-4"><dt className="text-[8px] uppercase tracking-wider text-slate-500 sm:text-[9px]">{t("Evidence index")}</dt><dd className="mt-1 text-2xl font-semibold text-lime-300 sm:text-3xl">{candidate.analyses.length > 0 ? candidate.verifiedSkillScore : "—"}</dd></div><div className="rounded-xl border border-white/10 bg-white/[.04] p-3 sm:p-4"><dt className="text-[8px] uppercase tracking-wider text-slate-500 sm:text-[9px]">{t("Repositories")}</dt><dd className="mt-1 text-2xl font-semibold sm:text-3xl">{candidate.repositoryCount ?? 0}</dd></div><div className="rounded-xl border border-white/10 bg-white/[.04] p-3 sm:p-4"><dt className="text-[8px] uppercase tracking-wider text-slate-500 sm:text-[9px]">{t("Skill signals")}</dt><dd className="mt-1 text-2xl font-semibold sm:text-3xl">{skillCount}</dd></div></dl></div><div className="border-t border-white/10 bg-white/[.025] px-6 py-3 text-xs text-slate-500 lg:px-8">{t("Evidence index is derived from categorical implementation depth, not an AI confidence score.")}</div></section>
      {cvClaims.length > 0 && <Card title={t("CV claims awaiting verification")} subtitle={t("These claims came from the candidate's CV and have not been independently verified.")}>{statedCvRole && <p className="mb-3 text-sm text-slate-700">{t("CV-stated role to explore")}: <strong dir="ltr" className="inline-block text-start">{statedCvRole}</strong>. {t("This is not a role-fit verdict.")}</p>}<ul className="flex flex-wrap gap-2">{cvClaims.map((claim) => <li key={claim.claim} className="max-w-full break-words rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">{claim.claim}</li>)}</ul></Card>}
      <Card title={t("Optional public-code review")} subtitle={t("Add evidence to this applicant without creating another candidate record.")}><OptionalPublicCodeForm candidateId={candidate.id} suggestedUrls={(candidate.unanalyzedSources ?? []).filter((source) => /^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(source) && !candidate.repositoryOutcomes.some((outcome) => outcome.repositoryUrl === source))} remaining={Math.max(0, 3 - candidate.repositoryOutcomes.length)} /></Card>
      <Card title={t("Saved roles to explore for this candidate")} subtitle={t("These review leads use candidate-reported CV claims or verified citations, never a hiring verdict.")}>{roleLeads.length ? <ul className="grid gap-3 md:grid-cols-2">{roleLeads.slice(0, 4).map(({ role, review, requiredCount }) => <li key={role.id} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4"><Link href={`/shortlists?role=${encodeURIComponent(role.id)}`} className="break-words text-sm font-semibold text-brand-700 hover:underline">{role.title}</Link><p className="mt-2 text-xs text-slate-600">{requiredCount ? t("{count} of {total} required criteria have a CV claim or verified citation", { count: review.signaledRequiredCount, total: requiredCount }) : t("No recognized required technical criteria; review the brief manually.")}</p></li>)}</ul> : <Link href="/shortlists" className="text-sm font-semibold text-brand-700 hover:underline">{t("Create a role to compare this candidate with a real job brief.")}</Link>}</Card>
      <div className="grid gap-5 lg:grid-cols-[.35fr_.65fr]"><Card title={t("Pipeline progress")} subtitle={t("Candidate stage history")}><StageTimeline events={candidate.stageHistory} /></Card><div className="grid gap-5"><Card title={t("Recruiter summary")} subtitle={t("Evidence available for review")}><div className="grid gap-4 sm:grid-cols-3"><div><span className="text-xs text-slate-400">{t("CV claims grounded")}</span><strong className="mt-1 block text-2xl text-slate-900">{candidate.verifiedClaimCount ?? 0}</strong></div><div><span className="text-xs text-slate-400">{t("Repository reports")}</span><strong className="mt-1 block text-2xl text-slate-900">{candidate.analyses.length}</strong></div><div><span className="text-xs text-slate-400">{t("Current stage")}</span><strong className="mt-1 block text-lg text-slate-900">{t(candidate.furthestStage === "code_review" ? "Code Review" : candidate.furthestStage[0].toUpperCase() + candidate.furthestStage.slice(1))}</strong></div></div></Card><Card title={t("Update candidate status")} subtitle={t("Keep pipeline analytics accurate")}><PipelineEditor candidateId={candidate.id} initialStage={candidate.furthestStage} initialOutcome={candidate.outcome} /></Card><Card title={t("Evidence check")} subtitle={t("Confirm you opened the cited files before deciding")}><EvidenceReviewedToggle candidateId={candidate.id} reviewedAt={candidate.evidenceReviewedAt ?? null} /><p className="mt-3 text-[11px] leading-5 text-slate-400">{t("The mark is cleared automatically when new repository evidence is added.")}</p></Card></div></div>
      <Card title={t("From evidence to a hiring decision")} subtitle={t("Prepare a role-specific interview, capture observations, and close the loop with the candidate.")}><Link href={`/interviews?candidate=${candidate.id}`} className="inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700">{t("Create interview plan")}</Link></Card>
      <section><div className="mb-4"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-brand-700">{t("Analysis status")}</p><h2 className="mt-2 text-xl font-semibold tracking-[-.025em] text-slate-950">{t("Selected repository outcomes")}</h2><p className="mt-1 text-xs text-slate-500">{t("Every selected repository remains visible, including exact failures.")}</p></div><RepositoryOutcomeList candidateId={candidate.id} outcomes={candidate.repositoryOutcomes} />
        {(candidate.unanalyzedSources?.length ?? 0) > 0 && (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm text-slate-900">{t("Sources named on the CV that were not analyzed as evidence")}</strong>
              <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("Unknown, not negative")}</span>
            </div>
            <ul className="mt-2 space-y-1">
              {candidate.unanalyzedSources?.map((source) => (
                <li key={source} className="text-xs text-slate-600"><bdi dir="ltr" className="break-all">{source}</bdi></li>
              ))}
            </ul>
            <p className="mt-2 text-xs leading-5 text-slate-500">{t("Only public GitHub repositories are analyzed as evidence. A portfolio can be scanned for the projects it links, but the page itself stays a claim, and never counts against the candidate.")}</p>
          </div>
        )}
      </section>
      <section><div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-brand-700">{t("Project portfolio")}</p><h2 className="mt-2 text-xl font-semibold tracking-[-.025em] text-slate-950">{t("Repository evidence")}</h2></div><span className="text-xs text-slate-400">{t("Select a project for focused review")}</span></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{candidate.analyses.map((analysis) => <Link key={analysis.id} href={`/candidates/${candidate.id}/projects/${analysis.id}`} className="interactive-card group overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-card"><div className="flex items-start justify-between gap-4"><span className="rounded-lg bg-brand-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-brand-700">{localizeAnalysisText(locale, analysis.projectType)}</span><strong className="font-mono text-2xl text-slate-900">{analysis.evidenceIndex}</strong></div><h3 className="tech-ltr mt-7 text-base font-semibold text-slate-900 group-hover:text-brand-700">{analysis.repositoryName}</h3><p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{locale === "ar" ? `${localizeAnalysisText(locale, analysis.projectType)}. ${analysis.result.strengths.slice(0,2).map((strength) => localizeAnalysisText(locale, strength.title)).join("، ")}.` : analysis.summary}</p><div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 text-[10px] text-slate-400"><span>{t("{patterns} patterns · {files} files", { patterns: analysis.result.patterns.length, files: analysis.result.selectedFiles.length })}</span><span className="font-semibold text-brand-700 transition-transform group-hover:translate-x-1">{t("Inspect")} <span className="directional-icon">→</span></span></div></Link>)}</div></section>
      <div className="space-y-6">{candidate.analyses.map((analysis) => <CandidateEvidenceReport key={analysis.id} analysis={analysis} locale={locale} />)}</div>
    </div>
  );
}
