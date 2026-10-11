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
import { listTeamCandidates } from "@/features/organizations/team-candidates";
import { getI18n } from "@/i18n/server";
import { formatDateForLocale } from "@/i18n/translations";

export const dynamic = "force-dynamic";

const FILTER = "inline-flex min-h-11 items-center rounded-full border px-4 text-xs font-semibold transition";

/** Every member's candidates, for the organisation's admin, to read. */
export default async function TeamCandidatesPage({ searchParams }: { searchParams: Promise<{ recruiter?: string }> }) {
  const [{ t, locale }, user, query] = await Promise.all([getI18n(), requirePageUser("/team/candidates"), searchParams]);
  const database = await getAccountsDatabase();
  const scope = await organizationAdminScope(database.runner, user.id);
  if (!scope.ok) notFound();

  const { members, candidates } = await listTeamCandidates({ database, auth: getAuthStore() }, getCandidateStore(), scope.organization.id);
  const selected = members.find((member) => member.userId === query.recruiter) ?? null;
  const shown = selected ? candidates.filter((item) => item.recruiter.userId === selected.userId) : candidates;
  const nameOf = (member: { displayName: string | null; email: string }) => member.displayName ?? member.email;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={scope.organization.name}
        title={t("Everyone's candidates")}
        description={t("Each candidate belongs to the recruiter who added them. You can read them here; only that recruiter can change them.")}
        actions={<Link href="/team" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-brand-300 hover:bg-brand-50"><span className="directional-icon me-1.5">←</span> {t("Back to team")}</Link>}
      />

      <nav aria-label={t("Filter by recruiter")} className="flex flex-wrap gap-2">
        <Link href="/team/candidates" aria-current={selected ? undefined : "page"} className={`${FILTER} ${selected ? "border-slate-300 bg-white text-slate-700 hover:border-brand-300" : "border-slate-900 bg-slate-900 text-white"}`}>
          {t("Everyone")} · {candidates.length}
        </Link>
        {members.map((member) => {
          const active = selected?.userId === member.userId;
          const count = candidates.filter((item) => item.recruiter.userId === member.userId).length;
          return (
            <Link key={member.userId} href={`/team/candidates?recruiter=${member.userId}`} aria-current={active ? "page" : undefined} className={`${FILTER} ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-brand-300"}`}>
              <bdi>{nameOf(member)}</bdi> · {count}
            </Link>
          );
        })}
      </nav>

      <Card bodyClassName="!p-0">
        {shown.length === 0 ? (
          <p className="p-6 text-sm text-slate-600">{t("No candidates here yet.")}</p>
        ) : (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("Everyone's candidates")}>
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-start text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-4 py-3 text-start">{t("Candidate")}</th>
                  <th scope="col" className="px-4 py-3 text-start">{t("Role")}</th>
                  <th scope="col" className="px-4 py-3 text-start">{t("Recruiter")}</th>
                  <th scope="col" className="px-4 py-3 text-start">{t("Pipeline stage")}</th>
                  <th scope="col" className="px-4 py-3 text-end">{t("Repositories")}</th>
                  <th scope="col" className="px-4 py-3 text-end">{t("Added")}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ candidate, recruiter }) => (
                  <tr key={candidate.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/team/candidates/${candidate.id}`} className="inline-flex min-h-11 items-center font-semibold text-slate-900 hover:text-brand-700"><bdi>{candidate.name}</bdi></Link>
                      {candidate.isDemo && <Badge tone="warning" className="ms-2">{t("Demo")}</Badge>}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{t(candidate.role)}</td>
                    <td className="px-4 py-3 text-slate-700"><bdi>{nameOf(recruiter)}</bdi></td>
                    <td className="px-4 py-3 text-slate-700">{t(STAGE_LABELS[candidate.furthestStage])}</td>
                    <td className="tnum px-4 py-3 text-end text-slate-700">{candidate.repositoryCount ?? 0}</td>
                    <td className="px-4 py-3 text-end text-slate-700">{formatDateForLocale(locale, candidate.appliedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
