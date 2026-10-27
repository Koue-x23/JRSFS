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
  debounce,
  openModal,
  field,
  setBusy,
  ensureLookups,
} from './shared.js';

export async function render({ view, query }) {
  setPageMeta({
    title: 'Products & Services',
    subtitle: 'Reusable catalog items for faster, consistent quotations and invoices.',
    action: { label: 'Add product or service', href: '#/products?new=1', icon: 'plus' },
  });

  await ensureLookups();
  const filters = { search: query.search || '', includeArchived: query.archived === '1' };

  view.innerHTML = `
    <div class="card">
      ${TOOLBAR({
        search: filters.search,
        placeholder: 'Search products, services, or categories…',
        filters: `<label class="checkbox"><input type="checkbox" id="show-archived" ${
          filters.includeArchived ? 'checked' : ''
        } /> Show archived</label>`,
        actions: `<button class="btn btn-sm btn-primary" id="add-product">${icon('plus', 14)} Add product or service</button>`,
      })}
      <div id="list-body"><div class="loading-block"><span class="spinner"></span> Loading catalog…</div></div>
    </div>
    <p class="small muted mt-12">Prices entered on quotations and invoices never change the default price saved here.</p>
  `;

  const listBody = view.querySelector('#list-body');

  function productForm(product = {}) {
    return `<div class="form-grid" id="product-form">
      ${field({ label: 'Name', name: 'name', value: product.name || '', required: true, span: 2, placeholder: 'e.g. Stainless steel railing (per linear meter)' })}
      ${field({ label: 'Category', name: 'category', value: product.category || '', placeholder: 'e.g. Railings, Kitchen equipment' })}
      ${field({ label: 'Unit of measurement', name: 'unit', value: product.unit || 'pc', placeholder: 'pc, set, meter, sqm, lot' })}
      ${field({ label: 'Default price (₱)', name: 'defaultPrice', type: 'number', value: product.defaultPrice ?? 0, attrs: 'min="0" step="0.01"' })}
      ${field({ label: 'Description', name: 'description', type: 'textarea', value: product.description || '', span: 2, attrs: 'rows="2"', hint: 'Used as the line item description.' })}
      ${field({ label: 'Notes', name: 'notes', type: 'textarea', value: product.notes || '', span: 2, attrs: 'rows="2"' })}
    </div>`;
  }

  function openProductModal(product = null) {
    const isEdit = Boolean(product);
    const modal = openModal({
      title: isEdit ? `Edit ${product.name}` : 'Add product or service',
      size: 'wide',
      body: productForm(product || {}),
      actions: [
        { label: 'Cancel', onClick: ({ close }) => close() },
        {
          label: isEdit ? 'Save changes' : 'Add to catalog',
          variant: 'btn-primary',
          icon: 'save',
          onClick: async ({ close, modal: dialog }) => {
            const body = dialog.querySelector('#product-form');
            const payload = {
              name: body.querySelector('[name="name"]').value.trim(),
              category: body.querySelector('[name="category"]').value.trim(),
              unit: body.querySelector('[name="unit"]').value.trim() || 'pc',
              defaultPrice: Number(body.querySelector('[name="defaultPrice"]').value) || 0,
              description: body.querySelector('[name="description"]').value,
              notes: body.querySelector('[name="notes"]').value,
            };
            if (!payload.name) {
              toast('A name is required.', 'error');
              body.querySelector('[name="name"]').focus();
              return;
            }
            const btn = dialog.querySelector('.modal-foot .btn-primary');
            setBusy(btn, true);
            try {
              if (isEdit) await api.put(`/products/${product.id}`, payload);
              else await api.post('/products', payload);
              toast(`${payload.name} saved.`, 'success', isEdit ? 'Catalog updated' : 'Product added');
              await ensureLookups({ force: true });
              close();
              load();
            } catch (err) {
              toast(err.message, 'error', 'Could not save');
              setBusy(btn, false);
            }
          },
        },
      ],
    });
    return modal;
  }

  async function load() {
    listBody.innerHTML = '<div class="loading-block"><span class="spinner"></span> Loading…</div>';
    let rows;
    try {
      rows = await api.get('/products', { search: filters.search, archived: filters.includeArchived || undefined });
    } catch (err) {
      listBody.innerHTML = `<div class="table-empty">${esc(err.message)}</div>`;
      return;
    }
    if (!rows.length) {
      listBody.innerHTML = filters.search
        ? `<div class="table-empty">${icon('search', 20)}<div class="mt-8 strong">No products or services match “${esc(
            filters.search
          )}”</div></div>`
        : emptyState({
            title: 'Your catalog is empty',
            message: 'Add the products and services you fabricate or install. Selecting one in a document fills its description and price.',
            iconName: 'products',
            actionHtml: `<button class="btn btn-primary" id="add-empty">${icon('plus', 15)} Add product or service</button>`,
          });
      const btn = listBody.querySelector('#add-empty');
      if (btn) btn.addEventListener('click', () => openProductModal());
      return;
    }
    listBody.innerHTML = `<div class="table-wrap"><table class="data">
      <thead><tr><th>Name</th><th>Category</th><th>Unit</th><th class="num">Default price</th><th>Notes</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows
        .map(
          (p) => `<tr>
            <td><span class="doc-link">${esc(p.name)}</span>${p.description ? `<span class="sub">${esc(p.description)}</span>` : ''}</td>
            <td>${esc(p.category || '—')}</td>
            <td>${esc(p.unit)}</td>
            <td class="num">${money(p.defaultPrice)}</td>
            <td class="small muted">${esc(p.notes || '—')}</td>
            <td>${p.archived ? '<span class="badge draft">Archived</span>' : '<span class="badge approved">Active</span>'}</td>
            <td><div class="row-actions">
              <button class="btn btn-sm btn-ghost" data-edit="${p.id}" title="Edit">${icon('edit', 14)}</button>
              <button class="btn btn-sm btn-ghost" data-archive="${p.id}" data-archived="${
                p.archived ? 1 : 0
              }" title="${p.archived ? 'Restore' : 'Archive'}">${icon(p.archived ? 'refresh' : 'archive', 14)}</button>
            </div></td>
          </tr>`
        )
        .join('')}</tbody></table></div>
      <div class="toolbar" style="border-top:1px solid var(--line);border-bottom:0">
        <span class="small muted">${rows.length} item${rows.length === 1 ? '' : 's'} in view</span>
      </div>`;

    listBody.querySelectorAll('[data-edit]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const product = rows.find((r) => String(r.id) === btn.dataset.edit);
        openProductModal(product);
      })
    );
    listBody.querySelectorAll('[data-archive]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const product = rows.find((r) => String(r.id) === btn.dataset.archive);
        const isArchived = btn.dataset.archived === '1';
        if (!isArchived) {
          const ok = await confirmDialog({
            title: 'Archive this item?',
            message: `${product.name} will stop appearing in document line-item pickers. Existing documents are unaffected.`,
            confirmLabel: 'Archive',
          });
          if (!ok) return;
        }
        try {
          await api.post(`/products/${product.id}/${isArchived ? 'restore' : 'archive'}`);
          toast(isArchived ? 'Item restored.' : 'Item archived.', 'success');
          await ensureLookups({ force: true });
          load();
        } catch (err) {
          toast(err.message, 'error');
        }
      })
    );
  }

  view.querySelector('#add-product').addEventListener('click', () => openProductModal());
  view.querySelector('#show-archived').addEventListener('change', (e) => {
    filters.includeArchived = e.target.checked;
    load();
  });
  view.querySelector('#search-input').addEventListener(
    'input',
    debounce((e) => {
      filters.search = e.target.value.trim();
      load();
    }, 250)
  );

  await load();
  if (query.new === '1') openProductModal();
}
