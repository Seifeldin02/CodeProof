export interface EvidenceCoverageData {
  repositories: number;
  groundedClaims: number;
  selectedFiles: number;
  strongOrGoodSkills: number;
  patterns: Array<{ category: string; count: number }>;
}

export default function EvidenceCoverage({ data }: { data: EvidenceCoverageData }) {
  const max = Math.max(1, ...data.patterns.map((pattern) => pattern.count));
  return <div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-xl bg-slate-50 p-3"><span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Repositories</span><strong className="mt-2 block text-2xl tracking-tight text-slate-900">{data.repositories}</strong></div><div className="rounded-xl bg-slate-50 p-3"><span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Grounded claims</span><strong className="mt-2 block text-2xl tracking-tight text-slate-900">{data.groundedClaims}</strong></div><div className="rounded-xl bg-slate-50 p-3"><span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Evidence files</span><strong className="mt-2 block text-2xl tracking-tight text-slate-900">{data.selectedFiles}</strong></div><div className="rounded-xl bg-slate-50 p-3"><span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Good+ skills</span><strong className="mt-2 block text-2xl tracking-tight text-slate-900">{data.strongOrGoodSkills}</strong></div></div><div className="mt-5 space-y-3">{data.patterns.length ? data.patterns.map((pattern) => <div key={pattern.category}><div className="mb-1.5 flex items-center justify-between text-xs"><span className="font-medium capitalize text-slate-600">{pattern.category.replace("-", " ")}</span><span className="font-mono text-[10px] text-slate-400">{pattern.count} repo{pattern.count === 1 ? "" : "s"}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="chart-bar h-full rounded-full bg-gradient-to-r from-brand-700 to-brand-400" style={{ width: `${Math.max(4, pattern.count / max * 100)}%` }} /></div></div>) : <p className="text-sm text-slate-400">No supported implementation patterns detected yet.</p>}</div><p className="mt-4 text-[11px] leading-5 text-slate-400">Coverage counts repositories where each pattern has file-backed implementation evidence.</p></div>;
}
