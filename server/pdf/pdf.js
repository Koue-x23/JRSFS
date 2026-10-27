// Tiny dependency-free PDF generator: A4 pages, wrapped text, vector tables,
// embedded TrueType subsets (regular + bold) and PNG/JPEG images.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TrueTypeFont } from './ttf.js';
import { decodeImageDataUrl } from './images.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const FONT_DIR = path.join(ROOT, 'fonts');

export const A4 = { width: 595.28, height: 841.89 };
export const COLORS = {
  ink: '#1b1e22',
  muted: '#5b636b',
  line: '#c9ced3',
  light: '#f2f3f4',
  darker: '#15181b',
  accent: '#9d2235',
  white: '#ffffff',
};

function hexToRgb(hex) {
  if (Array.isArray(hex)) return hex;
  const h = String(hex || '#000000').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const fmt = (n) => (Math.round(Number(n) * 1000) / 1000).toString();
const rgbStr = (hex) => hexToRgb(hex).map((v) => fmt(v)).join(' ');
const pdfDate = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(
    d.getMinutes()
  )}${p(d.getSeconds())}${sign}${p(Math.floor(abs / 60))}'${p(abs % 60)}'`;
};

export class PDFDocument {
  constructor({ title = '', author = '', subject = '', creator = 'Johnrois Business Manager' } = {}) {
    this.title = title;
    this.author = author;
    this.subject = subject;
    this.creator = creator;
    this.pages = [];
    this.page = null;
    this.fontDefs = {
      regular: { key: 'regular', base: 'DejaVuSans', file: 'DejaVuSans.ttf' },
      bold: { key: 'bold', base: 'DejaVuSans-Bold', file: 'DejaVuSans-Bold.ttf' },
    };
    this.ttf = {};
    for (const def of Object.values(this.fontDefs)) {
      const file = path.join(FONT_DIR, def.file);
      if (!fs.existsSync(file)) throw new Error(`Embedded font missing: ${file}`);
      this.ttf[def.key] = new TrueTypeFont(fs.readFileSync(file));
    }
    this.usedChars = { regular: new Set(), bold: new Set() };
    this.imageCache = new Map();
    this.warnings = [];
  }

  addPage(width = A4.width, height = A4.height) {
    const page = { width, height, ops: [], images: new Set() };
    this.pages.push(page);
    this.page = page;
    return page;
  }

  _page() {
    if (!this.page) this.addPage();
    return this.page;
  }

  color(hex) {
    return rgbStr(hex);
  }

  measure(text, font = 'regular', size = 10) {
    const ttf = this.ttf[font] || this.ttf.regular;
    let width = 0;
    for (const ch of String(text ?? '')) width += ttf.widthOfChar(ch);
    return (width * size) / 1000;
  }

  wrap(text, maxWidth, font = 'regular', size = 10) {
    const clean = String(text ?? '').replace(/\r\n/g, '\n');
    const lines = [];
    for (const para of clean.split('\n')) {
      if (para === '') {
        lines.push('');
        continue;
      }
      const words = para.split(/\s+/).filter(Boolean);
      let current = '';
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (this.measure(candidate, font, size) <= maxWidth) {
          current = candidate;
          continue;
        }
        if (current) lines.push(current);
        if (this.measure(word, font, size) <= maxWidth) {
          current = word;
          continue;
        }
        // Break an over-long word by characters.
        let piece = '';
        for (const ch of word) {
          if (this.measure(piece + ch, font, size) > maxWidth && piece) {
            lines.push(piece);
            piece = ch;
          } else {
            piece += ch;
          }
        }
        current = piece;
      }
      lines.push(current);
    }
    return lines;
  }

  _register(text, font) {
    const set = this.usedChars[font] || this.usedChars.regular;
    for (const ch of String(text ?? '')) {
      set.add(ch);
      if (this.ttf[font] && this.ttf[font].glyphForChar(ch) === 0 && ch !== ' ') {
        this.warnings.push(`Glyph missing for "${ch}" in ${font} font.`);
      }
    }
  }

  text(text, x, y, { font = 'regular', size = 10, color = COLORS.ink, align = 'left', width } = {}) {
    const str = String(text ?? '');
    if (!str) return;
    this._register(str, font);
    let tx = x;
    if (align === 'right') {
      // x is the right edge when right-aligned.
      tx = x - this.measure(str, font, size);
    } else if (align === 'center') {
      tx = x + (Number(width) || 0) / 2 - this.measure(str, font, size) / 2;
    }
    this._page().ops.push({ type: 'text', text: str, x: tx, y, font, size, color });
  }

  /** Draw wrapped text, returning the y position after the block. */
  paragraph(text, x, y, { width = 500, font = 'regular', size = 10, color = COLORS.ink, lineHeight = 1.35, align = 'left', maxLines = 0 } = {}) {
    const lines = this.wrap(text, width, font, size);
    const limited = maxLines > 0 ? lines.slice(0, maxLines) : lines;
    let cy = y;
    for (const line of limited) {
      this.text(line, x, cy, { font, size, color, align, width });
      cy += size * lineHeight;
    }
    return { y: cy, lines: limited };
  }

  lineHeight(size, factor = 1.35) {
    return size * factor;
  }

  rect(x, y, w, h, { fill = null, stroke = null, lineWidth = 0.7, radius = 0 } = {}) {
    this._page().ops.push({ type: 'rect', x, y, w, h, fill, stroke, lineWidth, radius });
  }

  line(x1, y1, x2, y2, { color = COLORS.line, lineWidth = 0.7, dash = null } = {}) {
    this._page().ops.push({ type: 'line', x1, y1, x2, y2, color, lineWidth, dash });
  }

  imageInfo(dataUrl) {
    if (!dataUrl) return null;
    const key = crypto.createHash('sha1').update(String(dataUrl)).digest('hex').slice(0, 16);
    if (this.imageCache.has(key)) return { key, ...this.imageCache.get(key) };
    try {
      const info = decodeImageDataUrl(dataUrl);
      const stored = { width: info.width, height: info.height, info };
      this.imageCache.set(key, stored);
      return { key, ...stored };
    } catch (err) {
      this.warnings.push(`Image could not be embedded in PDF: ${err.message}`);
      this.imageCache.set(key, { error: err.message });
      return null;
    }
  }

  /** Draw an image scaled to fit inside the box, preserving aspect ratio. */
  image(dataUrl, x, y, boxW, boxH, { align = 'left', valign = 'top' } = {}) {
    const img = this.imageInfo(dataUrl);
    if (!img) return false;
    const scale = Math.min(boxW / img.width, boxH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const dx = align === 'center' ? x + (boxW - w) / 2 : align === 'right' ? x + boxW - w : x;
    const dy = valign === 'middle' ? y + (boxH - h) / 2 : valign === 'bottom' ? y + boxH - h : y;
    const page = this._page();
    page.images.add(img.key);
    page.ops.push({ type: 'image', key: img.key, x: dx, y: dy, w, h });
    return true;
  }

  _contentFor(page, imageNames, fontNames) {
    const parts = [];
    for (const op of page.ops) {
      if (op.type === 'text') {
        const fontName = fontNames[op.font] || fontNames.regular;
        const encoded = this._encode(op.text, op.font);
        parts.push(
          `BT ${fontName} ${fmt(op.size)} Tf ${rgbStr(op.color)} rg 1 0 0 -1 ${fmt(op.x)} ${fmt(op.y)} Tm <${encoded}> Tj ET`
        );
      } else if (op.type === 'rect') {
        const ops = ['q'];
        if (op.fill) ops.push(`${rgbStr(op.fill)} rg`);
        if (op.stroke) ops.push(`${rgbStr(op.stroke)} RG ${fmt(op.lineWidth)} w`);
        if (op.radius) {
          const r = Math.min(op.radius, op.w / 2, op.h / 2);
          const k = 0.5523 * r;
          const { x, y, w, h } = op;
          ops.push(
            `${fmt(x + r)} ${fmt(y)} m`,
            `${fmt(x + w - r)} ${fmt(y)} l`,
            `${fmt(x + w - r + k)} ${fmt(y)} ${fmt(x + w)} ${fmt(y + r - k)} ${fmt(x + w)} ${fmt(y + r)} c`,
            `${fmt(x + w)} ${fmt(y + h - r)} l`,
            `${fmt(x + w)} ${fmt(y + h - r + k)} ${fmt(x + w - r + k)} ${fmt(y + h)} ${fmt(x + w - r)} ${fmt(y + h)} c`,
            `${fmt(x + r)} ${fmt(y + h)} l`,
            `${fmt(x + r - k)} ${fmt(y + h)} ${fmt(x)} ${fmt(y + h - r + k)} ${fmt(x)} ${fmt(y + h - r)} c`,
            `${fmt(x)} ${fmt(y + r)} l`,
            `${fmt(x)} ${fmt(y + r - k)} ${fmt(x + r - k)} ${fmt(y)} ${fmt(x + r)} ${fmt(y)} c`,
            'h'
          );
        } else {
          ops.push(`${fmt(op.x)} ${fmt(op.y)} ${fmt(op.w)} ${fmt(op.h)} re`);
        }
        if (op.fill && op.stroke) ops.push('B');
        else if (op.fill) ops.push('f');
        else if (op.stroke) ops.push('S');
        ops.push('Q');
        parts.push(ops.join('\n'));
      } else if (op.type === 'line') {
        parts.push(
          `q ${rgbStr(op.color)} RG ${fmt(op.lineWidth)} w ${op.dash ? `[${op.dash.join(' ')}] 0 d` : ''} ${fmt(
            op.x1
          )} ${fmt(op.y1)} m ${fmt(op.x2)} ${fmt(op.y2)} l S Q`
        );
      } else if (op.type === 'image') {
        const name = imageNames.get(op.key);
        if (!name) continue;
        parts.push(
          `q ${fmt(op.w)} 0 0 ${fmt(-op.h)} ${fmt(op.x)} ${fmt(op.y + op.h)} cm /${name} Do Q`
        );
      }
    }
    return `q 1 0 0 -1 0 ${fmt(page.height)} cm\n${parts.join('\n')}\nQ`;
  }

  _encode(text, font) {
    const subset = this.subsets[font];
    const ttf = this.ttf[font];
    let hex = '';
    for (const ch of text) {
      let gid = subset ? subset.cidForChar.get(ch) : undefined;
      if (gid === undefined) {
        // Fall back to the regular font's mapping if a bold-only glyph is absent.
        gid = 0;
      }
      hex += gid.toString(16).padStart(4, '0');
    }
    return hex;
  }

  _toUnicodeCMap(subset) {
    const entries = [...subset.gidToChar.entries()].filter(([gid]) => gid > 0);
    const lines = [];
    lines.push('/CIDInit /ProcSet findresource begin');
    lines.push('12 dict begin');
    lines.push('begincmap');
    lines.push('/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def');
    lines.push('/CMapName /Adobe-Identity-UCS def');
    lines.push('/CMapType 2 def');
    lines.push('1 begincodespacerange');
    lines.push('<0000> <FFFF>');
    lines.push('endcodespacerange');
    for (let i = 0; i < entries.length; i += 100) {
      const chunk = entries.slice(i, i + 100);
      lines.push(`${chunk.length} beginbfchar`);
      for (const [gid, ch] of chunk) {
        const code = ch.codePointAt(0);
        const utf16 = code <= 0xffff ? code.toString(16).padStart(4, '0') : Buffer.from(ch, 'utf16le').swap16().toString('hex');
        lines.push(`<${gid.toString(16).padStart(4, '0')}> <${utf16}>`);
      }
      lines.push('endbfchar');
    }
    lines.push('endcmap');
    lines.push('CMapName currentdict /CMap defineresource pop');
    lines.push('end');
    lines.push('end');
    return lines.join('\n');
  }

  toBuffer() {
    if (!this.pages.length) this.addPage();
    this.subsets = {};
    for (const key of Object.keys(this.fontDefs)) {
      const chars = this.usedChars[key];
      // Always embed the basic punctuation used by documents.
      for (const ch of ' .,:-/()₱') chars.add(ch);
      this.subsets[key] = this.ttf[key].subset(chars);
    }

    const objects = new Map();
    let nextId = 1;
    const alloc = () => nextId++;
    const setObj = (id, body) => objects.set(id, Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1'));
    const streamObj = (dict, data, compress = true) => {
      const payload = compress ? zlib.deflateSync(data) : data;
      const filter = compress ? ' /Filter /FlateDecode' : '';
      const head = Buffer.from(`<< ${dict}${filter} /Length ${payload.length} >>\nstream\n`, 'latin1');
      return Buffer.concat([head, payload, Buffer.from('\nendstream', 'latin1')]);
    };

    const catalogId = alloc();
    const pagesId = alloc();
    const infoId = alloc();

    // Images
    const imageObjects = new Map();
    const imageNames = new Map();
    let imgIndex = 0;
    for (const [key, cached] of this.imageCache) {
      if (cached.error) continue;
      if (![...this.pages].some((p) => p.images.has(key))) continue;
      const info = cached.info;
      imgIndex += 1;
      const name = `Im${imgIndex}`;
      const id = alloc();
      if (info.kind === 'jpeg') {
        setObj(
          id,
          streamObj(
            `/Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} /ColorSpace /${info.colorSpace} /BitsPerComponent 8 /Filter /DCTDecode`,
            info.jpeg,
            false
          )
        );
      } else {
        setObj(
          id,
          streamObj(
            `/Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} /ColorSpace /DeviceRGB /BitsPerComponent 8`,
            info.rgb,
            true
          )
        );
      }
      imageObjects.set(name, id);
      imageNames.set(key, name);
    }

    // Fonts
    const fontObjects = {};
    for (const key of Object.keys(this.fontDefs)) {
      const subset = this.subsets[key];
      const baseName = `JRSFSX+${this.fontDefs[key].base}`;
      const type0Id = alloc();
      const cidId = alloc();
      const descriptorId = alloc();
      const fileId = alloc();
      const toUnicodeId = alloc();
      const scale = 1000 / subset.unitsPerEm;
      const bbox = subset.bbox.map((v) => Math.round(v * scale));
      const ascent = Math.round(subset.ascent * scale);
      const descent = Math.round(subset.descent * scale);
      const widths = subset.widths.slice(1).map((w) => Math.round(w));
      const wArray = widths.length ? `[1 [${widths.join(' ')}]]` : '[]';
      setObj(
        fileId,
        streamObj(`/Length1 ${subset.fontBuffer.length}`, subset.fontBuffer, true)
      );
      setObj(
        descriptorId,
        `<< /Type /FontDescriptor /FontName /${baseName} /Flags ${key === 'bold' ? 262176 : 32} /FontBBox [${bbox.join(' ')}] /ItalicAngle 0 /Ascent ${ascent} /Descent ${descent} /CapHeight 700 /StemV ${key === 'bold' ? 120 : 80} /FontFile2 ${fileId} 0 R >>`
      );
      setObj(
        cidId,
        `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${baseName} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptorId} 0 R /DW 1000 /W ${wArray} /CIDToGIDMap /Identity >>`
      );
      setObj(toUnicodeId, streamObj('', Buffer.from(this._toUnicodeCMap(subset), 'latin1'), false));
      setObj(
        type0Id,
        `<< /Type /Font /Subtype /Type0 /BaseFont /${baseName} /Encoding /Identity-H /DescendantFonts [${cidId} 0 R] /ToUnicode ${toUnicodeId} 0 R >>`
      );
      fontObjects[key] = { id: type0Id, name: key === 'bold' ? 'F2' : 'F1' };
    }

    // Pages
    const pageIds = [];
    for (const page of this.pages) {
      const contentId = alloc();
      const pageId = alloc();
      const content = this._contentFor(page, imageNames, {
        regular: `/${fontObjects.regular.name}`,
        bold: `/${fontObjects.bold.name}`,
      });
      setObj(contentId, streamObj('', Buffer.from(content, 'latin1'), true));
      const xobjects = page.images.size
        ? ` /XObject << ${[...page.images]
            .map((key) => {
              const name = imageNames.get(key);
              return name ? `/${name} ${imageObjects.get(name)} 0 R` : '';
            })
            .filter(Boolean)
            .join(' ')} >>`
        : '';
      setObj(
        pageId,
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${fmt(page.width)} ${fmt(page.height)}] /Resources << /Font << /F1 ${fontObjects.regular.id} 0 R /F2 ${fontObjects.bold.id} 0 R >>${xobjects} >> /Contents ${contentId} 0 R >>`
      );
      pageIds.push(pageId);
    }

    setObj(
      catalogId,
      `<< /Type /Catalog /Pages ${pagesId} 0 R /ViewerPreferences << /DisplayDocTitle true >> >>`
    );
    setObj(
      pagesId,
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`
    );
    setObj(
      infoId,
      `<< /Title (${pdfString(this.title)}) /Author (${pdfString(this.author)}) /Subject (${pdfString(
        this.subject
      )}) /Creator (${pdfString(this.creator)}) /Producer (${pdfString('Johnrois Business Manager PDF engine')}) /CreationDate (${pdfDate()}) >>`
    );

    const maxId = nextId - 1;
    const parts = [];
    let offset = 0;
    const push = (buf) => {
      parts.push(buf);
      offset += buf.length;
    };
    push(Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1'));
    const offsets = new Map();
    for (let id = 1; id <= maxId; id++) {
      const body = objects.get(id);
      if (!body) continue;
      offsets.set(id, offset);
      push(Buffer.from(`${id} 0 obj\n`, 'latin1'));
      push(body);
      push(Buffer.from('\nendobj\n', 'latin1'));
    }
    const xrefOffset = offset;
    let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
    for (let id = 1; id <= maxId; id++) {
      const off = offsets.get(id) ?? 0;
      xref += `${String(off).padStart(10, '0')} 00000 n \n`;
    }
    xref += `trailer\n<< /Size ${maxId + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    push(Buffer.from(xref, 'latin1'));
    return Buffer.concat(parts);
  }
}

function pdfString(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n]/g, ' ');
}

/** Fit an image inside a box while preserving its aspect ratio. */
export function fitImage(pdf, dataUrl, boxW, boxH) {
  const info = pdf.imageInfo(dataUrl);
  if (!info) return null;
  const scale = Math.min(boxW / info.width, boxH / info.height);
  return { width: info.width * scale, height: info.height * scale };
}
