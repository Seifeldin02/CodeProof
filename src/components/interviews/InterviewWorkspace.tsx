"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import Card from "@/components/ui/Card";
import { blankQualityChecks, InterviewRatingSchema, QualityCheckSchema, type InterviewAssessment, type InterviewQualityChecks, type InterviewSession, type UpdateInterview } from "@/features/interviews/contracts";
import { buttonClass, fieldClass } from "./InterviewDesk";

const errors: Record<string, string> = {
  STALE_REVISION: "Someone saved a newer version. Your notes are still here; copy them before reloading to reconcile changes.",
  COMPLETED_LOCKED: "This assessment is complete and locked. Start a new interview for new observations.",
  INCOMPLETE_ASSESSMENT: "Record a specific observation and complete the quality checks for any positive rating, plus a decision, rationale, next action, follow-up date, and candidate message.",
};
const qualityFields: { key: keyof InterviewQualityChecks; label: string }[] = [
  { key: "expectedBehavior", label: "Expected behavior satisfies the role requirement" },
  { key: "failureCase", label: "Explained a realistic failure case" },
  { key: "validation", label: "Proposed a credible test or validation" },
  { key: "ownReasoning", label: "Explained their own decisions, including any AI output they accepted or changed" },
  { key: "tradeoffs", label: "Compared alternatives and trade-offs (required for exceeds)" },
];
export default function InterviewWorkspace({ initialSession }: { initialSession: InterviewSession }) {
  const { t, locale } = useI18n();
  const [session, setSession] = useState(initialSession), [assessment, setAssessment] = useState<InterviewAssessment>(initialSession.assessment);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [manualPrompt, setManualPrompt] = useState("");
  const locked = session.status === "completed";
  function edit<K extends keyof InterviewAssessment>(key: K, value: InterviewAssessment[K]) { setAssessment((previous) => ({ ...previous, [key]: value })); setNotice(""); }
  function editQuality(criterionId: string, key: keyof InterviewQualityChecks, value: InterviewQualityChecks[keyof InterviewQualityChecks]) {
    edit("ratings", assessment.ratings.map((rating) => rating.criterionId === criterionId
      ? { ...rating, qualityChecks: { ...blankQualityChecks(), ...rating.qualityChecks, [key]: value } } : rating));
  }
  async function persist(action: UpdateInterview["action"]) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/interviews/${session.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: session.revision, action, ...(action === "mark_communicated" ? {} : { assessment }) }) });
      const data = await response.json() as { session?: InterviewSession; error?: { code: string } };
      if (!response.ok || !data.session) { setError(t(errors[data.error?.code ?? ""] ?? "Could not save. Your notes are still here; try again.")); return; }
      setSession(data.session); setAssessment(data.session.assessment); setConfirm(false);
      setNotice(t(action === "save" ? "Draft saved." : action === "complete" ? "Assessment finalized. The candidate update is still your responsibility." : "Communication recorded. No email was sent by CodeProof."));
    } catch { setError(t("Could not save. Your notes are still here; try again.")); } finally { setBusy(false); }
  }
  function save(event: FormEvent) { event.preventDefault(); void persist("save"); }
  async function copy() {
    try { await navigator.clipboard.writeText(assessment.candidateMessage); setNotice(t("Message copied. Send it through your own communication channel.")); }
    catch { setError(t("Copy is unavailable. Select and copy the message manually.")); }
  }
  async function copyProbe(question: string, challenge: string) {
    const prompt = `${question}\n\n${challenge}\n\n${t("AI and documentation are allowed. Work through a concrete solution, explain what you accepted or changed, and show how you would verify it. Do not share confidential code.")}`;
    try { await navigator.clipboard.writeText(prompt); setManualPrompt(""); setNotice(t("Assessment prompt copied. Share it with the candidate in your interview channel.")); }
    catch { setManualPrompt(prompt); setError(t("Copy is unavailable. Select and copy the assessment prompt manually.")); }
  }
  return <div className="space-y-5">
    <div className="flex flex-wrap gap-4 text-sm font-semibold text-brand-700"><Link className="inline-flex min-h-11 items-center" href="/interviews">{t("Back to interview desk")}</Link><Link className="inline-flex min-h-11 items-center" href={`/candidates/${session.candidateId}`}>{t("Open candidate dossier")}</Link></div>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><p className="text-xs font-semibold text-brand-700">{t(locked ? "Completed · locked assessment" : "Draft · human assessment")}{session.isDemo && ` · ${t("Demo data")}`}</p><h1 className="mt-3 break-words text-3xl font-semibold text-slate-950">{session.preparation.candidateName}</h1><p className="mt-2 break-words text-sm text-slate-600">{session.preparation.roleTitle}</p><p className="mt-4 text-xs leading-6 text-slate-500">{t("Frozen role criteria and evidence references. Repository evidence does not prove authorship. Missing public code does not mean missing skill.")}</p>
      <details className="mt-3 text-xs text-slate-500"><summary className="cursor-pointer py-2">{t("Evidence snapshot / traceability")}</summary><div className="space-y-2 py-2"><p>{t("Role criteria fingerprint")} <bdi dir="ltr" className="break-all font-mono">{session.preparation.requirementsHash}</bdi></p><p>{t("Analysis versions")}: {session.preparation.analysisVersionIds.length ? session.preparation.analysisVersionIds.map((id) => <bdi key={id} dir="ltr" className="me-2 break-all font-mono">{id}</bdi>) : t("No public-code analysis")}</p></div></details>
    </section>
    <section className="rounded-2xl border border-brand-200 bg-brand-50/40 p-5 sm:p-7" aria-labelledby="assessment-method">
      <h2 id="assessment-method" className="text-lg font-semibold text-slate-950">{t("Focused role-fit assessment")}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-700">{t("Use the selected role criteria to test the most important unresolved evidence before spending time on a broader interview. These are discussion prompts, not an automated hiring verdict.")}</p>
      <ol className="mt-3 list-inside list-decimal space-y-1 text-sm leading-6 text-slate-700">
        <li>{t("Ask the candidate-specific question and allow AI or documentation.")}</li>
        <li>{t("Probe the proposed result, a failure case, and how they would test it.")}</li>
        <li>{t("Record concrete observations against the role criterion; you make the decision.")}</li>
      </ol>
    </section>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">{error}</p>}
    <p role="status" aria-live="polite" className={notice ? "rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900" : "sr-only"}>{notice}</p>
    <form onSubmit={save} className="space-y-5">
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)]">
        <div className="min-w-0 space-y-5">{session.preparation.criteria.map((criterion, index) => {
          const rating = assessment.ratings.find((r) => r.criterionId === criterion.id)!;
          const challenge = locale === "ar"
            ? `لهذه الوظيفة (${session.preparation.roleTitle})، اقترح تغييراً صغيراً أو حلاً عملياً يتعلق بـ«${criterion.requirement}». وضح السلوك المتوقع وحالة فشل وطريقة اختبار النتيجة. يمكنك الاستناد إلى خبرة خاصة دون مشاركة كود سري.`
            : `For this ${session.preparation.roleTitle} role, propose one small change or concrete solution involving “${criterion.requirement}”. Explain the expected behavior, one failure case, and a test that would validate the result. You may use private work as an example without sharing confidential code.`;
          return <Card key={criterion.id} title={`${index + 1}. ${criterion.requirement}`} subtitle={t(criterion.importance === "required" ? "Required" : criterion.importance === "preferred" ? "Preferred" : "Context")}>
            <p className="rounded-xl bg-slate-50 p-4 text-sm leading-7 text-slate-700">{criterion.question[locale]}</p>
            <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50/40 p-4 text-sm leading-6 text-slate-700">
              <p className="font-semibold text-brand-800">{t("AI-permitted live assessment")}</p>
              <p className="mt-1">{challenge}</p>
              <p className="mt-1">{t("AI and documentation are allowed. Work through a concrete solution, explain what you accepted or changed, and show how you would verify it. Do not share confidential code.")}</p>
              <button type="button" onClick={() => void copyProbe(criterion.question[locale], challenge)} className="mt-3 min-h-11 rounded-xl border border-brand-300 bg-white px-4 py-2 text-sm font-semibold text-brand-800 hover:border-brand-600">{t("Copy assessment prompt")}</button>
              {manualPrompt.startsWith(criterion.question[locale]) && <label className="mt-3 block text-xs font-medium">{t("Select and copy the assessment prompt")}<textarea readOnly dir={locale === "ar" ? "rtl" : "ltr"} rows={7} className={fieldClass} value={manualPrompt} onFocus={(event) => event.currentTarget.select()} /></label>}
            </div>
            <div className="mt-4 space-y-2">{criterion.sources.length ? criterion.sources.map((source) => <div key={source.citationId} className="rounded-xl border border-slate-200 p-3"><a href={source.sourceLink} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 max-w-full items-center text-sm font-semibold text-brand-700 underline decoration-brand-200 underline-offset-4"><bdi dir="ltr" className="break-all">{source.filePath}</bdi></a><p className="text-xs leading-5 text-slate-500">{t(source.attributionStatus === "verified_owner" ? "Verified owner" : source.attributionStatus === "verified_contributor" ? "Verified contributor" : source.attributionStatus === "candidate_claimed" ? "Candidate-claimed · not verified" : "Attribution unverified")} · {t(source.evidenceLevel)}</p><p className="mt-1 text-xs text-slate-500">{t("Citation")} <bdi dir="ltr" className="break-all font-mono">{source.citationId}</bdi></p></div>) : <p className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 text-xs leading-6 text-amber-900">{t("Evidence gap, not a skill deficit. Discuss a work example without requesting confidential code.")}</p>}</div>
            <label className="mt-4 block text-sm font-medium">{t("Human assessment")}<select disabled={locked || busy} className={fieldClass} value={rating.rating} onChange={(e) => edit("ratings", assessment.ratings.map((r) => r.criterionId === criterion.id ? { ...r, rating: InterviewRatingSchema.parse(e.target.value) } : r))}>{InterviewRatingSchema.options.map((value) => <option key={value} value={value}>{t({ unassessed: "Not assessed", emerging: "Needs further validation", meets: "Meets the role criterion", exceeds: "Exceeds the role criterion" }[value])}</option>)}</select></label>
            <p className="mt-2 text-xs leading-5 text-slate-500">{t("Judge the quality of the proposed work, not AI use: does it meet the requirement, address a failure case, and include a credible test? Meets: explains these choices and their own contribution. Exceeds: also compares alternatives and trade-offs. Unclear answers need more validation, not automatic rejection.")}</p>
            <fieldset className="mt-4 space-y-3 rounded-xl border border-slate-200 p-4">
              <legend className="px-1 text-sm font-semibold text-slate-900">{t("Observed quality checks")}</legend>
              <p className="text-xs leading-5 text-slate-600">{t("Record what the candidate demonstrated, not whether they used AI. A positive rating requires the first four checks; exceeds also requires trade-offs.")}</p>
              {qualityFields.map(({ key, label }) => <label key={key} className="block text-xs font-medium text-slate-700">{t(label)}
                <select disabled={locked || busy} className={fieldClass} value={rating.qualityChecks?.[key] ?? "not_checked"} onChange={(event) => editQuality(criterion.id, key, QualityCheckSchema.parse(event.target.value))}>
                  <option value="not_checked">{t("Not checked")}</option>
                  <option value="demonstrated">{t("Demonstrated")}</option>
                  <option value="needs_validation">{t("Needs validation")}</option>
                </select>
              </label>)}
            </fieldset>
            <label className="mt-4 block text-sm font-medium">{t("Observed answer / concrete evidence")}<textarea disabled={locked || busy} maxLength={2000} rows={4} className={fieldClass} value={rating.observation} onChange={(e) => edit("ratings", assessment.ratings.map((r) => r.criterionId === criterion.id ? { ...r, observation: e.target.value } : r))} /></label>
          </Card>;
        })}</div>
        <div className="min-w-0 space-y-5"><Card title={t("Decision & next step")} subtitle={t("You decide. CodeProof does not rank or reject candidates.")}>
          <label className="block text-sm font-medium">{t("Human decision")}<select disabled={locked || busy} className={fieldClass} value={assessment.decision ?? ""} onChange={(e) => edit("decision", e.target.value as InterviewAssessment["decision"] || null)}><option value="">{t("Not decided")}</option><option value="advance">{t("Advance")}</option><option value="hold">{t("Hold / validate further")}</option><option value="decline">{t("Decline")}</option></select></label>
          <label className="mt-4 block text-sm font-medium">{t("Decision rationale")}<textarea disabled={locked || busy} maxLength={3000} rows={4} className={fieldClass} value={assessment.rationale} onChange={(e) => edit("rationale", e.target.value)} /></label>
          <label className="mt-4 block text-sm font-medium">{t("Next action")}<input disabled={locked || busy} maxLength={500} className={fieldClass} value={assessment.nextAction} onChange={(e) => edit("nextAction", e.target.value)} /></label>
          <label className="mt-4 block text-sm font-medium">{t("Follow up by")}<input type="date" dir="ltr" disabled={locked || busy} className={fieldClass} value={assessment.followUpOn ?? ""} onChange={(e) => edit("followUpOn", e.target.value || null)} /></label>
          <p className="mt-3 text-xs leading-5 text-slate-500">{t("Finalizing locks this assessment. It does not change the candidate pipeline or send a message.")}</p>
        </Card>
        <Card title={t("Candidate update")} subtitle={t("Write a useful next step. Avoid confidential notes, guesses, and unsupported accusations.")}>
          <label className="block text-sm font-medium">{t("Message to the candidate")}<textarea disabled={locked || busy} maxLength={4000} rows={6} className={fieldClass} value={assessment.candidateMessage} onChange={(e) => edit("candidateMessage", e.target.value)} /></label>
          <button type="button" onClick={copy} disabled={!assessment.candidateMessage} className="mt-3 min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">{t("Copy message")}</button>
          {locked && !session.communicatedAt && <button type="button" disabled={busy} onClick={() => void persist("mark_communicated")} className={`${buttonClass} mt-3 w-full`}>{t("I sent this update · mark communicated")}</button>}
          {session.communicatedAt && <p className="mt-3 text-sm font-medium text-emerald-800">{t("Communicated")}</p>}
          <p className="mt-3 text-xs leading-5 text-slate-500">{t("CodeProof does not send emails. Mark communicated only after sending the update yourself.")}</p>
        </Card></div>
      </div>
      {!locked && <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap gap-3"><button type="submit" disabled={busy} className={buttonClass}>{t(busy ? "Working…" : "Save draft")}</button><button type="button" disabled={busy} onClick={() => setConfirm(true)} className="min-h-11 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800">{t("Finalize assessment")}</button></div>{confirm && <div className="mt-4 rounded-xl bg-amber-50 p-4"><p className="text-sm leading-6 text-amber-900">{t("Confirm finalization? Observations and decision will become read-only. Your candidate update will remain pending until you send it.")}</p><div className="mt-3 flex flex-wrap gap-3"><button type="button" disabled={busy} className={buttonClass} onClick={() => void persist("complete")}>{t("Confirm & lock assessment")}</button><button type="button" className="min-h-11 px-3 text-sm font-medium" onClick={() => setConfirm(false)}>{t("Cancel")}</button></div></div>}<p className="mt-3 text-xs leading-5 text-slate-500">{t("Notes are not auto-saved. Save your draft before leaving this page.")}</p></div>}
    </form>
  </div>;
}
