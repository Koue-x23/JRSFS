// Shared UI primitives: icons, escaping, modals, toasts, form helpers.
import { money, moneyPlain, formatDate, formatQty, statusLabel } from './calc.js';

export { money, moneyPlain, formatDate, formatQty, statusLabel };

export const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Multi-line text -> escaped HTML with line breaks. */
export const nl2br = (value) => esc(value).replace(/\n/g, '<br>');

const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="8" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="11" width="7" height="10" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  quotation: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
  invoice: '<path d="M4 3h16v18l-4-2-4 2-4-2-4 2z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  service: '<path d="M14.7 6.3a4 4 0 0 1 5 5L11 20H4v-7z"/><path d="M13 8l3 3"/>',
  statement: '<path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h4"/>',
  customers: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  products: '<path d="M21 8V6l-9-4-9 4v2l9 4 9-4z"/><path d="M3 8v10l9 4 9-4V8"/><path d="M12 12v10"/>',
  payments: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/>',
  reports: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 4-6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.7 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.7a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 0 1 4 0v.09A1.7 1.7 0 0 0 15 4.7a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.3 9c.2.62.76 1.03 1.41 1.03H21a2 2 0 0 1 0 4h-.09c-.65 0-1.21.4-1.51 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  arrowRight: '<path d="M5 12h14M13 5l7 7-7 7"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  close: '<path d="M18 6L6 18M6 6l12 12"/>',
  warn: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>',
  menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
  archive: '<rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/>',
  wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  alertCircle: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1"/>',
  chart: '<path d="M12 20V10M18 20V4M6 20v-4"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
};

export function icon(name, size = 17, strokeWidth = 1.75) {
  const path = ICONS[name] || ICONS.info;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

export function el(html) {
  const template = document.createElement('template');
  template.innerHTML = String(html).trim();
  return template.content.firstElementChild;
}

export const debounce = (fn, wait = 220) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
};

export const initials = (name) =>
  String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

export function statusBadge(status, labelOverride) {
  if (!status) return '<span class="badge draft plain">—</span>';
  const label = labelOverride || statusLabel(status);
  return `<span class="badge ${esc(status)}">${esc(label)}</span>`;
}

export function emptyState({ title, message, actionHtml = '', iconName = 'quotation' }) {
  return `<div class="empty">
    <div class="empty-icon">${icon(iconName, 22)}</div>
    <h3>${esc(title)}</h3>
    <p>${esc(message)}</p>
    ${actionHtml ? `<div class="btn-row mt-8">${actionHtml}</div>` : ''}
  </div>`;
}

export function loadingBlock(message = 'Loading…') {
  return `<div class="loading-block"><span class="spinner"></span> ${esc(message)}</div>`;
}

export function errorBlock(error) {
  return `<div class="card"><div class="empty">
    <div class="empty-icon">${icon('alertCircle', 22)}</div>
    <h3>Could not load this page</h3>
    <p>${esc(error?.message || 'Unexpected error.')}</p>
    <div class="btn-row mt-8"><button class="btn" data-reload>${icon('refresh', 15)} Retry</button></div>
  </div></div>`;
}

// Toasts ---------------------------------------------------------------------
export function toast(message, type = 'success', title = '') {
  const root = document.getElementById('toast-root');
  const heading = title || (type === 'success' ? 'Saved' : type === 'error' ? 'Something went wrong' : 'Notice');
  const node = el(`<div class="toast ${esc(type)}" role="${type === 'error' ? 'alert' : 'status'}">
    <div class="toast-body"><strong>${esc(heading)}</strong><span>${esc(message)}</span></div>
    <button class="icon-btn" aria-label="Dismiss">${icon('close', 14)}</button>
  </div>`);
  const remove = () => node.remove();
  node.querySelector('button').addEventListener('click', remove);
  root.appendChild(node);
  setTimeout(remove, type === 'error' ? 9000 : 4200);
}

// Modal ----------------------------------------------------------------------
export function openModal({ title, body, size = '', actions = [], onClose = null, closeOnBackdrop = true }) {
  const root = document.getElementById('modal-root');
  const backdrop = el(`<div class="modal-backdrop">
    <div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">${icon('close', 16)}</button></div>
      <div class="modal-body"></div>
      <div class="modal-foot"></div>
    </div>
  </div>`);
  const bodyEl = backdrop.querySelector('.modal-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body instanceof Node) bodyEl.appendChild(body);

  const foot = backdrop.querySelector('.modal-foot');
  const actionsList = Array.isArray(actions) ? actions : [];
  actionsList.forEach((action) => {
    const btn = el(`<button class="btn ${action.variant || ''}" ${action.id ? `id="${esc(action.id)}"` : ''}>${
      action.icon ? icon(action.icon, 15) : ''
    }<span>${esc(action.label)}</span></button>`);
    if (action.onClick) btn.addEventListener('click', () => action.onClick({ close, modal: backdrop, body: bodyEl }));
    btn.disabled = Boolean(action.disabled);
    foot.appendChild(btn);
  });
  if (!actionsList.length) foot.remove();

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
    if (onClose) onClose();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  backdrop.querySelector('[data-close]').addEventListener('click', close);
  if (closeOnBackdrop) {
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) close();
    });
  }
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  root.appendChild(backdrop);
  setTimeout(() => {
    const focusable = backdrop.querySelector('input:not([type="hidden"]), select, textarea, button.btn-primary');
    if (focusable) focusable.focus({ preventScroll: true });
  }, 30);
  return { close, modal: backdrop, body: bodyEl };
}

export function confirmDialog({ title, message, confirmLabel = 'Confirm', variant = 'btn-primary', details = '' }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const modal = openModal({
      title,
      body: `<p style="font-size:13.5px">${esc(message)}</p>${details ? `<div class="mt-12">${details}</div>` : ''}`,
      actions: [
        { label: 'Cancel', onClick: ({ close }) => { finish(false); close(); } },
        { label: confirmLabel, variant, onClick: ({ close }) => { finish(true); close(); } },
      ],
      onClose: () => finish(false),
    });
    return modal;
  });
}

// Document preview -----------------------------------------------------------
export function openDocumentPreview({ title, url, subtitle = '' }) {
  const modal = openModal({
    title,
    size: 'xwide',
    closeOnBackdrop: false,
    body: `<div class="doc-toolbar">
        <a class="btn btn-sm btn-primary" href="${esc(url)}${url.includes('?') ? '&' : '?'}download=1" download>${icon(
      'download',
      14
    )} Download PDF</a>
        <button class="btn btn-sm" id="doc-print">${icon('print', 14)} Print</button>
        <a class="btn btn-sm" href="${esc(url)}" target="_blank" rel="noopener">${icon('external', 14)} Open in new tab</a>
        <span class="doc-meta">${esc(subtitle)}</span>
      </div>
      <iframe class="doc-frame" title="${esc(title)}" src="${esc(url)}"></iframe>`,
    actions: [{ label: 'Close', variant: '', onClick: ({ close }) => close() }],
  });
  modal.modal.querySelector('#doc-print').addEventListener('click', () => printPdf(url));
  return modal;
}

export function printPdf(url) {
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) {
    toast('Your browser blocked the print window. Allow pop-ups, or use Download PDF and print from your PDF viewer.', 'error', 'Popup blocked');
    return;
  }
  toast('The document opened in a new tab. Use the PDF viewer’s print button (or Ctrl/Cmd+P) to print on A4.', 'info', 'Ready to print');
}

// Form helpers ---------------------------------------------------------------
export function field({ label, name, value = '', type = 'text', required = false, placeholder = '', hint = '', span = 1, attrs = '', options = null }) {
  const req = required ? '<span class="req">*</span>' : '';
  const cls = span === 2 ? 'span-2' : span === 3 ? 'span-3' : '';
  let control;
  if (type === 'textarea') {
    control = `<textarea class="textarea" id="f-${esc(name)}" name="${esc(name)}" ${attrs} placeholder="${esc(placeholder)}">${esc(value)}</textarea>`;
  } else if (type === 'select') {
    control = `<select class="select" id="f-${esc(name)}" name="${esc(name)}" ${attrs}>${options || ''}</select>`;
  } else {
    control = `<input class="input" id="f-${esc(name)}" name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${attrs} placeholder="${esc(placeholder)}">`;
  }
  return `<div class="field ${cls}" data-field="${esc(name)}">
    <label for="f-${esc(name)}">${esc(label)} ${req}</label>
    ${control}
    ${hint ? `<div class="hint">${esc(hint)}</div>` : ''}
  </div>`;
}

export function readForm(root) {
  const data = {};
  root.querySelectorAll('[name]').forEach((input) => {
    if (input.type === 'checkbox') data[input.name] = input.checked;
    else data[input.name] = input.value;
  });
  return data;
}

export function markInvalid(root, fieldName, message) {
  const wrapper = root.querySelector(`[data-field="${CSS.escape(fieldName)}"]`);
  if (!wrapper) return;
  wrapper.classList.add('invalid');
  let err = wrapper.querySelector('.error-text');
  if (!err) {
    err = document.createElement('div');
    err.className = 'error-text';
    wrapper.appendChild(err);
  }
  err.textContent = message;
  const focusable = wrapper.querySelector('input, select, textarea');
  if (focusable) focusable.focus({ preventScroll: false });
}

export function clearInvalid(root) {
  root.querySelectorAll('.field.invalid').forEach((f) => {
    f.classList.remove('invalid');
    const err = f.querySelector('.error-text');
    if (err) err.remove();
  });
}

export function setBusy(button, busy, label = 'Saving…') {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner" style="width:14px;height:14px"></span> ${esc(label)}`;
  } else {
    button.disabled = false;
    if (button.dataset.label) button.innerHTML = button.dataset.label;
  }
}

export const customerOptions = (customers, selectedId = '') =>
  ['<option value="">— Select a saved customer —</option>']
    .concat(
      customers.map(
        (c) =>
          `<option value="${c.id}" data-name="${esc(c.name)}" data-company="${esc(c.companyName)}" data-phone="${esc(
            c.phone
          )}" data-email="${esc(c.email)}" data-address="${esc(c.billingAddress)}" data-locations="${esc(
            c.projectLocations
          )}" ${String(selectedId) === String(c.id) ? 'selected' : ''}>${esc(c.name)}${c.companyName ? ` · ${esc(c.companyName)}` : ''}</option>`
      )
    )
    .join('');

export const productOptions = (products) =>
  ['<option value="">— Custom line —</option>']
    .concat(
      products.map(
        (p) =>
          `<option value="${p.id}" data-name="${esc(p.name)}" data-description="${esc(p.description)}" data-unit="${esc(
            p.unit
          )}" data-price="${p.defaultPrice}">${esc(p.name)}${p.category ? ` · ${esc(p.category)}` : ''}</option>`
      )
    )
    .join('');

export const methodOptions = (methods, selected = '') =>
  methods
    .map((m) => `<option value="${esc(m)}" ${m === selected ? 'selected' : ''}>${esc(m)}</option>`)
    .join('');

export function debounceInput(input, handler) {
  input.addEventListener('input', debounce(() => handler(input.value.trim()), 240));
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`Copied ${text}`, 'success', 'Copied');
  } catch {
    toast('Copying is not available in this browser.', 'error');
  }
}

