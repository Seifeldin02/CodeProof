import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import type { Locale, TranslationValues } from "@/i18n/translations";
import type { ExtractedResumeClaim, ResumeExperiencePeriod } from "@/types/analysis";

type Translate = (key: string, values?: TranslationValues) => string;
type Entry = ExtractedResumeClaim & { period: ResumeExperiencePeriod };

/** "2021" or "2021-03", written the way the reader's language writes a year or a month. */
function formatPoint(locale: Locale, value: string): string {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", month ? { year: "numeric", month: "short", timeZone: "UTC" } : { year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, (month ?? 1) - 1, 1)));
}

/** The dated entries of a CV in the order the CV implies, newest first. Candidate-reported throughout. */
export default function ExperienceTimeline({ t, locale, entries }: { t: Translate; locale: Locale; entries: Entry[] }) {
  return (
    <Card title={t("Experience stated on the CV")} subtitle={t("Dates and titles as the CV gives them. Candidate-reported, not verified.")}>
      <ol className="relative space-y-4 border-s border-slate-200 ps-5">
        {entries.map((entry) => (
          <li key={`${entry.period.start}:${entry.claim}`} className="relative min-w-0">
            <span aria-hidden="true" className={`absolute -start-[25px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${entry.period.end === null ? "bg-brand-600" : "bg-slate-300"}`} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="tnum text-xs font-semibold text-slate-500">{formatPoint(locale, entry.period.start)} – {entry.period.end === null ? t("Present") : formatPoint(locale, entry.period.end)}</span>
              <Badge tone={entry.period.kind === "education" ? "neutral" : "brand"}>{entry.period.kind === "education" ? t("Education") : t("Work")}</Badge>
            </div>
            <p className="mt-1 break-words text-sm font-medium text-slate-900"><bdi>{entry.claim}</bdi></p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
