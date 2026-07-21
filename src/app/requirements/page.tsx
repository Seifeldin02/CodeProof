import RequirementsForm from "@/components/requirements/RequirementsForm";
import PageHeader from "@/components/ui/PageHeader";
import { requirePageUser } from "@/features/auth/page-guard";
import { getRequirementsStore } from "@/features/requirements/store";
import { getI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function RequirementsPage() {
  // Requirements define the hiring bar, so editing them needs an account.
  const [{ t }, user] = await Promise.all([getI18n(), requirePageUser("/requirements")]);
  const requirements = await getRequirementsStore().list(user.id);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("Evaluation setup")} title={t("Company requirements")} description={t("Define the bar every candidate is measured against. Saved requirements are applied automatically to each analysis, so you do not need to paste a job description every time.")} />

      <div className="max-w-4xl">
        <RequirementsForm initial={requirements} />
      </div>

      <p className="max-w-3xl text-xs leading-5 text-slate-400">
        {t("Requirements are matched against implementation evidence found in the candidate's public code. A missing match is reported as an evidence gap, never as proof the candidate lacks the skill.")}
      </p>
    </div>
  );
}
