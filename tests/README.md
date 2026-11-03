# Haven Hotel Management - Playwright E2E Tests

Cross-role content verification tests to ensure no unauthorized text/UI appears for any role.

## Roles Tested (8 total)
- `owner` - Full access
- `admin` - System admin (no refunds/reconciliation)
- `manager` - Operations management
- `front_desk` - Front office operations
- `housekeeping` - Housekeeping tasks only
- `maintenance` - Maintenance orders only
- `accounting` - Financial operations only
- `guest` - Customer portal only

## Prerequisites

1. **Local Supabase running:**
   ```bash
   supabase start
   supabase db push
   ```

2. **Set passwords for all 8 accounts:**
   ```bash
   node scripts/set-passwords.mjs owner@haven.test
   node scripts/set-passwords.mjs admin@haven.test
   node scripts/set-passwords.mjs manager@haven.test
   node scripts/set-passwords.mjs frontdesk@haven.test
   node scripts/set-passwords.mjs housekeeping@haven.test
   node scripts/set-passwords.mjs maintenance@haven.test
   node scripts/set-passwords.mjs accounting@haven.test
   node scripts/set-passwords.mjs guest@haven.test
   ```

3. **Configure test credentials:**
   ```bash
   cp .env.test.example .env.test
   # Edit .env.test with the passwords you set above
   ```

4. **Install Playwright:**
   ```bash
   npm install -D @playwright/test
   npx playwright install
   ```

## Running Tests

### One-time: Generate auth states for all roles
```bash
npm run test:e2e:auth-setup
```
This logs into each role and saves authentication cookies to `tests/auth/states/`.

### Run full test suite
```bash
npm run test:e2e
```

### Run with UI mode (interactive)
```bash
npm run test:e2e:ui
```

### View HTML report
```bash
npm run test:e2e:report
```

### Run specific test file
```bash
npx playwright test tests/specs/cross-role-leakage.spec.ts
```

### Run for specific role
```bash
npx playwright test --grep "front_desk"
```

### Run in headed mode (see browser)
```bash
npm run test:e2e:headed
```

## Test Structure

```
tests/
├── playwright.config.ts          # Playwright configuration
├── globals.d.ts                  # TypeScript declarations
├── auth/
│   ├── credentials.ts            # Load credentials from .env.test
│   ├── login.ts                  # Login flow per role
│   ├── auth-state.ts             # Storage state management
│   └── setup-auth.ts             # One-time auth state generator
├── fixtures/
│   ├── roles.ts                  # Role definitions
│   ├── content-matrix.json       # Allowed/forbidden content per role
│   ├── content-matrix.ts         # Type-safe wrapper
│   ├── selectors-map.json        # Stable selectors
│   └── selectors.ts              # Type-safe wrapper
├── utils/
│   ├── assertions.ts             # Custom assertions (negative checks)
│   └── selectors.ts              # Selector helpers
├── specs/
│   ├── cross-role-leakage.spec.ts    # CORE: Negative assertions
│   ├── nav-verification.spec.ts      # Positive: allowed nav visible
│   ├── page-content.spec.ts          # Per-page content checks
│   ├── action-buttons.spec.ts        # Button visibility
│   ├── data-access.spec.ts           # Table/row actions
│   └── dashboard-widgets.spec.ts     # Dashboard metrics
├── scripts/
│   └── generate-matrix.ts            # Regenerate matrix from source
└── auth/states/                      # Generated auth states (gitignored)
```

## Key Test: Cross-Role Leakage

The core test (`cross-role-leakage.spec.ts`) verifies **negative assertions** - content that MUST NOT appear for each role:

- Forbidden navigation items in sidebar
- Forbidden text anywhere on page
- Forbidden action buttons
- Access denied to forbidden pages (401/403/redirect)

Example:
```typescript
// front_desk should NOT see "Refunds" nav item
await expect(page.locator('nav >> text=Refunds')).not.toBeVisible();

// accounting should NOT see "Check In" button
await expect(page.locator('button:has-text("Check In")')).toHaveCount(0);
```

## Content Matrix

The `content-matrix.json` defines allowed/forbidden content per role, derived from:
- `config/role-navigation.ts` (navigation permissions)
- `lib/permissions.ts` (capability permissions)

To regenerate from source:
```bash
npx tsx tests/scripts/generate-matrix.ts
```

## Troubleshooting

### "No password set for role X"
Set the password in `.env.test`:
```
TEST_FRONT_DESK_PASSWORD=yourpassword
```

### OTP authentication enabled
If login shows OTP challenge, either:
1. Disable OTP in test env: `LOGIN_OTP_ENABLED=false` in `.env.local`
2. Or implement OTP retrieval in `tests/auth/login.ts`

### Auth state expired
Re-run: `npm run test:e2e:auth-setup`

### Tests timeout
Increase timeouts in `playwright.config.ts`:
```typescript
use: {
  actionTimeout: 15000,
  navigationTimeout: 60000,
}
```

## CI Integration

Add to GitHub Actions:
```yaml
- name: Run E2E Tests
  run: |
    npm run test:e2e:auth-setup
    npm run test:e2e
  env:
    TEST_OWNER_PASSWORD: ${{ secrets.TEST_OWNER_PASSWORD }}
    # ... other passwords
```

## Scope Configuration

Edit `playwright.config.ts` projects array to change viewports:
- Desktop: chromium, firefox, webkit
- Mobile: mobile-chrome, mobile-safari
- Tablet: tablet

For faster runs, comment out unused projects.