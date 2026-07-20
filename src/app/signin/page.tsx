import { redirect } from "next/navigation";
import SignInForm from "@/components/auth/SignInForm";
import { ShieldCheckIcon } from "@/components/ui/icons";
import { getCurrentUser } from "@/features/auth/session";
import { signupAllowed } from "@/features/auth/store";
import { getI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";

/** Only same-site paths are accepted, so `next` cannot become an open redirect. */
function safeNext(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/analyze";
  return value;
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { t } = await getI18n();
  const target = safeNext((await searchParams).next);

  if (await getCurrentUser()) redirect(target);

  const canRegister = signupAllowed();

  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center py-10">
      <div className="surface-card rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-card sm:p-8">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
          <ShieldCheckIcon className="h-5 w-5" />
        </span>

        <h1 className="mt-4 text-xl font-semibold tracking-[-.02em] text-slate-950">
          {t(canRegister ? "Set up CodeProof" : "Sign in to upload")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          {t(
            canRegister
              ? "Create the first account to claim this workspace. Later visitors will need an account from you."
              : "Uploading a CV creates candidate records, so it needs an account. Browsing the workspace stays open.",
          )}
        </p>

        <div className="mt-6">
          <SignInForm canRegister={canRegister} nextPath={target} />
        </div>
      </div>
    </div>
  );
}
