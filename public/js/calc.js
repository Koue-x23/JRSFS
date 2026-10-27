// Shared calculation + formatting rules. Used by the server (billing math, validation)
// and by the browser (live form totals) so both always agree.

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function lineTotal(quantity, unitPrice) {
  const q = Number(quantity) || 0;
  const p = Number(unitPrice) || 0;
  return round2(q * p);
}

/**
 * Document totals: subtotal -> discount (amount or %) -> tax on the discounted
 * amount -> grand total. Returns rounded peso values.
 */
export function computeTotals({ items = [], discountType = 'amount', discountValue = 0, taxRate = 0 }) {
  const lines = items.map((it, index) => ({
    ...it,
    position: index,
    lineTotal: lineTotal(it.quantity, it.unitPrice),
  }));
  const subtotal = round2(lines.reduce((sum, it) => sum + it.lineTotal, 0));
  const rawDiscount = Number(discountValue) || 0;
  let discountAmount = discountType === 'percent' ? (subtotal * rawDiscount) / 100 : rawDiscount;
  discountAmount = round2(Math.min(Math.max(discountAmount, 0), subtotal));
  const taxable = round2(subtotal - discountAmount);
  const rate = Math.max(0, Number(taxRate) || 0);
  const taxAmount = round2((taxable * rate) / 100);
  const grandTotal = round2(taxable + taxAmount);
  return { lines, subtotal, discountAmount, taxAmount, grandTotal };
}

export function todayISO() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export function invoiceStatus({ total, amountPaid, dueDate }, today = todayISO()) {
  const t = round2(total);
  const paid = round2(amountPaid);
  if (t <= 0) return paid > 0 ? 'paid' : 'unpaid';
  if (paid >= t - 0.005) return 'paid';
  if (dueDate && dueDate < today) return 'overdue';
  if (paid > 0) return 'partial';
  return 'unpaid';
}

export function quotationStatus(q, today = todayISO()) {
  const status = String(q.status || 'draft').toLowerCase();
  if ((status === 'draft' || status === 'sent') && q.validUntil && q.validUntil < today) return 'expired';
  return status;
}

export const QUOTATION_STATUSES = ['draft', 'sent', 'approved', 'rejected', 'expired'];
export const INVOICE_STATUSES = ['unpaid', 'partial', 'paid', 'overdue'];
export const SERVICE_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'];

export function statusLabel(status) {
  const map = {
    draft: 'Draft',
    sent: 'Sent',
    approved: 'Approved',
    rejected: 'Rejected',
    expired: 'Expired',
    unpaid: 'Unpaid',
    partial: 'Partially Paid',
    paid: 'Paid',
    overdue: 'Overdue',
    scheduled: 'Scheduled',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return map[status] || (status ? String(status) : '—');
}

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function money(value) {
  const n = Number(value) || 0;
  return peso.format(n).replace(/\u00a0/g, ' ');
}

export function moneyPlain(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(iso, style = 'long') {
  if (!iso) return '—';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  if (style === 'short') {
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function formatQty(value) {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString().slice(0, 10);
}
