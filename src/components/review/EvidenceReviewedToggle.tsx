"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { CheckCircleIcon } from "@/components/ui/icons";
import { formatDateForLocale } from "@/i18n/translations";

/**
 * The human-in-the-loop step. A drafted review order is only safe if the
 * recruiter actually opens the cited files, so they record that they did.
 * The flag changes nothing in the analysis; it is a visible audit mark.
 */
export default function EvidenceReviewedToggle({ candidateId, reviewedAt }: { candidateId: string; reviewedAt: string | null }) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/candidates/${candidateId}/review`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reviewed: !reviewedAt }),
      });
      if (!response.ok) throw new Error("save-failed");
      router.refresh();
    } catch {
      setError(t("Evidence check could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  const label = busy ? t("Saving…") : reviewedAt ? t("Undo check") : t("Mark evidence as checked");
  return (
    <div className="flex flex-wrap items-center gap-2">
      {reviewedAt && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
          <CheckCircleIcon className="h-3.5 w-3.5" />
          {t("Evidence checked {date}", { date: formatDateForLocale(locale, reviewedAt) })}
        </span>
      )}
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={Boolean(reviewedAt)}
        className={`min-h-11 rounded-xl px-4 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${reviewedAt ? "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50" : "bg-slate-950 text-white hover:bg-brand-700"}`}
      >
        {label}
      </button>
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}
