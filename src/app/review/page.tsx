import Link from "next/link";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import { SearchCodeIcon } from "@/components/ui/icons";
import ReviewQueueList from "@/components/review/ReviewQueueList";
import { requirePageUser } from "@/features/auth/page-guard";
import { getCandidateStore } from "@/features/candidates/store";
import type { CandidateDetail } from "@/features/candidates/types";
import { getRequirementsStore, toExtractedRequirements } from "@/features/requirements/store";
import { buildReviewQueue } from "@/features/review-queue/queue";
import { getI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function ReviewQueuePage() {
  const [{ locale, t }, user] = await Promise.all([getI18n(), requirePageUser("/review")]);
  const store = getCandidateStore();
  const [records, requirements] = await Promise.all([store.listCandidates(user.id), getRequirementsStore().list(user.id)]);
  const details = (await Promise.all(records.map((record) => store.getCandidate(user.id, record.id))))
    .filter((detail): detail is CandidateDetail => detail !== null);
  const queue = buildReviewQueue(details, toExtractedRequirements(requirements));

  const rules = [
    t("Candidates with at least one analyzed repository come first. The rest are listed as evidence incomplete."),
    t("Among them: strong evidence for required company requirements, then partial evidence, then strong or good skill evidence, then grounded CV claims."),
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
        actions={<Link href="/requirements" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50">{t(queue.requirementsSaved ? "Edit company requirements" : "Define company requirements")}</Link>}
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
              {t("No company requirements are saved, so the order below only reflects implementation depth and grounded CV claims.")}{" "}
              <Link href="/requirements" className="font-semibold underline decoration-amber-400 underline-offset-2 hover:text-amber-700">{t("Define company requirements")}</Link>
            </div>
          )}

          <div className="grid gap-5 xl:grid-cols-[.34fr_.66fr] xl:items-start">
            <Card title={t("How this order is drafted")} subtitle={t("Transparent rules, no hidden score")} className="xl:sticky xl:top-24">
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
