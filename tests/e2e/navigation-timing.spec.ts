import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("workspace navigation timing and full-page loading count", async ({ page, context }, testInfo) => {
  test.skip(process.env.CODEPROOF_NAV_PERF !== "1" || testInfo.project.name !== "desktop-en");
  test.setTimeout(120_000);
  expect((await context.request.post("/api/auth/register", {
    data: { email: `navigation-${randomUUID()}@example.invalid`, password: randomUUID() },
  })).status()).toBe(201);
  await page.goto("/");
  await page.evaluate(() => {
    const state = { count: 0, visible: false };
    (window as Window & { __codeproofLoading?: typeof state }).__codeproofLoading = state;
    new MutationObserver(() => {
      const visible = Boolean(document.querySelector('[aria-label="Loading workspace"]'));
      if (visible && !state.visible) state.count++;
      state.visible = visible;
    }).observe(document.body, { childList: true, subtree: true });
  });

  const destinations = [
    ["/candidates", "Candidate dossiers"],
    ["/analyze", "From résumé to engineering proof."],
    ["/review", "Review queue"],
    ["/shortlists", "Role-based candidate review"],
    ["/interviews", "Interview desk"],
    ["/compare", "Compare candidate evidence"],
    ["/insights", "Hiring Insights"],
    ["/requirements", "Company requirements"],
  ] as const;
  const timings: number[] = [];
  for (let pass = 0; pass < 2; pass++) {
    for (const [route, heading] of destinations) {
      const started = Date.now();
      await page.locator(`.workspace-sidebar nav a[href="${route}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${route}$`));
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      if (pass === 1) timings.push(Date.now() - started);
    }
  }
  const ordered = [...timings].sort((a, b) => a - b);
  const fullPageLoads = await page.evaluate(() =>
    (window as Window & { __codeproofLoading?: { count: number } }).__codeproofLoading?.count ?? -1);
  console.log(`Navigation p50=${ordered[Math.floor(ordered.length / 2)]}ms p95=${ordered.at(-1)}ms fullPageLoads=${fullPageLoads} over 16 transitions`);
  expect(ordered).toHaveLength(destinations.length);
  expect(fullPageLoads).toBe(0);
});
