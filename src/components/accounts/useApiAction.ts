"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { ACCOUNT_ERROR_COPY, ACCOUNT_FALLBACK_ERROR } from "@/features/accounts/copy";

export const FIELD_CLASS = "mt-2 h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-start text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-50";
export const PRIMARY_BUTTON = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50";
export const SECONDARY_BUTTON = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-brand-300 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50";
export const DANGER_BUTTON = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50";
export const LABEL_CLASS = "block text-xs font-semibold text-slate-600";

type Method = "POST" | "PATCH" | "DELETE";

/**
 * Sends one change to the server and shows what came back in the reader's
 * language. On success the page's server data is refreshed.
 */
export function useApiAction() {
  const router = useRouter();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T = Record<string, unknown>>(path: string, method: Method, body?: Record<string, unknown>): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(path, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
      if (!response.ok) {
        setError(t(ACCOUNT_ERROR_COPY[payload?.error?.code ?? ""] ?? ACCOUNT_FALLBACK_ERROR));
        return null;
      }
      router.refresh();
      return (payload ?? {}) as T;
    } catch {
      setError(t(ACCOUNT_FALLBACK_ERROR));
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { run, busy, error, clearError: () => setError(null) };
}
