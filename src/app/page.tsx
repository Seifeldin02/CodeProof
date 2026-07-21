import Link from "next/link";
import Card from "@/components/ui/Card";
import KpiTile from "@/components/analytics/KpiTile";
import HiringFunnel from "@/components/analytics/HiringFunnel";
import CandidatesTable from "@/components/candidates/CandidatesTable";
import Badge from "@/components/ui/Badge";
import { CheckCircleIcon, GitBranchIcon, SearchCodeIcon, UsersIcon } from "@/components/ui/icons";
import { computeFunnel } from "@/features/hiring-analytics/analytics";
import { getCandidateStore } from "@/features/candidates/store";
import { getI18n } from "@/i18n/server";
import { getCurrentUser } from "@/features/auth/session";
import AuthLanding from "@/components/auth/AuthLanding";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { t } = await getI18n();
  const user = await getCurrentUser();
  if (!user) return <AuthLanding t={t} />;
  const flow = [
    ["CV", t("Local text extraction"), t("PDF or pasted text")],
    ["CODE", t("Bounded archive scan"), t("No code execution")],
    ["PROOF", t("File-backed evidence"), t("Exact source references")],
    ["DECIDE", t("Recruiter review"), t("Compare and interview")],
  ] as const;
  const candidates = await getCandidateStore().listCandidates(user.id);
  const realCandidates = candidates.filter((candidate) => !candidate.isDemo);
  const demoCandidates = candidates.filter((candidate) => candidate.isDemo);
  const operatingCandidates = realCandidates.length ? realCandidates : candidates;
  const repositories = operatingCandidates.reduce((sum, candidate) => sum + (candidate.repositoryCount ?? 0), 0);
  const claims = operatingCandidates.reduce((sum, candidate) => sum + (candidate.verifiedClaimCount ?? 0), 0);
  const averageEvidence = operatingCandidates.length
    ? Math.round(operatingCandidates.reduce((sum, candidate) => sum + candidate.verifiedSkillScore, 0) / operatingCandidates.length)
    : 0;

  return (
    <div className="space-y-6">
      <section className="hero-grid overflow-hidden rounded-[28px] bg-[#0b1210] px-6 py-8 text-white shadow-[0_28px_70px_rgba(6,18,13,.2)] lg:px-10 lg:py-11">
        <div className="grid gap-9 xl:grid-cols-[1.18fr_.82fr] xl:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[.2em] text-lime-300">{t("Recruiter command center")}</p>
              <span className="rounded-full border border-white/10 bg-white/[.05] px-2.5 py-1 text-[10px] font-medium text-slate-400">{t("No paid API required")}</span>
            </div>
            <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-[1.12] tracking-[-.055em] sm:text-5xl xl:text-[58px]">{t("See the engineer behind the résumé.")}</h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">{t("CodeProof turns a candidate CV and public projects into an auditable evidence dossier. Recruiters get a clear decision surface; engineers can trace every claim back to source.")}</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/analyze" className="group inline-flex min-h-12 items-center justify-between gap-8 rounded-xl bg-lime-300 px-5 py-3.5 text-sm font-semibold text-slate-950 transition-all duration-300 hover:-translate-y-0.5 hover:bg-lime-200 hover:shadow-[0_12px_30px_rgba(185,255,107,.18)]">{t("Analyze a candidate")} <span className="directional-icon transition-transform group-hover:translate-x-1">→</span></Link>
              <Link href="/compare" className="group inline-flex min-h-12 items-center justify-between gap-8 rounded-xl border border-white/15 bg-white/[.025] px-5 py-3.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/[.07]">{t("Compare evidence")} <span className="directional-icon transition-transform group-hover:translate-x-1">↗</span></Link>
            </div>
          </div>

          <div className="relative rounded-2xl border border-white/10 bg-white/[.035] p-4 shadow-2xl backdrop-blur sm:p-5">
            <div className="mb-5 flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">{t("Evidence pipeline")}</span><span className="flex items-center gap-2 text-[10px] text-lime-300"><i className="live-dot" /> {t("Ready")}</span></div>
            <div className="relative space-y-2.5">
              <span aria-hidden="true" className="absolute bottom-5 start-[31px] top-5 w-px bg-gradient-to-b from-lime-300/70 via-brand-500/50 to-white/10" />
              {flow.map(([label, copy, detail], index) => (
                <div key={label} className="relative flex items-center gap-4 rounded-xl border border-white/[.07] bg-black/10 p-3 transition duration-300 hover:translate-x-1 hover:border-white/15 hover:bg-white/[.035]">
                  <span className={`evidence-node relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-lg font-mono text-[9px] font-semibold ${index === 2 ? "bg-lime-300 text-slate-950" : "bg-[#202825] text-slate-300"}`}>{label}</span>
                  <div><strong className="block text-xs text-white">{copy}</strong><span className="mt-1 block text-[10px] text-slate-500">{detail}</span></div>
                  <span className="ms-auto font-mono text-[10px] text-slate-600">0{index + 1}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-brand-700">{t("Live workspace")}</p><h2 className="mt-1 text-xl font-semibold tracking-[-.025em] text-slate-950">{t("Evidence at a glance")}</h2></div>
        {demoCandidates.length > 0 && <Badge tone={realCandidates.length ? "neutral" : "warning"}>{realCandidates.length ? t(demoCandidates.length === 1 ? "{count} demo record excluded" : "{count} demo records excluded", { count: demoCandidates.length }) : t("Demo-only view")}</Badge>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label={t("Candidates analyzed")} value={String(operatingCandidates.length)} hint={t(realCandidates.length ? "Real candidate records" : "Current workspace records")} icon={UsersIcon} />
        <KpiTile label={t("Repositories inspected")} value={String(repositories)} hint={t("Bounded public archives")} icon={GitBranchIcon} />
        <KpiTile label={t("CV claims grounded")} value={String(claims)} hint={t("Backed by source files")} icon={CheckCircleIcon} iconTone="positive" />
        <KpiTile label={t("Average evidence index")} value={operatingCandidates.length ? String(averageEvidence) : "—"} hint={t("Categorical depth, not confidence")} icon={SearchCodeIcon} iconTone="positive" />
      </div>

      {candidates.length === 0 ? (
        <Card className="border-dashed bg-white/70" bodyClassName="py-16">
          <div className="mx-auto max-w-xl text-center"><span className="evidence-node mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-700"><SearchCodeIcon className="h-6 w-6" /></span><h2 className="mt-5 text-xl font-semibold tracking-[-.02em] text-slate-900">{t("Your evidence workspace is ready")}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{t("Upload a CV to create the first real candidate dossier. A clearly labeled sample remains available as a backup demo.")}</p><Link href="/analyze" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-brand-700">{t("Start first analysis")}</Link></div>
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1.45fr_.55fr]">
          <Card title={t("Recent candidates")} subtitle={t("Newest CodeProof evidence dossiers")} bodyClassName="!p-0" action={<Link href="/candidates" className="whitespace-nowrap text-xs font-semibold text-brand-700 hover:text-brand-500">{t("View all")} <span className="directional-icon">→</span></Link>}><CandidatesTable candidates={candidates.slice(0, 6)} /></Card>
          <Card title={t("Pipeline movement")} subtitle={t(realCandidates.length ? "Real candidate stages" : "Demo candidate stages")}><HiringFunnel data={computeFunnel(operatingCandidates)} /></Card>
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["01", t("Candidate intake"), t("PDF extraction surfaces real GitHub projects for recruiter confirmation.")],
          ["02", t("Engineering proof"), t("Static analysis maps architecture, tests, APIs, state and error handling to files.")],
          ["03", t("Hiring decision"), t("Compare grounded strengths, target interviews and explain pipeline outcomes.")],
        ].map(([number, title, copy]) => <article key={number} className="interactive-card rounded-2xl border border-slate-200/80 bg-white/90 p-5"><div className="flex items-center justify-between"><span className="font-mono text-xs font-semibold text-brand-700">{number}</span><span className="h-1.5 w-1.5 rounded-full bg-brand-400" /></div><h3 className="mt-8 text-base font-semibold tracking-[-.015em] text-slate-900">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{copy}</p></article>)}
      </section>
      <section className="rounded-[24px] border border-slate-200/80 bg-white/90 p-6 shadow-card sm:p-8"><div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-brand-700">{t("Evidence-based verification, explained simply")}</p><h2 className="mt-3 text-2xl font-semibold tracking-[-.03em] text-slate-950">{t("Employer-ready evidence, not résumé guesswork.")}</h2><p className="mt-3 max-w-3xl text-sm leading-7 text-slate-500">{t("CodeProof reads the candidate's own public work as bounded text, identifies implementation signals, and shows recruiters exactly where each signal came from.")}</p></div><Link href="/about" className="inline-flex min-h-12 items-center justify-between gap-8 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-brand-700">{t("Learn how CodeProof works")} <span className="directional-icon">→</span></Link></div></section>
    </div>
  );
}
