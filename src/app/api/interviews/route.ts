import { authenticateRequest, denyCrossOrigin } from "@/features/auth/guard";
import { getCandidateStore } from "@/features/candidates/store";
import { getRequirementsStore } from "@/features/requirements/store";
import { CreateInterviewSchema } from "@/features/interviews/contracts";
import { prepareInterview } from "@/features/interviews/preparation";
import { getInterviewStore } from "@/features/interviews/store";
import { evaluateCandidateForRole } from "@/features/shortlists/evaluate";
import { getCandidateResumeStore } from "@/features/shortlists/resume-store";
import { getRoleStore } from "@/features/shortlists/store";
import type { CompanyRequirement } from "@/features/requirements/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await authenticateRequest(); if (user instanceof Response) return user;
  if (user.lifecycleState !== "active") return Response.json({ error: { code: "ACCOUNT_UNAVAILABLE" } }, { status: 403 });
  return Response.json({ sessions: await getInterviewStore().list(user.id) });
}
export async function POST(request: Request) {
  const denied = denyCrossOrigin(request); if (denied) return denied;
  const user = await authenticateRequest(); if (user instanceof Response) return user;
  if (user.lifecycleState !== "active") return Response.json({ error: { code: "ACCOUNT_UNAVAILABLE" } }, { status: 403 });
  const input = CreateInterviewSchema.safeParse(await request.json().catch(() => null));
  if (!input.success || new Set(input.data.criterionIds).size !== input.data.criterionIds.length) return Response.json({ error: { code: "INVALID_INPUT" } }, { status: 400 });
  const candidate = await getCandidateStore().getCandidate(user.id, input.data.candidateId);
  if (!candidate) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  let requirements: CompanyRequirement[];
  const statedOnCv = new Map<string, string[]>();
  if (input.data.roleId) {
    const role = await getRoleStore().get(user.id, input.data.roleId);
    if (!role) return Response.json({ error: { code: "ROLE_NOT_FOUND" } }, { status: 404 });
    if (input.data.roleTitle !== role.title) return Response.json({ error: { code: "ROLE_CHANGED" } }, { status: 409 });
    requirements = role.criteria.map((criterion) => ({
      id: criterion.id, requirement: criterion.label, importance: criterion.importance, category: "skill",
    }));
    const claims = (await getCandidateResumeStore().list(user.id)).get(candidate.id) ?? [];
    for (const item of evaluateCandidateForRole(candidate, role, claims).criteria) if (item.statedAs.length > 0) statedOnCv.set(item.criterion.id, item.statedAs);
  } else requirements = await getRequirementsStore().list(user.id);
  const selected = input.data.criterionIds.map((id) => requirements.find((criterion) => criterion.id === id));
  if (selected.some((criterion) => !criterion)) return Response.json({ error: { code: "CRITERIA_CHANGED" } }, { status: 409 });
  const session = await getInterviewStore().create(user.id, candidate.id, prepareInterview(candidate, input.data.roleTitle, selected.filter((criterion) => criterion !== undefined), statedOnCv));
  return session ? Response.json({ session }, { status: 201 }) : Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
}
