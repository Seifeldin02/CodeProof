"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { ROLES, type Role } from "@/features/hiring-analytics/types";

export default function CandidateCvIntakeForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("Backend Engineer");
  const [resumeText, setResumeText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError(null);
    setMessage(null);
    if (!resumeText.trim() && !file) {
      setError(t("Upload a text-based CV PDF or paste CV text."));
      return;
    }
    setSaving(true);
    const form = new FormData();
    form.set("name", name);
    form.set("role", role);
    if (resumeText.trim()) form.set("resumeText", resumeText.trim());
    if (file) form.set("resumeFile", file);
    try {
      const response = await fetch("/api/candidates/intake-cv", { method: "POST", body: form });
      if (!response.ok) {
        setError(t(response.status === 413 ? "The CV is too large. Use a PDF under 5 MB or shorter text." : "Could not add the candidate. Check the CV and try again."));
        return;
      }
      const result = await response.json() as { claimCount: number };
      setName("");
      setResumeText("");
      setFile(null);
      formElement.reset();
      setMessage(t("Candidate added with {count} CV claims. Claims are candidate-reported, not independently verified.", { count: result.claimCount }));
      router.refresh();
    } catch {
      setError(t("Could not add the candidate. Check the CV and try again."));
    } finally {
      setSaving(false);
    }
  }

  return <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
    <summary className="cursor-pointer text-base font-semibold text-slate-950">{t("Add a candidate from a CV, even without public code")}</summary>
    <p className="mt-2 text-sm leading-6 text-slate-600">{t("Only extracted CV claims are saved for role review. The PDF and full CV text are not retained; no private repository is accessed.")}</p>
    <form onSubmit={save} className="mt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="intake-name" className="block text-xs font-semibold text-slate-700">{t("Candidate name")}</label><input id="intake-name" required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100" /></div>
        <div><label htmlFor="intake-role" className="block text-xs font-semibold text-slate-700">{t("Candidate role")}</label><select id="intake-role" value={role} onChange={(event) => setRole(event.target.value as Role)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100">{ROLES.map((option) => <option key={option} value={option}>{t(option)}</option>)}</select></div>
      </div>
      <div><label htmlFor="intake-pdf" className="block text-xs font-semibold text-slate-700">{t("CV PDF (optional if text is pasted)")}</label><input id="intake-pdf" type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-2 block w-full rounded-xl border border-slate-300 p-2 text-sm text-slate-700 file:me-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-semibold" /></div>
      <div><label htmlFor="intake-text" className="block text-xs font-semibold text-slate-700">{t("Or paste CV text")}</label><textarea id="intake-text" rows={5} maxLength={50000} value={resumeText} onChange={(event) => setResumeText(event.target.value)} className="mt-2 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100" /></div>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
      <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{t(saving ? "Adding candidate..." : "Add candidate to private pool")}</button>
    </form>
  </details>;
}
