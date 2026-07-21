import Link from "next/link";
import { getI18n } from "@/i18n/server";
import { requirePageUser } from "@/features/auth/page-guard";

const steps = [
  ["01", "Start with the candidate", "Upload a PDF or paste CV text. CodeProof extracts public GitHub links and asks the recruiter to confirm scope."],
  ["02", "Inspect without executing", "Public archives are downloaded within strict limits. Source is treated as untrusted text and is never run."],
  ["03", "Connect every claim", "Languages, architecture, tests, APIs, auth, state, errors, and skills are linked to exact files."],
  ["04", "Make a clearer decision", "Recruiters compare evidence, target interviews, and inspect transparent hiring metrics without a black-box score."],
] as const;

export default async function AboutPage() {
  const [{ t }] = await Promise.all([getI18n(), requirePageUser("/about")]);
  return <div className="space-y-6"><section className="hero-grid overflow-hidden rounded-[28px] bg-slate-950 px-5 py-10 text-white sm:px-8 sm:py-14 lg:px-12"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-lime-300">{t("Employer-ready evidence, not résumé guesswork.")}</p><h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-[-.05em] sm:text-5xl">{t("How CodeProof works")}</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">{t("A recruiter-friendly explanation of the evidence journey.")}</p><Link href="/analyze" className="mt-7 inline-flex min-h-11 items-center rounded-xl bg-lime-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-lime-200">{t("Analyze a candidate")} <span className="directional-icon ms-2">→</span></Link></section><section className="grid gap-4 md:grid-cols-2">{steps.map(([number, title, body]) => <article key={number} className="interactive-card rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6"><span className="font-mono text-xs font-semibold text-brand-700">{number}</span><h2 className="mt-8 text-xl font-semibold tracking-[-.025em] text-slate-950">{t(title)}</h2><p className="mt-3 text-sm leading-7 text-slate-500">{t(body)}</p></article>)}</section><section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:p-7"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-emerald-700">{t("Built for trust")}</p><ul className="mt-4 grid gap-3 text-sm text-emerald-950 sm:grid-cols-2">{["Zero paid APIs for the core demo", "Repository code is never executed", "Every engineering claim cites source", "Synthetic data is always labeled"].map((item) => <li key={item} className="flex gap-2"><span aria-hidden="true">✓</span><span>{t(item)}</span></li>)}</ul></section></div>;
}
