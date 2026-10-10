"use client";

import { useI18n } from "@/components/i18n/LocaleProvider";
import type { ReviewQueueEntry } from "@/features/review-queue/queue";
import { NEXT_STEP_LABEL, TIER_LABEL, UNKNOWN_LABEL } from "@/features/review-queue/wording";
import { toCsv } from "@/lib/csv";

/**
 * Downloads the drafted order as a spreadsheet, so the recruiter can paste the
 * list of candidates to test into the assessment tool they already use. The
 * file is built in the browser from what is on screen; nothing is sent anywhere.
 */
export default function ExportQueueButton({ entries }: { entries: ReviewQueueEntry[] }) {
  const { t } = useI18n();

  function download(): void {
    const header = [
      t("Position"), t("Candidate"), t("Role"), t("Drafted next step"), t("Review group"),
      t("Required requirements with evidence"), t("Required requirements judged"), t("Skills with strong or good evidence"),
      t("Skills the CV does not mention"), t("No repository evidence yet for"), t("Unknown, not negative"), t("Cited files"), t("Evidence checked"),
    ];
    const rows = entries.map((entry, index) => [
      index + 1,
      entry.name,
      t(entry.role),
      t(NEXT_STEP_LABEL[entry.nextStep]),
      t(TIER_LABEL[entry.tier]),
      entry.requirements ? entry.requirements.strong + entry.requirements.partial : "",
      entry.requirements ? entry.requirements.judged : "",
      entry.strongSkills,
      entry.undersold.join("; "),
      entry.requirements?.unsupportedNames.join("; ") ?? "",
      entry.unknowns.map((signal) => t(UNKNOWN_LABEL[signal], { count: signal === "sources_not_analyzed" ? entry.unanalyzedSources.length : entry.repositories.failed })).join("; "),
      entry.citedFiles.join("; "),
      entry.evidenceReviewedAt ? t("Yes") : t("No"),
    ]);
    const url = URL.createObjectURL(new Blob([toCsv([header, ...rows])], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `codeproof-review-order-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" onClick={download} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50">
      {t("Export order (CSV)")}
    </button>
  );
}
