"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/LocaleProvider";
import {
  PIPELINE_STAGES,
  STAGE_LABELS,
  type CandidateOutcome,
  type PipelineStage,
} from "@/features/hiring-analytics/types";

const OUTCOMES: Array<{ value: CandidateOutcome; label: string }> = [
  { value: "in_progress", label: "In progress" },
  { value: "hired", label: "Hired" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
];

export default function PipelineEditor({
  candidateId,
  initialStage,
  initialOutcome,
}: {
  candidateId: string;
  initialStage: PipelineStage;
  initialOutcome: CandidateOutcome;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [stage, setStage] = useState(initialStage);
  const [outcome, setOutcome] = useState(initialOutcome);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function save(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/candidates/${candidateId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage, outcome }),
      });
      if (!response.ok) throw new Error(t("Candidate status could not be updated."));
      setMessage({ tone: "success", text: t("Candidate status updated.") });
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : t("Candidate status could not be updated.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-600">
          {t("Pipeline stage")}
          <select value={stage} onChange={(event) => setStage(event.target.value as PipelineStage)} className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-50">
            {PIPELINE_STAGES.map((item) => <option key={item} value={item}>{t(STAGE_LABELS[item])}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          {t("Hiring outcome")}
          <select value={outcome} onChange={(event) => setOutcome(event.target.value as CandidateOutcome)} disabled={stage === "hired"} className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-50 disabled:bg-slate-100">
            {OUTCOMES.map((item) => <option key={item.value} value={item.value}>{t(item.label)}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={busy || (stage === initialStage && outcome === initialOutcome)} className="min-h-11 rounded-xl bg-slate-950 px-4 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-45">
          {t(busy ? "Saving…" : "Save candidate status")}
        </button>
        {message && <p role="status" className={`text-xs ${message.tone === "success" ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</p>}
      </div>
      <p className="text-[11px] leading-5 text-slate-400">{t("Pipeline changes update this account's dashboard and Hiring Insights automatically.")}</p>
    </div>
  );
}
