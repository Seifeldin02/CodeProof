"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { classifyCv, COVERAGE_CATEGORIES, coverageShare, summarizeCoverage, type CoverageCategory } from "@/features/cv-coverage/census";
import { COVERAGE_LABEL, COVERAGE_MEANING } from "@/features/cv-coverage/wording";
import type { CvDiscovery } from "@/features/resume-matching/discovery";
import { localizeAnalysisText } from "@/i18n/translations";
import { toCsv } from "@/lib/csv";

const MAX_FILES = 200;
/** The server reports these when a file is not a readable CV. Anything else is a failed request, not a result. */
const UNREADABLE_CODES = new Set(["PDF_HAS_NO_TEXT", "MALFORMED_PDF", "PDF_TOO_LARGE", "INVALID_PDF_TYPE", "REQUEST_TOO_LARGE"]);

interface Row {
  name: string;
  status: "queued" | "reading" | "counted" | "failed";
  category?: CoverageCategory;
  repositories?: number;
  profiles?: number;
  otherSources?: number;
  message?: string;
}

interface DiscoverResponse {
  discovery?: CvDiscovery;
  error?: { code?: string; message?: string };
}

const BUTTON = "inline-flex min-h-12 items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Counts, for a batch of CVs, how many name code CodeProof can read. Each file
 * is sent to the same reader the intake uses, one at a time, and only the count
 * of links comes back. No candidate is created and nothing is stored.
 */
export default function CoverageCheck() {
  const { locale, t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const cancelled = useRef(false);

  const counted = rows.filter((row) => row.status === "counted" && row.category);
  const summary = summarizeCoverage(counted.map((row) => row.category as CoverageCategory));
  const finished = rows.filter((row) => row.status === "counted" || row.status === "failed").length;
  const failed = rows.filter((row) => row.status === "failed").length;
  const share = (category: CoverageCategory) => coverageShare(summary.counts[category], summary.readable);
  const shareText = (category: CoverageCategory) => {
    const value = share(category);
    return value === null ? "—" : `${value.toFixed(1)}%`;
  };

  function update(index: number, patch: Partial<Row>): void {
    setRows((current) => current.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  }

  async function start(selected: FileList | null): Promise<void> {
    const files = [...(selected ?? [])].filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    setNotice(null);
    if (files.length === 0) {
      setNotice(t("Choose one or more PDF files."));
      return;
    }
    const batch = files.slice(0, MAX_FILES);
    if (files.length > MAX_FILES) setNotice(t("Only the first {count} files are read in one batch.", { count: MAX_FILES }));
    cancelled.current = false;
    setRows(batch.map((file) => ({ name: file.name, status: "queued" })));
    setRunning(true);

    for (const [index, file] of batch.entries()) {
      if (cancelled.current) break;
      update(index, { status: "reading" });
      try {
        const form = new FormData();
        form.set("resumeFile", file);
        const response = await fetch("/api/cv/discover", { method: "POST", body: form });
        const payload = await response.json().catch(() => ({})) as DiscoverResponse;
        if (response.ok && payload.discovery) {
          update(index, {
            status: "counted",
            category: classifyCv(payload.discovery),
            repositories: payload.discovery.repositories.length,
            profiles: payload.discovery.profiles.length,
            otherSources: payload.discovery.otherSources.length,
          });
        } else if (UNREADABLE_CODES.has(payload.error?.code ?? "")) {
          update(index, { status: "counted", category: "unreadable", message: payload.error?.message });
        } else {
          update(index, { status: "failed", message: payload.error?.message ?? "The CV could not be processed." });
          if (response.status === 401) {
            cancelled.current = true;
            setNotice(t("Your session ended. Sign in again, then restart the check."));
          }
        }
      } catch {
        update(index, { status: "failed", message: "The CV could not be processed." });
      }
    }
    setRunning(false);
  }

  function summaryText(): string {
    return [
      t("CodeProof coverage check: {readable} readable CVs.", { readable: summary.readable }),
      ...COVERAGE_CATEGORIES.filter((category) => category !== "unreadable").map((category) => `${t(COVERAGE_LABEL[category])}: ${t("{count} of {total}", { count: summary.counts[category], total: summary.readable })} (${shareText(category)})`),
      t("Files that could not be read and are not counted: {count}.", { count: summary.counts.unreadable }),
      t("This counts links on CVs. It does not check who wrote the code or what the code shows."),
    ].join("\n");
  }

  async function copySummary(): Promise<void> {
    try {
      await navigator.clipboard.writeText(summaryText());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice(t("Copying is not available in this browser. Select the text and copy it."));
    }
  }

  function downloadCsv(): void {
    // File names often contain a candidate's name, so the export carries a row number instead.
    const header = [t("CV"), t("Result"), t("Repositories named"), t("GitHub profiles named"), t("Other sources named")];
    const body = counted.map((row, index) => [index + 1, t(COVERAGE_LABEL[row.category as CoverageCategory]), row.repositories ?? 0, row.profiles ?? 0, row.otherSources ?? 0]);
    const url = URL.createObjectURL(new Blob([toCsv([header, ...body])], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `codeproof-coverage-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <section className="surface-card rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-card sm:p-7">
        <label className="group block cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/80 px-6 py-9 text-center transition hover:border-brand-300 hover:bg-brand-50/60 focus-within:border-brand-500">
          <input type="file" multiple accept="application/pdf,.pdf" disabled={running} className="sr-only" onChange={(event) => { void start(event.target.files); event.target.value = ""; }} />
          <strong className="block text-sm text-slate-900">{t("Choose the CVs for one role")}</strong>
          <span className="mt-1 block text-xs leading-5 text-slate-500">{t("Text-based PDFs, up to {count} at a time and 5 MB each. Remove names first if the CVs are not yours to process.", { count: MAX_FILES })}</span>
        </label>
        <p className="mt-3 text-xs leading-5 text-slate-500">{t("Nothing from these CVs is saved. Each file is read for links, the links are counted, and the result stays in this browser tab. No candidate is created.")}</p>
        {notice && <p role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{notice}</p>}
        {rows.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p role="status" className="tnum text-sm font-semibold text-slate-900">{t(running ? "Reading {done} of {total}…" : "Read {done} of {total}", { done: finished, total: rows.length })}</p>
            {running && <button type="button" onClick={() => { cancelled.current = true; }} className={`${BUTTON} border border-slate-200 bg-white text-slate-700 hover:border-slate-300`}>{t("Stop")}</button>}
          </div>
        )}
      </section>

      {summary.total > 0 && (
        <section aria-labelledby="coverage-result-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-7">
          <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-brand-700">{t("Coverage for this batch")}</p>
          <h2 id="coverage-result-heading" className="mt-2 text-2xl font-semibold tracking-[-.03em] text-slate-950">
            {t("{count} of {total} readable CVs name code CodeProof can read today", { count: summary.counts.repository, total: summary.readable })}
          </h2>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {COVERAGE_CATEGORIES.map((category) => (
              <div key={category} className={`rounded-xl border p-3.5 ${category === "repository" ? "border-emerald-200 bg-emerald-50/70" : "border-slate-100 bg-slate-50"}`}>
                <dt className="text-xs font-semibold text-slate-900">{t(COVERAGE_LABEL[category])}</dt>
                <dd className="mt-1">
                  <span className="tnum block text-2xl font-semibold tracking-[-.035em] text-slate-950">{category === "unreadable" ? summary.counts.unreadable : shareText(category)}</span>
                  {category !== "unreadable" && <span className="tnum block text-[11px] text-slate-500">{t("{count} of {total}", { count: summary.counts[category], total: summary.readable })}</span>}
                  <span className="mt-1 block text-[11px] leading-5 text-slate-500">{t(COVERAGE_MEANING[category])}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs leading-5 text-slate-500">{t("Shares are of the readable CVs, rounded to one decimal. This counts links on CVs. It does not check who wrote the code or what the code shows, and a CV with no link says nothing about the person.")}</p>
          {failed > 0 && <p className="mt-2 text-xs leading-5 text-amber-800">{t("{count} files could not be checked because the request failed. They are not counted. Run them again.", { count: failed })}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={copySummary} disabled={running} className={`${BUTTON} bg-slate-950 text-white hover:bg-brand-700`}>{t(copied ? "Summary copied" : "Copy the summary")}</button>
            <button type="button" onClick={downloadCsv} disabled={running} className={`${BUTTON} border border-slate-200 bg-white text-slate-700 hover:border-brand-300`}>{t("Download the counts (CSV)")}</button>
          </div>
        </section>
      )}

      {rows.length > 0 && (
        <section aria-labelledby="coverage-files-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-7">
          <h2 id="coverage-files-heading" className="text-sm font-semibold text-slate-900">{t("Each file")}</h2>
          <ol className="mt-3 divide-y divide-slate-100">
            {rows.map((row, index) => (
              <li key={`${row.name}-${index}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs">
                <span className="flex min-w-0 items-center gap-2"><span className="tnum font-mono text-[10px] text-slate-500">{index + 1}</span><bdi className="break-all text-slate-700">{row.name}</bdi></span>
                <span className={row.status === "failed" ? "font-semibold text-amber-800" : row.category === "repository" ? "font-semibold text-emerald-700" : "text-slate-600"}>
                  {row.status === "queued" && t("Waiting")}
                  {row.status === "reading" && t("Reading…")}
                  {row.status === "counted" && row.category && t(COVERAGE_LABEL[row.category])}
                  {row.status === "failed" && localizeAnalysisText(locale, row.message ?? "The CV could not be processed.")}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
