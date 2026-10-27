import { api } from '../api.js';
import {
  icon,
  esc,
  money,
  formatDate,
  statusBadge,
  emptyState,
  setPageMeta,
  pdfPanel,
  wirePdfPanel,
  TOOLBAR,
  selectFilter,
  dateRangeFilter,
  STATUS_OPTIONS,
  wireRowLinks,
  debounce,
  toast,
} from './shared.js';

export async function render({ view, query }) {
  setPageMeta({
    title: 'Invoices',
    subtitle: 'Bill customers, record payments and track balances.',
    action: { label: 'New invoice', href: '#/invoices/new', icon: 'plus' },
  });

  const filters = {
    search: query.search || '',
    status: query.status || '',
    from: query.from || '',
    to: query.to || '',
  };

  view.innerHTML = `
    <div class="card">
      ${TOOLBAR({
        search: filters.search,
        placeholder: 'Search invoice number, customer, or quotation…',
        filters: `${selectFilter('status-filter', STATUS_OPTIONS.invoice, filters.status)}${dateRangeFilter(filters.from, filters.to)}`,
        actions: `<a class="btn btn-sm" href="#/reports">${icon('reports', 14)} Reports</a>
          <a class="btn btn-sm btn-primary" href="#/invoices/new">${icon('plus', 14)} New invoice</a>`,
      })}
      <div id="list-body"><div class="loading-block"><span class="spinner"></span> Loading invoices…</div></div>
    </div>
    <div class="mt-16" id="detail-panel"></div>
  `;

  const listBody = view.querySelector('#list-body');

  async function load() {
    listBody.innerHTML = '<div class="loading-block"><span class="spinner"></span> Loading…</div>';
    let rows;
    try {
      rows = await api.get('/invoices', filters);
    } catch (err) {
      listBody.innerHTML = `<div class="table-empty">${esc(err.message)}</div>`;
      return;
    }
    if (!rows.length) {
      const filtered = filters.search || filters.status || filters.from || filters.to;
      listBody.innerHTML = filtered
        ? `<div class="table-empty">${icon('search', 20)}<div class="mt-8 strong">No matching invoices</div>
            <div class="small">Try different filters.</div>
            <div class="btn-row" style="justify-content:center;margin-top:10px"><button class="btn btn-sm" id="clear-filters">Clear filters</button></div></div>`
        : emptyState({
            title: 'No invoices yet',
            message: 'Create an invoice directly, or convert an approved quotation into one.',
            iconName: 'invoice',
            actionHtml: `<a class="btn btn-primary" href="#/invoices/new">${icon('plus', 15)} New invoice</a>
              <a class="btn" href="#/quotations?status=approved">Approved quotations</a>`,
          });
      const clear = listBody.querySelector('#clear-filters');
      if (clear)
        clear.addEventListener('click', () => {
          Object.assign(filters, { search: '', status: '', from: '', to: '' });
          view.querySelector('#search-input').value = '';
          view.querySelector('#status-filter').value = '';
          view.querySelector('#filter-from').value = '';
          view.querySelector('#filter-to').value = '';
          load();
        });
      return;
    }
    const totals = rows.reduce(
      (acc, r) => {
        acc.invoiced += r.total;
        acc.paid += r.amountPaid;
        acc.balance += r.balance;
        return acc;
      },
      { invoiced: 0, paid: 0, balance: 0 }
    );

    listBody.innerHTML = `<div class="table-wrap"><table class="data">
      <thead><tr>
        <th>Invoice</th><th>Customer</th><th>Date</th><th>Due date</th>
        <th class="num">Total</th><th class="num">Paid</th><th class="num">Balance</th><th>Status</th><th></th>
      </tr></thead>
      <tbody>${rows
        .map(
          (inv) => `<tr class="clickable" data-href="#/invoices/${inv.id}">
            <td><span class="doc-link">${esc(inv.number)}</span>${
              inv.quotationNumber ? `<span class="sub">from ${esc(inv.quotationNumber)}</span>` : ''
            }</td>
            <td>${esc(inv.customerName)}${inv.companyName ? `<span class="sub">${esc(inv.companyName)}</span>` : ''}</td>
            <td class="nowrap">${formatDate(inv.invoiceDate, 'short')}</td>
            <td class="nowrap">${inv.dueDate ? formatDate(inv.dueDate, 'short') : '—'}</td>
            <td class="num">${money(inv.total)}</td>
            <td class="num">${money(inv.amountPaid)}</td>
            <td class="num ${inv.balance > 0 ? 'strong' : 'muted'}">${money(inv.balance)}</td>
            <td>${statusBadge(inv.status)}</td>
            <td><div class="row-actions">
              <a class="btn btn-sm btn-ghost" href="#/invoices/${inv.id}" title="Open">${icon('eye', 14)}</a>
              ${
                inv.balance > 0
                  ? `<button class="btn btn-sm btn-ghost" data-pay="${inv.id}" title="Record payment">${icon('wallet', 14)}</button>`
                  : ''
              }
              <a class="btn btn-sm btn-ghost" href="/api/invoices/${inv.id}/pdf?download=1" download title="Download PDF">${icon(
                'download',
                14
              )}</a>
              <button class="btn btn-sm btn-ghost" data-preview="${inv.id}" title="Preview PDF">${icon('print', 14)}</button>
            </div></td>
          </tr>`
        )
        .join('')}</tbody></table></div>
      <div class="toolbar" style="border-top:1px solid var(--line);border-bottom:0;gap:22px">
        <span class="small muted">${rows.length} invoice${rows.length === 1 ? '' : 's'}</span>
        <span class="small muted">Invoiced <strong class="tabular">${money(totals.invoiced)}</strong></span>
        <span class="small muted">Collected <strong class="tabular">${money(totals.paid)}</strong></span>
        <span class="small muted">Outstanding <strong class="tabular">${money(totals.balance)}</strong></span>
      </div>`;

    wireRowLinks(listBody);
    listBody.querySelectorAll('[data-preview]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = rows.find((r) => String(r.id) === btn.dataset.preview);
        const panel = view.querySelector('#detail-panel');
        panel.innerHTML = pdfPanel({
          url: `/api/invoices/${btn.dataset.preview}/pdf`,
          title: `Invoice ${row?.number || ''}`,
          subtitle: `${esc(row?.number || '')} · ${esc(row?.customerName || '')}`,
          heading: 'Preview',
        });
        wirePdfPanel(panel);
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    listBody.querySelectorAll('[data-pay]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = rows.find((r) => String(r.id) === btn.dataset.pay);
        recordPayment(row);
      });
    });
  }

  async function recordPayment(invoice) {
    const { openPaymentModal } = await import('./payments.js');
    openPaymentModal({
      invoice,
      onSaved: () => load(),
    });
  }

  const statusFilter = view.querySelector('#status-filter');
  const fromInput = view.querySelector('#filter-from');
  const toInput = view.querySelector('#filter-to');
  const searchInput = view.querySelector('#search-input');
  const apply = () => {
    filters.status = statusFilter.value;
    filters.from = fromInput.value;
    filters.to = toInput.value;
    load();
  };
  statusFilter.addEventListener('change', apply);
  fromInput.addEventListener('change', apply);
  toInput.addEventListener('change', apply);
  searchInput.addEventListener('input', debounce(() => {
    filters.search = searchInput.value.trim();
    load();
  }, 250));

  await load();
}
