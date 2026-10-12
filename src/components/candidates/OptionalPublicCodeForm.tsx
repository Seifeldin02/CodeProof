"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/LocaleProvider";

export default function OptionalPublicCodeForm({ candidateId, suggestedUrls, remaining }: {
  candidateId: string;
  suggestedUrls: string[];
  remaining: number;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [url, setUrl] = useState(suggestedUrls[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function analyze(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/candidates/${candidateId}/analyze-public`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repositoryUrl: url.trim() }),
      });
      if (!response.ok) {
        setError(t(response.status === 409 ? "This repository was already reviewed or the three-repository limit was reached." : "Public repository analysis failed. Check that the URL is public and try again."));
        return;
      }
      setMessage(t("Public repository reviewed. Inspect its evidence and attribution before relying on it."));
      setUrl("");
      router.refresh();
    } catch {
      setError(t("Public repository analysis failed. Check that the URL is public and try again."));
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-3">
    <p className="text-sm leading-6 text-slate-600">{t("Public-code review is optional. CodeProof reads bounded public GitHub archives without executing code. Private work is not penalized, and authorship requires separate verification.")}</p>
    {remaining > 0 ? <form onSubmit={analyze} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1"><label htmlFor="optional-repository" className="block text-xs font-semibold text-slate-700">{t("Public GitHub repository URL")}</label><input id="optional-repository" type="url" required maxLength={500} value={url} onChange={(event) => setUrl(event.target.value)} list="suggested-public-repositories" placeholder="https://github.com/owner/repo" dir="ltr" className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-start text-sm focus:outline-none focus:ring-2 focus:ring-brand-100" /><datalist id="suggested-public-repositories">{suggestedUrls.map((item) => <option key={item} value={item} />)}</datalist></div>
      <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{t(busy ? "Reviewing public code..." : "Analyze public code")}</button>
    </form> : <p className="text-xs text-slate-500">{t("Three repositories have already been selected for this candidate.")}</p>}
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
  </div>;
}
