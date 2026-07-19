"use client";

import { createContext, useCallback, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { translate, type Locale, type TranslationValues } from "@/i18n/translations";

interface LocaleContextValue {
  locale: Locale;
  direction: "ltr" | "rtl";
  isPending: boolean;
  setLocale: (locale: Locale) => void;
  t: (key: string, values?: TranslationValues) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export default function LocaleProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const router = useRouter();
  const [locale, setLocaleState] = useState(initialLocale);
  const [isPending, startTransition] = useTransition();

  const persist = useCallback((nextLocale: Locale, refresh: boolean) => {
    document.cookie = `codeproof-locale=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    localStorage.setItem("codeproof-locale", nextLocale);
    document.documentElement.lang = nextLocale;
    document.documentElement.dir = nextLocale === "ar" ? "rtl" : "ltr";
    setLocaleState(nextLocale);
    if (refresh) startTransition(() => router.refresh());
  }, [router]);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    direction: locale === "ar" ? "rtl" : "ltr",
    isPending,
    setLocale: (nextLocale) => persist(nextLocale, true),
    t: (key, values) => translate(locale, key, values),
  }), [isPending, locale, persist]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useI18n must be used inside LocaleProvider");
  return context;
}
