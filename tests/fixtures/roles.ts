export const ROLES = [
  { name: 'owner', displayName: 'Owner', dashboard: '/manager_dashboard' },
  { name: 'admin', displayName: 'Admin', dashboard: '/manager_dashboard' },
  { name: 'manager', displayName: 'Manager', dashboard: '/manager_dashboard' },
  { name: 'front_desk', displayName: 'Front Desk', dashboard: '/manager_dashboard' },
  { name: 'housekeeping', displayName: 'Housekeeping', dashboard: '/manager_dashboard' },
  { name: 'maintenance', displayName: 'Maintenance', dashboard: '/manager_dashboard' },
  { name: 'accounting', displayName: 'Accounting', dashboard: '/manager_dashboard' },
  { name: 'guest', displayName: 'Guest', dashboard: '/account' },
] as const;

export type RoleName = typeof ROLES[number]['name'];

export const ROLE_CREDENTIALS: Record<RoleName, { email: string; password: string }> = {
  owner: {
    email: process.env.TEST_OWNER_EMAIL || 'owner@haven.test',
    password: process.env.TEST_OWNER_PASSWORD || '',
  },
  admin: {
    email: process.env.TEST_ADMIN_EMAIL || 'admin@haven.test',
    password: process.env.TEST_ADMIN_PASSWORD || '',
  },
  manager: {
    email: process.env.TEST_MANAGER_EMAIL || 'manager@haven.test',
    password: process.env.TEST_MANAGER_PASSWORD || '',
  },
  front_desk: {
    email: process.env.TEST_FRONT_DESK_EMAIL || 'frontdesk@haven.test',
    password: process.env.TEST_FRONT_DESK_PASSWORD || '',
  },
  housekeeping: {
    email: process.env.TEST_HOUSEKEEPING_EMAIL || 'housekeeping@haven.test',
    password: process.env.TEST_HOUSEKEEPING_PASSWORD || '',
  },
  maintenance: {
    email: process.env.TEST_MAINTENANCE_EMAIL || 'maintenance@haven.test',
    password: process.env.TEST_MAINTENANCE_PASSWORD || '',
  },
  accounting: {
    email: process.env.TEST_ACCOUNTING_EMAIL || 'accounting@haven.test',
    password: process.env.TEST_ACCOUNTING_PASSWORD || '',
  },
  guest: {
    email: process.env.TEST_GUEST_EMAIL || 'guest@haven.test',
    password: process.env.TEST_GUEST_PASSWORD || '',
  },
};

export function getRoleByName(name: RoleName) {
  return ROLES.find((r) => r.name === name);
}

export function getAllRoleNames(): RoleName[] {
  return ROLES.map((r) => r.name);
}