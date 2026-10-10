"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Badge from "@/components/ui/Badge";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { buildEvidenceRequestMessage } from "@/features/evidence-requests/message";
import { EVIDENCE_REQUEST_LIMITS, evidenceRequestStatus, repositoryOwnerConfirmed, type EvidenceRequest, type EvidenceRequestStatus } from "@/features/evidence-requests/types";
import { formatDateForLocale, localizeAnalysisText, type Locale } from "@/i18n/translations";

interface Props {
  candidateId: string;
  candidateName: string;
  requests: EvidenceRequest[];
  /** Repository URLs already analysed for this candidate. */
  analyzedRepositories: string[];
}

interface ApiError { error?: { message?: string } }

const STATUS: Record<EvidenceRequestStatus, { label: string; tone: "brand" | "positive" | "neutral" }> = {
  pending: { label: "Waiting for an answer", tone: "brand" },
  answered: { label: "Answered", tone: "positive" },
  expired: { label: "Link expired", tone: "neutral" },
  revoked: { label: "Link closed", tone: "neutral" },
};

const BUTTON = "inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

function repositoryLabel(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, "");
  } catch {
    return url;
  }
}

export default function CandidateEvidencePanel({ candidateId, candidateName, requests, analyzedRepositories }: Props) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [messageLocale, setMessageLocale] = useState<Locale>(locale);
  const [created, setCreated] = useState<{ link: string; locale: Locale } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "message" | null>(null);

  const limitReached = analyzedRepositories.length >= EVIDENCE_REQUEST_LIMITS.repositoriesPerCandidate;
  const message = created
    ? buildEvidenceRequestMessage(created.locale, { name: candidateName, link: created.link, days: EVIDENCE_REQUEST_LIMITS.validDays })
    : "";

  async function call(key: string, input: RequestInfo, init: RequestInit, fallback: string): Promise<Response | null> {
    setBusy(key);
    setError(null);
    try {
      const response = await fetch(input, init);
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as ApiError | null;
        throw new Error(payload?.error?.message ?? fallback);
      }
      return response;
    } catch (caught) {
      setError(localizeAnalysisText(locale, caught instanceof Error ? caught.message : fallback));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function create(): Promise<void> {
    const response = await call("create", `/api/candidates/${candidateId}/evidence-requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale: messageLocale }),
    }, "The link could not be created.");
    if (!response) return;
    const payload = await response.json() as { path: string };
    setCreated({ link: `${window.location.origin}${payload.path}`, locale: messageLocale });
    router.refresh();
  }

  async function close(requestId: string): Promise<void> {
    const response = await call(`close:${requestId}`, `/api/candidates/${candidateId}/evidence-requests/${requestId}`, { method: "DELETE" }, "The link could not be closed.");
    if (!response) return;
    setCreated(null);
    router.refresh();
  }

  async function analyze(requestId: string, repositoryUrl: string): Promise<void> {
    const response = await call(`analyze:${repositoryUrl}`, `/api/candidates/${candidateId}/evidence-requests/${requestId}/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repositoryUrl }),
    }, "Repository analysis failed.");
    if (response) router.refresh();
  }

  async function copy(kind: "link" | "message", value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setError(t("Copying is not available in this browser. Select the text and copy it."));
    }
  }

  return (
    <section id="candidate-evidence" aria-labelledby="candidate-evidence-heading" className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
      <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-brand-700">{t("Candidate's own evidence")}</p>
      <h2 id="candidate-evidence-heading" className="mt-2 text-xl font-semibold tracking-[-.025em] text-slate-950">{t("Ask the candidate for evidence")}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{t("Send a private link. The candidate can add public repositories and other links, say that their work is confidential, and prove that a GitHub account is theirs. The page tells them what is read and asks for their agreement.")}</p>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="text-xs font-semibold text-slate-600">
          {t("Language of the candidate's page")}
          <select value={messageLocale} onChange={(event) => setMessageLocale(event.target.value as Locale)} className="mt-2 block h-12 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal outline-none focus:border-brand-500 sm:w-48">
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </label>
        <button type="button" onClick={create} disabled={busy !== null} className={`${BUTTON} min-h-12 bg-slate-950 text-white hover:bg-brand-700`}>
          {t(busy === "create" ? "Creating…" : "Create a private link")}
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-slate-400">{t("A new link closes any earlier one that is still waiting. CodeProof does not send messages: you send the link yourself.")}</p>

      {created && (
        <div className="mt-5 rounded-2xl border border-brand-200 bg-brand-50/60 p-4">
          <p className="text-xs font-semibold text-slate-900">{t("The link is shown once. It works for {days} days and for one answer.", { days: EVIDENCE_REQUEST_LIMITS.validDays })}</p>
          <label className="mt-3 block text-xs font-semibold text-slate-600">
            {t("Private link")}
            <input readOnly dir="ltr" value={created.link} onFocus={(event) => event.target.select()} className="mt-2 h-12 w-full rounded-lg border border-slate-200 bg-white px-3 text-left font-mono text-xs outline-none focus:border-brand-500" />
          </label>
          <label className="mt-3 block text-xs font-semibold text-slate-600">
            {t("Message to send with it")}
            <textarea readOnly dir={created.locale === "ar" ? "rtl" : "ltr"} lang={created.locale} value={message} rows={9} className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm font-normal leading-6 outline-none focus:border-brand-500" />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => copy("link", created.link)} className={`${BUTTON} border border-slate-200 bg-white text-slate-700 hover:border-brand-300`}>{t(copied === "link" ? "Link copied" : "Copy link")}</button>
            <button type="button" onClick={() => copy("message", message)} className={`${BUTTON} border border-slate-200 bg-white text-slate-700 hover:border-brand-300`}>{t(copied === "message" ? "Message copied" : "Copy message")}</button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {requests.length > 0 && (
        <ul className="mt-6 space-y-3">
          {requests.map((request) => {
            const status = evidenceRequestStatus(request);
            const response = request.response;
            const confirmedLogins = response?.confirmedAccounts.map((account) => account.login) ?? [];
            return (
              <li key={request.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={STATUS[status].tone}>{t(STATUS[status].label)}</Badge>
                    <span className="text-xs text-slate-500">
                      {t("Sent {date}", { date: formatDateForLocale(locale, request.createdAt) })}
                      {status === "pending" && <> · {t("Open until {date}", { date: formatDateForLocale(locale, request.expiresAt) })}</>}
                    </span>
                  </div>
                  {status === "pending" && (
                    <button type="button" onClick={() => close(request.id)} disabled={busy !== null} className={`${BUTTON} border border-slate-200 bg-white text-slate-600 hover:border-slate-300`}>
                      {t(busy === `close:${request.id}` ? "Closing…" : "Close link")}
                    </button>
                  )}
                </div>

                {response && (
                  <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                    <p className="text-xs text-slate-500">{t("The candidate agreed to the notice on {date}.", { date: formatDateForLocale(locale, response.consentAt) })}</p>

                    {response.confidential && (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong className="text-sm text-slate-900">{t("The candidate says their work is confidential")}</strong>
                          <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("Unknown, not negative")}</span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{t("No code can be read for that work. Ask about it in an interview, or send your test.")}</p>
                      </div>
                    )}

                    {confirmedLogins.length > 0 && (
                      <p className="text-xs leading-5 text-emerald-800">
                        <strong>{t("GitHub account proved by the candidate:")}</strong>{" "}
                        <bdi dir="ltr" className="font-mono">{confirmedLogins.map((login) => `github.com/${login}`).join(", ")}</bdi>.{" "}
                        {t("This shows the account is theirs. It does not show who wrote each change in a repository.")}
                      </p>
                    )}

                    {response.repositories.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-slate-900">{t("Repositories the candidate sent")}</h3>
                        <ul className="mt-2 space-y-2">
                          {response.repositories.map((repositoryUrl) => {
                            const inDossier = analyzedRepositories.includes(repositoryUrl);
                            const key = `analyze:${repositoryUrl}`;
                            return (
                              <li key={repositoryUrl} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                                <span className="flex min-w-0 flex-wrap items-center gap-2">
                                  <bdi dir="ltr" className="break-all font-mono text-xs font-semibold text-slate-800">{repositoryLabel(repositoryUrl)}</bdi>
                                  {repositoryOwnerConfirmed(repositoryUrl, confirmedLogins) && <Badge tone="positive">{t("Owner account proved")}</Badge>}
                                </span>
                                {inDossier
                                  ? <span className="text-xs font-semibold text-emerald-700">{t("In the dossier")}</span>
                                  : <button type="button" onClick={() => analyze(request.id, repositoryUrl)} disabled={busy !== null || limitReached} className={`${BUTTON} bg-slate-950 text-white hover:bg-brand-700`}>{t(busy === key ? "Analyzing…" : "Analyze")}</button>}
                              </li>
                            );
                          })}
                        </ul>
                        {limitReached && <p className="mt-2 text-[11px] text-slate-500">{t("This candidate already has {count} analyzed repositories, which is the limit.", { count: EVIDENCE_REQUEST_LIMITS.repositoriesPerCandidate })}</p>}
                      </div>
                    )}

                    {response.otherLinks.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-slate-900">{t("Other links the candidate sent")}</h3>
                        <ul className="mt-2 space-y-1">
                          {response.otherLinks.map((link) => <li key={link} className="text-xs text-slate-600"><bdi dir="ltr" className="break-all">{link}</bdi></li>)}
                        </ul>
                        <p className="mt-1 text-[11px] leading-5 text-slate-500">{t("CodeProof cannot read these yet, so they are unknown, not negative. Open them yourself if they matter for the role.")}</p>
                      </div>
                    )}

                    {response.note && (
                      <div>
                        <h3 className="text-xs font-semibold text-slate-900">{t("Note from the candidate")}</h3>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600"><bdi>{response.note}</bdi></p>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
