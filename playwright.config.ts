import { defineConfig, devices } from "@playwright/test";

// B-08: committed smoke test. Runs against the DEV Supabase project only —
// tests/e2e/helpers.ts refuses any other target in code. Locally: start
// `pnpm dev` (or let E2E_START_SERVER=1 run `pnpm start` on a build), then
// `pnpm e2e`. In GitHub: .github/workflows/e2e-smoke.yml (nightly + manual,
// never on PRs — it needs the dev service-role key).
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  // Traces only locally: in the public repo's CI they'd be an artifact-
  // shaped leak of dev data (see e2e-smoke.yml).
  use: { baseURL, trace: process.env.CI ? "off" : "retain-on-failure", ...devices["Desktop Chrome"] },
  webServer: process.env.E2E_START_SERVER
    ? { command: "pnpm start", url: `${baseURL}/login`, timeout: 120_000, reuseExistingServer: false }
    : undefined,
});
