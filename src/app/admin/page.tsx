import { requireAdminPage } from "@/features/auth/admin-guard";
import { getI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdminPage();
  const { locale } = await getI18n();
  const copy = locale === "ar"
    ? {
        eyebrow: "مساحة داخلية محمية",
        title: "مركز عمليات CodeProof",
        body: "لا تعرض هذه المساحة إلا البيانات الإدارية المسندة إلى السجلات الدائمة. ستظهر المقاييس والحسابات هنا عند اكتمال مصادرها.",
      }
    : {
        eyebrow: "Protected internal workspace",
        title: "CodeProof operations center",
        body: "This surface only exposes administration grounded in persisted records. Metrics and accounts appear here as their source queries become available.",
      };
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[.16em] text-emerald-700">{copy.eyebrow}</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-.04em] text-slate-950">{copy.title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{copy.body}</p>
    </div>
  );
}
