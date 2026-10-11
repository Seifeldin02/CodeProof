"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { localizeAnalysisText, type Locale } from "@/i18n/translations";

interface Props {
  token: string;
  /** The language the recruiter chose. Applied only if the visitor has not picked one. */
  preferredLocale: Locale;
  verificationCode: string;
  repositoryLimit: number;
  otherLinkLimit: number;
  noteLimit: number;
}

const INPUT = "mt-2 h-12 w-full rounded-lg border border-slate-200 bg-white px-3 text-left text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-50";

export default function EvidenceResponseForm({ token, preferredLocale, verificationCode, repositoryLimit, otherLinkLimit, noteLimit }: Props) {
  const { locale, setLocale, t } = useI18n();
  const [repositories, setRepositories] = useState<string[]>(() => Array.from({ length: repositoryLimit }, () => ""));
  const [otherLinks, setOtherLinks] = useState<string[]>(() => Array.from({ length: otherLinkLimit }, () => ""));
  const [confidential, setConfidential] = useState(false);
  const [gistUrl, setGistUrl] = useState("");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  // The link normally arrives through ./open, which stores the recruiter's
  // language before the page renders. This covers a visitor who reached the page
  // some other way with no language set at all. A language already set, by the
  // visitor or by an earlier link, is kept, so the page never changes language
  // after it has loaded.
  useEffect(() => {
    let languageKnown = true;
    try {
      languageKnown = Boolean(window.localStorage.getItem("codeproof-locale")) || /(?:^|;\s*)codeproof-locale=/.test(document.cookie);
    } catch {
      // Storage is blocked, so nothing can be remembered: leave the language as it is.
    }
    if (!languageKnown && preferredLocale !== locale) setLocale(preferredLocale);
    // Runs once on arrival: later changes belong to the visitor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (error) alertRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (sent) doneRef.current?.focus();
  }, [sent]);

  function setAt(list: string[], index: number, value: string): string[] {
    return list.map((item, position) => (position === index ? value : item));
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    if (!consent) {
      setError(t("Tick the box to agree before sending."));
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/evidence/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          consent,
          repositories: repositories.map((value) => value.trim()).filter(Boolean),
          otherLinks: otherLinks.map((value) => value.trim()).filter(Boolean),
          confidential,
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(gistUrl.trim() ? { gistUrl: gistUrl.trim() } : {}),
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(payload?.error?.message ?? "The answer could not be sent. Try again.");
      }
      setSent(true);
    } catch (caught) {
      setError(localizeAnalysisText(locale, caught instanceof Error ? caught.message : "The answer could not be sent. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 sm:p-8" role="status">
        <h2 ref={doneRef} tabIndex={-1} className="text-xl font-semibold tracking-[-.02em] text-emerald-950 outline-none">{t("Thank you. Your answer was sent.")}</h2>
        <p className="mt-3 text-sm leading-7 text-emerald-900">{t("The hiring team will see what you shared. You can close this page.")}</p>
      </section>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
      <fieldset>
        <legend className="text-base font-semibold text-slate-950">{t("Public code on GitHub")}</legend>
        <p className="mt-1 text-xs leading-5 text-slate-500">{t("Up to {count} public repositories you wrote or contributed to. CodeProof reads only these.", { count: repositoryLimit })}</p>
        {repositories.map((value, index) => (
          <label key={index} className="mt-3 block text-xs font-semibold text-slate-600">
            {t("Repository {number}", { number: index + 1 })}
            <input dir="ltr" inputMode="url" autoComplete="off" value={value} onChange={(event) => setRepositories((current) => setAt(current, index, event.target.value))} placeholder="https://github.com/owner/repository" className={INPUT} />
          </label>
        ))}
      </fieldset>

      <fieldset className="border-t border-slate-100 pt-5">
        <legend className="text-base font-semibold text-slate-950">{t("Other work you can link")}</legend>
        <p className="mt-1 text-xs leading-5 text-slate-500">{t("For example GitLab, Bitbucket, Kaggle, an app store page or a published package. The hiring team sees these links. CodeProof cannot read them yet.")}</p>
        {otherLinks.map((value, index) => (
          <label key={index} className="mt-3 block text-xs font-semibold text-slate-600">
            {t("Link {number}", { number: index + 1 })}
            <input dir="ltr" inputMode="url" autoComplete="off" value={value} onChange={(event) => setOtherLinks((current) => setAt(current, index, event.target.value))} placeholder="https://" className={INPUT} />
          </label>
        ))}
      </fieldset>

      <div className="border-t border-slate-100 pt-5">
        <label className="flex min-h-11 items-start gap-3 text-sm font-semibold text-slate-900">
          <input type="checkbox" checked={confidential} onChange={(event) => setConfidential(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300" />
          <span>{t("My work is confidential or private, and I cannot share it.")}</span>
        </label>
        <p className="ms-8 mt-1 text-xs leading-5 text-slate-500">{t("The hiring team will see this as unknown, and can ask you about your work in an interview.")}</p>
      </div>

      <fieldset className="border-t border-slate-100 pt-5">
        <legend className="text-base font-semibold text-slate-950">{t("Show that the GitHub account is yours")} <span className="text-xs font-normal text-slate-500">{t("optional")}</span></legend>
        <ol className="mt-2 list-decimal space-y-1.5 ps-5 text-xs leading-5 text-slate-600">
          <li>{t("Open gist.github.com while signed in to GitHub.")}</li>
          <li>{t("Create a public gist that contains this code:")} <code dir="ltr" className="tech-ltr select-all rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-900">{verificationCode}</code></li>
          <li>{t("Paste the link of the gist below.")}</li>
        </ol>
        <label className="mt-3 block text-xs font-semibold text-slate-600">
          {t("Gist link")}
          <input dir="ltr" inputMode="url" autoComplete="off" value={gistUrl} onChange={(event) => setGistUrl(event.target.value)} placeholder="https://gist.github.com/your-name/…" className={INPUT} />
        </label>
        <p className="mt-2 text-xs leading-5 text-slate-500">{t("This shows the hiring team that the account is yours. It does not show who wrote each change in a repository.")}</p>
      </fieldset>

      <label className="block border-t border-slate-100 pt-5 text-xs font-semibold text-slate-600">
        {t("Anything the hiring team should know")} <span className="font-normal text-slate-500">{t("optional")}</span>
        <textarea value={note} maxLength={noteLimit} onChange={(event) => setNote(event.target.value)} className="mt-2 min-h-24 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm font-normal leading-6 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-50" />
      </label>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <label className="flex min-h-11 items-start gap-3 text-sm font-semibold text-slate-900">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300" />
          <span>{t("I agree that CodeProof reads the public repositories I listed and shows the result to the hiring team that sent me this link.")}</span>
        </label>
      </div>

      {error && <p ref={alertRef} tabIndex={-1} role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 outline-none">{error}</p>}

      <button type="submit" disabled={busy} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">
        {busy && <i className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />}
        {t(busy ? "Sending…" : "Send to the hiring team")}
      </button>
    </form>
  );
}
