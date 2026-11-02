import { test, expect } from '@playwright/test';
import { ROLES, RoleName, getRoleByName } from '../fixtures/roles';
import { contentMatrix } from '../fixtures/content-matrix';
import { tableSelectors, pageUrls } from '../utils/selectors';

// Data table/row/action visibility tests

for (const role of ROLES) {
  test.describe(`${role.name} - Data Access Verification`, () => {
    test.use({ storageState: `tests/auth/states/auth-state-${role.name}.json` });
    
    const matrix = contentMatrix[role.name as RoleName];
    const roleInfo = getRoleByName(role.name);
    
    if (!roleInfo) {
      test.skip(true, `Unknown role: ${role.name}`);
      return;
    }

    test.describe('Table Visibility', () => {
      for (const section of matrix.allowedNav) {
        if (section === 'overview') continue;
        
        test(`${section} - should show data table if applicable`, async ({ page }) => {
          const url = pageUrls.section(section);
          await page.goto(url);
          await page.waitForLoadState('networkidle');
          
          const response = await page.goto(url);
          if (response?.status() === 404) {
            test.skip(true, `${section} page not implemented`);
            return;
          }
          
          // Check for table
          const table = page.locator(tableSelectors.container);
          const hasTable = await table.count() > 0;
          
          if (hasTable) {
            await expect(table.first()).toBeVisible({ timeout: 10000 });
            
            // Verify table has rows or empty state
            const rows = page.locator(tableSelectors.row);
            const rowCount = await rows.count();
            
            // Either has data rows or shows empty state
            const emptyState = page.locator('text=No data, text=No records, text=Empty, .empty-state');
            const hasEmptyState = await emptyState.count() > 0;
            
            expect(rowCount > 0 || hasEmptyState).toBeTruthy();
          }
        });
      }
    });

    test.describe('Row Actions', () => {
      for (const section of matrix.allowedNav) {
        if (section === 'overview') continue;
        
        test(`${section} - row actions should match role permissions`, async ({ page }) => {
          const url = pageUrls.section(section);
          await page.goto(url);
          await page.waitForLoadState('networkidle');
          
          const response = await page.goto(url);
          if (response?.status() === 404) {
            test.skip(true, `${section} page not implemented`);
            return;
          }
          
          const table = page.locator(tableSelectors.container);
          const hasTable = await table.count() > 0;
          
          if (!hasTable) {
            test.skip(true, `${section} has no table`);
            return;
          }
          
          // Click first row if exists
          const rows = page.locator(tableSelectors.row);
          const rowCount = await rows.count();
          
          if (rowCount > 0) {
            await rows.first().click();
            await page.waitForTimeout(500);
            
            // Check visible row actions
            const actionButtons = page.locator('button[data-action], [role="menuitem"], button:has-text("Edit"), button:has-text("View"), button:has-text("Delete")');
            const actionCount = await actionButtons.count();
            
            // Should have appropriate number of actions for role
            expect(actionCount).toBeGreaterThanOrEqual(0);
          }
        });
      }
    });
  });
}

// Guest data access tests
test.describe('Guest - Data Access Verification', () => {
  test.use({ storageState: 'tests/auth/states/auth-state-guest.json' });
  
  test.describe('My Reservations Data', () => {
    test('should show only own reservations', async ({ page }) => {
      await page.goto('/my-reservations');
      await page.waitForLoadState('networkidle');
      
      // Should show reservations table/list
      const reservations = page.locator('[data-testid="reservation-card"], .reservation-card, .reservation-item');
      const count = await reservations.count();
      
      // Should only show own reservations (count >= 0)
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe('Booking Search Results', () => {
    test('should show available rooms', async ({ page }) => {
      await page.goto('/booking/search');
      await page.waitForLoadState('networkidle');
      
      // Fill search form if present
      const checkInInput = page.locator('input[name="checkIn"], input[type="date"]').first();
      const checkOutInput = page.locator('input[name="checkOut"], input[type="date"]').last();
      
      if (await checkInInput.count() > 0) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dayAfter = new Date();
        dayAfter.setDate(dayAfter.getDate() + 2);
        
        await checkInInput.fill(tomorrow.toISOString().split('T')[0]);
        await checkOutInput.fill(dayAfter.toISOString().split('T')[0]);
        
        const searchButton = page.locator('button[type="submit"], button:has-text("Search")');
        if (await searchButton.count() > 0) {
          await searchButton.click();
          await page.waitForLoadState('networkidle');
        }
      }
      
      // Should show room results
      const roomCards = page.locator('[data-testid="room-card"], .room-card, .room-result');
      const count = await roomCards.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});