/**
 * Wording for sign-in failures, kept in one place so the server's error codes
 * never reach the screen untranslated. Every value is a translation key.
 */

/** Error codes returned by the sign-in routes. */
export const SIGN_IN_ERROR_COPY: Record<string, string> = {
  INVALID_INPUT: "Provide an email and password.",
  INVALID_CREDENTIALS: "Incorrect email or password.",
  REGISTRATION_CLOSED: "This workspace already has an owner. Ask them for an account.",
  INVALID_EMAIL: "Enter a valid email address.",
  WEAK_PASSWORD: "Use at least 12 characters.",
  EMAIL_TAKEN: "That email already has an account.",
  RATE_LIMITED: "Too many attempts. Try again later.",
  SESSION_NOT_CONFIGURED: "Sign-in is temporarily unavailable: the server is missing its session configuration.",
  INVALID_CODE: "That code is not right or has expired. Check it, or send a new one.",
  CODE_RECENTLY_SENT: "A code was just sent. Wait {seconds} seconds before asking for another.",
  TOO_MANY_CODES: "Too many codes were requested for this address. Try again in {minutes} minutes.",
  DELIVERY_FAILED: "We could not send the code. Try again in a moment.",
  CODE_SIGN_IN_UNAVAILABLE: "Sign-in codes are not available right now.",
  ACCOUNT_UNAVAILABLE: "This account is not available. Contact support.",
  PASSWORD_SIGN_IN_DISABLED: "Sign in with a code sent to your email address.",
};

/** Reasons carried in the address after a Google sign-in that did not complete. */
export const SIGN_IN_QUERY_ERROR: Record<string, string> = {
  google_unavailable: "Google sign-in is not set up on this site.",
  google_cancelled: "Google sign-in was cancelled.",
  google_failed: "Google sign-in did not complete. Try again.",
  account_unavailable: "This account is not available. Contact support.",
  registration_closed: "This workspace already has an owner. Ask them for an account.",
  rate_limited: "Too many attempts. Try again later.",
};

export const SIGN_IN_FALLBACK_ERROR = "Something went wrong. Try again.";

/** Every key above, for the translation coverage check. */
export const SIGN_IN_COPY: string[] = [...Object.values(SIGN_IN_ERROR_COPY), ...Object.values(SIGN_IN_QUERY_ERROR), SIGN_IN_FALLBACK_ERROR];
