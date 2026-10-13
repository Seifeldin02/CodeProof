import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("role criteria → private-code interview → saved human decision → candidate update", async ({ page, context }, testInfo) => {
  const ar = testInfo.project.name.endsWith("-ar");
  const text = (en: string, arabic: string) => ar ? arabic : en;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const register = await context.request.post("/api/auth/register", { data: { email: `workflow-${randomUUID()}@example.invalid`, password: randomUUID() } });
  expect(register.status()).toBe(201);
  await context.addCookies([{ name: "codeproof-locale", value: ar ? "ar" : "en", url: testInfo.project.use.baseURL! }]);
  const requirement = { id: randomUUID(), requirement: "TypeScript", importance: "required", category: "skill" };
  expect((await context.request.put("/api/requirements", { data: { requirements: [requirement] } })).status()).toBe(200);
  await page.goto("/interviews");
  await expect(page.getByRole("heading", { name: text("Interview desk", "مكتب المقابلات"), exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", ar ? "rtl" : "ltr");
  await page.getByLabel(text("Candidate name", "اسم المرشح"), { exact: true }).fill("Browser verification candidate");
  await page.locator('input[list="interview-candidate-role-suggestions"]').fill("Mobile Engineer");
  await page.getByRole("button", { name: text("Add candidate without repository", "إضافة مرشح دون مستودع") }).click();
  await expect(page.getByRole("combobox", { name: text("Candidate", "المرشح"), exact: true })).not.toHaveValue("");
  await page.getByLabel(text("Role being hired", "الوظيفة المطلوب شغلها")).fill("Backend Engineer · Platform");
  await page.getByRole("button", { name: text("Create interview plan", "إنشاء خطة مقابلة") }).click();
  await expect(page).toHaveURL(/\/interviews\/[a-f0-9-]+$/);
  await expect(page.getByRole("heading", { name: text("Focused role-fit assessment", "تقييم مركز لمدى الملاءمة للوظيفة") })).toBeVisible();
  await expect(page.getByText(text("AI-permitted live assessment", "تقييم مباشر يسمح باستخدام الذكاء الاصطناعي"))).toBeVisible();
  await expect(page.getByText(text("For this Backend Engineer", "لهذه الوظيفة"), { exact: false })).toBeVisible();
  await expect(page.getByText(text("AI and documentation are allowed. Work through a concrete solution, explain what you accepted or changed, and show how you would verify it. Do not share confidential code.", "يسمح باستخدام الذكاء الاصطناعي والوثائق. اعرض حلاً عملياً، واشرح ما قبلته أو غيرته، وبين كيف ستتحقق منه. لا تشارك كوداً سرياً."))).toBeVisible();
  await expect(page.getByRole("button", { name: text("Copy assessment prompt", "نسخ سؤال التقييم") })).toBeVisible();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: text("Copy assessment prompt", "نسخ سؤال التقييم") }).click();
  await expect(page.getByRole("status")).toContainText(text("Assessment prompt copied.", "تم نسخ سؤال التقييم."));
  await expect(page.getByText(text("Evidence gap, not a skill deficit. Discuss a work example without requesting confidential code.", "فجوة أدلة وليست نقصاً في المهارة. ناقش مثالاً عملياً دون طلب كود سري."))).toBeVisible();
  const id = page.url().split("/").at(-1)!;
  const initial = (await (await context.request.get(`/api/interviews/${id}`)).json()).session;
  // Requirements changing later must not rewrite the interview's hiring bar.
  await context.request.put("/api/requirements", { data: { requirements: [{ ...requirement, requirement: "Python" }] } });
  await page.reload();
  await expect(page.getByRole("heading", { name: "1. TypeScript", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: text("Human assessment", "التقييم البشري"), exact: true }).selectOption("meets");
  await page.getByRole("textbox", { name: text("Observed answer / concrete evidence", "الإجابة الملحوظة / الدليل المحدد") }).fill("Explained personal implementation, rollback trade-offs and failure tests.");
  await page.getByRole("combobox", { name: text("Human decision", "القرار البشري"), exact: true }).selectOption("advance");
  await page.getByRole("textbox", { name: text("Decision rationale", "مبررات القرار") }).fill("Specific ownership and clear validation of failure cases were observed.");
  await page.getByRole("textbox", { name: text("Next action", "الإجراء التالي"), exact: true }).fill("Schedule a technical discussion");
  await page.getByRole("textbox", { name: text("Follow up by", "المتابعة بحلول"), exact: true }).fill("2026-10-12");
  await page.getByRole("textbox", { name: text("Message to the candidate", "الرسالة إلى المرشح") }).fill("Thank you for your time. We will contact you by October 12 about the next discussion.");
  await page.getByRole("button", { name: text("Save draft", "حفظ المسودة"), exact: true }).click();
  await expect(page.getByRole("status")).toContainText(text("Draft saved.", "تم حفظ المسودة."));
  await page.reload();
  await expect(page.getByRole("combobox", { name: text("Human decision", "القرار البشري"), exact: true })).toHaveValue("advance");
  const stale = await context.request.patch(`/api/interviews/${id}`, { data: { revision: 1, action: "save", assessment: initial.assessment } });
  expect(stale.status()).toBe(409);
  await page.getByRole("button", { name: text("Finalize assessment", "إنهاء التقييم"), exact: true }).click();
  await page.getByRole("button", { name: text("Confirm & lock assessment", "تأكيد وقفل التقييم") }).click();
  await expect(page.getByRole("combobox", { name: text("Human decision", "القرار البشري"), exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: text("I sent this update · mark communicated", "أرسلت التحديث · تسجيل الإبلاغ") })).toBeVisible();
  const finalized = (await (await context.request.get(`/api/interviews/${id}`)).json()).session;
  expect(finalized.communicatedAt).toBeNull();
  expect(finalized.preparation.requirementsHash).toBe(initial.preparation.requirementsHash);
  const candidate = await (await context.request.get(`/api/candidates/${finalized.candidateId}`)).json();
  expect(candidate.outcome).toBe("in_progress"); // Never auto-reject / auto-advance.
  await page.screenshot({ path: `test-results/interview-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: text("I sent this update · mark communicated", "أرسلت التحديث · تسجيل الإبلاغ") }).click();
  await expect(page.getByRole("status")).toContainText(text("Communication recorded.", "تم تسجيل الإبلاغ."));
  await page.goto("/interviews");
  await expect(page.getByText(text("Communicated", "تم إبلاغ المرشح"), { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  // Only remove data created by this test, not existing user candidates.
  expect((await context.request.delete(`/api/candidates/${finalized.candidateId}`)).status()).toBe(204);
});

test("interview APIs deny unauthenticated and cross-origin requests", async ({ request }) => {
  expect((await request.get("/api/interviews")).status()).toBe(401);
  expect((await request.post("/api/interviews", { data: {} })).status()).toBe(401);
  expect((await request.post("/api/interviews", { headers: { origin: "https://untrusted.example" }, data: {} })).status()).toBe(403);
});
