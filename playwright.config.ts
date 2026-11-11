import "dotenv/config";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: {
    baseURL: "http://localhost:3001",
    actionTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  webServer: [{
    command: "npm run dev -w @barber/business",
    url: "http://localhost:3001/login",
    reuseExistingServer: true,
    timeout: 60_000,
  }, {
    command: "npm run dev -w @barber/client",
    url: "http://localhost:3002",
    reuseExistingServer: true,
    timeout: 60_000,
  }],
});
