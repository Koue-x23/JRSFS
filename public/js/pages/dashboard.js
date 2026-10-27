// Dashboard — every figure comes from saved records via /api/dashboard.
import { api } from '../api.js';
import {
  icon,
  esc,
  money,
  formatDate,
  statusBadge,
  emptyState,
  setPageMeta,
} from './shared.js';

const kindMeta = {
  quotation: { label: 'Quotation', icon: 'quotation', href: (id) => `#/quotations/${id}` },
  invoice: { label: 'Invoice', icon: 'invoice', href: (id) => `#/invoices/${id}` },
  service: { label: 'Service report', icon: 'service', href: (id) => `#/service-reports/${id}` },
  statement: { label: 'Billing statement', icon: 'statement', href: (id) => `#/statements/${id}` },
  payment: { label: 'Payment', icon: 'payments', href: () => `#/payments` },
};

function kpi({ label, value, meta = '', href = '', tone = '', moneyValue = false, iconName = '' }) {
  const tag = href ? 'a' : 'div';
  const cls = `kpi ${tone}`;
  const valueClass = moneyValue ? 'money' : '';
  return `<${tag} class="${cls}" ${href ? `href="${esc(href)}"` : ''} style="text-decoration:none;color:inherit">
    ${iconName ? `<span class="kpi-icon">${icon(iconName, 18)}</span>` : ''}
    <span class="kpi-label">${esc(label)}</span>
    <span class="kpi-value ${valueClass}">${value}</span>
    ${meta ? `<span class="kpi-meta">${meta}</span>` : ''}
  </${tag}>`;
}

export async function render({ view, app }) {
  const data = await api.get('/dashboard');
  const { settings } = app.getState();
  const hasAnyRecords =
    data.quotations.total + data.invoices.total + data.services.total + data.statements.total + data.customers.total > 0;

  setPageMeta({
    title: 'Dashboard',
    subtitle: `As of ${formatDate(data.today)} · ${settings.businessName}`,
    action: { label: 'New quotation', href: '#/quotations/new', icon: 'plus' },
  });

  const q = data.quotations;
  const inv = data.invoices;
  const svc = data.services;

  const quickActions = [
    { label: 'Create quotation', href: '#/quotations/new', icon: 'quotation' },
    { label: 'Create invoice', href: '#/invoices/new', icon: 'invoice' },
    { label: 'Service report', href: '#/service-reports/new', icon: 'service' },
    { label: 'Billing statement', href: '#/statements/new', icon: 'statement' },
    { label: 'Record payment', href: '#/payments?new=1', icon: 'payments' },
    { label: 'Add customer', href: '#/customers/new', icon: 'customers' },
  ];

  const recentRows = data.recentTransactions
    .map((row) => {
      const meta = kindMeta[row.kind] || kindMeta.quotation;
      return `<tr class="clickable" data-href="${meta.href(row.id)}">
        <td><span class="badge plain draft">${icon(meta.icon, 12)} ${esc(meta.label)}</span></td>
        <td><span class="doc-link">${esc(row.number)}</span>${
          row.invoiceNumber ? `<span class="sub">Invoice ${esc(row.invoiceNumber)}</span>` : ''
        }</td>
        <td>${esc(row.customer || '—')}</td>
        <td class="nowrap">${formatDate(row.date, 'short')}</td>
        <td class="num">${row.kind === 'service' ? money(row.amount) : money(row.amount)}</td>
        <td>${row.kind === 'payment' ? statusBadge('paid', 'Received') : statusBadge(row.status)}</td>
      </tr>`;
    })
    .join('');

  const activity = data.customerActivity
    .map(
      (c) => `<div class="activity-item">
        <div class="activity-avatar">${esc(
          String(c.customer || '?')
            .split(/\s+/)
            .slice(0, 2)
            .map((w) => w[0])
            .join('')
            .toUpperCase()
        )}</div>
        <div style="min-width:0">
          <div class="strong truncate" style="font-size:13px">${esc(c.customer)}</div>
          <div class="meta">${esc(kindMeta[c.lastKind]?.label || 'Activity')} ${esc(c.lastNumber)} · ${formatDate(
            c.lastActivity,
            'short'
          )}</div>
        </div>
        <div class="go small tabular">${money(c.amount)}</div>
      </div>`
    )
    .join('');

  view.innerHTML = `
    <div class="page-head">
      <div>
        <h2 style="font-size:15px">Business overview</h2>
        <p>Live totals from your saved quotations, invoices, payments and service reports. Click any figure to open the matching records.</p>
      </div>
      <div class="actions">
        <a class="btn" href="#/reports">${icon('reports', 15)} Reports</a>
        <a class="btn btn-primary" href="#/quotations/new">${icon('plus', 15)} New quotation</a>
      </div>
    </div>

    ${
      hasAnyRecords
        ? ''
        : `<div class="callout info mb-16">${icon('info', 16)}
            <div><strong>Start with your business profile.</strong> Documents are generated from Business Settings. Review the business name, address and contact details, then add your first customer and product. No sample transactions are shown — every statistic below comes from records you create.</div>
          </div>`
    }

    <div class="kpi-section">Quotations</div>
    <div class="kpi-grid">
      ${kpi({ label: 'Total quotations', value: q.total, href: '#/quotations', iconName: 'quotation' })}
      ${kpi({
        label: 'Pending quotations',
        value: q.pending,
        meta: `<span>${q.draft} draft · ${q.sent} sent</span>`,
        href: '#/quotations?status=pending',
        tone: 'warn',
      })}
      ${kpi({
        label: 'Approved quotations',
        value: q.approved,
        meta: `<span>${q.rejected} rejected · ${q.expired} expired</span>`,
        href: '#/quotations?status=approved',
        tone: 'ok',
      })}
      ${kpi({
        label: 'Approved value',
        value: money(q.approvedValue),
        moneyValue: true,
        href: '#/quotations?status=approved',
        meta: `<span>${money(q.pendingValue)} still pending</span>`,
        tone: 'ok',
      })}
    </div>

    <div class="kpi-section">Invoices &amp; balances</div>
    <div class="kpi-grid">
      ${kpi({ label: 'Total invoices', value: inv.total, href: '#/invoices', iconName: 'invoice' })}
      ${kpi({ label: 'Unpaid invoices', value: inv.unpaid, href: '#/invoices?status=unpaid', tone: inv.unpaid ? 'warn' : '' })}
      ${kpi({ label: 'Partially paid', value: inv.partial, href: '#/invoices?status=partial', tone: inv.partial ? 'warn' : '' })}
      ${kpi({ label: 'Overdue invoices', value: inv.overdue, href: '#/invoices?status=overdue', tone: inv.overdue ? 'accent' : '' })}
      ${kpi({ label: 'Invoiced amount', value: money(inv.invoiced), moneyValue: true, href: '#/invoices', meta: '<span>All invoices on record</span>' })}
      ${kpi({ label: 'Payments received', value: money(data.payments.received), moneyValue: true, href: '#/payments', meta: `<span>${data.payments.totalRecorded} payment(s)</span>`, tone: 'ok' })}
      ${kpi({ label: 'Outstanding balances', value: money(inv.outstanding), moneyValue: true, href: '#/reports', meta: '<span>Unpaid invoice balances</span>', tone: 'accent' })}
      ${kpi({ label: 'Paid invoices', value: inv.paid, href: '#/invoices?status=paid', tone: 'ok' })}
    </div>

    <div class="kpi-section">Operations</div>
    <div class="kpi-grid">
      ${kpi({ label: 'Billing statements', value: data.statements.total, href: '#/statements', iconName: 'statement' })}
      ${kpi({ label: 'Service reports', value: svc.total, href: '#/service-reports', iconName: 'service', meta: `<span>${svc.completed} completed · ${svc.in_progress} in progress</span>` })}
      ${kpi({ label: 'Customers', value: data.customers.total, href: '#/customers', iconName: 'customers' })}
      ${kpi({ label: 'Payment records', value: data.payments.totalRecorded, href: '#/payments', iconName: 'payments', meta: `<span>${money(data.payments.received)} received</span>` })}
    </div>

    <div class="grid grid-2 mt-24">
      <div class="card">
        <div class="card-head">
          <h2>Recent transactions</h2>
          <span class="sub">Newest documents and payments</span>
          <div class="card-actions"><a class="btn btn-sm btn-ghost" href="#/reports">Open reports ${icon('arrowRight', 13)}</a></div>
        </div>
        ${
          data.recentTransactions.length
            ? `<div class="table-wrap"><table class="data">
                <thead><tr><th>Type</th><th>Reference</th><th>Customer</th><th>Date</th><th class="num">Amount</th><th>Status</th></tr></thead>
                <tbody>${recentRows}</tbody>
              </table></div>`
            : emptyState({
                title: 'No transactions yet',
                message: 'Create a quotation or invoice and it will appear here immediately.',
                iconName: 'invoice',
                actionHtml: `<a class="btn btn-primary" href="#/quotations/new">${icon('plus', 15)} Create quotation</a>
                  <a class="btn" href="#/invoices/new">Create invoice</a>`,
              })
        }
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head"><h2>Quick actions</h2></div>
          <div class="card-body">
            <div class="quick-grid">
              ${quickActions
                .map(
                  (a) => `<a class="quick-action" href="${a.href}">
                    <span class="qa-icon">${icon(a.icon, 17)}</span>
                    <span>${esc(a.label)}</span>
                  </a>`
                )
                .join('')}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Recent customer activity</h2></div>
          ${
            activity
              ? `<div class="activity-list">${activity}</div>`
              : `<div class="card-body muted small">Customer activity appears once you save quotations, invoices or service reports.</div>`
          }
        </div>
      </div>
    </div>

    <style>
      .quick-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }
      .quick-action {
        display: flex; align-items: center; gap: 9px; padding: 10px 11px; border: 1px solid var(--line);
        border-radius: 6px; color: var(--ink); font-size: 12.5px; font-weight: 550; text-decoration: none;
        background: var(--surface-alt);
      }
      .quick-action:hover { border-color: var(--line-strong); background: #fff; text-decoration: none; }
      .quick-action .qa-icon { color: var(--accent); display: flex; }
    </style>
  `;

  view.querySelectorAll('[data-href]').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      location.hash = row.dataset.href;
    });
  });
}
