import { redirect } from "next/navigation";
import WelcomeForm from "@/components/accounts/WelcomeForm";
import { getAccountsDatabase } from "@/features/accounts/database";
import { getProfile } from "@/features/accounts/profiles";
import { safeNextPath } from "@/features/auth/finish-sign-in";
import { requirePageUser } from "@/features/auth/page-guard";
import { getWorkspace } from "@/features/organizations/service";
import { getI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";

/** The step a person sees once, right after their first sign-in. */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ t }, user, query] = await Promise.all([getI18n(), requirePageUser("/welcome"), searchParams]);
  const next = safeNextPath(query.next);
  const database = await getAccountsDatabase();
  const [profile, workspace] = await Promise.all([getProfile(database.runner, user.id), getWorkspace(database.runner, user.id)]);
  if (profile.onboardedAt) redirect(next);

  return (
    <div className="mx-auto w-full max-w-xl py-4 sm:py-8">
      <div className="surface-card rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-card sm:p-8">
        <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-brand-700">{t("One step before you start")}</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-[-.03em] text-slate-950">{t("Welcome to CodeProof")}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{t("Tell us who you are. You can change any of this later from your account.")}</p>
        <div className="mt-6">
          <WelcomeForm initialName={profile.displayName ?? ""} joinedOrganization={workspace?.organization.name ?? null} nextPath={next} />
        </div>
      </div>
    </div>
  );
}
