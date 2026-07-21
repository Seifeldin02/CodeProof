"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/LocaleProvider";

export default function DeleteCandidateButton({ candidateId, candidateName }: { candidateId: string; candidateName: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(): Promise<void> {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/candidates/${candidateId}`, { method: "DELETE" }).catch(() => null);
    if (!response?.ok) {
      setError(t("Candidate could not be deleted."));
      setBusy(false);
      return;
    }
    router.replace("/candidates");
    router.refresh();
  }

  if (!confirming) {
    return <button type="button" onClick={() => setConfirming(true)} className="inline-flex min-h-11 items-center text-xs font-semibold text-rose-700 hover:text-rose-900">{t("Delete candidate")}</button>;
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2" role="group" aria-label={t("Delete candidate")}>
      <span className="text-xs text-rose-700">{t("Permanently delete {name}?", { name: candidateName })}</span>
      <button type="button" onClick={remove} disabled={busy} className="min-h-11 rounded-xl bg-rose-700 px-3 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-50">{t(busy ? "Deleting…" : "Delete permanently")}</button>
      <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600">{t("Cancel")}</button>
      {error && <span role="alert" className="w-full text-end text-xs text-rose-700">{error}</span>}
    </div>
  );
}
