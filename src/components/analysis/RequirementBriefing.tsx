import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { localizeAnalysisText, translate, type Locale } from "@/i18n/translations";
import type { JobMatch, JobRequirementMatch } from "@/types/analysis";

/**
 * Strengths and gaps against the company's own requirements.
 *
 * The matching engine already produced this verdict, but nothing rendered it in
 * the recruiter workspace, so evaluators never saw it. Strengths and gaps are
 * shown side by side, and a gap is always described as missing evidence in this
 * repository rather than proof the candidate lacks the skill.
 */

function importanceTone(importance: JobRequirementMatch["importance"]): "brand" | "neutral" {
  return importance === "required" ? "brand" : "neutral";
}

function RequirementRow({ item, locale, accent }: { item: JobRequirementMatch; locale: Locale; accent: "positive" | "warning" | "neutral" }) {
  const border =
    accent === "positive" ? "border-emerald-200 bg-emerald-50/50" : accent === "warning" ? "border-amber-200 bg-amber-50/50" : "border-slate-200 bg-white";
  return (
    <li className={`rounded-lg border p-3.5 ${border}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <strong className="text-sm text-slate-900">{localizeAnalysisText(locale, item.requirement)}</strong>
        <Badge tone={importanceTone(item.importance)}>{translate(locale, item.importance)}</Badge>
      </div>
      <p className="mt-1.5 text-xs leading-5 text-slate-600">{localizeAnalysisText(locale, item.explanation)}</p>
      {item.files.length > 0 && (
        <code dir="ltr" className="mt-2 block break-all text-start text-[10px] text-brand-700">
          {item.files.slice(0, 4).join(" · ")}
        </code>
      )}
    </li>
  );
}

export default function RequirementBriefing({ jobMatch, locale }: { jobMatch: JobMatch | null; locale: Locale }) {
  const t = (key: string) => translate(locale, key);

  if (!jobMatch) {
    return (
      <section>
        <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-brand-700">{t("Requirement evaluation")}</p>
        <h3 className="mt-2 text-xl font-semibold text-slate-900">{t("Measured against your company requirements")}</h3>
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm text-slate-600">{t("No company requirements are saved yet.")}</p>
          <Link href="/requirements" className="mt-3 inline-flex min-h-11 items-center text-xs font-semibold text-brand-700 hover:text-brand-500">
            {t("Define company requirements")} <span className="directional-icon ms-1">→</span>
          </Link>
        </div>
      </section>
    );
  }

  const strengths = jobMatch.strongMatches;
  const partial = jobMatch.partialMatches;
  const gaps = jobMatch.unsupportedRequirements;

  return (
    <section>
      <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-brand-700">{t("Requirement evaluation")}</p>
      <h3 className="mt-2 text-xl font-semibold text-slate-900">{t("Measured against your company requirements")}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{localizeAnalysisText(locale, jobMatch.summary)}</p>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[.12em] text-emerald-700">
            {t("Strong points")} <span className="tnum font-normal text-slate-400">({strengths.length})</span>
          </h4>
          <ul className="mt-3 space-y-2">
            {strengths.length === 0 ? (
              <li className="rounded-lg border border-slate-200 bg-white p-3.5 text-xs text-slate-500">
                {t("No requirement reached strong implementation evidence in this repository.")}
              </li>
            ) : (
              strengths.map((item) => <RequirementRow key={item.requirement} item={item} locale={locale} accent="positive" />)
            )}
          </ul>

          {partial.length > 0 && (
            <>
              <h4 className="mt-5 text-xs font-semibold uppercase tracking-[.12em] text-slate-500">
                {t("Partial evidence")} <span className="tnum font-normal text-slate-400">({partial.length})</span>
              </h4>
              <ul className="mt-3 space-y-2">
                {partial.map((item) => <RequirementRow key={item.requirement} item={item} locale={locale} accent="neutral" />)}
              </ul>
            </>
          )}
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[.12em] text-amber-700">
            {t("Weak points")} <span className="tnum font-normal text-slate-400">({gaps.length})</span>
          </h4>
          <ul className="mt-3 space-y-2">
            {gaps.length === 0 ? (
              <li className="rounded-lg border border-slate-200 bg-white p-3.5 text-xs text-slate-500">
                {t("Every saved requirement has at least partial evidence.")}
              </li>
            ) : (
              gaps.map((item) => <RequirementRow key={item.requirement} item={item} locale={locale} accent="warning" />)
            )}
          </ul>
        </div>
      </div>

      <p className="mt-4 text-[11px] leading-5 text-slate-400">{localizeAnalysisText(locale, jobMatch.scoringMethod)}</p>
    </section>
  );
}
