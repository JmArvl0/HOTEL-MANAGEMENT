import { test, expect } from '@playwright/test';
import { ROLES, RoleName, getRoleByName } from '../fixtures/roles';
import { contentMatrix } from '../fixtures/content-matrix';
import { expectNavItemVisible } from '../utils/assertions';

// POSITIVE TEST: Verify allowed content IS visible for each role

for (const role of ROLES) {
  test.describe(`${role.name} - Allowed Navigation Visible`, () => {
    test.use({ storageState: `tests/auth/states/auth-state-${role.name}.json` });
    
    const matrix = contentMatrix[role.name as RoleName];
    const roleInfo = getRoleByName(role.name);
    
    if (!roleInfo) {
      test.skip(true, `Unknown role: ${role.name}`);
      return;
    }

    test.describe('Sidebar Navigation - Allowed Items', () => {
      test('should show all allowed navigation items', async ({ page }) => {
        await page.goto(roleInfo.dashboard);
        await page.waitForLoadState('networkidle');
        
        for (const allowedNav of matrix.allowedNav) {
          // Convert section key to display label
          const label = allowedNav
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (l) => l.toUpperCase());
          await expectNavItemVisible(page, label, { timeout: 5000 });
        }
      });
    });

    test.describe('Page Access - Allowed Pages', () => {
      test('should access allowed pages successfully', async ({ page }) => {
        // Test dashboard access
        const response = await page.goto(roleInfo.dashboard);
        expect(response?.status()).toBe(200);
        await expect(page).toHaveURL(new RegExp(roleInfo.dashboard.replace(/\*/g, '.*')));
      });
    });
  });
}

// Guest-specific positive tests
test.describe('Guest - Allowed Content Visible', () => {
  test.use({ storageState: 'tests/auth/states/auth-state-guest.json' });
  
  test.describe('Guest Portal Navigation', () => {
    test('should access account page', async ({ page }) => {
      const response = await page.goto('/account');
      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(/\/account/);
    });

    test('should access my-reservations page', async ({ page }) => {
      const response = await page.goto('/my-reservations');
      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(/\/my-reservations/);
    });

    test('should access booking search page', async ({ page }) => {
      const response = await page.goto('/booking/search');
      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(/\/booking\/search/);
    });
  });
});