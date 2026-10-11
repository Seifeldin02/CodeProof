import { configuredMailProvider } from "@/services/messaging/mail";
import { configuredSmsProvider } from "@/services/messaging/sms";
import { signupAllowed } from "./store";

/**
 * Which ways of signing in this deployment offers.
 *
 * Nothing here is required. With no mail provider, Google client or SMS
 * provider configured, the product signs people in with a password exactly as
 * before, so the core workflow needs no outside service.
 */
export interface SignInOptions {
  /** A six-digit code sent to the email address. */
  emailCode: boolean;
  /** `provider` sends real mail; `development` shows the code on screen and never runs in production. */
  emailCodeMode: "provider" | "development" | "off";
  google: boolean;
  /** A code sent by text message to a verified mobile number. Needs a paid provider. */
  sms: boolean;
  /** Email and password. The fallback while no code can be delivered. */
  password: boolean;
  signup: boolean;
}

type Environment = Record<string, string | undefined>;

/** What the sign-in form needs to know. Nothing here is secret. */
export interface SignInFormOptions {
  emailCode: boolean;
  development: boolean;
  google: boolean;
  sms: boolean;
  password: boolean;
  signup: boolean;
}

export function signInFormOptions(env: Environment = process.env): SignInFormOptions {
  const options = signInOptions(env);
  return {
    emailCode: options.emailCode,
    development: options.emailCodeMode === "development",
    google: options.google,
    sms: options.sms,
    password: options.password,
    signup: options.signup,
  };
}

export function googleClient(env: Environment = process.env): { clientId: string; clientSecret: string } | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function signInOptions(env: Environment = process.env): SignInOptions {
  const emailCodeMode: SignInOptions["emailCodeMode"] = configuredMailProvider(env)
    ? "provider"
    : env.NODE_ENV === "development" ? "development" : "off";
  const emailCode = emailCodeMode !== "off";
  // Passwords step aside once a mail provider can deliver codes. Showing the
  // code on screen in development is not delivery, so both ways in stay there.
  // An operator can force either behaviour, for example during a mail outage.
  const forced = env.CODEPROOF_PASSWORD_SIGN_IN?.trim().toLowerCase();
  const password = forced === "true" ? true : forced === "false" ? false : emailCodeMode !== "provider";
  return {
    emailCode,
    emailCodeMode,
    google: googleClient(env) !== null,
    sms: emailCode && configuredSmsProvider(env) !== null,
    password,
    signup: signupAllowed(),
  };
}
