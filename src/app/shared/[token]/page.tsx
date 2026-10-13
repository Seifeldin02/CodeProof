import { createHash } from "node:crypto";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getShareStore } from "@/features/sharing/store";
import { getI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? requestHeaders.get("x-real-ip")?.trim() ?? "unknown";
  const report = await getShareStore().resolve(token, createHash("sha256").update(ip).digest("hex"),
    requestHeaders.get("user-agent")?.split(/[\s/]/u)[0]?.slice(0, 200) || null);
  if (!report) notFound();
  const { locale } = await getI18n();
  const ar = locale === "ar";
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
  return <main className="mx-auto min-h-screen max-w-5xl space-y-6 px-4 py-8 sm:px-8">
    <header className="rounded-3xl bg-slate-950 p-6 text-white sm:p-9">
      <p className="text-xs font-semibold uppercase tracking-[.16em] text-lime-300">{copy.eyebrow}</p>
      <h1 className="mt-3 break-words text-3xl font-semibold sm:text-4xl">{report.candidateName}</h1>
      <p className="mt-2 text-sm text-slate-300">{report.role}{report.isDemo ? ` · ${copy.demo}` : ""}</p>
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
      <p className="mt-4 text-sm leading-6 text-slate-700">{report.summary}</p>
    </section>
    {report.skills.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
      <h2 className="text-lg font-semibold text-slate-950">{copy.skills}</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">{report.skills.map((skill) => <li key={skill.skill} className="min-w-0 rounded-xl border border-slate-200 p-4">
        <h3 dir="ltr" className="break-words text-start text-sm font-semibold text-slate-900">{skill.skill}</h3>
        <p className="mt-1 text-xs font-medium text-emerald-800">{skill.level}</p>
        <p className="mt-2 text-xs leading-5 text-slate-700">{skill.explanation}</p>
        <p dir="ltr" className="mt-2 break-all text-start font-mono text-[11px] text-slate-600">{skill.files.join(" · ")}</p>
      </li>)}</ul>
    </section>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
      <h2 className="text-lg font-semibold text-slate-950">{report.citationStatus === "grounded_findings" ? copy.citations : copy.files}</h2>
      {report.citationStatus === "inspected_files_only" && <p className="mt-2 text-sm leading-6 text-amber-800">{copy.filesOnly}</p>}
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">{report.citations.map((citation, index) => <li key={`${citation.filePath}-${index}`} className="min-w-0 rounded-xl bg-slate-50 p-4">
        <code dir="ltr" className="block break-all text-start text-xs text-slate-900">{citation.filePath}</code>
        <p className="mt-2 text-xs text-slate-600">{citation.evidenceLevel !== "inspected_file_only" ? citation.evidenceLevel : ""}{citation.startLine ? ` · ${copy.lines} ${citation.startLine}${citation.endLine && citation.endLine !== citation.startLine ? `–${citation.endLine}` : ""}` : ""}</p>
        {citation.sourceLink.startsWith("https://") && <a href={citation.sourceLink} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-emerald-800 underline underline-offset-2">{copy.source}</a>}
      </li>)}</ul>
    </section>
    {report.questions.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
      <h2 className="text-lg font-semibold text-slate-950">{copy.questions}</h2>
      <ol className="mt-4 space-y-3">{report.questions.map((question, index) => <li key={index} className="rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-medium leading-6 text-slate-900">{question.question}</p>
        <p dir="ltr" className="mt-2 break-all text-start font-mono text-[11px] text-slate-600">{question.files.join(" · ")}</p>
      </li>)}</ol>
    </section>}
  </main>;
}
