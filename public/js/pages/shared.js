// Common imports + reusable page building blocks for page modules.
export * from '../ui.js';
export * from '../shell.js';
import { icon, esc } from '../ui.js';

export const TOOLBAR = ({ search = '', placeholder = 'Search…', filters = '', actions = '' }) => `
  <div class="toolbar">
    <div class="search">
      ${icon('search', 15)}
      <input class="input" type="search" id="search-input" placeholder="${esc(placeholder)}" value="${esc(search)}" autocomplete="off" />
    </div>
    ${filters}
    <div class="spacer"></div>
    ${actions}
  </div>`;

export const selectFilter = (id, options, value, label = '') => `
  ${label ? `<span class="filter-label">${esc(label)}</span>` : ''}
  <select class="select" id="${esc(id)}">${options
    .map(
      (opt) =>
        `<option value="${esc(opt.value)}" ${String(opt.value) === String(value) ? 'selected' : ''}>${esc(opt.label)}</option>`
    )
    .join('')}</select>`;

export const dateRangeFilter = (from, to) => `
  <span class="filter-label">From</span>
  <input class="input" type="date" id="filter-from" value="${esc(from)}" style="width:auto" />
  <span class="filter-label">To</span>
  <input class="input" type="date" id="filter-to" value="${esc(to)}" style="width:auto" />`;

export const docTableEmpty = ({ title, message, actionHtml = '', iconName = 'quotation' }) =>
  `<div class="table-empty">${icon(iconName, 20)}<div class="mt-8 strong">${esc(title)}</div><div class="small">${esc(
    message
  )}</div>${actionHtml ? `<div class="btn-row" style="justify-content:center;margin-top:10px">${actionHtml}</div>` : ''}</div>`;

export function wireRowLinks(root) {
  root.querySelectorAll('[data-href]').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('a,button,input,select')) return;
      location.hash = row.dataset.href;
    });
  });
}

export const STATUS_STYLES = {
  draft: 'draft',
  sent: 'sent',
  approved: 'approved',
  rejected: 'rejected',
  expired: 'expired',
  unpaid: 'unpaid',
  partial: 'partial',
  paid: 'paid',
  overdue: 'overdue',
  scheduled: 'scheduled',
  in_progress: 'in_progress',
  completed: 'completed',
  cancelled: 'cancelled',
};

/** PDF preview card used by record detail pages. */
export function pdfPanel({ url, title, subtitle = '', heading = 'Document preview' }) {
  return `<div class="card doc-card">
    <div class="doc-toolbar">
      <strong style="font-size:12.5px">${esc(heading)}</strong>
      <a class="btn btn-sm btn-primary" href="${esc(url)}?download=1" download>${icon('download', 14)} Download PDF</a>
      <button class="btn btn-sm" data-print-pdf="${esc(url)}">${icon('print', 14)} Print</button>
      <a class="btn btn-sm" href="${esc(url)}" target="_blank" rel="noopener">${icon('external', 14)} Open</a>
      <span class="doc-meta">${esc(subtitle)}</span>
    </div>
    <iframe class="doc-frame" title="${esc(title)}" src="${esc(url)}#toolbar=1&view=FitH"></iframe>
  </div>`;
}

/** Wire print buttons created by pdfPanel(). */
export function wirePdfPanel(root) {
  root.querySelectorAll('[data-print-pdf]').forEach((btn) => {
    btn.addEventListener('click', () => printPdf(btn.dataset.printPdf));
  });
}

export const STATUS_OPTIONS = {
  quotation: [
    { value: '', label: 'All statuses' },
    { value: 'pending', label: 'Pending (draft + sent)' },
    { value: 'draft', label: 'Draft' },
    { value: 'sent', label: 'Sent' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'expired', label: 'Expired' },
  ],
  invoice: [
    { value: '', label: 'All statuses' },
    { value: 'unpaid', label: 'Unpaid' },
    { value: 'partial', label: 'Partially paid' },
    { value: 'paid', label: 'Paid' },
    { value: 'overdue', label: 'Overdue' },
  ],
  service: [
    { value: '', label: 'All statuses' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
  ],
};
