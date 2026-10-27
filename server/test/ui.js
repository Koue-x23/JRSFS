// Browser-logic test: renders every page module in a DOM emulator against the live API.
// Usage: BASE=http://localhost:3000 node server/test/ui.js
let Window;
try {
  ({ Window } = await import('happy-dom'));
} catch {
  console.log('happy-dom is not installed — run "npm install" to enable the browser-logic tests.');
  process.exit(0);
}

const BASE = process.env.BASE || 'http://localhost:3000';
const window = new Window({ url: `${BASE}/#/dashboard` });
const { document } = window;

for (const key of [
  'window',
  'document',
  'location',
  'history',
  'HTMLElement',
  'HTMLIFrameElement',
  'Node',
  'Event',
  'CustomEvent',
  'HashChangeEvent',
  'CSS',
  'getComputedStyle',
  'requestAnimationFrame',
]) {
  globalThis[key] = window[key];
}
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.URL = URL;
globalThis.URLSearchParams = URLSearchParams;

// Node's fetch needs absolute URLs; the app uses relative ones.
const nodeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  if (typeof input === 'string' && input.startsWith('/')) return nodeFetch(`${BASE}${input}`, init);
  return nodeFetch(input, init);
};
window.fetch = globalThis.fetch;

const failures = [];
const check = (name, condition, extra = '') => {
  if (condition) console.log(`  ✓ ${name}`);
  else {
    failures.push(name);
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`);
  }
};
const sleep = (ms = 250) => new Promise((r) => setTimeout(r, ms));

document.body.innerHTML = `
  <aside id="sidebar"><button id="sidebar-close"></button></aside>
  <div id="sidebar-scrim"></div>
  <button id="menu-btn"></button>
  <nav id="nav"></nav>
  <h1 id="page-title"></h1><p id="page-subtitle"></p>
  <div id="topbar-actions"></div>
  <main id="view"></main>
  <div id="modal-root"></div>
  <div id="toast-root"></div>`;

const modules = {
  dashboard: await import('../../public/js/pages/dashboard.js'),
  quotations: await import('../../public/js/pages/quotations.js'),
  quotationForm: await import('../../public/js/pages/quotation-form.js'),
  quotationDetail: await import('../../public/js/pages/quotation-detail.js'),
  invoices: await import('../../public/js/pages/invoices.js'),
  invoiceForm: await import('../../public/js/pages/invoice-form.js'),
  invoiceDetail: await import('../../public/js/pages/invoice-detail.js'),
  services: await import('../../public/js/pages/service-reports.js'),
  serviceForm: await import('../../public/js/pages/service-form.js'),
  serviceDetail: await import('../../public/js/pages/service-detail.js'),
  statements: await import('../../public/js/pages/statements.js'),
  statementForm: await import('../../public/js/pages/statement-form.js'),
  statementDetail: await import('../../public/js/pages/statement-detail.js'),
  customers: await import('../../public/js/pages/customers.js'),
  customerForm: await import('../../public/js/pages/customer-form.js'),
  customerDetail: await import('../../public/js/pages/customer-detail.js'),
  products: await import('../../public/js/pages/products.js'),
  payments: await import('../../public/js/pages/payments.js'),
  reports: await import('../../public/js/pages/reports.js'),
  settings: await import('../../public/js/pages/settings.js'),
};
const { refreshLookups, getState } = await import('../../public/js/shell.js');
const { ensureFixtures } = await import('./fixtures.js');

const api = async (endpoint) => (await fetch(`${BASE}/api${endpoint}`)).json();

async function renderPage(name, { params = {}, query = {} } = {}) {
  const host = document.getElementById('view');
  host.replaceChildren();
  const view = document.createElement('div');
  host.appendChild(view);
  const app = { getState, refreshLookups, route: () => {} };
  try {
    await modules[name].render({ view, params, query, app });
    await sleep(220);
    return view;
  } catch (err) {
    console.log(`  ✗ ${name} threw: ${err.message}`);
    failures.push(name);
    return view;
  }
}

const has = (view, text) => view.textContent.includes(text);

const post = async (endpoint, body) => {
  const res = await fetch(`${BASE}/api${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
};

async function main() {
  const fixtures = await ensureFixtures(null, post);
  if (fixtures.seeded) console.log('  (created fixture records for an empty database)');
  await refreshLookups();
  const activeInvoices = await api('/invoices?status=open');
  const quotations = await api('/quotations');
  const invoices = await api('/invoices');
  const services = await api('/service-reports');
  const statements = await api('/billing-statements');
  const customers = await api('/customers');
  let draftQuotation = quotations.find((q) => !q.invoiceId);
  if (!draftQuotation) {
    draftQuotation = await post(`/quotations/${quotations[0].id}/duplicate`, {});
  }

  console.log('\nPage rendering');
  let view = await renderPage('dashboard');
  check('dashboard renders totals', has(view, 'Total quotations') && has(view, 'Outstanding balances'));
  check('dashboard has no login prompts', !/sign in|log in|password/i.test(view.textContent));

  view = await renderPage('quotations');
  check('quotation list renders rows', view.querySelectorAll('tbody tr').length > 0 && has(view, 'QTN-'));

  view = await renderPage('quotationForm');
  check('quotation form renders line items', view.querySelectorAll('#items-body tr').length === 1);
  check('quotation form has totals panel', has(view, 'Grand total'));

  view = await renderPage('quotationForm', { params: { id: draftQuotation.id } });
  check('quotation edit form loads data', view.querySelector('[name="customerName"]').value === draftQuotation.customerName);

  view = await renderPage('quotationDetail', { params: { id: quotations[0].id } });
  check('quotation detail shows PDF iframe', Boolean(view.querySelector('iframe.doc-frame')));
  check('quotation detail shows line items', view.querySelectorAll('table.data tbody tr').length > 0);

  view = await renderPage('invoices');
  check('invoice list renders rows', has(view, 'INV-') && view.querySelectorAll('tbody tr').length > 0);

  view = await renderPage('invoiceForm');
  check('invoice form renders', Boolean(view.querySelector('[name="invoiceDate"]')) && has(view, 'Invoice total'));

  view = await renderPage('invoiceDetail', { params: { id: invoices[0].id } });
  check('invoice detail shows payments section', has(view, 'Payment history'));
  check('invoice detail shows balance', has(view, 'Remaining balance'));

  view = await renderPage('services');
  check('service list renders', has(view, 'SR-'));

  view = await renderPage('serviceForm');
  check('service form renders sections', has(view, 'Reported problem') && has(view, 'Photo documentation'));

  view = await renderPage('serviceDetail', { params: { id: services[0].id } });
  check('service detail renders', has(view, 'Service details') && has(view, 'Signatures'));

  view = await renderPage('statements');
  check('statement list renders', has(view, 'BS-'));

  view = await renderPage('statementForm');
  check('statement form renders preview', has(view, 'Statement preview') && has(view, 'Outstanding balance'));

  view = await renderPage('statementDetail', { params: { id: statements[0].id } });
  check('statement detail renders ledger', has(view, 'Running balance'));

  view = await renderPage('customers');
  check('customer list renders', has(view, 'CUS-') && view.querySelectorAll('tbody tr').length > 0);

  view = await renderPage('customerForm');
  check('customer form renders', Boolean(view.querySelector('[name="name"]')));

  view = await renderPage('customerDetail', { params: { id: customers[0].id } });
  check('customer detail shows transactions', has(view, 'Outstanding balance') && view.querySelectorAll('[data-tab]').length === 5);

  view = await renderPage('products');
  check('products page renders catalog', has(view, 'Default price') && view.querySelectorAll('tbody tr').length > 0);

  view = await renderPage('payments');
  check('payments page renders records', has(view, 'PAY-'));

  view = await renderPage('reports');
  check('reports page renders summaries', has(view, 'INVOICED (PERIOD)') || has(view, 'Invoiced (period)'));
  check('reports distinguish collected from invoiced', has(view, 'Payments received') && has(view, 'Invoiced'));

  view = await renderPage('settings');
  check('settings page renders profile', Boolean(view.querySelector('[name="businessName"]')) && has(view, 'Logo'));
  check('settings has preview + save + cancel', has(view, 'Preview documents') && has(view, 'Cancel changes'));

  console.log('\nInteractions');

  // Search filtering on the quotations page.
  view = await renderPage('quotations');
  const before = view.querySelectorAll('tbody tr').length;
  const search = view.querySelector('#search-input');
  search.value = customers[0].name;
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  await sleep(600);
  const after = view.querySelectorAll('tbody tr').length;
  check('search filters the quotation list', after > 0 && after <= before, `${before} -> ${after}`);

  // Product selection fills price in the invoice form.
  view = await renderPage('invoiceForm');
  const productSelect = view.querySelector('select[data-key="productId"]');
  const option = [...productSelect.options].find((o) => o.value && o.dataset.price === '12500');
  if (option) {
    productSelect.value = option.value;
    productSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
    await sleep(80);
    const price = view.querySelector('input[data-key="unitPrice"]').value;
    check('selecting a product fills its price', Number(price) === 12500, price);
    check('line total recalculates', has(view, '₱12,500.00'));
  } else {
    check('selecting a product fills its price', false, 'no product option found');
  }

  // Creating a quotation through the form.
  view = await renderPage('quotationForm');
  view.querySelector('[name="customerName"]').value = 'UI Test Customer';
  view.querySelector('[name="projectName"]').value = 'UI Test Project';
  view.querySelector('[name="issueDate"]').value = '2026-10-27';
  view.querySelector('[name="validUntil"]').value = '2026-11-27';
  const desc = view.querySelector('textarea[data-key="description"]');
  desc.value = 'UI test line item';
  desc.dispatchEvent(new window.Event('input', { bubbles: true }));
  const qty = view.querySelector('input[data-key="quantity"]');
  qty.value = '2';
  qty.dispatchEvent(new window.Event('input', { bubbles: true }));
  const price = view.querySelector('input[data-key="unitPrice"]');
  price.value = '750';
  price.dispatchEvent(new window.Event('input', { bubbles: true }));
  await sleep(60);
  check('live form totals update', has(view, '₱1,500.00'));
  const form = view.querySelector('#quotation-form');
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(900);
  const latest = (await api('/quotations?search=UI Test Customer'))[0];
  const expected = Math.round(1500 * (1 + (latest?.taxRate || 0) / 100) * 100) / 100;
  check(
    'quotation form saves to the database',
    Boolean(latest) && latest.subtotal === 1500 && latest.grandTotal === expected,
    JSON.stringify(latest || {}).slice(0, 160)
  );

  // Record-payment modal opens with a balance cap hint.
  const open = activeInvoices[0];
  if (open) {
    const modal = await modules.payments.openPaymentModal({ invoice: open });
    await sleep(120);
    const amount = document.querySelector('#modal-root [name="amount"]');
    check('payment modal opens for an invoice', Boolean(amount) && document.querySelector('#modal-root').textContent.includes(open.number));
    check('payment modal defaults to the balance', Number(amount?.value) === open.balance, amount?.value);
    modal.close();
  } else {
    check('payment modal opens for an invoice', true, 'no open invoices');
  }

  // Business settings save round-trip through the form.
  view = await renderPage('settings');
  const nameInput = view.querySelector('[name="businessName"]');
  nameInput.value = 'Johnrois Stainless Steel Fabrication Shop';
  view.querySelector('[name="mobile"]').value = '0917 111 2222';
  view.querySelector('#settings-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(900);
  const settings = await api('/settings');
  check('settings form persists changes', settings.mobile === '0917 111 2222');

  // Product modal: add a catalog item through the UI.
  view = await renderPage('products');
  view.querySelector('#add-product').click();
  await sleep(120);
  const modal = document.querySelector('#modal-root .modal');
  check('product modal opens', Boolean(modal));
  if (modal) {
    modal.querySelector('[name="name"]').value = 'UI Test Railing';
    modal.querySelector('[name="defaultPrice"]').value = '3200';
    modal.querySelector('[name="unit"]').value = 'meter';
    modal.querySelector('.modal-foot .btn-primary').click();
    await sleep(900);
    const created = (await api('/products?search=UI Test Railing'))[0];
    check('product modal saves to the catalog', Boolean(created) && created.defaultPrice === 3200 && created.unit === 'meter');
  }

  // Service report created through the form.
  const servicesBefore = (await api('/service-reports')).length;
  view = await renderPage('serviceForm');
  view.querySelector('[name="customerName"]').value = 'UI Service Customer';
  view.querySelector('[name="serviceDate"]').value = '2026-10-27';
  view.querySelector('[name="equipment"]').value = 'UI test chiller';
  view.querySelector('[name="status"]').value = 'completed';
  view.querySelector('#service-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(900);
  const servicesAfter = await api('/service-reports');
  check('service report form saves', servicesAfter.length === servicesBefore + 1 && servicesAfter.some((r) => r.customerName === 'UI Service Customer'));

  // Invoice edit through the form.
  const editableInvoice = invoices[0];
  view = await renderPage('invoiceForm', { params: { id: editableInvoice.id } });
  view.querySelector('[name="remarks"]').value = 'Edited from the UI test';
  view.querySelector('#invoice-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(900);
  const savedInvoice = await api(`/invoices/${editableInvoice.id}`);
  check('invoice form saves edits', savedInvoice.remarks === 'Edited from the UI test');

  // Billing statement created through the form.
  const statementsBefore = (await api('/billing-statements')).length;
  view = await renderPage('statementForm');
  view.querySelector('[name="periodFrom"]').value = '2026-10-01';
  view.querySelector('[name="periodTo"]').value = '2026-10-31';
  view.querySelector('[name="periodFrom"]').dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(600);
  view.querySelector('#statement-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(900);
  const statementsAfter = await api('/billing-statements');
  check('statement form saves', statementsAfter.length === statementsBefore + 1);

  // Customer creation through the form + archive action.
  view = await renderPage('customerForm');
  view.querySelector('[name="name"]').value = 'UI Archived Customer';
  view.querySelector('[name="phone"]').value = '0917 000 1111';
  view.querySelector('#customer-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(900);
  const uiCustomer = (await api('/customers?search=UI Archived Customer'))[0];
  check('customer form saves', Boolean(uiCustomer));
  if (uiCustomer) {
    const archived = await fetch(`${BASE}/api/customers/${uiCustomer.id}/archive`, { method: 'POST' });
    check('customer archive endpoint works', archived.status === 200);
  }

  // Prefilled customer from the customer detail quick actions.
  view = await renderPage('quotationForm', { query: { customer: String(customers[0].id) } });
  check(
    'quotation form prefills a customer from the link',
    view.querySelector('[name="customerName"]').value === customers[0].name &&
      view.querySelector('[name="customerId"]').value === String(customers[0].id)
  );

  // Backup links exist on the settings page.
  view = await renderPage('settings');
  check(
    'settings exposes backup downloads',
    Boolean(view.querySelector('a[href="/api/backup/json"]')) && Boolean(view.querySelector('a[href="/api/backup/database"]'))
  );

  console.log(`\n${failures.length ? `${failures.length} UI check(s) failed: ${failures.join(', ')}` : 'All UI checks passed.'}`);
  if (failures.length) process.exitCode = 1;
  window.close();
}

main().catch((err) => {
  console.error('UI test crashed:', err);
  process.exitCode = 1;
});
