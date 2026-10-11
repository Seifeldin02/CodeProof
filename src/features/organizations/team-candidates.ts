import type { CandidatePersistence } from "@/features/candidates/store";
import type { CandidateDetail } from "@/features/candidates/types";
import type { CandidateRecord } from "@/features/hiring-analytics/types";
import { listMemberViews, type MemberView, type OrganizationDependencies } from "./service";

/**
 * What an organisation's admin can read: every member's candidates.
 *
 * Candidates stay owned by the recruiter who added them. Nothing is copied or
 * shared; the admin's view asks for each member's own records in turn, so a
 * candidate that belongs to nobody in the organisation can never appear. The
 * caller must already have established that the reader is the admin.
 */

export interface TeamCandidate {
  candidate: CandidateRecord;
  recruiter: MemberView;
}

export async function listTeamCandidates(
  deps: OrganizationDependencies,
  candidates: Pick<CandidatePersistence, "listCandidates">,
  organizationId: string,
): Promise<{ members: MemberView[]; candidates: TeamCandidate[] }> {
  const members = await listMemberViews(deps, organizationId);
  const lists = await Promise.all(members.map((member) => candidates.listCandidates(member.userId)));
  const all = lists.flatMap((list, index) => list.map((candidate) => ({ candidate, recruiter: members[index] })));
  all.sort((left, right) => right.candidate.appliedAt.localeCompare(left.candidate.appliedAt) || left.candidate.id.localeCompare(right.candidate.id));
  return { members, candidates: all };
}

export async function findTeamCandidate(
  deps: OrganizationDependencies,
  candidates: Pick<CandidatePersistence, "getCandidate">,
  organizationId: string,
  candidateId: string,
): Promise<{ candidate: CandidateDetail; recruiter: MemberView } | null> {
  for (const member of await listMemberViews(deps, organizationId)) {
    const candidate = await candidates.getCandidate(member.userId, candidateId);
    if (candidate) return { candidate, recruiter: member };
  }
  return null;
}
