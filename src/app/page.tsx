import Link from "next/link";
import Card from "@/components/ui/Card";
import HiringFunnel from "@/components/analytics/HiringFunnel";
import Badge from "@/components/ui/Badge";
import { SearchCodeIcon } from "@/components/ui/icons";
import { ApplicantList, AttentionList, CommandHero, RoleBoards } from "@/components/command-center/CommandCenter";
import { computeFunnel } from "@/features/hiring-analytics/analytics";
import { getCandidateStore } from "@/features/candidates/store";
import type { CandidateDetail } from "@/features/candidates/types";
import { buildCommandCenter } from "@/features/command-center/overview";
import { getI18n } from "@/i18n/server";
import { getCurrentUser } from "@/features/auth/session";
import AuthLanding from "@/components/auth/AuthLanding";
import { getInterviewStore } from "@/features/interviews/store";
import { getCandidateResumeStore } from "@/features/shortlists/resume-store";
import { getRoleStore } from "@/features/shortlists/store";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { t, locale } = await getI18n();
  const user = await getCurrentUser();
  if (!user) return <AuthLanding t={t} />;
  const store = getCandidateStore();
  const [candidates, roles, resumeClaims, sessions] = await Promise.all([
    store.listCandidates(user.id),
    getRoleStore().list(user.id),
    getCandidateResumeStore().list(user.id),
    getInterviewStore().list(user.id),
  ]);
  // Bound concurrent database reads, the same way the role review does.
  const details: CandidateDetail[] = [];
  for (let offset = 0; offset < candidates.length; offset += 16) {
    const batch = await Promise.all(candidates.slice(offset, offset + 16).map((candidate) => store.getCandidate(user.id, candidate.id)));
    for (const detail of batch) if (detail) details.push(detail);
  }
  const overview = buildCommandCenter({ candidates: details, roles, resumeClaims, sessions, today: new Date().toLocaleDateString("en-CA") });
  const realCandidates = candidates.filter((candidate) => !candidate.isDemo);
  const operatingCandidates = realCandidates.length ? realCandidates : candidates;

  return (
    <div className="space-y-6">
      <CommandHero t={t} overview={overview} />

      {candidates.length === 0 ? (
        <Card className="border-dashed bg-white/70" bodyClassName="py-16">
          <div className="mx-auto max-w-xl text-center"><span className="evidence-node mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-700"><SearchCodeIcon className="h-6 w-6" /></span><h2 className="mt-5 text-xl font-semibold tracking-[-.02em] text-slate-900">{t("Your evidence workspace is ready")}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{t("Upload your CV to create your first candidate evidence dossier.")}</p><Link href="/analyze" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-brand-700">{t("Start first analysis")}</Link></div>
        </Card>
      ) : (
        <>
          {overview.pool.demoExcluded > 0 && <div className="flex justify-end"><Badge tone="neutral">{t(overview.pool.demoExcluded === 1 ? "{count} demo record excluded" : "{count} demo records excluded", { count: overview.pool.demoExcluded })}</Badge></div>}
          <RoleBoards t={t} boards={overview.boards} />
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,.7fr)]">
            <ApplicantList t={t} locale={locale} applicants={overview.applicants} />
            <AttentionList t={t} locale={locale} items={overview.attention} />
          </div>
          <Card title={t("Pipeline movement")} subtitle={t(realCandidates.length ? "Real candidate stages" : "Demo candidate stages")}><HiringFunnel data={computeFunnel(operatingCandidates)} /></Card>
        </>
      )}

      <section className="rounded-[24px] border border-slate-200/80 bg-white/90 p-6 shadow-card sm:p-8"><div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-brand-700">{t("Evidence-based verification, explained simply")}</p><h2 className="mt-3 text-2xl font-semibold tracking-[-.03em] text-slate-950">{t("Employer-ready evidence, not résumé guesswork.")}</h2><p className="mt-3 max-w-3xl text-sm leading-7 text-slate-500">{t("CodeProof reads the candidate's own public work as bounded text, identifies implementation signals, and shows recruiters exactly where each signal came from.")}</p></div><Link href="/about" className="inline-flex min-h-12 items-center justify-between gap-8 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-brand-700">{t("Learn how CodeProof works")} <span className="directional-icon">→</span></Link></div></section>
    </div>
  );
}
