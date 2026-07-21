"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/LocaleProvider";

/** Server error codes mapped to translatable copy, so nothing leaks untranslated. */
const ERROR_COPY: Record<string, string> = {
  INVALID_INPUT: "Provide an email and password.",
  INVALID_CREDENTIALS: "Incorrect email or password.",
  REGISTRATION_CLOSED: "This workspace already has an owner. Ask them for an account.",
  INVALID_EMAIL: "Enter a valid email address.",
  WEAK_PASSWORD: "Use at least 12 characters.",
  EMAIL_TAKEN: "That email already has an account.",
  RATE_LIMITED: "Too many attempts. Try again later.",
};

export default function SignInForm({ canRegister, nextPath }: { canRegister: boolean; nextPath: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [mode, setMode] = useState<"signin" | "register">(canRegister ? "register" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registering = mode === "register";

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(registering ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
        const code = payload?.error?.code ?? "";
        setError(t(ERROR_COPY[code] ?? "Something went wrong. Try again."));
        setBusy(false);
        return;
      }
      router.replace(nextPath);
      router.refresh();
    } catch {
      setError(t("Something went wrong. Try again."));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-xs font-semibold text-slate-600">
          {t("Email")}
        </label>
        <input
          id="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-2 h-12 w-full rounded-lg border border-slate-200 px-3 text-start text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-xs font-semibold text-slate-600">
          {t("Password")}
        </label>
        <input
          id="password"
          type="password"
          dir="ltr"
          autoComplete={registering ? "new-password" : "current-password"}
          required
          minLength={registering ? 12 : undefined}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-2 h-12 w-full rounded-lg border border-slate-200 px-3 text-start text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
        />
        {registering && <p className="mt-1.5 text-[11px] text-slate-400">{t("Use at least 12 characters.")}</p>}
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy && <i className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />}
        {busy
          ? t(registering ? "Creating account…" : "Signing in…")
          : t(registering ? "Create account" : "Sign in")}
      </button>

      {canRegister && (
        <button
          type="button"
          onClick={() => { setMode(registering ? "signin" : "register"); setError(null); }}
          className="min-h-11 w-full text-xs font-semibold text-slate-500 hover:text-brand-700"
        >
          {t(registering ? "I already have an account" : "Create an account instead")}
        </button>
      )}
    </form>
  );
}
