import { api } from '../api.js';
import {
  icon,
  esc,
  money,
  formatDate,
  emptyState,
  setPageMeta,
  pdfPanel,
  wirePdfPanel,
  TOOLBAR,
  wireRowLinks,
  debounce,
} from './shared.js';

export async function render({ view, query }) {
  setPageMeta({
    title: 'Billing Statements',
    subtitle: 'Summarize a customer’s invoices and payments over a billing period.',
    action: { label: 'New billing statement', href: '#/statements/new', icon: 'plus' },
  });

  const filters = { search: query.search || '', from: query.from || '', to: query.to || '' };

  view.innerHTML = `
    <div class="card">
      ${TOOLBAR({
        search: filters.search,
        placeholder: 'Search statement number or customer…',
        filters: `<span class="filter-label">Period from</span>
          <input class="input" type="date" id="filter-from" value="${esc(filters.from)}" style="width:auto" />
          <span class="filter-label">to</span>
          <input class="input" type="date" id="filter-to" value="${esc(filters.to)}" style="width:auto" />`,
        actions: `<a class="btn btn-sm btn-primary" href="#/statements/new">${icon('plus', 14)} New statement</a>`,
      })}
      <div id="list-body"><div class="loading-block"><span class="spinner"></span> Loading statements…</div></div>
    </div>
    <div class="mt-16" id="detail-panel"></div>
  `;

  const listBody = view.querySelector('#list-body');

  async function load() {
    listBody.innerHTML = '<div class="loading-block"><span class="spinner"></span> Loading…</div>';
    let rows;
    try {
      rows = await api.get('/billing-statements', filters);
    } catch (err) {
      listBody.innerHTML = `<div class="table-empty">${esc(err.message)}</div>`;
      return;
    }
    if (!rows.length) {
      listBody.innerHTML = filters.search || filters.from || filters.to
        ? `<div class="table-empty">${icon('search', 20)}<div class="mt-8 strong">No matching billing statements</div></div>`
        : emptyState({
            title: 'No billing statements yet',
            message: 'Choose a customer and billing period — invoices, payments and running balances are pulled from saved records.',
            iconName: 'statement',
            actionHtml: `<a class="btn btn-primary" href="#/statements/new">${icon('plus', 15)} New billing statement</a>`,
          });
      return;
    }
    listBody.innerHTML = `<div class="table-wrap"><table class="data">
      <thead><tr>
        <th>Statement</th><th>Customer</th><th>Period</th><th>Statement date</th>
        <th class="num">Charges</th><th class="num">Payments</th><th class="num">Outstanding</th><th></th>
      </tr></thead>
      <tbody>${rows
        .map(
          (s) => `<tr class="clickable" data-href="#/statements/${s.id}">
            <td><span class="doc-link">${esc(s.number)}</span></td>
            <td>${esc(s.customerName)}${s.companyName ? `<span class="sub">${esc(s.companyName)}</span>` : ''}</td>
            <td class="nowrap">${formatDate(s.periodFrom, 'short')} – ${formatDate(s.periodTo, 'short')}</td>
            <td class="nowrap">${formatDate(s.statementDate, 'short')}</td>
            <td class="num">${money(s.totalCharges)}</td>
            <td class="num">${money(s.totalPayments)}</td>
            <td class="num strong">${money(s.outstandingBalance)}</td>
            <td><div class="row-actions">
              <a class="btn btn-sm btn-ghost" href="#/statements/${s.id}" title="Open">${icon('eye', 14)}</a>
              <a class="btn btn-sm btn-ghost" href="/api/billing-statements/${s.id}/pdf?download=1" download title="Download PDF">${icon('download', 14)}</a>
              <button class="btn btn-sm btn-ghost" data-preview="${s.id}" title="Preview PDF">${icon('print', 14)}</button>
            </div></td>
          </tr>`
        )
        .join('')}</tbody></table></div>`;

    wireRowLinks(listBody);
    listBody.querySelectorAll('[data-preview]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = rows.find((r) => String(r.id) === btn.dataset.preview);
        const panel = view.querySelector('#detail-panel');
        panel.innerHTML = pdfPanel({
          url: `/api/billing-statements/${btn.dataset.preview}/pdf`,
          title: `Billing statement ${row?.number || ''}`,
          subtitle: `${esc(row?.number || '')} · ${esc(row?.customerName || '')}`,
          heading: 'Preview',
        });
        wirePdfPanel(panel);
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  view.querySelector('#search-input').addEventListener(
    'input',
    debounce((e) => {
      filters.search = e.target.value.trim();
      load();
    }, 250)
  );
  view.querySelector('#filter-from').addEventListener('change', (e) => {
    filters.from = e.target.value;
    load();
  });
  view.querySelector('#filter-to').addEventListener('change', (e) => {
    filters.to = e.target.value;
    load();
  });

  await load();
}
