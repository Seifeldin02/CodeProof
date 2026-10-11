import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import EvidenceResponseForm from "@/components/evidence/EvidenceResponseForm";
import { getCandidateStore } from "@/features/candidates/store";
import { findOpenRequest } from "@/features/evidence-requests/service";
import { EVIDENCE_REQUEST_LIMITS } from "@/features/evidence-requests/types";
import { getI18n } from "@/i18n/server";
import { formatDateForLocale, isLocale } from "@/i18n/translations";

export const dynamic = "force-dynamic";

// The address carries the candidate's private token, so it must not be indexed
// and must not be sent on to other sites as a referrer.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">{children}</div>;
}

/**
 * The candidate's side of an evidence request. No account is needed: the token
 * in the address is the only credential. Every link that cannot be used shows
 * the same message, whatever the reason.
 */
export default async function EvidenceRequestPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ opened?: string | string[] }> }) {
  const [{ token }, { opened }] = await Promise.all([params, searchParams]);
  const { locale, t } = await getI18n();
  const found = await findOpenRequest(token);
  const candidate = found ? await getCandidateStore().getCandidate(found.request.ownerUserId, found.request.candidateId) : null;
  const usable = Boolean(found && candidate && found.status !== "expired" && found.status !== "revoked");

  // The link a recruiter sends starts at ./open, which stores the language they
  // chose. A first-time visitor who arrives here directly is sent there once.
  // Only a usable link does this, so an unusable one looks the same as any other.
  if (usable && found && found.request.locale !== locale && opened !== "1" && !isLocale((await cookies()).get("codeproof-locale")?.value)) {
    redirect(`/evidence/${token}/open?lang=${found.request.locale}`);
  }

  if (!found || !candidate || !usable) {
    return (
      <Shell>
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card sm:p-9">
          <h1 className="text-2xl font-semibold tracking-[-.03em] text-slate-950">{t("This link is not available")}</h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">{t("It may have expired or been replaced. Ask the hiring team that sent it for a new link.")}</p>
        </section>
      </Shell>
    );
  }

  if (found.status === "answered") {
    return (
      <Shell>
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 sm:p-9">
          <h1 className="text-2xl font-semibold tracking-[-.03em] text-emerald-950">{t("Your answer was received")}</h1>
          <p className="mt-3 text-sm leading-7 text-emerald-900">{t("The hiring team can now see what you shared. This link accepts one answer, so it is closed. To change or withdraw your answer, contact the hiring team.")}</p>
        </section>
      </Shell>
    );
  }

  const notice = [
    t("CodeProof reads the public GitHub repositories you list. It reads the latest files as text and never runs your code."),
    t("The hiring team sees which skills your code supports, with the files, and questions to ask you. They do not get a score for you, and nothing is rejected automatically."),
    t("If you share nothing, that is recorded as unknown. It is never counted against you."),
    t("Your answer is kept until the hiring team deletes your record. To change or withdraw it, contact the team that sent you this link."),
    t("Do not share code that belongs to an employer or a client."),
  ];

  return (
    <Shell>
      <header className="hero-grid overflow-hidden rounded-3xl bg-slate-950 p-6 text-white sm:p-9">
        <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-lime-300">{t("Evidence request")}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">{t("Share evidence of your work")}</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
          {t("A hiring team asked you to share evidence of your work for this role: {role}. You decide what to send. Sharing is optional.", { role: t(candidate.role) })}
        </p>
        <p className="mt-3 text-xs text-slate-400">{t("This link works until {date} and accepts one answer.", { date: formatDateForLocale(locale, found.request.expiresAt) })}</p>
      </header>

      <section aria-labelledby="notice-heading" className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
        <h2 id="notice-heading" className="text-lg font-semibold tracking-[-.02em] text-slate-950">{t("What happens to what you share")}</h2>
        <ol className="mt-4 space-y-3">
          {notice.map((item, index) => (
            <li key={item} className="flex gap-3 text-sm leading-6 text-slate-600">
              <span aria-hidden="true" className="font-mono text-[11px] font-semibold text-brand-700">0{index + 1}</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-5">
        <EvidenceResponseForm
          token={token}
          preferredLocale={found.request.locale}
          verificationCode={found.request.verificationCode}
          repositoryLimit={EVIDENCE_REQUEST_LIMITS.repositoriesPerAnswer}
          otherLinkLimit={EVIDENCE_REQUEST_LIMITS.otherLinksPerAnswer}
          noteLimit={EVIDENCE_REQUEST_LIMITS.noteCharacters}
        />
      </div>
    </Shell>
  );
}
