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
  TOOLBAR,
  dateRangeFilter,
  wireRowLinks,
  debounce,
  openModal,
  field,
  setBusy,
  ensureLookups,
  getState,
  today,
  methodOptions,
} from './shared.js';

/**
 * Record-payment modal. Used by the Payments page, invoice pages and invoice lists.
 * `invoice` may be supplied to lock the modal to a specific invoice.
 */
export async function openPaymentModal({ invoice = null, onSaved = null, mode = 'create', payment = null } = {}) {
  const state = await ensureLookups();
  let targetInvoice = invoice;

  if (mode === 'create' && !targetInvoice) {
    const openInvoices = await api.get('/invoices', { status: 'open' });
    if (!openInvoices.length) {
      toast('There are no invoices with an outstanding balance.', 'info', 'Nothing to collect');
      return;
    }
    const options = openInvoices
      .map(
        (inv) =>
          `<option value="${inv.id}" data-balance="${inv.balance}">${esc(inv.number)} · ${esc(inv.customerName)} · balance ${money(
            inv.balance
          )}</option>`
      )
      .join('');
    targetInvoice = openInvoices[0];
    var invoiceSelect = `<div class="field"><label for="pay-invoice">Invoice <span class="req">*</span></label>
      <select class="select" id="pay-invoice">${options}</select></div>`;
  }

  const isEdit = mode === 'edit' && payment;
  const balance = targetInvoice ? Number(targetInvoice.balance) : 0;
  const body = `
    <div class="form-grid">
      ${
        invoiceSelect
          ? `<div class="span-2" id="invoice-select-wrap">${invoiceSelect}</div>`
          : targetInvoice
          ? `<div class="span-2"><div class="form-note">Invoice <strong>${esc(targetInvoice.number)}</strong> · ${esc(
              targetInvoice.customerName
            )} · outstanding <strong id="invoice-balance">${money(balance)}</strong></div></div>`
          : ''
      }
      ${field({
        label: 'Payment amount (₱)',
        name: 'amount',
        type: 'number',
        value: isEdit ? payment.amount : balance > 0 ? balance.toFixed(2) : '',
        required: true,
        attrs: 'min="0.01" step="0.01"',
        hint: targetInvoice ? `Maximum: ${money(balance)}` : 'The remaining balance of the selected invoice.',
      })}
      ${field({ label: 'Payment date', name: 'paymentDate', type: 'date', value: isEdit ? payment.paymentDate : today(), required: true })}
      ${field({
        label: 'Payment method',
        name: 'method',
        type: 'select',
        options: methodOptions(state.paymentMethods, isEdit ? payment.method : state.paymentMethods[0]),
      })}
      ${field({
        label: 'Payment reference',
        name: 'reference',
        value: isEdit ? payment.reference : '',
        hint: isEdit ? 'Must be unique.' : 'Leave blank to generate one automatically.',
      })}
      ${field({ label: 'Reference / transaction details', name: 'details', value: isEdit ? payment.details : '', span: 2, placeholder: 'e.g. GCash ref no., bank, OR number' })}
      ${field({ label: 'Remarks', name: 'remarks', type: 'textarea', value: isEdit ? payment.remarks : '', span: 2, attrs: 'rows="2"' })}
    </div>
  `;

  const modal = openModal({
    title: isEdit ? `Edit payment ${payment.reference}` : 'Record a payment',
    body,
    actions: [
      { label: 'Cancel', onClick: ({ close }) => close() },
      {
        label: isEdit ? 'Save payment' : 'Record payment',
        variant: 'btn-primary',
        icon: 'save',
        onClick: async ({ close, modal: dialog }) => {
          const btn = dialog.querySelector('.modal-foot .btn-primary');
          const amount = dialog.querySelector('[name="amount"]').value;
          const paymentDate = dialog.querySelector('[name="paymentDate"]').value;
          const method = dialog.querySelector('[name="method"]').value;
          const reference = dialog.querySelector('[name="reference"]').value.trim();
          const details = dialog.querySelector('[name="details"]').value;
          const remarks = dialog.querySelector('[name="remarks"]').value;
          const invoiceSelectEl = dialog.querySelector('#pay-invoice');
          const invoiceId = invoiceSelectEl ? invoiceSelectEl.value : targetInvoice?.id;
          if (!invoiceId) {
            toast('Select the invoice this payment applies to.', 'error');
            return;
          }
          const maxBalance = invoiceSelectEl
            ? Number(invoiceSelectEl.selectedOptions[0]?.dataset.balance || 0)
            : invoiceId === targetInvoice?.id
            ? balance + (isEdit ? Number(payment.amount) : 0)
            : Number(invoiceSelectEl?.selectedOptions[0]?.dataset.balance || 0);
          if (!(Number(amount) > 0)) {
            toast('Enter a payment amount greater than zero.', 'error', 'Amount required');
            dialog.querySelector('[name="amount"]').focus();
            return;
          }
          if (!isEdit && Number(amount) > maxBalance + 0.005) {
            toast(`The amount cannot exceed the remaining balance of ${money(maxBalance)}.`, 'error', 'Amount too high');
            dialog.querySelector('[name="amount"]').focus();
            return;
          }
          setBusy(btn, true);
          try {
            if (isEdit) {
              await api.put(`/payments/${payment.id}`, { amount, paymentDate, method, reference, details, remarks });
              toast('Payment updated and invoice balance recalculated.', 'success', 'Payment saved');
            } else {
              const res = await api.post(`/invoices/${invoiceId}/payments`, {
                amount,
                paymentDate,
                method,
                reference: reference || undefined,
                details,
                remarks,
              });
              toast(
                `${money(Number(amount))} recorded. ${res.invoice.number} balance is now ${money(res.invoice.balance)}.`,
                'success',
                'Payment recorded'
              );
            }
            close();
            if (onSaved) await onSaved();
          } catch (err) {
            toast(err.message, 'error', 'Payment not saved');
            setBusy(btn, false);
          }
        },
      },
    ],
  });

  const invoiceSelectEl = modal.modal.querySelector('#pay-invoice');
  if (invoiceSelectEl) {
    invoiceSelectEl.addEventListener('change', () => {
      const option = invoiceSelectEl.selectedOptions[0];
      const bal = Number(option.dataset.balance) || 0;
      const amountInput = modal.modal.querySelector('[name="amount"]');
      amountInput.value = bal.toFixed(2);
      const hint = modal.modal.querySelector('[data-field="amount"] .hint');
      if (hint) hint.textContent = `Maximum: ${money(bal)}`;
    });
  }
  return modal;
}

export async function render({ view, query }) {
  const state = await ensureLookups();
  setPageMeta({
    title: 'Payments',
    subtitle: 'Every payment recorded against an invoice. Balances update automatically.',
    action: { label: 'Record payment', href: '#/payments?new=1', icon: 'plus' },
  });

  const filters = {
    search: query.search || '',
    method: query.method || '',
    from: query.from || '',
    to: query.to || '',
  };

  view.innerHTML = `
    <div class="card">
      ${TOOLBAR({
        search: filters.search,
        placeholder: 'Search reference, invoice, customer, or details…',
        filters: `<select class="select" id="method-filter" style="width:auto">
            <option value="">All payment methods</option>
            ${state.paymentMethods
              .map((m) => `<option value="${esc(m)}" ${m === filters.method ? 'selected' : ''}>${esc(m)}</option>`)
              .join('')}
          </select>${dateRangeFilter(filters.from, filters.to)}`,
        actions: `<button class="btn btn-sm btn-primary" id="record-btn">${icon('plus', 14)} Record payment</button>`,
      })}
      <div id="list-body"><div class="loading-block"><span class="spinner"></span> Loading payments…</div></div>
    </div>
  `;

  const listBody = view.querySelector('#list-body');

  async function load() {
    listBody.innerHTML = '<div class="loading-block"><span class="spinner"></span> Loading…</div>';
    let rows;
    try {
      rows = await api.get('/payments', filters);
    } catch (err) {
      listBody.innerHTML = `<div class="table-empty">${esc(err.message)}</div>`;
      return;
    }
    if (!rows.length) {
      const filtered = filters.search || filters.method || filters.from || filters.to;
      listBody.innerHTML = filtered
        ? `<div class="table-empty">${icon('search', 20)}<div class="mt-8 strong">No matching payments</div>
            <div class="small">Try different filters.</div></div>`
        : emptyState({
            title: 'No payments recorded yet',
            message: 'Record a payment against an invoice and the balance, status and reports update automatically.',
            iconName: 'payments',
            actionHtml: `<button class="btn btn-primary" id="record-empty">${icon('plus', 15)} Record payment</button>`,
          });
      const btn = listBody.querySelector('#record-empty');
      if (btn) btn.addEventListener('click', () => openPaymentModal({ onSaved: load }));
      return;
    }
    const total = rows.reduce((s, p) => s + p.amount, 0);
    listBody.innerHTML = `<div class="table-wrap"><table class="data">
      <thead><tr>
        <th>Reference</th><th>Date</th><th>Customer</th><th>Invoice</th><th>Method</th><th class="num">Amount</th><th>Details</th><th></th>
      </tr></thead>
      <tbody>${rows
        .map(
          (p) => `<tr>
            <td><span class="doc-link">${esc(p.reference)}</span></td>
            <td class="nowrap">${formatDate(p.paymentDate, 'short')}</td>
            <td>${p.customerId ? `<a href="#/customers/${p.customerId}">${esc(p.customerName)}</a>` : esc(p.customerName)}</td>
            <td><a href="#/invoices/${p.invoiceId}">${esc(p.invoiceNumber)}</a></td>
            <td>${esc(p.method)}</td>
            <td class="num strong">${money(p.amount)}</td>
            <td class="small muted">${esc(p.details || '—')}</td>
            <td><div class="row-actions">
              <button class="btn btn-sm btn-ghost" data-edit="${p.id}" title="Edit payment">${icon('edit', 14)}</button>
              <button class="btn btn-sm btn-ghost" data-delete="${p.id}" title="Delete payment">${icon('trash', 14)}</button>
            </div></td>
          </tr>`
        )
        .join('')}</tbody></table></div>
      <div class="toolbar" style="border-top:1px solid var(--line);border-bottom:0">
        <span class="small muted">${rows.length} payment${rows.length === 1 ? '' : 's'} · <strong class="tabular">${money(
      total
    )}</strong> received in this view</span>
      </div>`;

    listBody.querySelectorAll('[data-edit]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const payment = rows.find((r) => String(r.id) === btn.dataset.edit);
        openPaymentModal({ mode: 'edit', payment, onSaved: load });
      })
    );
    listBody.querySelectorAll('[data-delete]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const payment = rows.find((r) => String(r.id) === btn.dataset.delete);
        const ok = await confirmDialog({
          title: 'Delete this payment?',
          message: `Payment ${payment.reference} (${money(payment.amount)}) will be removed and the invoice balance recalculated. This cannot be undone.`,
          confirmLabel: 'Delete payment',
          variant: 'btn-danger',
        });
        if (!ok) return;
        try {
          await api.del(`/payments/${payment.id}`);
          toast('Payment deleted and invoice balance recalculated.', 'success', 'Payment removed');
          load();
        } catch (err) {
          toast(err.message, 'error', 'Could not delete payment');
        }
      })
    );
  }

  view.querySelector('#record-btn').addEventListener('click', () => openPaymentModal({ onSaved: load }));
  view.querySelector('#method-filter').addEventListener('change', (e) => {
    filters.method = e.target.value;
    load();
  });
  view.querySelector('#filter-from').addEventListener('change', (e) => {
    filters.from = e.target.value;
    load();
  });
  view.querySelector('#filter-to').addEventListener('change', (e) => {
    filters.to = e.target.value;
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
  if (query.new === '1') openPaymentModal({ onSaved: load });
}
