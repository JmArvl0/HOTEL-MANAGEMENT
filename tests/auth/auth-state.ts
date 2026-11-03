import { test as base, Page } from '@playwright/test';
import { RoleName, getAllRoleNames } from '../fixtures/roles';
import { loginAs } from './login';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_STATE_DIR = path.join(__dirname, 'states');

// Ensure auth state directory exists
if (!fs.existsSync(AUTH_STATE_DIR)) {
  fs.mkdirSync(AUTH_STATE_DIR, { recursive: true });
}

export function getAuthStatePath(role: RoleName): string {
  return path.join(AUTH_STATE_DIR, `auth-state-${role}.json`);
}

export function authStateExists(role: RoleName): boolean {
  return fs.existsSync(getAuthStatePath(role));
}

export async function generateAuthState(role: RoleName, page: Page): Promise<void> {
  const authStatePath = getAuthStatePath(role);
  
  console.log(`[Auth] Generating auth state for ${role}...`);
  
  await loginAs(page, role);
  
  // Save storage state (cookies, localStorage)
  await page.context().storageState({ path: authStatePath });
  
  console.log(`[Auth] Saved auth state for ${role} to ${authStatePath}`);
}

export async function generateAllAuthStates(page: Page): Promise<void> {
  for (const role of getAllRoleNames()) {
    try {
      await generateAuthState(role, page);
    } catch (error) {
      console.error(`[Auth] Failed to generate auth state for ${role}:`, error);
      throw error;
    }
  }
}

// Custom test fixture that provides authenticated page per role
type AuthFixtures = {
  authenticatedPage: Page;
};

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    // This fixture is meant to be used with test.use({ storageState: ... })
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
  },
});

export { expect } from '@playwright/test';