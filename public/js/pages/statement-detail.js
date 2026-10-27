import { api } from '../api.js';
import {
  icon,
  esc,
  money,
  formatDate,
  toast,
  setPageMeta,
  pdfPanel,
  wirePdfPanel,
  copyText,
} from './shared.js';

export async function render({ view, params }) {
  view.innerHTML = '<div class="loading-block"><span class="spinner"></span> Loading billing statement…</div>';
  const st = await api.get(`/billing-statements/${params.id}`);
  setPageMeta({
    title: `Billing statement ${st.number}`,
    subtitle: `${st.customerName} · ${formatDate(st.periodFrom, 'short')} – ${formatDate(st.periodTo, 'short')}`,
  });
  const pdfUrl = `/api/billing-statements/${st.id}/pdf`;

  view.innerHTML = `
    <div class="detail-head">
      <div class="doc-title">
        <span class="eyebrow">Billing statement</span>
        <h2>${esc(st.number)}</h2>
        <div class="meta">
          <span class="badge statement">Statement of account</span>
          <span>Dated ${formatDate(st.statementDate)}</span>
          <span>· Period ${formatDate(st.periodFrom, 'short')} – ${formatDate(st.periodTo, 'short')}</span>
        </div>
      </div>
      <div class="actions">
        <a class="btn" href="#/statements">${icon('back', 15)} All statements</a>
        <a class="btn" href="#/statements/new">${icon('plus', 15)} New statement</a>
        <button class="btn" id="print-btn">${icon('print', 15)} Print</button>
        <a class="btn btn-primary" href="${pdfUrl}?download=1" download>${icon('download', 15)} Download PDF</a>
      </div>
    </div>

    <div class="detail-grid">
      <div class="stack">
        ${pdfPanel({ url: pdfUrl, title: `Billing statement ${st.number}`, subtitle: 'A4 document preview' })}

        <div class="card">
          <div class="card-head"><h2>Statement transactions</h2><span class="sub">${st.items.length} row(s)</span></div>
          <div class="table-wrap"><table class="data">
            <thead><tr><th>Date</th><th>Reference</th><th>Description</th><th class="num">Charges</th><th class="num">Payments</th><th class="num">Running balance</th></tr></thead>
            <tbody>
              <tr><td>—</td><td>—</td><td>Previous balance</td><td class="num">—</td><td class="num">—</td><td class="num">${money(
                st.previousBalance
              )}</td></tr>
              ${st.items
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
          </table></div>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head"><h2>Summary</h2></div>
          <div class="panel-list">
            <div class="panel-row"><div class="label">Previous balance</div><div class="value money">${money(st.previousBalance)}</div></div>
            <div class="panel-row"><div class="label">Total charges</div><div class="value money">${money(st.totalCharges)}</div></div>
            <div class="panel-row"><div class="label">Total payments</div><div class="value money" style="color:var(--ok)">− ${money(
              st.totalPayments
            )}</div></div>
            <div class="panel-row"><div class="label">Outstanding balance</div><div class="value money" style="color:var(--accent)">${money(
              st.outstandingBalance
            )}</div></div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Customer</h2></div>
          <div class="panel-list">
            <div class="panel-row"><div class="label">Customer</div><div class="value"><a href="#/customers/${st.customerId}">${esc(
              st.customerName
            )}</a></div></div>
            ${st.companyName ? `<div class="panel-row"><div class="label">Company</div><div class="value">${esc(st.companyName)}</div></div>` : ''}
            ${st.contactNumber ? `<div class="panel-row"><div class="label">Contact</div><div class="value">${esc(st.contactNumber)}</div></div>` : ''}
            ${st.email ? `<div class="panel-row"><div class="label">Email</div><div class="value">${esc(st.email)}</div></div>` : ''}
            ${st.address ? `<div class="panel-row"><div class="label">Address</div><div class="value">${esc(st.address)}</div></div>` : ''}
            <div class="panel-row"><div class="label">Payment terms</div><div class="value">${esc(st.paymentTerms || '—')}</div></div>
            <div class="panel-row"><div class="label">Remarks</div><div class="value">${esc(st.remarks || '—')}</div></div>
            <div class="panel-row"><div class="label">Prepared by</div><div class="value">${esc(st.preparedBy || '—')}</div></div>
            <div class="panel-row"><div class="label">Statement number</div><div class="value"><a href="#" id="copy-number">${esc(
              st.number
            )}</a> ${icon('copy', 12)}</div></div>
          </div>
        </div>

        <div class="callout info">
          ${icon('info', 16)}
          <div>Statements are snapshots taken when saved. If invoices or payments change later, create a new statement for the period.</div>
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
    copyText(st.number);
  });
}
