import { getI18n } from "@/i18n/server";

/**
 * Route-agnostic loading state.
 *
 * This is the root `loading.tsx`, so Next.js uses it as the Suspense fallback
 * for every route beneath it. It must therefore never imply one specific page
 * layout: the previous fixed silhouette (dark hero + four KPI tiles + two chart
 * panels) matched only the dashboard and visibly mismatched Candidates,
 * Analyze, Insights, Requirements and the auth pages.
 *
 * A neutral branded indicator is used instead. The progress bar is fixed, so it
 * reserves no layout space and cannot shift content when the page resolves, and
 * it scales from the centre so it reads identically in LTR and RTL.
 */
export default async function Loading() {
  const { t } = await getI18n();
  return (
    <div role="status" aria-live="polite" aria-label={t("Loading workspace")}>
      <span className="route-loading-bar" aria-hidden="true" />
      <div className="flex min-h-[38vh] flex-col items-center justify-center gap-3">
        <span
          className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600"
          aria-hidden="true"
        />
        <span className="text-sm text-slate-500">{t("Loading…")}</span>
      </div>
    </div>
  );
}
