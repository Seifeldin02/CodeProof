"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { DANGER_BUTTON, SECONDARY_BUTTON } from "./useApiAction";

export function ErrorNote({ message }: { message: string | null }) {
  return message ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{message}</p> : null;
}

/** A change that cannot be undone asks once more before it is sent. */
export function ConfirmedButton({ label, question, confirm, onConfirm, busy, tone = "danger" }: {
  label: string;
  question: string;
  confirm: string;
  onConfirm: () => void;
  busy: boolean;
  tone?: "danger" | "neutral";
}) {
  const { t } = useI18n();
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" disabled={busy} onClick={() => setAsking(true)} className={tone === "danger" ? DANGER_BUTTON : SECONDARY_BUTTON}>{label}</button>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2" role="group" aria-label={question}>
      <span className="text-xs font-medium text-slate-700">{question}</span>
      <button type="button" disabled={busy} onClick={() => { setAsking(false); onConfirm(); }} className={tone === "danger" ? DANGER_BUTTON : SECONDARY_BUTTON}>{confirm}</button>
      <button type="button" disabled={busy} onClick={() => setAsking(false)} className={SECONDARY_BUTTON}>{t("Cancel")}</button>
    </span>
  );
}
