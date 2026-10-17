import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  use: { baseURL, trace: "on-first-retry" },
  // Public-site journeys need only the web dev server (it proxies /api to :3000).
  // Specs tagged @api additionally need the API + database; run with E2E_API=1.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "pnpm --filter @loop/web dev", url: baseURL, reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
