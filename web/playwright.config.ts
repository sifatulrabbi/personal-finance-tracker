import { defineConfig, devices } from "@playwright/test";
import { appOrigin } from "./e2e/ports";

// One backend serves every test, and each test resets it to a fresh database first,
// so tests run one at a time. Set E2E_PORT to run several worktrees side by side.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: appOrigin,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: "bun run build && bun run e2e/server.ts",
    url: `${appOrigin}/healthz`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
