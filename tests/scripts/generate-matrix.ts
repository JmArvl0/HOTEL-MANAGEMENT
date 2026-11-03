import * as fs from 'fs';
import * as path from 'path';

// This script parses the source files to generate the content matrix
// Run with: npx tsx tests/scripts/generate-matrix.ts

interface NavItem {
  label: string;
  section: string;
  roles?: string[];
  group: string;
  hidden?: boolean;
}

interface RoleMatrix {
  allowedNav: string[];
  forbiddenNav: string[];
  allowedPages: string[];
  forbiddenPages: string[];
  forbiddenText: string[];
  dashboardWidgets: string[];
  actionButtons: string[];
}

function parseNavItems(content: string): NavItem[] {
  const navItems: NavItem[] = [];
  const regex = /\{\s*label:\s*["']([^"']+)["'],\s*section:\s*["']([^"']+)["'](?:,\s*roles:\s*\[([^\]]+)\])?,\s*group:\s*["']([^"']+)["'](?:,\s*hidden:\s*true)?\s*\}/g;
  
  let match;
  while ((match = regex.exec(content)) !== null) {
    const [, label, section, rolesStr, group] = match;
    const roles = rolesStr ? rolesStr.split(',').map(r => r.trim().replace(/["']/g, '')) : undefined;
    navItems.push({ label, section, roles, group, hidden: false });
  }
  return navItems;
}

function generateMatrix(): void {
  // Read source files
  const navContent = fs.readFileSync(
    path.join(__dirname, '..', '..', 'config', 'role-navigation.ts'),
    'utf-8'
  );
  
  const navItems = parseNavItems(navContent);
  
  // Define roles
  const roles = [
    'owner', 'admin', 'manager', 'front_desk', 
    'housekeeping', 'maintenance', 'accounting', 'guest'
  ];
  
  // Build matrix
  const matrix: Record<string, RoleMatrix> = {};
  
  for (const role of roles) {
    const allowedNav: string[] = [];
    const forbiddenNav: string[] = [];
    
    for (const item of navItems) {
      if (item.hidden) continue;
      if (!item.roles || item.roles.includes(role)) {
        allowedNav.push(item.section);
      } else {
        forbiddenNav.push(item.section);
      }
    }
    
    matrix[role] = {
      allowedNav,
      forbiddenNav,
      allowedPages: role === 'guest' ? ['/account*', '/my-reservations*', '/booking/*'] : ['/manager_dashboard*'],
      forbiddenPages: role === 'guest' ? ['/manager_dashboard*'] : [],
      forbiddenText: forbiddenNav.map(s => s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())),
      dashboardWidgets: [],
      actionButtons: []
    };
  }
  
  // Output
  const outputPath = path.join(__dirname, '..', 'fixtures', 'content-matrix.generated.json');
  fs.writeFileSync(outputPath, JSON.stringify(matrix, null, 2));
  console.log(`Generated matrix at ${outputPath}`);
}

generateMatrix();