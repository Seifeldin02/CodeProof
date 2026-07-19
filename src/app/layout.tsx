import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import AppShell from "@/components/layout/AppShell";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "CodeProof | Evidence-based hiring intelligence",
  description: "Turn candidate CVs and public code into recruiter-ready evidence.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${mono.variable}`}><AppShell>{children}</AppShell></body>
    </html>
  );
}
