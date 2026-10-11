import type { Locale } from "@/i18n/translations";
import type { AdminAuditEntry } from "@/types/remediation";

/**
 * A subscription period is a pair of calendar days entered by an owner and
 * stored at midnight UTC. They are shown in UTC, so the day read back is the
 * day that was typed whatever zone the server is in, and in the Gregorian
 * calendar in both languages, because that is the calendar the form's date
 * field and an invoice use.
 */
export function formatCalendarDate(locale: Locale, value: string): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value));
}

/** The value a date field shows for a stored calendar day. */
export function dateFieldValue(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

/** Recorded changes to one account, newest first. */
export function accountHistory(entries: readonly AdminAuditEntry[], userId: string): AdminAuditEntry[] {
  return entries.filter((entry) => entry.outcome === "succeeded" && entry.targetKind === "account" && entry.targetId === userId).reverse();
}

/** Recorded changes to one organisation, newest first. Every organisation change names it in its parameters. */
export function organizationHistory(entries: readonly AdminAuditEntry[], organizationId: string): AdminAuditEntry[] {
  return entries.filter((entry) => entry.outcome === "succeeded" && entry.parameters.organizationId === organizationId).reverse();
}

export interface RecordedChange {
  field: "state" | "plan" | "subscription" | "seats" | "periodEnd";
  from: string | number | null;
  to: string | number | null;
}

const FIELDS: ReadonlyArray<[key: string, field: RecordedChange["field"]]> = [
  ["lifecycleState", "state"],
  ["planTierId", "plan"],
  ["subscriptionStatus", "subscription"],
  ["seatLimit", "seats"],
  ["currentPeriodEnd", "periodEnd"],
];

const scalar = (value: unknown): string | number | null => (typeof value === "string" || typeof value === "number" ? value : null);

/** The values an entry changed, for the ones worth reading back in a history line. */
export function recordedChanges(entry: Pick<AdminAuditEntry, "before" | "after">): RecordedChange[] {
  const after = entry.after;
  if (!after) return [];
  return FIELDS.flatMap(([key, field]) => {
    if (!(key in after)) return [];
    const from = scalar(entry.before?.[key]);
    const to = scalar(after[key]);
    return from === to ? [] : [{ field, from, to }];
  });
}
