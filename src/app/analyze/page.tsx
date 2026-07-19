import AnalyzeCandidateWorkflow from "@/components/analyze-candidate-workflow";
import { getI18n } from "@/i18n/server";

export default async function AnalyzeCandidatePage() {
  const { t } = await getI18n();
  return <div className="space-y-6"><header className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-brand-700">{t("Candidate intake")}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.045em] text-slate-950 sm:text-4xl">{t("From résumé to engineering proof.")}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{t("Upload the CV, confirm the public projects that matter, and build one auditable evidence dossier for the recruiter workspace.")}</p></div><div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[.1em]"><span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-500">{t("No execution")}</span><span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-700">{t("$0 core flow")}</span></div></header><AnalyzeCandidateWorkflow /></div>;
}
