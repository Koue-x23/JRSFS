// Shared helpers for the Johnrois business management server.

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function toMoney(value, field = 'amount') {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new HttpError(400, `${field} must be a valid number.`);
  const r = round2(n);
  if (r < 0) throw new HttpError(400, `${field} cannot be negative.`);
  if (r > 999999999) throw new HttpError(400, `${field} is too large.`);
  return r;
}

export function toQty(value, field = 'quantity') {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new HttpError(400, `${field} must be a valid number.`);
  const r = Math.round(n * 1000) / 1000;
  if (r <= 0) throw new HttpError(400, `${field} must be greater than zero.`);
  if (r > 100000000) throw new HttpError(400, `${field} is too large.`);
  return r;
}

export function toRate(value, field = 'rate') {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new HttpError(400, `${field} must be a valid number.`);
  const r = Math.round(n * 1000) / 1000;
  if (r < 0 || r > 100) throw new HttpError(400, `${field} must be between 0 and 100.`);
  return r;
}

export const str = (value, max = 500) => {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, max);
};

export const multiline = (value, max = 5000) => {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\r\n/g, '\n').slice(0, max);
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDate(value) {
  if (!DATE_RE.test(String(value || ''))) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function dateOr(value, fallback = '') {
  const v = str(value, 10);
  if (!v) return fallback;
  if (!isDate(v)) throw new HttpError(400, `"${v}" is not a valid date. Use YYYY-MM-DD.`);
  return v;
}

export function requiredDate(value, field) {
  const v = dateOr(value);
  if (!v) throw new HttpError(400, `${field} is required.`);
  return v;
}

export function todayISO() {
  // Business local time (Philippines, UTC+8) so documents use the shop's date.
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}

export function nowISO() {
  return new Date().toISOString();
}

export function addDaysISO(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

export function requireFields(obj, fields) {
  for (const [key, label] of Object.entries(fields)) {
    if (!str(obj?.[key])) throw new HttpError(400, `${label} is required.`);
  }
}

export function parseId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Invalid record ID.');
  return n;
}

export function parseJson(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export function sanitizeFileName(name) {
  return String(name || 'document').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
}
