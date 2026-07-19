import AnalyzeCandidateWorkflow from "@/components/analyze-candidate-workflow";

export default function AnalyzeCandidatePage() {
  return <div className="space-y-6"><header><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-brand-700">Candidate intake</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] text-slate-950">Analyze Candidate</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Begin with the CV, confirm the public projects that matter, then produce one evidence dossier for the recruiter workspace.</p></header><AnalyzeCandidateWorkflow /></div>;
}
