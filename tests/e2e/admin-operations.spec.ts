import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("owner sees persisted operations and can suspend and reactivate a recruiter", async ({ page, context, browser }, testInfo) => {
  test.skip(process.env.CODEPROOF_ADMIN_E2E !== "1");
  const email = process.env.CODEPROOF_ADMIN_E2E_EMAIL;
  const password = process.env.CODEPROOF_ADMIN_E2E_PASSWORD;
  expect(email).toBeTruthy();
  expect(password).toBeTruthy();
  const ar = testInfo.project.name.endsWith("-ar");
  await context.addCookies([{ name: "codeproof-locale", value: ar ? "ar" : "en", url: testInfo.project.use.baseURL! }]);
  expect((await context.request.post("/api/auth/login", { data: { email, password } })).status()).toBe(200);

  const other = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const recruitEmail = `admin-check-${randomUUID()}@example.invalid`;
  const recruitPassword = randomUUID();
  try {
    expect((await other.request.post("/api/auth/register", {
      data: { email: recruitEmail, password: recruitPassword },
    })).status()).toBe(201);
    const recruiter = ((await (await other.request.get("/api/candidates")).json()) as unknown[]);
    expect(recruiter).toEqual([]);
    expect((await other.request.get("/api/admin/audit")).status()).toBe(404);
    const recruiterPage = await other.newPage();
    expect((await recruiterPage.goto("/admin"))?.status()).toBe(404);

    await page.goto("/admin");
    await expect(page.locator("html")).toHaveAttribute("dir", ar ? "rtl" : "ltr");
    await expect(page.getByRole("heading", { name: ar ? "عمليات CodeProof" : "CodeProof operations" })).toBeVisible();
    const row = page.locator("li").filter({ hasText: recruitEmail });
    await expect(row).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    page.once("dialog", (dialog) => dialog.accept());
    await row.getByRole("button", { name: ar ? "إيقاف الحساب" : "Suspend account" }).click();
    await expect(row).toContainText(ar ? "موقوف" : "Suspended");
    expect((await other.request.get("/api/candidates")).status()).toBe(401);
    expect((await other.request.post("/api/auth/login", {
      data: { email: recruitEmail, password: recruitPassword },
    })).status()).toBe(401);
    page.once("dialog", (dialog) => dialog.accept());
    await row.getByRole("button", { name: ar ? "إعادة تفعيل الحساب" : "Reactivate account" }).click();
    await expect(row).toContainText(ar ? "نشط" : "Active");
    expect((await other.request.post("/api/auth/login", {
      data: { email: recruitEmail, password: recruitPassword },
    })).status()).toBe(200);
  } finally {
    await other.close();
  }
});
