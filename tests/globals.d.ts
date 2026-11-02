import '@playwright/test';

declare global {
  namespace PlaywrightTest {
    interface Fixtures {
      // Custom fixtures can be added here
      authenticatedPage: import('@playwright/test').Page;
    }
  }
}

export {};