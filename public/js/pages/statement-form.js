import { api } from '../api.js';
import {
  icon,
  esc,
  money,
  formatDate,
  toast,
  setPageMeta,
  ensureLookups,
  getState,
  today,
  customerOptions,
  field,
  markInvalid,
  clearInvalid,
  setBusy,
  navigate,
  loadingBlock,
} from './shared.js';

function monthStart() {
  return `${today().slice(0, 7)}-01`;
}

export async function render({ view, query = {} }) {
  const state = await ensureLookups();
  const settings = state.settings;
  setPageMeta({
    title: 'New billing statement',
    subtitle: 'Select a customer and billing period. Charges and payments come from saved records.',
  });

  if (!state.customers.length) {
    view.innerHTML = `<div class="card"><div class="empty">
      <div class="empty-icon">${icon('customers', 22)}</div>
      <h3>Add a customer first</h3>
      <p>Billing statements summarize a saved customer’s invoices and payments. Create the customer, then return here.</p>
      <div class="btn-row mt-8"><a class="btn btn-primary" href="#/customers/new">Add customer</a>
      <a class="btn" href="#/customers">Customers</a></div>
    </div></div>`;
    return;
  }

  const preset = query.customer ? state.customers.find((c) => String(c.id) === String(query.customer)) : null;
  const defaults = {
    customerId: preset?.id || state.customers[0].id,
    periodFrom: monthStart(),
    periodTo: today(),
    statementDate: today(),
    previousBalance: '',
    paymentTerms: settings.defaultPaymentTerms,
    remarks: '',
    preparedBy: settings.representative,
  };

  view.innerHTML = `
    <form id="statement-form" novalidate autocomplete="off">
      <div class="page-head">
        <div>
          <h2 style="font-size:15px">Billing period</h2>
          <p>The statement lists every invoice and payment for the selected customer inside the period, with a running balance.</p>
        </div>
        <div class="actions">
          <a class="btn" href="#/statements">${icon('back', 15)} Cancel</a>
          <button class="btn btn-primary" type="submit" id="save-btn">${icon('save', 15)} Save statement</button>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Statement details</h2></div>
        <div class="card-body">
          <div class="form-grid">
            ${field({ label: 'Customer', name: 'customerId', type: 'select', options: customerOptions(state.customers, defaults.customerId), required: true })}
            ${field({ label: 'Statement date', name: 'statementDate', type: 'date', value: defaults.statementDate, required: true })}
            ${field({ label: 'Billing period from', name: 'periodFrom', type: 'date', value: defaults.periodFrom, required: true })}
            ${field({ label: 'Billing period to', name: 'periodTo', type: 'date', value: defaults.periodTo, required: true })}
            ${field({
              label: 'Opening / previous balance (₱)',
              name: 'previousBalance',
              type: 'number',
              value: defaults.previousBalance,
              attrs: 'min="0" step="0.01"',
              hint: 'Leave blank to compute it automatically from invoices and payments before the period.',
            })}
            ${field({ label: 'Prepared by', name: 'preparedBy', value: defaults.preparedBy })}
            ${field({ label: 'Payment terms', name: 'paymentTerms', type: 'textarea', value: defaults.paymentTerms, span: 2, attrs: 'rows="2"' })}
            ${field({ label: 'Remarks', name: 'remarks', type: 'textarea', value: defaults.remarks, span: 2, attrs: 'rows="2"' })}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h2>Statement preview</h2>
          <span class="sub" id="preview-status">Select a customer and period</span>
          <div class="card-actions"><button class="btn btn-sm" type="button" id="refresh-preview">${icon('refresh', 14)} Refresh</button></div>
        </div>
        <div id="preview-body"><div class="loading-block"><span class="spinner"></span> Building preview…</div></div>
      </div>

      <div class="form-actions">
        <a class="btn" href="#/statements">Cancel</a>
        <div class="spacer"></div>
        <span class="small muted">Statement number is assigned automatically when saved.</span>
        <button class="btn btn-primary" type="submit">${icon('save', 15)} Save statement</button>
      </div>
    </form>
  `;

  const form = view.querySelector('#statement-form');
  const previewBody = view.querySelector('#preview-body');
  const previewStatus = view.querySelector('#preview-status');

  let preview = null;

  async function loadPreview() {
    const customerId = form.querySelector('[name="customerId"]').value;
    const from = form.querySelector('[name="periodFrom"]').value;
    const to = form.querySelector('[name="periodTo"]').value;
    const date = form.querySelector('[name="statementDate"]').value;
    const previousBalance = form.querySelector('[name="previousBalance"]').value;
    if (!customerId || !from || !to) {
      previewBody.innerHTML = '<div class="table-empty">Choose a customer and billing period to preview the statement.</div>';
      return;
    }
    previewBody.innerHTML = '<div class="loading-block"><span class="spinner"></span> Building preview…</div>';
    try {
      preview = await api.get('/billing-statements/preview', { customerId, from, to, date, previousBalance });
    } catch (err) {
      previewBody.innerHTML = `<div class="table-empty">${esc(err.message)}</div>`;
      previewStatus.textContent = 'Could not build the preview';
      preview = null;
      return;
    }
    previewStatus.textContent = `${preview.items.length} transaction(s) in period · as of ${formatDate(preview.statementDate)}`;
    if (!preview.items.length) {
      previewBody.innerHTML = `<div class="table-empty">${icon('info', 20)}<div class="mt-8 strong">No invoices or payments in this period</div>
        <div class="small">Invoices dated ${formatDate(preview.periodFrom, 'short')} – ${formatDate(
        preview.periodTo,
        'short'
      )} and payments in the same period will appear here.${preview.previousBalance ? ` Opening balance: ${money(
          preview.previousBalance
        )}.` : ''}</div></div>`;
      return;
    }
    previewBody.innerHTML = `<div class="table-wrap"><table class="data">
      <thead><tr><th>Date</th><th>Reference</th><th>Description</th><th class="num">Charges</th><th class="num">Payments</th><th class="num">Balance</th></tr></thead>
      <tbody>
        <tr><td>—</td><td>—</td><td>Previous balance</td><td class="num">—</td><td class="num">—</td><td class="num">${money(
          preview.previousBalance
        )}</td></tr>
        ${preview.items
          .map(
            (it) => `<tr>
              <td class="nowrap">${formatDate(it.txnDate, 'short')}</td>
              <td>${esc(it.reference)}</td>
              <td>${esc(it.description)}</td>
              <td class="num">${it.charges ? money(it.charges) : '—'}</td>
              <td class="num">${it.credits ? money(it.credits) : '—'}</td>
              <td class="num">${money(it.balance)}</td>
            </tr>`
          )
          .join('')}
      </tbody>
      <tfoot>
        <tr><td colspan="3" class="num muted">Total charges</td><td class="num strong">${money(preview.totalCharges)}</td><td></td><td></td></tr>
        <tr><td colspan="3" class="num muted">Total payments</td><td></td><td class="num strong">${money(preview.totalPayments)}</td><td></td></tr>
        <tr><td colspan="3" class="num strong">Outstanding balance</td><td></td><td></td><td class="num strong" style="color:var(--accent)">${money(
          preview.outstandingBalance
        )}</td></tr>
      </tfoot>
    </table></div>
    <div class="card-body" style="border-top:1px solid var(--line)">
      <div class="small muted">Opening balance ${previousBalance !== '' ? 'entered manually' : 'computed automatically'}: ${money(
      preview.previousBalance
    )}${previousBalance === '' ? ` (auto value ${money(preview.computedPreviousBalance)})` : ''}</div>
    </div>`;
  }

  ['customerId', 'periodFrom', 'periodTo', 'statementDate', 'previousBalance'].forEach((name) => {
    const input = form.querySelector(`[name="${name}"]`);
    input.addEventListener('change', loadPreview);
    if (name === 'previousBalance') input.addEventListener('input', () => {
      clearTimeout(window.__stmtTimer);
      window.__stmtTimer = setTimeout(loadPreview, 400);
    });
  });
  view.querySelector('#refresh-preview').addEventListener('click', loadPreview);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearInvalid(form);
    const payload = {
      customerId: form.querySelector('[name="customerId"]').value,
      statementDate: form.querySelector('[name="statementDate"]').value,
      periodFrom: form.querySelector('[name="periodFrom"]').value,
      periodTo: form.querySelector('[name="periodTo"]').value,
      previousBalance: form.querySelector('[name="previousBalance"]').value,
      paymentTerms: form.querySelector('[name="paymentTerms"]').value,
      remarks: form.querySelector('[name="remarks"]').value,
      preparedBy: form.querySelector('[name="preparedBy"]').value.trim(),
    };
    if (!payload.customerId) {
      markInvalid(form, 'customerId', 'Choose a customer.');
      return;
    }
    if (!payload.periodFrom || !payload.periodTo) {
      markInvalid(form, 'periodFrom', 'Billing period start and end are required.');
      return;
    }
    if (payload.periodTo < payload.periodFrom) {
      markInvalid(form, 'periodTo', 'The period end cannot be before the start.');
      return;
    }
    const button = view.querySelector('#save-btn');
    setBusy(button, true, 'Saving…');
    try {
      const saved = await api.post('/billing-statements', payload);
      toast(`${saved.number} saved with ${money(saved.outstandingBalance)} outstanding.`, 'success', 'Statement created');
      navigate(`/statements/${saved.id}`);
    } catch (err) {
      toast(err.message, 'error', 'Could not save statement');
      setBusy(button, false);
    }
  });

  await loadPreview();
}
