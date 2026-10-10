import Link from "next/link";
import { redirect } from "next/navigation";
import AnalyzeCandidateWorkflow from "@/components/analyze-candidate-workflow";
import PageHeader from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/features/auth/session";
import { getI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function AnalyzeCandidatePage() {
  // Uploading creates candidate records, so this page requires an account.
  if (!(await getCurrentUser())) redirect("/signin?next=/analyze");

  const { t } = await getI18n();
  return <div className="space-y-6"><PageHeader eyebrow={t("Candidate intake")} title={t("From résumé to engineering proof.")} description={t("Upload the CV, confirm the public projects that matter, and build one auditable evidence dossier for the recruiter workspace.")} actions={<div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[.1em]"><span className="rounded-full border border-slate-200 bg-white px-3 py-2 text-slate-500">{t("No execution")}</span><span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">{t("$0 core flow")}</span></div>} /><p className="text-xs leading-5 text-slate-500">{t("Screening a whole role?")} <Link href="/cv-coverage" className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline-offset-2 hover:underline">{t("First count how many CVs link to code")} <span className="directional-icon ms-1">→</span></Link></p><AnalyzeCandidateWorkflow /></div>;
}
