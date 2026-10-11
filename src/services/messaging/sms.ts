/**
 * Outgoing text messages. Off unless a provider is configured: text messages
 * cost money per message, and nothing in the core workflow may depend on a
 * paid service. Email codes work without this.
 */

export interface SmsProvider {
  readonly name: "twilio";
  send(to: string, body: string): Promise<void>;
}

/** Carries no number, credential or provider response, so it is safe to log. */
export class SmsDeliveryError extends Error {
  constructor(readonly provider: string, readonly status: number | null) {
    super("The message could not be handed to the SMS provider.");
    this.name = "SmsDeliveryError";
  }
}

const TIMEOUT_MS = 10_000;

/** International format with a leading plus: `+9665XXXXXXXX`. */
export function normalizePhone(input: string): string | null {
  const compact = input.replace(/[\s().-]/g, "");
  const international = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
  return /^\+[1-9]\d{7,14}$/.test(international) ? international : null;
}

/** Shows only the last two digits, for confirmation messages. */
export function maskPhone(phone: string): string {
  return `${"•".repeat(Math.max(0, phone.length - 2))}${phone.slice(-2)}`;
}

export function twilioProvider(
  credentials: { accountSid: string; authToken: string; from: string },
  fetchImpl: typeof fetch = fetch,
): SmsProvider {
  // A value starting with MG is a messaging service, anything else is a sender number or name.
  const sender: Record<string, string> = credentials.from.startsWith("MG") ? { MessagingServiceSid: credentials.from } : { From: credentials.from };
  return {
    name: "twilio",
    async send(to, body) {
      let response: Response;
      try {
        response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(credentials.accountSid)}/Messages.json`, {
          method: "POST",
          headers: {
            authorization: `Basic ${Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString("base64")}`,
            "content-type": "application/x-www-form-urlencoded",
            accept: "application/json",
          },
          body: new URLSearchParams({ To: to, Body: body, ...sender }).toString(),
          signal: AbortSignal.timeout(TIMEOUT_MS),
          cache: "no-store",
        });
      } catch {
        throw new SmsDeliveryError("twilio", null);
      }
      if (!response.ok) throw new SmsDeliveryError("twilio", response.status);
    },
  };
}

type Environment = Record<string, string | undefined>;

/** The provider chosen by the environment, or null. All three Twilio values are needed. */
export function configuredSmsProvider(env: Environment = process.env, fetchImpl: typeof fetch = fetch): SmsProvider | null {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  const from = env.TWILIO_FROM?.trim();
  if (!accountSid || !authToken || !from) return null;
  return twilioProvider({ accountSid, authToken, from }, fetchImpl);
}
