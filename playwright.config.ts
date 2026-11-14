import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3100';
const playwrightPort = process.env.PLAYWRIGHT_PORT || new URL(baseURL).port || '3100';
const playwrightBuildDir = process.env.PLAYWRIGHT_HAVEN_BUILD_DIR || '.tmp/playwright-next';
const playwrightServerCommand = process.env.PLAYWRIGHT_DEV_SERVER_COMMAND || `npm run dev -- --port ${playwrightPort}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results.json' }],
    ['list']
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
    {
      name: 'tablet',
      use: { ...devices['iPad Pro'] },
    },
  ],
  webServer: {
    command: playwrightServerCommand,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      ...process.env,
      PORT: playwrightPort,
      HAVEN_BUILD_DIR: playwrightBuildDir,
      NEXTAUTH_URL: baseURL,
    },
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 100,
    },
  },
});
