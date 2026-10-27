// Branded A4 PDF documents. All business identity comes from the live settings
// profile so a single settings edit updates every newly generated document.
import { PDFDocument, A4, COLORS, fitImage } from './pdf/pdf.js';
import { money, formatDate, formatQty, statusLabel, round2 } from '../public/js/calc.js';

const M = 42;
const CONTENT_W = A4.width - M * 2;
const BOTTOM = 766;

const STATUS_TONE = {
  approved: '#1f6f43',
  paid: '#1f6f43',
  completed: '#1f6f43',
  rejected: '#9d2235',
  overdue: '#9d2235',
  cancelled: '#6b7280',
  expired: '#6b7280',
  sent: '#1d4e89',
  scheduled: '#1d4e89',
  in_progress: '#8a5a00',
  partial: '#8a5a00',
  unpaid: '#8a5a00',
  draft: '#6b7280',
};

function businessContactLines(settings) {
  const lines = [];
  if (settings.address) lines.push(settings.address);
  const phones = [settings.phone, settings.mobile].filter(Boolean);
  if (phones.length) lines.push(`Tel: ${phones.join(' / ')}`);
  const online = [settings.email, settings.websiteUrl, settings.facebookUrl].filter(Boolean);
  if (online.length) lines.push(online.join('  •  '));
  return lines;
}

function drawFooter(pdf, settings, documentNumber) {
  const total = pdf.pages.length;
  pdf.pages.forEach((page, i) => {
    pdf.page = page;
    pdf.line(M, 792, A4.width - M, 792, { color: COLORS.line, lineWidth: 0.6 });
    const footer = settings.defaultFooter || settings.businessName;
    pdf.text(footer, M, 802, { size: 7.2, color: COLORS.muted, width: CONTENT_W * 0.65 });
    pdf.text(documentNumber, M, 812, { size: 7.2, color: COLORS.muted });
    pdf.text(`Page ${i + 1} of ${total}`, A4.width - M, 802, {
      size: 7.2,
      color: COLORS.muted,
      align: 'right',
      width: 120,
    });
  });
}

function header(pdf, settings, { title, number, meta = [], status }) {
  pdf.rect(0, 0, A4.width, 7, { fill: COLORS.accent });
  const hasLogo = Boolean(settings.logoImage);
  let textX = M;
  if (hasLogo) {
    const boxW = 104;
    const boxH = Math.min(64, Math.max(28, Number(settings.logoHeight) * 0.5));
    const fit = fitImage(pdf, settings.logoImage, boxW, boxH);
    if (fit) {
      pdf.image(settings.logoImage, M, 30 - boxH / 2, boxW, boxH, {
        align: settings.logoAlign || 'left',
        valign: 'middle',
      });
      textX = M + boxW + 14;
    }
  }
  const rightW = 188;
  const leftW = A4.width - M - rightW - textX - 10;
  let y = 32;
  const businessName = settings.businessName || 'Business Name';
  let nameSize = 15;
  while (nameSize > 10 && pdf.measure(businessName, 'bold', nameSize) > leftW) nameSize -= 0.5;
  let nameLines = [businessName];
  if (pdf.measure(businessName, 'bold', nameSize) > leftW) {
    nameLines = pdf.wrap(businessName, leftW, 'bold', nameSize).slice(0, 2);
    nameSize = Math.min(nameSize, 11.5);
    nameLines = pdf.wrap(businessName, leftW, 'bold', nameSize).slice(0, 2);
  }
  for (const line of nameLines) {
    pdf.text(line, textX, y, { font: 'bold', size: nameSize, color: COLORS.ink });
    y += nameSize * 1.15;
  }
  y += 2;
  if (settings.tagline) {
    pdf.text(settings.tagline, textX, y, { size: 8, color: COLORS.accent });
    y += 12;
  }
  for (const line of businessContactLines(settings)) {
    const wrapped = pdf.wrap(line, Math.max(120, leftW), 'regular', 7.6);
    for (const w of wrapped.slice(0, 2)) {
      pdf.text(w, textX, y, { size: 7.6, color: COLORS.muted });
      y += 9.5;
    }
  }
  if (settings.tin) {
    pdf.text(`TIN: ${settings.tin}`, textX, y, { size: 7.6, color: COLORS.muted });
    y += 9.5;
  }

  const titleText = title.toUpperCase();
  let titleSize = 19;
  while (titleSize > 12 && pdf.measure(titleText, 'bold', titleSize) > rightW) titleSize -= 0.5;
  pdf.text(titleText, A4.width - M, 36, {
    font: 'bold',
    size: titleSize,
    color: COLORS.accent,
    align: 'right',
  });
  let my = 52;
  pdf.text(`No. ${number}`, A4.width - M, my, {
    font: 'bold',
    size: 9,
    color: COLORS.ink,
    align: 'right',
    width: rightW,
  });
  my += 13;
  for (const item of meta) {
    if (!item || !item.value) continue;
    const value = String(item.value);
    const labelW = pdf.measure(item.label, 'regular', 7.6);
    const valueW = pdf.measure(value, 'regular', 7.6);
    if (labelW + valueW + 10 > rightW) {
      pdf.text(item.label, A4.width - M - rightW, my, { size: 7.6, color: COLORS.muted });
      pdf.text(value, A4.width - M, my + 9.5, { size: 7.6, color: COLORS.ink, align: 'right' });
      my += 20;
      continue;
    }
    pdf.text(item.label, A4.width - M - rightW, my, { size: 7.6, color: COLORS.muted });
    pdf.text(value, A4.width - M, my, { size: 7.6, color: COLORS.ink, align: 'right' });
    my += 10.5;
  }
  const ruleY = Math.max(96, my + 4, (typeof y === 'number' ? y : 0) + 8);
  pdf.line(M, ruleY, A4.width - M, ruleY, { color: COLORS.ink, lineWidth: 1 });
  if (status) {
    const label = statusLabel(status).toUpperCase();
    const tone = STATUS_TONE[status] || COLORS.muted;
    const w = pdf.measure(label, 'bold', 7) + 14;
    pdf.rect(M, ruleY + 8, w, 14, { fill: tone, radius: 2 });
    pdf.text(label, M + 7, ruleY + 17.5, { font: 'bold', size: 7, color: '#ffffff' });
    return ruleY + 32;
  }
  return ruleY + 16;
}

function continuationHeader(pdf, settings, documentNumber, title) {
  pdf.rect(0, 0, A4.width, 5, { fill: COLORS.accent });
  pdf.text(settings.businessName, M, 32, { font: 'bold', size: 10 });
  pdf.text(`${title.toUpperCase()} • ${documentNumber} (continued)`, A4.width - M, 32, {
    size: 8,
    color: COLORS.muted,
    align: 'right',
    width: 300,
  });
  pdf.line(M, 42, A4.width - M, 42, { color: COLORS.line, lineWidth: 0.7 });
  return 60;
}

function label(pdf, text, x, y) {
  pdf.text(text.toUpperCase(), x, y, { font: 'bold', size: 6.8, color: COLORS.muted });
  return y + 11;
}

function customerBlock(pdf, doc, y, { heading = 'CUSTOMER' } = {}) {
  const leftW = CONTENT_W * 0.56;
  const rightX = M + leftW + 18;
  const rightW = CONTENT_W - leftW - 18;
  const leftStart = y;
  let ly = label(pdf, heading, M, y);
  ly = pdf.paragraph(doc.companyName || doc.customerName || '—', M, ly, {
    font: 'bold',
    size: 10,
    width: leftW,
  }).y;
  if (doc.companyName && doc.customerName) {
    ly = pdf.paragraph(doc.customerName, M, ly + 1, { size: 8.2, width: leftW }).y;
  }
  if (doc.address) ly = pdf.paragraph(doc.address, M, ly, { size: 8.2, color: COLORS.muted, width: leftW }).y;
  const contact = [doc.contactNumber, doc.email].filter(Boolean).join('  •  ');
  if (contact) ly = pdf.paragraph(contact, M, ly, { size: 8.2, color: COLORS.muted, width: leftW }).y;

  let ry = y;
  const rightRows = [];
  if (doc.projectName) rightRows.push(['Project', doc.projectName]);
  if (doc.projectLocation) rightRows.push(['Location', doc.projectLocation]);
  if (doc.paymentTerms) rightRows.push(['Terms', doc.paymentTerms]);
  if (doc.deliverySchedule) rightRows.push(['Delivery', doc.deliverySchedule]);
  for (const [k, v] of rightRows) {
    ry = pdf.paragraph(k.toUpperCase(), rightX, ry, { font: 'bold', size: 6.8, color: COLORS.muted, width: rightW }).y;
    ry = pdf.paragraph(v, rightX, ry - 1, { size: 8.2, width: rightW }).y;
    ry += 2;
  }
  return Math.max(ly, ry) + 10;
}

function tableColumns(kind) {
  if (kind === 'statement') {
    return [
      { key: 'date', title: 'DATE', w: 58, align: 'left' },
      { key: 'reference', title: 'REFERENCE', w: 74, align: 'left' },
      { key: 'description', title: 'DESCRIPTION', w: 168, align: 'left' },
      { key: 'charges', title: 'CHARGES', w: 68, align: 'right', money: true },
      { key: 'payments', title: 'PAYMENTS', w: 68, align: 'right', money: true },
      { key: 'balance', title: 'BALANCE', w: 75, align: 'right', money: true },
    ];
  }
  if (kind === 'materials') {
    return [
      { key: 'idx', title: '#', w: 20, align: 'left' },
      { key: 'description', title: 'MATERIAL / PART', w: 250, align: 'left' },
      { key: 'qty', title: 'QTY', w: 45, align: 'right' },
      { key: 'unit', title: 'UNIT', w: 50, align: 'left' },
      { key: 'unitCost', title: 'UNIT COST', w: 73, align: 'right', money: true },
      { key: 'amount', title: 'AMOUNT', w: 73, align: 'right', money: true },
    ];
  }
  return [
    { key: 'idx', title: '#', w: 20, align: 'left' },
    { key: 'description', title: 'DESCRIPTION', w: 235, align: 'left' },
    { key: 'qty', title: 'QTY', w: 42, align: 'right' },
    { key: 'unit', title: 'UNIT', w: 36, align: 'left' },
    { key: 'unitPrice', title: 'UNIT PRICE', w: 85, align: 'right', money: true },
    { key: 'amount', title: 'AMOUNT', w: 93, align: 'right', money: true },
  ];
}

function tableHeader(pdf, columns, y) {
  const h = 20;
  let x = M;
  pdf.rect(M, y, CONTENT_W, h, { fill: COLORS.darker });
  for (const col of columns) {
    const tx = col.align === 'right' ? x + col.w - 4 : x + 4;
    pdf.text(col.title, tx, y + 13, {
      font: 'bold',
      size: 6.8,
      color: '#ffffff',
      align: col.align === 'right' ? 'right' : 'left',
      width: col.w - 8,
    });
    x += col.w;
  }
  return y + h;
}

function tableRow(pdf, columns, row, y, index, { shaded = false } = {}) {
  const cellPad = 5;
  const size = 8;
  let maxLines = 1;
  const cells = columns.map((col, ci) => {
    let value;
    if (col.key === 'idx') value = String(index + 1);
    else if (col.money) value = money(row[col.key] ?? 0);
    else value = row[col.key] ?? '';
    value = String(value ?? '');
    if (col.key === 'description') {
      const lines = pdf.wrap(value, col.w - cellPad * 2, 'regular', size);
      maxLines = Math.max(maxLines, lines.length);
      return { lines, col, ci };
    }
    return { lines: [value], col, ci };
  });
  const rowH = Math.max(17, maxLines * 10 + 6);
  if (shaded) pdf.rect(M, y, CONTENT_W, rowH, { fill: '#f7f8f9' });
  let x = M;
  for (const { lines, col } of cells) {
    if (col.key !== 'description') {
      const value = lines[0];
      if (col.align === 'right') {
        pdf.text(value, x + col.w - 4, y + 11, {
          size,
          align: 'right',
          width: col.w - 8,
          color: col.key === 'balance' && row.balance < 0 ? COLORS.accent : COLORS.ink,
        });
      } else {
        pdf.text(value, x + 4, y + 11, { size, color: COLORS.ink });
      }
    } else {
      let ty = y + 11;
      for (const line of lines) {
        pdf.text(line, x + 4, ty, { size, color: COLORS.ink });
        ty += 10;
      }
    }
    x += col.w;
  }
  pdf.line(M, y + rowH, A4.width - M, y + rowH, { color: '#e2e5e8', lineWidth: 0.5 });
  return y + rowH;
}

function totalsBlock(pdf, rows, y, { emphasize = true } = {}) {
  const w = 232;
  const x = A4.width - M - w;
  let cy = y;
  for (const row of rows) {
    if (row.type === 'space') {
      cy += 6;
      continue;
    }
    if (row.type === 'divider') {
      pdf.line(x, cy, x + w, cy, { color: COLORS.line, lineWidth: 0.6 });
      cy += 4;
      continue;
    }
    if (row.type === 'grand') {
      pdf.rect(x, cy, w, 24, { fill: COLORS.darker });
      pdf.text(row.label, x + 10, cy + 16, { font: 'bold', size: 8.6, color: '#ffffff' });
      pdf.text(money(row.value), x + w - 10, cy + 16, {
        font: 'bold',
        size: 11,
        color: '#ffffff',
        align: 'right',
        width: 120,
      });
      cy += 24;
      continue;
    }
    if (row.type === 'status') {
      pdf.rect(x, cy, w, 20, { fill: '#f4f5f6', stroke: '#e2e6e9', lineWidth: 0.5 });
      pdf.text(row.label, x + 10, cy + 14, { font: 'bold', size: 7.6, color: COLORS.muted });
      pdf.text(String(row.value || ''), x + w - 10, cy + 14, {
        font: 'bold',
        size: 8.6,
        color: COLORS.ink,
        align: 'right',
      });
      cy += 20;
      continue;
    }
    if (row.type === 'highlight') {
      pdf.rect(x, cy, w, 22, { fill: '#fbeff1', stroke: '#e3bcc4', lineWidth: 0.6 });
      pdf.text(row.label, x + 10, cy + 15, { font: 'bold', size: 8.4, color: COLORS.accent });
      pdf.text(money(row.value), x + w - 10, cy + 15, {
        font: 'bold',
        size: 10,
        color: COLORS.accent,
        align: 'right',
        width: 120,
      });
      cy += 22;
      continue;
    }
    pdf.text(row.label, x + 10, cy + 11, { size: 8.2, color: COLORS.muted });
    pdf.text(row.value !== undefined ? money(row.value) : row.text ?? '', x + w - 10, cy + 11, {
      size: 8.6,
      color: COLORS.ink,
      align: 'right',
      width: 140,
    });
    cy += 15;
  }
  return cy;
}

function notesAndSignatures(pdf, doc, settings, y, { signatures = [] } = {}) {
  const notes = [];
  if (doc.remarks) notes.push(['Remarks', doc.remarks]);
  if (settings.defaultNotes) notes.push(['Notes', settings.defaultNotes]);
  let cy = y + 6;
  for (const [heading, text] of notes) {
    if (cy > BOTTOM - 120) {
      cy = continuationHeader(pdf, settings, doc.number, 'DOCUMENT');
    }
    cy = label(pdf, heading, M, cy);
    cy = pdf.paragraph(text, M, cy - 2, { size: 8, color: COLORS.muted, width: CONTENT_W * 0.62 }).y + 4;
  }
  const sigHeight = 78;
  if (cy + sigHeight + 16 > BOTTOM) {
    cy = continuationHeader(pdf, settings, doc.number, 'DOCUMENT');
  }
  const startY = cy + 18;
  const count = signatures.length || 1;
  const slot = CONTENT_W / count;
  signatures.forEach((sig, i) => {
    const x = M + slot * i;
    const innerW = slot - 24;
    const lineY = startY + 40;
    pdf.line(x, lineY, x + innerW, lineY, { color: COLORS.ink, lineWidth: 0.8 });
    const name = sig.name || '';
    if (name) pdf.text(name, x + 4, lineY + 12, { font: 'bold', size: 9 });
    pdf.text((sig.role || '').toUpperCase(), x + 4, lineY + 23, {
      font: 'bold',
      size: 6.8,
      color: COLORS.muted,
    });
    if (sig.note) pdf.text(sig.note, x + 4, lineY + 32, { size: 7, color: COLORS.muted });
    if (sig.signatureImage) {
      pdf.image(sig.signatureImage, x + 4, lineY - 38, innerW * 0.7, 32, { align: 'left', valign: 'bottom' });
    }
  });
  return startY + sigHeight;
}

function ensureSpace(pdf, settings, doc, y, needed, title) {
  if (y + needed <= BOTTOM) return y;
  pdf.addPage();
  return continuationHeader(pdf, settings, doc.number, title);
}

// ---------------------------------------------------------------------------
// Quotation
// ---------------------------------------------------------------------------
export function renderQuotationPDF({ settings, quotation, items }) {
  const pdf = new PDFDocument({
    title: `Quotation ${quotation.number}`,
    author: settings.businessName,
    subject: quotation.projectName || 'Quotation',
  });
  pdf.addPage();
  let y = header(pdf, settings, {
    title: 'Quotation',
    number: quotation.number,
    status: quotation.effectiveStatus || quotation.status,
    meta: [
      { label: 'Date issued', value: formatDate(quotation.issueDate) },
      { label: 'Valid until', value: quotation.validUntil ? formatDate(quotation.validUntil) : '' },
      { label: 'Prepared by', value: quotation.preparedBy },
    ],
  });
  y = customerBlock(pdf, quotation, y);
  const columns = tableColumns('items');
  y = tableHeader(pdf, columns, y);
  items.forEach((item, i) => {
    const lines = pdf.wrap(item.description, columns[1].w - 10, 'regular', 8);
    const rowH = Math.max(17, lines.length * 10 + 6);
    if (y + rowH > BOTTOM - 40) {
      pdf.addPage();
      y = continuationHeader(pdf, settings, quotation.number, 'Quotation');
      y = tableHeader(pdf, columns, y);
    }
    y = tableRow(
      pdf,
      columns,
      {
        description: item.description,
        qty: formatQty(item.quantity),
        unit: item.unit,
        unitPrice: item.unitPrice,
        amount: item.lineTotal,
      },
      y,
      i,
      { shaded: i % 2 === 1 }
    );
  });
  if (y + 24 > BOTTOM) {
    pdf.addPage();
    y = continuationHeader(pdf, settings, quotation.number, 'Quotation');
  }
  pdf.line(M, y, A4.width - M, y, { color: COLORS.ink, lineWidth: 0.8 });
  y += 12;

  const totals = [
    { label: 'Subtotal', value: quotation.subtotal },
    ...(quotation.discountAmount > 0
      ? [
          {
            label:
              quotation.discountType === 'percent'
                ? `Discount (${formatQty(quotation.discountValue)}%)`
                : 'Discount',
            text: `- ${money(quotation.discountAmount)}`,
          },
        ]
      : []),
    ...(quotation.taxAmount > 0
      ? [{ label: `${settings.taxLabel || 'Tax'} (${formatQty(quotation.taxRate)}%)`, value: quotation.taxAmount }]
      : []),
    { type: 'divider' },
    { type: 'grand', label: 'GRAND TOTAL', value: quotation.grandTotal },
  ];
  const totalsY = y;
  let ty = totalsBlock(pdf, totals, y);
  // Terms box on the left of the totals.
  const leftW = CONTENT_W - 252;
  let ly = label(pdf, 'Payment terms', M, totalsY);
  ly = pdf.paragraph(quotation.paymentTerms || settings.defaultPaymentTerms || '—', M, ly - 2, {
    size: 8,
    color: COLORS.ink,
    width: leftW,
  }).y;
  if (quotation.deliverySchedule) {
    ly = label(pdf, 'Delivery / completion', M, ly + 2);
    ly = pdf.paragraph(quotation.deliverySchedule, M, ly - 2, { size: 8, width: leftW }).y;
  }
  y = Math.max(ty, ly) + 4;
  y = notesAndSignatures(pdf, quotation, settings, y, {
    signatures: [
      { name: quotation.preparedBy, role: 'Prepared by' },
      {
        name: settings.representative,
        role: 'Authorized signature',
        signatureImage: settings.signatureImage,
      },
    ],
  });
  drawFooter(pdf, settings, quotation.number);
  return pdf.toBuffer();
}

// ---------------------------------------------------------------------------
// Invoice
// ---------------------------------------------------------------------------
export function renderInvoicePDF({ settings, invoice, items, payments = [] }) {
  const pdf = new PDFDocument({
    title: `Invoice ${invoice.number}`,
    author: settings.businessName,
    subject: `Invoice for ${invoice.customerName}`,
  });
  pdf.addPage();
  let y = header(pdf, settings, {
    title: 'Invoice',
    number: invoice.number,
    status: invoice.status,
    meta: [
      { label: 'Invoice date', value: formatDate(invoice.invoiceDate) },
      { label: 'Due date', value: invoice.dueDate ? formatDate(invoice.dueDate) : '' },
      { label: 'Prepared by', value: invoice.preparedBy },
    ],
  });
  y = customerBlock(pdf, invoice, y);
  if (invoice.quotationNumber) {
    pdf.text(`Reference quotation: ${invoice.quotationNumber}`, M, y + 6, {
      size: 8,
      color: COLORS.muted,
    });
    y += 16;
  }
  const columns = tableColumns('items');
  y = tableHeader(pdf, columns, y);
  items.forEach((item, i) => {
    const lines = pdf.wrap(item.description, columns[1].w - 10, 'regular', 8);
    const rowH = Math.max(17, lines.length * 10 + 6);
    if (y + rowH > BOTTOM - 40) {
      pdf.addPage();
      y = continuationHeader(pdf, settings, invoice.number, 'Invoice');
      y = tableHeader(pdf, columns, y);
    }
    y = tableRow(
      pdf,
      columns,
      {
        description: item.description,
        qty: formatQty(item.quantity),
        unit: item.unit,
        unitPrice: item.unitPrice,
        amount: item.lineTotal,
      },
      y,
      i,
      { shaded: i % 2 === 1 }
    );
  });
  if (y + 24 > BOTTOM) {
    pdf.addPage();
    y = continuationHeader(pdf, settings, invoice.number, 'Invoice');
  }
  pdf.line(M, y, A4.width - M, y, { color: COLORS.ink, lineWidth: 0.8 });
  y += 12;
  const totals = [
    { label: 'Subtotal', value: invoice.subtotal },
    ...(invoice.discountAmount > 0
      ? [
          {
            label:
              invoice.discountType === 'percent'
                ? `Discount (${formatQty(invoice.discountValue)}%)`
                : 'Discount',
            text: `- ${money(invoice.discountAmount)}`,
          },
        ]
      : []),
    ...(invoice.taxAmount > 0
      ? [{ label: `${settings.taxLabel || 'Tax'} (${formatQty(invoice.taxRate)}%)`, value: invoice.taxAmount }]
      : []),
    { type: 'divider' },
    { label: 'TOTAL', value: invoice.total },
    { type: 'space' },
    { label: 'Amount paid', value: invoice.amountPaid },
    { type: 'highlight', label: 'BALANCE DUE', value: invoice.balance },
    { type: 'space' },
    { type: 'divider' },
    { type: 'status', label: 'Status', value: statusLabel(invoice.status) },
  ];
  const totalsY = y;
  let ty = totalsBlock(pdf, totals, y);
  const leftW = CONTENT_W - 252;
  let ly = label(pdf, 'Payment terms', M, totalsY);
  ly = pdf.paragraph(invoice.paymentTerms || settings.defaultPaymentTerms || '—', M, ly - 2, {
    size: 8,
    width: leftW,
  }).y;
  if (payments.length) {
    ly = label(pdf, 'Payments received', M, ly + 2);
    for (const p of payments.slice(0, 6)) {
      const line = `${formatDate(p.paymentDate)} — ${p.reference} — ${money(p.amount)} (${p.method})`;
      ly = pdf.paragraph(line, M, ly - 2, { size: 7.6, color: COLORS.muted, width: leftW }).y;
    }
  }
  y = Math.max(ty, ly) + 4;
  y = notesAndSignatures(pdf, invoice, settings, y, {
    signatures: [
      { name: invoice.preparedBy, role: 'Prepared by' },
      {
        name: settings.representative,
        role: 'Authorized signature',
        signatureImage: settings.signatureImage,
      },
    ],
  });
  drawFooter(pdf, settings, invoice.number);
  return pdf.toBuffer();
}

// ---------------------------------------------------------------------------
// Service report
// ---------------------------------------------------------------------------
export function renderServiceReportPDF({ settings, report }) {
  const pdf = new PDFDocument({
    title: `Service Report ${report.number}`,
    author: settings.businessName,
    subject: report.equipment || 'Service report',
  });
  pdf.addPage();
  let y = header(pdf, settings, {
    title: 'Service Report',
    number: report.number,
    status: report.status,
    meta: [
      { label: 'Service date', value: formatDate(report.serviceDate) },
      { label: 'Technician', value: report.technician },
      {
        label: 'Time',
        value: [report.startTime, report.endTime].filter(Boolean).join(' – '),
      },
      { label: 'Prepared by', value: report.preparedBy },
    ],
  });
  y = customerBlock(pdf, report, y, { heading: 'CUSTOMER' });
  const siteRows = [];
  if (report.location) siteRows.push(['Service location', report.location]);
  if (report.equipment) siteRows.push(['Product / equipment serviced', report.equipment]);
  for (const [k, v] of siteRows) {
    y = label(pdf, k, M, y);
    y = pdf.paragraph(v, M, y - 2, { size: 8.6, width: CONTENT_W }).y + 4;
  }
  const sections = [
    ['Reported problem', report.reportedProblem],
    ['Inspection findings', report.findings],
    ['Work performed', report.workPerformed],
  ];
  for (const [heading, text] of sections) {
    if (!text) continue;
    const lines = pdf.wrap(text, CONTENT_W, 'regular', 8.6);
    if (y + lines.length * 11 + 26 > BOTTOM) {
      pdf.addPage();
      y = continuationHeader(pdf, settings, report.number, 'Service Report');
    }
    pdf.rect(M, y, CONTENT_W, 1, { fill: COLORS.line });
    y += 12;
    y = label(pdf, heading, M, y);
    y = pdf.paragraph(text, M, y - 2, { size: 8.6, width: CONTENT_W }).y + 8;
  }

  const materials = (report.materials || []).filter((m) => m.description);
  if (materials.length) {
    if (y + 60 > BOTTOM) {
      pdf.addPage();
      y = continuationHeader(pdf, settings, report.number, 'Service Report');
    }
    y = label(pdf, 'Materials and parts used', M, y + 4);
    const columns = tableColumns('materials');
    y = tableHeader(pdf, columns, y);
    materials.forEach((m, i) => {
      if (y + 20 > BOTTOM) {
        pdf.addPage();
        y = continuationHeader(pdf, settings, report.number, 'Service Report');
        y = tableHeader(pdf, columns, y);
      }
      y = tableRow(
        pdf,
        columns,
        {
          description: m.description,
          qty: formatQty(m.quantity ?? m.qty ?? 0),
          unit: m.unit || '',
          unitCost: m.unitCost ?? 0,
          amount: m.amount ?? round2((m.quantity ?? 0) * (m.unitCost ?? 0)),
        },
        y,
        i,
        { shaded: i % 2 === 1 }
      );
    });
    y = totalsBlock(
      pdf,
      [
        { label: 'Materials', value: report.materialsCost || 0 },
        { label: 'Labor', value: report.laborCost || 0 },
        { type: 'divider' },
        { type: 'grand', label: 'TOTAL COST', value: report.totalCost || 0 },
      ],
      y + 10
    );
  }

  const photos = (report.photos || []).filter(Boolean).slice(0, 4);
  if (photos.length) {
    if (y + 130 > BOTTOM) {
      pdf.addPage();
      y = continuationHeader(pdf, settings, report.number, 'Service Report');
    }
    y = label(pdf, 'Photo documentation', M, y + 10);
    const boxW = (CONTENT_W - 12) / 2;
    const boxH = 110;
    photos.forEach((photo, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const px = M + col * (boxW + 12);
      const py = y + row * (boxH + 16);
      if (py + boxH > BOTTOM) return;
      pdf.rect(px, py, boxW, boxH, { fill: '#f4f5f6', stroke: COLORS.line, lineWidth: 0.6 });
      pdf.image(photo, px + 3, py + 3, boxW - 6, boxH - 20, { align: 'center', valign: 'middle' });
      pdf.text(`Photo ${i + 1}`, px + 3, py + boxH - 8, { size: 6.8, color: COLORS.muted });
    });
    y += Math.ceil(photos.length / 2) * (boxH + 16);
  }

  if (report.recommendations) {
    if (y + 50 > BOTTOM) {
      pdf.addPage();
      y = continuationHeader(pdf, settings, report.number, 'Service Report');
    }
    y = label(pdf, 'Recommendations', M, y + 4);
    y = pdf.paragraph(report.recommendations, M, y - 2, { size: 8.6, width: CONTENT_W }).y + 4;
  }
  y = notesAndSignatures(pdf, report, settings, y + 4, {
    signatures: [
      { name: report.technician, role: 'Technician signature' },
      {
        name: report.customerAck || report.customerName,
        role: 'Customer signature',
        note: 'Received and acknowledged the service above.',
      },
      { name: report.preparedBy, role: 'Prepared by' },
    ],
  });
  drawFooter(pdf, settings, report.number);
  return pdf.toBuffer();
}

// ---------------------------------------------------------------------------
// Billing statement
// ---------------------------------------------------------------------------
export function renderBillingStatementPDF({ settings, statement, items }) {
  const pdf = new PDFDocument({
    title: `Billing Statement ${statement.number}`,
    author: settings.businessName,
    subject: `Statement for ${statement.customerName}`,
  });
  pdf.addPage();
  let y = header(pdf, settings, {
    title: 'Billing Statement',
    number: statement.number,
    meta: [
      { label: 'Statement date', value: formatDate(statement.statementDate) },
      { label: 'Period', value: `${formatDate(statement.periodFrom, 'short')} – ${formatDate(statement.periodTo, 'short')}` },
      { label: 'Prepared by', value: statement.preparedBy },
    ],
  });
  y = customerBlock(pdf, { ...statement, projectName: '', projectLocation: '' }, y, {
    heading: 'STATEMENT OF ACCOUNT',
  });

  const columns = tableColumns('statement');
  y = tableHeader(pdf, columns, y);
  y = tableRow(
    pdf,
    columns,
    {
      date: '',
      reference: '—',
      description: 'Previous balance / beginning balance',
      charges: 0,
      payments: 0,
      balance: statement.previousBalance,
    },
    y,
    0,
    { shaded: false }
  );
  items.forEach((item, i) => {
    const descLines = pdf.wrap(item.description, columns[2].w - 10, 'regular', 8);
    const rowH = Math.max(17, descLines.length * 10 + 6);
    if (y + rowH > BOTTOM - 40) {
      pdf.addPage();
      y = continuationHeader(pdf, settings, statement.number, 'Billing Statement');
      y = tableHeader(pdf, columns, y);
    }
    y = tableRow(
      pdf,
      columns,
      {
        date: formatDate(item.txnDate, 'short'),
        reference: item.reference,
        description: item.description,
        charges: item.charges || 0,
        payments: item.credits || 0,
        balance: item.balance,
      },
      y,
      i + 1,
      { shaded: i % 2 === 0 }
    );
  });
  if (y + 100 > BOTTOM) {
    pdf.addPage();
    y = continuationHeader(pdf, settings, statement.number, 'Billing Statement');
  }
  pdf.line(M, y, A4.width - M, y, { color: COLORS.ink, lineWidth: 0.8 });
  y += 12;
  const totalsY = y;
  const ty = totalsBlock(
    pdf,
    [
      { label: 'Previous balance', value: statement.previousBalance },
      { label: 'Total charges', value: statement.totalCharges },
      { label: 'Total payments', text: `- ${money(statement.totalPayments)}` },
      { type: 'divider' },
      { type: 'grand', label: 'OUTSTANDING BALANCE', value: statement.outstandingBalance },
    ],
    y
  );
  const leftW = CONTENT_W - 252;
  let ly = label(pdf, 'Payment terms', M, totalsY);
  ly = pdf.paragraph(statement.paymentTerms || settings.defaultPaymentTerms || '—', M, ly - 2, {
    size: 8,
    width: leftW,
  }).y;
  ly = pdf.paragraph(
    'This statement summarizes the invoices and payments recorded for the billing period shown. Please review and settle any outstanding balance.',
    M,
    ly + 4,
    { size: 7.6, color: COLORS.muted, width: leftW }
  ).y;
  y = Math.max(ty, ly) + 4;
  y = notesAndSignatures(pdf, statement, settings, y, {
    signatures: [
      { name: statement.preparedBy, role: 'Prepared by' },
      {
        name: settings.representative,
        role: 'Authorized signature',
        signatureImage: settings.signatureImage,
      },
    ],
  });
  drawFooter(pdf, settings, statement.number);
  return pdf.toBuffer();
}

export { todayISO as documentToday } from '../public/js/calc.js';
