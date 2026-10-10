import Link from "next/link";
import { ANALYSIS_ENGINE_VERSION } from "@/features/repository-analysis/version";
import { measurementIsStale, summarizeTrust, TRUST_MEASUREMENTS } from "@/features/trust/measurements";
import { CHECK_LABEL } from "@/features/trust/wording";
import { getI18n } from "@/i18n/server";
import { formatDateForLocale } from "@/i18n/translations";
import { FILE_LIMITS } from "@/services/github";

export const dynamic = "force-dynamic";

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
      <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-brand-700">{eyebrow}</p>
      <h2 id={id} className="mt-2 text-xl font-semibold tracking-[-.025em] text-slate-950">{title}</h2>
      {children}
    </section>
  );
}

/**
 * The public trust sheet: the rules the product follows, what was measured
 * about them and what was not. Open to anyone, including candidates, with no
 * account. Every figure comes from the recorded measurement; none is typed in.
 */
export default async function TrustPage() {
  const { locale, t } = await getI18n();
  const measurements = TRUST_MEASUREMENTS;
  const summary = summarizeTrust(measurements);
  const hasMeasurement = measurements.repositories.length > 0 && Boolean(measurements.measuredAt);
  const stale = hasMeasurement && measurementIsStale(measurements, ANALYSIS_ENGINE_VERSION);
  const aiOn = Boolean(process.env.OPENAI_API_KEY?.trim());

  const rules = [
    [t("Evidence comes only from code."), t("A CV adds claims to check. It adds no evidence, and it never changes the order of the review queue.")],
    [t("Every skill names its files."), t("A recruiter or an engineer can open each file that a skill, a question or a matched requirement points to.")],
    [t("Unknown is not negative."), t("Code that could not be read, a link that cannot be opened and a candidate who shared nothing are shown as unknown. They are not treated as a weak result.")],
    [t("No number for a person."), t("Screens show how many skills the analysed code supports at each level. There is no score, percentage or grade for a candidate.")],
    [t("A person decides."), t("The review queue is a draft. CodeProof never sends a test, changes a stage or rejects anyone, and the recruiter records that they checked the evidence.")],
  ];

  const notMeasured = [
    t("Whether engineers agree with the evidence levels. Two engineers have not yet rated the same repositories without seeing our result."),
    t("Results with AI switched on. An AI model can answer differently on two runs, so those results need their own measurement."),
    t("Whether the drafted questions fit every file. They come from templates and can misread what a file is for."),
    t("How many applicants in your market link to code. The CV coverage check counts that on your own applicants."),
  ];

  const handling = [
    t("Only public GitHub repositories that a CV, a portfolio page or the candidate names. The latest files are read as text, up to {count} files per repository. Code is never run.", { count: FILE_LIMITS.maxSelectedFiles }),
    t("A candidate can be asked for their own evidence through a private link. The page tells them what is read and asks for their agreement."),
    aiOn
      ? t("AI is switched on for this site. Repository files and CV text are sent to the AI provider to draft the analysis, and the rules above limit what it may claim.")
      : t("AI is switched off on this site. Nothing is sent to an AI provider: the analysis runs on fixed rules."),
    t("Each account sees only its own candidates. A candidate's record, and everything they sent, is removed when the recruiter deletes it."),
  ];

  const limits = [
    t("It reads public GitHub code only. Private work, other hosts and scanned CVs appear as unknown."),
    t("It reads the latest files, not their history, so it cannot tell who wrote a file. A candidate can prove that a GitHub account is theirs, which is not the same as proving who wrote each change."),
    t("It recognises a fixed list of languages and tools. A technology outside the list appears only as its language."),
    t("An evidence level describes the code that was read. It is not a judgment of the person."),
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-8 sm:py-10">
      <header className="hero-grid overflow-hidden rounded-3xl bg-slate-950 p-6 text-white sm:p-10">
        <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-lime-300">{t("Trust sheet")}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-.045em] sm:text-5xl">{t("What you can rely on")}</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">{t("CodeProof shows what a candidate's own code supports, what is still unknown and what to ask. It does not rate people and it does not reject anyone. This page states the rules the product follows, what we measured about them and what we have not measured.")}</p>
      </header>

      <Section id="rules-heading" eyebrow={t("How the product behaves")} title={t("Five rules")}>
        <ol className="mt-5 grid gap-3 md:grid-cols-2">
          {rules.map(([title, body], index) => (
            <li key={title} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <span aria-hidden="true" className="font-mono text-[10px] font-semibold text-brand-700">0{index + 1}</span>
              <h3 className="mt-2 text-sm font-semibold text-slate-950">{title}</h3>
              <p className="mt-1.5 text-xs leading-5 text-slate-600">{body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="measured-heading" eyebrow={t("Recorded, not claimed")} title={t("What we measured")}>
        {hasMeasurement ? (
          <>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {t("Measured on {date} with engine {version} and AI off, on {count} public repositories read {runs} times each.", {
                date: formatDateForLocale(locale, measurements.measuredAt),
                version: measurements.engineVersion,
                count: measurements.repositories.length,
                runs: measurements.runsPerRepository,
              })}
            </p>
            {stale && (
              <p role="note" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
                {t("This site now runs engine {version}. The figures below were measured on an earlier engine and are being repeated.", { version: ANALYSIS_ENGINE_VERSION })}
              </p>
            )}
            <dl className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                <dt className="text-xs font-semibold text-slate-900">{t("Same input, same result")}</dt>
                <dd className="mt-2">
                  <span className="tnum block text-2xl font-semibold tracking-[-.035em] text-slate-950">{t("{count} of {total}", { count: summary.identicalRepositories, total: summary.measuredRepositories })}</span>
                  <span className="mt-1 block text-[11px] leading-5 text-slate-600">{t("repositories gave identical evidence on every run")}</span>
                </dd>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                <dt className="text-xs font-semibold text-slate-900">{t("Cited files that exist")}</dt>
                <dd className="mt-2">
                  <span className="tnum block text-2xl font-semibold tracking-[-.035em] text-slate-950">{t("{count} of {total}", { count: summary.citedFiles - summary.missingFiles, total: summary.citedFiles })}</span>
                  <span className="mt-1 block text-[11px] leading-5 text-slate-600">{t("file paths cited by the analysis are in the repository")}</span>
                </dd>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                <dt className="text-xs font-semibold text-slate-900">{t("Attempts to move a result")}</dt>
                <dd className="mt-2">
                  <span className="tnum block text-2xl font-semibold tracking-[-.035em] text-slate-950">{t("{count} of {total}", { count: summary.checksPassed, total: summary.checksTotal })}</span>
                  <span className="mt-1 block text-[11px] leading-5 text-slate-600">{t("attempts changed nothing")}</span>
                </dd>
              </div>
            </dl>
            {summary.excludedRepositories > 0 && (
              <p className="mt-3 text-xs leading-5 text-slate-500">{t("{count} repositories are left out of these figures because they changed during the measurement or could not be read. They are listed below.", { count: summary.excludedRepositories })}</p>
            )}

            <h3 className="mt-6 text-sm font-semibold text-slate-950">{t("What each attempt tried")}</h3>
            <ul className="mt-3 space-y-2">
              {measurements.checks.map((check) => (
                <li key={check.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5 text-xs leading-5 text-slate-700">
                  <span className="min-w-0 flex-1">{t(CHECK_LABEL[check.id])}</span>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${check.passed ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{t(check.passed ? "Held" : "Did not hold")}</span>
                </li>
              ))}
            </ul>

            <details className="mt-6 rounded-xl border border-slate-200 bg-slate-50">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 p-4 text-sm font-semibold text-slate-800">
                {t("The repositories that were read")} <span className="font-mono text-[10px] font-normal text-slate-400">{measurements.repositories.length} +</span>
              </summary>
              <div className="overflow-x-auto border-t border-slate-200 bg-white" tabIndex={0} role="region" aria-label={t("The repositories that were read")}>
                <table className="w-full min-w-[520px] text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-start text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      <th className="px-4 py-2.5">{t("Repository")}</th>
                      <th className="px-4 py-2.5 text-end">{t("Runs")}</th>
                      <th className="px-4 py-2.5 text-end">{t("Identical")}</th>
                      <th className="px-4 py-2.5 text-end">{t("Cited files")}</th>
                      <th className="px-4 py-2.5 text-end">{t("Not found")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {measurements.repositories.map((item) => (
                      <tr key={item.repository} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-2.5"><bdi dir="ltr" className="font-mono text-slate-800">{item.repository}</bdi></td>
                        <td className="tnum px-4 py-2.5 text-end text-slate-600">{item.runs}</td>
                        <td className="px-4 py-2.5 text-end text-slate-600">{item.identical === null ? t("Not compared") : t(item.identical ? "Yes" : "No")}</td>
                        <td className="tnum px-4 py-2.5 text-end text-slate-600">{item.citedFiles}</td>
                        <td className="tnum px-4 py-2.5 text-end text-slate-600">{item.missingFiles}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <p className="mt-4 text-xs leading-5 text-slate-500">
              {t("These are public projects in the languages the engine reads. They stand in for candidates' repositories; nobody was assessed. Anyone with the code can repeat the measurement:")}{" "}
              <code dir="ltr" className="tech-ltr rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-800">npm run trust:measure</code>
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm leading-6 text-slate-600">{t("No measurement has been recorded yet. Nothing is claimed here until one has been run.")}</p>
        )}
      </Section>

      <Section id="not-measured-heading" eyebrow={t("Open questions")} title={t("What we have not measured")}>
        <ul className="mt-4 space-y-2">
          {notMeasured.map((item) => <li key={item} className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3.5 py-2.5 text-xs leading-5 text-slate-600">{item}</li>)}
        </ul>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section id="handling-heading" eyebrow={t("Data")} title={t("What is read, and where it goes")}>
          <ul className="mt-4 space-y-3">
            {handling.map((item) => <li key={item} className="flex gap-2 text-xs leading-5 text-slate-600"><span aria-hidden="true" className="text-brand-700">✓</span><span>{item}</span></li>)}
          </ul>
        </Section>
        <Section id="limits-heading" eyebrow={t("Be clear about this")} title={t("Limits you should know")}>
          <ul className="mt-4 space-y-3">
            {limits.map((item) => <li key={item} className="flex gap-2 text-xs leading-5 text-slate-600"><span aria-hidden="true" className="text-slate-400">•</span><span>{item}</span></li>)}
          </ul>
        </Section>
      </div>

      <p className="text-center text-xs text-slate-500">
        <Link href="/" className="inline-flex min-h-11 items-center font-semibold text-brand-700 hover:text-brand-500">{t("Open CodeProof")} <span className="directional-icon ms-1">→</span></Link>
      </p>
    </div>
  );
}
