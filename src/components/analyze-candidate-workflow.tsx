"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Badge from "@/components/ui/Badge";
import type { CvDiscovery, DiscoveredRepository } from "@/features/resume-matching/discovery";
import { ROLES, type Role } from "@/features/hiring-analytics/types";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { localizeAnalysisText } from "@/i18n/translations";

interface ApiError { error?: { message?: string } }
type RepositoryUiStatus = { status: "analyzing" | "analyzed" | "failed" | "skipped"; message?: string };

const SAMPLE_CV = `Demo Candidate
Full-Stack Engineer
Public project: https://github.com/sindresorhus/is
Experience building TypeScript libraries, runtime validation, automated tests, and maintainable developer tooling.`;

function PipelineMap({ discovery, busy }: { discovery: CvDiscovery | null; busy: "discover" | "analyze" | null }) {
  const { t } = useI18n();
  const pipelineSteps = [["CV intake", "Extract links"], ["Project scope", "Recruiter confirms"], ["Source scan", "Bounded archives"], ["Evidence dossier", "Persist report"]] as const;
  const activeIndex = busy === "analyze" ? 2 : discovery ? 1 : 0;
  return <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-card"><div className="grid gap-2 sm:grid-cols-4">{pipelineSteps.map(([title, copy], index) => { const complete = index < activeIndex; const active = index === activeIndex; return <div key={title} className={`relative rounded-xl border p-3 transition-all duration-500 ${active ? "border-brand-300 bg-brand-50 shadow-sm" : complete ? "border-emerald-200 bg-emerald-50/60" : "border-slate-100 bg-slate-50/70"}`}><div className="flex items-center gap-2"><span className={`grid h-6 w-6 place-items-center rounded-full font-mono text-[9px] font-semibold ${active ? "evidence-node bg-brand-700 text-white" : complete ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"}`}>{complete ? "✓" : `0${index + 1}`}</span><strong className="text-xs text-slate-800">{t(title)}</strong></div><p className="mt-2 ps-8 text-[10px] text-slate-400">{active && busy ? t(busy === "discover" ? "Reading candidate material…" : "Inspection in progress…") : t(copy)}</p>{index < pipelineSteps.length - 1 && <span className="absolute -end-2 top-1/2 z-10 hidden h-px w-2 bg-slate-300 sm:block" />}</div>; })}</div></div>;
}

function canonicalRepository(value: string): DiscoveredRepository | null {
  try {
    const url = new URL(value.trim());
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com" || parts.length < 2) return null;
    const owner = parts[0];
    const repository = parts[1].replace(/\.git$/i, "");
    if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repository)) return null;
    return { owner, repository, url: `https://github.com/${owner}/${repository}` };
  } catch { return null; }
}

export default function AnalyzeCandidateWorkflow() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [discovery, setDiscovery] = useState<CvDiscovery | null>(null);
  const [candidateName, setCandidateName] = useState("");
  const [role, setRole] = useState<Role>("Frontend Engineer");
  const [repositories, setRepositories] = useState<DiscoveredRepository[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [manualRepository, setManualRepository] = useState("");
  const [isDemo, setIsDemo] = useState(false);
  const [busy, setBusy] = useState<"discover" | "analyze" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repositoryStatus, setRepositoryStatus] = useState<Record<string, RepositoryUiStatus>>({});

  async function runDiscovery(textOverride?: string): Promise<void> {
    setBusy("discover"); setError(null);
    try {
      const form = new FormData();
      if (textOverride ?? resumeText) form.set("resumeText", textOverride ?? resumeText);
      if (!textOverride && resumeFile) form.set("resumeFile", resumeFile);
      const response = await fetch("/api/cv/discover", { method: "POST", body: form });
      const payload = await response.json() as { discovery?: CvDiscovery } & ApiError;
      if (!response.ok || !payload.discovery) throw new Error(payload.error?.message ?? "CV discovery failed.");
      setDiscovery(payload.discovery);
      setCandidateName(payload.discovery.candidateName ?? "");
      setRole(payload.discovery.suggestedRole);
      setRepositories(payload.discovery.repositories);
      setSelected(new Set(payload.discovery.repositories.slice(0, 3).map((repository) => repository.url)));
      setRepositoryStatus({});
    } catch (caught) { setError(caught instanceof Error ? caught.message : "CV discovery failed."); }
    finally { setBusy(null); }
  }

  async function loadDemo(): Promise<void> {
    setResumeFile(null); setResumeText(SAMPLE_CV); setIsDemo(true);
    await runDiscovery(SAMPLE_CV);
  }

  function addManualRepository(): void {
    const parsed = canonicalRepository(manualRepository);
    if (!parsed) { setError(t("Enter a public repository URL such as https://github.com/owner/repository.")); return; }
    setRepositories((current) => current.some((repository) => repository.url.toLowerCase() === parsed.url.toLowerCase()) ? current : [...current, parsed]);
    setSelected((current) => new Set([...current, parsed.url]));
    setManualRepository(""); setError(null);
  }

  function toggleRepository(url: string): void {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(url)) next.delete(url);
      else if (next.size < 3) next.add(url);
      return next;
    });
    setRepositoryStatus((current) => { const next = { ...current }; delete next[url]; return next; });
  }

  async function analyze(): Promise<void> {
    if (!candidateName.trim()) { setError(t("Confirm the candidate name before analyzing.")); return; }
    if (selected.size === 0) { setError(t("Select at least one public repository.")); return; }
    setBusy("analyze"); setError(null);
    setRepositoryStatus(Object.fromEntries(repositories.map((repository) => [repository.url, { status: selected.has(repository.url) ? "analyzing" : "skipped" }])));
    try {
      const form = new FormData();
      form.set("candidateName", candidateName);
      form.set("role", role);
      form.set("repositoryUrls", JSON.stringify([...selected]));
      form.set("resumeText", resumeText);
      form.set("jobDescription", jobDescription);
      form.set("isDemo", String(isDemo));
      if (resumeFile) form.set("resumeFile", resumeFile);
      const response = await fetch("/api/candidates/analyze", { method: "POST", body: form });
      const payload = await response.json() as { candidate?: { id: string }; failedRepositories?: Array<{ repositoryUrl: string; message: string }> } & ApiError;
      const failures = new Map((payload.failedRepositories ?? []).map((failure) => [failure.repositoryUrl, failure.message]));
      setRepositoryStatus(Object.fromEntries(repositories.map((repository) => [repository.url, selected.has(repository.url)
        ? failures.has(repository.url) ? { status: "failed", message: failures.get(repository.url) } : { status: "analyzed" }
        : { status: "skipped" }])))
      if (!response.ok || !payload.candidate) throw new Error(payload.error?.message ?? payload.failedRepositories?.[0]?.message ?? "Candidate analysis failed.");
      router.push(`/candidates/${payload.candidate.id}`);
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Candidate analysis failed."); setBusy(null); }
  }

  return (
    <div className="space-y-5">
      <PipelineMap discovery={discovery} busy={busy} />
      <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
      <section className="surface-card rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-card sm:p-7">
        <div className="flex items-center justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-brand-700">{t("Recruiter step {step} of 2", { step: discovery ? 2 : 1 })}</p><h2 className="mt-2 text-xl font-semibold text-slate-950">{t(discovery ? "Confirm candidate and projects" : "Upload the candidate CV")}</h2></div>{isDemo && <Badge tone="warning">{t("Demo candidate")}</Badge>}</div>

        {!discovery ? <div className="mt-6 space-y-5">
          <label className="group block cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50/60 hover:shadow-[0_16px_34px_rgba(15,23,42,.06)]">
            <input type="file" className="sr-only" accept="application/pdf,.pdf" onChange={(event) => { setResumeFile(event.target.files?.[0] ?? null); setIsDemo(false); }} />
            <span className="evidence-node mx-auto grid h-12 w-12 place-items-center rounded-xl bg-white text-xl text-brand-700 shadow-sm transition-transform duration-300 group-hover:-translate-y-1">↑</span><strong className="mt-4 block text-sm text-slate-900">{t("Choose a text-based PDF")}</strong><span className="mt-1 block text-xs text-slate-500">{t("Maximum 5 MB. Files are parsed server-side and never executed.")}</span>{resumeFile && <span className="tech-ltr mt-3 inline-flex rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-800">{resumeFile.name}</span>}
          </label>
          <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[.15em] text-slate-400"><span className="h-px flex-1 bg-slate-200" />{t("or paste CV text")}<span className="h-px flex-1 bg-slate-200" /></div>
          <textarea value={resumeText} onChange={(event) => { setResumeText(event.target.value); setIsDemo(false); }} aria-label={t("Paste CV text")} placeholder={t("Candidate name, experience, GitHub links, projects…")} className="min-h-40 w-full rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50" />
          <button type="button" onClick={() => runDiscovery()} disabled={busy !== null || (!resumeFile && !resumeText.trim())} className="group flex min-h-12 w-full items-center justify-between rounded-xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"><span className="flex items-center gap-2">{busy === "discover" && <i className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />}{t(busy === "discover" ? "Reading CV…" : "Detect candidate projects")}</span><span className="directional-icon transition-transform group-hover:translate-x-1">→</span></button>
          <button type="button" onClick={loadDemo} disabled={busy !== null} className="min-h-12 w-full rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">{t("Use sample candidate")} <span className="font-normal text-slate-400">({t("backup demo")})</span></button>
        </div> : <div className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">{t("Candidate name")}<input value={candidateName} onChange={(event) => setCandidateName(event.target.value)} className="mt-2 h-12 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal outline-none focus:border-brand-500" /></label><label className="text-xs font-semibold text-slate-600">{t("Target role")}<select value={role} onChange={(event) => setRole(event.target.value as Role)} className="mt-2 h-12 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal outline-none focus:border-brand-500">{ROLES.map((item) => <option key={item} value={item}>{t(item)}</option>)}</select></label></div>
          {discovery.profiles.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-500" /><strong className="text-sm text-amber-900">{t("GitHub profile detected")}</strong></div><p className="mt-2 text-xs leading-5 text-amber-800"><bdi dir="ltr">{discovery.profiles.map((profile) => profile.url).join(", ")}</bdi>. {t("Free archive scanning cannot list profile projects, so paste the repository URLs you want to inspect.")}</p></div>}
          <div><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-900">{t("Selected repositories")}</h3><span className="text-xs text-slate-400">{t("{count}/3 selected", { count: selected.size })}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{repositories.map((repository) => { const outcome = repositoryStatus[repository.url]; return <div key={repository.url}><button type="button" disabled={busy === "analyze"} onClick={() => toggleRepository(repository.url)} className={`interactive-card flex min-h-16 w-full items-center gap-3 rounded-xl border p-4 text-start transition ${selected.has(repository.url) ? "border-brand-300 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 bg-white hover:border-brand-200"}`}><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border text-xs ${selected.has(repository.url) ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300 text-slate-400"}`}>{outcome?.status === "analyzing" ? <i className="h-3 w-3 animate-spin rounded-full border border-white/40 border-t-white" /> : selected.has(repository.url) ? "✓" : "+"}</span><span className="min-w-0 flex-1"><strong className="tech-ltr block truncate text-sm text-slate-900">{repository.owner}/{repository.repository}</strong><small className={outcome?.status === "failed" ? "text-rose-600" : outcome?.status === "analyzed" ? "text-emerald-600" : "text-slate-400"}>{t(outcome?.status === "analyzing" ? "Analyzing" : outcome?.status === "analyzed" ? "Analyzed successfully" : outcome?.status === "failed" ? "Failed" : outcome?.status === "skipped" ? "Skipped by user" : "Public source archive")}</small></span></button>{outcome?.status === "failed" && outcome.message && <p role="alert" className="mt-1 px-2 text-[10px] leading-4 text-rose-700">{localizeAnalysisText(locale, outcome.message)}</p>}</div>; })}</div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input dir="ltr" value={manualRepository} onChange={(event) => setManualRepository(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addManualRepository(); } }} placeholder="https://github.com/owner/repository" className="h-12 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-left text-sm outline-none focus:border-brand-500" /><button type="button" onClick={addManualRepository} className="min-h-12 rounded-lg border border-slate-200 px-5 text-sm font-semibold text-slate-700">{t("Add")}</button></div>
          </div>
          <label className="block text-xs font-semibold text-slate-600">{t("Job description")} <span className="font-normal text-slate-400">{t("optional")}</span><textarea value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} className="mt-2 min-h-28 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal leading-6 outline-none focus:border-brand-500" placeholder={t("Paste requirements to include evidence matching…")} /></label>
          <div className="flex flex-col gap-3 sm:flex-row"><button type="button" onClick={() => { setDiscovery(null); setError(null); }} disabled={busy !== null} className="min-h-12 rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">{t("Back")}</button><button type="button" onClick={analyze} disabled={busy !== null || selected.size === 0} className="group flex min-h-12 flex-1 items-center justify-between rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-brand-700 disabled:opacity-50 disabled:hover:translate-y-0"><span className="flex items-center gap-2">{busy === "analyze" && <i className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />}{busy === "analyze" ? t(selected.size === 1 ? "Inspecting {count} source archive…" : "Inspecting {count} source archives…", { count: selected.size }) : t("Build candidate evidence report")}</span><span className="directional-icon transition-transform group-hover:translate-x-1">→</span></button></div>
        </div>}
        {error && <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{localizeAnalysisText(locale, error)}</div>}
      </section>

      <aside className="space-y-4">
        <div className="hero-grid rounded-2xl bg-slate-950 p-6 text-white"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-lime-300">{t("What CodeProof inspects")}</p><ul className="mt-5 space-y-4 text-sm">{[["Languages and tools","Extensions, manifests and real imports."],["Architecture patterns","Routes, services, state, auth and persistence boundaries."],["Implementation depth","Repeated meaningful usage with exact file citations."],["Quality signals","Tests, error handling, observability and deployment evidence."]].map(([title, copy], index) => <li key={title} className="flex gap-3 border-b border-white/10 pb-4 last:border-0 last:pb-0"><span className="font-mono text-[10px] text-lime-300">0{index + 1}</span><span><strong className="block">{t(title)}</strong><span className="mt-1 block text-xs leading-5 text-slate-400">{t(copy)}</span></span></li>)}</ul></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6"><h3 className="text-sm font-semibold text-slate-900">{t("Free by default")}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{t("Public repositories are downloaded through GitHub source archives. The core flow does not use GitHub REST, a token, or an AI key.")}</p><dl className="mt-5 grid grid-cols-2 gap-3 text-xs"><div className="rounded-lg bg-slate-50 p-3"><dt className="text-slate-400">{t("Transport cap")}</dt><dd className="tech-ltr mt-1 font-semibold text-slate-800">96 MB</dd></div><div className="rounded-lg bg-slate-50 p-3"><dt className="text-slate-400">{t("Analyzable file cap")}</dt><dd className="mt-1 font-semibold text-slate-800">5,000</dd></div><div className="rounded-lg bg-slate-50 p-3"><dt className="text-slate-400">{t("Execution")}</dt><dd className="mt-1 font-semibold text-slate-800">{t("Never")}</dd></div><div className="rounded-lg bg-slate-50 p-3"><dt className="text-slate-400">{t("Evidence")}</dt><dd className="mt-1 font-semibold text-slate-800">{t("File-backed")}</dd></div></dl></div>
      </aside>
      </div>
    </div>
  );
}
