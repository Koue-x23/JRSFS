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

export async function render({ view, params, query }) {
  const isEdit = Boolean(params.id);
  const state = await ensureLookups();
  const settings = state.settings;
  const defaultDueDays = Number(settings.defaultDueDays ?? 30);
  setPageMeta({
    title: isEdit ? 'Edit invoice' : 'New invoice',
    subtitle: isEdit ? 'Update this invoice. Recorded payments must not exceed the new total.' : 'Bill a customer for fabrication work or services.',
  });

  let invoice = null;
  let linkedQuotation = null;
  if (isEdit) {
    view.innerHTML = loadingBlock('Loading invoice…');
    invoice = await api.get(`/invoices/${params.id}`);
  } else if (query.quotation) {
    view.innerHTML = loadingBlock('Copying quotation…');
    const quotation = await api.get(`/quotations/${query.quotation}`);
    if (quotation.status !== 'approved' || quotation.invoiceId) {
      toast('Only approved quotations that are not yet invoiced can be copied.', 'error', 'Quotation unavailable');
      navigate(`/quotations/${quotation.id}`);
      return;
    }
    linkedQuotation = quotation;
  }

  const presetCustomer = !invoice && !linkedQuotation && query.customer
    ? state.customers.find((c) => String(c.id) === String(query.customer))
    : null;
  const base = invoice || linkedQuotation || presetCustomer;
  const items = invoice
    ? invoice.items.map((it) => ({
        productId: it.productId || '',
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice: it.unitPrice,
      }))
    : linkedQuotation
    ? linkedQuotation.items.map((it) => ({
        productId: it.productId || '',
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice: it.unitPrice,
      }))
    : [{ productId: '', description: '', quantity: 1, unit: 'pc', unitPrice: 0 }];

  const data = {
    customerId: base?.customerId || '',
    customerName: base?.customerName || '',
    companyName: base?.companyName || '',
    contactNumber: base?.contactNumber || '',
    email: base?.email || '',
    address: base?.address || '',
    invoiceDate: invoice?.invoiceDate || today(),
    dueDate: invoice?.dueDate || addDays(today(), defaultDueDays),
    quotationId: invoice?.quotationId || linkedQuotation?.id || '',
    quotationNumber: invoice?.quotationNumber || linkedQuotation?.number || '',
    paymentTerms: invoice?.paymentTerms ?? (linkedQuotation?.paymentTerms || settings.defaultPaymentTerms),
    remarks: invoice?.remarks ?? settings.defaultNotes,
    preparedBy: invoice?.preparedBy || settings.representative,
    discountType: invoice?.discountType || linkedQuotation?.discountType || 'amount',
    discountValue: invoice?.discountValue ?? linkedQuotation?.discountValue ?? 0,
    taxRate: invoice?.taxRate ?? linkedQuotation?.taxRate ?? (settings.taxEnabled ? settings.taxRate : 0),
  };

  const paidSoFar = invoice?.amountPaid || 0;
  const dueDays = defaultDueDays;

  view.innerHTML = `
    <form id="invoice-form" novalidate autocomplete="off">
      <div class="page-head">
        <div>
          <h2 style="font-size:15px">${isEdit ? esc(invoice.number) : 'Invoice details'}</h2>
          <p>${linkedQuotation ? `Customer and line items copied from quotation ${esc(linkedQuotation.number)}.` : 'Choose a saved customer to fill in their details automatically.'}</p>
        </div>
        <div class="actions">
          <a class="btn" href="${isEdit ? `#/invoices/${params.id}` : '#/invoices'}">${icon('back', 15)} Cancel</a>
          <button class="btn btn-primary" type="submit" id="save-btn">${icon('save', 15)} ${isEdit ? 'Save changes' : 'Save invoice'}</button>
        </div>
      </div>

      ${
        isEdit && paidSoFar > 0
          ? `<div class="callout info mb-16">${icon('info', 16)}<div>${money(
              paidSoFar
            )} has already been recorded against this invoice. The total cannot be reduced below that amount.</div></div>`
          : ''
      }

      <div class="card">
        <div class="card-head"><h2>Customer &amp; dates</h2></div>
        <div class="card-body">
          <div class="form-grid">
            ${field({
              label: 'Select saved customer',
              name: 'customerId',
              type: 'select',
              span: 2,
              options: customerOptions(state.customers, data.customerId),
            })}
            ${field({ label: 'Customer name', name: 'customerName', value: data.customerName, required: true })}
            ${field({ label: 'Company name', name: 'companyName', value: data.companyName })}
            ${field({ label: 'Contact number', name: 'contactNumber', value: data.contactNumber })}
            ${field({ label: 'Email address', name: 'email', type: 'email', value: data.email })}
            ${field({ label: 'Billing address', name: 'address', type: 'textarea', value: data.address, span: 2, attrs: 'rows="2"' })}
            ${field({ label: 'Invoice date', name: 'invoiceDate', type: 'date', value: data.invoiceDate, required: true })}
            ${field({ label: 'Due date', name: 'dueDate', type: 'date', value: data.dueDate, hint: `Default due date is ${dueDays} day(s) after the invoice date (Business Settings).` })}
            ${
              data.quotationNumber
                ? `<div class="field span-2"><label>Related quotation</label><div class="form-note">${icon('quotation', 13)} Linked to ${esc(
                    data.quotationNumber
                  )} — carried over automatically.</div></div>`
                : ''
            }
            ${field({ label: 'Prepared by', name: 'preparedBy', value: data.preparedBy })}
            ${field({ label: 'Payment terms', name: 'paymentTerms', type: 'textarea', value: data.paymentTerms, attrs: 'rows="2"' })}
            ${field({ label: 'Remarks', name: 'remarks', type: 'textarea', value: data.remarks, span: 2, attrs: 'rows="2"' })}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Line items</h2><span class="sub">Changing a price here does not affect saved product prices</span></div>
        <div class="card-body tight">
          <div class="items-scroll">
            <table class="items-table">
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
          <div class="card-head"><h2>Notes</h2></div>
          <div class="card-body">
            <div class="form-note">${icon('info', 13)} Payments are recorded separately in the Payments module. Saving an invoice does not mark it paid.</div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h2>Totals</h2></div>
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
              })}
            </div>
            <div class="divider"></div>
            <div class="totals-panel" style="max-width:none">
              <div class="totals-row"><span class="label">Subtotal</span><span class="value" id="t-subtotal">₱0.00</span></div>
              <div class="totals-row"><span class="label" id="t-discount-label">Discount</span><span class="value" id="t-discount">₱0.00</span></div>
              <div class="totals-row"><span class="label" id="t-tax-label">Tax</span><span class="value" id="t-tax">₱0.00</span></div>
              <div class="totals-row grand"><span class="label">Invoice total</span><span class="value" id="t-total">₱0.00</span></div>
            </div>
          </div>
        </div>
      </div>

      <div class="form-actions">
        <a class="btn" href="${isEdit ? `#/invoices/${params.id}` : '#/invoices'}">Cancel</a>
        <div class="spacer"></div>
        <span class="small muted">Invoice number is assigned automatically when saved.</span>
        <button class="btn btn-primary" type="submit">${icon('save', 15)} ${isEdit ? 'Save changes' : 'Save invoice'}</button>
      </div>
    </form>
  `;

  const form = view.querySelector('#invoice-form');
  const itemsBody = view.querySelector('#items-body');

  const rowHtml = (item, index) => `
    <tr data-row="${index}">
      <td><select class="select" data-idx="${index}" data-key="productId">${productOptions(state.products)}</select></td>
      <td><textarea class="textarea" rows="2" data-idx="${index}" data-key="description" placeholder="Item description">${esc(item.description)}</textarea></td>
      <td><input class="input num" type="number" min="0.001" step="any" data-idx="${index}" data-key="quantity" value="${esc(item.quantity)}" /></td>
      <td><input class="input" data-idx="${index}" data-key="unit" value="${esc(item.unit)}" /></td>
      <td><input class="input num" type="number" min="0" step="0.01" data-idx="${index}" data-key="unitPrice" value="${esc(item.unitPrice)}" /></td>
      <td><div class="line-amount" data-amount="${index}">₱0.00</div></td>
      <td class="actions"><button type="button" class="icon-btn" data-remove="${index}" title="Remove line">${icon('trash', 15)}</button></td>
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
    view.querySelector('#t-discount-label').textContent = discountType === 'percent' && discountValue ? `Discount (${discountValue}%)` : 'Discount';
    view.querySelector('#t-discount').textContent = totals.discountAmount ? `− ${money(totals.discountAmount)}` : money(0);
    view.querySelector('#t-tax-label').textContent = `${getState().settings.taxLabel || 'Tax'}${taxRate ? ` (${taxRate}%)` : ''}`;
    view.querySelector('#t-tax').textContent = money(totals.taxAmount);
    view.querySelector('#t-total').textContent = money(totals.grandTotal);
  }

  itemsBody.addEventListener('input', (e) => {
    const target = e.target.closest('[data-key]');
    if (!target) return;
    const index = Number(target.dataset.idx);
    const key = target.dataset.key;
    if (!items[index]) return;
    items[index][key] = key === 'quantity' || key === 'unitPrice' ? Number(target.value) || 0 : target.value;
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
      items[index].description = description;
      items[index].unit = option.dataset.unit || 'pc';
      items[index].unitPrice = Number(option.dataset.price) || 0;
      const row = itemsBody.querySelector(`tr[data-row="${index}"]`);
      row.querySelector('[data-key="description"]').value = description;
      row.querySelector('[data-key="unit"]').value = items[index].unit;
      row.querySelector('[data-key="unitPrice"]').value = items[index].unitPrice;
    }
    updateTotals();
  });

  itemsBody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    if (items.length === 1) {
      toast('An invoice needs at least one line item.', 'error', 'Cannot remove');
      return;
    }
    items.splice(Number(btn.dataset.remove), 1);
    renderItems();
  });

  view.querySelector('#add-item').addEventListener('click', () => {
    items.push({ productId: '', description: '', quantity: 1, unit: 'pc', unitPrice: 0 });
    renderItems();
  });

  ['#discount-value', '#discount-type'].forEach((sel) => view.querySelector(sel).addEventListener('input', updateTotals));
  form.querySelector('[name="taxRate"]').addEventListener('input', updateTotals);

  form.querySelector('[name="customerId"]').addEventListener('change', (e) => {
    const option = e.target.selectedOptions[0];
    if (!e.target.value || !option) return;
    form.querySelector('[name="customerName"]').value = option.dataset.name || '';
    form.querySelector('[name="companyName"]').value = option.dataset.company || '';
    form.querySelector('[name="contactNumber"]').value = option.dataset.phone || '';
    form.querySelector('[name="email"]').value = option.dataset.email || '';
    form.querySelector('[name="address"]').value = option.dataset.address || '';
    clearInvalid(form);
  });

  form.querySelector('[name="invoiceDate"]').addEventListener('change', (e) => {
    const invoiceDate = e.target.value;
    const dueDateInput = form.querySelector('[name="dueDate"]');
    if (invoiceDate && !dueDateInput.dataset.touched) {
      dueDateInput.value = addDays(invoiceDate, dueDays);
    }
  });
  form.querySelector('[name="dueDate"]').addEventListener('input', (e) => {
    e.target.dataset.touched = '1';
  });

  function validate(payload) {
    clearInvalid(form);
    let ok = true;
    if (!payload.customerName) {
      markInvalid(form, 'customerName', 'Customer name is required.');
      ok = false;
    }
    if (!payload.invoiceDate) {
      markInvalid(form, 'invoiceDate', 'Invoice date is required.');
      ok = false;
    }
    if (payload.dueDate && payload.invoiceDate && payload.dueDate < payload.invoiceDate) {
      markInvalid(form, 'dueDate', 'Due date cannot be before the invoice date.');
      ok = false;
    }
    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      markInvalid(form, 'email', 'Enter a valid email address.');
      ok = false;
    }
    const badLine = items.findIndex((i) => !String(i.description || '').trim());
    if (badLine >= 0) {
      const fieldEl = itemsBody.querySelector(`tr[data-row="${badLine}"] textarea`);
      if (fieldEl) fieldEl.focus();
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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      customerId: form.querySelector('[name="customerId"]').value || null,
      customerName: form.querySelector('[name="customerName"]').value.trim(),
      companyName: form.querySelector('[name="companyName"]').value.trim(),
      contactNumber: form.querySelector('[name="contactNumber"]').value.trim(),
      email: form.querySelector('[name="email"]').value.trim(),
      address: form.querySelector('[name="address"]').value.trim(),
      invoiceDate: form.querySelector('[name="invoiceDate"]').value,
      dueDate: form.querySelector('[name="dueDate"]').value,
      quotationId: data.quotationId || null,
      quotationNumber: data.quotationNumber || '',
      paymentTerms: form.querySelector('[name="paymentTerms"]').value,
      remarks: form.querySelector('[name="remarks"]').value,
      preparedBy: form.querySelector('[name="preparedBy"]').value.trim(),
      discountType: view.querySelector('#discount-type').value,
      discountValue: Number(view.querySelector('#discount-value').value) || 0,
      taxRate: Number(form.querySelector('[name="taxRate"]').value) || 0,
      items: items.map((i) => ({
        productId: i.productId || null,
        description: String(i.description || '').trim(),
        quantity: Number(i.quantity) || 0,
        unit: i.unit || 'pc',
        unitPrice: Number(i.unitPrice) || 0,
      })),
    };
    if (!validate(payload)) return;
    const button = form.querySelector('#save-btn');
    setBusy(button, true);
    try {
      const saved = isEdit ? await api.put(`/invoices/${params.id}`, payload) : await api.post('/invoices', payload);
      toast(`${saved.number} saved.`, 'success', isEdit ? 'Invoice updated' : 'Invoice created');
      navigate(`/invoices/${saved.id}`);
    } catch (err) {
      toast(err.message, 'error', 'Could not save invoice');
      setBusy(button, false);
    }
  });

  renderItems();
}
