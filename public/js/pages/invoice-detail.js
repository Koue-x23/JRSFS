import { api } from '../api.js';
import {
  icon,
  esc,
  money,
  formatDate,
  formatQty,
  statusBadge,
  toast,
  confirmDialog,
  setPageMeta,
  pdfPanel,
  wirePdfPanel,
  navigate,
  copyText,
} from './shared.js';

export async function render({ view, params }) {
  view.innerHTML = '<div class="loading-block"><span class="spinner"></span> Loading invoice…</div>';
  const inv = await api.get(`/invoices/${params.id}`);
  setPageMeta({ title: `Invoice ${inv.number}`, subtitle: `${inv.customerName} · ${money(inv.balance)} outstanding` });
  const pdfUrl = `/api/invoices/${inv.id}/pdf`;

  const paymentsRows = inv.payments
    .map(
      (p) => `<tr>
        <td><span class="doc-link">${esc(p.reference)}</span></td>
        <td class="nowrap">${formatDate(p.paymentDate, 'short')}</td>
        <td>${esc(p.method)}</td>
        <td class="small muted">${esc(p.details || '—')}</td>
        <td class="num strong">${money(p.amount)}</td>
        <td><div class="row-actions">
          <button class="btn btn-sm btn-ghost" data-edit-payment="${p.id}" title="Edit">${icon('edit', 14)}</button>
          <button class="btn btn-sm btn-ghost" data-delete-payment="${p.id}" title="Delete">${icon('trash', 14)}</button>
        </div></td>
      </tr>`
    )
    .join('');

  view.innerHTML = `
    <div class="detail-head">
      <div class="doc-title">
        <span class="eyebrow">Invoice</span>
        <h2>${esc(inv.number)}</h2>
        <div class="meta">
          ${statusBadge(inv.status)}
          <span>Dated ${formatDate(inv.invoiceDate)}</span>
          ${inv.dueDate ? `<span>· Due ${formatDate(inv.dueDate)}</span>` : ''}
          ${inv.quotationNumber ? `<span>· from <a href="#/quotations/${inv.quotationId}">${esc(inv.quotationNumber)}</a></span>` : ''}
        </div>
      </div>
      <div class="actions">
        <a class="btn" href="#/invoices">${icon('back', 15)} All invoices</a>
        <a class="btn" href="#/invoices/${inv.id}/edit">${icon('edit', 15)} Edit</a>
        <button class="btn" id="print-btn">${icon('print', 15)} Print</button>
        <a class="btn btn-primary" href="${pdfUrl}?download=1" download>${icon('download', 15)} Download PDF</a>
      </div>
    </div>

    <div class="detail-grid">
      <div class="stack">
        ${pdfPanel({ url: pdfUrl, title: `Invoice ${inv.number}`, subtitle: 'A4 document preview' })}

        <div class="card">
          <div class="card-head"><h2>Line items</h2><span class="sub">${inv.items.length} item(s)</span></div>
          <div class="table-wrap"><table class="data">
            <thead><tr><th>#</th><th>Description</th><th class="num">Qty</th><th>Unit</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead>
            <tbody>${inv.items
              .map(
                (it, i) => `<tr><td class="muted">${i + 1}</td><td>${esc(it.description)}</td><td class="num">${formatQty(
                  it.quantity
                )}</td><td>${esc(it.unit)}</td><td class="num">${money(it.unitPrice)}</td><td class="num strong">${money(
                  it.lineTotal
                )}</td></tr>`
              )
              .join('')}</tbody>
            <tfoot>
              <tr><td colspan="5" class="num muted">Subtotal</td><td class="num">${money(inv.subtotal)}</td></tr>
              ${inv.discountAmount ? `<tr><td colspan="5" class="num muted">Discount</td><td class="num">− ${money(inv.discountAmount)}</td></tr>` : ''}
              ${inv.taxAmount ? `<tr><td colspan="5" class="num muted">Tax (${formatQty(inv.taxRate)}%)</td><td class="num">${money(inv.taxAmount)}</td></tr>` : ''}
              <tr><td colspan="5" class="num strong">Invoice total</td><td class="num strong">${money(inv.total)}</td></tr>
              <tr><td colspan="5" class="num muted">Amount paid</td><td class="num">${money(inv.amountPaid)}</td></tr>
              <tr><td colspan="5" class="num strong">Balance due</td><td class="num strong" style="color:var(--accent)">${money(inv.balance)}</td></tr>
            </tfoot>
          </table></div>
        </div>

        <div class="card">
          <div class="card-head">
            <h2>Payment history</h2>
            <span class="sub">${inv.payments.length} payment(s) recorded</span>
            <div class="card-actions">${
              inv.balance > 0
                ? `<button class="btn btn-sm btn-primary" id="add-payment">${icon('plus', 14)} Record payment</button>`
                : `<span class="badge paid">Fully paid</span>`
            }</div>
          </div>
          ${
            inv.payments.length
              ? `<div class="table-wrap"><table class="data">
                  <thead><tr><th>Reference</th><th>Date</th><th>Method</th><th>Details</th><th class="num">Amount</th><th></th></tr></thead>
                  <tbody>${paymentsRows}</tbody>
                </table></div>`
              : `<div class="card-body muted small">No payments recorded yet. Recording a payment updates the amount paid, balance and invoice status.</div>`
          }
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head"><h2>Balance</h2></div>
          <div class="panel-list">
            <div class="panel-row"><div class="label">Invoice total</div><div class="value money">${money(inv.total)}</div></div>
            <div class="panel-row"><div class="label">Amount paid</div><div class="value money" style="color:var(--ok)">${money(inv.amountPaid)}</div></div>
            <div class="panel-row"><div class="label">Remaining balance</div><div class="value money" style="color:var(--accent)">${money(
              inv.balance
            )}</div></div>
            <div class="panel-row"><div class="label">Status</div><div class="value">${statusBadge(inv.status)}</div></div>
            ${
              inv.balance > 0
                ? `<div class="panel-row"><button class="btn btn-primary btn-block" id="add-payment-2">${icon(
                    'wallet',
                    15
                  )} Record payment</button></div>`
                : ''
            }
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Customer</h2></div>
          <div class="panel-list">
            <div class="panel-row"><div class="label">Customer</div><div class="value">${
              inv.customerId ? `<a href="#/customers/${inv.customerId}">${esc(inv.customerName)}</a>` : esc(inv.customerName)
            }</div></div>
            ${inv.companyName ? `<div class="panel-row"><div class="label">Company</div><div class="value">${esc(inv.companyName)}</div></div>` : ''}
            ${inv.contactNumber ? `<div class="panel-row"><div class="label">Contact</div><div class="value">${esc(inv.contactNumber)}</div></div>` : ''}
            ${inv.email ? `<div class="panel-row"><div class="label">Email</div><div class="value">${esc(inv.email)}</div></div>` : ''}
            ${inv.address ? `<div class="panel-row"><div class="label">Address</div><div class="value">${esc(inv.address)}</div></div>` : ''}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Terms &amp; notes</h2></div>
          <div class="panel-list">
            <div class="panel-row"><div class="label">Payment terms</div><div class="value">${esc(inv.paymentTerms || '—')}</div></div>
            <div class="panel-row"><div class="label">Remarks</div><div class="value">${esc(inv.remarks || '—')}</div></div>
            <div class="panel-row"><div class="label">Prepared by</div><div class="value">${esc(inv.preparedBy || '—')}</div></div>
            <div class="panel-row"><div class="label">Invoice number</div><div class="value"><a href="#" id="copy-number">${esc(
              inv.number
            )}</a> ${icon('copy', 12)}</div></div>
          </div>
        </div>
      </div>
    </div>
  `;

  wirePdfPanel(view);
  view.querySelector('#print-btn').addEventListener('click', () => {
    const win = window.open(pdfUrl, '_blank');
    if (!win) toast('Allow pop-ups to print, or download the PDF instead.', 'error', 'Popup blocked');
  });
  view.querySelector('#copy-number').addEventListener('click', (e) => {
    e.preventDefault();
    copyText(inv.number);
  });

  const openPayment = async () => {
    const { openPaymentModal } = await import('./payments.js');
    openPaymentModal({ invoice: inv, onSaved: () => navigate(`/invoices/${inv.id}`) });
  };
  ['#add-payment', '#add-payment-2'].forEach((sel) => {
    const btn = view.querySelector(sel);
    if (btn) btn.addEventListener('click', openPayment);
  });

  view.querySelectorAll('[data-edit-payment]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const payment = inv.payments.find((p) => String(p.id) === btn.dataset.editPayment);
      const { openPaymentModal } = await import('./payments.js');
      openPaymentModal({
        mode: 'edit',
        payment: { ...payment, invoiceId: inv.id },
        onSaved: () => navigate(`/invoices/${inv.id}`),
      });
    })
  );

  view.querySelectorAll('[data-delete-payment]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const payment = inv.payments.find((p) => String(p.id) === btn.dataset.deletePayment);
      const ok = await confirmDialog({
        title: 'Delete this payment?',
        message: `Payment ${payment.reference} (${money(payment.amount)}) will be removed and this invoice's balance recalculated.`,
        confirmLabel: 'Delete payment',
        variant: 'btn-danger',
      });
      if (!ok) return;
      try {
        await api.del(`/payments/${payment.id}`);
        toast('Payment deleted. Balance recalculated.', 'success');
        navigate(`/invoices/${inv.id}`);
      } catch (err) {
        toast(err.message, 'error');
      }
    })
  );
}
