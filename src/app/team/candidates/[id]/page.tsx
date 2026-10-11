import Link from "next/link";
import { notFound } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import { getAccountsDatabase } from "@/features/accounts/database";
import { requirePageUser } from "@/features/auth/page-guard";
import { getAuthStore } from "@/features/auth/store";
import { getCandidateStore } from "@/features/candidates/store";
import { STAGE_LABELS } from "@/features/hiring-analytics/types";
import { organizationAdminScope } from "@/features/organizations/service";
import { findTeamCandidate } from "@/features/organizations/team-candidates";
import { getI18n } from "@/i18n/server";
import { formatDateForLocale, localizeAnalysisText } from "@/i18n/translations";

export const dynamic = "force-dynamic";

const OUTCOME_LABEL: Record<string, string> = { in_progress: "In progress", hired: "Hired", rejected: "Rejected", withdrawn: "Withdrawn" };

/**
 * One member's candidate, as the organisation's admin sees it: what was read
 * and what the code supports. It is a reading view with no controls, because
 * the candidate belongs to the recruiter who added them.
 */
export default async function TeamCandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ t, locale }, { id }] = await Promise.all([getI18n(), params]);
  const user = await requirePageUser(`/team/candidates/${id}`);
  const database = await getAccountsDatabase();
  const scope = await organizationAdminScope(database.runner, user.id);
  if (!scope.ok) notFound();
  const found = await findTeamCandidate({ database, auth: getAuthStore() }, getCandidateStore(), scope.organization.id, id);
  if (!found) notFound();
  const { candidate, recruiter } = found;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("Read-only view")}
        title={candidate.name}
        description={t("This candidate belongs to the recruiter named below. You can read the record; only they can change it.")}
        badge={candidate.isDemo ? <Badge tone="warning">{t("Demo")}</Badge> : undefined}
        actions={<Link href="/team/candidates" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-brand-300 hover:bg-brand-50"><span className="directional-icon me-1.5">←</span> {t("Everyone's candidates")}</Link>}
      />

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          [t("Recruiter"), <bdi key="recruiter">{recruiter.displayName ?? recruiter.email}</bdi>],
          [t("Role"), t(candidate.role)],
          [t("Pipeline stage"), t(STAGE_LABELS[candidate.furthestStage])],
          [t("Outcome"), t(OUTCOME_LABEL[candidate.outcome] ?? candidate.outcome)],
        ] as const).map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-card">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
            <dd className="mt-2 break-words text-base font-semibold text-slate-950">{value}</dd>
          </div>
        ))}
      </dl>

      <Card title={t("Repositories read")} subtitle={t("Added {date}", { date: formatDateForLocale(locale, candidate.appliedAt) })}>
        {candidate.repositoryOutcomes.length === 0 ? (
          <p className="text-sm text-slate-600">{t("No repository has been read for this candidate.")}</p>
        ) : (
          <ul className="space-y-2">
            {candidate.repositoryOutcomes.map((outcome) => (
              <li key={outcome.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-4 py-3">
                <a href={outcome.repositoryUrl} target="_blank" rel="noreferrer" dir="ltr" className="inline-flex min-h-11 items-center break-all text-start font-mono text-xs font-semibold text-brand-700 hover:text-brand-500">{outcome.repositoryName}</a>
                <Badge tone={outcome.status === "analyzed" ? "positive" : "warning"}>{outcome.status === "analyzed" ? t("Read") : t("Could not be read")}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {candidate.analyses.map((analysis) => (
        <Card key={analysis.id} title={analysis.repositoryName} subtitle={localizeAnalysisText(locale, analysis.projectType)}>
          {analysis.result.skills.length === 0 ? (
            <p className="text-sm text-slate-600">{t("No skill evidence was found in this repository.")}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {analysis.result.skills.map((skill) => (
                <li key={skill.skill} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong dir="ltr" className="text-start text-sm text-slate-900">{skill.skill}</strong>
                    <Badge tone={skill.level === "Strong Evidence" || skill.level === "Good Evidence" ? "positive" : "neutral"}>{t(skill.level)}</Badge>
                  </div>
                  {skill.evidence.length > 0 && (
                    <code dir="ltr" className="mt-2 block break-all text-start text-[11px] text-slate-600">{[...new Set(skill.evidence.map((item) => item.file))].slice(0, 4).join(" · ")}</code>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}
