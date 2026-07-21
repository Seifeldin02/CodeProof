import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope, Noto_Kufi_Arabic } from "next/font/google";
import AppShell from "@/components/layout/AppShell";
import LocaleProvider from "@/components/i18n/LocaleProvider";
import { getI18n } from "@/i18n/server";
import { getCurrentUser } from "@/features/auth/session";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });
const arabic = Noto_Kufi_Arabic({ subsets: ["arabic"], variable: "--font-arabic" });

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  return locale === "ar"
    ? { title: "CodeProof | ذكاء توظيف قائم على الأدلة", description: "حوّل السير الذاتية والكود العام إلى أدلة جاهزة لمسؤول التوظيف." }
    : { title: "CodeProof | Evidence-based hiring intelligence", description: "Turn candidate CVs and public code into recruiter-ready evidence." };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [{ locale }, user] = await Promise.all([getI18n(), getCurrentUser()]);
  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className={`${manrope.variable} ${mono.variable} ${arabic.variable}`}><LocaleProvider initialLocale={locale}><AppShell user={user}>{children}</AppShell></LocaleProvider></body>
    </html>
  );
}
