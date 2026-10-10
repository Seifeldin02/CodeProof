import Link from "next/link";
import CoverageCheck from "@/components/cv-coverage/CoverageCheck";
import PageHeader from "@/components/ui/PageHeader";
import { requirePageUser } from "@/features/auth/page-guard";
import { getI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function CoveragePage() {
  const [{ t }] = await Promise.all([getI18n(), requirePageUser("/cv-coverage")]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("Before you screen")}
        title={t("How many CVs come with code?")}
        description={t("Code evidence only helps when applicants link to code. Count that for one role before you analyze anyone, so you know whether to read code, ask candidates for it, or go straight to your test.")}
        actions={<Link href="/analyze" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50">{t("Analyze a candidate")}</Link>}
      />
      <CoverageCheck />
    </div>
  );
}
