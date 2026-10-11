import type { ReactNode } from "react";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import EvidenceReviewedToggle from "./EvidenceReviewedToggle";
import type { ReviewQueueEntry, ReviewTier } from "@/features/review-queue/queue";
import { NEXT_STEP_LABEL, nextStepReason, TIER_LABEL, UNKNOWN_LABEL, unknownValues } from "@/features/review-queue/wording";
import { formatDateForLocale, translate, type Locale, type TranslationValues } from "@/i18n/translations";

const TIER_TONE: Record<ReviewTier, "positive" | "brand" | "warning" | "neutral"> = {
  review_first: "positive",
  review: "brand",
  verify_in_interview: "warning",
  evidence_incomplete: "neutral",
};

function Signal({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "positive" | "warning" }) {
  const classes = tone === "positive" ? "border-emerald-200 bg-emerald-50/60 text-emerald-800" : tone === "warning" ? "border-amber-200 bg-amber-50/60 text-amber-800" : "border-slate-200 bg-white text-slate-700";
  return <li className={`rounded-lg border px-2.5 py-1.5 text-xs leading-5 ${classes}`}>{children}</li>;
}

function Entry({ entry, position, locale }: { entry: ReviewQueueEntry; position: number; locale: Locale }) {
  const t = (key: string, values?: TranslationValues) => translate(locale, key, values);
  const { requirements, claims } = entry;
  const supported = requirements ? requirements.strong + requirements.partial : 0;

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden="true" className="tnum grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-950 font-mono text-sm font-semibold text-white">{position}</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold"><Link href={`/candidates/${entry.id}`} className="text-slate-950 hover:text-brand-700">{entry.name}</Link></h3>
              <Badge tone={TIER_TONE[entry.tier]}>{t(TIER_LABEL[entry.tier])}</Badge>
              {entry.isDemo && <Badge tone="warning">{t("Demo")}</Badge>}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {t(entry.role)} · {entry.repositories.analyzed === 1 ? t("1 repository analyzed") : t("{count} repositories analyzed", { count: entry.repositories.analyzed })}
            </p>
          </div>
        </div>
        <Link href={`/candidates/${entry.id}`} className="inline-flex min-h-11 items-center text-xs font-semibold text-brand-700 hover:text-brand-500">
          {t("Open dossier")} <span className="directional-icon ms-1">→</span>
        </Link>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">{t("Why this position")}</h4>
          <ul className="mt-2 space-y-1.5">
            {entry.repositories.analyzed === 0 && (
              <Signal>{t("No code has been read for this candidate yet, so they are listed after candidates whose code was read, in the order they applied.")}</Signal>
            )}
            {requirements && requirements.judged > 0 && entry.repositories.analyzed > 0 && (
              <Signal tone={requirements.unsupported === 0 ? "positive" : "neutral"}>
                {t("{supported} of {judged} requirements have repository evidence ({strong} strong)", { supported, judged: requirements.judged, strong: requirements.strong })}
              </Signal>
            )}
            {entry.strongSkills === 1 && <Signal tone="positive">{t("1 skill with strong or good implementation evidence")}</Signal>}
            {entry.strongSkills > 1 && <Signal tone="positive">{t("{count} skills with strong or good implementation evidence", { count: entry.strongSkills })}</Signal>}
            {claims && <Signal>{t("CV claims: {grounded} grounded, {unverified} still to verify", { grounded: claims.grounded, unverified: claims.unverified })}</Signal>}
            {entry.undersold.length > 0 && (
              <Signal tone="positive">
                {t("The CV undersells the code:")} <span className="tech-ltr font-medium">{entry.undersold.join(", ")}</span>
              </Signal>
            )}
            {entry.confirmedRepositories > 0 && (
              <Signal tone="positive">
                {t("The candidate proved the GitHub account behind {count} of {total} analyzed repositories is theirs", { count: entry.confirmedRepositories, total: entry.repositories.analyzed })}
              </Signal>
            )}
            {requirements && requirements.unsupportedNames.length > 0 && (
              <Signal tone="warning">
                {t("No repository evidence yet for:")} <span className="tech-ltr font-medium">{requirements.unsupportedNames.join(", ")}</span>
              </Signal>
            )}
            {entry.repositories.analyzed > 0 && entry.strongSkills === 0 && !claims && (!requirements || requirements.judged === 0) && (
              <Signal>{t("Repository evidence exists but nothing reached strong or good depth yet.")}</Signal>
            )}
          </ul>
          {entry.citedFiles.length > 0 && (
            <p className="mt-3 text-[11px] text-slate-500">
              {t("Cited files")}: <code dir="ltr" className="break-all text-start text-[10px] text-brand-700">{entry.citedFiles.join(" · ")}</code>
            </p>
          )}
          <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/60 p-3">
            <h4 className="text-[10px] font-semibold uppercase tracking-[.14em] text-brand-700">{t("Drafted next step")}</h4>
            <p className="mt-1.5 text-sm font-semibold text-slate-900">{t(NEXT_STEP_LABEL[entry.nextStep])}</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">{t(nextStepReason(entry))}</p>
            {entry.nextStep === "ask_for_evidence" && !entry.evidenceRequestedAt && (
              <Link href={`/candidates/${entry.id}#candidate-evidence`} className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-brand-700 hover:text-brand-500">
                {t("Ask the candidate for evidence")} <span className="directional-icon ms-1">→</span>
              </Link>
            )}
          </div>
        </div>

        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">{t("Unknown, not negative")}</h4>
          {entry.unknowns.length === 0 ? (
            <p className="mt-2 text-xs leading-5 text-slate-500">{t("Every input was available for this candidate.")}</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {entry.unknowns.map((signal) => (
                <li key={signal} className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs leading-5 text-slate-600">
                  {t(UNKNOWN_LABEL[signal], unknownValues(entry, signal, (iso) => formatDateForLocale(locale, iso)))}
                  {signal === "sources_not_analyzed" && (
                    <span dir="ltr" className="mt-1 block break-all text-start text-[10px] text-slate-500">{entry.unanalyzedSources.join(" · ")}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 border-t border-slate-100 pt-3">
            <EvidenceReviewedToggle candidateId={entry.id} reviewedAt={entry.evidenceReviewedAt} />
          </div>
        </div>
      </div>
    </li>
  );
}

export default function ReviewQueueList({ entries, locale }: { entries: ReviewQueueEntry[]; locale: Locale }) {
  return (
    <ol className="space-y-4">
      {entries.map((entry, index) => <Entry key={entry.id} entry={entry} position={index + 1} locale={locale} />)}
    </ol>
  );
}
