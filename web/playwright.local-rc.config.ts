import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const ROOT = path.resolve(process.cwd(), "..");
const WEB = process.env.AMBER_WEB_URL ?? "http://127.0.0.1:3000";
const API = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001";
const external = process.env.AMBER_E2E_EXTERNAL_STACK === "1";

export default defineConfig({
  testDir: "./e2e/local-rc",
  outputDir: path.join(ROOT, "test-results/local-rc"),
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: path.join(ROOT, "test-results/local-rc-report") }]],
  use: {
    baseURL: WEB,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: external
    ? undefined
    : [
        {
          command: "node dist/main.js",
          cwd: path.join(ROOT, "api"),
          url: `${API}/api/v1/ready`,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          stdout: "pipe",
          stderr: "pipe",
          env: {
            ...process.env,
            PORT: "3001",
            API_PORT: "3001",
            REDIS_URL: "",
            WEB_ORIGIN: WEB,
            S3_ENDPOINT: process.env.S3_ENDPOINT ?? "http://127.0.0.1:9000",
            S3_REGION: process.env.S3_REGION ?? "us-east-1",
            S3_ACCESS_KEY: process.env.S3_ACCESS_KEY ?? "amberminio",
            S3_SECRET_KEY: process.env.S3_SECRET_KEY ?? "amberminio",
            S3_BUCKET: process.env.S3_BUCKET ?? "amber-files",
            S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE ?? "true",
            AMBER_REQUIRE_S3: process.env.AMBER_REQUIRE_S3 ?? "1",
          },
        },
        {
          command: "pnpm exec next dev --hostname 0.0.0.0 --port 3000",
          cwd: path.join(ROOT, "web"),
          url: WEB,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
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
