import { createHash } from "node:crypto";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getShareStore } from "@/features/sharing/store";
import { getI18n } from "@/i18n/server";
import { localizeAnalysisText } from "@/i18n/translations";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

/** A citation stores the canonical level; readers are shown the same wording the recruiter's dossier uses. */
const LEVEL_LABEL: Record<string, string> = {
  strong: "Strong Evidence", good: "Good Evidence", partial: "Partial Evidence", limited: "Limited Evidence", insufficient: "Insufficient Evidence",
};

export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? requestHeaders.get("x-real-ip")?.trim() ?? "unknown";
  const report = await getShareStore().resolve(token, createHash("sha256").update(ip).digest("hex"),
    requestHeaders.get("user-agent")?.split(/[\s/]/u)[0]?.slice(0, 200) || null);
  if (!report) notFound();
  const { locale, t } = await getI18n();
  const ar = locale === "ar";
  // The snapshot is stored once, in the engine's English, and is put into the reader's language when shown. A sentence
  // no translation knows (an AI-written one) stays English and is laid out left to right. A translated sentence is
  // laid out right to left even when it opens with a Latin name such as "TypeScript", which is why the browser's own
  // guess from the first letter is not used.
  const say = (text: string) => localizeAnalysisText(locale, text);
  const direction = (text: string) => /\p{Script=Arabic}/u.test(text) ? "rtl" : "ltr";
  const copy = ar ? {
    eyebrow: "تقرير أدلة مشترك", repository: "المستودع", attribution: "نسبة العمل إلى المرشح",
    claimed: "رابط قدّمه المرشح؛ لم يُتحقق من ملكيته أو مساهمته.",
    verified: "تم التحقق من صلة المرشح بهذا المستودع.",
    skills: "المهارات المدعومة بالأدلة", citations: "مراجع الملفات الدقيقة", files: "الملفات التي فُحصت",
    filesOnly: "لم ينتج هذا التحليل استشهادات مهارية دقيقة؛ تُعرض الملفات التي فُحصت فقط دون إثبات مهارة أو مساهمة.",
    questions: "أسئلة مقابلة مستندة إلى الأدلة", demo: "بيانات تجريبية",
    notice: "هذا التقرير لقطة محددة من تحليل كود عام، وليس توصية توظيف. غياب الدليل ليس إثباتًا لغياب المهارة.",
    lines: "الأسطر", source: "افتح المصدر", analyzed: "تاريخ التحليل",
  } : {
    eyebrow: "Shared evidence report", repository: "Repository", attribution: "Candidate attribution",
    claimed: "Candidate-provided link; ownership or contribution has not been verified.",
    verified: "The candidate's connection to this repository was verified.",
    skills: "Evidence-supported skills", citations: "Exact file citations", files: "Inspected source files",
    filesOnly: "This analysis produced no exact skill citations. These are inspected files only, not proof of a skill or contribution.",
    questions: "Evidence-grounded interview questions", demo: "Demo data",
    notice: "This is a fixed snapshot of public-code analysis, not a hiring recommendation. Missing evidence is not proof of missing skill.",
    lines: "Lines", source: "Open source", analyzed: "Analyzed",
  };
  const verified = report.attributionStatus === "verified_owner" || report.attributionStatus === "verified_contributor";
  return <div className="mx-auto min-h-screen max-w-5xl space-y-6 px-4 py-8 sm:px-8">
    <header className="rounded-3xl bg-slate-950 p-6 text-white sm:p-9">
      <p className="text-xs font-semibold uppercase tracking-[.16em] text-lime-300">{copy.eyebrow}</p>
      <h1 className="mt-3 break-words text-3xl font-semibold sm:text-4xl">{report.candidateName}</h1>
      <p className="mt-2 text-sm text-slate-300">{t(report.role || "Not recorded")}{report.isDemo ? ` · ${copy.demo}` : ""}</p>
      <p className="mt-5 text-sm leading-6 text-slate-300">{copy.notice}</p>
    </header>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
      <h2 className="text-lg font-semibold text-slate-950">{copy.repository}</h2>
      <p dir="ltr" className="mt-2 break-all text-start text-sm font-medium text-slate-800">{report.repositoryName}</p>
      <p dir="ltr" className="mt-1 break-all text-start text-xs text-slate-600">{report.repositoryUrl}</p>
      <p className="mt-3 text-xs text-slate-600">{copy.analyzed}: {new Intl.DateTimeFormat(ar ? "ar-SA" : "en-US", { dateStyle: "medium" }).format(new Date(report.analyzedAt))}</p>
      <p className={`mt-4 rounded-xl p-3 text-sm ${verified ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
        <strong>{copy.attribution}: </strong>{verified ? copy.verified : copy.claimed}
      </p>
      <p dir={direction(say(report.summary))} className="mt-4 text-sm leading-6 text-slate-700">{say(report.summary)}</p>
    </section>
    {report.skills.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
      <h2 className="text-lg font-semibold text-slate-950">{copy.skills}</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">{report.skills.map((skill) => <li key={skill.skill} className="min-w-0 rounded-xl border border-slate-200 p-4">
        <h3 dir="ltr" className="break-words text-start text-sm font-semibold text-slate-900">{skill.skill}</h3>
        <p className="mt-1 text-xs font-medium text-emerald-800">{t(skill.level)}</p>
        <p dir={direction(say(skill.explanation))} className="mt-2 text-xs leading-5 text-slate-700">{say(skill.explanation)}</p>
        <p dir="ltr" className="mt-2 break-all text-start font-mono text-[11px] text-slate-600">{skill.files.join(" · ")}</p>
      </li>)}</ul>
    </section>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
      <h2 className="text-lg font-semibold text-slate-950">{report.citationStatus === "grounded_findings" ? copy.citations : copy.files}</h2>
      {report.citationStatus === "inspected_files_only" && <p className="mt-2 text-sm leading-6 text-amber-800">{copy.filesOnly}</p>}
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">{report.citations.map((citation, index) => <li key={`${citation.filePath}-${index}`} className="min-w-0 rounded-xl bg-slate-50 p-4">
        <code dir="ltr" className="block break-all text-start text-xs text-slate-900">{citation.filePath}</code>
        <p className="mt-2 text-xs text-slate-600">
          {citation.evidenceLevel !== "inspected_file_only" && t(LEVEL_LABEL[citation.evidenceLevel] ?? citation.evidenceLevel)}
          {citation.startLine && <>{citation.evidenceLevel !== "inspected_file_only" && " · "}{copy.lines} <bdi dir="ltr">{citation.startLine}{citation.endLine && citation.endLine !== citation.startLine ? `–${citation.endLine}` : ""}</bdi></>}
        </p>
        {citation.sourceLink.startsWith("https://") && <a href={citation.sourceLink} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-emerald-800 underline underline-offset-2">{copy.source}</a>}
      </li>)}</ul>
    </section>
    {report.questions.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
      <h2 className="text-lg font-semibold text-slate-950">{copy.questions}</h2>
      <ol className="mt-4 space-y-3">{report.questions.map((question, index) => <li key={index} className="rounded-xl border border-slate-200 p-4">
        <p dir={direction(say(question.question))} className="text-sm font-medium leading-6 text-slate-900">{say(question.question)}</p>
        <p dir="ltr" className="mt-2 break-all text-start font-mono text-[11px] text-slate-600">{question.files.join(" · ")}</p>
      </li>)}</ol>
    </section>}
  </div>;
}
