import { describe, expect, it } from "vitest";
import { SIGN_IN_COPY } from "@/features/auth/sign-in-copy";
import { PLANS } from "@/features/plans/catalog";
import { ACCOUNTS_AR } from "@/i18n/accounts-ar";
import { translate } from "@/i18n/translations";
import { ACCOUNTS_COPY } from "./copy";

/**
 * Wording that is looked up by a value is never written as a literal
 * `t("...")` call, so the general coverage check cannot see it. It is listed
 * here instead: error messages, labels for stored values, plan names, and the
 * navigation labels the sidebar and the top bar keep in a list.
 */
const LOOKED_UP = [
  ...ACCOUNTS_COPY,
  ...SIGN_IN_COPY,
  ...PLANS.flatMap((plan) => [plan.name, plan.summary]),
  "Team",
  "Account",
  "Owner administration",
  "Welcome",
];

/** A product name is written the same way in both languages. */
const SAME_IN_BOTH = new Set(["Google"]);

const placeholders = (text: string): string[] => (text.match(/\{[a-z]+\}/g) ?? []).sort();

describe("Arabic for accounts, organisations and owner administration", () => {
  it("covers wording that is looked up by a value", () => {
    const untranslated = [...new Set(LOOKED_UP)].filter((key) => !SAME_IN_BOTH.has(key) && translate("ar", key) === key).sort();
    expect(untranslated).toEqual([]);
  });

  it("keeps every placeholder of the English text", () => {
    for (const [key, value] of Object.entries(ACCOUNTS_AR)) expect(placeholders(value), key).toEqual(placeholders(key));
  });

  it("fills a placeholder in both languages", () => {
    expect(translate("en", "Accounts: {count}", { count: 12 })).toBe("Accounts: 12");
    expect(translate("ar", "Accounts: {count}", { count: 12 })).toBe("الحسابات: 12");
  });
});
