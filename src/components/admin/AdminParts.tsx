import type { ReactNode } from "react";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { ADMIN_ACTION_LABEL, LIFECYCLE_LABEL, ORGANIZATION_STATE_LABEL, SUBSCRIPTION_STATUS_LABEL } from "@/features/accounts/copy";
import { formatCalendarDate, recordedChanges, type RecordedChange } from "@/features/admin/history";
import { planById } from "@/features/plans/catalog";
import { formatDateForLocale, type Locale, type TranslationValues } from "@/i18n/translations";
import type { AdminAuditEntry } from "@/types/remediation";

/** Pieces the owner administration pages share. They render on the server. */

type Translate = (key: string, values?: TranslationValues) => string;

export const TABLE_HEAD = "border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-500";
export const CELL = "px-4 py-3 align-top";
export const ROW_LINK = "inline-flex min-h-11 items-center font-semibold text-slate-900 underline-offset-4 hover:text-brand-700 hover:underline";
export const BACK_LINK = "inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-brand-300 hover:bg-brand-50";
export const FILTER_FIELD = "mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-start text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-50";
export const FILTER_LABEL = "block text-xs font-semibold text-slate-600";

export function Tile({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-card">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-2 text-2xl font-semibold tracking-[-.02em] text-slate-950">{value}</dd>
      {note && <dd className="mt-1 text-xs leading-5 text-slate-600">{note}</dd>}
    </div>
  );
}

const STATE_TONE = { active: "positive", suspended: "warning", soft_deleted: "negative" } as const;

export function StateBadge({ state, t }: { state: string; t: Translate }) {
  return <Badge tone={STATE_TONE[state as keyof typeof STATE_TONE] ?? "neutral"}>{t(LIFECYCLE_LABEL[state] ?? state)}</Badge>;
}

const SUBSCRIPTION_TONE = { active: "positive", trial: "brand", past_due: "negative", paused: "warning", cancelled: "neutral" } as const;

export function SubscriptionBadge({ status, t }: { status: keyof typeof SUBSCRIPTION_TONE; t: Translate }) {
  return <Badge tone={SUBSCRIPTION_TONE[status]}>{t(SUBSCRIPTION_STATUS_LABEL[status])}</Badge>;
}

/** Links to the pages before and after this one, keeping the filters in the address. */
export function Pagination({ page, pages, hrefFor, t }: { page: number; pages: number; hrefFor: (page: number) => string; t: Translate }) {
  if (pages <= 1) return null;
  const link = "inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-brand-300 hover:bg-brand-50";
  return (
    <nav aria-label={t("Pages")} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
      <p className="text-sm text-slate-600">{t("Page {page} of {pages}", { page, pages })}</p>
      <div className="flex gap-2">
        {page > 1 && <Link href={hrefFor(page - 1)} rel="prev" className={link}>{t("Previous")}</Link>}
        {page < pages && <Link href={hrefFor(page + 1)} rel="next" className={link}>{t("Next")}</Link>}
      </div>
    </nav>
  );
}

const CHANGE_LABEL: Record<RecordedChange["field"], string> = {
  state: "State",
  plan: "Plan",
  subscription: "Subscription",
  seats: "Seats",
  periodEnd: "Period ends",
};

function changeValue(change: RecordedChange, value: string | number | null, t: Translate, locale: Locale, stateLabel: Record<string, string>): string {
  switch (change.field) {
    case "state":
      return value === null ? t("Not set") : t(stateLabel[String(value)] ?? String(value));
    case "plan":
      return value === null ? t("Not set") : t(planById(String(value)).name);
    case "subscription":
      return value === null ? t("Not set") : t((SUBSCRIPTION_STATUS_LABEL as Record<string, string>)[String(value)] ?? String(value));
    case "seats":
      return value === null ? t("The plan's seats") : String(value);
    case "periodEnd":
      return value === null ? t("Not set") : formatCalendarDate(locale, String(value));
  }
}

function HistoryEntry({ entry, actor, t, locale }: { entry: AdminAuditEntry; actor: string; t: Translate; locale: Locale }) {
  const stateLabel = entry.action.startsWith("organization_") ? ORGANIZATION_STATE_LABEL : LIFECYCLE_LABEL;
  // The address a change was about, when the entry names one. The log may have redacted it.
  const email = entry.parameters.email;
  const named = typeof email === "string" && email.includes("@") ? email : null;
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <p className="text-sm font-semibold text-slate-900">{t(ADMIN_ACTION_LABEL[entry.action] ?? entry.action)}</p>
      {named && <p className="mt-1 text-sm text-slate-700"><bdi dir="ltr" className="break-all">{named}</bdi></p>}
      {recordedChanges(entry).map((change) => (
        <p key={change.field} className="mt-1 text-sm text-slate-700">
          {t(CHANGE_LABEL[change.field])}:{" "}
          {/* Something that did not exist before has only the value it starts with. */}
          {entry.before !== null && (
            <>
              {changeValue(change, change.from, t, locale, stateLabel)}
              {" "}<span aria-hidden="true" className="directional-icon">→</span><span className="sr-only"> {t("changed to")} </span>{" "}
            </>
          )}
          {changeValue(change, change.to, t, locale, stateLabel)}
        </p>
      ))}
      <p className="mt-1 text-xs text-slate-600">
        <time dateTime={entry.occurredAt}>{formatDateForLocale(locale, entry.occurredAt)}</time>
        {" · "}<bdi dir="ltr">{actor}</bdi>
      </p>
    </li>
  );
}

/** Recorded changes, newest first, with who made each one and what moved. */
export function History({ entries, actors, t, locale }: { entries: readonly AdminAuditEntry[]; actors: ReadonlyMap<string, string>; t: Translate; locale: Locale }) {
  if (entries.length === 0) return <p className="text-sm text-slate-600">{t("No changes have been recorded yet.")}</p>;
  return (
    <ol className="divide-y divide-slate-100">
      {entries.map((entry) => <HistoryEntry key={entry.id} entry={entry} actor={actors.get(entry.actorUserId) ?? entry.actorUserId} t={t} locale={locale} />)}
    </ol>
  );
}
