// Johnrois Stainless Steel Fabrication Shop — business management server.
// No authentication by design: a single-shop, directly accessible management app.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError, todayISO, sanitizeFileName } from './util.js';
import { addDays } from '../public/js/calc.js';
import { dbInfo, checkpoint } from './db.js';
import * as store from './store.js';
import {
  renderQuotationPDF,
  renderInvoicePDF,
  renderServiceReportPDF,
  renderBillingStatementPDF,
} from './documents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_BODY = 12 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  // The app embeds its own same-origin PDFs in iframes; framing is left open so
  // hosting previews can display the site (no visitor data is exposed by framing).
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:; frame-src 'self' blob:; object-src 'self'",
};

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendPdf(res, buffer, filename, download = false) {
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/pdf',
    'Content-Length': buffer.length,
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
    'Cache-Control': 'no-store',
  });
  res.end(buffer);
}

function sendFile(res, filePath, { download = false, filename = '' } = {}) {
  const ext = path.extname(filePath).toLowerCase();
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=300',
    ...(download
      ? { 'Content-Disposition': `attachment; filename="${sanitizeFileName(filename || path.basename(filePath))}"` }
      : {}),
  });
  fs.createReadStream(filePath).pipe(res);
}

function readJson(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'The uploaded data is too large. Please use a smaller image.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'Invalid JSON request body.'));
      }
    });
    req.on('error', reject);
  });
}

const idMatch = (pathname, base) => {
  const m = new RegExp(`^${base}/(\\d+)$`).exec(pathname);
  return m ? Number(m[1]) : null;
};

function requiredId(req, res, base, suffix = '') {
  const m = new RegExp(`^${base}/(\\d+)${suffix}$`).exec(reqUrl(req).pathname);
  if (!m) return null;
  return Number(m[1]);
}

const reqUrl = (req) => new URL(req.url, `http://${req.headers.host || 'localhost'}`);
const q = (url, key, fallback = '') => url.searchParams.get(key) ?? fallback;
const bool = (url, key) => ['1', 'true', 'yes'].includes(String(url.searchParams.get(key) || '').toLowerCase());
const downloadFlag = (url) => bool(url, 'download');

function pdfFilename(number, label) {
  return `${sanitizeFileName(`${label}_${number}`)}.pdf`;
}

function previewDocumentPdf() {
  const settings = store.getSettings();
  const today = todayISO();
  const sampleItems = [
    { description: 'Sample line item — stainless steel fabrication work', quantity: 1, unit: 'lot', unitPrice: 15000, lineTotal: 15000 },
    { description: 'Sample line item — installation and finishing', quantity: 2, unit: 'pc', unitPrice: 2500, lineTotal: 5000 },
  ];
  const subtotal = 20000;
  const taxAmount = settings.taxEnabled ? Math.round(subtotal * settings.taxRate) / 100 : 0;
  const doc = {
    number: 'SAMPLE-PREVIEW',
    issueDate: today,
    validUntil: addDays(today, 30),
    customerName: 'Sample Customer (preview only)',
    companyName: 'Sample Company',
    contactNumber: '000 000 0000',
    email: 'sample@example.com',
    address: 'Sample address — this preview is not a saved record.',
    projectName: 'Document layout preview',
    projectLocation: '—',
    subtotal,
    discountType: 'amount',
    discountValue: 0,
    discountAmount: 0,
    taxRate: settings.taxEnabled ? settings.taxRate : 0,
    taxAmount,
    grandTotal: Math.round((subtotal + taxAmount) * 100) / 100,
    paymentTerms: settings.defaultPaymentTerms,
    deliverySchedule: '',
    remarks: 'This is a live preview of your document design. It is not saved and does not appear in any report.',
    preparedBy: settings.representative,
    status: 'draft',
    effectiveStatus: 'draft',
  };
  return renderQuotationPDF({ settings, quotation: doc, items: sampleItems });
}

async function handleApi(req, res, url) {
  const { pathname } = url;
  const method = req.method;

  if (method === 'GET' && pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, date: todayISO(), storage: 'sqlite' });
  }

  if (method === 'GET' && pathname === '/api/bootstrap') {
    return sendJson(res, 200, {
      settings: store.getSettings(),
      today: todayISO(),
      paymentMethods: store.getSettings().paymentMethods,
      customers: store.listCustomers(),
      products: store.listProducts(),
    });
  }

  // Settings -----------------------------------------------------------------
  if (pathname === '/api/settings') {
    if (method === 'GET') return sendJson(res, 200, store.getSettings());
    if (method === 'PUT') return sendJson(res, 200, store.updateSettings(await readJson(req)));
  }
  if ((method === 'GET' || method === 'POST') && pathname === '/api/settings/preview-pdf') {
    return sendPdf(res, previewDocumentPdf(), 'document_preview.pdf', downloadFlag(url));
  }

  // Dashboard ----------------------------------------------------------------
  if (method === 'GET' && pathname === '/api/dashboard') {
    return sendJson(res, 200, store.getDashboard());
  }

  // Customers ----------------------------------------------------------------
  if (pathname === '/api/customers') {
    if (method === 'GET') {
      return sendJson(
        res,
        200,
        store.listCustomers({ search: q(url, 'search'), includeArchived: bool(url, 'archived') })
      );
    }
    if (method === 'POST') return sendJson(res, 201, store.createCustomer(await readJson(req)));
  }
  let id = idMatch(pathname, '/api/customers');
  if (id) {
    if (method === 'GET') return sendJson(res, 200, store.getCustomer(id));
    if (method === 'PUT') return sendJson(res, 200, store.updateCustomer(id, await readJson(req)));
  }
  id = requiredId(req, res, '/api/customers', '/archive');
  if (id && method === 'POST') return sendJson(res, 200, store.setCustomerArchived(id, true));
  id = requiredId(req, res, '/api/customers', '/restore');
  if (id && method === 'POST') return sendJson(res, 200, store.setCustomerArchived(id, false));

  // Products -----------------------------------------------------------------
  if (pathname === '/api/products') {
    if (method === 'GET') {
      return sendJson(
        res,
        200,
        store.listProducts({
          search: q(url, 'search'),
          includeArchived: bool(url, 'archived'),
          category: q(url, 'category'),
        })
      );
    }
    if (method === 'POST') return sendJson(res, 201, store.createProduct(await readJson(req)));
  }
  id = idMatch(pathname, '/api/products');
  if (id) {
    if (method === 'GET') return sendJson(res, 200, store.getProduct(id));
    if (method === 'PUT') return sendJson(res, 200, store.updateProduct(id, await readJson(req)));
  }
  id = requiredId(req, res, '/api/products', '/archive');
  if (id && method === 'POST') return sendJson(res, 200, store.setProductArchived(id, true));
  id = requiredId(req, res, '/api/products', '/restore');
  if (id && method === 'POST') return sendJson(res, 200, store.setProductArchived(id, false));

  // Quotations ---------------------------------------------------------------
  if (pathname === '/api/quotations') {
    if (method === 'GET') {
      return sendJson(
        res,
        200,
        store.listQuotations({
          search: q(url, 'search'),
          status: q(url, 'status'),
          customerId: q(url, 'customerId'),
          from: q(url, 'from'),
          to: q(url, 'to'),
        })
      );
    }
    if (method === 'POST') return sendJson(res, 201, store.createQuotation(await readJson(req)));
  }
  id = idMatch(pathname, '/api/quotations');
  if (id) {
    if (method === 'GET') return sendJson(res, 200, store.getQuotation(id));
    if (method === 'PUT') return sendJson(res, 200, store.updateQuotation(id, await readJson(req)));
    if (method === 'DELETE') throw new HttpError(405, 'Quotations are kept for audit history and cannot be deleted.');
  }
  id = requiredId(req, res, '/api/quotations', '/duplicate');
  if (id && method === 'POST') return sendJson(res, 201, store.duplicateQuotation(id));
  id = requiredId(req, res, '/api/quotations', '/status');
  if (id && method === 'POST') {
    const body = await readJson(req);
    return sendJson(res, 200, store.setQuotationStatus(id, body.status));
  }
  id = requiredId(req, res, '/api/quotations', '/convert');
  if (id && method === 'POST') return sendJson(res, 201, store.convertQuotation(id));
  id = requiredId(req, res, '/api/quotations', '/pdf');
  if (id && method === 'GET') {
    const quotation = store.getQuotation(id);
    const buffer = renderQuotationPDF({ settings: store.getSettings(), quotation, items: quotation.items });
    return sendPdf(res, buffer, pdfFilename(quotation.number, 'Quotation'), downloadFlag(url));
  }

  // Invoices -----------------------------------------------------------------
  if (pathname === '/api/invoices') {
    if (method === 'GET') {
      return sendJson(
        res,
        200,
        store.listInvoices({
          search: q(url, 'search'),
          status: q(url, 'status'),
          customerId: q(url, 'customerId'),
          from: q(url, 'from'),
          to: q(url, 'to'),
        })
      );
    }
    if (method === 'POST') return sendJson(res, 201, store.createInvoice(await readJson(req)));
  }
  id = idMatch(pathname, '/api/invoices');
  if (id) {
    if (method === 'GET') return sendJson(res, 200, store.getInvoice(id));
    if (method === 'PUT') return sendJson(res, 200, store.updateInvoice(id, await readJson(req)));
  }
  id = requiredId(req, res, '/api/invoices', '/pdf');
  if (id && method === 'GET') {
    const invoice = store.getInvoice(id);
    const buffer = renderInvoicePDF({
      settings: store.getSettings(),
      invoice,
      items: invoice.items,
      payments: invoice.payments,
    });
    return sendPdf(res, buffer, pdfFilename(invoice.number, 'Invoice'), downloadFlag(url));
  }
  id = requiredId(req, res, '/api/invoices', '/payments');
  if (id && method === 'POST') {
    const body = await readJson(req);
    return sendJson(res, 201, store.createPayment({ ...body, invoiceId: id }));
  }

  // Service reports ----------------------------------------------------------
  if (pathname === '/api/service-reports') {
    if (method === 'GET') {
      return sendJson(
        res,
        200,
        store.listServiceReports({
          search: q(url, 'search'),
          status: q(url, 'status'),
          customerId: q(url, 'customerId'),
          from: q(url, 'from'),
          to: q(url, 'to'),
        })
      );
    }
    if (method === 'POST') return sendJson(res, 201, store.createServiceReport(await readJson(req)));
  }
  id = idMatch(pathname, '/api/service-reports');
  if (id) {
    if (method === 'GET') return sendJson(res, 200, store.getServiceReport(id));
    if (method === 'PUT') return sendJson(res, 200, store.updateServiceReport(id, await readJson(req)));
  }
  id = requiredId(req, res, '/api/service-reports', '/pdf');
  if (id && method === 'GET') {
    const report = store.getServiceReport(id);
    const buffer = renderServiceReportPDF({ settings: store.getSettings(), report });
    return sendPdf(res, buffer, pdfFilename(report.number, 'Service_Report'), downloadFlag(url));
  }

  // Billing statements -------------------------------------------------------
  if (pathname === '/api/billing-statements/preview' && method === 'GET') {
    return sendJson(
      res,
      200,
      store.computeStatementPreview({
        customerId: q(url, 'customerId'),
        periodFrom: q(url, 'from'),
        periodTo: q(url, 'to'),
        statementDate: q(url, 'date'),
        previousBalance: q(url, 'previousBalance'),
      })
    );
  }
  if (pathname === '/api/billing-statements') {
    if (method === 'GET') {
      return sendJson(
        res,
        200,
        store.listStatements({
          search: q(url, 'search'),
          customerId: q(url, 'customerId'),
          from: q(url, 'from'),
          to: q(url, 'to'),
        })
      );
    }
    if (method === 'POST') return sendJson(res, 201, store.createStatement(await readJson(req)));
  }
  id = idMatch(pathname, '/api/billing-statements');
  if (id && method === 'GET') return sendJson(res, 200, store.getStatement(id));
  id = requiredId(req, res, '/api/billing-statements', '/pdf');
  if (id && method === 'GET') {
    const statement = store.getStatement(id);
    const buffer = renderBillingStatementPDF({
      settings: store.getSettings(),
      statement,
      items: statement.items,
    });
    return sendPdf(res, buffer, pdfFilename(statement.number, 'Billing_Statement'), downloadFlag(url));
  }

  // Payments -----------------------------------------------------------------
  if (pathname === '/api/payments') {
    if (method === 'GET') {
      return sendJson(
        res,
        200,
        store.listPayments({
          search: q(url, 'search'),
          customerId: q(url, 'customerId'),
          invoiceId: q(url, 'invoiceId'),
          method: q(url, 'method'),
          from: q(url, 'from'),
          to: q(url, 'to'),
        })
      );
    }
    if (method === 'POST') return sendJson(res, 201, store.createPayment(await readJson(req)));
  }
  id = idMatch(pathname, '/api/payments');
  if (id) {
    if (method === 'PUT') return sendJson(res, 200, store.updatePayment(id, await readJson(req)));
    if (method === 'DELETE') return sendJson(res, 200, store.deletePayment(id));
  }

  // Reports & backups --------------------------------------------------------
  if (method === 'GET' && pathname === '/api/reports') {
    return sendJson(
      res,
      200,
      store.getReports({ from: q(url, 'from'), to: q(url, 'to'), customerId: q(url, 'customerId') })
    );
  }
  if (method === 'GET' && pathname === '/api/reports/export.csv') {
    const csv = store.exportReportCsv({ from: q(url, 'from'), to: q(url, 'to'), customerId: q(url, 'customerId') });
    const body = Buffer.from(`\uFEFF${csv}`, 'utf8');
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Length': body.length,
      'Content-Disposition': `attachment; filename="johnrois_report_${q(url, 'from') || 'all'}_${q(url, 'to') || 'all'}.csv"`,
      'Cache-Control': 'no-store',
    });
    return res.end(body);
  }
  if (method === 'GET' && pathname === '/api/backup/json') {
    const data = Buffer.from(JSON.stringify(store.exportAllJson(), null, 2));
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': 'application/json',
      'Content-Length': data.length,
      'Content-Disposition': `attachment; filename="johnrois_backup_${todayISO()}.json"`,
      'Cache-Control': 'no-store',
    });
    return res.end(data);
  }
  if (method === 'GET' && pathname === '/api/backup/database') {
    checkpoint();
    return sendFile(res, dbInfo.path, {
      download: true,
      filename: `johnrois_database_${todayISO()}.db`,
    });
  }

  throw new HttpError(404, 'API endpoint not found.');
}

function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    throw new HttpError(400, 'Invalid URL.');
  }
  if (pathname === '/') pathname = '/index.html';
  const target = path.resolve(PUBLIC_DIR, `.${pathname}`);
  if (!target.startsWith(PUBLIC_DIR + path.sep) && target !== PUBLIC_DIR) {
    throw new HttpError(403, 'Forbidden.');
  }
  if (fs.existsSync(target) && fs.statSync(target).isFile()) {
    return sendFile(res, target);
  }
  // Single-page application fallback (deep links such as /invoices/12).
  if (req.method === 'GET' && !path.extname(pathname)) {
    return sendFile(res, path.join(PUBLIC_DIR, 'index.html'));
  }
  throw new HttpError(404, 'Not found.');
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const url = reqUrl(req);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else if (req.method === 'GET' || req.method === 'HEAD') {
      serveStatic(req, res, url);
    } else {
      throw new HttpError(405, 'Method not allowed.');
    }
  } catch (err) {
    if (res.headersSent) {
      res.end();
      return;
    }
    if (err instanceof HttpError) {
      sendJson(res, err.status, { error: err.message, details: err.details || null });
    } else {
      console.error('[error]', err);
      sendJson(res, 500, { error: 'Something went wrong while processing the request. Please try again.' });
    }
  } finally {
    if (process.env.NODE_ENV === 'development' && url.pathname.startsWith('/api/')) {
      console.log(`${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - started}ms`);
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Johnrois Business Manager running on http://${HOST}:${PORT}`);
  console.log(`Database: ${dbInfo.path}`);
});
