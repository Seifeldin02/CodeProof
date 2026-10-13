import { getI18n } from "@/i18n/server";

/**
 * Shown for a link that never existed, has expired or was withdrawn. The three look the same on purpose, so the page
 * tells a stranger nothing about which links exist. A visitor has no workspace to go back to, so none is offered.
 */
export default async function SharedReportUnavailable() {
  const { locale } = await getI18n();
  const copy = locale === "ar" ? {
    title: "هذا التقرير المشترك غير متاح",
    body: "ربما انتهت صلاحية الرابط أو سحبه مرسله. اطلب رابطاً جديداً ممن أرسله إليك.",
  } : {
    title: "This shared report is not available",
    body: "The link may have expired or been withdrawn by the person who sent it. Ask them for a new one.",
  };
  return <div className="mx-auto min-h-[60vh] max-w-xl px-4 py-16 sm:px-8">
    <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-card">
      <h1 className="text-2xl font-semibold tracking-[-.03em] text-slate-950">{copy.title}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">{copy.body}</p>
    </div>
  </div>;
}
