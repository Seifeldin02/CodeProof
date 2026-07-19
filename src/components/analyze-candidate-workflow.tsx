"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Badge from "@/components/ui/Badge";
import type { CvDiscovery, DiscoveredRepository } from "@/features/resume-matching/discovery";
import { ROLES, type Role } from "@/features/hiring-analytics/types";

interface ApiError { error?: { message?: string } }

const SAMPLE_CV = `Demo Candidate
Full-Stack Engineer
Public project: https://github.com/sindresorhus/is
Experience building TypeScript libraries, runtime validation, automated tests, and maintainable developer tooling.`;

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
    } catch (caught) { setError(caught instanceof Error ? caught.message : "CV discovery failed."); }
    finally { setBusy(null); }
  }

  async function loadDemo(): Promise<void> {
    setResumeFile(null); setResumeText(SAMPLE_CV); setIsDemo(true);
    await runDiscovery(SAMPLE_CV);
  }

  function addManualRepository(): void {
    const parsed = canonicalRepository(manualRepository);
    if (!parsed) { setError("Enter a public repository URL such as https://github.com/owner/repository."); return; }
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
  }

  async function analyze(): Promise<void> {
    if (!candidateName.trim()) { setError("Confirm the candidate name before analyzing."); return; }
    if (selected.size === 0) { setError("Select at least one public repository."); return; }
    setBusy("analyze"); setError(null);
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
      const payload = await response.json() as { candidate?: { id: string }; failedRepositories?: Array<{ message: string }> } & ApiError;
      if (!response.ok || !payload.candidate) throw new Error(payload.error?.message ?? payload.failedRepositories?.[0]?.message ?? "Candidate analysis failed.");
      router.push(`/candidates/${payload.candidate.id}`);
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Candidate analysis failed."); setBusy(null); }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-7">
        <div className="flex items-center justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-brand-700">Step {discovery ? "2 of 2" : "1 of 2"}</p><h2 className="mt-2 text-xl font-semibold text-slate-950">{discovery ? "Confirm candidate and projects" : "Upload the candidate CV"}</h2></div>{isDemo && <Badge tone="warning">Demo candidate</Badge>}</div>

        {!discovery ? <div className="mt-6 space-y-5">
          <label className="group block cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center transition hover:border-brand-300 hover:bg-brand-50/40">
            <input type="file" className="sr-only" accept="application/pdf,.pdf" onChange={(event) => { setResumeFile(event.target.files?.[0] ?? null); setIsDemo(false); }} />
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-white text-xl shadow-sm">↑</span><strong className="mt-4 block text-sm text-slate-900">Choose a text-based PDF</strong><span className="mt-1 block text-xs text-slate-500">Maximum 5 MB. Files are parsed server-side and never executed.</span>{resumeFile && <span className="mt-3 inline-flex rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-800">{resumeFile.name}</span>}
          </label>
          <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[.15em] text-slate-400"><span className="h-px flex-1 bg-slate-200" />or paste CV text<span className="h-px flex-1 bg-slate-200" /></div>
          <textarea value={resumeText} onChange={(event) => { setResumeText(event.target.value); setIsDemo(false); }} placeholder="Candidate name, experience, GitHub links, projects…" className="min-h-40 w-full rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50" />
          <button type="button" onClick={() => runDiscovery()} disabled={busy !== null || (!resumeFile && !resumeText.trim())} className="flex w-full items-center justify-between rounded-xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><span>{busy === "discover" ? "Reading CV…" : "Detect candidate projects"}</span><span>→</span></button>
          <button type="button" onClick={loadDemo} disabled={busy !== null} className="w-full rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">Use sample candidate <span className="font-normal text-slate-400">(backup demo)</span></button>
        </div> : <div className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Candidate name<input value={candidateName} onChange={(event) => setCandidateName(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal outline-none focus:border-brand-500" /></label><label className="text-xs font-semibold text-slate-600">Target role<select value={role} onChange={(event) => setRole(event.target.value as Role)} className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal outline-none focus:border-brand-500">{ROLES.map((item) => <option key={item}>{item}</option>)}</select></label></div>
          {discovery.profiles.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><strong className="text-sm text-amber-900">GitHub profile detected</strong><p className="mt-1 text-xs leading-5 text-amber-800">{discovery.profiles.map((profile) => profile.url).join(", ")}. Free archive scanning cannot list profile projects, so paste the repository URLs you want to inspect.</p></div>}
          <div><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-900">Selected repositories</h3><span className="text-xs text-slate-400">Up to 3</span></div><div className="mt-3 space-y-2">{repositories.map((repository) => <button type="button" key={repository.url} onClick={() => toggleRepository(repository.url)} className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left transition ${selected.has(repository.url) ? "border-brand-300 bg-brand-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}><span className={`grid h-5 w-5 place-items-center rounded border text-xs ${selected.has(repository.url) ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300"}`}>{selected.has(repository.url) ? "✓" : ""}</span><span><strong className="block text-sm text-slate-900">{repository.owner}/{repository.repository}</strong><small className="text-slate-400">Public source archive</small></span></button>)}</div>
            <div className="mt-3 flex gap-2"><input value={manualRepository} onChange={(event) => setManualRepository(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addManualRepository(); } }} placeholder="https://github.com/owner/repository" className="h-11 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-500" /><button type="button" onClick={addManualRepository} className="rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700">Add</button></div>
          </div>
          <label className="block text-xs font-semibold text-slate-600">Job description <span className="font-normal text-slate-400">optional</span><textarea value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} className="mt-2 min-h-28 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal leading-6 outline-none focus:border-brand-500" placeholder="Paste requirements to include evidence matching…" /></label>
          <div className="flex gap-3"><button type="button" onClick={() => { setDiscovery(null); setError(null); }} disabled={busy !== null} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600">Back</button><button type="button" onClick={analyze} disabled={busy !== null || selected.size === 0} className="flex flex-1 items-center justify-between rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"><span>{busy === "analyze" ? "Inspecting source archives…" : "Build candidate evidence report"}</span><span>→</span></button></div>
        </div>}
        {error && <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      </section>

      <aside className="space-y-4">
        <div className="rounded-2xl bg-slate-950 p-6 text-white"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-lime-300">What CodeProof inspects</p><ul className="mt-5 space-y-4 text-sm">{[["Languages and tools","Extensions, manifests and real imports."],["Architecture patterns","Routes, services, state, auth and persistence boundaries."],["Implementation depth","Repeated meaningful usage with exact file citations."],["Quality signals","Tests, error handling, observability and deployment evidence."]].map(([title, copy]) => <li key={title} className="border-b border-white/10 pb-4 last:border-0 last:pb-0"><strong className="block">{title}</strong><span className="mt-1 block text-xs leading-5 text-slate-400">{copy}</span></li>)}</ul></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6"><h3 className="text-sm font-semibold text-slate-900">Free by default</h3><p className="mt-2 text-sm leading-6 text-slate-500">Public repositories are downloaded through GitHub source archives. The core flow does not use GitHub REST, a token, or an AI key.</p><dl className="mt-5 grid grid-cols-2 gap-3 text-xs"><div className="rounded-lg bg-slate-50 p-3"><dt className="text-slate-400">Archive cap</dt><dd className="mt-1 font-semibold text-slate-800">20 MB</dd></div><div className="rounded-lg bg-slate-50 p-3"><dt className="text-slate-400">File cap</dt><dd className="mt-1 font-semibold text-slate-800">5,000</dd></div><div className="rounded-lg bg-slate-50 p-3"><dt className="text-slate-400">Execution</dt><dd className="mt-1 font-semibold text-slate-800">Never</dd></div><div className="rounded-lg bg-slate-50 p-3"><dt className="text-slate-400">Evidence</dt><dd className="mt-1 font-semibold text-slate-800">File-backed</dd></div></dl></div>
      </aside>
    </div>
  );
}
