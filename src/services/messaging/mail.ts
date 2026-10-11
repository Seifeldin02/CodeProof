/**
 * Outgoing email, through whichever provider the deployment configured.
 *
 * No provider is required: without one the product falls back to password
 * sign-in, so the core workflow keeps working with no outside service. Each
 * provider is a plain HTTPS call, so no SDK is installed.
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface MailProvider {
  readonly name: "resend" | "brevo";
  send(message: MailMessage): Promise<void>;
}

/** Carries no address, key or provider response, so it is safe to log. */
export class MailDeliveryError extends Error {
  constructor(readonly provider: string, readonly status: number | null) {
    super("The message could not be handed to the mail provider.");
    this.name = "MailDeliveryError";
  }
}

const TIMEOUT_MS = 10_000;

/** `Name <address@example.com>` or a bare address. */
export function parseSender(value: string): { name: string | null; email: string } | null {
  const trimmed = value.trim();
  const named = trimmed.match(/^(.*)<([^<>\s]+@[^<>\s]+)>$/);
  const email = (named ? named[2] : trimmed).trim();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return null;
  const name = named?.[1].trim().replace(/^"|"$/g, "") || null;
  return { name, email };
}

async function post(provider: MailProvider["name"], fetchImpl: typeof fetch, url: string, headers: Record<string, string>, body: unknown): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new MailDeliveryError(provider, null);
  }
  if (!response.ok) throw new MailDeliveryError(provider, response.status);
}

export function resendProvider(apiKey: string, from: string, fetchImpl: typeof fetch = fetch): MailProvider {
  return {
    name: "resend",
    send: (message) => post("resend", fetchImpl, "https://api.resend.com/emails", { authorization: `Bearer ${apiKey}` }, {
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  };
}

export function brevoProvider(apiKey: string, sender: { name: string | null; email: string }, fetchImpl: typeof fetch = fetch): MailProvider {
  return {
    name: "brevo",
    send: (message) => post("brevo", fetchImpl, "https://api.brevo.com/v3/smtp/email", { "api-key": apiKey }, {
      sender: sender.name ? { name: sender.name, email: sender.email } : { email: sender.email },
      to: [{ email: message.to }],
      subject: message.subject,
      textContent: message.text,
      htmlContent: message.html,
    }),
  };
}

type Environment = Record<string, string | undefined>;

/**
 * The provider chosen by the environment, or null when none is set up.
 * `CODEPROOF_MAIL_FROM` is the sender; `RESEND_API_KEY` or `BREVO_API_KEY`
 * selects the provider.
 */
export function configuredMailProvider(env: Environment = process.env, fetchImpl: typeof fetch = fetch): MailProvider | null {
  const from = env.CODEPROOF_MAIL_FROM?.trim();
  const sender = from ? parseSender(from) : null;
  if (!from || !sender) return null;
  const resendKey = env.RESEND_API_KEY?.trim();
  if (resendKey) return resendProvider(resendKey, from, fetchImpl);
  const brevoKey = env.BREVO_API_KEY?.trim();
  if (brevoKey) return brevoProvider(brevoKey, sender, fetchImpl);
  return null;
}
