import type { ManipulationCheckId } from "./manipulation-checks";

/** What each manipulation check tried, in a recruiter's words. Every string is a translation key. */
export const CHECK_LABEL: Record<ManipulationCheckId, string> = {
  cv_wording_adds_no_evidence: "A CV stuffed with keywords and instructions adds no evidence.",
  cv_keywords_do_not_move_the_order: "A CV that lists more technologies does not move its owner up the review order.",
  readme_instructions_are_ignored: "A README that tells the reader to rate the code highly changes no evidence level.",
  unused_dependency_stays_limited: "A tool that is only listed as a dependency stays at limited evidence.",
  unrelated_files_do_not_count_for_a_tool: "Files that do not use a tool are not counted as evidence for it.",
  named_repository_is_unchecked: "A repository named on a CV is labelled as unchecked until the candidate proves the account is theirs.",
  no_code_is_unknown: "A candidate with no code read is listed as unknown, with no negative mark.",
};

/** Every key above, for the translation coverage check. */
export const TRUST_WORDING: string[] = Object.values(CHECK_LABEL);
