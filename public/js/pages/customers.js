import { api } from '../api.js';
import {
  icon,
  esc,
  money,
  toast,
  confirmDialog,
  setPageMeta,
  emptyState,
  TOOLBAR,
  wireRowLinks,
  debounce,
  initials,
} from './shared.js';

export async function render({ view, query }) {
  setPageMeta({
    title: 'Customers',
    subtitle: 'Customer directory with transaction history and balances.',
    action: { label: 'Add customer', href: '#/customers/new', icon: 'plus' },
  });

  const filters = { search: query.search || '', includeArchived: query.archived === '1' };

  view.innerHTML = `
    <div class="card">
      ${TOOLBAR({
        search: filters.search,
        placeholder: 'Search name, company, code, phone, or email…',
        filters: `<label class="checkbox"><input type="checkbox" id="show-archived" ${
          filters.includeArchived ? 'checked' : ''
        } /> Show archived</label>`,
        actions: `<a class="btn btn-sm btn-primary" href="#/customers/new">${icon('plus', 14)} Add customer</a>`,
      })}
      <div id="list-body"><div class="loading-block"><span class="spinner"></span> Loading customers…</div></div>
    </div>
  `;

  const listBody = view.querySelector('#list-body');

  async function load() {
    listBody.innerHTML = '<div class="loading-block"><span class="spinner"></span> Loading…</div>';
    let rows;
    try {
      rows = await api.get('/customers', {
        search: filters.search,
        archived: filters.includeArchived || undefined,
      });
    } catch (err) {
      listBody.innerHTML = `<div class="table-empty">${esc(err.message)}</div>`;
      return;
    }
    if (!rows.length) {
      listBody.innerHTML = filters.search
        ? `<div class="table-empty">${icon('search', 20)}<div class="mt-8 strong">No customers match “${esc(
            filters.search
          )}”</div></div>`
        : emptyState({
            title: 'No customers yet',
            message: 'Add your first customer so their details fill in automatically on quotations, invoices and service reports.',
            iconName: 'customers',
            actionHtml: `<a class="btn btn-primary" href="#/customers/new">${icon('plus', 15)} Add customer</a>`,
          });
      return;
    }
    listBody.innerHTML = `<div class="table-wrap"><table class="data">
      <thead><tr><th>Customer</th><th>Company</th><th>Contact</th><th>Email</th><th>Project locations</th><th></th></tr></thead>
      <tbody>${rows
        .map(
          (c) => `<tr class="clickable" data-href="#/customers/${c.id}">
            <td>
              <div style="display:flex;gap:9px;align-items:center">
                <span class="activity-avatar" style="width:28px;height:28px;font-size:11px">${esc(initials(c.name))}</span>
                <span><span class="doc-link">${esc(c.name)}</span><span class="sub">${esc(c.code)}${
                  c.archived ? ' · archived' : ''
                }</span></span>
              </div>
            </td>
            <td>${esc(c.companyName || '—')}</td>
            <td>${esc(c.phone || '—')}</td>
            <td class="small">${esc(c.email || '—')}</td>
            <td class="small muted">${esc((c.projectLocations || '').split('\n')[0] || '—')}</td>
            <td><div class="row-actions">
              <a class="btn btn-sm btn-ghost" href="#/customers/${c.id}" title="Open">${icon('eye', 14)}</a>
              <a class="btn btn-sm btn-ghost" href="#/customers/${c.id}/edit" title="Edit">${icon('edit', 14)}</a>
              <button class="btn btn-sm btn-ghost" data-archive="${c.id}" data-archived="${c.archived ? 1 : 0}" title="${
                c.archived ? 'Restore' : 'Archive'
              }">${icon(c.archived ? 'refresh' : 'archive', 14)}</button>
            </div></td>
          </tr>`
        )
        .join('')}</tbody></table></div>
      <div class="toolbar" style="border-top:1px solid var(--line);border-bottom:0">
        <span class="small muted">${rows.length} customer${rows.length === 1 ? '' : 's'}</span>
      </div>`;

    wireRowLinks(listBody);
    listBody.querySelectorAll('[data-archive]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.archive;
        const isArchived = btn.dataset.archived === '1';
        if (!isArchived) {
          const ok = await confirmDialog({
            title: 'Archive this customer?',
            message:
              'Archived customers stay in the database with all their quotations, invoices and payments. They are hidden from selection lists.',
            confirmLabel: 'Archive customer',
          });
          if (!ok) return;
        }
        try {
          await api.post(`/customers/${id}/${isArchived ? 'restore' : 'archive'}`);
          toast(isArchived ? 'Customer restored.' : 'Customer archived. Historical records are intact.', 'success');
          load();
        } catch (err) {
          toast(err.message, 'error');
        }
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
  view.querySelector('#show-archived').addEventListener('change', (e) => {
    filters.includeArchived = e.target.checked;
    load();
  });

  await load();
}
