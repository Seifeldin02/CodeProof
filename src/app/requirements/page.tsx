import { redirect } from "next/navigation";
import RequirementsForm from "@/components/requirements/RequirementsForm";
import { getCurrentUser } from "@/features/auth/session";
import { getRequirementsStore } from "@/features/requirements/store";
import { getI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function RequirementsPage() {
  // Requirements define the hiring bar, so editing them needs an account.
  if (!(await getCurrentUser())) redirect("/signin?next=/requirements");

  const { t } = await getI18n();
  const requirements = getRequirementsStore().list();

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-brand-700">{t("Evaluation setup")}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em] text-slate-950 sm:text-4xl">
          {t("Company requirements")}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          {t("Define the bar every candidate is measured against. Saved requirements are applied automatically to each analysis, so you do not need to paste a job description every time.")}
        </p>
      </header>

      <div className="max-w-4xl">
        <RequirementsForm initial={requirements} />
      </div>

      <p className="max-w-3xl text-xs leading-5 text-slate-400">
        {t("Requirements are matched against implementation evidence found in the candidate's public code. A missing match is reported as an evidence gap, never as proof the candidate lacks the skill.")}
      </p>
    </div>
  );
}
