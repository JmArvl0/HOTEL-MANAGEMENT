import { test, expect } from '@playwright/test';
import { ROLES, RoleName, getRoleByName } from '../fixtures/roles';
import { contentMatrix } from '../fixtures/content-matrix';
import { expectTextNotVisible, expectNavItemNotVisible, expectAccessDenied } from '../utils/assertions';

// CORE TEST: Negative assertions - content that MUST NOT appear for each role

for (const role of ROLES) {
  test.describe(`${role.name} - Content Leakage Checks`, () => {
    test.use({ storageState: `tests/auth/states/auth-state-${role.name}.json` });
    
    const matrix = contentMatrix[role.name as RoleName];
    const roleInfo = getRoleByName(role.name);
    
    if (!roleInfo) {
      test.skip(true, `Unknown role: ${role.name}`);
      return;
    }

    test.describe('Dashboard - Forbidden Text', () => {
      test('should not display any forbidden text on dashboard', async ({ page }) => {
        await page.goto(roleInfo.dashboard);
        await page.waitForLoadState('networkidle');
        
        for (const forbidden of matrix.forbiddenText) {
          await expectTextNotVisible(page, forbidden, { timeout: 5000 });
        }
      });
    });

    test.describe('Sidebar Navigation - Forbidden Items', () => {
      test('should not show forbidden navigation items', async ({ page }) => {
        await page.goto(roleInfo.dashboard);
        await page.waitForLoadState('networkidle');
        
        for (const forbiddenNav of matrix.forbiddenNav) {
          // Convert section key to display label
          const label = forbiddenNav
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (l) => l.toUpperCase());
          await expectNavItemNotVisible(page, label, { timeout: 5000 });
        }
      });
    });

    test.describe('Cross-Role Page Access', () => {
      test('should deny access to forbidden pages', async ({ page }) => {
        for (const forbiddenPage of matrix.forbiddenPages || []) {
          await expectAccessDenied(page, forbiddenPage);
        }
      });
    });

    test.describe('Action Buttons - Forbidden Actions', () => {
      test('should not show forbidden action buttons', async ({ page }) => {
        await page.goto(roleInfo.dashboard);
        await page.waitForLoadState('networkidle');
        
        // Check for forbidden action buttons
        for (const forbidden of matrix.forbiddenText) {
          // Check buttons that might contain forbidden text
          const buttons = page.locator(`button:has-text("${forbidden}"), [role="button"]:has-text("${forbidden}")`);
          await expect(buttons).toHaveCount(0);
        }
      });
    });
  });
}

// Guest-specific tests (different dashboard URL)
test.describe('Guest - Content Leakage Checks', () => {
  test.use({ storageState: 'tests/auth/states/auth-state-guest.json' });
  
  const matrix = contentMatrix.guest;
  
  test.describe('Guest Portal - Forbidden Staff Content', () => {
    test('should not display any staff dashboard text', async ({ page }) => {
      await page.goto('/account');
      await page.waitForLoadState('networkidle');
      
      for (const forbidden of matrix.forbiddenText) {
        await expectTextNotVisible(page, forbidden, { timeout: 5000 });
      }
    });

    test('should not access manager dashboard', async ({ page }) => {
      await expectAccessDenied(page, '/manager_dashboard');
    });

    test('should not see staff navigation', async ({ page }) => {
      await page.goto('/account');
      await page.waitForLoadState('networkidle');
      
      // Check that staff nav items are not present
      for (const forbiddenNav of matrix.forbiddenNav) {
        if (forbiddenNav === 'customer-portal-only') continue;
        const label = forbiddenNav
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (l) => l.toUpperCase());
        await expectNavItemNotVisible(page, label, { timeout: 5000 });
      }
    });
  });
});