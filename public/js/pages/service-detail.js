import { api } from '../api.js';
import {
  icon,
  esc,
  money,
  formatDate,
  formatQty,
  statusBadge,
  toast,
  setPageMeta,
  pdfPanel,
  wirePdfPanel,
  navigate,
  copyText,
} from './shared.js';

const STATUS_FLOW = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export async function render({ view, params }) {
  view.innerHTML = '<div class="loading-block"><span class="spinner"></span> Loading service report…</div>';
  const report = await api.get(`/service-reports/${params.id}`);
  setPageMeta({ title: `Service report ${report.number}`, subtitle: `${report.customerName} · ${formatDate(report.serviceDate)}` });
  const pdfUrl = `/api/service-reports/${report.id}/pdf`;

  const materials = report.materials || [];
  const photos = report.photos || [];

  view.innerHTML = `
    <div class="detail-head">
      <div class="doc-title">
        <span class="eyebrow">Service report</span>
        <h2>${esc(report.number)}</h2>
        <div class="meta">
          ${statusBadge(report.status)}
          <span>Service date ${formatDate(report.serviceDate)}</span>
          ${report.technician ? `<span>· Technician ${esc(report.technician)}</span>` : ''}
          ${report.startTime || report.endTime ? `<span>· ${esc(report.startTime || '—')} to ${esc(report.endTime || '—')}</span>` : ''}
        </div>
      </div>
      <div class="actions">
        <a class="btn" href="#/service-reports">${icon('back', 15)} All reports</a>
        <a class="btn" href="#/service-reports/${report.id}/edit">${icon('edit', 15)} Edit</a>
        <button class="btn" id="print-btn">${icon('print', 15)} Print</button>
        <a class="btn btn-primary" href="${pdfUrl}?download=1" download>${icon('download', 15)} Download PDF</a>
      </div>
    </div>

    <div class="detail-grid">
      <div class="stack">
        ${pdfPanel({ url: pdfUrl, title: `Service report ${report.number}`, subtitle: 'A4 document preview' })}

        <div class="card">
          <div class="card-head"><h2>Service details</h2></div>
          <div class="card-body">
            <div class="kv">
              <dt>Customer</dt><dd>${report.customerId ? `<a href="#/customers/${report.customerId}">${esc(report.customerName)}</a>` : esc(report.customerName)}</dd>
              ${report.companyName ? `<dt>Company</dt><dd>${esc(report.companyName)}</dd>` : ''}
              ${report.contactNumber ? `<dt>Contact</dt><dd>${esc(report.contactNumber)}</dd>` : ''}
              ${report.email ? `<dt>Email</dt><dd>${esc(report.email)}</dd>` : ''}
              ${report.location ? `<dt>Service location</dt><dd>${esc(report.location)}</dd>` : ''}
              ${report.equipment ? `<dt>Equipment serviced</dt><dd>${esc(report.equipment)}</dd>` : ''}
              ${report.reportedProblem ? `<dt>Reported problem</dt><dd>${esc(report.reportedProblem)}</dd>` : ''}
              ${report.findings ? `<dt>Findings</dt><dd>${esc(report.findings)}</dd>` : ''}
              ${report.workPerformed ? `<dt>Work performed</dt><dd>${esc(report.workPerformed)}</dd>` : ''}
              ${report.recommendations ? `<dt>Recommendations</dt><dd>${esc(report.recommendations)}</dd>` : ''}
              ${report.remarks ? `<dt>Remarks</dt><dd>${esc(report.remarks)}</dd>` : ''}
              ${report.customerAck ? `<dt>Acknowledged by</dt><dd>${esc(report.customerAck)}</dd>` : ''}
              <dt>Prepared by</dt><dd>${esc(report.preparedBy || '—')}</dd>
              <dt>Report number</dt><dd><a href="#" id="copy-number">${esc(report.number)}</a> ${icon('copy', 12)}</dd>
            </div>
          </div>
        </div>

        ${
          materials.length
            ? `<div class="card">
                <div class="card-head"><h2>Materials &amp; parts used</h2></div>
                <div class="table-wrap"><table class="data">
                  <thead><tr><th>Description</th><th class="num">Qty</th><th>Unit</th><th class="num">Unit cost</th><th class="num">Amount</th></tr></thead>
                  <tbody>${materials
                    .map(
                      (m) => `<tr><td>${esc(m.description)}</td><td class="num">${formatQty(m.quantity)}</td><td>${esc(
                        m.unit || ''
                      )}</td><td class="num">${money(m.unitCost)}</td><td class="num strong">${money(
                        m.amount ?? (m.quantity || 0) * (m.unitCost || 0)
                      )}</td></tr>`
                    )
                    .join('')}</tbody>
                </table></div>
              </div>`
            : ''
        }

        ${
          photos.length
            ? `<div class="card">
                <div class="card-head"><h2>Photos</h2><span class="sub">${photos.length} attached</span></div>
                <div class="card-body"><div class="photo-gallery">${photos
                  .map(
                    (p, i) => `<a href="${p}" target="_blank" rel="noopener" title="Open photo ${i + 1}"><img src="${p}" alt="Photo ${
                      i + 1
                    }" /></a>`
                  )
                  .join('')}</div></div>
              </div>`
            : ''
        }
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head"><h2>Job status</h2></div>
          <div class="card-body">
            <div class="btn-row">
              ${STATUS_FLOW.map(
                (s) =>
                  `<button class="btn btn-sm ${s.value === report.status ? 'btn-primary' : ''}" data-status="${s.value}" ${
                    s.value === report.status ? 'disabled' : ''
                  }>${s.label}</button>`
              ).join('')}
            </div>
            <p class="small muted mt-8">Status changes are saved immediately.</p>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Costs</h2></div>
          <div class="panel-list">
            <div class="panel-row"><div class="label">Materials</div><div class="value money">${money(report.materialsCost)}</div></div>
            <div class="panel-row"><div class="label">Labor</div><div class="value money">${money(report.laborCost)}</div></div>
            <div class="panel-row"><div class="label">Total</div><div class="value money" style="color:var(--accent)">${money(report.totalCost)}</div></div>
            <div class="panel-row">
              <div class="label">Recorded</div>
              <div class="value small">${formatDate(report.createdAt?.slice(0, 10), 'short')}</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Signatures</h2></div>
          <div class="panel-list">
            <div class="panel-row"><div class="label">Technician</div><div class="value">${esc(report.technician || '—')}</div></div>
            <div class="panel-row"><div class="label">Customer acknowledgment</div><div class="value">${esc(
              report.customerAck || report.customerName
            )}</div></div>
            <div class="panel-row"><div class="label">Prepared by</div><div class="value">${esc(report.preparedBy || '—')}</div></div>
          </div>
        </div>
      </div>
    </div>
    <style>
      .photo-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
      .photo-gallery img { width: 100%; height: 110px; object-fit: cover; border-radius: 6px; border: 1px solid var(--line); }
    </style>
  `;

  wirePdfPanel(view);
  view.querySelector('#print-btn').addEventListener('click', () => {
    const win = window.open(pdfUrl, '_blank');
    if (!win) toast('Allow pop-ups to print, or download the PDF instead.', 'error', 'Popup blocked');
  });
  view.querySelector('#copy-number').addEventListener('click', (e) => {
    e.preventDefault();
    copyText(report.number);
  });

  view.querySelectorAll('[data-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api.put(`/service-reports/${report.id}`, {
          ...report,
          materials,
          photos,
          status: btn.dataset.status,
        });
        toast(`Job status set to ${btn.dataset.status.replace('_', ' ')}.`, 'success', 'Status updated');
        navigate(`/service-reports/${report.id}`);
      } catch (err) {
        toast(err.message, 'error', 'Status not changed');
      }
    });
  });
}
