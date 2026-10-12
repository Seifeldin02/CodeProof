import { afterEach, describe, expect, it } from "vitest";
import { CandidateStore } from "@/features/candidates/store";
import { InterviewStore } from "./store";
import { prepareInterview } from "./preparation";
import { InterviewAssessmentSchema, UpdateInterviewSchema, interviewActionState, type InterviewAssessment } from "./contracts";
import type { CompanyRequirement } from "@/features/requirements/store";

const requirements: CompanyRequirement[] = [{ id: "criterion-1", requirement: "TypeScript", importance: "required", category: "skill" }];
const stores: CandidateStore[] = [];
async function setup() {
  const candidates = new CandidateStore(":memory:"); stores.push(candidates);
  const insert = candidates.db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, 'test-only', '2026-10-11')");
  insert.run("a", "a@example.invalid"); insert.run("b", "b@example.invalid");
  const candidate = await candidates.createCandidate("a", { name: "Private Work Candidate", role: "Backend Engineer", results: [], intakeOnly: true });
  const store = new InterviewStore(candidates.db);
  const session = (await store.create("a", candidate.id, prepareInterview(candidate, "Backend engineer", requirements)))!;
  return { candidates, candidate, store, session };
}
function complete(assessment: InterviewAssessment): InterviewAssessment {
  return { ...assessment, ratings: assessment.ratings.map((r) => ({ ...r, rating: "meets", observation: "Explained own implementation, rollback trade-off and failure tests." })),
    decision: "advance", rationale: "Observed concrete ownership and described validation of failure cases.", nextAction: "Schedule a team interview", followUpOn: "2026-10-12", candidateMessage: "Thank you for your time. We will contact you by October 12 with the next interview step." };
}
afterEach(() => { for (const store of stores.splice(0)) store.db.close(); });
describe("interview decision workspace", () => {
  it("does not turn missing public code into negative evidence, and preserves the role snapshot", async () => {
    const { session, store, candidate } = await setup();
    expect(candidate.furthestStage).toBe("applied");
    expect(candidate.stageHistory.map((e) => e.stage)).toEqual(["applied"]);
    expect(session.preparation.criteria[0].sources).toEqual([]);
    expect(session.preparation.criteria[0].question.en).toContain("without sharing confidential code");
    const saved = await store.update("a", session.id, { action: "save", revision: 1, assessment: complete(session.assessment) });
    expect(saved?.preparation).toEqual(session.preparation);
    expect(() => store.db.prepare("UPDATE interview_sessions SET preparation_json = '{}' WHERE id = ?").run(session.id)).toThrow(/immutable/);
  });
  it("denies cross-tenant reads, writes and creation", async () => {
    const { store, session, candidate } = await setup();
    expect(await store.list("b")).toEqual([]);
    expect(await store.get("b", session.id)).toBeNull();
    expect(await store.update("b", session.id, { action: "save", revision: 1, assessment: complete(session.assessment) })).toBeNull();
    expect(await store.create("b", candidate.id, session.preparation)).toBeNull();
    expect((await store.get("a", session.id))?.revision).toBe(1);
  });
  it("rejects stale writes without losing the newer draft", async () => {
    const { store, session } = await setup();
    await store.update("a", session.id, { action: "save", revision: 1, assessment: complete(session.assessment) });
    await expect(store.update("a", session.id, { action: "save", revision: 1, assessment: session.assessment })).rejects.toMatchObject({ code: "STALE_REVISION" });
    expect((await store.get("a", session.id))?.assessment.decision).toBe("advance");
  });
  it("requires observations and a candidate next step before locking completion", async () => {
    const { store, session } = await setup();
    await expect(store.update("a", session.id, { action: "complete", revision: 1, assessment: session.assessment })).rejects.toMatchObject({ code: "INCOMPLETE_ASSESSMENT" });
    const completed = (await store.update("a", session.id, { action: "complete", revision: 1, assessment: complete(session.assessment) }))!;
    expect(completed.status).toBe("completed");
    expect(completed.communicatedAt).toBeNull();
    await expect(store.update("a", session.id, { action: "save", revision: 2, assessment: session.assessment })).rejects.toMatchObject({ code: "COMPLETED_LOCKED" });
    expect(() => store.db.prepare("UPDATE interview_sessions SET assessment_json = '{}' WHERE id = ?").run(session.id)).toThrow(/immutable/);
    const communicated = (await store.update("a", session.id, { action: "mark_communicated", revision: 2 }))!;
    expect(communicated.communicatedAt).toBeTruthy();
    expect(communicated.assessment).toEqual(completed.assessment);
    expect(interviewActionState(communicated, "2026-10-15")).toBe("done");
  });
  it("rejects fabricated criteria and prevents marking a draft communicated", async () => {
    const { store, session } = await setup();
    await expect(store.update("a", session.id, { action: "save", revision: 1, assessment: { ...session.assessment, ratings: [{ criterionId: "foreign", rating: "meets", observation: "Claim" }] } })).rejects.toMatchObject({ code: "INVALID_CRITERIA" });
    await expect(store.update("a", session.id, { action: "mark_communicated", revision: 1 })).rejects.toMatchObject({ code: "INCOMPLETE_ASSESSMENT" });
  });
  it("validates real dates and rejects injected snapshot and ownership fields", () => {
    expect(UpdateInterviewSchema.safeParse({ revision: 1, action: "save", owner: "b" }).success).toBe(false);
    expect(InterviewAssessmentSchema.shape.followUpOn.safeParse("2026-02-30").success).toBe(false);
    expect(InterviewAssessmentSchema.shape.followUpOn.safeParse("2028-02-29").success).toBe(true);
  });
  it("cascades private interview notes when the owning candidate is deleted", async () => {
    const { candidates, store, session, candidate } = await setup();
    await candidates.deleteCandidate("a", candidate.id);
    expect(await store.get("a", session.id)).toBeNull();
  });
});
