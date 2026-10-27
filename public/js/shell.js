// Shared application state (business profile + lookups) and shell helpers.
// Pages import from here; app.js owns routing and navigation rendering.
import { api } from './api.js';
import { icon, esc } from './ui.js';

export const state = {
  settings: null,
  customers: [],
  products: [],
  today: '',
  paymentMethods: [],
};

let loadedAt = 0;

export const getState = () => state;

export async function refreshLookups() {
  const data = await api.get('/bootstrap');
  state.settings = data.settings;
  state.customers = data.customers;
  state.products = data.products;
  state.today = data.today;
  state.paymentMethods = data.settings.paymentMethods || [];
  loadedAt = Date.now();
  return state;
}

export async function ensureLookups({ force = false } = {}) {
  if (force || !loadedAt || Date.now() - loadedAt > 20_000) await refreshLookups();
  return state;
}

export function navigate(path) {
  const target = `#${String(path).startsWith('/') ? path : `/${path}`}`;
  if (location.hash === target) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = target;
}

export function setPageMeta({ title, subtitle = '', action = null, extraActions = '' }) {
  document.getElementById('page-title').textContent = title;
  document.getElementById('page-subtitle').textContent = subtitle;
  const actions = document.getElementById('topbar-actions');
  actions.innerHTML = `${
    action
      ? `<a class="btn btn-primary" href="${esc(action.href)}">${icon(action.icon || 'plus', 15)}<span>${esc(action.label)}</span></a>`
      : ''
  }${extraActions}`;
  document.title = `${title} · ${state.settings?.businessName || 'Johnrois Stainless Steel Fabrication Shop'}`;
}

/** Today in the shop's timezone (the server reports it during bootstrap). */
export const today = () => state.today || new Date().toISOString().slice(0, 10);
