"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { ErrorNote } from "./FormParts";
import { DANGER_BUTTON, FIELD_CLASS, LABEL_CLASS, PRIMARY_BUTTON, SECONDARY_BUTTON, useApiAction } from "./useApiAction";

export function DisplayNameForm({ initialName }: { initialName: string }) {
  const { t } = useI18n();
  const { run, busy, error } = useApiAction();
  const [name, setName] = useState(initialName);
  const [saved, setSaved] = useState(false);
  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSaved(false);
    if (await run("/api/account/profile", "PATCH", { displayName: name })) setSaved(true);
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label htmlFor="account-name" className={LABEL_CLASS}>{t("Your name")}</label>
        <input id="account-name" autoComplete="name" required maxLength={80} value={name} onChange={(event) => { setName(event.target.value); setSaved(false); }} className={FIELD_CLASS} />
      </div>
      <ErrorNote message={error} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className={SECONDARY_BUTTON}>{busy ? t("Saving…") : t("Save name")}</button>
        {saved && <span role="status" className="text-xs font-semibold text-emerald-700">{t("Saved")}</span>}
      </div>
    </form>
  );
}

/** Adds, confirms or removes the mobile number that can receive sign-in codes. */
export function PhoneForm({ phone }: { phone: string | null }) {
  const { t, locale } = useI18n();
  const { run, busy, error } = useApiAction();
  const [number, setNumber] = useState("");
  const [code, setCode] = useState("");
  const [awaitingCode, setAwaitingCode] = useState(false);

  if (phone) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-800">{t("Codes can be texted to:")} <bdi dir="ltr" className="font-semibold">{phone}</bdi></p>
        <ErrorNote message={error} />
        <button type="button" disabled={busy} onClick={() => void run("/api/account/phone", "DELETE")} className={DANGER_BUTTON}>{t("Remove this number")}</button>
      </div>
    );
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!awaitingCode) {
      if (await run("/api/account/phone", "POST", { phone: number, locale })) setAwaitingCode(true);
      return;
    }
    if (await run("/api/account/phone", "POST", { phone: number, code })) {
      setAwaitingCode(false);
      setCode("");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label htmlFor="account-phone" className={LABEL_CLASS}>{t("Mobile number, in international format")}</label>
        <input id="account-phone" type="tel" dir="ltr" autoComplete="tel" inputMode="tel" placeholder="+9665XXXXXXXX" required disabled={awaitingCode} value={number} onChange={(event) => setNumber(event.target.value)} className={FIELD_CLASS} />
      </div>
      {awaitingCode && (
        <div>
          <label htmlFor="account-phone-code" className={LABEL_CLASS}>{t("6-digit code")}</label>
          <input id="account-phone-code" dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={8} required value={code} onChange={(event) => setCode(event.target.value)} className={`${FIELD_CLASS} text-center font-mono text-lg tracking-[.4em]`} />
          <p className="mt-2 text-xs leading-5 text-slate-600">{t("We texted a code to this number. It works for 10 minutes.")}</p>
        </div>
      )}
      <ErrorNote message={error} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={SECONDARY_BUTTON}>{awaitingCode ? t("Confirm number") : t("Text me a code")}</button>
        {awaitingCode && <button type="button" disabled={busy} onClick={() => { setAwaitingCode(false); setCode(""); }} className={SECONDARY_BUTTON}>{t("Use a different number")}</button>}
      </div>
    </form>
  );
}

export function SignOutButton() {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function signOut(): Promise<void> {
    setBusy(true);
    const response = await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    if (!response?.ok) {
      setBusy(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }
  return <button type="button" disabled={busy} onClick={() => void signOut()} className={PRIMARY_BUTTON}>{t("Sign out")}</button>;
}
