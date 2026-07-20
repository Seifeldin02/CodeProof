import type { InterviewQuestion } from "@/types/analysis";
import { localizeAnalysisText, translate, type Locale } from "@/i18n/translations";

export default function InterviewQuestionCard({ question, index, locale }: { question: InterviewQuestion; index: number; locale: Locale }) {
  const t = (key: string, values: Record<string, string | number> = {}) => translate(locale, key, values);
  const l = (text: string) => localizeAnalysisText(locale, text);
  return <li className="interview-card group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_28px_rgba(15,23,42,.045)] transition hover:border-brand-200 hover:shadow-[0_18px_42px_rgba(15,23,42,.08)]">
    <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-2 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-950 font-mono text-white">{String(index + 1).padStart(2, "0")}</span>
        <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200">{t(question.difficulty)}</span>
        <span dir="ltr" className="tech-ltr rounded-full bg-brand-50 px-2.5 py-1 text-brand-700">{question.relatedSkill}</span>
      </div>
    </div>
    <div className="p-4 sm:p-5">
      <strong className="block text-sm leading-6 text-slate-950 sm:text-[15px]">{l(question.question)}</strong>
      <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/60 p-3.5">
        <p className="text-[9px] font-semibold uppercase tracking-[.14em] text-brand-700">{t("Why ask this?")}</p>
        <p className="mt-1.5 text-xs leading-5 text-slate-600">{l(question.relevance)}</p>
      </div>
      <details className="group mt-3 rounded-xl border border-slate-200 bg-white open:border-brand-200">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2.5 text-[11px] font-semibold text-slate-600 hover:text-brand-700"><span>{t("View exact source evidence")}</span><span className="text-slate-400 transition group-open:rotate-45">+</span></summary>
        <div dir="ltr" className="border-t border-slate-100 px-3.5 py-3 text-start">{question.files.map((file) => <code key={file} className="block break-all py-1 text-[10px] text-brand-700">{file}</code>)}</div>
      </details>
    </div>
  </li>;
}
