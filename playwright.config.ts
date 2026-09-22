import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim();
const baseURL = externalBaseUrl || "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["e2e/**/*.spec.ts", "browser/**/*.spec.ts"],
  outputDir: "test-results/playwright",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["line"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["junit", { outputFile: "test-results/playwright-junit.xml" }],
  ],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-en",
      use: {
        ...devices["Desktop Chrome"],
        locale: "en-US",
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "desktop-ar",
      use: {
        ...devices["Desktop Chrome"],
        locale: "ar-EG",
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "tablet-en",
      use: {
        ...devices["Desktop Chrome"],
        locale: "en-US",
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "mobile-en",
      use: {
        ...devices["Pixel 7"],
        locale: "en-US",
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "mobile-ar",
      use: {
        ...devices["Pixel 7"],
        locale: "ar-EG",
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "mobile-narrow-en",
      use: {
        ...devices["Pixel 7"],
        locale: "en-US",
        viewport: { width: 320, height: 720 },
      },
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "npm run dev -- --hostname 127.0.0.1",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
