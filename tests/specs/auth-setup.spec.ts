import { test, expect } from '@playwright/test';
import { getAllRoleNames } from '../fixtures/roles';
import { generateAllAuthStates, authStateExists } from '../auth/auth-state';
import { loadCredentials, validateCredentials } from '../auth/credentials';

// This test runs once to generate auth states for all roles
// Run with: npm run test:e2e:auth-setup

test.describe.configure({ retries: 0 });

test.describe('Auth State Generation', () => {
  test('generate auth states for all roles', async ({ page }) => {
    // Load and validate credentials
    const credentials = loadCredentials();
    
    if (!validateCredentials(credentials)) {
      const missing = getAllRoleNames().filter(role => !credentials[role].password);
      throw new Error(
        `Missing passwords for roles: ${missing.join(', ')}.\n` +
        `Set TEST_<ROLE>_PASSWORD in .env.test or environment variables.\n` +
        `Example: TEST_OWNER_PASSWORD=yourpassword`
      );
    }

    console.log('[Auth Setup] Credentials validated for all roles');
    console.log('[Auth Setup] Starting auth state generation...');

    // Generate auth states for all roles
    await generateAllAuthStates(page);

    // Verify all auth states were created
    for (const role of getAllRoleNames()) {
      const exists = authStateExists(role);
      expect(exists).toBeTruthy();
      console.log(`[Auth Setup] ✓ Auth state created for ${role}`);
    }

    console.log('[Auth Setup] All auth states generated successfully!');
  });
});

// Allow running individual role auth generation
for (const role of getAllRoleNames()) {
  test(`generate auth state for ${role}`, async ({ page }) => {
    const credentials = loadCredentials();
    
    if (!credentials[role].password) {
      throw new Error(`No password set for ${role}. Set TEST_${role.toUpperCase()}_PASSWORD`);
    }

    const { generateAuthState, authStateExists } = await import('../auth/auth-state');
    await generateAuthState(role, page);
    expect(authStateExists(role)).toBeTruthy();
  });
}