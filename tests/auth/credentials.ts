import * as fs from 'fs';
import * as path from 'path';
import { ROLE_CREDENTIALS, RoleName, getAllRoleNames } from '../fixtures/roles';

// Load .env.test file
function loadEnvTest(): Record<string, string> {
  const envPath = path.join(process.cwd(), '.env.test');
  const env: Record<string, string> = {};
  
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !line.trim().startsWith('#')) {
        env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
  
  return env;
}

const envTest = loadEnvTest();

export function loadCredentials(): Record<RoleName, { email: string; password: string }> {
  const credentials = { ...ROLE_CREDENTIALS };
  const missing: string[] = [];

  for (const role of getAllRoleNames()) {
    // Override with .env.test values if present
    const envKey = `TEST_${role.toUpperCase().replace('_', '_')}_PASSWORD`;
    const altKey = `TEST_${role.toUpperCase()}_PASSWORD`;
    
    const password = envTest[envKey] || envTest[altKey] || process.env[envKey] || process.env[altKey];
    
    if (password) {
      credentials[role] = { ...credentials[role], password };
    }
    
    if (!credentials[role].password) {
      missing.push(role);
    }
  }

  if (missing.length > 0) {
    console.warn(`[Credentials] Missing passwords for roles: ${missing.join(', ')}`);
    console.warn('[Credentials] Set TEST_<ROLE>_PASSWORD in .env.test or environment');
  }

  return credentials;
}

export function validateCredentials(credentials: Record<RoleName, { email: string; password: string }>): boolean {
  for (const role of getAllRoleNames()) {
    if (!credentials[role].email || !credentials[role].password) {
      return false;
    }
  }
  return true;
}