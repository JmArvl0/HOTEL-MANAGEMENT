import { expect, Locator, Page } from '@playwright/test';

/**
 * Assert that an element does NOT contain specific text
 * Useful for verifying content leakage across roles
 */
export async function expectNotToContainText(
  locator: Locator,
  text: string,
  options?: { timeout?: number }
): Promise<void> {
  await expect(locator).not.toContainText(text, options);
}

/**
 * Assert that text is NOT visible anywhere on the page
 */
export async function expectTextNotVisible(
  page: Page,
  text: string,
  options?: { timeout?: number }
): Promise<void> {
  await expect(page.locator(`text=${text}`)).not.toBeVisible(options);
}

/**
 * Assert that multiple texts are NOT visible
 */
export async function expectNoneVisible(
  page: Page,
  texts: string[],
  _options?: { timeout?: number }
): Promise<void> {
  for (const text of texts) {
    await expect(page.locator(`text=${text}`)).not.toBeVisible(_options);
  }
}

/**
 * Assert that a navigation item is NOT visible in sidebar
 */
export async function expectNavItemNotVisible(
  page: Page,
  label: string,
  options?: { timeout?: number }
): Promise<void> {
  await expect(page.locator(`nav >> text=${label}`)).not.toBeVisible(options);
}

/**
 * Assert that a navigation item IS visible in sidebar
 */
export async function expectNavItemVisible(
  page: Page,
  label: string,
  options?: { timeout?: number }
): Promise<void> {
  await expect(page.locator(`nav >> text=${label}`)).toBeVisible(options);
}

/**
 * Assert that accessing a URL results in 401/403/redirect (not 200)
 */
export async function expectAccessDenied(
  page: Page,
  url: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _options?: { timeout?: number }
): Promise<void> {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  const status = response?.status() || 0;
  expect([401, 403, 302, 307].includes(status)).toBeTruthy();
}

/**
 * Wait for dashboard to load for a specific role
 */
export async function waitForDashboard(
  page: Page,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _role: string
): Promise<void> {
  await page.waitForLoadState('networkidle');
  // Wait for any dashboard-specific element
  await expect(page.locator('main, [role="main"], .dashboard-container')).toBeVisible({ timeout: 15000 });
}

/**
 * Get all visible text content from page (for debugging)
 */
export async function getAllVisibleText(page: Page): Promise<string> {
  return await page.evaluate(() => document.body.innerText);
}

/**
 * Check if element exists without throwing
 */
export async function elementExists(page: Page, selector: string): Promise<boolean> {
  const count = await page.locator(selector).count();
  return count > 0;
}