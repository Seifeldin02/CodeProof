import { requireAdminPage } from "@/features/auth/admin-guard";
import { getAdminAuditStore } from "@/features/admin/store";
import { redactAdministrativeValue } from "@/features/admin/audit";
import { getI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  await requireAdminPage();
  const [{ locale }, entries] = await Promise.all([getI18n(), getAdminAuditStore().list()]);
  const copy = locale === "ar"
    ? { title: "سجل التدقيق", empty: "لا توجد إجراءات إدارية مسجلة بعد.", sequence: "التسلسل" }
    : { title: "Audit log", empty: "No administrative actions have been recorded yet.", sequence: "Sequence" };
  const safeEntries = redactAdministrativeValue(entries) as typeof entries;
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
      <h1 className="text-2xl font-semibold text-slate-950">{copy.title}</h1>
      {safeEntries.length === 0 ? <p className="mt-4 text-sm text-slate-600">{copy.empty}</p> : (
        <ol className="mt-5 space-y-3">
          {safeEntries.slice(-100).reverse().map((entry) => (
            <li key={entry.id} className="rounded-xl border border-slate-200 p-4 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-semibold text-slate-950">{entry.action}</span>
                <span className="font-mono text-xs text-slate-500">{copy.sequence} {entry.sequence}</span>
              </div>
              <p className="mt-2 text-slate-600">{entry.outcome} · <time dateTime={entry.occurredAt}>{entry.occurredAt}</time></p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
