import { api } from '../api.js';
import {
  icon,
  esc,
  money,
  formatDate,
  statusLabel,
  setPageMeta,
  ensureLookups,
  today,
  loadingBlock,
  toast,
} from './shared.js';

const monthStart = () => `${today().slice(0, 7)}-01`;

export async function render({ view, query }) {
  const state = await ensureLookups();
  setPageMeta({ title: 'Reports', subtitle: 'Business summaries built from saved quotations, invoices and payments.' });

  const filters = {
    from: query.from || monthStart(),
    to: query.to || today(),
    customerId: query.customerId || '',
  };

  view.innerHTML = `
    <div class="card no-print">
      <div class="toolbar">
        <span class="filter-label">From</span>
        <input class="input" type="date" id="from" value="${esc(filters.from)}" style="width:auto" />
        <span class="filter-label">To</span>
        <input class="input" type="date" id="to" value="${esc(filters.to)}" style="width:auto" />
        <select class="select" id="customer" style="width:auto;min-width:200px">
          <option value="">All customers</option>
          ${state.customers
            .map(
              (c) =>
                `<option value="${c.id}" ${String(c.id) === String(filters.customerId) ? 'selected' : ''}>${esc(c.name)}</option>`
            )
            .join('')}
        </select>
        <button class="btn btn-sm" id="apply">${icon('filter', 14)} Apply</button>
        <button class="btn btn-sm btn-ghost" id="this-month">This month</button>
        <button class="btn btn-sm btn-ghost" id="this-year">This year</button>
        <div class="spacer"></div>
        <a class="btn btn-sm" id="export-csv" href="#">${icon('download', 14)} Export CSV</a>
        <button class="btn btn-sm" id="print-report">${icon('print', 14)} Print</button>
      </div>
    </div>
    <div id="report-body" class="mt-16">${loadingBlock('Building report…')}</div>
  `;

  const reportBody = view.querySelector('#report-body');

  function figureRows(map) {
    return Object.entries(map)
      .map(
        ([key, value]) => `<div class="totals-row"><span class="label">${esc(statusLabel(key))}</span><span class="value">${
          typeof value === 'number' && String(key).match(/^(draft|sent|approved|rejected|expired|unpaid|partial|paid|overdue|scheduled|in_progress|completed|cancelled)$/)
            ? value
            : money(value)
        }</span></div>`
      )
      .join('');
  }

  async function load() {
    reportBody.innerHTML = loadingBlock('Building report…');
    let r;
    try {
      r = await api.get('/reports', filters);
    } catch (err) {
      reportBody.innerHTML = `<div class="card"><div class="table-empty">${esc(err.message)}</div></div>`;
      return;
    }
    const rangeText = `${filters.from ? formatDate(filters.from, 'short') : 'start'} – ${
      filters.to ? formatDate(filters.to, 'short') : 'today'
    }`;
    const customerName = state.customers.find((c) => String(c.id) === String(filters.customerId))?.name;

    reportBody.innerHTML = `
      <div class="report-print-head">
        <h2>${esc(state.settings.businessName)}</h2>
        <p>${esc(rangeText)}${customerName ? ` · ${esc(customerName)}` : ' · All customers'}</p>
        <p class="small muted">Generated ${formatDate(today())}</p>
      </div>

      <div class="kpi-grid">
        <div class="kpi"><span class="kpi-label">Quotations</span><span class="kpi-value">${r.quotations.count}</span>
          <span class="kpi-meta">${money(r.quotations.value)} total quoted</span></div>
        <div class="kpi ok"><span class="kpi-label">Approved quotes</span><span class="kpi-value money">${money(
          r.quotations.approvedValue
        )}</span><span class="kpi-meta">${r.quotations.byStatus.approved} approved</span></div>
        <div class="kpi"><span class="kpi-label">Invoiced (period)</span><span class="kpi-value money">${money(
          r.invoices.invoiced
        )}</span><span class="kpi-meta">${r.invoices.count} invoice(s)</span></div>
        <div class="kpi ok"><span class="kpi-label">Payments received</span><span class="kpi-value money">${money(
          r.payments.total
        )}</span><span class="kpi-meta">${r.payments.count} payment(s)</span></div>
        <div class="kpi accent"><span class="kpi-label">Outstanding balance</span><span class="kpi-value money">${money(
          r.invoices.outstanding
        )}</span><span class="kpi-meta">All open invoices to date</span></div>
        <div class="kpi warn"><span class="kpi-label">Overdue invoices</span><span class="kpi-value">${r.invoices.overdue.length}</span>
          <span class="kpi-meta">${money(r.invoices.overdue.reduce((s, i) => s + i.balance, 0))} past due</span></div>
        <div class="kpi"><span class="kpi-label">Service reports</span><span class="kpi-value">${r.services.count}</span>
          <span class="kpi-meta">${money(r.services.cost)} total service cost</span></div>
        <div class="kpi"><span class="kpi-label">Customers billed</span><span class="kpi-value">${r.customers.length}</span>
          <span class="kpi-meta">With activity in period</span></div>
      </div>

      <div class="grid grid-2-even mt-24">
        <div class="card report-section">
          <div class="card-head"><h2>Quotations by status</h2><span class="sub">${esc(rangeText)}</span></div>
          <div class="card-body">
            ${figureRows(r.quotations.byStatus)}
            <div class="totals-row grand"><span class="label">Quoted value</span><span class="value">${money(
              r.quotations.value
            )}</span></div>
          </div>
        </div>
        <div class="card report-section">
          <div class="card-head"><h2>Invoices by status</h2><span class="sub">${esc(rangeText)}</span></div>
          <div class="card-body">
            ${figureRows(r.invoices.byStatus)}
            <div class="divider"></div>
            <div class="totals-row"><span class="label">Invoiced in period</span><span class="value">${money(
              r.invoices.invoiced
            )}</span></div>
            <div class="totals-row"><span class="label">Collected in period</span><span class="value">${money(
              r.payments.total
            )}</span></div>
            <div class="totals-row grand"><span class="label">Outstanding (all open)</span><span class="value">${money(
              r.invoices.outstanding
            )}</span></div>
            <p class="small muted mt-8">Invoiced amounts are not treated as collected cash — only recorded payments count as collections.</p>
          </div>
        </div>
      </div>

      <div class="grid grid-2-even mt-16">
        <div class="card report-section">
          <div class="card-head"><h2>Payments by method</h2><span class="sub">${esc(rangeText)}</span></div>
          <div class="card-body">
            ${
              Object.keys(r.payments.byMethod).length
                ? Object.entries(r.payments.byMethod)
                    .map(
                      ([m, v]) =>
                        `<div class="totals-row"><span class="label">${esc(m)}</span><span class="value">${money(v)}</span></div>`
                    )
                    .join('')
                : '<p class="muted small">No payments recorded in this period.</p>'
            }
            <div class="totals-row grand"><span class="label">Total received</span><span class="value">${money(
              r.payments.total
            )}</span></div>
          </div>
        </div>
        <div class="card report-section">
          <div class="card-head"><h2>Service reports by status</h2><span class="sub">${esc(rangeText)}</span></div>
          <div class="card-body">
            ${figureRows(r.services.byStatus)}
            <div class="totals-row grand"><span class="label">Service cost logged</span><span class="value">${money(
              r.services.cost
            )}</span></div>
          </div>
        </div>
      </div>

      <div class="card mt-16 report-section">
        <div class="card-head"><h2>Monthly billing summary</h2><span class="sub">Invoiced vs collected by month</span></div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Month</th><th class="num">Invoiced</th><th class="num">Collected</th><th class="num">Difference</th></tr></thead>
          <tbody>${
            r.monthly.length
              ? r.monthly
                  .map(
                    (m) => `<tr><td>${esc(
                      new Date(`${m.month}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
                    )}</td><td class="num">${money(m.invoiced)}</td><td class="num">${money(
                      m.collected
                    )}</td><td class="num">${money(m.invoiced - m.collected)}</td></tr>`
                  )
                  .join('')
              : '<tr><td colspan="4" class="table-empty">No billing activity for this period.</td></tr>'
          }</tbody>
        </table></div>
      </div>

      <div class="card mt-16 report-section">
        <div class="card-head"><h2>Customer transaction summary</h2><span class="sub">${esc(rangeText)}</span></div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Customer</th><th class="num">Quotations</th><th class="num">Quote value</th><th class="num">Invoices</th><th class="num">Invoiced</th><th class="num">Paid</th><th class="num">Outstanding</th></tr></thead>
          <tbody>${
            r.customers.length
              ? r.customers
                  .map(
                    (c) => `<tr>
                      <td>${c.customerId ? `<a href="#/customers/${c.customerId}">${esc(c.name)}</a>` : esc(c.name)}</td>
                      <td class="num">${c.quotations}</td>
                      <td class="num">${money(c.quotationValue)}</td>
                      <td class="num">${c.invoices}</td>
                      <td class="num">${money(c.invoiced)}</td>
                      <td class="num">${money(c.paid)}</td>
                      <td class="num strong">${money(c.outstanding)}</td>
                    </tr>`
                  )
                  .join('')
              : '<tr><td colspan="7" class="table-empty">No customer activity for this period.</td></tr>'
          }</tbody>
        </table></div>
      </div>

      <div class="card mt-16 report-section">
        <div class="card-head"><h2>Overdue invoices</h2><span class="sub">Past due date with an open balance</span></div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Invoice</th><th>Customer</th><th>Invoice date</th><th>Due date</th><th class="num">Total</th><th class="num">Balance</th></tr></thead>
          <tbody>${
            r.invoices.overdue.length
              ? r.invoices.overdue
                  .map(
                    (i) => `<tr>
                      <td><a href="#/invoices/${i.id}">${esc(i.number)}</a></td>
                      <td>${esc(i.customer)}</td>
                      <td class="nowrap">${formatDate(i.invoiceDate, 'short')}</td>
                      <td class="nowrap">${i.dueDate ? formatDate(i.dueDate, 'short') : '—'}</td>
                      <td class="num">${money(i.total)}</td>
                      <td class="num strong">${money(i.balance)}</td>
                    </tr>`
                  )
                  .join('')
              : '<tr><td colspan="6" class="table-empty">No overdue invoices. 🎉</td></tr>'
          }</tbody>
        </table></div>
      </div>

      <p class="small muted mt-16">All figures come from saved records. Outstanding balances include every unpaid invoice to date, not only invoices issued inside the selected period.</p>
    `;
    view.querySelector('#export-csv').href = `/api/reports/export.csv?${new URLSearchParams(filters).toString()}`;
  }

  const apply = () => {
    filters.from = view.querySelector('#from').value;
    filters.to = view.querySelector('#to').value;
    filters.customerId = view.querySelector('#customer').value;
    load();
  };
  view.querySelector('#apply').addEventListener('click', apply);
  view.querySelector('#from').addEventListener('change', apply);
  view.querySelector('#to').addEventListener('change', apply);
  view.querySelector('#customer').addEventListener('change', apply);
  view.querySelector('#this-month').addEventListener('click', () => {
    view.querySelector('#from').value = monthStart();
    view.querySelector('#to').value = today();
    apply();
  });
  view.querySelector('#this-year').addEventListener('click', () => {
    view.querySelector('#from').value = `${today().slice(0, 4)}-01-01`;
    view.querySelector('#to').value = today();
    apply();
  });
  view.querySelector('#print-report').addEventListener('click', () => {
    toast('Choose “Save as PDF” in the print dialog if you want a PDF copy of this report.', 'info', 'Printing report');
    window.print();
  });

  await load();
}
