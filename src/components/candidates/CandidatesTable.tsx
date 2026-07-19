import Link from "next/link";
import { type CandidateRecord, STAGE_LABELS } from "@/features/hiring-analytics/types";
import Badge from "../ui/Badge";
import { OutcomeBadge, VerifiedScoreChip } from "./badges";

export default function CandidatesTable({ candidates }: { candidates: CandidateRecord[] }) {
  if (candidates.length === 0) return <p className="py-10 text-center text-sm text-slate-400">No candidates match your filters.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead><tr className="border-b border-slate-100 text-left text-[10px] font-semibold uppercase tracking-[.12em] text-slate-400">
          <th className="px-4 py-3">Candidate</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Repositories</th><th className="px-4 py-3">Pipeline stage</th><th className="px-4 py-3 text-right">Evidence index</th><th className="px-4 py-3 text-right">Status</th>
        </tr></thead>
        <tbody>{candidates.map((candidate) => (
          <tr key={candidate.id} className="group border-b border-slate-50 transition-colors last:border-0 hover:bg-brand-50/50">
            <td className="px-4 py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-xs font-semibold text-slate-600 transition group-hover:bg-brand-100 group-hover:text-brand-800">{candidate.name.split(/\s+/).slice(0,2).map((part) => part[0]).join("").toUpperCase()}</span><div><div className="flex items-center gap-2"><Link href={`/candidates/${candidate.id}`} className="font-semibold text-slate-900 hover:text-brand-700">{candidate.name}</Link>{candidate.isDemo && <Badge tone="warning">Demo</Badge>}</div><span className="mt-1 block text-xs text-slate-400">{candidate.verifiedClaimCount ?? 0} CV claims grounded</span></div></div></td>
            <td className="px-4 py-4 text-slate-600">{candidate.role}</td>
            <td className="tnum px-4 py-4 text-slate-600">{candidate.repositoryCount ?? 0}</td>
            <td className="px-4 py-4 text-slate-600">{STAGE_LABELS[candidate.furthestStage]}</td>
            <td className="px-4 py-4 text-right"><VerifiedScoreChip score={candidate.verifiedSkillScore} /></td>
            <td className="px-4 py-4 text-right"><OutcomeBadge outcome={candidate.outcome} /></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
