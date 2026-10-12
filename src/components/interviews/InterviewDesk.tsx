"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import Card from "@/components/ui/Card";
import { ROLES, type CandidateRecord, type Role } from "@/features/hiring-analytics/types";
import type { CompanyRequirement } from "@/features/requirements/store";
import { interviewActionState, type InterviewSession } from "@/features/interviews/contracts";
import { formatDateForLocale } from "@/i18n/translations";

export const fieldClass = "mt-2 min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50";
export const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50";
export default function InterviewDesk({ candidates: initialCandidates, requirements, sessions, selectedCandidate, selectedRole }: {
  candidates: CandidateRecord[]; requirements: CompanyRequirement[]; sessions: InterviewSession[]; selectedCandidate?: string;
  selectedRole?: { id: string; title: string };
}) {
  const { t, locale } = useI18n(), router = useRouter();
  const [candidates, setCandidates] = useState(initialCandidates);
  const [candidateId, setCandidateId] = useState(selectedCandidate ?? "");
  const [criterionIds, setCriterionIds] = useState(requirements.filter((r) => r.importance === "required").slice(0, 5).map((r) => r.id));
  const [roleTitle, setRoleTitle] = useState(selectedRole?.title ?? "");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [name, setName] = useState(""), [role, setRole] = useState<Role>(ROLES[0]);
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
      const response = await fetch("/api/candidates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, role }) });
      if (!response.ok) throw new Error("candidate");
      const { candidate } = await response.json() as { candidate: CandidateRecord };
      setCandidates((previous) => [candidate, ...previous]); setCandidateId(candidate.id); setName(""); router.refresh();
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
          <label className="block text-sm font-medium">{t("Candidate")}<select required className={fieldClass} value={candidateId} onChange={(e) => setCandidateId(e.target.value)}><option value="">{t("Select a candidate")}</option>{candidates.map((c) => <option key={c.id} value={c.id}>{c.name}{c.isDemo ? ` · ${t("Demo data")}` : ""}</option>)}</select></label>
          <label className="block text-sm font-medium">{t("Role being hired")}<input required minLength={3} maxLength={160} readOnly={Boolean(selectedRole)} className={fieldClass} value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} /></label>
          <fieldset><legend className="text-sm font-medium">{t("Interview criteria (1–5)")}</legend><div className="mt-2 space-y-2">{requirements.map((r) => <label key={r.id} className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" checked={criterionIds.includes(r.id)} disabled={!criterionIds.includes(r.id) && criterionIds.length >= 5} onChange={(e) => setCriterionIds((current) => e.target.checked ? [...current, r.id] : current.filter((id) => id !== r.id))} className="h-4 w-4 shrink-0 accent-emerald-700" /><span className="min-w-0 break-words">{r.requirement}</span><span className="ms-auto text-xs text-slate-500">{t(r.importance === "required" ? "Required" : r.importance === "preferred" ? "Preferred" : "Context")}</span></label>)}</div></fieldset>
          <button disabled={busy || !criterionIds.length} className={buttonClass}>{t(busy ? "Working…" : "Create interview plan")}</button>
          <p className="text-xs leading-5 text-slate-500">{t("The role criteria and evidence references are snapshotted. Later edits to requirements do not change this interview.")}</p>
        </form> : <div><p className="text-sm leading-6 text-slate-600">{t("Set the hiring bar first. Add the skills or responsibilities you need to assess.")}</p><Link href="/requirements" className={`${buttonClass} mt-4`}>{t("Company requirements")}</Link></div>}
      </Card>
      <Card title={t("No public code? Keep the candidate in the process.")} subtitle={t("Private work is not a negative signal. Use a structured discussion instead.")}><form onSubmit={addCandidate} className="space-y-3">
        <label className="block text-sm font-medium">{t("Candidate name")}<input required minLength={2} maxLength={120} className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="block text-sm font-medium">{t("Candidate role")}<select className={fieldClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r}>{t(r)}</option>)}</select></label>
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
