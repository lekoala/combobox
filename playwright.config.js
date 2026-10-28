import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test",
  testMatch: "**/*.spec.js",
  // A browser test is a few hundred milliseconds of real work; the budget is a
  // safety net for hangs, not a performance target. The per-test timeout must
  // leave room for Playwright's own instrumentation on a loaded CI runner,
  // where 4 workers share 4 vCPUs and trace snapshots are recorded per action.
  timeout: 30_000,
  expect: { timeout: 3_000 },
  fullyParallel: true,
  // Capped to keep the Windows worker pool stable: higher parallelism produced
  // intermittent protocol "session closed" flakes under the previous default.
  workers: 4,
  // CI only: a trace recorded for every passing test costs ~4s per test on a
  // 4 vCPU runner (screenshot + DOM/ARIA snapshot per action), which pushed the
  // longest WebKit interaction tests over the old 10s timeout. Recording on the
  // first retry keeps the happy path cheap and still yields a trace for a real
  // failure; locally nothing changes and failures stay traced immediately.
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  webServer: {
    command: "node test/server.js",
    port: 4173,
    reuseExistingServer: true,
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    trace: {
      // CI records once a test is retried (see `retries` above); locally a
      // failure is traced immediately, since there is no retry to fall back on.
      mode: process.env.CI ? "on-first-retry" : "retain-on-failure",
      snapshots: { dom: true, aria: true, screen: true },
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
