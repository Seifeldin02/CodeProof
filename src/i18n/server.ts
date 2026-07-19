import { cookies } from "next/headers";
import { isLocale, translate, type Locale, type TranslationValues } from "./translations";

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get("codeproof-locale")?.value;
  return isLocale(value) ? value : "en";
}

export async function getI18n(): Promise<{ locale: Locale; t: (key: string, values?: TranslationValues) => string }> {
  const locale = await getLocale();
  return { locale, t: (key, values) => translate(locale, key, values) };
}
