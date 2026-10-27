// Application shell: routing (no authentication by design), navigation, lookups.
import { icon, esc, toast, loadingBlock, errorBlock } from './ui.js';
import { refreshLookups, setPageMeta, state } from './shell.js';

import * as dashboardPage from './pages/dashboard.js';
import * as quotationsPage from './pages/quotations.js';
import * as quotationForm from './pages/quotation-form.js';
import * as quotationDetail from './pages/quotation-detail.js';
import * as invoicesPage from './pages/invoices.js';
import * as invoiceForm from './pages/invoice-form.js';
import * as invoiceDetail from './pages/invoice-detail.js';
import * as servicesPage from './pages/service-reports.js';
import * as serviceForm from './pages/service-form.js';
import * as serviceDetail from './pages/service-detail.js';
import * as statementsPage from './pages/statements.js';
import * as statementForm from './pages/statement-form.js';
import * as statementDetail from './pages/statement-detail.js';
import * as customersPage from './pages/customers.js';
import * as customerForm from './pages/customer-form.js';
import * as customerDetail from './pages/customer-detail.js';
import * as productsPage from './pages/products.js';
import * as paymentsPage from './pages/payments.js';
import * as reportsPage from './pages/reports.js';
import * as settingsPage from './pages/settings.js';

const NAV = [
  { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { path: '/quotations', label: 'Quotations', icon: 'quotation' },
  { path: '/invoices', label: 'Invoices', icon: 'invoice' },
  { path: '/service-reports', label: 'Service Reports', icon: 'service' },
  { path: '/statements', label: 'Billing Statements', icon: 'statement' },
  { path: '/customers', label: 'Customers', icon: 'customers' },
  { path: '/products', label: 'Products & Services', icon: 'products' },
  { path: '/payments', label: 'Payments', icon: 'payments' },
  { path: '/reports', label: 'Reports', icon: 'reports' },
  { path: '/settings', label: 'Business Settings', icon: 'settings' },
];

const ROUTES = [
  { pattern: ['dashboard'], page: dashboardPage, title: 'Dashboard' },
  {
    pattern: ['quotations'],
    page: quotationsPage,
    title: 'Quotations',
    action: { label: 'New quotation', href: '#/quotations/new', icon: 'plus' },
  },
  { pattern: ['quotations', 'new'], page: quotationForm, title: 'New quotation' },
  { pattern: ['quotations', ':id', 'edit'], page: quotationForm, title: 'Edit quotation' },
  { pattern: ['quotations', ':id'], page: quotationDetail, title: 'Quotation' },
  {
    pattern: ['invoices'],
    page: invoicesPage,
    title: 'Invoices',
    action: { label: 'New invoice', href: '#/invoices/new', icon: 'plus' },
  },
  { pattern: ['invoices', 'new'], page: invoiceForm, title: 'New invoice' },
  { pattern: ['invoices', ':id', 'edit'], page: invoiceForm, title: 'Edit invoice' },
  { pattern: ['invoices', ':id'], page: invoiceDetail, title: 'Invoice' },
  {
    pattern: ['service-reports'],
    page: servicesPage,
    title: 'Service Reports',
    action: { label: 'New service report', href: '#/service-reports/new', icon: 'plus' },
  },
  { pattern: ['service-reports', 'new'], page: serviceForm, title: 'New service report' },
  { pattern: ['service-reports', ':id', 'edit'], page: serviceForm, title: 'Edit service report' },
  { pattern: ['service-reports', ':id'], page: serviceDetail, title: 'Service report' },
  {
    pattern: ['statements'],
    page: statementsPage,
    title: 'Billing Statements',
    action: { label: 'New billing statement', href: '#/statements/new', icon: 'plus' },
  },
  { pattern: ['statements', 'new'], page: statementForm, title: 'New billing statement' },
  { pattern: ['statements', ':id'], page: statementDetail, title: 'Billing statement' },
  {
    pattern: ['customers'],
    page: customersPage,
    title: 'Customers',
    action: { label: 'Add customer', href: '#/customers/new', icon: 'plus' },
  },
  { pattern: ['customers', 'new'], page: customerForm, title: 'New customer' },
  { pattern: ['customers', ':id', 'edit'], page: customerForm, title: 'Edit customer' },
  { pattern: ['customers', ':id'], page: customerDetail, title: 'Customer' },
  {
    pattern: ['products'],
    page: productsPage,
    title: 'Products & Services',
    action: { label: 'Add product or service', href: '#/products?new=1', icon: 'plus' },
  },
  {
    pattern: ['payments'],
    page: paymentsPage,
    title: 'Payments',
    action: { label: 'Record payment', href: '#/payments?new=1', icon: 'plus' },
  },
  { pattern: ['reports'], page: reportsPage, title: 'Reports' },
  { pattern: ['settings'], page: settingsPage, title: 'Business Settings' },
];

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/dashboard';
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(queryPart || ''));
  return { segments, query, path: `/${segments.join('/')}` };
}

function matchRoute(segments) {
  for (const route of ROUTES) {
    if (route.pattern.length !== segments.length) continue;
    const params = {};
    let ok = true;
    route.pattern.forEach((part, i) => {
      if (part.startsWith(':')) params[part.slice(1)] = decodeURIComponent(segments[i]);
      else if (part !== segments[i]) ok = false;
    });
    if (ok) return { route, params };
  }
  return null;
}

function renderNav(activePath) {
  document.getElementById('nav').innerHTML = `<div class="nav-group-label">Shop management</div>${NAV.map((item) => {
    const active = activePath === item.path || activePath.startsWith(`${item.path}/`);
    return `<a class="nav-item ${active ? 'active' : ''}" href="#${item.path}" data-nav="${item.path}">${icon(
      item.icon,
      17
    )}<span>${esc(item.label)}</span></a>`;
  }).join('')}`;
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-scrim').classList.remove('show');
}

async function route() {
  const { segments, query, path } = parseHash();
  const match = matchRoute(segments);
  const view = document.getElementById('view');
  renderNav(match ? `/${match.route.pattern[0]}` : '');
  closeSidebar();
  document.getElementById('modal-root').innerHTML = '';
  document.body.style.overflow = '';

  if (!match) {
    setPageMeta({ title: 'Page not found' });
    view.innerHTML = `<div class="card"><div class="empty">
      <div class="empty-icon">${icon('alertCircle', 22)}</div>
      <h3>Page not found</h3>
      <p>The page “${esc(path)}” does not exist. Use the sidebar to open a module.</p>
      <div class="btn-row mt-8"><a class="btn btn-primary" href="#/dashboard">Go to Dashboard</a></div>
    </div></div>`;
    return;
  }

  const { route: matched, params } = match;
  setPageMeta({ title: matched.title, action: matched.action || null });
  view.innerHTML = loadingBlock();
  window.scrollTo({ top: 0 });
  try {
    await matched.page.render({ view, params, query, app: { getState: () => state, refreshLookups, route } });
  } catch (err) {
    console.error(err);
    view.innerHTML = errorBlock(err);
    toast(err?.message || 'The page could not be loaded.', 'error', 'Load failed');
  }
}

// Sidebar behaviour
document.getElementById('menu-btn').innerHTML = icon('menu', 18);
document.getElementById('sidebar-close').innerHTML = icon('close', 16);
document.getElementById('menu-btn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-scrim').classList.add('show');
});
document.getElementById('sidebar-close').addEventListener('click', closeSidebar);
document.getElementById('sidebar-scrim').addEventListener('click', closeSidebar);
document.getElementById('nav').addEventListener('click', (e) => {
  if (e.target.closest('[data-nav]')) closeSidebar();
});

// Error-state retry buttons (no inline handlers, keeping a strict CSP).
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-reload]')) location.reload();
});

// "/" focuses the page search field.
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '/') {
    const search = document.querySelector('.toolbar .search input');
    if (search) {
      e.preventDefault();
      search.focus();
    }
  }
});

window.addEventListener('hashchange', route);
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason?.name === 'ApiError') {
    toast(e.reason.message, 'error');
    e.preventDefault();
  }
});

async function start() {
  const view = document.getElementById('view');
  try {
    await refreshLookups();
  } catch (err) {
    view.innerHTML = errorBlock(
      new Error(`The application server could not be reached (${err.message}). Make sure it is running, then reload.`)
    );
    return;
  }
  if (!location.hash) history.replaceState(null, '', '#/dashboard');
  await route();
}

start();
