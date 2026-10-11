"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { FIELD_CLASS, LABEL_CLASS, PRIMARY_BUTTON, useApiAction } from "./useApiAction";

type Choice = "company" | "agency" | "solo";

/**
 * Shown once, after the first sign-in. It asks for a name and whether the
 * person is setting up a company, an agency, or working alone for now.
 */
export default function WelcomeForm({ initialName, joinedOrganization, nextPath }: { initialName: string; joinedOrganization: string | null; nextPath: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const { run, busy, error } = useApiAction();
  const [name, setName] = useState(initialName);
  const [choice, setChoice] = useState<Choice>("company");
  const [organization, setOrganization] = useState("");

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const workspace = joinedOrganization || choice === "solo" ? null : { kind: choice, name: organization };
    const saved = await run("/api/account/onboarding", "POST", { displayName: name, workspace });
    if (saved) router.replace(workspace || joinedOrganization ? "/team" : nextPath);
  }

  const choices: Array<[Choice, string, string]> = [
    ["company", t("For my company"), t("You hire for one employer. You can add its other recruiters.")],
    ["agency", t("For a recruitment agency"), t("You hire for clients. You can add the recruiters you work with.")],
    ["solo", t("On my own for now"), t("Just you. You can set up a company or an agency later.")],
  ];

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <label htmlFor="display-name" className={LABEL_CLASS}>{t("Your name")}</label>
        <input id="display-name" autoComplete="name" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className={FIELD_CLASS} />
      </div>

      {joinedOrganization ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
          {t("You have joined this organisation:")} <bdi className="font-semibold">{joinedOrganization}</bdi>
        </p>
      ) : (
        <>
          <fieldset>
            <legend className={LABEL_CLASS}>{t("How will you use CodeProof?")}</legend>
            <div className="mt-2 grid gap-2">
              {choices.map(([value, label, hint]) => (
                <label key={value} className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition ${choice === value ? "border-brand-500 bg-brand-50/60" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                  <input type="radio" name="workspace" value={value} checked={choice === value} onChange={() => setChoice(value)} className="mt-1 h-4 w-4 accent-brand-700" />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{label}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-600">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {choice !== "solo" && (
            <div>
              <label htmlFor="organization-name" className={LABEL_CLASS}>{choice === "agency" ? t("Agency name") : t("Company name")}</label>
              <input id="organization-name" autoComplete="organization" required minLength={2} maxLength={120} value={organization} onChange={(event) => setOrganization(event.target.value)} className={FIELD_CLASS} />
              <p className="mt-2 text-xs leading-5 text-slate-600">
                {t("You become its admin. Each recruiter you add keeps their own candidates, and only the admin can see everyone's.")}
              </p>
            </div>
          )}
        </>
      )}

      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</div>}
      <button type="submit" disabled={busy} className={`${PRIMARY_BUTTON} w-full`}>{busy ? t("Saving…") : t("Continue")}</button>
    </form>
  );
}
