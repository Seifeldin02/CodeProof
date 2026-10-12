import { skillsIn } from "@/features/resume-matching/skills";

export type BriefImportance = "required" | "preferred" | "context";

export interface BriefSkill {
  name: string;
  importance: BriefImportance;
}

export interface JobBriefReading {
  /** The skills the brief names, in the order it names them. */
  skills: BriefSkill[];
  /** The most years of experience the brief asks for, or null when it asks for none. */
  minimumYears: number | null;
  /** Sentences about years, degrees, languages and ways of working. A person has to assess these. */
  humanReview: string[];
}

const REQUIRED_HEADING = /^(?:(?:job|role|position|technical|tech|minimum|basic|key|core|essential|mandatory|required|must[\s-]*have|hard|professional)\s+)*(?:requirements?|qualifications?|skills?|must[\s-]*haves?|essentials?|required|experience|expertise|competenc(?:y|ies))(?:\s+(?:and|&)\s+(?:experience|qualifications?|skills?|requirements?|expertise))?(?:\s+(?:required|needed))?$|^what\s+(?:you(?:['’]ll|\s+will)?\s+(?:need|bring|have)|we(?:['’]re|\s+are)\s+looking\s+for|we\s+need|you\s+should\s+have)$|^(?:other|additional|general|specific)\s+requirements?$|^(?:who\s+you\s+are|about\s+you|you\s+(?:have|bring|are)|your\s+(?:profile|skills|background|experience|qualifications))$|^(?:المتطلبات(?:\s+(?:الأساسية|الوظيفية|الفنية|التقنية))?|متطلبات\s+الوظيفة|المؤهلات(?:\s+(?:المطلوبة|الأساسية))?|الشروط|المهارات(?:\s+(?:المطلوبة|الأساسية|التقنية|الفنية))?|الخبرات?(?:\s+المطلوبة)?|مطلوب)$/i;
const PREFERRED_HEADING = /^(?:(?:nice|good)[\s-]*to[\s-]*haves?|preferred|desired|desirable|optional|bonus|extra)(?:\s+(?:skills?|qualifications?|experience|requirements?|points?))?$|^(?:pluses|plus|what\s+would\s+be\s+(?:nice|great)|we(?:['’]d|\s+would)\s+love(?:\s+it)?\s+if(?:\s+you\s+have)?)$|^(?:يفضل|يُفضل|يفضّل|المؤهلات\s+المفضلة|المهارات\s+(?:المفضلة|الإضافية)|مهارات\s+إضافية|ميزات\s+إضافية|ميزة\s+إضافية|اختياري)$/i;
const CONTEXT_HEADING = /^(?:(?:key|main|your|core|job|role|primary|day[\s-]*to[\s-]*day)\s+)*(?:responsibilities|duties|tasks|accountabilities)$|^what\s+you(?:['’]ll|\s+will)\s+(?:do|be\s+doing|work\s+on)$|^about\s+(?:us|the\s+(?:role|company|team|job|position|opportunity))$|^(?:the\s+role|role\s+overview|overview|summary|job\s+(?:description|summary|purpose)|description|benefits|perks|what\s+we\s+offer|we\s+offer|why\s+(?:join\s+)?us|how\s+to\s+apply|location|salary|compensation|company|who\s+we\s+are|our\s+(?:stack|tech(?:nology)?\s+stack|team|company|mission|values)|tech(?:nology)?\s+stack|technologies|tools|stack)$|^(?:المسؤوليات|المهام(?:\s+الوظيفية)?|الوصف\s+الوظيفي|وصف\s+الوظيفة|عن\s+(?:الشركة|الوظيفة|الفريق)|نبذة(?:\s+عن\s+(?:الشركة|الوظيفة))?|المزايا|ما\s+نقدمه|الموقع|الراتب)$/i;

const REQUIRED_MARK = /\b(?:required|requires?|requirements?|must|needs?|needed|essential|mandatory|minimum|at\s+least)\b|مطلوب|يشترط|يجب|ضروري|إلزامي|لا\s+تقل/i;
const PREFERRED_MARK = /\b(?:preferred|preferably|(?:nice|good)[\s-]*to[\s-]*have|bonus|ideally|desirable|desired|advantage(?:ous)?|optional(?:ly)?|(?:a|big|huge|definite|strong|real)\s+plus)\b|يفضل|يُفضل|يفضّل|ميزة|مفضل|اختياري/i;
/** Wording that expects a skill without calling it mandatory. It decides only where no heading and no clearer wording does. */
const EXPECTED_MARK = /\b(?:proficien\w*|experience\s+(?:with|in)|strong|solid|hands[\s-]*on|expert\w*|deep\s+(?:knowledge|understanding)|fluent\s+in)\b|خبرة\s+في|إتقان|إجادة/i;

const HUMAN_REVIEW = /\b(?:\d{1,2}\s*\+?\s*(?:years?|yrs?)|degree|bachelor(?:['’]s)?|master(?:['’]s)?|b\.?sc|m\.?sc|ph\.?d|diploma|certifi\w+|leadership|mentor\w*|communication|english|arabic|fluen\w+|team\s*work|stakeholders?)\b|سنوات|سنة|بكالوريوس|ماجستير|شهادة|قياد|تواصل|اللغة/i;

const RANGE = "(\\d{1,2})\\s*\\+?\\s*(?:(?:-|–|—|to)\\s*\\d{1,2}\\s*\\+?\\s*)?";
const UNIT = "(?:years?|yrs?)\\b(?!\\s+(?:old|of\\s+age))";
/** A figure counts only where the brief ties it to experience, so "10 years in business" is not an ask. */
const YEAR_ASKS = [
  new RegExp(`${RANGE}${UNIT}[^.;\\n\\d]{0,40}?\\b(?:experience|exp)\\b`, "gi"),
  new RegExp(`\\b(?:experience|exp)\\b[^.;\\n\\d]{0,30}?${RANGE}${UNIT}`, "gi"),
  new RegExp(`\\b(?:at\\s+least|minimum(?:\\s+of)?|min\\.?|over|more\\s+than)\\s+${RANGE}${UNIT}`, "gi"),
  new RegExp(`(\\d{1,2})\\s*\\+\\s*${UNIT}`, "gi"),
  /(\d{1,2})\s*(?:years?|yrs?)\s*\+/gi,
  /خبرة[^.؛\n\d]{0,40}?(\d{1,2})\s*\+?\s*(?:سنوات|سنة|سنين|أعوام|عام)/g,
  /(\d{1,2})\s*\+?\s*(?:سنوات|سنة|سنين|أعوام|عام)[^.؛\n\d]{0,40}?خبرة/g,
];

const RANK: Record<BriefImportance, number> = { required: 2, preferred: 1, context: 0 };

export function strongerImportance(left: BriefImportance | undefined, right: BriefImportance): BriefImportance {
  return left && RANK[left] > RANK[right] ? left : right;
}

function headingOf(text: string): BriefImportance | null {
  const head = text.trim();
  if (!head || head.length > 60) return null;
  return REQUIRED_HEADING.test(head) ? "required" : PREFERRED_HEADING.test(head) ? "preferred" : CONTEXT_HEADING.test(head) ? "context" : null;
}

/** What a phrase says about itself. Null when it says nothing; "context" when it says both and needs a person to interpret. */
function markOf(text: string): BriefImportance | null {
  const required = REQUIRED_MARK.test(text);
  const preferred = PREFERRED_MARK.test(text);
  return required && preferred ? "context" : required ? "required" : preferred ? "preferred" : null;
}

/** A sentence that marks one skill as required and another as preferred is read phrase by phrase. */
function phrasesOf(clause: string): string[] {
  return REQUIRED_MARK.test(clause) && PREFERRED_MARK.test(clause)
    ? clause.split(/,|،|\s+(?:and|but|while|whereas|however)\s+|\s+و(?=يفضل|يُفضل|يفضّل|يشترط|يجب)/i).filter((part) => part.trim())
    : [clause];
}

function minimumYearsIn(text: string): number | null {
  const western = text.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  let most: number | null = null;
  for (const ask of YEAR_ASKS) {
    for (const found of western.matchAll(ask)) {
      const years = Number(found[1]);
      if (years >= 1 && years <= 30 && (most === null || years > most)) most = years;
    }
  }
  return most;
}

/**
 * Reads a job brief the way a recruiter writes one: a heading such as "Requirements" or "Nice to have" applies to
 * the lines under it, and a line's own wording ("must", "is a plus") applies to that line only.
 */
export function readJobBrief(text: string): JobBriefReading {
  const found = new Map<string, BriefImportance>();
  const humanReview = new Set<string>();
  let section: BriefImportance | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^[\s>#*•·▪◦○●■□–—-]+/, "").replace(/^\(?\d{1,2}[.)]\s+/, "").replace(/[*`]+/g, "").trim();
    if (!line) continue;
    const colon = line.search(/[:：]/);
    const head = colon >= 0 ? line.slice(0, colon) : line;
    let body = colon >= 0 ? line.slice(colon + 1).trim() : "";
    let heading = headingOf(head);
    // "You must have:" and "Bonus if you know:" are headings too, though no list could name every one. The noun
    // "requirements" alone decides nothing here: "Company requirements:" can head a list that marks each line itself.
    if (!heading && colon >= 0 && !body && head.trim().split(/\s+/).length <= 8 && skillsIn(head).length === 0) heading = markOf(head.replace(/\brequirements?\b/gi, ""));
    let inherited = section;
    if (heading) {
      // A heading on a line of its own covers the lines under it; one followed by text covers that text only.
      if (!body) { section = heading; continue; }
      inherited = heading;
    } else body = line;
    // A full stop ends a clause only before a space or the end of a line, so "Next.js" and "Node.js" stay whole.
    for (const clause of body.split(/[;!?؛؟]+|\.(?=\s|$)/).map((part) => part.trim()).filter(Boolean)) {
      if (HUMAN_REVIEW.test(clause)) humanReview.add(clause.slice(0, 180));
      const phrases = phrasesOf(clause);
      const marks = phrases.map(markOf);
      phrases.forEach((phrase, index) => {
        // A phrase that says nothing about itself takes after the marked phrase before it, or else the one after it.
        const importance = marks[index] ?? marks.slice(0, index).reverse().find((mark) => mark !== null)
          ?? marks.slice(index + 1).find((mark) => mark !== null) ?? inherited ?? (EXPECTED_MARK.test(phrase) ? "required" : "context");
        for (const name of skillsIn(phrase)) found.set(name, strongerImportance(found.get(name), importance));
      });
    }
  }
  return {
    skills: [...found].map(([name, importance]) => ({ name, importance })),
    minimumYears: minimumYearsIn(text),
    humanReview: [...humanReview],
  };
}
