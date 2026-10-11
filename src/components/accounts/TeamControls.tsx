"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { ConfirmedButton, ErrorNote } from "./FormParts";
import { FIELD_CLASS, LABEL_CLASS, PRIMARY_BUTTON, SECONDARY_BUTTON, useApiAction } from "./useApiAction";

export function CreateOrganizationForm() {
  const { t } = useI18n();
  const { run, busy, error } = useApiAction();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("company");
  return (
    <form onSubmit={(event) => { event.preventDefault(); void run("/api/organizations", "POST", { name, kind }); }} className="grid gap-4 sm:grid-cols-[1fr_14rem]">
      <div>
        <label htmlFor="new-organization-name" className={LABEL_CLASS}>{t("Name of the company or agency")}</label>
        <input id="new-organization-name" autoComplete="organization" required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className={FIELD_CLASS} />
      </div>
      <div>
        <label htmlFor="new-organization-kind" className={LABEL_CLASS}>{t("Kind")}</label>
        <select id="new-organization-kind" value={kind} onChange={(event) => setKind(event.target.value)} className={FIELD_CLASS}>
          <option value="company">{t("Company")}</option>
          <option value="agency">{t("Recruitment agency")}</option>
        </select>
      </div>
      <div className="sm:col-span-2"><ErrorNote message={error} /></div>
      <div className="sm:col-span-2"><button type="submit" disabled={busy} className={PRIMARY_BUTTON}>{busy ? t("Saving…") : t("Create and become its admin")}</button></div>
    </form>
  );
}

interface CreatedInvitation {
  link: string;
  emailed: boolean;
  invitation: { email: string };
}

export function InviteMemberForm({ seatsLeft }: { seatsLeft: number }) {
  const { t, locale } = useI18n();
  const { run, busy, error } = useApiAction();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("RECRUITER");
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setCopied(false);
    const result = await run<CreatedInvitation>("/api/organizations/invitations", "POST", { email, role, locale });
    if (result) {
      setCreated(result);
      setEmail("");
    }
  }

  async function copy(): Promise<void> {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <div>
          <label htmlFor="invite-email" className={LABEL_CLASS}>{t("Email address of the person to invite")}</label>
          <input id="invite-email" type="email" dir="ltr" autoComplete="off" required value={email} onChange={(event) => setEmail(event.target.value)} className={FIELD_CLASS} />
        </div>
        <div>
          <label htmlFor="invite-role" className={LABEL_CLASS}>{t("Role")}</label>
          <select id="invite-role" value={role} onChange={(event) => setRole(event.target.value)} className={FIELD_CLASS}>
            <option value="RECRUITER">{t("Recruiter")}</option>
            <option value="ORG_ADMIN">{t("Admin")}</option>
          </select>
        </div>
        <button type="submit" disabled={busy || seatsLeft <= 0} className={PRIMARY_BUTTON}>{busy ? t("Creating…") : t("Create invitation")}</button>
      </form>
      {seatsLeft <= 0 && <p className="text-xs leading-5 text-amber-800">{t("Every seat is taken. Close an invitation, remove a member, or ask us for more seats.")}</p>}
      <ErrorNote message={error} />
      {created && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          <p className="font-semibold">{created.emailed ? t("Invitation emailed. You can also send this link yourself:") : t("Invitation created. Send this link to the person:")}</p>
          <p className="mt-1 text-xs leading-5 text-emerald-900">
            {t("It works for 7 days, once, and only for this address:")} <bdi dir="ltr" className="font-semibold">{created.invitation.email}</bdi>
          </p>
          <code dir="ltr" className="mt-3 block break-all rounded-lg bg-white px-3 py-2 text-start text-xs text-slate-800">{created.link}</code>
          <button type="button" onClick={() => void copy()} className={`${SECONDARY_BUTTON} mt-3`}>{copied ? t("Link copied") : t("Copy the link")}</button>
          <p className="mt-2 text-xs leading-5 text-emerald-900">{t("The link is shown only now. If it is lost, create a new invitation for the same address.")}</p>
        </div>
      )}
    </div>
  );
}

export function MemberActions({ userId, role, isSelf }: { userId: string; role: "ORG_ADMIN" | "RECRUITER"; isSelf: boolean }) {
  const { t } = useI18n();
  const { run, busy, error } = useApiAction();
  const path = `/api/organizations/members/${userId}`;
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        {role === "RECRUITER"
          ? <button type="button" disabled={busy} onClick={() => void run(path, "PATCH", { role: "ORG_ADMIN" })} className={SECONDARY_BUTTON}>{t("Make admin")}</button>
          : <button type="button" disabled={busy} onClick={() => void run(path, "PATCH", { role: "RECRUITER" })} className={SECONDARY_BUTTON}>{t("Make recruiter")}</button>}
        {!isSelf && (
          <ConfirmedButton label={t("Remove")} question={t("Remove this person from the organisation?")} confirm={t("Yes, remove")} busy={busy} onConfirm={() => void run(path, "DELETE")} />
        )}
      </div>
      <ErrorNote message={error} />
    </div>
  );
}

export function CloseInvitationButton({ invitationId }: { invitationId: string }) {
  const { t } = useI18n();
  const { run, busy, error } = useApiAction();
  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" disabled={busy} onClick={() => void run(`/api/organizations/invitations/${invitationId}`, "DELETE")} className={SECONDARY_BUTTON}>{t("Close invitation")}</button>
      <ErrorNote message={error} />
    </div>
  );
}

export function LeaveOrganizationButton({ userId }: { userId: string }) {
  const { t } = useI18n();
  const { run, busy, error } = useApiAction();
  return (
    <div className="flex flex-col items-start gap-2">
      <ConfirmedButton label={t("Leave this organisation")} question={t("Leave this organisation? Your candidates stay yours.")} confirm={t("Yes, leave")} busy={busy} onConfirm={() => void run(`/api/organizations/members/${userId}`, "DELETE")} />
      <ErrorNote message={error} />
    </div>
  );
}

export function InvitationAnswer({ invitationId }: { invitationId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const { run, busy, error } = useApiAction();
  async function answer(value: "accept" | "decline"): Promise<void> {
    const result = await run(`/api/organizations/invitations/${invitationId}`, "POST", { answer: value });
    if (result && value === "accept") router.push("/team");
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void answer("accept")} className={PRIMARY_BUTTON}>{t("Join")}</button>
        <button type="button" disabled={busy} onClick={() => void answer("decline")} className={SECONDARY_BUTTON}>{t("Decline")}</button>
      </div>
      <ErrorNote message={error} />
    </div>
  );
}

export function JoinWithLinkButton({ token }: { token: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const { run, busy, error } = useApiAction();
  async function join(): Promise<void> {
    if (await run("/api/organizations/join", "POST", { token })) router.push("/team");
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" disabled={busy} onClick={() => void join()} className={PRIMARY_BUTTON}>{busy ? t("Joining…") : t("Join")}</button>
      <ErrorNote message={error} />
    </div>
  );
}
