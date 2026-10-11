import { isoOrNull, type SqlRunner } from "@/features/persistence/sql";

/**
 * What an account holds beyond its email address: a display name, an optional
 * verified mobile number, and when and how it last signed in. Kept in its own
 * table so the accounts table itself is never altered.
 */

export type SignInMethod = "email_code" | "sms_code" | "google" | "password";

export interface AccountProfile {
  userId: string;
  displayName: string | null;
  /**
   * When the person last proved they can read the account's address, by a code
   * or through Google. Null for an account that has only ever used a password.
   */
  emailVerifiedAt: string | null;
  /** International format. Present only after the number was verified by a code. */
  phone: string | null;
  phoneVerifiedAt: string | null;
  /** When the person finished the welcome step. Null means they have not seen it. */
  onboardedAt: string | null;
  lastSignInAt: string | null;
  lastSignInMethod: SignInMethod | null;
}

interface ProfileRow {
  user_id: string;
  display_name: string | null;
  email_verified_at: string | null;
  phone_e164: string | null;
  phone_verified_at: string | null;
  onboarded_at: string | null;
  last_sign_in_at: string | null;
  last_sign_in_method: string | null;
}

const METHODS: readonly SignInMethod[] = ["email_code", "sms_code", "google", "password"];

function mapProfile(userId: string, row: ProfileRow | undefined): AccountProfile {
  const method = row?.last_sign_in_method as SignInMethod | null | undefined;
  return {
    userId,
    displayName: row?.display_name ?? null,
    emailVerifiedAt: isoOrNull(row?.email_verified_at),
    phone: row?.phone_verified_at ? row.phone_e164 : null,
    phoneVerifiedAt: isoOrNull(row?.phone_verified_at),
    onboardedAt: isoOrNull(row?.onboarded_at),
    lastSignInAt: isoOrNull(row?.last_sign_in_at),
    lastSignInMethod: method && METHODS.includes(method) ? method : null,
  };
}

export async function getProfile(runner: SqlRunner, userId: string): Promise<AccountProfile> {
  return mapProfile(userId, await runner.get<ProfileRow>("SELECT * FROM {account_profiles} WHERE user_id = ?", [userId]));
}

export async function getProfiles(runner: SqlRunner, userIds: readonly string[]): Promise<Map<string, AccountProfile>> {
  const profiles = new Map<string, AccountProfile>();
  if (userIds.length === 0) return profiles;
  const rows = await runner.all<ProfileRow>(
    `SELECT * FROM {account_profiles} WHERE user_id IN (${userIds.map(() => "?").join(", ")})`,
    [...userIds],
  );
  for (const row of rows) profiles.set(row.user_id, mapProfile(row.user_id, row));
  for (const userId of userIds) if (!profiles.has(userId)) profiles.set(userId, mapProfile(userId, undefined));
  return profiles;
}

async function ensureRow(runner: SqlRunner, userId: string, now: string): Promise<void> {
  await runner.run(
    "INSERT INTO {account_profiles} (user_id, updated_at) VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING",
    [userId, now],
  );
}

export function cleanDisplayName(value: string): string | null {
  const name = value.replace(/\s+/g, " ").trim();
  return name.length >= 1 && name.length <= 80 ? name : null;
}

export async function setDisplayName(runner: SqlRunner, userId: string, displayName: string | null, now = new Date().toISOString()): Promise<void> {
  await ensureRow(runner, userId, now);
  await runner.run("UPDATE {account_profiles} SET display_name = ?, updated_at = ? WHERE user_id = ?", [displayName, now, userId]);
}

export async function markOnboarded(runner: SqlRunner, userId: string, now = new Date().toISOString()): Promise<void> {
  await ensureRow(runner, userId, now);
  await runner.run("UPDATE {account_profiles} SET onboarded_at = COALESCE(onboarded_at, ?), updated_at = ? WHERE user_id = ?", [now, now, userId]);
}

/** A code sent to the address, or Google vouching for it, proves the person can read it. A password does not. */
const PROVES_EMAIL: readonly SignInMethod[] = ["email_code", "google"];

export async function recordSignIn(runner: SqlRunner, userId: string, method: SignInMethod, now = new Date().toISOString()): Promise<void> {
  await ensureRow(runner, userId, now);
  await runner.run(
    "UPDATE {account_profiles} SET last_sign_in_at = ?, last_sign_in_method = ?, updated_at = ? WHERE user_id = ?",
    [now, method, now, userId],
  );
  if (PROVES_EMAIL.includes(method)) {
    await runner.run("UPDATE {account_profiles} SET email_verified_at = ? WHERE user_id = ?", [now, userId]);
  }
}

/** Stores a number that was just proved by a code. Returns false when another account already holds it. */
export async function setVerifiedPhone(runner: SqlRunner, userId: string, phone: string, now = new Date().toISOString()): Promise<boolean> {
  const holder = await runner.get<{ user_id: string }>("SELECT user_id FROM {account_profiles} WHERE phone_e164 = ?", [phone]);
  if (holder && holder.user_id !== userId) return false;
  await ensureRow(runner, userId, now);
  await runner.run(
    "UPDATE {account_profiles} SET phone_e164 = ?, phone_verified_at = ?, updated_at = ? WHERE user_id = ?",
    [phone, now, now, userId],
  );
  return true;
}

export async function removePhone(runner: SqlRunner, userId: string, now = new Date().toISOString()): Promise<void> {
  await runner.run(
    "UPDATE {account_profiles} SET phone_e164 = NULL, phone_verified_at = NULL, updated_at = ? WHERE user_id = ?",
    [now, userId],
  );
}

/** The company name is a column the accounts table already has. */
export async function setCompanyName(runner: SqlRunner, userId: string, companyName: string | null): Promise<void> {
  await runner.run("UPDATE {users} SET company_name = ? WHERE id = ?", [companyName, userId]);
}

export async function touchLastActivity(runner: SqlRunner, userId: string, now = new Date().toISOString()): Promise<void> {
  await runner.run("UPDATE {users} SET last_activity_at = ? WHERE id = ?", [now, userId]);
}
