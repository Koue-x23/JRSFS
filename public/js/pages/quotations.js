import { api } from '../api.js';
import {
  icon,
  esc,
  money,
  formatDate,
  statusBadge,
  emptyState,
  toast,
  confirmDialog,
  setPageMeta,
  pdfPanel,
  wirePdfPanel,
  TOOLBAR,
  selectFilter,
  dateRangeFilter,
  STATUS_OPTIONS,
  wireRowLinks,
  debounce,
} from './shared.js';

export async function render({ view, query }) {
  setPageMeta({
    title: 'Quotations',
    subtitle: 'Prepare, track and convert customer quotations.',
    action: { label: 'New quotation', href: '#/quotations/new', icon: 'plus' },
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
        placeholder: 'Search quotation number, customer, or project…',
        filters: `${selectFilter('status-filter', STATUS_OPTIONS.quotation, filters.status)}${dateRangeFilter(
          filters.from,
          filters.to
        )}`,
        actions: `<a class="btn btn-sm" href="#/reports">${icon('reports', 14)} Reports</a>
          <a class="btn btn-sm btn-primary" href="#/quotations/new">${icon('plus', 14)} New quotation</a>`,
      })}
      <div id="list-body"><div class="loading-block"><span class="spinner"></span> Loading quotations…</div></div>
    </div>
    <div class="mt-16" id="detail-panel"></div>
  `;

  const listBody = view.querySelector('#list-body');

  async function load() {
    listBody.innerHTML = '<div class="loading-block"><span class="spinner"></span> Loading…</div>';
    let rows;
    try {
      rows = await api.get('/quotations', filters);
    } catch (err) {
      listBody.innerHTML = `<div class="table-empty">${esc(err.message)}</div>`;
      return;
    }
    if (!rows.length) {
      const filtered = filters.search || filters.status || filters.from || filters.to;
      listBody.innerHTML = filtered
        ? `<div class="table-empty">${icon('search', 20)}<div class="mt-8 strong">No matching quotations</div>
            <div class="small">Try a different search term or clear the filters.</div>
            <div class="btn-row" style="justify-content:center;margin-top:10px"><button class="btn btn-sm" id="clear-filters">Clear filters</button></div></div>`
        : emptyState({
            title: 'No quotations yet',
            message: 'Create your first quotation. Line items, discounts and taxes are calculated automatically.',
            iconName: 'quotation',
            actionHtml: `<a class="btn btn-primary" href="#/quotations/new">${icon('plus', 15)} New quotation</a>`,
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
    listBody.innerHTML = `<div class="table-wrap"><table class="data">
      <thead><tr>
        <th>Quotation</th><th>Customer</th><th>Project</th><th>Issued</th><th>Valid until</th>
        <th class="num">Total</th><th>Status</th><th></th>
      </tr></thead>
      <tbody>${rows
        .map(
          (q) => `<tr class="clickable" data-href="#/quotations/${q.id}">
            <td><span class="doc-link">${esc(q.number)}</span>${
              q.invoiceId ? '<span class="sub">Invoiced</span>' : ''
            }</td>
            <td>${esc(q.customerName)}${q.companyName ? `<span class="sub">${esc(q.companyName)}</span>` : ''}</td>
            <td>${q.projectName ? esc(q.projectName) : '<span class="muted">—</span>'}${
              q.projectLocation ? `<span class="sub">${esc(q.projectLocation)}</span>` : ''
            }</td>
            <td class="nowrap">${formatDate(q.issueDate, 'short')}</td>
            <td class="nowrap">${q.validUntil ? formatDate(q.validUntil, 'short') : '<span class="muted">—</span>'}</td>
            <td class="num">${money(q.grandTotal)}</td>
            <td>${statusBadge(q.effectiveStatus)}</td>
            <td><div class="row-actions">
              <a class="btn btn-sm btn-ghost" href="#/quotations/${q.id}" title="Open">${icon('eye', 14)}</a>
              ${
                q.invoiceId
                  ? ''
                  : `<a class="btn btn-sm btn-ghost" href="#/quotations/${q.id}/edit" title="Edit">${icon('edit', 14)}</a>`
              }
              <a class="btn btn-sm btn-ghost" href="/api/quotations/${q.id}/pdf?download=1" download title="Download PDF">${icon(
                'download',
                14
              )}</a>
              <button class="btn btn-sm btn-ghost" data-preview="${q.id}" title="Preview PDF">${icon('print', 14)}</button>
            </div></td>
          </tr>`
        )
        .join('')}</tbody></table></div>
      <div class="toolbar" style="border-top:1px solid var(--line);border-bottom:0">
        <span class="small muted">${rows.length} quotation${rows.length === 1 ? '' : 's'} shown · ${money(
      rows.reduce((s, r) => s + r.grandTotal, 0)
    )} total value</span>
      </div>`;

    wireRowLinks(listBody);
    listBody.querySelectorAll('[data-preview]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.preview;
        const panel = view.querySelector('#detail-panel');
        const row = rows.find((r) => String(r.id) === String(id));
        panel.innerHTML = pdfPanel({
          url: `/api/quotations/${id}/pdf`,
          title: `Quotation ${row?.number || ''}`,
          subtitle: `${esc(row?.number || '')} · ${esc(row?.customerName || '')}`,
          heading: 'Preview',
        });
        wirePdfPanel(panel);
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
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
  searchInput.addEventListener(
    'input',
    debounce(() => {
      filters.search = searchInput.value.trim();
      load();
    }, 250)
  );

  await load();
}
