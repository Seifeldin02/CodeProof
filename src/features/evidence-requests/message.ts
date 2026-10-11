import { translate, type Locale } from "@/i18n/translations";

/**
 * The note a recruiter sends with the link. CodeProof does not send email or
 * messages itself: the recruiter copies this text into the channel they already
 * use with the candidate, so the candidate hears from a person they know.
 *
 * The text is written in the language chosen for the candidate, which can
 * differ from the language the recruiter works in.
 */

export const EVIDENCE_MESSAGE_KEYS = {
  greeting: "Hello {name},",
  purpose: "Thank you for applying. Before interviews we look at evidence from candidates' own code.",
  invitation: "If you have public code, or other work you can link, you can share it on this private page. It explains what is read and what we see.",
  optional: "Sharing is optional. Not sharing is never counted against you.",
  validity: "The link works for {days} days and accepts one answer.",
} as const;

export function buildEvidenceRequestMessage(locale: Locale, values: { name: string; link: string; days: number }): string {
  const line = (key: keyof typeof EVIDENCE_MESSAGE_KEYS) => translate(locale, EVIDENCE_MESSAGE_KEYS[key], values);
  return [
    line("greeting"),
    "",
    `${line("purpose")} ${line("invitation")}`,
    line("optional"),
    "",
    values.link,
    "",
    line("validity"),
  ].join("\n");
}

/** Interview prompts drafted from what a CV says, for a candidate whose code could not be read. */
export const CLAIM_QUESTION_KEY = "Your CV lists {skill}. Describe one thing you built with it: which part was yours, one decision you would change, and how you tested it.";

export function claimQuestionSkills(claims: ReadonlyArray<{ claim: string; category: string }>, limit = 5): string[] {
  return claims.filter((item) => item.category === "technology").map((item) => item.claim).slice(0, limit);
}
