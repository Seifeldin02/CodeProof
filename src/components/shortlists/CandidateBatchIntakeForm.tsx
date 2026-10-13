"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { SOURCE_CHANNELS, type SourceChannel } from "@/features/hiring-analytics/types";
import type { CvDiscovery, DiscoveredRepository } from "@/features/resume-matching/discovery";

interface PendingCv {
  id: string;
  file: File;
  name: string;
  role: string;
  source: SourceChannel;
  repositories: DiscoveredRepository[];
  selectedRepositories: string[];
  profileCount: number;
  discoveryFailed: boolean;
  /** Fields the recruiter has changed, which a later reading of the CV must not overwrite. */
  edited: { name?: boolean; role?: boolean };
}

const MAX_BATCH_FILES = 20;
const MAX_PDF_BYTES = 5 * 1024 * 1024;

/** Small, bounded import queue; each applicant uses the same authenticated single-CV API. */
export default function CandidateBatchIntakeForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState<PendingCv[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<Array<{ id: string; name: string; analyzed: number; failed: number; selected: number }>>([]);
  const selection = useRef(0);

  async function selectFiles(files: FileList | null): Promise<void> {
    setMessage("");
    setError("");
    setResults([]);
    const current = ++selection.current;
    const selected = Array.from(files ?? []);
    if (selected.length > MAX_BATCH_FILES) {
      setPending([]);
      setReading(null);
      setError(t("Choose at most 20 CV PDFs per batch."));
      return;
    }
    const queued: PendingCv[] = selected.map((file, index) => ({
      id: `${index}:${file.name}:${file.size}:${file.lastModified}`,
      file,
      name: "",
      role: "",
      source: "Not recorded",
      repositories: [],
      selectedRepositories: [],
      profileCount: 0,
      discoveryFailed: false,
      edited: {},
    }));
    setPending(queued);
    // Only the CV text may suggest a name or role. A filename is never candidate identity.
    setReading(queued.length ? { done: 0, total: queued.length } : null);
    for (const [index, item] of queued.entries()) {
      if (item.file.size <= MAX_PDF_BYTES) {
        try {
          const form = new FormData();
          form.set("resumeFile", item.file);
          const response = await fetch("/api/cv/discover", { method: "POST", body: form });
          const body = response.ok ? await response.json() as { discovery?: CvDiscovery } : null;
          // A newer selection has replaced this one.
          if (selection.current !== current) return;
          const discovery = body?.discovery;
          if (discovery) {
            setPending((list) => list.map((entry) => entry.id !== item.id ? entry : {
              ...entry,
              name: entry.edited.name ? entry.name : discovery.candidateName ?? "",
              role: entry.edited.role ? entry.role : discovery.suggestedRole ?? "",
              repositories: discovery.repositories,
              selectedRepositories: discovery.repositories.slice(0, 3).map((repository) => repository.url),
              profileCount: discovery.profiles.length,
            }));
            for (const profile of discovery.profiles) {
              try {
                const listing = await fetch("/api/github/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: profile.url }) });
                if (selection.current !== current) return;
                if (!listing.ok) continue;
                const data = await listing.json() as { listing?: { repositories: DiscoveredRepository[] } };
                setPending((list) => list.map((entry) => {
                  if (entry.id !== item.id) return entry;
                  const known = new Set(entry.repositories.map((repository) => repository.url));
                  return { ...entry, repositories: [...entry.repositories, ...(data.listing?.repositories ?? []).filter((repository) => !known.has(repository.url))] };
                }));
              } catch { /* Profile listing is optional; explicit CV links still work. */ }
            }
          } else {
            setPending((list) => list.map((entry) => entry.id === item.id ? { ...entry, discoveryFailed: true } : entry));
          }
        } catch {
          if (selection.current !== current) return;
          setPending((list) => list.map((entry) => entry.id === item.id ? { ...entry, discoveryFailed: true } : entry));
        }
      }
      setReading({ done: index + 1, total: queued.length });
    }
    setReading(null);
  }

  function update(id: string, patch: Partial<Pick<PendingCv, "name" | "role">>): void {
    setPending((current) => current.map((item) => item.id === id
      ? { ...item, ...patch, edited: { ...item.edited, ...("name" in patch ? { name: true } : {}), ...("role" in patch ? { role: true } : {}) } }
      : item));
  }

  function toggleRepository(id: string, url: string): void {
    setPending((current) => current.map((item) => {
      if (item.id !== id) return item;
      const selected = item.selectedRepositories.includes(url)
        ? item.selectedRepositories.filter((entry) => entry !== url)
        : [...item.selectedRepositories, url].slice(0, 3);
      return { ...item, selectedRepositories: selected };
    }));
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
    const completed: Array<{ id: string; name: string; analyzed: number; failed: number; selected: number }> = [];
    let failed = 0;
    try {
      for (const [index, item] of pending.entries()) {
        const form = new FormData();
        form.set("name", item.name.trim());
        if (item.role.trim()) form.set("role", item.role.trim());
        form.set("source", item.source);
        form.set("resumeFile", item.file);
        try {
          const response = await fetch("/api/candidates/intake-cv", { method: "POST", body: form });
          if (response.ok) {
            const body = await response.json() as { candidate: { id: string } };
            imported.add(item.id);
            const result = { id: body.candidate.id, name: item.name.trim(), analyzed: 0, failed: 0, selected: item.selectedRepositories.length };
            completed.push(result);
            setResults([...completed]);
            for (const repositoryUrl of item.selectedRepositories) {
              try {
                const analyzed = await fetch(`/api/candidates/${encodeURIComponent(result.id)}/analyze-public`, {
                  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repositoryUrl }),
                });
                if (analyzed.ok) result.analyzed += 1;
                else result.failed += 1;
              } catch { result.failed += 1; }
              setResults([...completed]);
            }
          } else failed += 1;
        } catch {
          failed += 1;
        }
        setProgress(index + 1);
      }
      setPending((current) => current.filter((item) => !imported.has(item.id)));
      if (imported.size) {
        setMessage(t("Imported {count} candidates. CV claims are candidate-reported; public code is shown separately from candidate authorship.", { count: imported.size }));
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
      <div><label htmlFor="batch-cvs" className="block text-xs font-semibold text-slate-700">{t("Candidate CV PDFs")}</label><input id="batch-cvs" type="file" accept="application/pdf,.pdf" multiple disabled={busy} onChange={(event) => { void selectFiles(event.target.files); event.target.value = ""; }} className="mt-2 block w-full rounded-xl border border-slate-300 p-2 text-sm text-slate-700 file:me-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-semibold" /></div>
      {pending.length > 0 && <ol className="space-y-3">{pending.map((item, index) => <li key={item.id} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-start justify-between gap-3"><p dir="ltr" className="break-all text-start text-xs text-slate-500">{item.file.name}</p><button type="button" disabled={busy} onClick={() => setPending((current) => current.filter((entry) => entry.id !== item.id))} className="shrink-0 rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-white disabled:opacity-50" aria-label={t("Remove {name} from batch", { name: item.file.name })}>{t("Remove")}</button></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><label htmlFor={`batch-name-${index}`} className="block text-xs font-semibold text-slate-700">{t("Confirm candidate name")}</label><input id={`batch-name-${index}`} required minLength={2} maxLength={120} value={item.name} disabled={busy || Boolean(reading)} onChange={(event) => update(item.id, { name: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100" />{!reading && !item.name.trim() && <p className="mt-1 text-xs text-amber-800">{t("Name not found in CV. Enter it before importing.")}</p>}</div>
          <div><label htmlFor={`batch-role-${index}`} className="block text-xs font-semibold text-slate-700">{t("Candidate-stated role (optional)")}</label><input id={`batch-role-${index}`} maxLength={120} value={item.role} disabled={busy || Boolean(reading)} onChange={(event) => update(item.id, { role: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" /></div>
          <div><label htmlFor={`batch-source-${index}`} className="block text-xs font-semibold text-slate-700">{t("Applicant source")}</label><select id={`batch-source-${index}`} value={item.source} disabled={busy || Boolean(reading)} onChange={(event) => setPending((current) => current.map((entry) => entry.id === item.id ? { ...entry, source: event.target.value as SourceChannel } : entry))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">{SOURCE_CHANNELS.map((source) => <option key={source} value={source}>{t(source)}</option>)}</select></div>
        </div>
        {!reading && <div className="mt-3 border-t border-slate-200 pt-3"><p className="text-xs font-semibold text-slate-700">{t("Public GitHub projects to analyze (up to 3)")}</p>{item.repositories.length ? <div className="mt-2 grid gap-2 sm:grid-cols-2">{item.repositories.map((repository) => <label key={repository.url} className="flex min-w-0 items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={item.selectedRepositories.includes(repository.url)} disabled={busy || (item.selectedRepositories.length >= 3 && !item.selectedRepositories.includes(repository.url))} onChange={() => toggleRepository(item.id, repository.url)} /><span dir="ltr" className="truncate" title={repository.url}>{repository.owner}/{repository.repository}</span></label>)}</div> : <p className="mt-1 text-xs text-slate-500">{t(item.discoveryFailed ? "CV could not be read. Check this file before importing." : item.profileCount ? "No public GitHub projects could be listed from the CV profile. Repository evidence will be unknown until added later." : "No GitHub project link found in this CV. Repository evidence will be unknown until added later.")}</p>}<p className="mt-2 text-xs text-slate-500">{t("Selected public code is analyzed after CV import. Project structure can be observed; candidate authorship remains unverified until separately checked.")}</p></div>}
      </li>)}</ol>}
      {reading && <p role="status" className="text-sm text-slate-600">{t("Reading CV {count} of {total} for its name and role...", { count: Math.min(reading.done + 1, reading.total), total: reading.total })}</p>}
      {busy && <p role="status" className="text-sm text-slate-600">{t("Importing CV {count} of {total}...", { count: progress + 1 > pending.length ? pending.length : progress + 1, total: pending.length })}</p>}
      {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
      {results.length > 0 && <ul className="space-y-2" aria-label={t("Batch import results")}>{results.map((result) => <li key={result.id} className="rounded-lg border border-slate-200 p-3 text-sm"><a href={`/candidates/${encodeURIComponent(result.id)}`} className="font-semibold text-brand-700 underline-offset-2 hover:underline">{result.name}</a><p className="mt-1 text-xs text-slate-600">{result.selected === 0 ? t("CV saved; no repository selected. Public-code evidence unknown.") : t("CV saved; {analyzed} of {selected} repositories analyzed, {failed} failed. Candidate authorship is not yet verified.", result)}</p></li>)}</ul>}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <button type="submit" disabled={busy || Boolean(reading) || !pending.length} className="inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{t("Import {count} candidates", { count: pending.length })}</button>
    </form>
  </details>;
}
