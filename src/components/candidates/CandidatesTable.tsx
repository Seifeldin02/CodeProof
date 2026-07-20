"use client";

import Link from "next/link";
import { type CandidateRecord, STAGE_LABELS } from "@/features/hiring-analytics/types";
import Badge from "../ui/Badge";
import { OutcomeBadge, VerifiedScoreChip } from "./badges";
import { useI18n } from "@/components/i18n/LocaleProvider";

function CandidateInitials({ name }: { name: string }) {
  return <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-xs font-semibold text-slate-600 transition group-hover:bg-brand-100 group-hover:text-brand-800">{name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>;
}

export default function CandidatesTable({ candidates }: { candidates: CandidateRecord[] }) {
  const { t } = useI18n();
  if (candidates.length === 0) return <p className="py-10 text-center text-sm text-slate-400">{t("No candidates match your filters.")}</p>;

  return <>
    <div className="grid gap-3 p-3 md:hidden">
      {candidates.map((candidate) => <Link key={candidate.id} href={`/candidates/${candidate.id}`} className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_26px_rgba(15,23,42,.045)] transition active:scale-[.99]">
        <div className="flex items-start gap-3"><CandidateInitials name={candidate.name} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm text-slate-950">{candidate.name}</strong>{candidate.isDemo && <Badge tone="warning">{t("Demo")}</Badge>}</div><span className="mt-1 block text-xs text-slate-500">{t(candidate.role)}</span></div><VerifiedScoreChip score={candidate.verifiedSkillScore} /></div>
        <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center"><div><dt className="text-[9px] uppercase tracking-wider text-slate-400">{t("Repositories")}</dt><dd className="tnum mt-1 text-sm font-semibold text-slate-800">{candidate.repositoryCount ?? 0}</dd></div><div><dt className="text-[9px] uppercase tracking-wider text-slate-400">{t("Claims")}</dt><dd className="tnum mt-1 text-sm font-semibold text-slate-800">{candidate.verifiedClaimCount ?? 0}</dd></div><div><dt className="text-[9px] uppercase tracking-wider text-slate-400">{t("Stage")}</dt><dd className="mt-1 truncate text-[10px] font-semibold text-slate-700">{t(STAGE_LABELS[candidate.furthestStage])}</dd></div></dl>
        <div className="mt-3 flex items-center justify-between"><OutcomeBadge outcome={candidate.outcome} /><span className="text-[10px] font-semibold text-brand-700">{t("Open dossier")} <span className="directional-icon">→</span></span></div>
      </Link>)}
    </div>

    <div className="hidden overflow-x-auto overscroll-x-contain md:block" tabIndex={0} role="region" aria-label={t("Candidates")}>
      <table className="w-full min-w-[700px] text-sm">
        <thead><tr className="border-b border-slate-100 text-start text-[10px] font-semibold uppercase tracking-[.12em] text-slate-400">
          <th className="px-4 py-3">{t("Candidate")}</th><th className="px-4 py-3">{t("Role")}</th><th className="px-4 py-3">{t("Repositories")}</th><th className="px-4 py-3">{t("Pipeline stage")}</th><th className="px-4 py-3 text-end">{t("Evidence index")}</th><th className="px-4 py-3 text-end">{t("Status")}</th>
        </tr></thead>
        <tbody>{candidates.map((candidate) => <tr key={candidate.id} className="group border-b border-slate-50 transition-colors last:border-0 hover:bg-brand-50/50">
          <td className="px-4 py-4"><div className="flex items-center gap-3"><CandidateInitials name={candidate.name} /><div><div className="flex items-center gap-2"><Link href={`/candidates/${candidate.id}`} className="font-semibold text-slate-900 hover:text-brand-700">{candidate.name}</Link>{candidate.isDemo && <Badge tone="warning">{t("Demo")}</Badge>}</div><span className="mt-1 block text-xs text-slate-400">{t("CV claims grounded count", { count: candidate.verifiedClaimCount ?? 0 })}</span></div></div></td>
          <td className="px-4 py-4 text-slate-600">{t(candidate.role)}</td><td className="tnum px-4 py-4 text-slate-600">{candidate.repositoryCount ?? 0}</td><td className="px-4 py-4 text-slate-600">{t(STAGE_LABELS[candidate.furthestStage])}</td><td className="px-4 py-4 text-end"><VerifiedScoreChip score={candidate.verifiedSkillScore} /></td><td className="px-4 py-4 text-end"><OutcomeBadge outcome={candidate.outcome} /></td>
        </tr>)}</tbody>
      </table>
    </div>
  </>;
}
