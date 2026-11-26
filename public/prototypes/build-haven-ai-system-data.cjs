// Keep the standalone preview's staff navigation aligned with the placement report.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const report = fs.readFileSync(path.join(root, 'docs', 'ai-placement-by-account.md'), 'utf8');
const roles = [
  ['Front Desk', 'front_desk'],
  ['Housekeeping', 'housekeeping'],
  ['Maintenance', 'maintenance'],
  ['Accounting', 'accounting'],
  ['Manager', 'manager'],
  ['Owner', 'owner'],
  ['System Administrator', 'admin'],
];
const modules = {};

for (const [heading, key] of roles) {
  const start = report.indexOf(`## ${heading} account`);
  const next = report.indexOf('\n## ', start + 3);
  if (start < 0) throw new Error(`Missing ${heading} account heading`);
  const section = report.slice(start, next < 0 ? undefined : next);
  modules[key] = section.split(/\r?\n/).filter((line) => line.startsWith('| ') && !line.startsWith('| Module') && !line.startsWith('|---'))
    .map((line) => line.split('|').slice(1, 4).map((cell) => cell.trim().replaceAll('**', '')))
    .map(([name, purpose, description]) => ({ name, purpose, description }));
}

const count = Object.values(modules).reduce((sum, items) => sum + items.length, 0);
if (count !== 94) throw new Error(`Expected 94 staff account/module entries, found ${count}`);
const target = path.join(__dirname, 'haven-ai-system-preview-data.js');
fs.writeFileSync(target, `/* Generated from docs/ai-placement-by-account.md. Re-run build-haven-ai-system-data.cjs after changing the map. */\nwindow.HAVEN_AI_PREVIEW_MODULES = ${JSON.stringify(modules, null, 2)};\n`);
const jsonTarget = path.join(__dirname, 'haven-ai-system-preview-data.json');
fs.writeFileSync(jsonTarget, `${JSON.stringify(modules, null, 2)}\n`);
console.log(`Wrote ${count} staff account/module entries to ${path.relative(root, target)} and ${path.relative(root, jsonTarget)}`);
