import { api } from '../api.js';
import { computeTotals, addDays } from '../calc.js';
import {
  icon,
  esc,
  money,
  toast,
  setPageMeta,
  ensureLookups,
  getState,
  today,
  customerOptions,
  productOptions,
  field,
  markInvalid,
  clearInvalid,
  setBusy,
  navigate,
  loadingBlock,
} from './shared.js';

export async function render({ view, params, query = {} }) {
  const isEdit = Boolean(params.id);
  const state = await ensureLookups();
  const settings = state.settings;
  setPageMeta({
    title: isEdit ? 'Edit quotation' : 'New quotation',
    subtitle: isEdit ? 'Update this quotation. Totals are recalculated when you save.' : 'Prepare a quotation for a customer.',
  });

  let quotation = null;
  if (isEdit) {
    view.innerHTML = loadingBlock('Loading quotation…');
    quotation = await api.get(`/quotations/${params.id}`);
    if (quotation.invoiceId) {
      toast('This quotation has already been invoiced and is locked. Duplicate it instead to make changes.', 'error', 'Quotation locked');
      navigate(`/quotations/${params.id}`);
      return;
    }
  }

  const presetCustomer = !quotation && query.customer ? state.customers.find((c) => String(c.id) === String(query.customer)) : null;
  const methods = settings.paymentMethods;
  const items = quotation
    ? quotation.items.map((it) => ({
        productId: it.productId || '',
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice: it.unitPrice,
      }))
    : [{ productId: '', description: '', quantity: 1, unit: 'pc', unitPrice: 0 }];

  const data = {
    customerId: quotation?.customerId || presetCustomer?.id || '',
    customerName: quotation?.customerName || presetCustomer?.name || '',
    companyName: quotation?.companyName || presetCustomer?.companyName || '',
    contactNumber: quotation?.contactNumber || presetCustomer?.phone || '',
    email: quotation?.email || presetCustomer?.email || '',
    address: quotation?.address || presetCustomer?.billingAddress || '',
    issueDate: quotation?.issueDate || today(),
    validUntil: quotation?.validUntil || addDays(today(), 30),
    projectName: quotation?.projectName || '',
    projectLocation: quotation?.projectLocation || (presetCustomer?.projectLocations || '').split('\n')[0] || '',
    paymentTerms: quotation?.paymentTerms ?? settings.defaultPaymentTerms,
    deliverySchedule: quotation?.deliverySchedule || '',
    remarks: quotation?.remarks ?? settings.defaultNotes,
    preparedBy: quotation?.preparedBy || settings.representative,
    status: quotation?.status || 'draft',
    discountType: quotation?.discountType || 'amount',
    discountValue: quotation?.discountValue || 0,
    taxRate: quotation?.taxRate ?? (settings.taxEnabled ? settings.taxRate : 0),
  };

  view.innerHTML = `
    <form id="quotation-form" novalidate autocomplete="off">
      <div class="page-head">
        <div>
          <h2 style="font-size:15px">${isEdit ? esc(quotation.number) : 'Quotation details'}</h2>
          <p>Customer details can be filled automatically from your saved customers, and line items from your products and services.</p>
        </div>
        <div class="actions">
          <a class="btn" href="${isEdit ? `#/quotations/${params.id}` : '#/quotations'}">${icon('back', 15)} Cancel</a>
          <button class="btn btn-primary" type="submit" id="save-btn">${icon('save', 15)} ${isEdit ? 'Save changes' : 'Save quotation'}</button>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Customer &amp; project</h2><span class="sub">Saved customer details fill in automatically</span></div>
        <div class="card-body">
          <div class="form-grid">
            ${field({
              label: 'Select saved customer',
              name: 'customerId',
              type: 'select',
              span: 2,
              options: customerOptions(state.customers, data.customerId),
              hint: 'Optional. You can also type any customer details below.',
            })}
            ${field({ label: 'Customer name', name: 'customerName', value: data.customerName, required: true })}
            ${field({ label: 'Company name', name: 'companyName', value: data.companyName, placeholder: 'If applicable' })}
            ${field({ label: 'Contact number', name: 'contactNumber', value: data.contactNumber })}
            ${field({ label: 'Email address', name: 'email', type: 'email', value: data.email })}
            ${field({ label: 'Customer address', name: 'address', value: data.address, type: 'textarea', span: 2, attrs: 'rows="2"' })}
            ${field({ label: 'Project name', name: 'projectName', value: data.projectName })}
            ${field({ label: 'Project location', name: 'projectLocation', value: data.projectLocation })}
            ${field({ label: 'Date issued', name: 'issueDate', type: 'date', value: data.issueDate, required: true })}
            ${field({ label: 'Validity date', name: 'validUntil', type: 'date', value: data.validUntil, hint: 'Quotations past this date show as Expired.' })}
            ${field({ label: 'Prepared by', name: 'preparedBy', value: data.preparedBy })}
            ${field({
              label: 'Status',
              name: 'status',
              type: 'select',
              value: data.status,
              options: [
                { value: 'draft', label: 'Draft' },
                { value: 'sent', label: 'Sent' },
                { value: 'approved', label: 'Approved' },
                { value: 'rejected', label: 'Rejected' },
              ]
                .map((o) => `<option value="${o.value}" ${o.value === data.status ? 'selected' : ''}>${o.label}</option>`)
                .join(''),
              hint: 'Only approved quotations can be converted to an invoice.',
            })}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Line items</h2><span class="sub">Prices here never change your saved product prices</span></div>
        <div class="card-body tight">
          <div class="items-scroll">
            <table class="items-table" id="items-table">
              <thead><tr>
                <th style="width:22%">Product / service</th>
                <th>Description</th>
                <th style="width:88px">Qty</th>
                <th style="width:82px">Unit</th>
                <th style="width:130px">Unit price</th>
                <th class="num" style="width:120px;text-align:right">Amount</th>
                <th></th>
              </tr></thead>
              <tbody id="items-body"></tbody>
            </table>
          </div>
          <div class="items-foot">
            <button type="button" class="btn btn-sm" id="add-item">${icon('plus', 14)} Add line item</button>
            <span class="small muted" id="items-count"></span>
          </div>
        </div>
      </div>

      <div class="grid grid-2-even">
        <div class="card">
          <div class="card-head"><h2>Terms &amp; remarks</h2></div>
          <div class="card-body">
            <div class="form-grid">
              ${field({
                label: 'Payment terms',
                name: 'paymentTerms',
                type: 'textarea',
                value: data.paymentTerms,
                span: 2,
                attrs: 'rows="2"',
                placeholder: methods.length ? 'e.g. 50% downpayment, balance upon completion' : '',
              })}
              ${field({ label: 'Delivery / completion schedule', name: 'deliverySchedule', value: data.deliverySchedule, span: 2, placeholder: 'e.g. 15 working days after downpayment' })}
              ${field({ label: 'Remarks', name: 'remarks', type: 'textarea', value: data.remarks, span: 2, attrs: 'rows="3"' })}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Totals</h2><span class="sub">Calculated automatically</span></div>
          <div class="card-body">
            <div class="form-grid">
              <div class="field">
                <label>Discount</label>
                <div class="input-group">
                  <input class="input num" type="number" name="discountValue" id="discount-value" min="0" step="0.01" value="${esc(data.discountValue)}" />
                  <select class="select" id="discount-type" name="discountType">
                    <option value="amount" ${data.discountType === 'amount' ? 'selected' : ''}>₱</option>
                    <option value="percent" ${data.discountType === 'percent' ? 'selected' : ''}>%</option>
                  </select>
                </div>
              </div>
              ${field({
                label: `${esc(settings.taxLabel || 'Tax')} rate (%)`,
                name: 'taxRate',
                type: 'number',
                value: data.taxRate,
                attrs: 'min="0" max="100" step="0.01"',
                hint: settings.taxEnabled ? `Business default: ${settings.taxRate}%` : 'No default tax configured in Business Settings.',
              })}
            </div>
            <div class="divider"></div>
            <div class="totals-panel" style="max-width:none">
              <div class="totals-row"><span class="label">Subtotal</span><span class="value" id="t-subtotal">₱0.00</span></div>
              <div class="totals-row"><span class="label" id="t-discount-label">Discount</span><span class="value" id="t-discount">₱0.00</span></div>
              <div class="totals-row"><span class="label" id="t-tax-label">Tax</span><span class="value" id="t-tax">₱0.00</span></div>
              <div class="totals-row grand"><span class="label">Grand total</span><span class="value" id="t-total">₱0.00</span></div>
            </div>
          </div>
        </div>
      </div>

      <div class="form-actions">
        <a class="btn" href="${isEdit ? `#/quotations/${params.id}` : '#/quotations'}">Cancel</a>
        <button class="btn btn-dark" type="button" id="save-sent">Save &amp; mark as sent</button>
        <div class="spacer"></div>
        <span class="small muted">Document number is assigned automatically when saved.</span>
        <button class="btn btn-primary" type="submit" id="save-btn-bottom">${icon('save', 15)} ${isEdit ? 'Save changes' : 'Save quotation'}</button>
      </div>
    </form>
  `;

  const form = view.querySelector('#quotation-form');
  const itemsBody = view.querySelector('#items-body');
  const productList = state.products;

  const rowHtml = (item, index) => `
    <tr data-row="${index}">
      <td>
        <select class="select" data-idx="${index}" data-key="productId">${productOptions(productList)}</select>
      </td>
      <td><textarea class="textarea" rows="2" data-idx="${index}" data-key="description" placeholder="Item description">${esc(item.description)}</textarea></td>
      <td><input class="input num" type="number" min="0.001" step="any" data-idx="${index}" data-key="quantity" value="${esc(item.quantity)}" /></td>
      <td><input class="input" data-idx="${index}" data-key="unit" value="${esc(item.unit)}" /></td>
      <td><input class="input num" type="number" min="0" step="0.01" data-idx="${index}" data-key="unitPrice" value="${esc(item.unitPrice)}" /></td>
      <td><div class="line-amount" data-amount="${index}">₱0.00</div></td>
      <td class="actions"><button type="button" class="icon-btn" data-remove="${index}" title="Remove line" aria-label="Remove line">${icon('trash', 15)}</button></td>
    </tr>`;

  function renderItems() {
    itemsBody.innerHTML = items.map(rowHtml).join('');
    items.forEach((item, index) => {
      const select = itemsBody.querySelector(`select[data-idx="${index}"][data-key="productId"]`);
      if (select) select.value = item.productId || '';
    });
    view.querySelector('#items-count').textContent = `${items.length} line item${items.length === 1 ? '' : 's'}`;
    updateTotals();
  }

  function readItem(index, key, value) {
    if (key === 'quantity' || key === 'unitPrice') items[index][key] = Number(value) || 0;
    else items[index][key] = value;
  }

  function updateTotals() {
    const discountType = view.querySelector('#discount-type').value;
    const discountValue = Number(view.querySelector('#discount-value').value) || 0;
    const taxRate = Number(form.querySelector('[name="taxRate"]').value) || 0;
    const totals = computeTotals({
      items: items.map((i) => ({ quantity: Number(i.quantity) || 0, unitPrice: Number(i.unitPrice) || 0 })),
      discountType,
      discountValue,
      taxRate,
    });
    items.forEach((item, i) => {
      const cell = itemsBody.querySelector(`[data-amount="${i}"]`);
      if (cell) cell.textContent = money(totals.lines[i]?.lineTotal || 0);
    });
    view.querySelector('#t-subtotal').textContent = money(totals.subtotal);
    view.querySelector('#t-discount-label').textContent =
      discountType === 'percent' && discountValue ? `Discount (${discountValue}%)` : 'Discount';
    view.querySelector('#t-discount').textContent = totals.discountAmount ? `− ${money(totals.discountAmount)}` : money(0);
    view.querySelector('#t-tax-label').textContent = `${getState().settings.taxLabel || 'Tax'}${taxRate ? ` (${taxRate}%)` : ''}`;
    view.querySelector('#t-tax').textContent = money(totals.taxAmount);
    view.querySelector('#t-total').textContent = money(totals.grandTotal);
  }

  itemsBody.addEventListener('input', (e) => {
    const target = e.target.closest('[data-key]');
    if (!target) return;
    const index = Number(target.dataset.idx);
    if (!items[index]) return;
    readItem(index, target.dataset.key, target.value);
    updateTotals();
  });

  itemsBody.addEventListener('change', (e) => {
    const select = e.target.closest('select[data-key="productId"]');
    if (!select) return;
    const index = Number(select.dataset.idx);
    const option = select.selectedOptions[0];
    items[index].productId = select.value;
    if (select.value && option) {
      const description = option.dataset.description || option.dataset.name || '';
      const unit = option.dataset.unit || 'pc';
      const price = Number(option.dataset.price) || 0;
      items[index].description = description;
      items[index].unit = unit;
      items[index].unitPrice = price;
      const row = itemsBody.querySelector(`tr[data-row="${index}"]`);
      if (row) {
        row.querySelector('[data-key="description"]').value = description;
        row.querySelector('[data-key="unit"]').value = unit;
        row.querySelector('[data-key="unitPrice"]').value = price;
      }
    }
    updateTotals();
  });

  itemsBody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    if (items.length === 1) {
      toast('A quotation needs at least one line item.', 'error', 'Cannot remove');
      return;
    }
    items.splice(Number(btn.dataset.remove), 1);
    renderItems();
  });

  view.querySelector('#add-item').addEventListener('click', () => {
    items.push({ productId: '', description: '', quantity: 1, unit: 'pc', unitPrice: 0 });
    renderItems();
    const last = itemsBody.querySelector(`tr[data-row="${items.length - 1}"] textarea`);
    if (last) last.focus();
  });

  ['#discount-value', '#discount-type'].forEach((sel) =>
    view.querySelector(sel).addEventListener('input', updateTotals)
  );
  form.querySelector('[name="taxRate"]').addEventListener('input', updateTotals);

  // Selecting a saved customer fills the customer fields.
  form.querySelector('[name="customerId"]').addEventListener('change', (e) => {
    const option = e.target.selectedOptions[0];
    if (!e.target.value || !option) return;
    form.querySelector('[name="customerName"]').value = option.dataset.name || '';
    form.querySelector('[name="companyName"]').value = option.dataset.company || '';
    form.querySelector('[name="contactNumber"]').value = option.dataset.phone || '';
    form.querySelector('[name="email"]').value = option.dataset.email || '';
    form.querySelector('[name="address"]').value = option.dataset.address || '';
    if (!form.querySelector('[name="projectLocation"]').value && option.dataset.locations) {
      form.querySelector('[name="projectLocation"]').value = option.dataset.locations;
    }
    clearInvalid(form);
  });

  function collect(statusOverride) {
    const payload = {
      customerId: form.querySelector('[name="customerId"]').value || null,
      customerName: form.querySelector('[name="customerName"]').value.trim(),
      companyName: form.querySelector('[name="companyName"]').value.trim(),
      contactNumber: form.querySelector('[name="contactNumber"]').value.trim(),
      email: form.querySelector('[name="email"]').value.trim(),
      address: form.querySelector('[name="address"]').value.trim(),
      issueDate: form.querySelector('[name="issueDate"]').value,
      validUntil: form.querySelector('[name="validUntil"]').value,
      projectName: form.querySelector('[name="projectName"]').value.trim(),
      projectLocation: form.querySelector('[name="projectLocation"]').value.trim(),
      paymentTerms: form.querySelector('[name="paymentTerms"]').value,
      deliverySchedule: form.querySelector('[name="deliverySchedule"]').value,
      remarks: form.querySelector('[name="remarks"]').value,
      preparedBy: form.querySelector('[name="preparedBy"]').value.trim(),
      status: statusOverride || form.querySelector('[name="status"]').value,
      discountType: form.querySelector('#discount-type').value,
      discountValue: Number(form.querySelector('#discount-value').value) || 0,
      taxRate: Number(form.querySelector('[name="taxRate"]').value) || 0,
      items: items.map((i) => ({
        productId: i.productId || null,
        description: String(i.description || '').trim(),
        quantity: Number(i.quantity) || 0,
        unit: i.unit || 'pc',
        unitPrice: Number(i.unitPrice) || 0,
      })),
    };
    return payload;
  }

  function validate(payload) {
    clearInvalid(form);
    let ok = true;
    if (!payload.customerName) {
      markInvalid(form, 'customerName', 'Customer name is required.');
      ok = false;
    }
    if (!payload.issueDate) {
      markInvalid(form, 'issueDate', 'Issue date is required.');
      ok = false;
    }
    if (payload.validUntil && payload.issueDate && payload.validUntil < payload.issueDate) {
      markInvalid(form, 'validUntil', 'Validity date cannot be before the issue date.');
      ok = false;
    }
    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      markInvalid(form, 'email', 'Enter a valid email address.');
      ok = false;
    }
    const badLine = items.findIndex((i) => !String(i.description || '').trim());
    if (badLine >= 0) {
      const row = itemsBody.querySelector(`tr[data-row="${badLine}"] textarea`);
      if (row) {
        row.classList.add('invalid');
        row.style.borderColor = 'var(--danger)';
        row.focus();
      }
      toast(`Line ${badLine + 1} needs a description.`, 'error', 'Check line items');
      ok = false;
    }
    const badQty = items.findIndex((i) => !(Number(i.quantity) > 0));
    if (badQty >= 0) {
      toast(`Line ${badQty + 1} needs a quantity greater than zero.`, 'error', 'Check line items');
      ok = false;
    }
    return ok;
  }

  async function submit(statusOverride, button) {
    const payload = collect(statusOverride);
    if (!validate(payload)) return;
    setBusy(button, true);
    try {
      const saved = isEdit
        ? await api.put(`/quotations/${params.id}`, payload)
        : await api.post('/quotations', payload);
      toast(`${saved.number} saved.`, 'success', isEdit ? 'Quotation updated' : 'Quotation created');
      navigate(`/quotations/${saved.id}`);
    } catch (err) {
      toast(err.message, 'error', 'Could not save quotation');
      setBusy(button, false);
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit(null, view.querySelector('#save-btn-bottom'));
  });
  view.querySelector('#save-sent').addEventListener('click', (e) => {
    const statusSelect = form.querySelector('[name="status"]');
    statusSelect.value = 'sent';
    submit('sent', e.currentTarget);
  });

  renderItems();
}
