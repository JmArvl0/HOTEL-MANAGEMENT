import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

export default defineConfig({
  ...baseConfig,
  testDir: './tests/auth',
  testMatch: 'setup-auth.setup.ts',
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  reporter: [['list']],
  use: {
    ...baseConfig.use,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
});
