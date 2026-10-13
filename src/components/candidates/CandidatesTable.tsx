"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { type CandidateRecord, STAGE_LABELS } from "@/features/hiring-analytics/types";
import { matchingSkills, readPoolQuery, searchPool, type PoolCv, type PoolSource } from "@/features/candidates/pool";
import { yearsOfWork } from "@/components/shortlists/coverage";
import Badge from "../ui/Badge";
import { OutcomeBadge, VerifiedScoreChip } from "./badges";
import { useI18n } from "@/components/i18n/LocaleProvider";

function CandidateInitials({ name }: { name: string }) {
  return <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-xs font-semibold text-slate-600 transition group-hover:bg-brand-100 group-hover:text-brand-800">{name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>;
}

/** What the applicant's CV states: the role, the dated work, and the skills, with the ones a search asked for first. */
function CvSummary({ own, matched, limit }: { own: PoolCv | undefined; matched: string[]; limit: number }) {
  const { t } = useI18n();
  if (!own || (own.skills.length === 0 && !own.statedRole && own.workMonths === null)) return <span className="text-xs text-slate-500">{t("No CV claims saved")}</span>;
  const years = own.workMonths === null ? null : yearsOfWork(own.workMonths);
  const skills = [...matched, ...own.skills.filter((skill) => !matched.includes(skill))];
  return <div className="min-w-0">
    {(own.statedRole || own.workMonths !== null) && <p className="text-xs leading-5 text-slate-600">
      {own.statedRole && t(own.statedRole)}{own.statedRole && own.workMonths !== null && " · "}
      {own.workMonths !== null && (years === null ? t("Dated work, years: under 1") : t("Dated work, years: {years}", { years }))}
    </p>}
    {skills.length > 0 && <ul className="mt-1.5 flex flex-wrap gap-1">
      {skills.slice(0, limit).map((skill) => <li key={skill} dir="ltr" className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${matched.includes(skill) ? "bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200" : "bg-slate-100 text-slate-700"}`}>{skill}</li>)}
      {skills.length > limit && <li dir="ltr" className="rounded-full px-1.5 py-0.5 text-[11px] font-medium text-slate-500">+{skills.length - limit}</li>}
    </ul>}
  </div>;
}

export default function CandidatesTable({ candidates, cv = {} }: { candidates: CandidateRecord[]; cv?: Record<string, PoolCv> }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<PoolSource>("all");
  const shown = useMemo(() => searchPool(candidates, cv, query, source), [candidates, cv, query, source]);
  const asked = useMemo(() => readPoolQuery(query), [query]);
  const sources: Array<[PoolSource, string]> = [["all", t("All")], ["code", t("Public code read")], ["cv", t("From CV only")]];

  return <>
    <div className="flex flex-col gap-3 border-b border-slate-100 p-3 sm:flex-row sm:items-end sm:justify-between sm:px-0 sm:pb-4 sm:pt-0">
      <div className="min-w-0 flex-1 sm:max-w-xl">
        <label htmlFor="pool-search" className="block text-xs font-semibold text-slate-700">{t("Search the pool")}</label>
        <input id="pool-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off"
          placeholder={t("A name, a role or skills, such as react postgres")}
          className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100" />
      </div>
      <fieldset className="min-w-0">
        <legend className="sr-only">{t("Show applicants")}</legend>
        <div className="flex flex-wrap gap-1.5">
          {sources.map(([value, label]) => <button key={value} type="button" aria-pressed={source === value} onClick={() => setSource(value)}
            className={`inline-flex min-h-11 items-center rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${source === value ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-brand-300"}`}>{label}</button>)}
        </div>
      </fieldset>
    </div>
    <p role="status" aria-live="polite" className="px-3 pt-3 text-xs text-slate-500 sm:px-0">
      {t("Showing {count} of {total}", { count: shown.length, total: candidates.length })}
      {asked.skills.length > 0 && <> · {t("CV names or covers")}: <span dir="ltr" className="inline-block text-start font-medium text-slate-700">{asked.skills.join(" + ")}</span></>}
    </p>

    {shown.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">{t("No candidates match your filters.")}</p> : <>
      <div className="grid gap-3 p-3 md:hidden">
        {shown.map((candidate) => <Link key={candidate.id} href={`/candidates/${candidate.id}`} className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_26px_rgba(15,23,42,.045)] transition active:scale-[.99]">
          <div className="flex items-start gap-3"><CandidateInitials name={candidate.name} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm text-slate-950">{candidate.name}</strong>{candidate.isDemo && <Badge tone="warning">{t("Demo")}</Badge>}</div><span className="mt-1 block text-xs text-slate-500">{t(candidate.role || "Not recorded")}</span></div><VerifiedScoreChip score={candidate.verifiedSkillScore} hasCode={(candidate.repositoryCount ?? 0) > 0} /></div>
          <div className="mt-3 border-t border-slate-100 pt-3"><CvSummary own={cv[candidate.id]} matched={matchingSkills(cv[candidate.id], asked)} limit={5} /></div>
          <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center"><div><dt className="text-[9px] uppercase tracking-wider text-slate-400">{t("Repositories")}</dt><dd className="tnum mt-1 text-sm font-semibold text-slate-800">{candidate.repositoryCount ?? 0}</dd></div><div><dt className="text-[9px] uppercase tracking-wider text-slate-400">{t("Claims")}</dt><dd className="tnum mt-1 text-sm font-semibold text-slate-800">{candidate.verifiedClaimCount ?? 0}</dd></div><div><dt className="text-[9px] uppercase tracking-wider text-slate-400">{t("Stage")}</dt><dd className="mt-1 truncate text-[10px] font-semibold text-slate-700">{t(STAGE_LABELS[candidate.furthestStage])}</dd></div></dl>
          <div className="mt-3 flex items-center justify-between"><OutcomeBadge outcome={candidate.outcome} /><span className="text-[10px] font-semibold text-brand-700">{t("Open dossier")} <span className="directional-icon">→</span></span></div>
        </Link>)}
      </div>

      <div className="mt-3 hidden overflow-x-auto overscroll-x-contain md:block" tabIndex={0} role="region" aria-label={t("Candidates")}>
        <table className="w-full min-w-[1080px] table-fixed text-sm">
          <colgroup><col className="w-[21%]" /><col className="w-[27%]" /><col className="w-[10%]" /><col className="w-[9%]" /><col className="w-[11%]" /><col className="w-[9%]" /><col className="w-[13%]" /></colgroup>
          <thead><tr className="border-b border-slate-100 text-start text-[10px] font-semibold uppercase tracking-[.12em] text-slate-400">
            <th className="px-4 py-3">{t("Candidate")}</th><th className="px-4 py-3">{t("On the CV")}</th><th className="px-4 py-3">{t("Role")}</th><th className="px-4 py-3">{t("Repositories")}</th><th className="px-4 py-3">{t("Pipeline stage")}</th><th className="px-4 py-3 text-end">{t("Evidence index")}</th><th className="px-4 py-3 text-end">{t("Status")}</th>
          </tr></thead>
          <tbody>{shown.map((candidate) => <tr key={candidate.id} className="group border-b border-slate-50 align-top transition-colors last:border-0 hover:bg-brand-50/50">
            <td className="px-4 py-4"><div className="flex items-center gap-3"><CandidateInitials name={candidate.name} /><div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><Link href={`/candidates/${candidate.id}`} className="line-clamp-2 font-semibold leading-5 text-slate-900 hover:text-brand-700">{candidate.name}</Link>{candidate.isDemo && <Badge tone="warning">{t("Demo")}</Badge>}</div><span className="mt-1 block text-xs text-slate-400">{t("{count} CV claims grounded", { count: candidate.verifiedClaimCount ?? 0 })}</span></div></div></td>
            <td className="px-4 py-4"><CvSummary own={cv[candidate.id]} matched={matchingSkills(cv[candidate.id], asked)} limit={6} /></td>
            <td className="px-4 py-4 text-slate-600">{t(candidate.role || "Not recorded")}</td><td className="tnum px-4 py-4 text-slate-600">{candidate.repositoryCount ?? 0}</td><td className="px-4 py-4 text-slate-600">{t(STAGE_LABELS[candidate.furthestStage])}</td><td className="px-4 py-4 text-end"><VerifiedScoreChip score={candidate.verifiedSkillScore} hasCode={(candidate.repositoryCount ?? 0) > 0} /></td><td className="whitespace-nowrap px-4 py-4 text-end"><OutcomeBadge outcome={candidate.outcome} /></td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
  </>;
}
