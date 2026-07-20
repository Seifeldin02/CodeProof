"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/LocaleProvider";
import type { CandidateRepositoryOutcome } from "@/features/candidates/types";
import { localizeAnalysisText } from "@/i18n/translations";

export default function RepositoryOutcomeList({ candidateId, outcomes }: { candidateId: string; outcomes: CandidateRepositoryOutcome[] }) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [working, setWorking] = useState<Record<string, "retry" | "remove">>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function act(outcome: CandidateRepositoryOutcome, action: "retry" | "remove"): Promise<void> {
    setWorking((current) => ({ ...current, [outcome.id]: action }));
    setErrors((current) => ({ ...current, [outcome.id]: "" }));
    try {
      const response = await fetch(`/api/candidates/${candidateId}/repositories`, {
        method: action === "retry" ? "POST" : "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repositoryUrl: outcome.repositoryUrl }),
      });
      if (!response.ok) {
        const payload = await response.json() as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? (action === "retry" ? "Repository retry failed." : "Repository removal failed."));
      }
      router.refresh();
    } catch (error) {
      setErrors((current) => ({ ...current, [outcome.id]: error instanceof Error ? error.message : "Repository action failed." }));
    } finally {
      setWorking((current) => { const next = { ...current }; delete next[outcome.id]; return next; });
    }
  }

  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{outcomes.map((outcome) => {
    const failed = outcome.status === "failed";
    const active = working[outcome.id];
    return <article key={outcome.id} className={`rounded-2xl border p-4 ${failed ? "border-rose-200 bg-rose-50/70" : "border-emerald-200 bg-emerald-50/60"}`}>
      <div className="flex items-start justify-between gap-3"><strong dir="ltr" className="min-w-0 break-all text-start text-sm text-slate-900">{outcome.repositoryName}</strong><span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider ${failed ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>{t(active === "retry" ? "Analyzing" : failed ? "Failed" : "Analyzed successfully")}</span></div>
      {failed && <><p role="alert" className="mt-3 text-xs leading-5 text-rose-800">{localizeAnalysisText(locale, outcome.message ?? "Repository analysis failed.")}</p>{outcome.code && <code dir="ltr" className="mt-2 block text-start text-[9px] text-rose-500">{outcome.code}</code>}<div className="mt-4 flex gap-2"><button type="button" disabled={Boolean(active)} onClick={() => act(outcome, "retry")} className="min-h-11 rounded-lg bg-slate-950 px-4 text-xs font-semibold text-white disabled:opacity-50">{t(active === "retry" ? "Analyzing…" : "Retry")}</button><button type="button" disabled={Boolean(active)} onClick={() => act(outcome, "remove")} className="min-h-11 rounded-lg border border-rose-200 bg-white px-4 text-xs font-semibold text-rose-700 disabled:opacity-50">{t(active === "remove" ? "Removing…" : "Remove")}</button></div>{errors[outcome.id] && <p role="alert" className="mt-3 text-xs text-rose-700">{localizeAnalysisText(locale, errors[outcome.id])}</p>}</>}
    </article>;
  })}</div>;
}
