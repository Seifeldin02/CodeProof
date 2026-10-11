import { redirect } from "next/navigation";
import SignInForm from "@/components/auth/SignInForm";
import { ShieldCheckIcon } from "@/components/ui/icons";
import { safeNextPath } from "@/features/auth/finish-sign-in";
import { signInFormOptions } from "@/features/auth/options";
import { getCurrentUser } from "@/features/auth/session";
import { isWellFormedInvitationToken } from "@/features/organizations/service";
import { getI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; invite?: string }> }) {
  const { t } = await getI18n();
  const query = await searchParams;
  // Only same-site paths are accepted, so `next` cannot become an open redirect.
  const target = safeNextPath(query.next, "/analyze");
  const invite = query.invite && isWellFormedInvitationToken(query.invite) ? query.invite : null;

  if (await getCurrentUser()) redirect(invite ? `/join/${invite}` : target);

  const options = signInFormOptions();

  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="surface-card rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-card sm:p-8">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
          <ShieldCheckIcon className="h-5 w-5" />
        </span>

        <h1 className="mt-4 text-xl font-semibold tracking-[-.02em] text-slate-950">
          {options.signup ? t("Sign in or create your account") : t("Sign in to continue")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          {options.signup
            ? t("Your candidates, reports, requirements, and hiring analytics stay isolated to your account.")
            : t("Sign in to access your private recruiter workspace.")}
        </p>

        <div className="mt-6">
          <SignInForm options={options} nextPath={target} invite={invite} initialError={typeof query.error === "string" ? query.error : null} />
        </div>
      </div>
    </div>
  );
}
