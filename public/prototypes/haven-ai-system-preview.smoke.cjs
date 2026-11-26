const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const here = __dirname;
const html = fs.readFileSync(path.join(here, 'haven-ai-system-preview.html'), 'utf8');
const placement = JSON.parse(fs.readFileSync(path.join(here, 'haven-ai-system-preview-data.json'), 'utf8'));
const dom = new JSDOM(html, { url: 'http://localhost:3000/prototypes/haven-ai-system-preview.html', runScripts: 'outside-only' });
const { window } = dom;
const { document } = window;

assert.equal(Object.keys(placement).length, 7);
assert.equal(Object.values(placement).flat().length, 94);
assert.equal(document.querySelectorAll('.roles span').length, 7);
assert.equal(document.querySelector('a[href="/account"]').textContent, 'Open Guest account');
assert.equal(document.querySelector('#module-work'), null, 'Launcher must not invent a module layout');

const script = document.querySelector('script').textContent.replace('location.href = "/manager_dashboard";', 'window.__target = "/manager_dashboard";');
window.eval(script);
document.querySelector('#open-staff').click();
assert.equal(window.sessionStorage.getItem('haven-ai-placement-preview'), '1');
assert.equal(window.__target, '/manager_dashboard');
assert.ok(document.querySelector('#open-live'), 'Launcher offers a direct live AI entry');
document.querySelector('#open-live').click();
assert.equal(window.sessionStorage.getItem('haven-ai-placement-preview'), null);
assert.equal(window.__target, '/manager_dashboard');

console.log('HAVEN AI local-layout launcher smoke checks passed: 7 staff roles, 94 placement entries, real workspace handoff.');
window.close();
