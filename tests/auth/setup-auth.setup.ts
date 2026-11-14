import { test } from '@playwright/test';
import { getAllRoleNames, type RoleName } from '../fixtures/roles';
import { generateAuthState } from './auth-state';

test.describe.configure({ mode: 'serial' });

const allRoles = getAllRoleNames();
const requestedRoleList = process.env.PLAYWRIGHT_AUTH_ROLES?.trim();
const roles = requestedRoleList ? requestedRoleList.split(',').map((role) => role.trim()).filter(Boolean) : allRoles;
const unknownRoles = roles.filter((role) => !allRoles.includes(role as RoleName));

if (!roles.length) {
  throw new Error('PLAYWRIGHT_AUTH_ROLES must name at least one role when provided.');
}

if (unknownRoles.length) {
  throw new Error(`Unknown auth setup role(s): ${unknownRoles.join(', ')}`);
}

for (const role of roles as RoleName[]) {
  test(`generate auth state for ${role}`, async ({ page }) => {
    try {
      await generateAuthState(role, page);
    } catch (error) {
      await page.locator('#haven-password').fill('').catch(() => undefined);
      await page.locator('#haven-email').fill('').catch(() => undefined);
      throw error;
    }
  });
}
