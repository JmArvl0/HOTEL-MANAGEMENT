import { Page, expect } from '@playwright/test';
import { RoleName, getRoleByName } from '../fixtures/roles';
import { loadCredentials } from './credentials';

const credentials = loadCredentials();

export async function loginAs(page: Page, role: RoleName): Promise<void> {
  const creds = credentials[role];
  const roleInfo = getRoleByName(role);
  
  if (!roleInfo) {
    throw new Error(`Unknown role: ${role}`);
  }

  if (!creds.password) {
    throw new Error(`No password set for role ${role}. Set TEST_${role.toUpperCase()}_PASSWORD in .env.test`);
  }

  await page.goto('/login');
  
  // Wait for login form to be visible
  await expect(page.locator('form')).toBeVisible({ timeout: 10000 });
  
  // Fill credentials
  await page.fill('#haven-email', creds.email);
  await page.fill('#haven-password', creds.password);
  
  // Submit
  await page.click('.haven-vault__submit, button:has-text("Sign in")');
  
  // Handle OTP if enabled
  await handleOTP(page);
  
  // Wait for redirect to dashboard (may go through /auth/continue first)
  await page.waitForURL(new RegExp(roleInfo.dashboard.replace(/\*/g, '.*')), { timeout: 15000 });
}

async function handleOTP(page: Page): Promise<void> {
  // Check if OTP challenge is present
  const otpHeading = page.locator('text=Enter the 6-digit code');
  
  if (await otpHeading.isVisible({ timeout: 3000 }).catch(() => false)) {
    // OTP is enabled - in test environment, we need a way to get the code
    // For now, we'll check if there's a test OTP endpoint or skip
    console.log('[Auth] OTP challenge detected - waiting for manual entry or test OTP');
    
    // Try to find OTP input
    const otpInput = page.locator('[name="otp"], [name="code"], input[autocomplete="one-time-code"]');
    
    if (await otpInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      // In a real test setup, you'd fetch the OTP from email or use a test OTP
      // For now, we'll wait for manual entry or fail with instruction
      throw new Error(
        'OTP authentication is enabled. For automated tests, either:\n' +
        '1. Disable OTP in test environment (set LOGIN_OTP_ENABLED=false)\n' +
        '2. Implement OTP retrieval from test email account\n' +
        '3. Use a test OTP bypass (if implemented in app)'
      );
    }
  }
}

export async function logout(page: Page): Promise<void> {
  // Click user menu / avatar
  const userMenu = page.locator('[data-testid="user-menu"], button:has-text("Sign out"), [aria-label="User menu"]');
  
  if (await userMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
    await userMenu.click();
    
    // Click sign out
    const signOut = page.locator('text=Sign out, text=Sign Out, [data-testid="sign-out"]');
    if (await signOut.isVisible({ timeout: 2000 }).catch(() => false)) {
      await signOut.click();
    }
  }
  
  // Wait for redirect to login
  await expect(page).toHaveURL(/\/login/);
}

export async function ensureLoggedIn(page: Page, role: RoleName): Promise<void> {
  // Check if already on dashboard
  const roleInfo = getRoleByName(role);
  if (!roleInfo) throw new Error(`Unknown role: ${role}`);
  
  const currentUrl = page.url();
  if (currentUrl.includes(roleInfo.dashboard.replace(/\*/g, ''))) {
    // Verify session is still valid
    const response = await page.goto(roleInfo.dashboard);
    if (response?.status() === 200) {
      return; // Already logged in
    }
  }
  
  // Not logged in or session expired
  await loginAs(page, role);
}