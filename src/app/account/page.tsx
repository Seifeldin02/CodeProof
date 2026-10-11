import Link from "next/link";
import { DisplayNameForm, PhoneForm, SignOutButton } from "@/components/accounts/AccountControls";
import { InvitationAnswer } from "@/components/accounts/TeamControls";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import { MEMBER_ROLE_LABEL, ORGANIZATION_KIND_LABEL, SIGN_IN_METHOD_LABEL } from "@/features/accounts/copy";
import { getAccountsDatabase } from "@/features/accounts/database";
import { listIdentities } from "@/features/accounts/identities";
import { getProfile } from "@/features/accounts/profiles";
import { signInOptions } from "@/features/auth/options";
import { requirePageUser } from "@/features/auth/page-guard";
import { getAuthStore } from "@/features/auth/store";
import { getWorkspace, openInvitationsFor } from "@/features/organizations/service";
import { planById } from "@/features/plans/catalog";
import { getI18n } from "@/i18n/server";
import { formatDateForLocale } from "@/i18n/translations";

export const dynamic = "force-dynamic";

const ROW = "flex flex-wrap items-baseline justify-between gap-2 py-3 first:pt-0 last:pb-0";

/** A person's own account: their name, how they sign in, and their organisation. */
export default async function AccountPage() {
  const [{ t, locale }, user] = await Promise.all([getI18n(), requirePageUser("/account")]);
  const database = await getAccountsDatabase();
  const [profile, identities, workspace, invitations] = await Promise.all([
    getProfile(database.runner, user.id),
    listIdentities(database.runner, user.id),
    getWorkspace(database.runner, user.id),
    openInvitationsFor({ database, auth: getAuthStore() }, user.email),
  ]);
  const options = signInOptions();
  const google = identities.find((identity) => identity.provider === "google");
  const date = (value: string | null) => (value ? formatDateForLocale(locale, value) : t("Never"));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("Your account")}
        title={profile.displayName ?? t("Account")}
        description={t("Your name, how you sign in, and the organisation you belong to.")}
        badge={user.role === "ADMIN" ? <Badge tone="brand">{t("CodeProof owner")}</Badge> : undefined}
        actions={<SignOutButton />}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={t("Profile")} subtitle={t("Shown to your organisation's admin")}>
          <DisplayNameForm initialName={profile.displayName ?? ""} />
          <dl className="mt-5 divide-y divide-slate-100 border-t border-slate-100 pt-2 text-sm">
            <div className={ROW}>
              <dt className="text-slate-600">{t("Email")}</dt>
              <dd className="flex flex-wrap items-center gap-2">
                <bdi dir="ltr" className="break-all font-semibold text-slate-900">{user.email}</bdi>
                {profile.emailVerifiedAt ? <Badge tone="positive">{t("Confirmed")}</Badge> : <Badge tone="warning">{t("Not confirmed yet")}</Badge>}
              </dd>
            </div>
            <div className={ROW}>
              <dt className="text-slate-600">{t("Last signed in")}</dt>
              <dd className="font-semibold text-slate-900">
                {date(profile.lastSignInAt)}{profile.lastSignInMethod && <span className="font-normal text-slate-600"> · {t(SIGN_IN_METHOD_LABEL[profile.lastSignInMethod])}</span>}
              </dd>
            </div>
            <div className={ROW}>
              <dt className="text-slate-600">{t("Plan")}</dt>
              <dd className="font-semibold text-slate-900">{t(planById(workspace ? workspace.organization.planTierId : user.planTierId).name)}</dd>
            </div>
          </dl>
        </Card>

        <Card title={t("Signing in")} subtitle={t("No password is needed")}>
          <ul className="divide-y divide-slate-100 text-sm">
            <li className={ROW}>
              <span className="text-slate-800">{t("A code by email")}</span>
              <Badge tone={options.emailCode ? "positive" : "neutral"}>{options.emailCode ? t("On") : t("Not set up on this site")}</Badge>
            </li>
            <li className={ROW}>
              <span className="text-slate-800">Google</span>
              {google
                ? <span className="flex flex-wrap items-center gap-2"><bdi dir="ltr" className="break-all text-slate-600">{google.email}</bdi><Badge tone="positive">{t("Linked")}</Badge></span>
                : <Badge>{options.google ? t("Links the first time you use it") : t("Not set up on this site")}</Badge>}
            </li>
            <li className={ROW}>
              <span className="text-slate-800">{t("A code by text message")}</span>
              <Badge tone={options.sms && profile.phone ? "positive" : "neutral"}>{!options.sms ? t("Not set up on this site") : profile.phone ? t("On") : t("Add a number below")}</Badge>
            </li>
          </ul>
          {options.sms && <div className="mt-5 border-t border-slate-100 pt-5"><PhoneForm phone={profile.phone} /></div>}
          {options.password && <p className="mt-4 text-xs leading-5 text-slate-600">{t("This site cannot send codes yet, so it signs you in with your email address and password.")}</p>}
        </Card>
      </div>

      <Card title={t("Organisation")} subtitle={workspace ? t("The company or agency you belong to") : t("You work on your own")}>
        {workspace ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-base font-semibold text-slate-900"><bdi>{workspace.organization.name}</bdi></p>
              <p className="mt-1 text-sm text-slate-600">{t(ORGANIZATION_KIND_LABEL[workspace.organization.kind])} · {t("Your role: {role}", { role: t(MEMBER_ROLE_LABEL[workspace.membership.role]) })}</p>
            </div>
            <Link href="/team" className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-brand-300 hover:bg-brand-50">{t("Open team")} <span className="directional-icon ms-1.5">→</span></Link>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-xl text-sm leading-6 text-slate-600">{t("Set up a company or a recruitment agency to invite other recruiters and manage their seats.")}</p>
            <Link href="/team" className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-brand-300 hover:bg-brand-50">{t("Set up an organisation")} <span className="directional-icon ms-1.5">→</span></Link>
          </div>
        )}
        {!workspace && invitations.length > 0 && (
          <ul className="mt-5 space-y-3 border-t border-slate-100 pt-5">
            {invitations.map(({ invitation, organization }) => (
              <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{t("You are invited to join:")} <bdi>{organization.name}</bdi></p>
                  <p className="mt-1 text-xs text-slate-600">{t(ORGANIZATION_KIND_LABEL[organization.kind])} · {t(MEMBER_ROLE_LABEL[invitation.role])}</p>
                </div>
                {profile.emailVerifiedAt
                  ? <InvitationAnswer invitationId={invitation.id} />
                  : <p className="max-w-xs text-xs leading-5 text-slate-600">{t("Open the link in the invitation to join.")}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {user.role === "ADMIN" && (
        <Card title={t("Owner administration")} subtitle={t("Accounts, organisations and subscriptions")}>
          <Link href="/admin" className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-brand-300 hover:bg-brand-50">{t("Open the admin area")} <span className="directional-icon ms-1.5">→</span></Link>
        </Card>
      )}
    </div>
  );
}
