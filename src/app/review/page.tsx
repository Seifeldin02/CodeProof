import Link from "next/link";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import { SearchCodeIcon } from "@/components/ui/icons";
import ExportQueueButton from "@/components/review/ExportQueueButton";
import ReviewQueueList from "@/components/review/ReviewQueueList";
import { requirePageUser } from "@/features/auth/page-guard";
import { getCandidateStore } from "@/features/candidates/store";
import type { CandidateDetail } from "@/features/candidates/types";
import { getRequirementsStore, toExtractedRequirements } from "@/features/requirements/store";
import { buildReviewQueue } from "@/features/review-queue/queue";
import { NEXT_STEP_LABEL, NEXT_STEP_MEANING, NEXT_STEP_ORDER } from "@/features/review-queue/wording";
import { getI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function ReviewQueuePage() {
  const [{ locale, t }, user] = await Promise.all([getI18n(), requirePageUser("/review")]);
  const store = getCandidateStore();
  const [records, requirements] = await Promise.all([store.listCandidates(user.id), getRequirementsStore().list(user.id)]);
  const details = (await Promise.all(records.map((record) => store.getCandidate(user.id, record.id))))
    .filter((detail): detail is CandidateDetail => detail !== null);
  const queue = buildReviewQueue(details, toExtractedRequirements(requirements));

  const undersold = queue.entries.filter((entry) => entry.undersold.length > 0);

  const rules = [
    t("Candidates with at least one analyzed repository come first. The rest are listed as evidence incomplete."),
    t("Among them: strong evidence for required company requirements, then partial evidence, then strong or good skill evidence."),
    t("What a CV says is checked and shown, but it never changes the order. Listing more technologies moves nobody up, and names are not used. Equal evidence is settled by who was added first."),
    t("A missing input is reported as unknown. It never lowers a candidate; it only means the evidence cannot raise them yet."),
    t("The order is a draft. Open each dossier and check the cited files before moving anyone to interview. You remain the decision-maker."),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("Decision workspace")}
        title={t("Review queue")}
        description={t("Who to open first, drafted from file-backed evidence against your saved company requirements. Every recommendation names its sources and says what is still unknown.")}
        badge={queue.summary.demo > 0 ? <Badge tone={queue.summary.demo === queue.entries.length ? "warning" : "neutral"}>{queue.summary.demo} {t("Demo")}</Badge> : undefined}
        actions={<>{queue.entries.length > 0 && <ExportQueueButton entries={queue.entries} />}<Link href="/requirements" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50">{t(queue.requirementsSaved ? "Edit company requirements" : "Define company requirements")}</Link></>}
      />

      {queue.entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/75">
          <EmptyState icon={SearchCodeIcon} title={t("Nothing to review yet")} description={t("Complete at least one repository analysis and the drafted order appears here.")} actionLabel={t("Analyze a candidate")} actionHref="/analyze" />
        </div>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-3">
            {([["Ready to review", queue.summary.ready], ["Evidence incomplete", queue.summary.incomplete], ["Evidence checked by you", queue.summary.reviewed]] as const).map(([label, value]) => (
              <div key={label} className="metric-card rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-card">
                <dt className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{t(label)}</dt>
                <dd className="tnum mt-2 text-2xl font-semibold tracking-[-.035em] text-slate-950">{value}</dd>
              </div>
            ))}
          </dl>

          {!queue.requirementsSaved && (
            <div role="note" className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm leading-6 text-amber-900">
              <strong className="font-semibold">{t("Role fit is unknown for every candidate.")}</strong>{" "}
              {t("No company requirements are saved, so the order below only reflects implementation depth.")}{" "}
              <Link href="/requirements" className="font-semibold underline decoration-amber-400 underline-offset-2 hover:text-amber-700">{t("Define company requirements")}</Link>
            </div>
          )}

          <Card title={t("Who needs what next")} subtitle={t("Code evidence decides where a test or an engineer's hour is best spent. It never decides the outcome.")}>
            <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {NEXT_STEP_ORDER.map((step) => (
                <div key={step} className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                  <dt className="text-xs font-semibold text-slate-900">{t(NEXT_STEP_LABEL[step])}</dt>
                  <dd className="mt-1">
                    <span className="tnum block text-2xl font-semibold tracking-[-.035em] text-slate-950">{queue.summary.nextSteps[step]}</span>
                    <span className="mt-1 block text-[11px] leading-5 text-slate-500">{t(NEXT_STEP_MEANING[step])}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[11px] leading-5 text-slate-400">{t("This is a draft for you to act on. CodeProof never sends a test, changes a stage or rejects anyone.")}</p>
          </Card>

          {undersold.length > 0 && (
            <section aria-labelledby="undersold-heading" className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-emerald-700">{t("People a CV screen could miss")}</p>
              <h2 id="undersold-heading" className="mt-2 text-lg font-semibold tracking-[-.02em] text-emerald-950">
                {undersold.length === 1 ? t("1 candidate's code shows skills the CV never mentions") : t("{count} candidates' code shows skills the CV never mentions", { count: undersold.length })}
              </h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {undersold.map((entry) => (
                  <li key={entry.id} className="rounded-xl border border-emerald-200 bg-white px-3.5 py-2.5 text-sm">
                    <Link href={`/candidates/${entry.id}`} className="font-semibold text-slate-900 hover:text-brand-700">{entry.name}</Link>
                    <span dir="ltr" className="tech-ltr mt-1 block text-start text-xs font-medium text-emerald-800">{entry.undersold.join(", ")}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs leading-5 text-emerald-900">{t("Each of these skills has strong or good evidence in the candidate's code, with the files cited in the dossier. A keyword match on the CV would not find them.")}</p>
            </section>
          )}

          <div className="grid gap-5 xl:grid-cols-[.34fr_.66fr] xl:items-start">
            <Card title={t("How this order is drafted")} subtitle={t("Transparent rules, no score")} className="xl:sticky xl:top-24">
              <ol className="space-y-3 text-xs leading-5 text-slate-600">
                {rules.map((rule, index) => (
                  <li key={rule} className="flex gap-3">
                    <span aria-hidden="true" className="font-mono text-[10px] font-semibold text-brand-700">0{index + 1}</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ol>
            </Card>
            <ReviewQueueList entries={queue.entries} locale={locale} />
          </div>
        </>
      )}
    </div>
  );
}
