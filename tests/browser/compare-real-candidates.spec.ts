import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("comparison starts empty for a real account and lists a stored applicant", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-en");
  expect((await context.request.post("/api/auth/register", { data: {
    email: `compare-real-${randomUUID()}@example.invalid`, password: randomUUID(),
  } })).status()).toBe(201);
  await page.goto("/compare");
  await expect(page.getByText("Analyze a real candidate to populate this workspace. Demo records are not included.")).toBeVisible();
  expect((await context.request.post("/api/candidates", { data: { name: "Actual Applicant" } })).status()).toBe(201);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Actual Applicant" })).toBeVisible();
  await expect(page.getByText("Demo Candidate")).toHaveCount(0);
});
