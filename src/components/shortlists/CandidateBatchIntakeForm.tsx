"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { ROLES, type Role } from "@/features/hiring-analytics/types";

interface PendingCv {
  id: string;
  file: File;
  name: string;
  role: Role;
}

const MAX_BATCH_FILES = 20;
const MAX_PDF_BYTES = 5 * 1024 * 1024;

function suggestedName(fileName: string): string {
  return fileName.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

/** Small, bounded import queue; each applicant uses the same authenticated single-CV API. */
export default function CandidateBatchIntakeForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState<PendingCv[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function selectFiles(files: FileList | null): void {
    setMessage("");
    setError("");
    const selected = Array.from(files ?? []);
    if (selected.length > MAX_BATCH_FILES) {
      setPending([]);
      setError(t("Choose at most 20 CV PDFs per batch."));
      return;
    }
    setPending(selected.map((file, index) => ({
      id: `${index}:${file.name}:${file.size}:${file.lastModified}`,
      file,
      name: suggestedName(file.name),
      role: "Backend Engineer",
    })));
  }

  function update(id: string, patch: Partial<Pick<PendingCv, "name" | "role">>): void {
    setPending((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  async function importBatch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!pending.length || pending.some((item) => item.name.trim().length < 2 || item.file.size > MAX_PDF_BYTES || !item.file.name.toLowerCase().endsWith(".pdf"))) {
      setError(t("Check each candidate name and use text-based PDFs under 5 MB."));
      return;
    }
    setBusy(true);
    setProgress(0);
    const imported = new Set<string>();
    let failed = 0;
    try {
      for (const [index, item] of pending.entries()) {
        const form = new FormData();
        form.set("name", item.name.trim());
        form.set("role", item.role);
        form.set("resumeFile", item.file);
        try {
          const response = await fetch("/api/candidates/intake-cv", { method: "POST", body: form });
          if (response.ok) imported.add(item.id);
          else failed += 1;
        } catch {
          failed += 1;
        }
        setProgress(index + 1);
      }
      setPending((current) => current.filter((item) => !imported.has(item.id)));
      if (imported.size) {
        setMessage(t("Imported {count} candidates. CV claims remain candidate-reported, not verified.", { count: imported.size }));
        router.refresh();
      }
      if (failed) setError(t("{count} CVs could not be imported. They remain in the queue for retry.", { count: failed }));
    } finally {
      setBusy(false);
    }
  }

  return <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
    <summary className="cursor-pointer text-base font-semibold text-slate-950">{t("Import multiple applicants from CV PDFs")}</summary>
    <p className="mt-2 text-sm leading-6 text-slate-600">{t("Select up to 20 text-based PDFs. Confirm each name before importing. Files are processed one at a time; only extracted claims are retained.")}</p>
    <form onSubmit={importBatch} className="mt-4 space-y-4">
      <div><label htmlFor="batch-cvs" className="block text-xs font-semibold text-slate-700">{t("Candidate CV PDFs")}</label><input id="batch-cvs" type="file" accept="application/pdf,.pdf" multiple disabled={busy} onChange={(event) => selectFiles(event.target.files)} className="mt-2 block w-full rounded-xl border border-slate-300 p-2 text-sm text-slate-700 file:me-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-semibold" /></div>
      {pending.length > 0 && <ol className="space-y-3">{pending.map((item, index) => <li key={item.id} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p dir="ltr" className="break-all text-start text-xs text-slate-500">{item.file.name}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><label htmlFor={`batch-name-${index}`} className="block text-xs font-semibold text-slate-700">{t("Confirm candidate name")}</label><input id={`batch-name-${index}`} required minLength={2} maxLength={120} value={item.name} disabled={busy} onChange={(event) => update(item.id, { name: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100" /></div>
          <div><label htmlFor={`batch-role-${index}`} className="block text-xs font-semibold text-slate-700">{t("Initial candidate role")}</label><select id={`batch-role-${index}`} value={item.role} disabled={busy} onChange={(event) => update(item.id, { role: event.target.value as Role })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">{ROLES.map((role) => <option key={role} value={role}>{t(role)}</option>)}</select></div>
        </div>
      </li>)}</ol>}
      {busy && <p role="status" className="text-sm text-slate-600">{t("Importing CV {count} of {total}...", { count: progress + 1 > pending.length ? pending.length : progress + 1, total: pending.length })}</p>}
      {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <button type="submit" disabled={busy || !pending.length} className="inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{t("Import {count} candidates", { count: pending.length })}</button>
    </form>
  </details>;
}
