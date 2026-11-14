import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const screenshotDir = path.resolve('.tmp/reports-qa-screenshots');
mkdirSync(screenshotDir, { recursive: true });

const roles = [
  {
    name: 'front_desk',
    nav: 'Reports',
    group: 'Operations',
    required: ['Daily operations report', 'Generate preview', 'Submission history'],
    forbidden: ['Acknowledge report', 'Return report'],
  },
  {
    name: 'manager',
    nav: 'Reports',
    group: 'Operations',
    required: ['Operations & review', 'Daily report review', 'Performance', 'Export current view'],
    forbidden: ['Submit to Manager', 'Close operating day', 'Start operating-day tracking'],
  },
  {
    name: 'accounting',
    nav: 'Reports',
    group: 'Operations',
    required: ['Financial performance', 'Export report', 'Settled collections', 'Collections and refunds', 'Collection breakdown', 'Operating day and night audit'],
    forbidden: ['Submit to Manager', 'Acknowledge report', 'Return report', 'Close operating day', 'Start operating-day tracking'],
  },
  {
    name: 'admin',
    nav: 'Admin Reports',
    group: 'Governance',
    required: ['Account and configuration summary', 'Accounts by role', 'Export governance summary'],
    forbidden: ['Submit to Manager', 'Acknowledge report'],
  },
  {
    name: 'owner',
    nav: 'Executive Reports',
    group: 'Governance',
    required: ['Seven-day operating summary', 'Booked occupancy — last 7 days', 'Collections — last 7 days', 'Export executive summary'],
    forbidden: ['Submit to Manager', 'Acknowledge report'],
  },
] as const;

for (const role of roles) {
  test.describe(`${role.name} Reports view`, () => {
    test.use({ storageState: `tests/auth/states/auth-state-${role.name}.json` });

    test('shows its report scope and stays usable on mobile', async ({ page }) => {
      await page.goto('/manager_dashboard');
      const navigation = page.getByRole('navigation', { name: 'Modules' });
      await expect(navigation).toBeVisible();

      const reportNav = navigation.getByRole('button', { name: role.nav, exact: true });
      if (!(await reportNav.isVisible())) {
        await navigation.getByRole('button', { name: role.group, exact: true }).click();
      }
      await reportNav.click();

      const content = page.locator('.workspace-body');
      for (const text of role.required) await expect(content).toContainText(text);

      if (role.name === 'front_desk') {
        await expect(content.getByText('Preview ready')).toBeVisible({ timeout: 20000 });
        await expect(content.getByRole('button', { name: 'Export preview' })).toBeVisible();
        await expect(content.getByRole('button', { name: 'Submit to Manager' })).toBeVisible();
      }

      if (role.name === 'manager') {
        await expect(content.locator('.manager-report-review')).toBeVisible();
        await content.getByRole('button', { name: 'Performance', exact: true }).click();
        await expect(content.getByRole('heading', { name: 'Seven-day booked occupancy' })).toBeVisible();
        await expect(content.getByRole('heading', { name: 'Room status' })).toBeVisible();
        const nightAudit = content.getByRole('region', { name: 'Operating day and night audit' });
        await expect(nightAudit.getByText('Loading operating-day assessment…')).toBeHidden({ timeout: 30000 });
        await expect(nightAudit.getByRole('alert')).toHaveCount(0);
      }

      for (const text of role.forbidden) {
        await expect(content.getByRole('button', { name: text, exact: true })).toHaveCount(0);
      }

      await page.screenshot({ path: path.join(screenshotDir, `${role.name}-desktop.png`), fullPage: true, animations: 'disabled' });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth), { timeout: 10000 }).toBeLessThanOrEqual(391);
      await page.screenshot({ path: path.join(screenshotDir, `${role.name}-mobile.png`), fullPage: true, animations: 'disabled' });
    });
  });
}
