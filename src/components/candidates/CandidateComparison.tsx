"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Badge from "@/components/ui/Badge";

export interface ComparisonCandidate {
  id: string;
  name: string;
  role: string;
  isDemo: boolean;
  evidenceIndex: number;
  repositoryCount: number;
  groundedClaims: number;
  topSkills: Array<{ name: string; level: string; files: string[] }>;
  patternCategories: string[];
  gapCount: number;
}

const MAX_SELECTED = 3;

function EvidenceMeter({ value }: { value: number }) {
  return <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="chart-bar h-full rounded-full bg-brand-600" style={{ width: `${value}%` }} /></div>;
}

export default function CandidateComparison({ candidates }: { candidates: ComparisonCandidate[] }) {
  const [selectedIds, setSelectedIds] = useState(() => candidates.slice(0, MAX_SELECTED).map((candidate) => candidate.id));
  const selected = useMemo(() => selectedIds.map((id) => candidates.find((candidate) => candidate.id === id)).filter((candidate): candidate is ComparisonCandidate => Boolean(candidate)), [candidates, selectedIds]);

  function toggle(id: string): void {
    setSelectedIds((current) => current.includes(id) ? current.filter((candidateId) => candidateId !== id) : current.length < MAX_SELECTED ? [...current, id] : current);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-slate-900">Choose up to three dossiers</h2><p className="mt-1 text-xs text-slate-500">Comparison uses only persisted CodeProof evidence.</p></div><span className="font-mono text-xs text-slate-400">{selected.length}/{MAX_SELECTED} selected</span></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {candidates.map((candidate) => {
            const active = selectedIds.includes(candidate.id);
            const unavailable = !active && selectedIds.length >= MAX_SELECTED;
            return <button key={candidate.id} type="button" disabled={unavailable} onClick={() => toggle(candidate.id)} className={`interactive-card rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${active ? "border-brand-300 bg-brand-50/70 ring-2 ring-brand-100" : "border-slate-200 bg-white hover:border-brand-200"}`}><div className="flex items-start justify-between gap-3"><span className="grid h-6 w-6 place-items-center rounded-md border border-current text-[11px] font-bold">{active ? "✓" : "+"}</span>{candidate.isDemo && <Badge tone="warning">Demo</Badge>}</div><strong className="mt-5 block text-sm text-slate-900">{candidate.name}</strong><span className="mt-1 block text-xs text-slate-500">{candidate.role}</span></button>;
          })}
        </div>
      </section>

      {selected.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-16 text-center"><h2 className="text-lg font-semibold text-slate-900">Select candidates to compare</h2><p className="mt-2 text-sm text-slate-500">Evidence metrics and grounded skill signals will line up here.</p></div> : <div className={`grid gap-4 ${selected.length === 1 ? "max-w-xl" : selected.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
        {selected.map((candidate) => <article key={candidate.id} className="interactive-card overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
          <header className="bg-[#0b1210] p-5 text-white"><div className="flex items-start justify-between gap-3"><div><span className="text-[10px] font-semibold uppercase tracking-[.15em] text-lime-300">Evidence dossier</span><h2 className="mt-2 text-xl font-semibold tracking-[-.025em]">{candidate.name}</h2><p className="mt-1 text-xs text-slate-400">{candidate.role}</p></div>{candidate.isDemo && <Badge tone="warning">Demo</Badge>}</div><div className="mt-6 flex items-end justify-between"><span className="text-xs text-slate-400">Evidence index</span><strong className="font-mono text-3xl text-lime-300">{candidate.evidenceIndex}</strong></div><EvidenceMeter value={candidate.evidenceIndex} /></header>
          <div className="p-5">
            <dl className="grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-slate-50 p-3"><dt className="text-[9px] uppercase tracking-wider text-slate-400">Repos</dt><dd className="mt-1 text-lg font-semibold text-slate-900">{candidate.repositoryCount}</dd></div><div className="rounded-lg bg-slate-50 p-3"><dt className="text-[9px] uppercase tracking-wider text-slate-400">Claims</dt><dd className="mt-1 text-lg font-semibold text-slate-900">{candidate.groundedClaims}</dd></div><div className="rounded-lg bg-slate-50 p-3"><dt className="text-[9px] uppercase tracking-wider text-slate-400">Gaps</dt><dd className="mt-1 text-lg font-semibold text-slate-900">{candidate.gapCount}</dd></div></dl>
            <h3 className="mt-6 text-[10px] font-semibold uppercase tracking-[.15em] text-brand-700">Strongest grounded skills</h3>
            <div className="mt-3 space-y-2">{candidate.topSkills.length ? candidate.topSkills.map((skill) => <div key={skill.name} className="rounded-lg border border-slate-100 p-3"><div className="flex items-center justify-between gap-3"><strong className="text-xs text-slate-800">{skill.name}</strong><span className="text-[9px] font-semibold text-brand-700">{skill.level.replace(" Evidence", "")}</span></div><code className="mt-1.5 block break-all text-[9px] text-slate-400">{skill.files.slice(0, 2).join(" · ")}</code></div>) : <p className="text-xs text-slate-400">No grounded skill signals.</p>}</div>
            <h3 className="mt-6 text-[10px] font-semibold uppercase tracking-[.15em] text-brand-700">Implementation coverage</h3><div className="mt-3 flex flex-wrap gap-1.5">{candidate.patternCategories.length ? candidate.patternCategories.map((category) => <span key={category} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium capitalize text-slate-600">{category.replace("-", " ")}</span>) : <span className="text-xs text-slate-400">No implementation patterns detected.</span>}</div>
            <Link href={`/candidates/${candidate.id}`} className="mt-6 flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-xs font-semibold text-slate-700 transition hover:border-brand-300 hover:bg-brand-50">Open full dossier <span>→</span></Link>
          </div>
        </article>)}
      </div>}
      <p className="text-xs leading-5 text-slate-400">Evidence indexes compare categorical implementation depth across detected skills. They are not model confidence or a hiring recommendation.</p>
    </div>
  );
}
