import type { ExtractedResumeClaim, ResumeExperiencePeriod } from "@/types/analysis";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const YEAR = "(?:19[7-9]\\d|20\\d{2})";
/** A point in time as CVs write it: "March 2021", "Mar. 2021", "03/2021" or "2021". */
const POINT = `(?:(${MONTH})\\.?,?\\s+(${YEAR})|(\\d{1,2})[/.](${YEAR})|(${YEAR}))`;
const ONGOING = "(present|current|now|today|ongoing|to date)";
const RANGE = new RegExp(`${POINT}\\s*(?:-|–|—|to|until|till)\\s*(?:${POINT}|${ONGOING})`, "i");
const EDUCATION = /\b(university|college|bachelor|master|b\.?\s?sc|m\.?\s?sc|b\.?\s?eng|ph\.?\s?d|degree|diploma|school|institute|academy|bootcamp|faculty)\b/i;

const MAX_ENTRIES = 8;
const MAX_TITLE = 120;

/** "2021-03" when the CV gives a month, "2021" when it gives only a year. */
function point(month: string | undefined, monthYear: string | undefined, digits: string | undefined, digitsYear: string | undefined, year: string | undefined): string | null {
  if (month && monthYear) return `${monthYear}-${String(MONTHS.indexOf(month.slice(0, 3).toLowerCase()) + 1).padStart(2, "0")}`;
  if (digits && digitsYear) {
    const number = Number(digits);
    return number >= 1 && number <= 12 ? `${digitsYear}-${String(number).padStart(2, "0")}` : null;
  }
  return year ?? null;
}

function title(text: string): string {
  return text
    .replace(/^[\s\-–—*•·|,;:()[\]]+|[\s\-–—*•·|,;:()[\]]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,;])/g, "$1")
    .slice(0, MAX_TITLE)
    .trim();
}

const hasLetters = (text: string): boolean => (text.match(/\p{L}/gu) ?? []).length >= 3;

/**
 * The dated lines of a CV, as the candidate wrote them: a job or a course, and when.
 *
 * Nothing is inferred. A line counts only when it carries a date range, the title is
 * the CV's own wording, and every entry stays a candidate-reported claim.
 */
export function extractExperienceTimeline(text: string): ExtractedResumeClaim[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const entries: Array<{ claim: string; period: ResumeExperiencePeriod }> = [];
  lines.forEach((line, index) => {
    // A link or an address can hold two years side by side without being a period of work.
    if (line.length > 200 || /https?:\/\/|www\.|@/i.test(line)) return;
    const match = RANGE.exec(line);
    if (!match) return;
    const start = point(match[1], match[2], match[3], match[4], match[5]);
    const end = match[11] ? null : point(match[6], match[7], match[8], match[9], match[10]);
    if (!start || (end !== null && end < start) || (!match[11] && !end)) return;

    // The title is the rest of the dated line. A line that holds only dates takes its title from the line above, or the one below.
    const rest = title(line.replace(match[0], " "));
    const neighbour = (offset: number): string => {
      const other = lines[index + offset] ?? "";
      return other.length <= MAX_TITLE + 40 && !RANGE.test(other) ? title(other) : "";
    };
    const claim = hasLetters(rest) ? rest : [neighbour(-1), neighbour(1)].find(hasLetters) ?? "";
    if (!hasLetters(claim)) return;
    const kind = EDUCATION.test(`${claim} ${hasLetters(rest) ? "" : neighbour(1)}`) ? "education" : "work";
    entries.push({ claim, period: { start, end, kind } });
  });

  return entries
    .filter((entry, index, all) => all.findIndex((other) => other.claim.toLowerCase() === entry.claim.toLowerCase() && other.period.start === entry.period.start) === index)
    // Newest first: what is still going on, then by when it ended, then by when it began.
    .sort((left, right) => (right.period.end ?? "9999").localeCompare(left.period.end ?? "9999") || right.period.start.localeCompare(left.period.start))
    .slice(0, MAX_ENTRIES)
    .map((entry) => ({ claim: entry.claim, category: "experience" as const, source: "Candidate Claim" as const, period: entry.period }));
}

/** The dated entries among a candidate's saved CV claims, newest first as they were saved. */
export function timelineOf(claims: ExtractedResumeClaim[]): Array<ExtractedResumeClaim & { period: ResumeExperiencePeriod }> {
  return claims.filter((claim): claim is ExtractedResumeClaim & { period: ResumeExperiencePeriod } => Boolean(claim.period));
}

/** The saved CV claims that are statements, not dated entries. */
export function statementsOf(claims: ExtractedResumeClaim[]): ExtractedResumeClaim[] {
  return claims.filter((claim) => !claim.period);
}
