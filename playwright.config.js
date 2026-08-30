import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test",
  testMatch: "**/*.spec.js",
  timeout: 10_000,
  expect: { timeout: 3_000 },
  fullyParallel: true,
  reporter: "list",
  webServer: {
    command: "node test/server.js",
    port: 4173,
    reuseExistingServer: true,
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
