"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import Card from "@/components/ui/Card";
import { ROLES, SOURCE_CHANNELS, type CandidateRecord, type SourceChannel } from "@/features/hiring-analytics/types";
import type { CompanyRequirement } from "@/features/requirements/store";
import { interviewActionState, type InterviewSession } from "@/features/interviews/contracts";
import type { CriterionSignal } from "@/features/interviews/suggest";
import { formatDateForLocale } from "@/i18n/translations";

export const fieldClass = "mt-2 min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50";
export const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50";
export default function InterviewDesk({ candidates: initialCandidates, requirements, sessions, selectedCandidate, selectedRole, suggested, signals }: {
  candidates: CandidateRecord[]; requirements: CompanyRequirement[]; sessions: InterviewSession[]; selectedCandidate?: string;
  selectedRole?: { id: string; title: string };
  /** For a chosen applicant and role: the criteria to raise first, and what is already known about each one. */
  suggested?: string[]; signals?: Record<string, CriterionSignal>;
}) {
  const { t, locale } = useI18n(), router = useRouter();
  const [candidates, setCandidates] = useState(initialCandidates);
  const [candidateId, setCandidateId] = useState(selectedCandidate ?? "");
  const [criterionIds, setCriterionIds] = useState(suggested ?? requirements.filter((r) => r.importance === "required").slice(0, 5).map((r) => r.id));
  const signalLabel: Record<CriterionSignal, string | null> = { verified: t("Verified citation"), stated: t("On the CV"), pending: t("Repository attribution pending"), none: null };
  // What is known about each criterion belongs to one applicant, so choosing another one reloads the plan for them.
  function chooseCandidate(id: string) {
    setCandidateId(id);
    if (selectedRole) router.replace(`/interviews?${new URLSearchParams({ ...(id ? { candidate: id } : {}), role: selectedRole.id })}`);
  }
  const [roleTitle, setRoleTitle] = useState(selectedRole?.title ?? "");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [name, setName] = useState(""), [role, setRole] = useState("");
  const [source, setSource] = useState<SourceChannel>("Not recorded");
  const today = new Date().toLocaleDateString("en-CA");
  const pending = sessions.filter((session) => !session.communicatedAt);
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/interviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateId, roleTitle, criterionIds, ...(selectedRole ? { roleId: selectedRole.id } : {}) }) });
      if (!response.ok) throw new Error("create");
      const { session } = await response.json() as { session: InterviewSession };
      router.push(`/interviews/${session.id}`);
    } catch { setError(t("Could not create the interview plan. Check your candidate and saved requirements, then retry.")); } finally { setBusy(false); }
  }
  async function addCandidate(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/candidates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, role, source }) });
      if (!response.ok) throw new Error("candidate");
      const { candidate } = await response.json() as { candidate: CandidateRecord };
      setCandidates((previous) => [candidate, ...previous]); setCandidateId(candidate.id); setName(""); setRole(""); setSource("Not recorded"); router.refresh();
    } catch { setError(t("Could not add the candidate. Try again.")); } finally { setBusy(false); }
  }
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-3">{[
      [t("Awaiting next step"), pending.length],
      [t("Overdue follow-ups"), pending.filter((s) => interviewActionState(s, today) === "overdue").length],
      [t("Ready to communicate"), pending.filter((s) => s.status === "completed").length],
    ].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs text-slate-600">{label}</p><p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p></div>)}</div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)]">
      <div className="min-w-0 space-y-5"><Card title={t("Prepare a focused interview")} subtitle={t("Freeze up to five role criteria. Record observations, not an AI verdict.")}>
        {requirements.length ? <form onSubmit={create} className="space-y-4">
          <label className="block text-sm font-medium">{t("Candidate")}<select required className={fieldClass} value={candidateId} onChange={(e) => chooseCandidate(e.target.value)}><option value="">{t("Select a candidate")}</option>{candidates.map((c) => <option key={c.id} value={c.id}>{c.name}{c.isDemo ? ` · ${t("Demo data")}` : ""}</option>)}</select></label>
          <label className="block text-sm font-medium">{t("Role being hired")}<input required minLength={3} maxLength={160} readOnly={Boolean(selectedRole)} className={fieldClass} value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} /></label>
          <fieldset><legend className="text-sm font-medium">{t("Interview criteria (1–5)")}</legend>{suggested && <p className="mt-1 text-xs leading-5 text-slate-500">{t("Suggested first: what the role requires and this applicant's CV names without verified code behind it.")}</p>}<div className="mt-2 max-h-96 space-y-2 overflow-y-auto pe-1">{requirements.map((r) => { const signal = signals ? signalLabel[signals[r.id] ?? "none"] : null; return <label key={r.id} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" checked={criterionIds.includes(r.id)} disabled={!criterionIds.includes(r.id) && criterionIds.length >= 5} onChange={(e) => setCriterionIds((current) => e.target.checked ? [...current, r.id] : current.filter((id) => id !== r.id))} className="h-4 w-4 shrink-0 accent-emerald-700" /><span className="min-w-0 break-words">{r.requirement}</span>{signal && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${signals?.[r.id] === "verified" ? "bg-emerald-50 text-emerald-800" : signals?.[r.id] === "pending" ? "bg-amber-50 text-amber-800" : "bg-sky-50 text-sky-800"}`}>{signal}</span>}<span className="ms-auto text-xs text-slate-500">{t(r.importance === "required" ? "Required" : r.importance === "preferred" ? "Preferred" : "Context")}</span></label>; })}</div></fieldset>
          <button disabled={busy || !criterionIds.length} className={buttonClass}>{t(busy ? "Working…" : "Create interview plan")}</button>
          <p className="text-xs leading-5 text-slate-500">{t("The role criteria and evidence references are snapshotted. Later edits to requirements do not change this interview.")}</p>
        </form> : <div><p className="text-sm leading-6 text-slate-600">{t("Set the hiring bar first. Add the skills or responsibilities you need to assess.")}</p><Link href="/requirements" className={`${buttonClass} mt-4`}>{t("Company requirements")}</Link></div>}
      </Card>
      <Card title={t("No public code? Keep the candidate in the process.")} subtitle={t("Private work is not a negative signal. Use a structured discussion instead.")}><form onSubmit={addCandidate} className="space-y-3">
        <label className="block text-sm font-medium">{t("Candidate name")}<input required minLength={2} maxLength={120} className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="block text-sm font-medium">{t("Candidate role")}<input required minLength={2} maxLength={120} list="interview-candidate-role-suggestions" className={fieldClass} value={role} onChange={(e) => setRole(e.target.value)} /></label><datalist id="interview-candidate-role-suggestions">{ROLES.map((r) => <option key={r} value={r} label={t(r)} />)}</datalist>
        <label className="block text-sm font-medium">{t("Applicant source")}<select className={fieldClass} value={source} onChange={(event) => setSource(event.target.value as SourceChannel)}>{SOURCE_CHANNELS.map((item) => <option key={item} value={item}>{t(item)}</option>)}</select></label>
        <button disabled={busy} className={buttonClass}>{t("Add candidate without repository")}</button>
      </form></Card></div>
      <Card title={t("Interview & follow-up queue")} subtitle={t("A decision is not finished until the candidate knows the next step.")}>
        {!sessions.length && <p className="py-8 text-sm leading-6 text-slate-500">{t("No interviews yet. Create a plan from a candidate dossier or add a candidate whose work is private.")}</p>}
        <div className="space-y-3">{[...sessions].sort((a,b) => Number(Boolean(a.communicatedAt)) - Number(Boolean(b.communicatedAt))).map((s) => <Link key={s.id} href={`/interviews/${s.id}`} className="block rounded-xl border border-slate-200 p-4 transition hover:border-brand-500 focus-visible:outline-brand-600">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="min-w-0 break-words text-sm font-semibold text-slate-950">{s.preparation.candidateName}</h3><span className={`rounded-full px-2 py-1 text-xs font-medium ${interviewActionState(s,today) === "overdue" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{t({ prepare: "Prepare / interview", communicate: "Candidate update due", overdue: "Follow-up overdue", done: "Communicated" }[interviewActionState(s,today)])}</span></div>
          <p className="mt-1 break-words text-xs text-slate-600">{s.preparation.roleTitle} · {s.preparation.criteria.length} {t("criteria")}{s.isDemo ? ` · ${t("Demo data")}` : ""}</p>
          {s.assessment.followUpOn && <p className="mt-3 text-xs text-slate-500">{t("Follow up by")} {formatDateForLocale(locale, `${s.assessment.followUpOn}T12:00:00Z`)}</p>}
        </Link>)}</div>
      </Card>
    </div>
  </div>;
}
