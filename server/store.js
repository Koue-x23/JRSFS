// Business data layer: validation, numbering, totals, snapshots and reporting.
import { all, get, run, tx, docNumber, customerNumber } from './db.js';
import {
  HttpError,
  str,
  multiline,
  requiredDate,
  dateOr,
  toMoney,
  toQty,
  toRate,
  todayISO,
  nowISO,
  parseId,
  parseJson,
  round2,
} from './util.js';
import {
  computeTotals,
  invoiceStatus,
  quotationStatus,
  QUOTATION_STATUSES,
  SERVICE_STATUSES,
  addDays,
  money,
} from '../public/js/calc.js';

const MAX_ITEMS = 200;
const QUOTATION_SETTABLE = ['draft', 'sent', 'approved', 'rejected'];
const INVOICE_FILTERS = ['unpaid', 'partial', 'paid', 'overdue'];

const likeParam = (q) => `%${String(q).replace(/[\\%_]/g, '\\$&')}%`;
const oneOf = (value, allowed, field) => {
  const v = String(value || '').toLowerCase();
  if (!allowed.includes(v)) throw new HttpError(400, `${field} has an invalid value.`);
  return v;
};
const emailOk = (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const urlOk = (value) => !value || /^https?:\/\/.+/i.test(value);
const dataUrlOk = (value) => !value || /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=\s]+$/.test(value);

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
function mapSettings(row) {
  return {
    businessName: row.business_name,
    tagline: row.tagline,
    phone: row.phone,
    mobile: row.mobile,
    email: row.email,
    address: row.address,
    facebookUrl: row.facebook_url,
    socialLinks: parseJson(row.social_links, []),
    websiteUrl: row.website_url,
    representative: row.representative,
    defaultFooter: row.default_footer,
    defaultPaymentTerms: row.default_payment_terms,
    defaultNotes: row.default_notes,
    taxEnabled: Boolean(row.tax_enabled),
    taxRate: row.tax_rate,
    taxLabel: row.tax_label,
    registrationInfo: row.registration_info,
    tin: row.tin,
    logoImage: row.logo_image,
    logoHeight: row.logo_height,
    logoAlign: row.logo_align,
    signatureImage: row.signature_image,
    defaultDueDays: row.default_due_days,
    paymentMethods: parseJson(row.payment_methods, ['Cash']),
    quotationPrefix: row.quotation_prefix,
    invoicePrefix: row.invoice_prefix,
    servicePrefix: row.service_prefix,
    statementPrefix: row.statement_prefix,
    paymentPrefix: row.payment_prefix,
    updatedAt: row.updated_at,
  };
}

export function getSettings() {
  return mapSettings(get('SELECT * FROM settings WHERE id = 1'));
}

function validateImage(value, field) {
  const v = typeof value === 'string' ? value : '';
  if (!v) return '';
  if (v.length > 7_000_000) throw new HttpError(400, `${field} is too large. Use an image under 5 MB.`);
  if (!dataUrlOk(v)) throw new HttpError(400, `${field} must be a PNG, JPG, or WebP image.`);
  return v;
}

export function updateSettings(payload) {
  const current = getSettings();
  const next = { ...current };
  const textFields = [
    'businessName',
    'tagline',
    'phone',
    'mobile',
    'email',
    'address',
    'facebookUrl',
    'websiteUrl',
    'representative',
    'defaultFooter',
    'defaultPaymentTerms',
    'defaultNotes',
    'taxLabel',
    'registrationInfo',
    'tin',
  ];
  const limits = { businessName: 160, tagline: 160, address: 400, defaultNotes: 2000, defaultFooter: 300, defaultPaymentTerms: 1000 };
  for (const key of textFields) {
    if (payload[key] !== undefined) next[key] = str(payload[key], limits[key] || 200);
  }
  if (!next.businessName) throw new HttpError(400, 'Business name is required.');
  if (!emailOk(next.email)) throw new HttpError(400, 'Email address is not valid.');
  for (const key of ['facebookUrl', 'websiteUrl']) {
    if (!urlOk(next[key])) throw new HttpError(400, `${key === 'facebookUrl' ? 'Facebook URL' : 'Website URL'} must start with http:// or https://`);
  }
  if (payload.logoImage !== undefined) next.logoImage = validateImage(payload.logoImage, 'Logo');
  if (payload.signatureImage !== undefined) next.signatureImage = validateImage(payload.signatureImage, 'Signature image');
  if (payload.logoHeight !== undefined) {
    const h = Number(payload.logoHeight);
    if (!Number.isFinite(h) || h < 24 || h > 120) throw new HttpError(400, 'Logo height must be between 24 and 120 px.');
    next.logoHeight = Math.round(h);
  }
  if (payload.logoAlign !== undefined) next.logoAlign = oneOf(payload.logoAlign, ['left', 'center', 'right'], 'Logo alignment');
  if (payload.taxEnabled !== undefined) next.taxEnabled = Boolean(payload.taxEnabled);
  if (payload.taxRate !== undefined) next.taxRate = toRate(payload.taxRate, 'Tax rate');
  if (payload.defaultDueDays !== undefined) {
    const d = Number(payload.defaultDueDays);
    if (!Number.isInteger(d) || d < 0 || d > 365) throw new HttpError(400, 'Default due days must be between 0 and 365.');
    next.defaultDueDays = d;
  }
  if (payload.paymentMethods !== undefined) {
    if (!Array.isArray(payload.paymentMethods)) throw new HttpError(400, 'Payment methods must be a list.');
    const methods = [...new Set(payload.paymentMethods.map((m) => str(m, 40)).filter(Boolean))];
    if (!methods.length) throw new HttpError(400, 'Add at least one payment method.');
    if (methods.length > 12) throw new HttpError(400, 'A maximum of 12 payment methods is allowed.');
    next.paymentMethods = methods;
  }
  if (payload.socialLinks !== undefined) {
    if (!Array.isArray(payload.socialLinks)) throw new HttpError(400, 'Social links must be a list.');
    const links = payload.socialLinks
      .map((l) => ({ label: str(l?.label, 60), url: str(l?.url, 300) }))
      .filter((l) => l.label || l.url);
    if (links.length > 8) throw new HttpError(400, 'A maximum of 8 social links is allowed.');
    for (const l of links) if (!urlOk(l.url)) throw new HttpError(400, 'Social links must start with http:// or https://');
    next.socialLinks = links;
  }
  for (const key of ['quotationPrefix', 'invoicePrefix', 'servicePrefix', 'statementPrefix', 'paymentPrefix']) {
    if (payload[key] !== undefined) {
      const v = str(payload[key], 6).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (v.length < 2 || v.length > 6) throw new HttpError(400, 'Document prefixes must be 2–6 letters or numbers.');
      next[key] = v;
    }
  }
  run(
    `UPDATE settings SET business_name=?, tagline=?, phone=?, mobile=?, email=?, address=?, facebook_url=?,
      social_links=?, website_url=?, representative=?, default_footer=?, default_payment_terms=?, default_notes=?,
      tax_enabled=?, tax_rate=?, tax_label=?, registration_info=?, tin=?, logo_image=?, logo_height=?, logo_align=?,
      signature_image=?, default_due_days=?, payment_methods=?, quotation_prefix=?, invoice_prefix=?, service_prefix=?,
      statement_prefix=?, payment_prefix=?, updated_at=? WHERE id=1`,
    [
      next.businessName,
      next.tagline,
      next.phone,
      next.mobile,
      next.email,
      next.address,
      next.facebookUrl,
      JSON.stringify(next.socialLinks),
      next.websiteUrl,
      next.representative,
      next.defaultFooter,
      next.defaultPaymentTerms,
      next.defaultNotes,
      next.taxEnabled ? 1 : 0,
      next.taxRate,
      next.taxLabel,
      next.registrationInfo,
      next.tin,
      next.logoImage,
      next.logoHeight,
      next.logoAlign,
      next.signatureImage,
      next.defaultDueDays,
      JSON.stringify(next.paymentMethods),
      next.quotationPrefix,
      next.invoicePrefix,
      next.servicePrefix,
      next.statementPrefix,
      next.paymentPrefix,
      nowISO(),
    ]
  );
  return getSettings();
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
function mapCustomer(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    companyName: row.company_name,
    phone: row.phone,
    email: row.email,
    billingAddress: row.billing_address,
    projectLocations: row.project_locations,
    remarks: row.remarks,
    archived: Boolean(row.archived),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function customerPayload(payload) {
  const name = str(payload.name, 160);
  if (!name) throw new HttpError(400, 'Customer name is required.');
  const email = str(payload.email, 160);
  if (!emailOk(email)) throw new HttpError(400, 'Customer email is not valid.');
  return {
    name,
    companyName: str(payload.companyName, 160),
    phone: str(payload.phone, 60),
    email,
    billingAddress: multiline(payload.billingAddress, 400),
    projectLocations: multiline(payload.projectLocations, 500),
    remarks: multiline(payload.remarks, 1000),
  };
}

export function listCustomers({ search = '', includeArchived = false } = {}) {
  const params = [];
  let sql = 'SELECT * FROM customers WHERE 1=1';
  if (!includeArchived) sql += ' AND archived = 0';
  if (search) {
    sql +=
      " AND (name LIKE ? ESCAPE '\\' OR company_name LIKE ? ESCAPE '\\' OR code LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')";
    const p = likeParam(search);
    params.push(p, p, p, p, p);
  }
  sql += ' ORDER BY name COLLATE NOCASE ASC LIMIT 1000';
  return all(sql, params).map(mapCustomer);
}

export function getCustomer(id) {
  const row = get('SELECT * FROM customers WHERE id = ?', [parseId(id)]);
  if (!row) throw new HttpError(404, 'Customer not found.');
  const customer = mapCustomer(row);
  const invoices = listInvoices({ customerId: customer.id });
  const quotations = listQuotations({ customerId: customer.id });
  const payments = listPayments({ customerId: customer.id });
  const statements = listStatements({ customerId: customer.id });
  const services = listServiceReports({ customerId: customer.id });
  const invoiced = round2(invoices.reduce((s, i) => s + i.total, 0));
  const paid = round2(payments.reduce((s, p) => s + p.amount, 0));
  const outstanding = round2(invoices.reduce((s, i) => s + i.balance, 0));
  return {
    ...customer,
    summary: {
      quotations: quotations.length,
      quotationValue: round2(quotations.reduce((s, q) => s + q.grandTotal, 0)),
      invoices: invoices.length,
      invoiced,
      paid,
      outstanding,
      statements: statements.length,
      serviceReports: services.length,
    },
    quotations,
    invoices,
    payments,
    statements,
    serviceReports: services,
  };
}

export function createCustomer(payload) {
  const data = customerPayload(payload);
  const now = nowISO();
  const id = tx(() => {
    const code = customerNumber();
    const res = run(
      `INSERT INTO customers (code, name, company_name, phone, email, billing_address, project_locations, remarks, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [code, data.name, data.companyName, data.phone, data.email, data.billingAddress, data.projectLocations, data.remarks, now, now]
    );
    return Number(res.lastInsertRowid);
  });
  return getCustomer(id);
}

export function updateCustomer(id, payload) {
  const cid = parseId(id);
  const existing = get('SELECT * FROM customers WHERE id = ?', [cid]);
  if (!existing) throw new HttpError(404, 'Customer not found.');
  const data = customerPayload(payload);
  run(
    `UPDATE customers SET name=?, company_name=?, phone=?, email=?, billing_address=?, project_locations=?, remarks=?, updated_at=? WHERE id=?`,
    [data.name, data.companyName, data.phone, data.email, data.billingAddress, data.projectLocations, data.remarks, nowISO(), cid]
  );
  return getCustomer(cid);
}

export function setCustomerArchived(id, archived) {
  const cid = parseId(id);
  const existing = get('SELECT id FROM customers WHERE id = ?', [cid]);
  if (!existing) throw new HttpError(404, 'Customer not found.');
  run('UPDATE customers SET archived=?, updated_at=? WHERE id=?', [archived ? 1 : 0, nowISO(), cid]);
  return getCustomer(cid);
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
function mapProduct(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    unit: row.unit,
    defaultPrice: row.default_price,
    notes: row.notes,
    archived: Boolean(row.archived),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function productPayload(payload) {
  const name = str(payload.name, 160);
  if (!name) throw new HttpError(400, 'Product or service name is required.');
  return {
    name,
    description: multiline(payload.description, 2000),
    category: str(payload.category, 80),
    unit: str(payload.unit, 20) || 'pc',
    defaultPrice: toMoney(payload.defaultPrice ?? 0, 'Default price'),
    notes: multiline(payload.notes, 1000),
  };
}

export function listProducts({ search = '', includeArchived = false, category = '' } = {}) {
  let sql = 'SELECT * FROM products WHERE 1=1';
  const params = [];
  if (!includeArchived) sql += ' AND archived = 0';
  if (search) {
    sql += " AND (name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\')";
    const p = likeParam(search);
    params.push(p, p, p);
  }
  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  sql += ' ORDER BY name COLLATE NOCASE ASC LIMIT 1000';
  return all(sql, params).map(mapProduct);
}

export function getProduct(id) {
  const row = get('SELECT * FROM products WHERE id = ?', [parseId(id)]);
  if (!row) throw new HttpError(404, 'Product or service not found.');
  return mapProduct(row);
}

export function createProduct(payload) {
  const data = productPayload(payload);
  const now = nowISO();
  const res = run(
    `INSERT INTO products (name, description, category, unit, default_price, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [data.name, data.description, data.category, data.unit, data.defaultPrice, data.notes, now, now]
  );
  return getProduct(Number(res.lastInsertRowid));
}

export function updateProduct(id, payload) {
  const pid = parseId(id);
  const existing = get('SELECT id FROM products WHERE id = ?', [pid]);
  if (!existing) throw new HttpError(404, 'Product or service not found.');
  const data = productPayload(payload);
  run(
    `UPDATE products SET name=?, description=?, category=?, unit=?, default_price=?, notes=?, updated_at=? WHERE id=?`,
    [data.name, data.description, data.category, data.unit, data.defaultPrice, data.notes, nowISO(), pid]
  );
  return getProduct(pid);
}

export function setProductArchived(id, archived) {
  const pid = parseId(id);
  const existing = get('SELECT id FROM products WHERE id = ?', [pid]);
  if (!existing) throw new HttpError(404, 'Product or service not found.');
  run('UPDATE products SET archived=?, updated_at=? WHERE id=?', [archived ? 1 : 0, nowISO(), pid]);
  return getProduct(pid);
}

// ---------------------------------------------------------------------------
// Shared line items / totals
// ---------------------------------------------------------------------------
function normalizeItems(items) {
  if (!Array.isArray(items) || !items.length) throw new HttpError(400, 'Add at least one line item.');
  if (items.length > MAX_ITEMS) throw new HttpError(400, `A maximum of ${MAX_ITEMS} line items is allowed.`);
  return items.map((raw, index) => {
    const description = str(raw?.description, 1500);
    if (!description) throw new HttpError(400, `Line ${index + 1} needs a description.`);
    const quantity = toQty(raw.quantity ?? 1, `Line ${index + 1} quantity`);
    const unit = str(raw.unit, 20) || 'pc';
    const unitPrice = toMoney(raw.unitPrice ?? 0, `Line ${index + 1} unit price`);
    let productId = null;
    if (raw.productId) {
      productId = parseId(raw.productId);
      if (!get('SELECT id FROM products WHERE id = ?', [productId])) productId = null;
    }
    return {
      position: index,
      productId,
      description,
      quantity,
      unit,
      unitPrice,
      lineTotal: round2(quantity * unitPrice),
    };
  });
}

function documentTotals(payload, items, settings) {
  const discountType = payload.discountType === 'percent' ? 'percent' : 'amount';
  const discountValue = discountType === 'percent' ? toRate(payload.discountValue ?? 0, 'Discount') : toMoney(payload.discountValue ?? 0, 'Discount');
  const taxRate = payload.taxRate !== undefined ? toRate(payload.taxRate, 'Tax rate') : settings.taxEnabled ? settings.taxRate : 0;
  const totals = computeTotals({ items, discountType, discountValue, taxRate });
  return { ...totals, discountType, discountValue, taxRate };
}

function insertQuotationItems(quotationId, lines) {
  for (const line of lines) {
    run(
      `INSERT INTO quotation_items (quotation_id, position, product_id, description, quantity, unit, unit_price, line_total)
       VALUES (?,?,?,?,?,?,?,?)`,
      [quotationId, line.position, line.productId, line.description, line.quantity, line.unit, line.unitPrice, line.lineTotal]
    );
  }
}

function insertInvoiceItems(invoiceId, lines) {
  for (const line of lines) {
    run(
      `INSERT INTO invoice_items (invoice_id, position, product_id, description, quantity, unit, unit_price, line_total)
       VALUES (?,?,?,?,?,?,?,?)`,
      [invoiceId, line.position, line.productId, line.description, line.quantity, line.unit, line.unitPrice, line.lineTotal]
    );
  }
}

// ---------------------------------------------------------------------------
// Quotations
// ---------------------------------------------------------------------------
const Q_SELECT = `SELECT id, number, issue_date AS issueDate, valid_until AS validUntil, customer_id AS customerId,
  customer_name AS customerName, company_name AS companyName, contact_number AS contactNumber, email, address,
  project_name AS projectName, project_location AS projectLocation, subtotal, discount_type AS discountType,
  discount_value AS discountValue, discount_amount AS discountAmount, tax_rate AS taxRate, tax_amount AS taxAmount,
  grand_total AS grandTotal, payment_terms AS paymentTerms, delivery_schedule AS deliverySchedule, remarks,
  prepared_by AS preparedBy, status, invoice_id AS invoiceId, created_at AS createdAt, updated_at AS updatedAt
  FROM quotations`;

function mapQuotation(row) {
  const effectiveStatus = quotationStatus(row);
  return { ...row, effectiveStatus };
}

function quotationItems(id) {
  return all(
    `SELECT id, product_id AS productId, description, quantity, unit, unit_price AS unitPrice, line_total AS lineTotal, position
     FROM quotation_items WHERE quotation_id = ? ORDER BY position ASC, id ASC`,
    [id]
  );
}

export function listQuotations({ search = '', status = '', customerId = '', from = '', to = '', limit = 500 } = {}) {
  const params = [];
  let sql = `${Q_SELECT} WHERE 1=1`;
  if (search) {
    sql +=
      " AND (number LIKE ? ESCAPE '\\' OR customer_name LIKE ? ESCAPE '\\' OR company_name LIKE ? ESCAPE '\\' OR project_name LIKE ? ESCAPE '\\' OR project_location LIKE ? ESCAPE '\\')";
    const p = likeParam(search);
    params.push(p, p, p, p, p);
  }
  if (customerId) {
    sql += ' AND customer_id = ?';
    params.push(parseId(customerId));
  }
  if (from) {
    sql += ' AND issue_date >= ?';
    params.push(dateOr(from));
  }
  if (to) {
    sql += ' AND issue_date <= ?';
    params.push(dateOr(to));
  }
  sql += ' ORDER BY issue_date DESC, id DESC LIMIT 1000';
  let rows = all(sql, params).map(mapQuotation);
  if (status === 'pending') rows = rows.filter((r) => ['draft', 'sent'].includes(r.effectiveStatus));
  else if (status) rows = rows.filter((r) => r.effectiveStatus === status);
  return rows.slice(0, Math.min(Number(limit) || 500, 1000));
}

export function getQuotation(id) {
  const row = get(`${Q_SELECT} WHERE id = ?`, [parseId(id)]);
  if (!row) throw new HttpError(404, 'Quotation not found.');
  const quotation = mapQuotation(row);
  const invoice = quotation.invoiceId ? get('SELECT id, number FROM invoices WHERE id = ?', [quotation.invoiceId]) : null;
  return { ...quotation, items: quotationItems(quotation.id), linkedInvoice: invoice || null };
}

function quotationInput(payload, { partial = false, existing = null } = {}) {
  const settings = getSettings();
  const base = existing || {};
  const customerName = str(payload.customerName ?? base.customerName, 160);
  if (!customerName) throw new HttpError(400, 'Customer name is required.');
  const issueDate = requiredDate(payload.issueDate ?? base.issueDate, 'Issue date');
  const validUntil = dateOr(payload.validUntil ?? base.validUntil);
  if (validUntil && validUntil < issueDate) throw new HttpError(400, 'Validity date cannot be before the issue date.');
  let customerId = payload.customerId !== undefined ? payload.customerId : base.customerId;
  let customer = null;
  if (customerId) {
    customerId = parseId(customerId);
    customer = get('SELECT * FROM customers WHERE id = ?', [customerId]) || null;
    if (!customer) throw new HttpError(400, 'Selected customer no longer exists.');
  }
  const status = payload.status !== undefined ? oneOf(payload.status, QUOTATION_SETTABLE, 'Quotation status') : base.status || 'draft';
  return {
    issueDate,
    validUntil,
    customerId,
    customerName,
    companyName: str(payload.companyName ?? base.companyName ?? customer?.company_name, 160),
    contactNumber: str(payload.contactNumber ?? base.contactNumber ?? customer?.phone, 60),
    email: str(payload.email ?? base.email ?? customer?.email, 160),
    address: multiline(payload.address ?? base.address ?? customer?.billing_address, 400),
    projectName: str(payload.projectName ?? base.projectName, 200),
    projectLocation: multiline(payload.projectLocation ?? base.projectLocation, 300),
    paymentTerms: multiline(payload.paymentTerms ?? base.paymentTerms ?? settings.defaultPaymentTerms, 1000),
    deliverySchedule: multiline(payload.deliverySchedule ?? base.deliverySchedule, 300),
    remarks: multiline(payload.remarks ?? base.remarks ?? settings.defaultNotes, 2000),
    preparedBy: str(payload.preparedBy ?? base.preparedBy ?? settings.representative, 120),
    status,
  };
}

export function createQuotation(payload) {
  const data = quotationInput(payload);
  const items = normalizeItems(payload.items);
  const settings = getSettings();
  const totals = documentTotals(payload, items, settings);
  const now = nowISO();
  const id = tx(() => {
    let number = docNumber(settings.quotationPrefix, data.issueDate);
    while (get('SELECT id FROM quotations WHERE number = ?', [number])) {
      number = docNumber(settings.quotationPrefix, data.issueDate);
    }
    const res = run(
      `INSERT INTO quotations (number, issue_date, valid_until, customer_id, customer_name, company_name, contact_number, email,
        address, project_name, project_location, subtotal, discount_type, discount_value, discount_amount, tax_rate, tax_amount,
        grand_total, payment_terms, delivery_schedule, remarks, prepared_by, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        number,
        data.issueDate,
        data.validUntil,
        data.customerId,
        data.customerName,
        data.companyName,
        data.contactNumber,
        data.email,
        data.address,
        data.projectName,
        data.projectLocation,
        totals.subtotal,
        data.discountType ?? totals.discountType,
        totals.discountValue,
        totals.discountAmount,
        totals.taxRate,
        totals.taxAmount,
        totals.grandTotal,
        data.paymentTerms,
        data.deliverySchedule,
        data.remarks,
        data.preparedBy,
        data.status,
        now,
        now,
      ]
    );
    const qid = Number(res.lastInsertRowid);
    insertQuotationItems(qid, totals.lines);
    return qid;
  });
  return getQuotation(id);
}

export function updateQuotation(id, payload) {
  const qid = parseId(id);
  const existing = getQuotation(qid);
  if (existing.invoiceId) {
    throw new HttpError(409, 'This quotation was converted to an invoice and is locked to keep records consistent. Duplicate it to make changes.');
  }
  const data = quotationInput(payload, { partial: true, existing });
  const items = normalizeItems(payload.items ?? existing.items);
  const settings = getSettings();
  const totals = documentTotals(
    {
      discountType: payload.discountType ?? existing.discountType,
      discountValue: payload.discountValue ?? existing.discountValue,
      taxRate: payload.taxRate ?? existing.taxRate,
    },
    items,
    settings
  );
  tx(() => {
    run(
      `UPDATE quotations SET issue_date=?, valid_until=?, customer_id=?, customer_name=?, company_name=?, contact_number=?,
        email=?, address=?, project_name=?, project_location=?, subtotal=?, discount_type=?, discount_value=?, discount_amount=?,
        tax_rate=?, tax_amount=?, grand_total=?, payment_terms=?, delivery_schedule=?, remarks=?, prepared_by=?, status=?, updated_at=?
       WHERE id=?`,
      [
        data.issueDate,
        data.validUntil,
        data.customerId,
        data.customerName,
        data.companyName,
        data.contactNumber,
        data.email,
        data.address,
        data.projectName,
        data.projectLocation,
        totals.subtotal,
        totals.discountType,
        totals.discountValue,
        totals.discountAmount,
        totals.taxRate,
        totals.taxAmount,
        totals.grandTotal,
        data.paymentTerms,
        data.deliverySchedule,
        data.remarks,
        data.preparedBy,
        data.status,
        nowISO(),
        qid,
      ]
    );
    run('DELETE FROM quotation_items WHERE quotation_id = ?', [qid]);
    insertQuotationItems(qid, totals.lines);
  });
  return getQuotation(qid);
}

export function setQuotationStatus(id, status) {
  const qid = parseId(id);
  const existing = getQuotation(qid);
  const next = oneOf(status, QUOTATION_SETTABLE, 'Quotation status');
  run('UPDATE quotations SET status=?, updated_at=? WHERE id=?', [next, nowISO(), qid]);
  return getQuotation(qid);
}

export function duplicateQuotation(id) {
  const source = getQuotation(id);
  const settings = getSettings();
  return createQuotation({
    ...source,
    issueDate: todayISO(),
    validUntil:
      source.validUntil && source.validUntil >= todayISO()
        ? addDays(todayISO(), Math.max(1, diffDays(todayISO(), source.validUntil)))
        : addDays(todayISO(), 30),
    status: 'draft',
    items: source.items.map((it) => ({
      productId: it.productId,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
    })),
    customerId: source.customerId,
    quotationPrefix: settings.quotationPrefix,
  });
}

function diffDays(from, to) {
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------
const I_SELECT = `SELECT id, number, invoice_date AS invoiceDate, due_date AS dueDate, customer_id AS customerId,
  customer_name AS customerName, company_name AS companyName, contact_number AS contactNumber, email, address,
  quotation_id AS quotationId, quotation_number AS quotationNumber, subtotal, discount_type AS discountType,
  discount_value AS discountValue, discount_amount AS discountAmount, tax_rate AS taxRate, tax_amount AS taxAmount,
  total, amount_paid AS amountPaid, balance, payment_terms AS paymentTerms, remarks, prepared_by AS preparedBy,
  status, created_at AS createdAt, updated_at AS updatedAt FROM invoices`;

function mapInvoice(row, today = todayISO()) {
  const amountPaid = row.amountPaid;
  const balance = round2(Math.max(row.total - amountPaid, 0));
  return {
    ...row,
    balance,
    status: invoiceStatus({ total: row.total, amountPaid, dueDate: row.dueDate }, today),
  };
}

function invoiceItems(id) {
  return all(
    `SELECT id, product_id AS productId, description, quantity, unit, unit_price AS unitPrice, line_total AS lineTotal, position
     FROM invoice_items WHERE invoice_id = ? ORDER BY position ASC, id ASC`,
    [id]
  );
}

export function listInvoices({ search = '', status = '', customerId = '', from = '', to = '', limit = 500 } = {}) {
  const params = [];
  let sql = `${I_SELECT} WHERE 1=1`;
  if (search) {
    sql +=
      " AND (number LIKE ? ESCAPE '\\' OR customer_name LIKE ? ESCAPE '\\' OR company_name LIKE ? ESCAPE '\\' OR quotation_number LIKE ? ESCAPE '\\')";
    const p = likeParam(search);
    params.push(p, p, p, p);
  }
  if (customerId) {
    sql += ' AND customer_id = ?';
    params.push(parseId(customerId));
  }
  if (from) {
    sql += ' AND invoice_date >= ?';
    params.push(dateOr(from));
  }
  if (to) {
    sql += ' AND invoice_date <= ?';
    params.push(dateOr(to));
  }
  sql += ' ORDER BY invoice_date DESC, id DESC LIMIT 1000';
  let rows = all(sql, params).map((r) => mapInvoice(r));
  if (status === 'open') rows = rows.filter((r) => ['unpaid', 'partial', 'overdue'].includes(r.status));
  else if (status) {
    const s = oneOf(status, INVOICE_FILTERS, 'Invoice status');
    rows = rows.filter((r) => r.status === s);
  }
  return rows.slice(0, Math.min(Number(limit) || 500, 1000));
}

export function getInvoice(id) {
  const row = get(`${I_SELECT} WHERE id = ?`, [parseId(id)]);
  if (!row) throw new HttpError(404, 'Invoice not found.');
  const invoice = mapInvoice(row);
  const payments = all(
    `SELECT id, reference, invoice_id AS invoiceId, invoice_number AS invoiceNumber, customer_id AS customerId,
      customer_name AS customerName, payment_date AS paymentDate, amount, method, details, remarks, created_at AS createdAt
     FROM payments WHERE invoice_id = ? ORDER BY payment_date ASC, id ASC`,
    [invoice.id]
  );
  return { ...invoice, items: invoiceItems(invoice.id), payments };
}

function invoiceInput(payload, { existing = null } = {}) {
  const settings = getSettings();
  const base = existing || {};
  const customerName = str(payload.customerName ?? base.customerName, 160);
  if (!customerName) throw new HttpError(400, 'Customer name is required.');
  const invoiceDate = requiredDate(payload.invoiceDate ?? base.invoiceDate ?? todayISO(), 'Invoice date');
  let dueDate = dateOr(payload.dueDate ?? base.dueDate);
  if (!dueDate && !existing) dueDate = addDays(invoiceDate, settings.defaultDueDays ?? 30);
  if (dueDate && dueDate < invoiceDate) throw new HttpError(400, 'Due date cannot be before the invoice date.');
  let customerId = payload.customerId !== undefined ? payload.customerId : base.customerId;
  let customer = null;
  if (customerId) {
    customerId = parseId(customerId);
    customer = get('SELECT * FROM customers WHERE id = ?', [customerId]) || null;
    if (!customer) throw new HttpError(400, 'Selected customer no longer exists.');
  }
  return {
    invoiceDate,
    dueDate,
    customerId,
    customerName,
    companyName: str(payload.companyName ?? base.companyName ?? customer?.company_name, 160),
    contactNumber: str(payload.contactNumber ?? base.contactNumber ?? customer?.phone, 60),
    email: str(payload.email ?? base.email ?? customer?.email, 160),
    address: multiline(payload.address ?? base.address ?? customer?.billing_address, 400),
    quotationId: payload.quotationId !== undefined ? payload.quotationId : base.quotationId,
    quotationNumber: str(payload.quotationNumber ?? base.quotationNumber, 40),
    paymentTerms: multiline(payload.paymentTerms ?? base.paymentTerms ?? settings.defaultPaymentTerms, 1000),
    remarks: multiline(payload.remarks ?? base.remarks ?? settings.defaultNotes, 2000),
    preparedBy: str(payload.preparedBy ?? base.preparedBy ?? settings.representative, 120),
  };
}

export function createInvoice(payload) {
  const data = invoiceInput(payload);
  if (data.quotationId) {
    const quotation = get('SELECT * FROM quotations WHERE id = ?', [parseId(data.quotationId)]);
    if (!quotation) throw new HttpError(400, 'Linked quotation not found.');
    if (quotation.invoice_id) throw new HttpError(409, 'That quotation is already linked to an invoice.');
    if (quotation.status !== 'approved') throw new HttpError(409, 'Only approved quotations can be invoiced.');
  }
  const items = normalizeItems(payload.items);
  const settings = getSettings();
  const totals = documentTotals(payload, items, settings);
  const now = nowISO();
  const id = tx(() => {
    let number = docNumber(settings.invoicePrefix, data.invoiceDate);
    while (get('SELECT id FROM invoices WHERE number = ?', [number])) {
      number = docNumber(settings.invoicePrefix, data.invoiceDate);
    }
    const res = run(
      `INSERT INTO invoices (number, invoice_date, due_date, customer_id, customer_name, company_name, contact_number, email,
        address, quotation_id, quotation_number, subtotal, discount_type, discount_value, discount_amount, tax_rate, tax_amount,
        total, amount_paid, balance, payment_terms, remarks, prepared_by, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?)`,
      [
        number,
        data.invoiceDate,
        data.dueDate,
        data.customerId,
        data.customerName,
        data.companyName,
        data.contactNumber,
        data.email,
        data.address,
        data.quotationId || null,
        data.quotationNumber,
        totals.subtotal,
        totals.discountType,
        totals.discountValue,
        totals.discountAmount,
        totals.taxRate,
        totals.taxAmount,
        totals.grandTotal,
        totals.grandTotal,
        data.paymentTerms,
        data.remarks,
        data.preparedBy,
        'unpaid',
        now,
        now,
      ]
    );
    const iid = Number(res.lastInsertRowid);
    insertInvoiceItems(iid, totals.lines);
    if (data.quotationId) {
      run('UPDATE quotations SET invoice_id=?, updated_at=? WHERE id=?', [iid, nowISO(), data.quotationId]);
    }
    return iid;
  });
  return getInvoice(id);
}

export function updateInvoice(id, payload) {
  const iid = parseId(id);
  const existing = getInvoice(iid);
  const data = invoiceInput(payload, { existing });
  const items = normalizeItems(payload.items ?? existing.items);
  const settings = getSettings();
  const totals = documentTotals(
    {
      discountType: payload.discountType ?? existing.discountType,
      discountValue: payload.discountValue ?? existing.discountValue,
      taxRate: payload.taxRate ?? existing.taxRate,
    },
    items,
    settings
  );
  if (round2(totals.grandTotal) < round2(existing.amountPaid) - 0.005) {
    throw new HttpError(400, `The new total ${money(totals.grandTotal)} is lower than the ${money(existing.amountPaid)} already paid. Delete or adjust payments first.`);
  }
  tx(() => {
    run(
      `UPDATE invoices SET invoice_date=?, due_date=?, customer_id=?, customer_name=?, company_name=?, contact_number=?, email=?,
        address=?, quotation_id=?, quotation_number=?, subtotal=?, discount_type=?, discount_value=?, discount_amount=?, tax_rate=?,
        tax_amount=?, total=?, balance=?, payment_terms=?, remarks=?, prepared_by=?, status=?, updated_at=? WHERE id=?`,
      [
        data.invoiceDate,
        data.dueDate,
        data.customerId,
        data.customerName,
        data.companyName,
        data.contactNumber,
        data.email,
        data.address,
        data.quotationId || null,
        data.quotationNumber,
        totals.subtotal,
        totals.discountType,
        totals.discountValue,
        totals.discountAmount,
        totals.taxRate,
        totals.taxAmount,
        totals.grandTotal,
        round2(totals.grandTotal - existing.amountPaid),
        data.paymentTerms,
        data.remarks,
        data.preparedBy,
        invoiceStatus({ total: totals.grandTotal, amountPaid: existing.amountPaid, dueDate: data.dueDate }),
        nowISO(),
        iid,
      ]
    );
    run('DELETE FROM invoice_items WHERE invoice_id = ?', [iid]);
    insertInvoiceItems(iid, totals.lines);
  });
  return getInvoice(iid);
}

export function convertQuotation(id) {
  const quotation = getQuotation(id);
  if (quotation.invoiceId) {
    const inv = get('SELECT id, number FROM invoices WHERE id = ?', [quotation.invoiceId]);
    throw new HttpError(409, `This quotation was already converted to invoice ${inv?.number || ''}.`);
  }
  if (quotation.status !== 'approved') {
    throw new HttpError(409, 'Only approved quotations can be converted to an invoice. Approve the quotation first.');
  }
  const settings = getSettings();
  const invoiceDate = todayISO();
  const invoice = createInvoice({
    invoiceDate,
    dueDate: addDays(invoiceDate, settings.defaultDueDays ?? 30),
    customerId: quotation.customerId,
    customerName: quotation.customerName,
    companyName: quotation.companyName,
    contactNumber: quotation.contactNumber,
    email: quotation.email,
    address: quotation.address,
    quotationId: quotation.id,
    quotationNumber: quotation.number,
    discountType: quotation.discountType,
    discountValue: quotation.discountValue,
    taxRate: quotation.taxRate,
    paymentTerms: quotation.paymentTerms || settings.defaultPaymentTerms,
    remarks: quotation.remarks,
    preparedBy: quotation.preparedBy || settings.representative,
    items: quotation.items.map((it) => ({
      productId: it.productId,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
    })),
  });
  run('UPDATE quotations SET invoice_id=?, updated_at=? WHERE id=?', [invoice.id, nowISO(), quotation.id]);
  return { invoice, quotation: getQuotation(quotation.id) };
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
const P_SELECT = `SELECT id, reference, invoice_id AS invoiceId, invoice_number AS invoiceNumber, customer_id AS customerId,
  customer_name AS customerName, payment_date AS paymentDate, amount, method, details, remarks, created_at AS createdAt
  FROM payments`;

export function listPayments({ search = '', customerId = '', invoiceId = '', from = '', to = '', method = '', limit = 500 } = {}) {
  let sql = `${P_SELECT} WHERE 1=1`;
  const params = [];
  if (search) {
    sql += " AND (reference LIKE ? ESCAPE '\\' OR invoice_number LIKE ? ESCAPE '\\' OR customer_name LIKE ? ESCAPE '\\' OR details LIKE ? ESCAPE '\\')";
    const p = likeParam(search);
    params.push(p, p, p, p);
  }
  if (customerId) {
    sql += ' AND customer_id = ?';
    params.push(parseId(customerId));
  }
  if (invoiceId) {
    sql += ' AND invoice_id = ?';
    params.push(parseId(invoiceId));
  }
  if (from) {
    sql += ' AND payment_date >= ?';
    params.push(dateOr(from));
  }
  if (to) {
    sql += ' AND payment_date <= ?';
    params.push(dateOr(to));
  }
  if (method) {
    sql += ' AND method = ?';
    params.push(str(method, 40));
  }
  sql += ' ORDER BY payment_date DESC, id DESC LIMIT 1000';
  return all(sql, params).slice(0, Math.min(Number(limit) || 500, 1000));
}

function recalcInvoice(invoiceId) {
  const invoice = get('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
  if (!invoice) return null;
  const paid = get('SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE invoice_id = ?', [invoiceId]).total;
  const amountPaid = round2(paid);
  const balance = round2(Math.max(invoice.total - amountPaid, 0));
  const status = invoiceStatus({ total: invoice.total, amountPaid, dueDate: invoice.due_date });
  run('UPDATE invoices SET amount_paid=?, balance=?, status=?, updated_at=? WHERE id=?', [
    amountPaid,
    balance,
    status,
    nowISO(),
    invoiceId,
  ]);
  return { amountPaid, balance, status };
}

export function createPayment(payload) {
  const invoice = get(`${I_SELECT} WHERE id = ?`, [parseId(payload.invoiceId)]);
  if (!invoice) throw new HttpError(404, 'Invoice not found.');
  const mapped = mapInvoice(invoice);
  const amount = toMoney(payload.amount, 'Payment amount');
  if (amount <= 0) throw new HttpError(400, 'Payment amount must be greater than zero.');
  if (amount > mapped.balance + 0.005) {
    throw new HttpError(400, `Payment exceeds the remaining balance of ${money(mapped.balance)}.`);
  }
  const paymentDate = requiredDate(payload.paymentDate ?? todayISO(), 'Payment date');
  const method = str(payload.method, 40);
  if (!method) throw new HttpError(400, 'Payment method is required.');
  const details = multiline(payload.details, 300);
  const remarks = multiline(payload.remarks, 500);
  let reference = str(payload.reference, 40);
  const recent = get(
    'SELECT id FROM payments WHERE invoice_id = ? AND amount = ? AND payment_date = ? AND created_at > ?',
    [mapped.id, amount, paymentDate, new Date(Date.now() - 15000).toISOString()]
  );
  if (recent) throw new HttpError(409, 'A matching payment was just recorded for this invoice. Refresh to avoid a duplicate.');
  const settings = getSettings();
  const id = tx(() => {
    if (!reference) {
      reference = docNumber(settings.paymentPrefix || 'PAY', paymentDate);
    }
    if (get('SELECT id FROM payments WHERE reference = ?', [reference])) {
      throw new HttpError(409, `Payment reference ${reference} already exists.`);
    }
    const res = run(
      `INSERT INTO payments (reference, invoice_id, invoice_number, customer_id, customer_name, payment_date, amount, method, details, remarks, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [reference, mapped.id, mapped.number, mapped.customerId, mapped.customerName, paymentDate, amount, method, details, remarks, nowISO()]
    );
    recalcInvoice(mapped.id);
    return Number(res.lastInsertRowid);
  });
  return { payment: get('SELECT * FROM payments WHERE id = ?', [id]), invoice: getInvoice(mapped.id) };
}

export function updatePayment(id, payload) {
  const pid = parseId(id);
  const existing = get('SELECT * FROM payments WHERE id = ?', [pid]);
  if (!existing) throw new HttpError(404, 'Payment not found.');
  const amount = toMoney(payload.amount ?? existing.amount, 'Payment amount');
  if (amount <= 0) throw new HttpError(400, 'Payment amount must be greater than zero.');
  const paymentDate = requiredDate(payload.paymentDate ?? existing.payment_date, 'Payment date');
  const method = str(payload.method ?? existing.method, 40) || existing.method;
  const reference = str(payload.reference ?? existing.reference, 40);
  if (!reference) throw new HttpError(400, 'Payment reference is required.');
  const invoice = get('SELECT * FROM invoices WHERE id = ?', [existing.invoice_id]);
  const otherPaid = get('SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE invoice_id = ? AND id <> ?', [
    existing.invoice_id,
    pid,
  ]).total;
  if (round2(otherPaid + amount) > invoice.total + 0.005) {
    throw new HttpError(400, 'Updated payment would exceed the invoice total.');
  }
  if (get('SELECT id FROM payments WHERE reference = ? AND id <> ?', [reference, pid])) {
    throw new HttpError(409, `Payment reference ${reference} already exists.`);
  }
  tx(() => {
    run('UPDATE payments SET reference=?, payment_date=?, amount=?, method=?, details=?, remarks=? WHERE id=?', [
      reference,
      paymentDate,
      amount,
      method,
      multiline(payload.details ?? existing.details, 300),
      multiline(payload.remarks ?? existing.remarks, 500),
      pid,
    ]);
    recalcInvoice(existing.invoice_id);
  });
  return { payment: get('SELECT * FROM payments WHERE id = ?', [pid]), invoice: getInvoice(existing.invoice_id) };
}

export function deletePayment(id) {
  const pid = parseId(id);
  const existing = get('SELECT * FROM payments WHERE id = ?', [pid]);
  if (!existing) throw new HttpError(404, 'Payment not found.');
  tx(() => {
    run('DELETE FROM payments WHERE id = ?', [pid]);
    recalcInvoice(existing.invoice_id);
  });
  return { deleted: true, invoice: getInvoice(existing.invoice_id) };
}

// ---------------------------------------------------------------------------
// Service reports
// ---------------------------------------------------------------------------
const S_SELECT = `SELECT id, number, service_date AS serviceDate, customer_id AS customerId, customer_name AS customerName,
  company_name AS companyName, contact_number AS contactNumber, email, location, equipment, reported_problem AS reportedProblem,
  findings, work_performed AS workPerformed, technician, start_time AS startTime, end_time AS endTime,
  materials, materials_cost AS materialsCost, labor_cost AS laborCost, total_cost AS totalCost, status,
  recommendations, remarks, customer_ack AS customerAck, photos, prepared_by AS preparedBy,
  created_at AS createdAt, updated_at AS updatedAt FROM service_reports`;

function mapService(row) {
  return { ...row, materials: parseJson(row.materials, []), photos: parseJson(row.photos, []) };
}

export function listServiceReports({ search = '', status = '', customerId = '', from = '', to = '', limit = 500 } = {}) {
  let sql = `${S_SELECT} WHERE 1=1`;
  const params = [];
  if (search) {
    sql +=
      " AND (number LIKE ? ESCAPE '\\' OR customer_name LIKE ? ESCAPE '\\' OR company_name LIKE ? ESCAPE '\\' OR equipment LIKE ? ESCAPE '\\' OR location LIKE ? ESCAPE '\\' OR reported_problem LIKE ? ESCAPE '\\')";
    const p = likeParam(search);
    params.push(p, p, p, p, p, p);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(oneOf(status, SERVICE_STATUSES, 'Service status'));
  }
  if (customerId) {
    sql += ' AND customer_id = ?';
    params.push(parseId(customerId));
  }
  if (from) {
    sql += ' AND service_date >= ?';
    params.push(dateOr(from));
  }
  if (to) {
    sql += ' AND service_date <= ?';
    params.push(dateOr(to));
  }
  sql += ' ORDER BY service_date DESC, id DESC LIMIT 1000';
  return all(sql, params).slice(0, Math.min(Number(limit) || 500, 1000)).map(mapService);
}

export function getServiceReport(id) {
  const row = get(`${S_SELECT} WHERE id = ?`, [parseId(id)]);
  if (!row) throw new HttpError(404, 'Service report not found.');
  return mapService(row);
}

function normalizeMaterials(materials) {
  if (materials === undefined) return [];
  if (!Array.isArray(materials)) throw new HttpError(400, 'Materials must be a list.');
  if (materials.length > 100) throw new HttpError(400, 'A maximum of 100 material rows is allowed.');
  return materials
    .map((m) => {
      const description = str(m?.description, 300);
      if (!description) return null;
      const quantity = Number(m.quantity ?? 0);
      const unitCost = Number(m.unitCost ?? 0);
      if (!Number.isFinite(quantity) || quantity < 0) throw new HttpError(400, 'Material quantity must be zero or more.');
      if (!Number.isFinite(unitCost) || unitCost < 0) throw new HttpError(400, 'Material unit cost must be zero or more.');
      return {
        description,
        quantity: Math.round(quantity * 1000) / 1000,
        unit: str(m.unit, 20),
        unitCost: round2(unitCost),
        amount: round2(quantity * unitCost),
      };
    })
    .filter(Boolean);
}

function normalizePhotos(photos) {
  if (photos === undefined) return [];
  if (!Array.isArray(photos)) throw new HttpError(400, 'Photos must be a list.');
  if (photos.length > 6) throw new HttpError(400, 'A maximum of 6 photos is allowed.');
  return photos.map((p) => {
    if (typeof p !== 'string' || !dataUrlOk(p)) throw new HttpError(400, 'Photos must be PNG, JPG, or WebP images.');
    if (p.length > 3_000_000) throw new HttpError(400, 'Each photo must be smaller than 2 MB.');
    return p;
  });
}

function servicePayload(payload, existing = null) {
  const base = existing || {};
  const customerName = str(payload.customerName ?? base.customerName, 160);
  if (!customerName) throw new HttpError(400, 'Customer name is required.');
  const serviceDate = requiredDate(payload.serviceDate ?? base.serviceDate ?? todayISO(), 'Service date');
  let customerId = payload.customerId !== undefined ? payload.customerId : base.customerId;
  let customer = null;
  if (customerId) {
    customerId = parseId(customerId);
    customer = get('SELECT * FROM customers WHERE id = ?', [customerId]) || null;
    if (!customer) throw new HttpError(400, 'Selected customer no longer exists.');
  }
  const materials = normalizeMaterials(payload.materials !== undefined ? payload.materials : base.materials);
  const materialsCost = round2(materials.reduce((s, m) => s + m.amount, 0));
  const laborCost = toMoney(payload.laborCost ?? base.laborCost ?? 0, 'Labor cost');
  const settings = getSettings();
  return {
    serviceDate,
    customerId,
    customerName,
    companyName: str(payload.companyName ?? base.companyName ?? customer?.company_name, 160),
    contactNumber: str(payload.contactNumber ?? base.contactNumber ?? customer?.phone, 60),
    email: str(payload.email ?? base.email ?? customer?.email, 160),
    location: multiline(payload.location ?? base.location, 300),
    equipment: str(payload.equipment ?? base.equipment, 300),
    reportedProblem: multiline(payload.reportedProblem ?? base.reportedProblem, 2000),
    findings: multiline(payload.findings ?? base.findings, 2000),
    workPerformed: multiline(payload.workPerformed ?? base.workPerformed, 2000),
    technician: str(payload.technician ?? base.technician, 120),
    startTime: str(payload.startTime ?? base.startTime, 10),
    endTime: str(payload.endTime ?? base.endTime, 10),
    status: payload.status !== undefined ? oneOf(payload.status, SERVICE_STATUSES, 'Service status') : base.status || 'scheduled',
    recommendations: multiline(payload.recommendations ?? base.recommendations, 2000),
    remarks: multiline(payload.remarks ?? base.remarks, 2000),
    customerAck: str(payload.customerAck ?? base.customerAck, 120),
    preparedBy: str(payload.preparedBy ?? base.preparedBy ?? settings.representative, 120),
    materials,
    materialsCost,
    laborCost,
    totalCost: round2(materialsCost + laborCost),
    photos: normalizePhotos(payload.photos !== undefined ? payload.photos : base.photos),
  };
}

export function createServiceReport(payload) {
  const data = servicePayload(payload);
  const settings = getSettings();
  const now = nowISO();
  const id = tx(() => {
    let number = docNumber(settings.servicePrefix, data.serviceDate);
    while (get('SELECT id FROM service_reports WHERE number = ?', [number])) {
      number = docNumber(settings.servicePrefix, data.serviceDate);
    }
    const res = run(
      `INSERT INTO service_reports (number, service_date, customer_id, customer_name, company_name, contact_number, email, location,
        equipment, reported_problem, findings, work_performed, technician, start_time, end_time, materials, materials_cost, labor_cost,
        total_cost, status, recommendations, remarks, customer_ack, photos, prepared_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        number,
        data.serviceDate,
        data.customerId,
        data.customerName,
        data.companyName,
        data.contactNumber,
        data.email,
        data.location,
        data.equipment,
        data.reportedProblem,
        data.findings,
        data.workPerformed,
        data.technician,
        data.startTime,
        data.endTime,
        JSON.stringify(data.materials),
        data.materialsCost,
        data.laborCost,
        data.totalCost,
        data.status,
        data.recommendations,
        data.remarks,
        data.customerAck,
        JSON.stringify(data.photos),
        data.preparedBy,
        now,
        now,
      ]
    );
    return Number(res.lastInsertRowid);
  });
  return getServiceReport(id);
}

export function updateServiceReport(id, payload) {
  const sid = parseId(id);
  const existing = getServiceReport(sid);
  const data = servicePayload(payload, existing);
  run(
    `UPDATE service_reports SET service_date=?, customer_id=?, customer_name=?, company_name=?, contact_number=?, email=?, location=?,
      equipment=?, reported_problem=?, findings=?, work_performed=?, technician=?, start_time=?, end_time=?, materials=?, materials_cost=?,
      labor_cost=?, total_cost=?, status=?, recommendations=?, remarks=?, customer_ack=?, photos=?, prepared_by=?, updated_at=? WHERE id=?`,
    [
      data.serviceDate,
      data.customerId,
      data.customerName,
      data.companyName,
      data.contactNumber,
      data.email,
      data.location,
      data.equipment,
      data.reportedProblem,
      data.findings,
      data.workPerformed,
      data.technician,
      data.startTime,
      data.endTime,
      JSON.stringify(data.materials),
      data.materialsCost,
      data.laborCost,
      data.totalCost,
      data.status,
      data.recommendations,
      data.remarks,
      data.customerAck,
      JSON.stringify(data.photos),
      data.preparedBy,
      nowISO(),
      sid,
    ]
  );
  return getServiceReport(sid);
}

// ---------------------------------------------------------------------------
// Billing statements
// ---------------------------------------------------------------------------
const B_SELECT = `SELECT id, number, statement_date AS statementDate, period_from AS periodFrom, period_to AS periodTo,
  customer_id AS customerId, customer_name AS customerName, company_name AS companyName, contact_number AS contactNumber,
  email, address, previous_balance AS previousBalance, total_charges AS totalCharges, total_payments AS totalPayments,
  outstanding_balance AS outstandingBalance, payment_terms AS paymentTerms, remarks, prepared_by AS preparedBy,
  created_at AS createdAt, updated_at AS updatedAt FROM billing_statements`;

function statementItems(id) {
  return all(
    `SELECT id, txn_date AS txnDate, type, reference, description, charges, credits, balance
     FROM billing_statement_items WHERE statement_id = ? ORDER BY position ASC, id ASC`,
    [id]
  );
}

export function listStatements({ search = '', customerId = '', from = '', to = '', limit = 500 } = {}) {
  let sql = `${B_SELECT} WHERE 1=1`;
  const params = [];
  if (search) {
    sql += " AND (number LIKE ? ESCAPE '\\' OR customer_name LIKE ? ESCAPE '\\' OR company_name LIKE ? ESCAPE '\\')";
    const p = likeParam(search);
    params.push(p, p, p);
  }
  if (customerId) {
    sql += ' AND customer_id = ?';
    params.push(parseId(customerId));
  }
  if (from) {
    sql += ' AND period_from >= ?';
    params.push(dateOr(from));
  }
  if (to) {
    sql += ' AND period_to <= ?';
    params.push(dateOr(to));
  }
  sql += ' ORDER BY statement_date DESC, id DESC LIMIT 1000';
  return all(sql, params).slice(0, Math.min(Number(limit) || 500, 1000));
}

export function getStatement(id) {
  const row = get(`${B_SELECT} WHERE id = ?`, [parseId(id)]);
  if (!row) throw new HttpError(404, 'Billing statement not found.');
  return { ...row, items: statementItems(row.id) };
}

export function computeStatementPreview({ customerId, periodFrom, periodTo, previousBalance, statementDate }) {
  const cid = parseId(customerId);
  const customer = get('SELECT * FROM customers WHERE id = ?', [cid]);
  if (!customer) throw new HttpError(404, 'Customer not found.');
  const from = requiredDate(periodFrom, 'Billing period start');
  const to = requiredDate(periodTo, 'Billing period end');
  if (to < from) throw new HttpError(400, 'Billing period end cannot be before the start.');
  const sDate = dateOr(statementDate) || todayISO();
  const settings = getSettings();

  const beforeInvoices = get(
    'SELECT COALESCE(SUM(total),0) AS total FROM invoices WHERE customer_id = ? AND invoice_date < ?',
    [cid, from]
  ).total;
  const beforePayments = get(
    'SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE customer_id = ? AND payment_date < ?',
    [cid, from]
  ).total;
  const computedPrevious = round2(beforeInvoices - beforePayments);
  let prev = computedPrevious;
  if (previousBalance !== undefined && previousBalance !== null && previousBalance !== '') {
    prev = toMoney(previousBalance, 'Previous balance');
  }

  const invoices = all(
    `SELECT id, number, invoice_date, total, quotation_number FROM invoices
     WHERE customer_id = ? AND invoice_date >= ? AND invoice_date <= ? ORDER BY invoice_date ASC, id ASC`,
    [cid, from, to]
  );
  const payments = all(
    `SELECT id, reference, invoice_number, payment_date, amount, method FROM payments
     WHERE customer_id = ? AND payment_date >= ? AND payment_date <= ? ORDER BY payment_date ASC, id ASC`,
    [cid, from, to]
  );
  const txns = [
    ...invoices.map((inv) => ({
      sortKey: `${inv.invoice_date}|0|${String(inv.id).padStart(8, '0')}`,
      txnDate: inv.invoice_date,
      type: 'invoice',
      reference: inv.number,
      description: `Invoice ${inv.number}${inv.quotation_number ? ` — ref. quotation ${inv.quotation_number}` : ''}`,
      charges: round2(inv.total),
      credits: 0,
      sourceId: inv.id,
    })),
    ...payments.map((p) => ({
      sortKey: `${p.payment_date}|1|${String(p.id).padStart(8, '0')}`,
      txnDate: p.payment_date,
      type: 'payment',
      reference: p.reference,
      description: `Payment — Invoice ${p.invoice_number} (${p.method})`,
      charges: 0,
      credits: round2(p.amount),
      sourceId: p.id,
    })),
  ].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  let running = round2(prev);
  const items = txns.map((t, i) => {
    running = round2(running + t.charges - t.credits);
    return {
      position: i,
      txnDate: t.txnDate,
      type: t.type,
      reference: t.reference,
      description: t.description,
      charges: t.charges,
      credits: t.credits,
      balance: running,
    };
  });
  const totalCharges = round2(items.reduce((s, i) => s + i.charges, 0));
  const totalPayments = round2(items.reduce((s, i) => s + i.credits, 0));
  const outstanding = round2(prev + totalCharges - totalPayments);
  return {
    customerId: cid,
    customerName: customer.name,
    companyName: customer.company_name,
    contactNumber: customer.phone,
    email: customer.email,
    address: customer.billing_address,
    statementDate: sDate,
    periodFrom: from,
    periodTo: to,
    previousBalance: round2(prev),
    computedPreviousBalance: computedPrevious,
    totalCharges,
    totalPayments,
    outstandingBalance: outstanding,
    paymentTerms: settings.defaultPaymentTerms,
    remarks: '',
    preparedBy: settings.representative,
    items,
    existingStatements: listStatements({ customerId: cid }),
  };
}

export function createStatement(payload) {
  const preview = computeStatementPreview(payload);
  if (!preview.items.length && preview.previousBalance === 0) {
    throw new HttpError(400, 'No invoices or payments were found for this customer in the selected billing period.');
  }
  const settings = getSettings();
  const now = nowISO();
  const id = tx(() => {
    let number = docNumber(settings.statementPrefix, preview.statementDate);
    while (get('SELECT id FROM billing_statements WHERE number = ?', [number])) {
      number = docNumber(settings.statementPrefix, preview.statementDate);
    }
    const res = run(
      `INSERT INTO billing_statements (number, statement_date, period_from, period_to, customer_id, customer_name, company_name,
        contact_number, email, address, previous_balance, total_charges, total_payments, outstanding_balance, payment_terms, remarks,
        prepared_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        number,
        preview.statementDate,
        preview.periodFrom,
        preview.periodTo,
        preview.customerId,
        preview.customerName,
        preview.companyName,
        preview.contactNumber,
        preview.email,
        preview.address,
        preview.previousBalance,
        preview.totalCharges,
        preview.totalPayments,
        preview.outstandingBalance,
        multiline(payload.paymentTerms ?? preview.paymentTerms, 1000),
        multiline(payload.remarks ?? preview.remarks, 2000),
        str(payload.preparedBy ?? preview.preparedBy, 120),
        now,
        now,
      ]
    );
    const sid = Number(res.lastInsertRowid);
    for (const item of preview.items) {
      run(
        `INSERT INTO billing_statement_items (statement_id, position, txn_date, type, reference, description, charges, credits, balance)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [sid, item.position, item.txnDate, item.type, item.reference, item.description, item.charges, item.credits, item.balance]
      );
    }
    return sid;
  });
  return getStatement(id);
}

// ---------------------------------------------------------------------------
// Dashboard and reports
// ---------------------------------------------------------------------------
export function getDashboard() {
  const today = todayISO();
  const quotations = all(`${Q_SELECT} ORDER BY id DESC LIMIT 2000`).map(mapQuotation);
  const invoices = all(`${I_SELECT} ORDER BY id DESC LIMIT 2000`).map((r) => mapInvoice(r, today));
  const payments = all(`${P_SELECT} ORDER BY payment_date DESC, id DESC LIMIT 1000`);
  const services = all(`${S_SELECT} ORDER BY id DESC LIMIT 1000`).map(mapService);
  const statements = all(`${B_SELECT} ORDER BY id DESC LIMIT 1000`);
  const paymentTotals = get('SELECT COUNT(*) AS n, COALESCE(SUM(amount),0) AS total FROM payments');
  const statementCount = get('SELECT COUNT(*) AS n FROM billing_statements').n;
  const customerCount = get('SELECT COUNT(*) AS n FROM customers WHERE archived = 0').n;

  const q = {
    total: quotations.length,
    pending: 0,
    approved: 0,
    draft: 0,
    sent: 0,
    rejected: 0,
    expired: 0,
    value: 0,
    approvedValue: 0,
    pendingValue: 0,
  };
  for (const row of quotations) {
    q.value = round2(q.value + row.grandTotal);
    if (['draft', 'sent'].includes(row.effectiveStatus)) q.pendingValue = round2(q.pendingValue + row.grandTotal);
    if (row.effectiveStatus === 'approved') q.approvedValue = round2(q.approvedValue + row.grandTotal);
    if (row.effectiveStatus === 'draft') q.draft += 1;
    if (row.effectiveStatus === 'sent') q.sent += 1;
    if (row.effectiveStatus === 'approved') q.approved += 1;
    if (row.effectiveStatus === 'rejected') q.rejected += 1;
    if (row.effectiveStatus === 'expired') q.expired += 1;
  }
  q.pending = q.draft + q.sent;

  const inv = { total: invoices.length, unpaid: 0, partial: 0, overdue: 0, paid: 0, invoiced: 0, collected: 0, outstanding: 0 };
  for (const row of invoices) {
    inv[row.status] = (inv[row.status] || 0) + 1;
    inv.invoiced = round2(inv.invoiced + row.total);
    inv.collected = round2(inv.collected + row.amountPaid);
    inv.outstanding = round2(inv.outstanding + row.balance);
  }
  const svc = { total: services.length, scheduled: 0, in_progress: 0, completed: 0, cancelled: 0 };
  for (const row of services) svc[row.status] = (svc[row.status] || 0) + 1;

  const recent = [];
  for (const row of quotations.slice(0, 8)) {
    recent.push({
      kind: 'quotation',
      id: row.id,
      number: row.number,
      customer: row.customerName,
      date: row.issueDate,
      updatedAt: row.updatedAt,
      amount: row.grandTotal,
      status: row.effectiveStatus,
    });
  }
  for (const row of invoices.slice(0, 8)) {
    recent.push({
      kind: 'invoice',
      id: row.id,
      number: row.number,
      customer: row.customerName,
      date: row.invoiceDate,
      updatedAt: row.updatedAt,
      amount: row.total,
      status: row.status,
    });
  }
  for (const row of services.slice(0, 6)) {
    recent.push({
      kind: 'service',
      id: row.id,
      number: row.number,
      customer: row.customerName,
      date: row.serviceDate,
      updatedAt: row.updatedAt,
      amount: row.totalCost,
      status: row.status,
    });
  }
  for (const row of statements.slice(0, 5)) {
    recent.push({
      kind: 'statement',
      id: row.id,
      number: row.number,
      customer: row.customerName,
      date: row.statementDate,
      updatedAt: row.updatedAt,
      amount: row.outstandingBalance,
      status: 'statement',
    });
  }
  for (const row of payments.slice(0, 10)) {
    recent.push({
      kind: 'payment',
      id: row.id,
      number: row.reference,
      customer: row.customerName,
      date: row.paymentDate,
      updatedAt: row.createdAt,
      amount: row.amount,
      status: 'paid',
      invoiceNumber: row.invoiceNumber,
    });
  }
  recent.sort((a, b) => String(b.updatedAt || b.date).localeCompare(String(a.updatedAt || a.date)));

  const activityMap = new Map();
  for (const row of recent) {
    if (!activityMap.has(row.customer)) {
      activityMap.set(row.customer, {
        customer: row.customer,
        lastActivity: row.updatedAt || row.date,
        lastKind: row.kind,
        lastNumber: row.number,
        documents: 0,
        amount: 0,
      });
    }
    const entry = activityMap.get(row.customer);
    entry.documents += 1;
    entry.amount = round2(entry.amount + Number(row.amount || 0));
  }
  const customerActivity = [...activityMap.values()].slice(0, 6);

  return {
    today,
    quotations: q,
    invoices: inv,
    services: svc,
    statements: { total: statementCount },
    payments: { totalRecorded: paymentTotals.n, received: round2(paymentTotals.total) },
    customers: { total: customerCount },
    recentTransactions: recent.slice(0, 10),
    customerActivity,
  };
}

function rangeWhere(column, from, to, params) {
  let sql = '';
  if (from) {
    sql += ` AND ${column} >= ?`;
    params.push(from);
  }
  if (to) {
    sql += ` AND ${column} <= ?`;
    params.push(to);
  }
  return sql;
}

export function getReports({ from = '', to = '', customerId = '' } = {}) {
  const today = todayISO();
  const f = dateOr(from);
  const t = dateOr(to);
  if (f && t && t < f) throw new HttpError(400, 'End date cannot be before the start date.');
  const cid = customerId ? parseId(customerId) : null;

  const qParams = [];
  let qSql = `${Q_SELECT} WHERE 1=1`;
  if (cid) {
    qSql += ' AND customer_id = ?';
    qParams.push(cid);
  }
  qSql += rangeWhere('issue_date', f, t, qParams);
  qSql += ' ORDER BY issue_date ASC, id ASC';
  const quotations = all(qSql, qParams).map(mapQuotation);

  const iParams = [];
  let iSql = `${I_SELECT} WHERE 1=1`;
  if (cid) {
    iSql += ' AND customer_id = ?';
    iParams.push(cid);
  }
  iSql += rangeWhere('invoice_date', f, t, iParams);
  iSql += ' ORDER BY invoice_date ASC, id ASC';
  const periodInvoices = all(iSql, iParams).map((r) => mapInvoice(r, today));

  const allInvParams = [];
  let allInvSql = `${I_SELECT} WHERE 1=1`;
  if (cid) {
    allInvSql += ' AND customer_id = ?';
    allInvParams.push(cid);
  }
  if (t) {
    allInvSql += ' AND invoice_date <= ?';
    allInvParams.push(t);
  }
  const outstandingInvoices = all(allInvSql, allInvParams).map((r) => mapInvoice(r, today));

  const pParams = [];
  let pSql = `${P_SELECT} WHERE 1=1`;
  if (cid) {
    pSql += ' AND customer_id = ?';
    pParams.push(cid);
  }
  pSql += rangeWhere('payment_date', f, t, pParams);
  pSql += ' ORDER BY payment_date ASC, id ASC';
  const payments = all(pSql, pParams);

  const sParams = [];
  let sSql = `${S_SELECT} WHERE 1=1`;
  if (cid) {
    sSql += ' AND customer_id = ?';
    sParams.push(cid);
  }
  sSql += rangeWhere('service_date', f, t, sParams);
  sSql += ' ORDER BY service_date ASC, id ASC';
  const services = all(sSql, sParams).map(mapService);

  const qStatus = { draft: 0, sent: 0, approved: 0, rejected: 0, expired: 0 };
  let quotationValue = 0;
  let approvedValue = 0;
  for (const row of quotations) {
    qStatus[row.effectiveStatus] = (qStatus[row.effectiveStatus] || 0) + 1;
    quotationValue = round2(quotationValue + row.grandTotal);
    if (row.effectiveStatus === 'approved') approvedValue = round2(approvedValue + row.grandTotal);
  }
  const invStatus = { unpaid: 0, partial: 0, paid: 0, overdue: 0 };
  let invoiced = 0;
  let collectedOnPeriodInvoices = 0;
  for (const row of periodInvoices) {
    invStatus[row.status] = (invStatus[row.status] || 0) + 1;
    invoiced = round2(invoiced + row.total);
    collectedOnPeriodInvoices = round2(collectedOnPeriodInvoices + row.amountPaid);
  }
  const collected = round2(payments.reduce((s, p) => s + p.amount, 0));
  const outstanding = round2(outstandingInvoices.reduce((s, i) => s + i.balance, 0));
  const overdue = outstandingInvoices.filter((i) => i.status === 'overdue');
  const byMethod = {};
  for (const p of payments) byMethod[p.method] = round2((byMethod[p.method] || 0) + p.amount);

  const customerMap = new Map();
  const ensureCustomer = (id, name) => {
    const key = id ? String(id) : `name:${name}`;
    if (!customerMap.has(key)) {
      customerMap.set(key, {
        customerId: id,
        name,
        quotations: 0,
        quotationValue: 0,
        invoices: 0,
        invoiced: 0,
        paid: 0,
        outstanding: 0,
      });
    }
    return customerMap.get(key);
  };
  for (const q of quotations) {
    const c = ensureCustomer(q.customerId, q.customerName);
    c.quotations += 1;
    c.quotationValue = round2(c.quotationValue + q.grandTotal);
  }
  for (const i of outstandingInvoices) {
    const c = ensureCustomer(i.customerId, i.customerName);
    c.outstanding = round2(c.outstanding + i.balance);
  }
  for (const i of periodInvoices) {
    const c = ensureCustomer(i.customerId, i.customerName);
    c.invoices += 1;
    c.invoiced = round2(c.invoiced + i.total);
  }
  for (const p of payments) {
    const c = ensureCustomer(p.customerId, p.customerName);
    c.paid = round2(c.paid + p.amount);
  }

  const serviceStatus = { scheduled: 0, in_progress: 0, completed: 0, cancelled: 0 };
  let serviceCost = 0;
  for (const s of services) {
    serviceStatus[s.status] = (serviceStatus[s.status] || 0) + 1;
    serviceCost = round2(serviceCost + s.totalCost);
  }

  // Monthly breakdown within range (or the last 6 months when no range given).
  const monthly = new Map();
  const monthKey = (date) => String(date).slice(0, 7);
  for (const i of periodInvoices) {
    const k = monthKey(i.invoiceDate);
    if (!monthly.has(k)) monthly.set(k, { month: k, invoiced: 0, collected: 0 });
    monthly.get(k).invoiced = round2(monthly.get(k).invoiced + i.total);
  }
  for (const p of payments) {
    const k = monthKey(p.paymentDate);
    if (!monthly.has(k)) monthly.set(k, { month: k, invoiced: 0, collected: 0 });
    monthly.get(k).collected = round2(monthly.get(k).collected + p.amount);
  }
  const monthlyRows = [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month));

  return {
    range: { from: f, to: t },
    customerId: cid,
    quotations: {
      count: quotations.length,
      value: quotationValue,
      approvedValue,
      byStatus: qStatus,
      list: quotations.map((q) => ({ ...q })),
    },
    invoices: {
      count: periodInvoices.length,
      invoiced,
      collected,
      outstanding,
      byStatus: invStatus,
      list: periodInvoices,
      overdue: overdue.map((i) => ({
        id: i.id,
        number: i.number,
        customer: i.customerName,
        invoiceDate: i.invoiceDate,
        dueDate: i.dueDate,
        total: i.total,
        balance: i.balance,
      })),
    },
    payments: {
      count: payments.length,
      total: collected,
      byMethod,
      list: payments,
    },
    services: { count: services.length, cost: serviceCost, byStatus: serviceStatus, list: services },
    customers: [...customerMap.values()].sort((a, b) => b.invoiced - a.invoiced),
    monthly: monthlyRows,
    collectedOnPeriodInvoices,
  };
}

export function exportReportCsv(query) {
  const report = getReports(query);
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [];
  const line = (...cells) => rows.push(cells.map(esc).join(','));
  const rangeText = `${report.range.from || 'All dates'} to ${report.range.to || 'All dates'}`;
  line('JOHNROIS BUSINESS REPORT');
  line('Period', rangeText);
  line('');
  line('QUOTATIONS BY STATUS');
  line('Status', 'Count', 'Value (PHP)');
  const qValues = {};
  for (const q of report.quotations.list) qValues[q.effectiveStatus] = round2((qValues[q.effectiveStatus] || 0) + q.grandTotal);
  for (const [status, count] of Object.entries(report.quotations.byStatus)) line(status, count, qValues[status] || 0);
  line('Total', report.quotations.count, report.quotations.value);
  line('');
  line('INVOICES BY STATUS (period)');
  line('Status', 'Count');
  for (const [status, count] of Object.entries(report.invoices.byStatus)) line(status, count);
  line('');
  line('BILLING SUMMARY');
  line('Invoiced (period)', report.invoices.invoiced);
  line('Payments received (period)', report.payments.total);
  line('Outstanding balance (as of period end)', report.invoices.outstanding);
  line('');
  line('PAYMENTS BY METHOD');
  line('Method', 'Amount (PHP)');
  for (const [method, amount] of Object.entries(report.payments.byMethod)) line(method, amount);
  line('Total', report.payments.total);
  line('');
  line('SERVICE REPORTS');
  line('Status', 'Count');
  for (const [status, count] of Object.entries(report.services.byStatus)) line(status, count);
  line('');
  line('INVOICE DETAIL');
  line('Invoice No.', 'Date', 'Customer', 'Status', 'Total', 'Paid', 'Balance', 'Due date');
  for (const i of report.invoices.list) line(i.number, i.invoiceDate, i.customerName, i.status, i.total, i.amountPaid, i.balance, i.dueDate);
  line('');
  line('PAYMENT DETAIL');
  line('Reference', 'Date', 'Customer', 'Invoice', 'Method', 'Amount', 'Details');
  for (const p of report.payments.list) line(p.reference, p.paymentDate, p.customerName, p.invoiceNumber, p.method, p.amount, p.details);
  line('');
  line('OUTSTANDING / OVERDUE INVOICES');
  line('Invoice No.', 'Customer', 'Due date', 'Total', 'Balance');
  for (const i of report.invoices.list.filter((i) => i.balance > 0)) {
    line(i.number, i.customerName, i.dueDate, i.total, i.balance);
  }
  line('');
  line('CUSTOMER TRANSACTION SUMMARY');
  line('Customer', 'Quotations', 'Invoices', 'Invoiced', 'Paid', 'Outstanding');
  for (const c of report.customers) line(c.name, c.quotations, c.invoices, c.invoiced, c.paid, c.outstanding);
  return rows.join('\n');
}

export function exportAllJson() {
  const tables = [
    'settings',
    'customers',
    'products',
    'quotations',
    'quotation_items',
    'invoices',
    'invoice_items',
    'payments',
    'service_reports',
    'billing_statements',
    'billing_statement_items',
    'counters',
  ];
  const data = {};
  for (const table of tables) data[table] = all(`SELECT * FROM ${table}`);
  return { exportedAt: nowISO(), application: 'Johnrois Business Manager', data };
}
