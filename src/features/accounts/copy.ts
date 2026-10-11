import type { MemberRole, OrganizationKind, SubscriptionStatus } from "@/features/organizations/types";

/**
 * Wording for accounts, organisations and owner administration that is looked
 * up by a value rather than written inline. Every value is a translation key,
 * and `ACCOUNTS_COPY` lists them all for the translation coverage check.
 */

export const ACCOUNT_ERROR_COPY: Record<string, string> = {
  INVALID_INPUT: "Check the form and try again.",
  INVALID_NAME: "Enter a name between 2 and 120 characters.",
  INVALID_KIND: "Choose a company or an agency.",
  INVALID_EMAIL: "Enter a valid email address.",
  INVALID_MEMBER_ROLE: "Choose a role.",
  ALREADY_IN_ORGANIZATION: "This account already belongs to an organisation. Leave it first.",
  ALREADY_A_MEMBER: "That person is already in your organisation.",
  NOT_A_MEMBER: "You are not in an organisation.",
  NOT_ORGANIZATION_ADMIN: "Only your organisation's admin can do this.",
  ORGANIZATION_UNAVAILABLE: "This organisation is not available. Contact support.",
  SEAT_LIMIT_REACHED: "Every seat is taken. Close an invitation, remove a member, or ask us for more seats.",
  INVITATION_UNAVAILABLE: "This invitation is no longer available. Ask for a new one.",
  EMAIL_MISMATCH: "This invitation was sent to a different email address.",
  MEMBER_NOT_FOUND: "That person is not in your organisation.",
  LAST_ADMIN: "An organisation needs an admin. Make someone else an admin first.",
  EMAIL_NOT_VERIFIED: "Sign in with a code or with Google first, so we know this address is yours.",
  RATE_LIMITED: "Too many attempts. Try again later.",
  AUTH_REQUIRED: "Sign in to continue.",
  INVALID_PHONE: "Enter the number in international format, for example +966 5X XXX XXXX.",
  INVALID_CODE: "That code is not right or has expired. Check it, or send a new one.",
  CODE_RECENTLY_SENT: "A code was just sent. Wait a minute before asking for another.",
  TOO_MANY_CODES: "Too many codes were requested. Try again later.",
  DELIVERY_FAILED: "We could not send the code. Try again in a moment.",
  PHONE_IN_USE: "Another account already uses this number.",
  SMS_UNAVAILABLE: "Text messages are not set up on this site.",
  RESOURCE_UNAVAILABLE: "That could not be done. Reload the page and try again.",
  UNKNOWN_PLAN: "Choose a plan from the list.",
  INVALID_STATE: "Choose a state from the list.",
  INVALID_SEATS: "Enter a number of seats between 1 and 1000, or leave it empty to use the plan's.",
  INVALID_DATE: "Enter real dates, with the end on or after the start.",
  INVALID_NOTES: "Keep the note under 2000 characters.",
  CANNOT_CHANGE_OWNER: "An owner account cannot be changed here.",
  NOTHING_TO_CHANGE: "Nothing changed. Reload the page to see how things stand.",
  PLAN_FROM_ORGANIZATION: "This account uses its organisation's plan. Change the plan on the organisation.",
  ACCOUNT_IN_ANOTHER_ORGANIZATION: "That account already belongs to another organisation.",
  ACCOUNT_NOT_ACTIVE: "That account is suspended or removed. Reactivate it first.",
  NO_FREE_SEAT: "Every seat is taken. Raise the seat limit first.",
};

export const ACCOUNT_FALLBACK_ERROR = "Something went wrong. Try again.";

export const MEMBER_ROLE_LABEL: Record<MemberRole, string> = {
  ORG_ADMIN: "Admin",
  RECRUITER: "Recruiter",
};

export const ORGANIZATION_KIND_LABEL: Record<OrganizationKind, string> = {
  company: "Company",
  agency: "Recruitment agency",
};

export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trial: "Trial",
  active: "Active",
  past_due: "Payment overdue",
  paused: "Paused",
  cancelled: "Cancelled",
};

export const LIFECYCLE_LABEL: Record<string, string> = {
  active: "Active",
  suspended: "Suspended",
  soft_deleted: "Removed",
};

/** An organisation is paused, where an account is suspended. */
export const ORGANIZATION_STATE_LABEL: Record<string, string> = {
  active: "Active",
  suspended: "Paused",
};

export const INVITATION_STATUS_LABEL: Record<string, string> = {
  pending: "Waiting for an answer",
  accepted: "Accepted",
  revoked: "Closed",
  expired: "Expired",
};

export const SIGN_IN_METHOD_LABEL: Record<string, string> = {
  email_code: "A code by email",
  sms_code: "A code by text message",
  google: "Google",
  password: "Password",
};

/** Why an organisation is listed on the owner's first page. */
export const ATTENTION_REASON_LABEL: Record<"past_due" | "period_ended" | "period_ending", string> = {
  past_due: "Payment overdue",
  period_ended: "Period has ended",
  period_ending: "Period ends soon",
};

/** What the owner administration history calls each recorded change. */
export const ADMIN_ACTION_LABEL: Record<string, string> = {
  account_suspended: "Account suspended",
  account_reactivated: "Account reactivated",
  account_soft_deleted: "Account removed",
  account_restored: "Account restored",
  account_plan_changed: "Plan changed",
  organization_created: "Organisation created",
  organization_subscription_changed: "Subscription changed",
  organization_details_changed: "Details changed",
  organization_suspended: "Organisation paused",
  organization_restored: "Organisation restored",
  organization_admin_assigned: "Admin named",
};

export const ACCOUNTS_COPY: string[] = [
  ...Object.values(ADMIN_ACTION_LABEL),
  ...Object.values(ATTENTION_REASON_LABEL),
  ...Object.values(ACCOUNT_ERROR_COPY),
  ACCOUNT_FALLBACK_ERROR,
  ...Object.values(MEMBER_ROLE_LABEL),
  ...Object.values(ORGANIZATION_KIND_LABEL),
  ...Object.values(SUBSCRIPTION_STATUS_LABEL),
  ...Object.values(LIFECYCLE_LABEL),
  ...Object.values(ORGANIZATION_STATE_LABEL),
  ...Object.values(INVITATION_STATUS_LABEL),
  ...Object.values(SIGN_IN_METHOD_LABEL),
];
