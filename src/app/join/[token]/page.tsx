import type { Metadata } from "next";
import SignInForm from "@/components/auth/SignInForm";
import { JoinWithLinkButton } from "@/components/accounts/TeamControls";
import { MEMBER_ROLE_LABEL, ORGANIZATION_KIND_LABEL } from "@/features/accounts/copy";
import { getAccountsDatabase } from "@/features/accounts/database";
import { signInFormOptions } from "@/features/auth/options";
import { getCurrentUser } from "@/features/auth/session";
import { getAuthStore } from "@/features/auth/store";
import { previewInvitation } from "@/features/organizations/service";
import { getI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";

// The address carries the invitation's secret, so it must not be indexed or
// passed on to other sites as a referrer.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Shows enough of the address for its owner to recognise it, and no more. */
function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 1)}${"•".repeat(Math.max(2, Math.min(6, name.length - 1)))}@${domain}`;
}

/**
 * Where an invitation link leads. A link that cannot be used shows the same
 * message whatever the reason.
 */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const [{ t }, { token }] = await Promise.all([getI18n(), params]);
  const preview = await previewInvitation({ database: await getAccountsDatabase(), auth: getAuthStore() }, token);
  const shell = "mx-auto w-full max-w-md px-4 py-10";
  const card = "surface-card rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-card sm:p-8";

  if (!preview) {
    return (
      <div className={shell}>
        <section className={card}>
          <h1 className="text-xl font-semibold tracking-[-.02em] text-slate-950">{t("This invitation is not available")}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{t("It may have expired, been closed, or already been used. Ask the person who invited you for a new one.")}</p>
        </section>
      </div>
    );
  }

  const user = await getCurrentUser();
  const { invitation, organization } = preview;
  const addressed = <bdi dir="ltr" className="font-semibold text-slate-900">{maskEmail(invitation.email)}</bdi>;

  return (
    <div className={shell}>
      <section className={card}>
        <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-brand-700">{t("Invitation")}</p>
        <h1 className="mt-3 text-xl font-semibold tracking-[-.02em] text-slate-950">{t("Join this organisation on CodeProof")}</h1>
        <p className="mt-2 text-lg font-semibold text-slate-900"><bdi>{organization.name}</bdi></p>
        <p className="mt-1 text-sm text-slate-600">{t(ORGANIZATION_KIND_LABEL[organization.kind])} · {t("Your role: {role}", { role: t(MEMBER_ROLE_LABEL[invitation.role]) })}</p>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          {t("Your candidates stay yours. The organisation's admin can read them; other recruiters cannot.")}
        </p>

        <div className="mt-6 border-t border-slate-100 pt-6">
          {!user ? (
            <>
              <p className="mb-4 text-sm leading-6 text-slate-600">{t("Sign in with the address this invitation was sent to:")} {addressed}</p>
              <SignInForm options={signInFormOptions()} nextPath={`/join/${token}`} invite={token} />
            </>
          ) : user.email === invitation.email ? (
            <JoinWithLinkButton token={token} />
          ) : (
            <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-6 text-amber-900">
              {t("This invitation was sent to another address:")} {addressed}. {t("Sign out, then sign in with that address.")}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
