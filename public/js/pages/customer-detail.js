import { api } from '../api.js';
import {
  icon,
  esc,
  money,
  formatDate,
  statusBadge,
  toast,
  confirmDialog,
  setPageMeta,
  navigate,
} from './shared.js';

function docTable({ rows, columns, emptyText, hrefFor }) {
  if (!rows.length) return `<div class="table-empty">${esc(emptyText)}</div>`;
  return `<div class="table-wrap"><table class="data">
    <thead><tr>${columns.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('')}<th></th></tr></thead>
    <tbody>${rows
      .map(
        (row) => `<tr class="clickable" data-href="${hrefFor(row)}">
          ${columns
            .map((c) => `<td class="${c.num ? 'num' : ''}">${c.render ? c.render(row) : esc(row[c.key] ?? '—')}</td>`)
            .join('')}
          <td><div class="row-actions"><a class="btn btn-sm btn-ghost" href="${hrefFor(row)}">${icon('arrowRight', 14)}</a></div></td>
        </tr>`
      )
      .join('')}</tbody></table></div>`;
}

export async function render({ view, params }) {
  view.innerHTML = '<div class="loading-block"><span class="spinner"></span> Loading customer…</div>';
  const c = await api.get(`/customers/${params.id}`);
  setPageMeta({ title: c.name, subtitle: `${c.code}${c.companyName ? ` · ${c.companyName}` : ''}` });

  const tabs = [
    { key: 'invoices', label: `Invoices (${c.invoices.length})` },
    { key: 'quotations', label: `Quotations (${c.quotations.length})` },
    { key: 'payments', label: `Payments (${c.payments.length})` },
    { key: 'services', label: `Service reports (${c.serviceReports.length})` },
    { key: 'statements', label: `Statements (${c.statements.length})` },
  ];

  const content = {
    invoices: docTable({
      rows: c.invoices,
      emptyText: 'No invoices for this customer yet.',
      hrefFor: (r) => `#/invoices/${r.id}`,
      columns: [
        { label: 'Invoice', render: (r) => `<span class="doc-link">${esc(r.number)}</span>` },
        { label: 'Date', render: (r) => formatDate(r.invoiceDate, 'short') },
        { label: 'Due', render: (r) => (r.dueDate ? formatDate(r.dueDate, 'short') : '—') },
        { label: 'Total', num: true, render: (r) => money(r.total) },
        { label: 'Balance', num: true, render: (r) => money(r.balance) },
        { label: 'Status', render: (r) => statusBadge(r.status) },
      ],
    }),
    quotations: docTable({
      rows: c.quotations,
      emptyText: 'No quotations for this customer yet.',
      hrefFor: (r) => `#/quotations/${r.id}`,
      columns: [
        { label: 'Quotation', render: (r) => `<span class="doc-link">${esc(r.number)}</span>` },
        { label: 'Project', key: 'projectName' },
        { label: 'Issued', render: (r) => formatDate(r.issueDate, 'short') },
        { label: 'Total', num: true, render: (r) => money(r.grandTotal) },
        { label: 'Status', render: (r) => statusBadge(r.effectiveStatus) },
      ],
    }),
    payments: docTable({
      rows: c.payments,
      emptyText: 'No payments recorded for this customer yet.',
      hrefFor: (r) => `#/invoices/${r.invoiceId}`,
      columns: [
        { label: 'Reference', render: (r) => `<span class="doc-link">${esc(r.reference)}</span>` },
        { label: 'Date', render: (r) => formatDate(r.paymentDate, 'short') },
        { label: 'Invoice', key: 'invoiceNumber' },
        { label: 'Method', key: 'method' },
        { label: 'Amount', num: true, render: (r) => money(r.amount) },
      ],
    }),
    services: docTable({
      rows: c.serviceReports,
      emptyText: 'No service reports for this customer yet.',
      hrefFor: (r) => `#/service-reports/${r.id}`,
      columns: [
        { label: 'Report', render: (r) => `<span class="doc-link">${esc(r.number)}</span>` },
        { label: 'Service date', render: (r) => formatDate(r.serviceDate, 'short') },
        { label: 'Equipment', key: 'equipment' },
        { label: 'Cost', num: true, render: (r) => money(r.totalCost) },
        { label: 'Status', render: (r) => statusBadge(r.status) },
      ],
    }),
    statements: docTable({
      rows: c.statements,
      emptyText: 'No billing statements for this customer yet.',
      hrefFor: (r) => `#/statements/${r.id}`,
      columns: [
        { label: 'Statement', render: (r) => `<span class="doc-link">${esc(r.number)}</span>` },
        {
          label: 'Period',
          render: (r) => `${formatDate(r.periodFrom, 'short')} – ${formatDate(r.periodTo, 'short')}`,
        },
        { label: 'Date', render: (r) => formatDate(r.statementDate, 'short') },
        { label: 'Outstanding', num: true, render: (r) => money(r.outstandingBalance) },
      ],
    }),
  };

  view.innerHTML = `
    <div class="detail-head">
      <div class="doc-title">
        <span class="eyebrow">Customer · ${esc(c.code)}</span>
        <h2>${esc(c.name)}</h2>
        <div class="meta">
          ${c.companyName ? `<span>${esc(c.companyName)}</span>` : ''}
          ${c.archived ? '<span class="badge archived draft">Archived</span>' : ''}
          ${c.phone ? `<span>· ${esc(c.phone)}</span>` : ''}
          ${c.email ? `<span>· ${esc(c.email)}</span>` : ''}
        </div>
      </div>
      <div class="actions">
        <a class="btn" href="#/customers">${icon('back', 15)} All customers</a>
        <a class="btn" href="#/customers/${c.id}/edit">${icon('edit', 15)} Edit</a>
        <button class="btn ${c.archived ? '' : 'btn-danger'}" id="archive-btn">${icon(
          c.archived ? 'refresh' : 'archive',
          15
        )} ${c.archived ? 'Restore' : 'Archive'}</button>
        <a class="btn btn-primary" href="#/quotations/new?customer=${c.id}">${icon('plus', 15)} New quotation</a>
      </div>
    </div>

    <div class="stat-strip mb-16">
      <div><div class="label">Quotation value</div><div class="value">${money(c.summary.quotationValue)}</div></div>
      <div><div class="label">Invoiced</div><div class="value">${money(c.summary.invoiced)}</div></div>
      <div><div class="label">Payments received</div><div class="value">${money(c.summary.paid)}</div></div>
      <div><div class="label">Outstanding balance</div><div class="value" style="color:var(--accent)">${money(
        c.summary.outstanding
      )}</div></div>
      <div><div class="label">Documents</div><div class="value">${c.invoices.length + c.quotations.length + c.serviceReports.length}</div></div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="tabs" id="customer-tabs">
          ${tabs.map((t, i) => `<button data-tab="${t.key}" class="${i === 0 ? 'active' : ''}">${esc(t.label)}</button>`).join('')}
        </div>
        <div id="tab-body">${content.invoices}</div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head"><h2>Contact information</h2></div>
          <div class="panel-list">
            <div class="panel-row"><div class="label">Customer ID</div><div class="value">${esc(c.code)}</div></div>
            <div class="panel-row"><div class="label">Phone</div><div class="value">${esc(c.phone || '—')}</div></div>
            <div class="panel-row"><div class="label">Email</div><div class="value">${esc(c.email || '—')}</div></div>
            <div class="panel-row"><div class="label">Billing address</div><div class="value">${esc(c.billingAddress || '—')}</div></div>
            <div class="panel-row"><div class="label">Project locations</div><div class="value">${
              c.projectLocations ? esc(c.projectLocations).replace(/\n/g, '<br>') : '—'
            }</div></div>
            <div class="panel-row"><div class="label">Remarks</div><div class="value">${esc(c.remarks || '—')}</div></div>
            <div class="panel-row"><div class="label">Added</div><div class="value small">${formatDate(c.createdAt?.slice(0, 10), 'short')}</div></div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h2>Quick actions</h2></div>
          <div class="card-body">
            <div class="btn-row">
              <a class="btn" href="#/quotations/new?customer=${c.id}">${icon('quotation', 14)} Quotation</a>
              <a class="btn" href="#/invoices/new?customer=${c.id}">${icon('invoice', 14)} Invoice</a>
              <a class="btn" href="#/service-reports/new?customer=${c.id}">${icon('service', 14)} Service report</a>
              <a class="btn" href="#/statements/new?customer=${c.id}">${icon('statement', 14)} Statement</a>
            </div>
            <p class="small muted mt-8">Select this customer in the document form to fill in these details automatically.</p>
          </div>
        </div>
      </div>
    </div>
  `;

  const tabBody = view.querySelector('#tab-body');
  view.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      view.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b === btn));
      tabBody.innerHTML = content[btn.dataset.tab];
    });
  });

  view.querySelector('#archive-btn').addEventListener('click', async () => {
    if (!c.archived) {
      const ok = await confirmDialog({
        title: 'Archive this customer?',
        message: 'All quotations, invoices and payments stay intact and the customer can be restored later.',
        confirmLabel: 'Archive customer',
      });
      if (!ok) return;
    }
    try {
      await api.post(`/customers/${c.id}/${c.archived ? 'restore' : 'archive'}`);
      toast(c.archived ? 'Customer restored.' : 'Customer archived.', 'success');
      navigate(`/customers/${c.id}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
