import { defineConfig, devices } from "@playwright/test";

const basePath = process.env.VITE_BASE_PATH ?? "/";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:4173${basePath}`,
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173",
    url: `http://127.0.0.1:4173${basePath}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
