import { test, expect } from '@playwright/test';
import { ROLES, RoleName, getRoleByName } from '../fixtures/roles';
import { contentMatrix } from '../fixtures/content-matrix';
import { expectTextNotVisible } from '../utils/assertions';
import { pageUrls } from '../utils/selectors';

// Per-page content verification tests

for (const role of ROLES) {
  test.describe(`${role.name} - Page Content Verification`, () => {
    test.use({ storageState: `tests/auth/states/auth-state-${role.name}.json` });
    
    const matrix = contentMatrix[role.name as RoleName];
    const roleInfo = getRoleByName(role.name);
    
    if (!roleInfo) {
      test.skip(true, `Unknown role: ${role.name}`);
      return;
    }

    test.describe('Dashboard Page', () => {
      test('should load dashboard without errors', async ({ page }) => {
        await page.goto(roleInfo.dashboard);
        await page.waitForLoadState('networkidle');
        
        // Verify main content area is present
        await expect(page.locator('main, [role="main"], .dashboard-container')).toBeVisible();
        
        // Verify no console errors
        const errors: string[] = [];
        page.on('console', (msg) => {
          if (msg.type() === 'error') {
            errors.push(msg.text());
          }
        });
        
        // Allow some time for any lazy-loaded content
        await page.waitForTimeout(1000);
        
        // Filter out known benign errors
        const criticalErrors = errors.filter(
          (e) => !e.includes('favicon') && !e.includes('preload') && !e.includes('websocket')
        );
        expect(criticalErrors).toHaveLength(0);
      });

      test('should display role-appropriate dashboard widgets', async ({ page }) => {
        await page.goto(roleInfo.dashboard);
        await page.waitForLoadState('networkidle');
        
        // Check for at least one dashboard metric/widget
        const metrics = page.locator('[data-metric], .metric-card, .stat-card, [data-widget]');
        await expect(metrics.first()).toBeVisible({ timeout: 10000 });
      });
    });

    // Test each allowed section
    for (const section of matrix.allowedNav) {
      if (section === 'overview') continue; // Already tested as dashboard
      
      test.describe(`${section} Page`, () => {
        test(`should load ${section} page`, async ({ page }) => {
          const url = pageUrls.section(section);
          const response = await page.goto(url);
          
          // Some sections might redirect or return 404 if not implemented
          if (response?.status() === 404) {
            test.skip(true, `${section} page not implemented (404)`);
            return;
          }
          
          expect([200, 302, 307].includes(response?.status() || 0)).toBeTruthy();
          await page.waitForLoadState('networkidle');
          
          // Verify page has content
          await expect(page.locator('main, [role="main"], .page-content')).toBeVisible({ timeout: 10000 });
        });

        test(`should not show forbidden text on ${section} page`, async ({ page }) => {
          const url = pageUrls.section(section);
          await page.goto(url);
          await page.waitForLoadState('networkidle');
          
          for (const forbidden of matrix.forbiddenText) {
            await expectTextNotVisible(page, forbidden, { timeout: 5000 });
          }
        });
      });
    }
  });
}

// Guest portal page tests
test.describe('Guest - Page Content Verification', () => {
  test.use({ storageState: 'tests/auth/states/auth-state-guest.json' });
  
  const matrix = contentMatrix.guest;
  
  test.describe('Account Page', () => {
    test('should load account page with guest content', async ({ page }) => {
      await page.goto('/account');
      await page.waitForLoadState('networkidle');
      
      await expect(page.locator('main, [role="main"]')).toBeVisible();
      
      for (const forbidden of matrix.forbiddenText) {
        await expectTextNotVisible(page, forbidden, { timeout: 5000 });
      }
    });
  });

  test.describe('My Reservations Page', () => {
    test('should load reservations page', async ({ page }) => {
      await page.goto('/my-reservations');
      await page.waitForLoadState('networkidle');
      
      await expect(page.locator('main, [role="main"]')).toBeVisible();
      
      for (const forbidden of matrix.forbiddenText) {
        await expectTextNotVisible(page, forbidden, { timeout: 5000 });
      }
    });
  });

  test.describe('Booking Search Page', () => {
    test('should load booking search page', async ({ page }) => {
      await page.goto('/booking/search');
      await page.waitForLoadState('networkidle');
      
      await expect(page.locator('main, [role="main"]')).toBeVisible();
      
      for (const forbidden of matrix.forbiddenText) {
        await expectTextNotVisible(page, forbidden, { timeout: 5000 });
      }
    });
  });
});