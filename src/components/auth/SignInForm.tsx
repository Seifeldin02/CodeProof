"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/LocaleProvider";
import type { SignInFormOptions } from "@/features/auth/options";
import { SIGN_IN_ERROR_COPY, SIGN_IN_FALLBACK_ERROR, SIGN_IN_QUERY_ERROR } from "@/features/auth/sign-in-copy";

interface Props {
  options: SignInFormOptions;
  nextPath: string;
  /** An organisation invitation the person is answering. */
  invite?: string | null;
  /** A reason carried back from a Google sign-in that did not complete. */
  initialError?: string | null;
}

interface SentCode {
  channel: "email" | "sms";
  developmentCode: string | null;
  resendAt: number;
}

type Failure = { code?: string; retryAfterSeconds?: number };

const FIELD = "mt-2 h-12 w-full rounded-lg border border-slate-200 px-3 text-start text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-50";
const PRIMARY = "flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50";
const QUIET = "min-h-11 w-full text-xs font-semibold text-slate-600 hover:text-brand-700 disabled:cursor-not-allowed disabled:text-slate-400";

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="h-[18px] w-[18px]">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

export default function SignInForm({ options, nextPath, invite = null, initialError = null }: Props) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [step, setStep] = useState<"start" | "code" | "password">(options.emailCode ? "start" : "password");
  const [registering, setRegistering] = useState(options.signup);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<SentCode | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ? t(SIGN_IN_QUERY_ERROR[initialError] ?? SIGN_IN_FALLBACK_ERROR) : null);
  const codeInput = useRef<HTMLInputElement>(null);

  // Counts down to when another code may be requested.
  useEffect(() => {
    if (!sent) return;
    const timer = window.setInterval(() => setSecondsLeft(Math.max(0, Math.ceil((sent.resendAt - Date.now()) / 1000))), 1000);
    return () => window.clearInterval(timer);
  }, [sent]);

  useEffect(() => {
    if (step === "code") codeInput.current?.focus();
  }, [step, sent]);

  function describe(failure: Failure | null): string {
    const key = SIGN_IN_ERROR_COPY[failure?.code ?? ""] ?? SIGN_IN_FALLBACK_ERROR;
    const seconds = failure?.retryAfterSeconds ?? 60;
    return t(key, { seconds, minutes: Math.max(1, Math.ceil(seconds / 60)) });
  }

  async function post(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; payload: Record<string, unknown> | null }> {
    const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: response.ok, payload };
  }

  function enter(destination: unknown): void {
    router.replace(typeof destination === "string" && destination.startsWith("/") ? destination : nextPath);
    router.refresh();
  }

  async function sendCode(channel: "email" | "sms"): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const { ok, payload } = await post("/api/auth/code/request", { email, channel, locale });
      if (!ok) {
        setError(describe((payload?.error as Failure | undefined) ?? null));
        return;
      }
      const resendAfterSeconds = Number(payload?.resendAfterSeconds ?? 60);
      setCode("");
      setSecondsLeft(resendAfterSeconds);
      setSent({
        channel: payload?.channel === "sms" ? "sms" : "email",
        developmentCode: typeof payload?.developmentCode === "string" ? payload.developmentCode : null,
        resendAt: Date.now() + resendAfterSeconds * 1000,
      });
      setStep("code");
    } catch {
      setError(t(SIGN_IN_FALLBACK_ERROR));
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { ok, payload } = await post("/api/auth/code/verify", { email, code, next: nextPath, invite });
      if (!ok) {
        setError(describe((payload?.error as Failure | undefined) ?? null));
        setBusy(false);
        return;
      }
      enter(payload?.destination);
    } catch {
      setError(t(SIGN_IN_FALLBACK_ERROR));
      setBusy(false);
    }
  }

  async function submitPassword(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { ok, payload } = await post(registering ? "/api/auth/register" : "/api/auth/login", { email, password });
      if (!ok) {
        setError(describe((payload?.error as Failure | undefined) ?? null));
        setBusy(false);
        return;
      }
      enter(payload?.destination);
    } catch {
      setError(t(SIGN_IN_FALLBACK_ERROR));
      setBusy(false);
    }
  }

  const googleHref = `/api/auth/google/start?next=${encodeURIComponent(nextPath)}${invite ? `&invite=${encodeURIComponent(invite)}` : ""}`;
  const alert = error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</div>;
  const emailField = (
    <div>
      <label htmlFor="email" className="block text-xs font-semibold text-slate-600">{t("Email")}</label>
      <input id="email" type="email" dir="ltr" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className={FIELD} />
    </div>
  );

  if (step === "code" && sent) {
    return (
      <form onSubmit={verify} className="space-y-4">
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm leading-6 text-emerald-900">
          {sent.channel === "sms"
            ? t("If this account has a verified mobile number, we texted the code to it. It works for 10 minutes.")
            : sent.developmentCode
              ? t("Development mode: no mail service is configured, so the code is shown here instead of being sent.")
              : <>{t("We sent a 6-digit code to this address. It works for 10 minutes.")} <bdi dir="ltr" className="font-semibold">{email}</bdi></>}
          {sent.developmentCode && <bdi dir="ltr" className="mt-1 block font-mono text-lg font-semibold tracking-[.3em]">{sent.developmentCode}</bdi>}
        </div>
        <div>
          <label htmlFor="code" className="block text-xs font-semibold text-slate-600">{t("6-digit code")}</label>
          <input
            id="code"
            ref={codeInput}
            dir="ltr"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 -]*"
            maxLength={8}
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className={`${FIELD} text-center font-mono text-lg tracking-[.4em]`}
          />
        </div>
        {alert}
        <button type="submit" disabled={busy} className={PRIMARY}>
          {busy && <i className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />}
          {busy ? t("Checking…") : t("Continue")}
        </button>
        <div className="grid gap-1">
          <button type="button" disabled={busy || secondsLeft > 0} onClick={() => void sendCode(sent.channel)} className={QUIET}>
            {secondsLeft > 0 ? t("Send a new code in {seconds}s", { seconds: secondsLeft }) : t("Send a new code")}
          </button>
          {options.sms && sent.channel === "email" && (
            <button type="button" disabled={busy || secondsLeft > 0} onClick={() => void sendCode("sms")} className={QUIET}>{t("Text the code to my phone instead")}</button>
          )}
          <button type="button" disabled={busy} onClick={() => { setStep("start"); setSent(null); setError(null); }} className={QUIET}>{t("Use a different email address")}</button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      {options.google && (
        <>
          <a href={googleHref} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-400 hover:bg-slate-50">
            <GoogleMark /> {t("Continue with Google")}
          </a>
          <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[.14em] text-slate-500" aria-hidden="true">
            <span className="h-px flex-1 bg-slate-200" />{t("or")}<span className="h-px flex-1 bg-slate-200" />
          </div>
        </>
      )}

      {step === "start" ? (
        <form onSubmit={(event) => { event.preventDefault(); void sendCode("email"); }} className="space-y-4">
          {emailField}
          {alert}
          <button type="submit" disabled={busy} className={PRIMARY}>
            {busy && <i className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />}
            {busy ? t("Sending…") : t("Email me a code")}
          </button>
          <p className="text-xs leading-5 text-slate-500">
            {options.signup
              ? t("No password needed. We email you a code each time you sign in, and the first code creates your account.")
              : t("No password needed. We email you a code each time you sign in.")}
          </p>
          {options.password && (
            <button type="button" onClick={() => { setStep("password"); setError(null); }} className={QUIET}>{t("Use a password instead")}</button>
          )}
        </form>
      ) : (
        <form onSubmit={submitPassword} className="space-y-4">
          {emailField}
          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-slate-600">{t("Password")}</label>
            <input
              id="password"
              type="password"
              dir="ltr"
              autoComplete={registering ? "new-password" : "current-password"}
              required
              minLength={registering ? 12 : undefined}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={FIELD}
            />
            {registering && <p className="mt-1.5 text-[11px] text-slate-500">{t("Use at least 12 characters.")}</p>}
          </div>
          {alert}
          <button type="submit" disabled={busy} className={PRIMARY}>
            {busy && <i className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />}
            {busy ? (registering ? t("Creating account…") : t("Signing in…")) : (registering ? t("Create account") : t("Sign in"))}
          </button>
          {options.signup && (
            <button type="button" onClick={() => { setRegistering(!registering); setError(null); }} className={QUIET}>
              {registering ? t("I already have an account") : t("Create an account instead")}
            </button>
          )}
          {options.emailCode && (
            <button type="button" onClick={() => { setStep("start"); setError(null); }} className={QUIET}>{t("Use a code instead")}</button>
          )}
        </form>
      )}
    </div>
  );
}
