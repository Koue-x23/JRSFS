// Loads the real app shell (public/js/app.js) in a DOM emulator and navigates
// every sidebar route, verifying the Dashboard is the default screen.
// Usage: BASE=http://localhost:3000 node server/test/shell.js
let Window;
try {
  ({ Window } = await import('happy-dom'));
} catch {
  console.log('happy-dom is not installed — run "npm install" to enable the browser-logic tests.');
  process.exit(0);
}
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://localhost:3000';
const root = path.resolve(import.meta.dirname, '../..');

const window = new Window({ url: `${BASE}/`, settings: { disableCSSFileLoading: true } });
const { document } = window;
for (const key of ['window', 'document', 'location', 'history', 'HTMLElement', 'HTMLIFrameElement', 'Node', 'Event', 'CustomEvent', 'HashChangeEvent', 'CSS', 'getComputedStyle', 'requestAnimationFrame', 'MutationObserver']) {
  globalThis[key] = window[key];
}
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.URL = URL;
globalThis.URLSearchParams = URLSearchParams;

const nodeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  if (typeof input === 'string' && input.startsWith('/')) return nodeFetch(`${BASE}${input}`, init);
  return nodeFetch(input, init);
};
window.fetch = globalThis.fetch;
window.scrollTo = () => {};

document.body.innerHTML = fs
  .readFileSync(path.join(root, 'public/index.html'), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .match(/<body[^>]*>([\s\S]*)<\/body>/)[1];

const failures = [];
const check = (name, condition, extra = '') => {
  if (condition) console.log(`  ✓ ${name}`);
  else {
    failures.push(name);
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`);
  }
};
const sleep = (ms = 400) => new Promise((r) => setTimeout(r, ms));

await import('../../public/js/app.js');
await sleep(900);

const view = () => document.getElementById('view');
const title = () => document.getElementById('page-title').textContent;
const go = async (hash) => {
  window.location.hash = hash;
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  await sleep(600);
};

console.log('\nApp shell behaviour');
check('opens on the Dashboard without a login screen', title() === 'Dashboard' && !/password|sign in/i.test(document.body.innerHTML));
check('location defaults to #/dashboard', window.location.hash === '#/dashboard');
check('sidebar lists all ten modules', document.querySelectorAll('#nav .nav-item').length === 10);
check('no login/sign-up entries in the navigation', !/login|sign in|sign up|logout/i.test(document.getElementById('nav').textContent));

const api = async (endpoint) => (await fetch(`${BASE}/api${endpoint}`)).json();
const post = async (endpoint, body) => {
  const res = await fetch(`${BASE}/api${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
};
const { ensureFixtures } = await import('./fixtures.js');
const fixtures = await ensureFixtures(null, post);
if (fixtures.seeded) console.log('(created fixture records for an empty database)');
const quotations = await api('/quotations');
let editableQuotation = quotations.find((q) => !q.invoiceId);
if (!editableQuotation) {
  editableQuotation = await post(`/quotations/${quotations[0].id}/duplicate`, {});
}
const invoices = await api('/invoices');
const services = await api('/service-reports');
const statements = await api('/billing-statements');
const customers = await api('/customers');

const routes = [
  ['#/dashboard', 'Dashboard', 'Total quotations'],
  ['#/quotations', 'Quotations', 'New quotation'],
  ['#/quotations/new', 'New quotation', 'Line items'],
  ['#/quotations/' + quotations[0].id, 'Quotation ' + quotations[0].number, 'Document preview'],
  ['#/quotations/' + editableQuotation.id + '/edit', 'Edit quotation', 'Line items'],
  ['#/invoices', 'Invoices', 'New invoice'],
  ['#/invoices/new', 'New invoice', 'Invoice total'],
  ['#/invoices/' + invoices[0].id, 'Invoice ' + invoices[0].number, 'Payment history'],
  ['#/service-reports', 'Service Reports', 'New service report'],
  ['#/service-reports/new', 'New service report', 'Photo documentation'],
  ['#/service-reports/' + services[0].id, 'Service report ' + services[0].number, 'Costs'],
  ['#/statements', 'Billing Statements', 'New statement'],
  ['#/statements/new', 'New billing statement', 'Statement preview'],
  ['#/statements/' + statements[0].id, 'Billing statement ' + statements[0].number, 'Running balance'],
  ['#/customers', 'Customers', 'Add customer'],
  ['#/customers/new', 'New customer', 'Customer name'],
  ['#/customers/' + customers[0].id, customers[0].name, 'Contact information'],
  ['#/products', 'Products & Services', 'Add product or service'],
  ['#/payments', 'Payments', 'Record payment'],
  ['#/reports', 'Reports', 'Quotations by status'],
  ['#/settings', 'Business Settings', 'Business profile'],
];

console.log('\nRoute navigation');
for (const [hash, expectedTitle, expectedText] of routes) {
  await go(hash);
  const ok = title().startsWith(expectedTitle) && view().textContent.includes(expectedText) && view().querySelector('.empty-icon,table,form,.panel-list,.kpi');
  check(`${hash} renders`, ok, `title="${title()}" text=${view().textContent.slice(0, 90).replace(/\s+/g, ' ')}`);
}

await go('#/does-not-exist');
check('unknown route shows a friendly 404', view().textContent.includes('Page not found'));

await go('#/dashboard');
check('returns to the Dashboard after refresh-like navigation', title() === 'Dashboard');

console.log(`\n${failures.length ? `${failures.length} shell check(s) failed: ${failures.join(', ')}` : 'All shell checks passed.'}`);
if (failures.length) process.exitCode = 1;
window.close();
process.exit(failures.length ? 1 : 0);
