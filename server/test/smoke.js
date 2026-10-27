// End-to-end smoke test against a running server (default http://localhost:3000).
// Usage: BASE=http://localhost:3000 node server/test/smoke.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE || 'http://localhost:3000';
let failures = 0;
let checks = 0;

function check(name, condition, extra = '') {
  checks += 1;
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

async function req(method, endpoint, body) {
  const res = await fetch(`${BASE}${endpoint}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') || '';
  const payload = type.includes('json') ? await res.json() : await res.arrayBuffer();
  return { status: res.status, payload, headers: res.headers };
}


async function makePng(width, height) {
  const zlib = await import('node:zlib');
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const p = row + 1 + x * 3;
      const red = y > height * 0.78;
      raw[p] = red ? 157 : 32;
      raw[p + 1] = red ? 34 : 35;
      raw[p + 2] = red ? 53 : 40;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
    let crc = 0xffffffff;
    for (const b of Buffer.concat([typeBuf, data])) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

const run = async () => {
  console.log(`Johnrois smoke test against ${BASE}`);

  console.log('\n1. App shell (no authentication)');
  let res = await fetch(`${BASE}/`);
  check('index.html loads without redirect', res.status === 200);
  check('no login form in HTML', !/type="password"|Sign in|Log in/i.test(await res.text()));
  res = await fetch(`${BASE}/#/invoices/99999`, { redirect: 'manual' });
  check('deep link serves the app shell', res.status === 200);
  const health = await req('GET', '/api/health');
  check('health endpoint responds', health.status === 200 && health.payload.ok === true);

  console.log('\n2. Customers & products');
  const customer = await req('POST', '/api/customers', {
    name: 'Smoke Test Customer',
    companyName: 'Smoke Test Eatery',
    phone: '0917 555 0000',
    email: 'smoke@example.com',
    billingAddress: '12 Test Street, Davao City',
    projectLocations: 'Matina, Davao City\nBajada, Davao City',
  });
  check('customer created', customer.status === 201 && customer.payload.code.startsWith('CUS-'), JSON.stringify(customer.payload));
  const product = await req('POST', '/api/products', {
    name: 'Smoke Test Stainless Counter',
    description: '304 stainless steel counter with undershelf',
    category: 'Kitchen Equipment',
    unit: 'unit',
    defaultPrice: 12500,
  });
  check('product created', product.status === 201 && product.payload.defaultPrice === 12500);
  const badCustomer = await req('POST', '/api/customers', { name: '' });
  check('validation rejects empty customer name', badCustomer.status === 400 && /required/i.test(badCustomer.payload.error));

  console.log('\n3. Quotations');
  const quotationPayload = {
    customerId: customer.payload.id,
    customerName: customer.payload.name,
    companyName: customer.payload.companyName,
    contactNumber: customer.payload.phone,
    email: customer.payload.email,
    address: customer.payload.billingAddress,
    issueDate: '2026-10-01',
    validUntil: '2026-10-31',
    projectName: 'Smoke Test Kitchen',
    projectLocation: 'Matina, Davao City',
    discountType: 'percent',
    discountValue: 10,
    taxRate: 12,
    paymentTerms: '50% downpayment, balance on delivery',
    deliverySchedule: '21 working days',
    remarks: 'Testing quotation calculations.',
    preparedBy: 'Smoke Tester',
    status: 'draft',
    items: [
      { productId: product.payload.id, description: product.payload.description, quantity: 2, unit: 'units', unitPrice: 12500 },
      { description: 'Stainless wall shelf', quantity: 3, unit: 'pcs', unitPrice: 1200.5 },
    ],
  };
  const quotation = await req('POST', '/api/quotations', quotationPayload);
  check('quotation created', quotation.status === 201 && /^QTN-\d{4}-\d{4}$/.test(quotation.payload.number), JSON.stringify(quotation.payload).slice(0, 200));
  const expectedSubtotal = 2 * 12500 + 3 * 1200.5;
  const expectedDiscount = Math.round(expectedSubtotal * 0.1 * 100) / 100;
  const expectedTax = Math.round((expectedSubtotal - expectedDiscount) * 0.12 * 100) / 100;
  const expectedTotal = Math.round((expectedSubtotal - expectedDiscount + expectedTax) * 100) / 100;
  check('quotation subtotal correct', quotation.payload.subtotal === expectedSubtotal, `${quotation.payload.subtotal} vs ${expectedSubtotal}`);
  check('quotation discount correct', quotation.payload.discountAmount === expectedDiscount);
  check('quotation tax correct', quotation.payload.taxAmount === expectedTax);
  check('quotation grand total correct', quotation.payload.grandTotal === expectedTotal, `${quotation.payload.grandTotal} vs ${expectedTotal}`);

  const edited = await req('PUT', `/api/quotations/${quotation.payload.id}`, {
    ...quotationPayload,
    items: [{ description: 'Single edited line', quantity: 1, unit: 'lot', unitPrice: 1000 }],
    discountValue: 0,
    taxRate: 0,
  });
  check('quotation edits save', edited.status === 200 && edited.payload.grandTotal === 1000);
  const invalidItem = await req('PUT', `/api/quotations/${quotation.payload.id}`, {
    ...quotationPayload,
    items: [{ description: '', quantity: 1, unitPrice: 5 }],
  });
  check('empty line description rejected', invalidItem.status === 400);

  const dup = await req('POST', `/api/quotations/${quotation.payload.id}/duplicate`);
  check('quotation duplicated', dup.status === 201 && dup.payload.id !== quotation.payload.id && dup.payload.status === 'draft');

  // Duplicate-number protection under concurrency.
  const parallel = await Promise.all(
    Array.from({ length: 5 }, () => req('POST', '/api/quotations', { ...quotationPayload, status: 'sent' }))
  );
  const numbers = parallel.map((r) => r.payload.number);
  check('concurrent quotations all saved', parallel.every((r) => r.status === 201));
  check('no duplicate quotation numbers', new Set(numbers).size === numbers.length, numbers.join(', '));

  const approved = await req('POST', `/api/quotations/${quotation.payload.id}/status`, { status: 'approved' });
  check('quotation approved', approved.status === 200 && approved.payload.status === 'approved');
  const quotationPdf = await fetch(`${BASE}/api/quotations/${quotation.payload.id}/pdf`);
  const qpdfBuf = Buffer.from(await quotationPdf.arrayBuffer());
  check('quotation PDF served', quotationPdf.status === 200 && quotationPdf.headers.get('content-type') === 'application/pdf');
  check('quotation PDF has valid header', qpdfBuf.subarray(0, 5).toString() === '%PDF-');
  fs.writeFileSync(path.join(os.tmpdir(), 'jrsfs-quotation.pdf'), qpdfBuf);

  console.log('\n4. Conversion to invoice');
  const conversion = await req('POST', `/api/quotations/${quotation.payload.id}/convert`);
  check('approved quotation converts', conversion.status === 201 && conversion.payload.invoice.id > 0, JSON.stringify(conversion.payload).slice(0, 200));
  const invoice = conversion.payload.invoice;
  check('invoice carries quotation items', invoice.items.length === 1 && invoice.items[0].lineTotal === 1000);
  check('invoice carries customer info', invoice.customerName === customer.payload.name && invoice.address === customer.payload.billingAddress);
  check('invoice links quotation', invoice.quotationNumber === quotation.payload.number);
  const twice = await req('POST', `/api/quotations/${quotation.payload.id}/convert`);
  check('double conversion blocked', twice.status === 409);
  const editLocked = await req('PUT', `/api/quotations/${quotation.payload.id}`, quotationPayload);
  check('invoiced quotation is locked', editLocked.status === 409);
  const unapproved = await req('POST', `/api/quotations/${dup.payload.id}/convert`);
  check('draft quotation cannot be invoiced', unapproved.status === 409);

  console.log('\n5. Payments & balances');
  const partial = await req('POST', `/api/invoices/${invoice.id}/payments`, {
    amount: 400,
    paymentDate: '2026-10-05',
    method: 'Cash',
    details: 'Partial downpayment',
  });
  check('partial payment recorded', partial.status === 201, JSON.stringify(partial.payload).slice(0, 200));
  check('balance recalculated', partial.payload.invoice.balance === 600 && partial.payload.invoice.amountPaid === 400);
  check('status becomes partial', partial.payload.invoice.status === 'partial');
  const overpay = await req('POST', `/api/invoices/${invoice.id}/payments`, { amount: 5000, paymentDate: '2026-10-05', method: 'Cash' });
  check('overpayment rejected', overpay.status === 400);
  const duplicateReference = await req('POST', `/api/invoices/${invoice.id}/payments`, {
    amount: 100,
    paymentDate: '2026-10-06',
    method: 'Cash',
    reference: partial.payload.payment.reference,
  });
  check('duplicate payment reference rejected', duplicateReference.status === 409);
  const settle = await req('POST', `/api/invoices/${invoice.id}/payments`, { amount: 600, paymentDate: '2026-10-07', method: 'Bank Transfer' });
  check('remaining balance can be settled', settle.status === 201 && settle.payload.invoice.balance === 0 && settle.payload.invoice.status === 'paid');
  const invoicePdf = await fetch(`${BASE}/api/invoices/${invoice.id}/pdf`);
  const ipdf = Buffer.from(await invoicePdf.arrayBuffer());
  check('invoice PDF served', invoicePdf.status === 200 && ipdf.subarray(0, 5).toString() === '%PDF-');
  fs.writeFileSync(path.join(os.tmpdir(), 'jrsfs-invoice.pdf'), ipdf);
  const editBelowPaid = await req('PUT', `/api/invoices/${invoice.id}`, {
    customerName: customer.payload.name,
    invoiceDate: '2026-10-01',
    items: [{ description: 'Too small', quantity: 1, unitPrice: 10 }],
  });
  check('invoice total cannot drop below payments', editBelowPaid.status === 400);

  console.log('\n6. Service reports');
  const logo = await makePng(240, 80);
  const photo = await makePng(320, 200);
  const service = await req('POST', '/api/service-reports', {
    customerId: customer.payload.id,
    customerName: customer.payload.name,
    contactNumber: customer.payload.phone,
    serviceDate: '2026-10-08',
    location: 'Matina, Davao City',
    equipment: 'Stainless exhaust hood',
    reportedProblem: 'Vibration at high fan speed',
    findings: 'Two anchor bolts loose',
    workPerformed: 'Re-anchored hood, replaced bolts',
    technician: 'A. Technician',
    startTime: '08:30',
    endTime: '10:15',
    status: 'completed',
    materials: [{ description: 'Stainless anchor bolt M10', quantity: 6, unit: 'pcs', unitCost: 55 }],
    laborCost: 900,
    photos: [photo],
    customerAck: 'Smoke Test Customer',
    preparedBy: 'Smoke Tester',
  });
  check('service report created', service.status === 201 && /^SR-\d{4}-\d{4}$/.test(service.payload.number));
  check('service costs computed', service.payload.materialsCost === 330 && service.payload.totalCost === 1230);
  check('service photo stored', service.payload.photos.length === 1);
  const servicePdf = await fetch(`${BASE}/api/service-reports/${service.payload.id}/pdf`);
  const spdf = Buffer.from(await servicePdf.arrayBuffer());
  check('service report PDF served', servicePdf.status === 200 && spdf.subarray(0, 5).toString() === '%PDF-');
  fs.writeFileSync(path.join(os.tmpdir(), 'jrsfs-service.pdf'), spdf);
  const badPhoto = await req('POST', '/api/service-reports', { customerName: 'X', serviceDate: '2026-10-08', photos: ['javascript:alert(1)'] });
  check('non-image photo rejected', badPhoto.status === 400);

  console.log('\n7. Billing statements');
  const preview = await req(
    'GET',
    `/api/billing-statements/preview?customerId=${customer.payload.id}&from=2026-10-01&to=2026-10-31&date=2026-10-31`
  );
  check('statement preview built', preview.status === 200 && Array.isArray(preview.payload.items), JSON.stringify(preview.payload).slice(0, 200));
  check('preview has charges and payments', preview.payload.totalCharges === 1000 && preview.payload.totalPayments === 1000);
  check('preview outstanding is zero after full payment', preview.payload.outstandingBalance === 0);
  const statement = await req('POST', '/api/billing-statements', {
    customerId: customer.payload.id,
    periodFrom: '2026-10-01',
    periodTo: '2026-10-31',
    statementDate: '2026-10-31',
    preparedBy: 'Smoke Tester',
  });
  check('statement saved', statement.status === 201 && /^BS-\d{4}-\d{4}$/.test(statement.payload.number), JSON.stringify(statement.payload).slice(0, 200));
  let ledger = statement.payload.previousBalance;
  const ledgerOk = statement.payload.items.every((item) => {
    ledger = Math.round((ledger + item.charges - item.credits) * 100) / 100;
    return item.balance === ledger;
  });
  check(
    'running balances follow the ledger',
    ledgerOk &&
      statement.payload.items[statement.payload.items.length - 1].balance ===
        Math.round((statement.payload.previousBalance + statement.payload.totalCharges - statement.payload.totalPayments) * 100) / 100
  );
  const statementPdf = await fetch(`${BASE}/api/billing-statements/${statement.payload.id}/pdf`);
  const bpdf = Buffer.from(await statementPdf.arrayBuffer());
  check('statement PDF served', statementPdf.status === 200 && bpdf.subarray(0, 5).toString() === '%PDF-');
  fs.writeFileSync(path.join(os.tmpdir(), 'jrsfs-statement.pdf'), bpdf);
  const emptyStatement = await req('POST', '/api/billing-statements', {
    customerId: customer.payload.id,
    periodFrom: '2020-01-01',
    periodTo: '2020-01-31',
  });
  check('statement without transactions rejected', emptyStatement.status === 400);

  console.log('\n8. Dashboard, reports & exports');
  const dashboard = await req('GET', '/api/dashboard');
  check('dashboard totals present', dashboard.status === 200 && dashboard.payload.quotations.total >= 6);
  check('dashboard outstanding matches invoices', dashboard.payload.invoices.outstanding === 0);
  check('dashboard recent transactions exist', dashboard.payload.recentTransactions.length > 0);
  const reports = await req('GET', '/api/reports?from=2026-10-01&to=2026-10-31');
  check('report builds', reports.status === 200 && reports.payload.invoices.count === 1);
  check('report distinguishes invoiced vs collected', reports.payload.invoices.invoiced === 1000 && reports.payload.payments.total === 1000);
  const csv = await fetch(`${BASE}/api/reports/export.csv?from=2026-10-01&to=2026-10-31`);
  const csvText = await csv.text();
  check('CSV export works', csv.status === 200 && csvText.includes('QUOTATIONS BY STATUS'));
  const backup = await fetch(`${BASE}/api/backup/json`);
  const backupJson = await backup.json();
  check('JSON backup contains records', backup.status === 200 && backupJson.data.customers.length >= 1);

  console.log('\n9. Business settings drive documents');
  const before = await req('GET', '/api/settings');
  const updated = await req('PUT', '/api/settings', {
    businessName: 'Johnrois Stainless Steel Fabrication Shop',
    tagline: 'Custom stainless fabrication',
    phone: '(082) 000 0000',
    mobile: '0917 000 0000',
    email: 'hello@johnrois.example',
    address: 'Brgy. Ubalde, Davao City, Davao del Sur',
    facebookUrl: 'https://www.facebook.com/johnroiscanon',
    representative: 'J. Canoy',
    defaultFooter: 'Thank you for your business.',
    defaultPaymentTerms: '50% downpayment, balance upon completion',
    defaultNotes: 'Prices are valid for 30 days.',
    taxEnabled: true,
    taxRate: 12,
    taxLabel: 'VAT',
    tin: '',
    logoImage: logo,
    logoHeight: 60,
    logoAlign: 'left',
    signatureImage: logo,
    paymentMethods: ['Cash', 'Bank Transfer', 'GCash', 'Check'],
    defaultDueDays: 30,
  });
  check('settings saved', updated.status === 200 && updated.payload.tagline === 'Custom stainless fabrication');
  check('logo stored', Boolean(updated.payload.logoImage?.startsWith('data:image/png')));
  const previewPdf = await fetch(`${BASE}/api/settings/preview-pdf`);
  const ppdf = Buffer.from(await previewPdf.arrayBuffer());
  check('document preview PDF generated', previewPdf.status === 200 && ppdf.subarray(0, 5).toString() === '%PDF-');
  fs.writeFileSync(path.join(os.tmpdir(), 'jrsfs-preview.pdf'), ppdf);
  const withLogo = await fetch(`${BASE}/api/quotations/${quotation.payload.id}/pdf`);
  const logoPdf = Buffer.from(await withLogo.arrayBuffer());
  check('documents include the uploaded logo', logoPdf.includes(Buffer.from('/Image')) || logoPdf.includes(Buffer.from('/XObject')));
  const badLogo = await req('PUT', '/api/settings', { ...updated.payload, logoImage: 'data:text/html;base64,PHNjcmlwdD4=' });
  check('non-image logo rejected', badLogo.status === 400);
  const invalidEmail = await req('PUT', '/api/settings', { ...updated.payload, email: 'not-an-email' });
  check('invalid settings email rejected', invalidEmail.status === 400);

  console.log('\n10. No fake data / persistence');
  const fresh = await req('GET', '/api/dashboard');
  check('statistics come from stored records (no seed data)', fresh.payload.quotations.total === dashboard.payload.quotations.total);
  const persisted = await req('GET', '/api/customers?search=Smoke%20Test');
  check('records persist across requests', persisted.payload.length >= 1);

  console.log(`\n${checks - failures}/${checks} checks passed.`);
  if (failures) {
    console.error(`${failures} check(s) failed.`);
    process.exitCode = 1;
  }
};

run().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exitCode = 1;
});
