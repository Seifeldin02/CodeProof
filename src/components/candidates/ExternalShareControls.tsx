"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";

interface ShareSummary {
  id: string; analysisVersionId: string; expiryOption: "24h" | "7d" | "30d";
  expiresAt: string; status: "active" | "expired" | "revoked";
  openCount: number; lastOpenedAt: string | null;
}

export default function ExternalShareControls({ candidateId, analyses }: {
  candidateId: string;
  analyses: Array<{ id: string; label: string }>;
}) {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const [analysisId, setAnalysisId] = useState(analyses[0]?.id ?? "");
  const [expiry, setExpiry] = useState<"24h" | "7d" | "30d">("7d");
  const [shares, setShares] = useState<ShareSummary[]>([]);
  const [createdUrl, setCreatedUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const endpoint = `/api/candidates/${encodeURIComponent(candidateId)}/shares`;
  const copy = ar ? {
    title: "مشاركة تقرير أدلة خارجي", description: "أنشئ رابطًا محدود المدة للقطة أدلة من مستودع واحد. لا يتضمن نص السيرة الذاتية أو محتوى الملفات الكامل.",
    select: "تحليل المستودع", expiry: "صلاحية الرابط", create: "إنشاء رابط آمن", creating: "جارٍ الإنشاء…",
    none: "لا يوجد تحليل لملفات مستودع قابل للمشاركة بعد.",
    once: "احفظ الرابط الآن؛ لن يُعرض الرمز السري مرة أخرى.", copy: "نسخ الرابط", copied: "نُسخ الرابط",
    existing: "الروابط المنشأة", noShares: "لم تُنشأ روابط بعد.", revoke: "إلغاء الرابط",
    revokeConfirm: "إلغاء هذا الرابط فورًا؟", failed: "تعذر إتمام العملية. حاول مجددًا.",
    active: "نشط", expired: "منتهي", revoked: "ملغى", hour: "24 ساعة", week: "7 أيام", month: "30 يومًا",
    expires: "ينتهي في", opens: "مرات فتح التقرير", lastOpened: "آخر فتح", neverOpened: "لم يُفتح التقرير بعد",
  } : {
    title: "External evidence sharing", description: "Create a time-limited link to one repository's fixed evidence snapshot. CV text and full source-file contents are excluded.",
    select: "Repository analysis", expiry: "Link lifetime", create: "Create secure link", creating: "Creating…",
    none: "No analyzed repository files are available to share yet.",
    once: "Save this link now; its secret token will not be shown again.", copy: "Copy link", copied: "Link copied",
    existing: "Created links", noShares: "No links created yet.", revoke: "Revoke link",
    revokeConfirm: "Revoke this link immediately?", failed: "The action failed. Please try again.",
    active: "Active", expired: "Expired", revoked: "Revoked", hour: "24 hours", week: "7 days", month: "30 days",
    expires: "Expires", opens: "Times the report was opened", lastOpened: "Last opened", neverOpened: "Report not opened yet",
  };
  const day = new Intl.DateTimeFormat(ar ? "ar-SA" : "en-US", { dateStyle: "medium" });
  const moment = new Intl.DateTimeFormat(ar ? "ar-SA" : "en-US", { dateStyle: "medium", timeStyle: "short" });

  useEffect(() => {
    let mounted = true;
    fetch(endpoint, { cache: "no-store" }).then(async (response) => {
      if (response.ok && mounted) setShares((await response.json() as { shares: ShareSummary[] }).shares);
    }).catch(() => { if (mounted) setStatus(copy.failed); });
    return () => { mounted = false; };
  }, [endpoint, copy.failed]);

  async function create(): Promise<void> {
    setBusy(true); setStatus(""); setCreatedUrl("");
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ analysisId, expiry }),
      });
      if (!response.ok) { setStatus(copy.failed); return; }
      const payload = await response.json() as { share: ShareSummary; path: string };
      setCreatedUrl(new URL(payload.path, window.location.origin).toString());
      setShares((current) => [payload.share, ...current]);
    } catch { setStatus(copy.failed); }
    finally { setBusy(false); }
  }

  async function revoke(shareId: string): Promise<void> {
    if (!window.confirm(copy.revokeConfirm)) return;
    setBusy(true); setStatus("");
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(shareId)}`, { method: "DELETE" });
      if (!response.ok) { setStatus(copy.failed); return; }
      setShares((current) => current.map((item) => item.id === shareId ? { ...item, status: "revoked" } : item));
      setCreatedUrl("");
    } catch { setStatus(copy.failed); }
    finally { setBusy(false); }
  }

  return <section className="no-print min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
    <h2 className="text-lg font-semibold text-slate-950">{copy.title}</h2>
    <p className="mt-1 text-sm leading-6 text-slate-600">{copy.description}</p>
    {analyses.length === 0 ? <p className="mt-4 text-sm text-amber-800">{copy.none}</p> : <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
      <label className="min-w-0 text-xs font-semibold text-slate-700">{copy.select}
        <select value={analysisId} onChange={(event) => setAnalysisId(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900">
          {analyses.map((analysis) => <option key={analysis.id} value={analysis.id}>{analysis.label}</option>)}
        </select>
      </label>
      <label className="text-xs font-semibold text-slate-700">{copy.expiry}
        <select value={expiry} onChange={(event) => setExpiry(event.target.value as typeof expiry)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900">
          <option value="24h">{copy.hour}</option><option value="7d">{copy.week}</option><option value="30d">{copy.month}</option>
        </select>
      </label>
      <button type="button" onClick={create} disabled={busy} className="min-h-11 rounded-xl bg-slate-950 px-4 text-xs font-semibold text-white disabled:opacity-50">{busy ? copy.creating : copy.create}</button>
    </div>}
    {createdUrl && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
      <p className="text-xs font-medium text-emerald-900">{copy.once}</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row"><input readOnly dir="ltr" aria-label={copy.copy} value={createdUrl} onFocus={(event) => event.target.select()} className="min-h-11 min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 text-xs" />
        <button type="button" onClick={() => navigator.clipboard.writeText(createdUrl).then(() => setStatus(copy.copied)).catch(() => setStatus(copy.failed))} className="min-h-11 rounded-lg bg-emerald-900 px-4 text-xs font-semibold text-white">{copy.copy}</button></div>
    </div>}
    <p role="status" className="mt-2 text-xs text-slate-700">{status}</p>
    <h3 className="mt-5 text-sm font-semibold text-slate-900">{copy.existing}</h3>
    {shares.length === 0 ? <p className="mt-2 text-xs text-slate-600">{copy.noShares}</p> : <ul className="mt-2 divide-y divide-slate-100">
      {shares.map((share) => <li key={share.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs">
        <span className="min-w-0 break-words text-slate-700">
          <span className="font-semibold text-slate-900">{copy[share.status]}</span> · <bdi dir="ltr">{analyses.find((analysis) => analysis.id === share.analysisVersionId)?.label ?? share.analysisVersionId}</bdi> · {copy.expires}: {day.format(new Date(share.expiresAt))}
          {/* Whether the person it was sent to has read it. Refused attempts on a withdrawn or expired link are not counted. */}
          <span className="mt-1 block text-slate-600">{share.openCount > 0 && share.lastOpenedAt
            ? `${copy.opens}: ${share.openCount} · ${copy.lastOpened}: ${moment.format(new Date(share.lastOpenedAt))}`
            : copy.neverOpened}</span>
        </span>
        {share.status === "active" && <button type="button" disabled={busy} onClick={() => revoke(share.id)} className="min-h-11 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-800 disabled:opacity-50">{copy.revoke}</button>}
      </li>)}
    </ul>}
  </section>;
}
