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
} from './shared.js';

export async function render({ view, query }) {
  setPageMeta({
    title: 'Service Reports',
    subtitle: 'Fabrication, repair, maintenance, installation and inspection reports.',
    action: { label: 'New service report', href: '#/service-reports/new', icon: 'plus' },
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
        placeholder: 'Search report number, customer, equipment, or problem…',
        filters: `${selectFilter('status-filter', STATUS_OPTIONS.service, filters.status)}${dateRangeFilter(filters.from, filters.to)}`,
        actions: `<a class="btn btn-sm btn-primary" href="#/service-reports/new">${icon('plus', 14)} New service report</a>`,
      })}
      <div id="list-body"><div class="loading-block"><span class="spinner"></span> Loading service reports…</div></div>
    </div>
    <div class="mt-16" id="detail-panel"></div>
  `;

  const listBody = view.querySelector('#list-body');

  async function load() {
    listBody.innerHTML = '<div class="loading-block"><span class="spinner"></span> Loading…</div>';
    let rows;
    try {
      rows = await api.get('/service-reports', filters);
    } catch (err) {
      listBody.innerHTML = `<div class="table-empty">${esc(err.message)}</div>`;
      return;
    }
    if (!rows.length) {
      const filtered = filters.search || filters.status || filters.from || filters.to;
      listBody.innerHTML = filtered
        ? `<div class="table-empty">${icon('search', 20)}<div class="mt-8 strong">No matching service reports</div>
            <div class="small">Try different filters.</div></div>`
        : emptyState({
            title: 'No service reports yet',
            message: 'Document repairs, installations, maintenance and inspections — with findings, work performed, materials and photos.',
            iconName: 'service',
            actionHtml: `<a class="btn btn-primary" href="#/service-reports/new">${icon('plus', 15)} New service report</a>`,
          });
      return;
    }
    listBody.innerHTML = `<div class="table-wrap"><table class="data">
      <thead><tr>
        <th>Report</th><th>Customer</th><th>Service date</th><th>Equipment / work</th><th>Technician</th>
        <th class="num">Cost</th><th>Status</th><th></th>
      </tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr class="clickable" data-href="#/service-reports/${r.id}">
            <td><span class="doc-link">${esc(r.number)}</span></td>
            <td>${esc(r.customerName)}${r.companyName ? `<span class="sub">${esc(r.companyName)}</span>` : ''}</td>
            <td class="nowrap">${formatDate(r.serviceDate, 'short')}</td>
            <td>${esc(r.equipment || '—')}${r.location ? `<span class="sub">${esc(r.location)}</span>` : ''}</td>
            <td>${esc(r.technician || '—')}</td>
            <td class="num">${money(r.totalCost)}</td>
            <td>${statusBadge(r.status)}</td>
            <td><div class="row-actions">
              <a class="btn btn-sm btn-ghost" href="#/service-reports/${r.id}" title="Open">${icon('eye', 14)}</a>
              <a class="btn btn-sm btn-ghost" href="#/service-reports/${r.id}/edit" title="Edit">${icon('edit', 14)}</a>
              <a class="btn btn-sm btn-ghost" href="/api/service-reports/${r.id}/pdf?download=1" download title="Download PDF">${icon('download', 14)}</a>
              <button class="btn btn-sm btn-ghost" data-preview="${r.id}" title="Preview PDF">${icon('print', 14)}</button>
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
          url: `/api/service-reports/${btn.dataset.preview}/pdf`,
          title: `Service report ${row?.number || ''}`,
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
  searchInput.addEventListener('input', debounce(() => {
    filters.search = searchInput.value.trim();
    load();
  }, 250));

  await load();
}
