import { defineConfig, devices } from "@playwright/test";

const WEB = "http://127.0.0.1:3000";
const API = "http://127.0.0.1:3001";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["local-rc/**"],
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: WEB,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "node e2e/mock-api.mjs",
      url: `${API}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "pnpm exec next dev --hostname 0.0.0.0 --port 3000",
      url: WEB,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        API_INTERNAL_URL: API,
        NEXT_PUBLIC_API_URL: API,
        WEB_PORT: "3000",
      },
    },
  ],
  projects: [
    { name: "desktop-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "narrow-1180", use: { ...devices["Desktop Chrome"], viewport: { width: 1180, height: 820 } } },
  ],
});
