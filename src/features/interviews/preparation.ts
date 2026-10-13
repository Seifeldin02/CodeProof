import { createHash } from "node:crypto";
import type { CandidateDetail } from "@/features/candidates/types";
import type { CompanyRequirement } from "@/features/requirements/store";
import { resolveCapabilityAlias } from "@/features/repository-analysis/capability-taxonomy";
import { blankQualityChecks, type InterviewAssessment, type InterviewPreparation } from "./contracts";

function includesToken(text: string, token: string): boolean {
  const normalized = text.toLowerCase();
  const needle = token.toLowerCase();
  const position = normalized.indexOf(needle);
  if (position < 0) return false;
  return !/[\p{L}\p{N}]/u.test(normalized[position - 1] ?? "")
    && !/[\p{L}\p{N}]/u.test(normalized[position + needle.length] ?? "");
}

/**
 * Builds an interview plan from saved role requirements. A source is context to discuss, never proof of authorship.
 * `statedOnCv` gives, for each requirement id, the CV's own words for it; the CV is the candidate's account, to be explored.
 */
export function prepareInterview(
  candidate: CandidateDetail,
  roleTitle: string,
  requirements: CompanyRequirement[],
  statedOnCv: ReadonlyMap<string, string[]> = new Map(),
): InterviewPreparation {
  return {
    version: "1.0",
    candidateName: candidate.name,
    candidateRole: candidate.role,
    roleTitle,
    requirementsHash: createHash("sha256").update(JSON.stringify({ roleTitle, requirements })).digest("hex"),
    analysisVersionIds: candidate.analyses.map((analysis) => analysis.result.metadata.analysisId).filter((id): id is string => typeof id === "string" && Boolean(id)),
    criteria: requirements.map((requirement) => {
      const sources = candidate.analyses.flatMap((analysis) => {
        const bundle = analysis.result.canonicalEvidence;
        if (!bundle) return [];
        const matchingCapabilities = new Set(analysis.result.skills
          .filter((skill) => includesToken(requirement.requirement, skill.skill))
          .flatMap((skill) => {
            const capability = resolveCapabilityAlias(skill.skill, bundle.taxonomyVersion);
            return capability ? [capability.id] : [];
          }));
        const direct = resolveCapabilityAlias(requirement.requirement, bundle.taxonomyVersion);
        if (direct) matchingCapabilities.add(direct.id);
        const findingIds = new Set(bundle.findings.filter((finding) => matchingCapabilities.has(finding.capabilityId)).map((finding) => finding.id));
        return bundle.citations.filter((citation) => findingIds.has(citation.findingId)).slice(0, 2).map((citation) => ({
          citationId: citation.id,
          filePath: citation.filePath,
          sourceLink: citation.sourceLink,
          attributionStatus: citation.attributionStatus,
          discoveryOrigin: citation.discoveryOrigin,
          evidenceLevel: citation.evidenceLevel,
        }));
      }).slice(0, 3);
      const statedAs = statedOnCv.get(requirement.id) ?? [];
      const stated = statedAs.join(", ");
      const inOwnWords = statedAs.length === 1 && statedAs[0].toLowerCase() === requirement.requirement.toLowerCase();
      const question = sources.length ? {
        en: `For “${requirement.requirement}”, first explain your relationship to the cited work. Walk through one implementation decision, a failure case, and how you tested it. What would you change for this role?`,
        ar: `بالنسبة إلى «${requirement.requirement}»، وضّح أولاً علاقتك بالعمل المشار إليه. اشرح قراراً تنفيذياً وحالة فشل وكيف اختبرته. ما الذي ستغيّره لهذه الوظيفة؟`,
      } : stated ? {
        // The CV is taken at its word and then explored: a specific project, the candidate's own part, and how they know it worked.
        en: `${inOwnWords ? `Your CV names “${requirement.requirement}”.` : `Your CV names ${stated}, and this role asks for “${requirement.requirement}”.`} Pick one project that shows it. What did you personally build, what failed or surprised you, and how did you check the result? You can describe private work without sharing confidential code.`,
        ar: `${inOwnWords ? `تذكر سيرتك الذاتية «${requirement.requirement}».` : `تذكر سيرتك الذاتية ${stated}، وهذه الوظيفة تطلب «${requirement.requirement}».`} اختر مشروعاً واحداً يبيّن ذلك. ماذا بنيت بنفسك، وما الذي تعطّل أو فاجأك، وكيف تحققت من النتيجة؟ يمكنك وصف عمل خاص دون مشاركة كود سري.`,
      } : {
        en: `We do not have public-code evidence for “${requirement.requirement}”. Describe a relevant project or work example you can discuss without sharing confidential code. What did you personally do, and how did you validate the result?`,
        ar: `لا تتوفر لدينا أدلة من الكود العام على «${requirement.requirement}». صف مشروعاً أو مثالاً عملياً يمكنك مناقشته دون مشاركة كود سري. ماذا فعلت شخصياً وكيف تحققت من النتيجة؟`,
      };
      return { id: requirement.id, requirement: requirement.requirement, importance: requirement.importance, sources, question };
    }),
  };
}

export function blankAssessment(preparation: InterviewPreparation): InterviewAssessment {
  return {
    ratings: preparation.criteria.map((criterion) => ({ criterionId: criterion.id, rating: "unassessed", observation: "", qualityChecks: blankQualityChecks() })),
    decision: null, rationale: "", nextAction: "", followUpOn: null, candidateMessage: "",
  };
}
