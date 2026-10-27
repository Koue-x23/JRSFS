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
  ensureLookups,
  copyText,
} from './shared.js';

export async function render({ view, params }) {
  await ensureLookups();
  view.innerHTML = '<div class="loading-block"><span class="spinner"></span> Loading quotation…</div>';
  const q = await api.get(`/quotations/${params.id}`);
  setPageMeta({ title: `Quotation ${q.number}`, subtitle: `${q.customerName} · ${money(q.grandTotal)}` });

  const locked = Boolean(q.invoiceId);
  const pdfUrl = `/api/quotations/${q.id}/pdf`;

  const statusActions =
    q.status === 'approved'
      ? ''
      : `<button class="btn btn-sm" data-status="approved">${icon('check', 14)} Mark approved</button>`;

  view.innerHTML = `
    <div class="detail-head">
      <div class="doc-title">
        <span class="eyebrow">Quotation</span>
        <h2>${esc(q.number)}</h2>
        <div class="meta">
          ${statusBadge(q.effectiveStatus)}
          <span>Issued ${formatDate(q.issueDate)}</span>
          ${q.validUntil ? `<span>· Valid until ${formatDate(q.validUntil)}</span>` : ''}
          ${locked ? `<span class="badge plain draft">Invoiced</span>` : ''}
        </div>
      </div>
      <div class="actions">
        <a class="btn" href="#/quotations">${icon('back', 15)} All quotations</a>
        ${locked ? '' : `<a class="btn" href="#/quotations/${q.id}/edit">${icon('edit', 15)} Edit</a>`}
        <button class="btn" id="duplicate-btn">${icon('copy', 15)} Duplicate</button>
        <button class="btn" id="print-btn">${icon('print', 15)} Print</button>
        <a class="btn btn-primary" href="${pdfUrl}?download=1" download>${icon('download', 15)} Download PDF</a>
      </div>
    </div>

    <div class="detail-grid">
      <div class="stack">
        ${pdfPanel({ url: pdfUrl, title: `Quotation ${q.number}`, subtitle: 'A4 document preview' })}

        <div class="card">
          <div class="card-head"><h2>Line items</h2><span class="sub">${q.items.length} item(s)</span></div>
          <div class="table-wrap"><table class="data">
            <thead><tr><th>#</th><th>Description</th><th class="num">Qty</th><th>Unit</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead>
            <tbody>${q.items
              .map(
                (it, i) => `<tr>
                  <td class="muted">${i + 1}</td>
                  <td>${esc(it.description)}</td>
                  <td class="num">${formatQty(it.quantity)}</td>
                  <td>${esc(it.unit)}</td>
                  <td class="num">${money(it.unitPrice)}</td>
                  <td class="num strong">${money(it.lineTotal)}</td>
                </tr>`
              )
              .join('')}</tbody>
            <tfoot>
              <tr><td colspan="5" class="num muted">Subtotal</td><td class="num">${money(q.subtotal)}</td></tr>
              ${
                q.discountAmount
                  ? `<tr><td colspan="5" class="num muted">Discount${q.discountType === 'percent' ? ` (${formatQty(q.discountValue)}%)` : ''}</td><td class="num">− ${money(q.discountAmount)}</td></tr>`
                  : ''
              }
              ${
                q.taxAmount
                  ? `<tr><td colspan="5" class="num muted">Tax (${formatQty(q.taxRate)}%)</td><td class="num">${money(q.taxAmount)}</td></tr>`
                  : ''
              }
              <tr><td colspan="5" class="num strong">Grand total</td><td class="num strong" style="color:var(--accent)">${money(q.grandTotal)}</td></tr>
            </tfoot>
          </table></div>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head"><h2>Quotation status</h2></div>
          <div class="card-body">
            <div class="btn-row">
              ${statusActions}
              ${q.status !== 'sent' && q.status !== 'approved' ? `<button class="btn btn-sm" data-status="sent">Mark as sent</button>` : ''}
              ${q.status !== 'rejected' ? `<button class="btn btn-sm btn-danger" data-status="rejected">Mark rejected</button>` : ''}
              ${q.status !== 'draft' ? `<button class="btn btn-sm btn-ghost" data-status="draft">Back to draft</button>` : ''}
            </div>
            <div class="divider"></div>
            ${
              locked
                ? `<div class="callout ok">${icon('check', 16)}<div>Converted to <a href="#/invoices/${q.invoiceId}">${esc(
                    q.linkedInvoice?.number || 'invoice'
                  )}</a>. The quotation is locked to keep records consistent.</div></div>`
                : q.status === 'approved'
                ? `<button class="btn btn-primary btn-block" id="convert-btn">${icon('arrowRight', 15)} Convert to invoice</button>
                   <p class="small muted mt-8">Customer details and line items carry over to the new invoice.</p>`
                : `<div class="callout warn">${icon('info', 16)}<div>Approve this quotation to convert it into an invoice.</div></div>`
            }
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Customer</h2></div>
          <div class="panel-list">
            <div class="panel-row">
              <div class="label">Customer</div>
              <div class="value">${
                q.customerId ? `<a href="#/customers/${q.customerId}">${esc(q.customerName)}</a>` : esc(q.customerName)
              }</div>
            </div>
            ${q.companyName ? `<div class="panel-row"><div class="label">Company</div><div class="value">${esc(q.companyName)}</div></div>` : ''}
            ${q.contactNumber ? `<div class="panel-row"><div class="label">Contact</div><div class="value">${esc(q.contactNumber)}</div></div>` : ''}
            ${q.email ? `<div class="panel-row"><div class="label">Email</div><div class="value">${esc(q.email)}</div></div>` : ''}
            ${q.address ? `<div class="panel-row"><div class="label">Address</div><div class="value">${esc(q.address)}</div></div>` : ''}
            ${q.projectName ? `<div class="panel-row"><div class="label">Project</div><div class="value">${esc(q.projectName)}</div></div>` : ''}
            ${q.projectLocation ? `<div class="panel-row"><div class="label">Project location</div><div class="value">${esc(q.projectLocation)}</div></div>` : ''}
            ${q.paymentTerms ? `<div class="panel-row"><div class="label">Payment terms</div><div class="value">${esc(q.paymentTerms)}</div></div>` : ''}
            ${q.deliverySchedule ? `<div class="panel-row"><div class="label">Delivery</div><div class="value">${esc(q.deliverySchedule)}</div></div>` : ''}
            ${q.remarks ? `<div class="panel-row"><div class="label">Remarks</div><div class="value">${esc(q.remarks)}</div></div>` : ''}
            <div class="panel-row">
              <div class="label">Prepared by</div>
              <div class="value">${esc(q.preparedBy || '—')}</div>
            </div>
            <div class="panel-row">
              <div class="label">Grand total</div>
              <div class="value money">${money(q.grandTotal)}</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Record</h2></div>
          <div class="panel-list">
            <div class="panel-row"><div class="label">Created</div><div class="value small">${formatDate(q.createdAt?.slice(0, 10), 'short')} · ${new Date(
    q.createdAt
  ).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</div></div>
            <div class="panel-row"><div class="label">Last updated</div><div class="value small">${formatDate(q.updatedAt?.slice(0, 10), 'short')}</div></div>
            <div class="panel-row"><div class="label">Document number</div><div class="value"><a href="#" id="copy-number">${esc(q.number)}</a> ${icon('copy', 12)}</div></div>
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
    copyText(q.number);
  });

  view.querySelectorAll('[data-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const next = btn.dataset.status;
      if (next === 'rejected' && !(await confirmDialog({ title: 'Reject quotation?', message: 'The quotation will be marked as rejected. You can change the status later.', confirmLabel: 'Mark rejected', variant: 'btn-danger' }))) return;
      try {
        await api.post(`/quotations/${q.id}/status`, { status: next });
        toast(`Status updated to ${next}.`, 'success', 'Quotation updated');
        navigate(`/quotations/${q.id}`);
      } catch (err) {
        toast(err.message, 'error', 'Status not changed');
      }
    });
  });

  const convertBtn = view.querySelector('#convert-btn');
  if (convertBtn) {
    convertBtn.addEventListener('click', async () => {
      if (
        !(await confirmDialog({
          title: 'Convert to invoice',
          message: `Create an invoice from ${q.number}? Customer information and all line items will be carried over, and the quotation will be locked.`,
          confirmLabel: 'Create invoice',
        }))
      )
        return;
      convertBtn.disabled = true;
      try {
        const result = await api.post(`/quotations/${q.id}/convert`);
        toast(`Invoice ${result.invoice.number} created from ${q.number}.`, 'success', 'Converted');
        navigate(`/invoices/${result.invoice.id}`);
      } catch (err) {
        toast(err.message, 'error', 'Could not convert');
        convertBtn.disabled = false;
      }
    });
  }

  view.querySelector('#duplicate-btn').addEventListener('click', async () => {
    try {
      const copy = await api.post(`/quotations/${q.id}/duplicate`);
      toast(`Created ${copy.number} as a new draft.`, 'success', 'Quotation duplicated');
      navigate(`/quotations/${copy.id}/edit`);
    } catch (err) {
      toast(err.message, 'error', 'Could not duplicate');
    }
  });
}
