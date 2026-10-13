import { redirect } from "next/navigation";
import AnalyzeCandidateWorkflow from "@/components/analyze-candidate-workflow";
import PageHeader from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/features/auth/session";
import { getRoleStore } from "@/features/shortlists/store";
import { ARCHIVE_LIMITS, FILE_LIMITS } from "@/services/github";
import { getI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function AnalyzeCandidatePage() {
  // Uploading creates candidate records, so this page requires an account.
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/analyze");

  // The roles this account saved in Role review: the only roles an applicant can be reviewed for here.
  const savedRoles = (await getRoleStore().list(user.id)).map(({ id, title, description }) => ({ id, title, description }));

  const { t } = await getI18n();
  return <div className="space-y-6"><PageHeader eyebrow={t("Candidate intake")} title={t("From résumé to engineering proof.")} description={t("Upload the CV, confirm the public projects that matter, and build one auditable evidence dossier for the recruiter workspace.")} actions={<span className="rounded-full border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-[.1em] text-slate-500">{t("No execution")}</span>} /><AnalyzeCandidateWorkflow savedRoles={savedRoles} limits={{ transportMegabytes: Math.round(ARCHIVE_LIMITS.maxCompressedBytes / (1024 * 1024)), analyzableFiles: FILE_LIMITS.maxTreeEntries }} /></div>;
}
