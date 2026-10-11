"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmedButton, ErrorNote } from "@/components/accounts/FormParts";
import { FIELD_CLASS, LABEL_CLASS, PRIMARY_BUTTON, SECONDARY_BUTTON, useApiAction } from "@/components/accounts/useApiAction";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { SUBSCRIPTION_STATUS_LABEL } from "@/features/accounts/copy";
import { SUBSCRIPTION_STATUSES } from "@/features/organizations/types";

/** A plan as the server hands it to a form: its identifier and the translation key of its name. */
export interface PlanOption {
  id: string;
  name: string;
  seats: number;
}

function SavedNote({ show }: { show: boolean }) {
  const { t } = useI18n();
  return show ? <p role="status" className="text-sm font-medium text-emerald-700">{t("Saved")}</p> : null;
}

export function AccountStateActions({ userId, state }: { userId: string; state: "active" | "suspended" | "soft_deleted" }) {
  const { t } = useI18n();
  const { run, busy, error } = useApiAction();
  const send = (action: string) => void run(`/api/admin/accounts/${userId}`, "POST", { action });
  return (
    <div className="flex flex-col items-start gap-3">
      <div className="flex flex-wrap gap-2">
        {state === "active" && (
          <ConfirmedButton label={t("Suspend")} question={t("Suspend this account? It is signed out and cannot sign in until it is reactivated.")} confirm={t("Yes, suspend")} busy={busy} onConfirm={() => send("suspend")} />
        )}
        {state === "suspended" && <button type="button" disabled={busy} onClick={() => send("reactivate")} className={SECONDARY_BUTTON}>{t("Reactivate")}</button>}
        {state !== "soft_deleted" && (
          <ConfirmedButton label={t("Remove account")} question={t("Remove this account? Its records are kept and it can be restored.")} confirm={t("Yes, remove")} busy={busy} onConfirm={() => send("remove")} />
        )}
        {state === "soft_deleted" && <button type="button" disabled={busy} onClick={() => send("restore")} className={SECONDARY_BUTTON}>{t("Restore account")}</button>}
      </div>
      <ErrorNote message={error} />
    </div>
  );
}

export function AccountPlanForm({ userId, planTierId, plans }: { userId: string; planTierId: string; plans: PlanOption[] }) {
  const { t } = useI18n();
  const { run, busy, error } = useApiAction();
  const [plan, setPlan] = useState(planTierId);
  const [saved, setSaved] = useState(false);
  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSaved(Boolean(await run(`/api/admin/accounts/${userId}`, "POST", { action: "plan", planTierId: plan })));
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <label htmlFor="account-plan" className={LABEL_CLASS}>{t("Plan")}</label>
          <select id="account-plan" value={plan} onChange={(event) => { setPlan(event.target.value); setSaved(false); }} className={FIELD_CLASS}>
            {plans.map((option) => <option key={option.id} value={option.id}>{t(option.name)}</option>)}
          </select>
        </div>
        <button type="submit" disabled={busy || plan === planTierId} className={PRIMARY_BUTTON}>{busy ? t("Saving…") : t("Save plan")}</button>
      </div>
      <SavedNote show={saved} />
      <ErrorNote message={error} />
    </form>
  );
}

export function NewOrganizationForm({ plans }: { plans: PlanOption[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const { run, busy, error } = useApiAction();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("company");
  const [plan, setPlan] = useState(plans[0]?.id ?? "");
  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const created = await run<{ organization: { id: string } }>("/api/admin/organizations", "POST", { name, kind, planTierId: plan });
    if (created) router.push(`/admin/organizations/${created.organization.id}`);
  }
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-end">
      <div className="sm:col-span-2 lg:col-span-1">
        <label htmlFor="admin-organization-name" className={LABEL_CLASS}>{t("Name of the company or agency")}</label>
        <input id="admin-organization-name" autoComplete="off" required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className={FIELD_CLASS} />
      </div>
      <div>
        <label htmlFor="admin-organization-kind" className={LABEL_CLASS}>{t("Kind")}</label>
        <select id="admin-organization-kind" value={kind} onChange={(event) => setKind(event.target.value)} className={FIELD_CLASS}>
          <option value="company">{t("Company")}</option>
          <option value="agency">{t("Recruitment agency")}</option>
        </select>
      </div>
      <div>
        <label htmlFor="admin-organization-plan" className={LABEL_CLASS}>{t("Plan")}</label>
        <select id="admin-organization-plan" value={plan} onChange={(event) => setPlan(event.target.value)} className={FIELD_CLASS}>
          {plans.map((option) => <option key={option.id} value={option.id}>{t(option.name)}</option>)}
        </select>
      </div>
      <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>{busy ? t("Creating…") : t("Create organisation")}</button>
      <div className="sm:col-span-2 lg:col-span-4"><ErrorNote message={error} /></div>
    </form>
  );
}

export interface SubscriptionValues {
  planTierId: string;
  subscriptionStatus: string;
  /** Empty when the plan's own seat count applies. */
  seatLimit: string;
  /** Year, month and day, or empty. */
  currentPeriodStart: string;
  currentPeriodEnd: string;
  notes: string;
}

export function SubscriptionForm({ organizationId, initial, plans }: { organizationId: string; initial: SubscriptionValues; plans: PlanOption[] }) {
  const { t } = useI18n();
  const { run, busy, error } = useApiAction();
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(false);
  const change = (field: keyof SubscriptionValues, value: string): void => {
    setValues((current) => ({ ...current, [field]: value }));
    setSaved(false);
  };
  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSaved(Boolean(await run(`/api/admin/organizations/${organizationId}`, "POST", { action: "subscription", ...values })));
  }
  const planSeats = plans.find((option) => option.id === values.planTierId)?.seats;
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <div>
        <label htmlFor="subscription-plan" className={LABEL_CLASS}>{t("Plan")}</label>
        <select id="subscription-plan" value={values.planTierId} onChange={(event) => change("planTierId", event.target.value)} className={FIELD_CLASS}>
          {plans.map((option) => <option key={option.id} value={option.id}>{t(option.name)}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="subscription-status" className={LABEL_CLASS}>{t("Subscription status")}</label>
        <select id="subscription-status" value={values.subscriptionStatus} onChange={(event) => change("subscriptionStatus", event.target.value)} className={FIELD_CLASS}>
          {SUBSCRIPTION_STATUSES.map((status) => <option key={status} value={status}>{t(SUBSCRIPTION_STATUS_LABEL[status])}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="subscription-seats" className={LABEL_CLASS}>{t("Seats")}</label>
        <input id="subscription-seats" type="number" inputMode="numeric" dir="ltr" min={1} max={1000} step={1} aria-describedby="subscription-seats-hint" value={values.seatLimit} onChange={(event) => change("seatLimit", event.target.value)} className={FIELD_CLASS} />
        <p id="subscription-seats-hint" className="mt-1.5 text-xs leading-5 text-slate-600">
          {planSeats === undefined ? t("Leave empty to use the plan's seats.") : t("Leave empty to use the plan's seats: {seats}.", { seats: planSeats })}
        </p>
      </div>
      <div>
        <label htmlFor="subscription-start" className={LABEL_CLASS}>{t("Period starts")}</label>
        <input id="subscription-start" type="date" dir="ltr" value={values.currentPeriodStart} onChange={(event) => change("currentPeriodStart", event.target.value)} className={FIELD_CLASS} />
      </div>
      <div>
        <label htmlFor="subscription-end" className={LABEL_CLASS}>{t("Period ends")}</label>
        <input id="subscription-end" type="date" dir="ltr" min={values.currentPeriodStart || undefined} value={values.currentPeriodEnd} onChange={(event) => change("currentPeriodEnd", event.target.value)} className={FIELD_CLASS} />
      </div>
      <div className="sm:col-span-2 xl:col-span-3">
        <label htmlFor="subscription-notes" className={LABEL_CLASS}>{t("Notes for owners")}</label>
        <textarea id="subscription-notes" rows={3} maxLength={2000} aria-describedby="subscription-notes-hint" value={values.notes} onChange={(event) => change("notes", event.target.value)} className={`${FIELD_CLASS} h-auto py-3`} />
        <p id="subscription-notes-hint" className="mt-1.5 text-xs leading-5 text-slate-600">{t("Only owners see this. The organisation never does.")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 xl:col-span-3">
        <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>{busy ? t("Saving…") : t("Save subscription")}</button>
        <SavedNote show={saved} />
      </div>
      <div className="sm:col-span-2 xl:col-span-3"><ErrorNote message={error} /></div>
    </form>
  );
}

export function OrganizationDetailsForm({ organizationId, initial }: { organizationId: string; initial: { name: string; kind: string; isDemo: boolean } }) {
  const { t } = useI18n();
  const { run, busy, error } = useApiAction();
  const [name, setName] = useState(initial.name);
  const [kind, setKind] = useState(initial.kind);
  const [isDemo, setIsDemo] = useState(initial.isDemo);
  const [saved, setSaved] = useState(false);
  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSaved(Boolean(await run(`/api/admin/organizations/${organizationId}`, "POST", { action: "details", name, kind, isDemo })));
  }
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-[1fr_14rem]">
      <div>
        <label htmlFor="details-name" className={LABEL_CLASS}>{t("Name of the company or agency")}</label>
        <input id="details-name" autoComplete="off" required minLength={2} maxLength={120} value={name} onChange={(event) => { setName(event.target.value); setSaved(false); }} className={FIELD_CLASS} />
      </div>
      <div>
        <label htmlFor="details-kind" className={LABEL_CLASS}>{t("Kind")}</label>
        <select id="details-kind" value={kind} onChange={(event) => { setKind(event.target.value); setSaved(false); }} className={FIELD_CLASS}>
          <option value="company">{t("Company")}</option>
          <option value="agency">{t("Recruitment agency")}</option>
        </select>
      </div>
      <label className="flex min-h-11 items-start gap-3 text-sm leading-6 text-slate-800 sm:col-span-2">
        <input type="checkbox" checked={isDemo} onChange={(event) => { setIsDemo(event.target.checked); setSaved(false); }} className="mt-1 h-4 w-4 rounded border-slate-300" />
        <span>{t("This is a demo organisation. It is counted apart from real customers.")}</span>
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={busy} className={SECONDARY_BUTTON}>{busy ? t("Saving…") : t("Save details")}</button>
        <SavedNote show={saved} />
      </div>
      <div className="sm:col-span-2"><ErrorNote message={error} /></div>
    </form>
  );
}

export function OrganizationStateButton({ organizationId, state }: { organizationId: string; state: "active" | "suspended" }) {
  const { t } = useI18n();
  const { run, busy, error } = useApiAction();
  const send = (action: string) => void run(`/api/admin/organizations/${organizationId}`, "POST", { action });
  return (
    <div className="flex flex-col items-start gap-3">
      {state === "active"
        ? <ConfirmedButton label={t("Pause organisation")} question={t("Pause this organisation? Its members keep their accounts, but nobody can be invited or changed.")} confirm={t("Yes, pause")} busy={busy} onConfirm={() => send("suspend")} />
        : <button type="button" disabled={busy} onClick={() => send("restore")} className={SECONDARY_BUTTON}>{t("Restore organisation")}</button>}
      <ErrorNote message={error} />
    </div>
  );
}

type Assignment =
  | { outcome: "assigned" | "promoted"; email: string }
  | { outcome: "invited"; email: string; link: string; emailed: boolean };

export function AssignAdminForm({ organizationId }: { organizationId: string }) {
  const { t, locale } = useI18n();
  const { run, busy, error } = useApiAction();
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<Assignment | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setCopied(false);
    const assigned = await run<Assignment>(`/api/admin/organizations/${organizationId}`, "POST", { action: "admin", email, locale });
    setResult(assigned);
    if (assigned) setEmail("");
  }

  async function copy(link: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label htmlFor="assign-admin-email" className={LABEL_CLASS}>{t("Email address of the admin")}</label>
          <input id="assign-admin-email" type="email" dir="ltr" autoComplete="off" required value={email} onChange={(event) => setEmail(event.target.value)} className={FIELD_CLASS} />
        </div>
        <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>{busy ? t("Saving…") : t("Name as admin")}</button>
      </form>
      <ErrorNote message={error} />
      {result && result.outcome !== "invited" && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          {t("This person now administers the organisation:")} <bdi dir="ltr" className="font-semibold">{result.email}</bdi>
        </p>
      )}
      {result && result.outcome === "invited" && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          <p className="font-semibold">{result.emailed ? t("Nobody has that address yet, so an invitation was emailed. You can also send this link yourself:") : t("Nobody has that address yet, so an invitation was created. Send this link to the person:")}</p>
          <p className="mt-1 text-xs leading-5 text-emerald-900">
            {t("It works for 7 days, once, and only for this address:")} <bdi dir="ltr" className="font-semibold">{result.email}</bdi>
          </p>
          <code dir="ltr" className="mt-3 block break-all rounded-lg bg-white px-3 py-2 text-start text-xs text-slate-800">{result.link}</code>
          <button type="button" onClick={() => void copy(result.link)} className={`${SECONDARY_BUTTON} mt-3`}>{copied ? t("Link copied") : t("Copy the link")}</button>
          <p className="mt-2 text-xs leading-5 text-emerald-900">{t("The link is shown only now. If it is lost, name the same address again.")}</p>
        </div>
      )}
    </div>
  );
}
