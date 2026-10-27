// Minimal TrueType parser + subsetter used by the built-in PDF writer.
// Handles the tables needed for embedding a Type0/CIDFontType2 font subset.

const TAG = (buf, off) => String.fromCharCode(buf[off], buf[off + 1], buf[off + 2], buf[off + 3]);

function checksum(buf, start = 0, length = buf.length - start) {
  const end = start + length;
  let sum = 0;
  for (let i = start; i < end; i += 4) {
    const b0 = buf[i] ?? 0;
    const b1 = buf[i + 1] ?? 0;
    const b2 = buf[i + 2] ?? 0;
    const b3 = buf[i + 3] ?? 0;
    sum = (sum + ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3)) >>> 0;
  }
  return sum >>> 0;
}

function ceil4(n) {
  return (n + 3) & ~3;
}

export class TrueTypeFont {
  constructor(buffer) {
    this.buf = buffer;
    this.tables = new Map();
    const numTables = buffer.readUInt16BE(4);
    for (let i = 0; i < numTables; i++) {
      const off = 12 + i * 16;
      const tag = TAG(buffer, off);
      this.tables.set(tag, {
        tag,
        checksum: buffer.readUInt32BE(off + 4),
        offset: buffer.readUInt32BE(off + 8),
        length: buffer.readUInt32BE(off + 12),
      });
    }
    this.head = this.#readHead();
    this.hhea = this.#readHhea();
    this.maxp = this.#readMaxp();
    this.cmap = this.#readCmap();
    this.hmtx = this.#readHmtx();
    this.loca = this.#readLoca();
    this.glyf = this.tableData('glyf');
  }

  tableData(tag) {
    const t = this.tables.get(tag);
    if (!t) return null;
    return this.buf.subarray(t.offset, t.offset + t.length);
  }

  #readHead() {
    const t = this.tables.get('head');
    if (!t) throw new Error('Font is missing the head table.');
    const b = this.buf;
    return {
      unitsPerEm: b.readUInt16BE(t.offset + 18),
      xMin: b.readInt16BE(t.offset + 36),
      yMin: b.readInt16BE(t.offset + 38),
      xMax: b.readInt16BE(t.offset + 40),
      yMax: b.readInt16BE(t.offset + 42),
      indexToLocFormat: b.readInt16BE(t.offset + 50),
      table: t,
    };
  }

  #readHhea() {
    const t = this.tables.get('hhea');
    if (!t) throw new Error('Font is missing the hhea table.');
    const b = this.buf;
    return {
      ascender: b.readInt16BE(t.offset + 4),
      descender: b.readInt16BE(t.offset + 6),
      lineGap: b.readInt16BE(t.offset + 8),
      numberOfHMetrics: b.readUInt16BE(t.offset + 34),
      table: t,
    };
  }

  #readMaxp() {
    const t = this.tables.get('maxp');
    if (!t) throw new Error('Font is missing the maxp table.');
    return { numGlyphs: this.buf.readUInt16BE(t.offset + 4), table: t };
  }

  #readCmap() {
    const t = this.tables.get('cmap');
    if (!t) throw new Error('Font is missing the cmap table.');
    const b = this.buf;
    const count = b.readUInt16BE(t.offset + 2);
    const candidates = [];
    for (let i = 0; i < count; i++) {
      const off = t.offset + 4 + i * 8;
      const platform = b.readUInt16BE(off);
      const encoding = b.readUInt16BE(off + 2);
      const sub = t.offset + b.readUInt32BE(off + 4);
      const format = b.readUInt16BE(sub);
      candidates.push({ platform, encoding, sub, format });
    }
    const pick =
      candidates.find((c) => c.format === 12 && c.platform === 3 && c.encoding === 10) ||
      candidates.find((c) => c.format === 4 && c.platform === 3) ||
      candidates.find((c) => c.format === 4) ||
      candidates.find((c) => c.format === 12);
    if (!pick) throw new Error('Unsupported font cmap format.');
    return pick.format === 12 ? this.#readCmap12(pick.sub) : this.#readCmap4(pick.sub);
  }

  #readCmap4(offset) {
    const b = this.buf;
    const segCount = b.readUInt16BE(offset + 6) / 2;
    const endCodes = [];
    const startCodes = [];
    const idDelta = [];
    const idRangeOffset = [];
    const endBase = offset + 14;
    const startBase = endBase + segCount * 2 + 2;
    const deltaBase = startBase + segCount * 2;
    const rangeBase = deltaBase + segCount * 2;
    for (let i = 0; i < segCount; i++) {
      endCodes.push(b.readUInt16BE(endBase + i * 2));
      startCodes.push(b.readUInt16BE(startBase + i * 2));
      idDelta.push(b.readInt16BE(deltaBase + i * 2));
      idRangeOffset.push(b.readUInt16BE(rangeBase + i * 2));
    }
    const lookup = (code) => {
      if (code > 0xffff) return 0;
      for (let i = 0; i < segCount; i++) {
        if (code > endCodes[i]) continue;
        if (code < startCodes[i]) return 0;
        if (idRangeOffset[i] === 0) return (code + idDelta[i]) & 0xffff;
        const glyphOffset = rangeBase + i * 2 + idRangeOffset[i] + (code - startCodes[i]) * 2;
        const gid = b.readUInt16BE(glyphOffset);
        return gid === 0 ? 0 : (gid + idDelta[i]) & 0xffff;
      }
      return 0;
    };
    return { lookup };
  }

  #readCmap12(offset) {
    const b = this.buf;
    const groups = b.readUInt32BE(offset + 12);
    const groupList = [];
    for (let i = 0; i < groups; i++) {
      const off = offset + 16 + i * 12;
      groupList.push({
        start: b.readUInt32BE(off),
        end: b.readUInt32BE(off + 4),
        startGid: b.readUInt32BE(off + 8),
      });
    }
    const lookup = (code) => {
      for (const g of groupList) {
        if (code >= g.start && code <= g.end) return g.startGid + (code - g.start);
      }
      return 0;
    };
    return { lookup };
  }

  #readHmtx() {
    const t = this.tables.get('hmtx');
    const b = this.buf;
    const n = this.hhea.numberOfHMetrics;
    const numGlyphs = this.maxp.numGlyphs;
    return {
      advance(gid) {
        if (gid < n) return b.readUInt16BE(t.offset + gid * 4);
        return b.readUInt16BE(t.offset + (n - 1) * 4);
      },
      lsb(gid) {
        if (gid < n) return b.readInt16BE(t.offset + gid * 4 + 2);
        return b.readInt16BE(t.offset + n * 4 + (gid - n) * 2);
      },
      numGlyphs,
    };
  }

  #readLoca() {
    const t = this.tables.get('loca');
    const count = this.maxp.numGlyphs + 1;
    const offsets = new Array(count);
    const long = this.head.indexToLocFormat === 1;
    for (let i = 0; i < count; i++) {
      offsets[i] = long ? this.buf.readUInt32BE(t.offset + i * 4) : this.buf.readUInt16BE(t.offset + i * 2) * 2;
    }
    return offsets;
  }

  glyphForChar(ch) {
    const code = ch.codePointAt(0);
    if (code > 0xffff) return 0;
    return this.cmap.lookup(code) || 0;
  }

  /** Glyph advance width in 1000-unit text space. */
  widthOfChar(ch) {
    const gid = this.glyphForChar(ch);
    return (this.hmtx.advance(gid) * 1000) / this.head.unitsPerEm;
  }

  advance(gid) {
    return (this.hmtx.advance(gid) * 1000) / this.head.unitsPerEm;
  }

  /** Resolve composite glyph component IDs recursively. */
  #components(gid, set) {
    const start = this.loca[gid];
    const end = this.loca[gid + 1];
    if (end <= start) return;
    const g = this.glyf;
    if (g.readInt16BE(start) >= 0) return;
    let p = start + 10;
    for (;;) {
      const flags = g.readUInt16BE(p);
      const comp = g.readUInt16BE(p + 2);
      if (comp && !set.has(comp)) {
        set.add(comp);
        this.#components(comp, set);
      }
      p += 4;
      p += flags & 0x0001 ? 4 : 2; // ARG_1_AND_2_ARE_WORDS
      if (flags & 0x0008) p += 2; // WE_HAVE_A_SCALE
      else if (flags & 0x0040) p += 4; // X_AND_Y_SCALE
      else if (flags & 0x0080) p += 8; // TWO_BY_TWO
      if (!(flags & 0x0020)) break; // MORE_COMPONENTS
    }
  }

  /** Rewrite composite glyph component indexes in a copied glyph. */
  #remapComposite(glyphBytes, gidMap) {
    const buf = Buffer.from(glyphBytes);
    if (buf.readInt16BE(0) >= 0) return buf;
    let p = 10;
    for (;;) {
      const flags = buf.readUInt16BE(p);
      const comp = buf.readUInt16BE(p + 2);
      const mapped = gidMap.get(comp);
      if (mapped !== undefined) buf.writeUInt16BE(mapped, p + 2);
      p += 4;
      p += flags & 0x0001 ? 4 : 2;
      if (flags & 0x0008) p += 2;
      else if (flags & 0x0040) p += 4;
      else if (flags & 0x0080) p += 8;
      if (!(flags & 0x0020)) break;
    }
    return buf;
  }

  /**
   * Build a subset font containing the glyphs for `chars`.
   * Returns object with the font program, CID mapping and widths.
   */
  subset(chars) {
    const used = new Set([0]);
    const charToOldGid = new Map();
    for (const ch of chars) {
      const gid = this.glyphForChar(ch);
      charToOldGid.set(ch, gid);
      if (!used.has(gid)) {
        used.add(gid);
        this.#components(gid, used);
      }
    }
    // Ensure glyph 0 is included; assign new glyph IDs in ascending old order.
    const oldGids = [...used].sort((a, b) => a - b);
    const gidMap = new Map();
    oldGids.forEach((gid, i) => gidMap.set(gid, i));
    const numGlyphs = oldGids.length;

    // glyf + loca
    const glyphBuffers = [];
    const loca = [0];
    let glyfLength = 0;
    for (const oldGid of oldGids) {
      const start = this.loca[oldGid];
      const end = this.loca[oldGid + 1];
      let bytes = Buffer.alloc(0);
      if (end > start) {
        bytes = this.#remapComposite(this.glyf.subarray(start, end), gidMap);
      }
      const padded = Buffer.alloc(ceil4(bytes.length));
      bytes.copy(padded);
      glyphBuffers.push(padded);
      glyfLength += padded.length;
      loca.push(glyfLength);
    }
    const glyf = Buffer.concat(glyphBuffers);
    const locaBuf = Buffer.alloc(loca.length * 4);
    loca.forEach((off, i) => locaBuf.writeUInt32BE(off, i * 4));

    // hmtx
    const hmtx = Buffer.alloc(numGlyphs * 4);
    oldGids.forEach((oldGid, i) => {
      hmtx.writeUInt16BE(this.hmtx.advance(oldGid), i * 4);
      hmtx.writeInt16BE(this.hmtx.lsb(oldGid), i * 4 + 2);
    });

    // head (patch indexToLocFormat -> long, checksum adjustment -> 0)
    const head = Buffer.from(this.tableData('head'));
    head.writeUInt32BE(0, 8);
    head.writeInt16BE(1, 50);

    // hhea (numberOfHMetrics = glyph count)
    const hhea = Buffer.from(this.tableData('hhea'));
    hhea.writeUInt16BE(numGlyphs, 34);

    // maxp (numGlyphs)
    const maxp = Buffer.from(this.tableData('maxp'));
    maxp.writeUInt16BE(numGlyphs, 4);

    const tables = [
      { tag: 'head', data: head },
      { tag: 'hhea', data: hhea },
      { tag: 'maxp', data: maxp },
      { tag: 'hmtx', data: hmtx },
      { tag: 'loca', data: locaBuf },
      { tag: 'glyf', data: glyf },
    ];
    tables.sort((a, b) => a.tag.localeCompare(b.tag));

    const numTables = tables.length;
    const entrySelector = Math.floor(Math.log2(numTables));
    const searchRange = 16 * 2 ** entrySelector;
    const header = Buffer.alloc(12 + numTables * 16);
    header.writeUInt32BE(0x00010000, 0);
    header.writeUInt16BE(numTables, 4);
    header.writeUInt16BE(searchRange, 6);
    header.writeUInt16BE(entrySelector, 8);
    header.writeUInt16BE(numTables * 16 - searchRange, 10);

    let offset = header.length;
    const parts = [header];
    const tableOffsets = new Map();
    for (const t of tables) {
      const padded = Buffer.alloc(ceil4(t.data.length));
      t.data.copy(padded);
      tableOffsets.set(t.tag, { offset, length: t.data.length, checksum: checksum(padded) });
      parts.push(padded);
      offset += padded.length;
    }
    tables.forEach((t, i) => {
      const entry = 12 + i * 16;
      header.write(t.tag, entry, 4, 'ascii');
      const info = tableOffsets.get(t.tag);
      header.writeUInt32BE(info.checksum, entry + 4);
      header.writeUInt32BE(info.offset, entry + 8);
      header.writeUInt32BE(info.length, entry + 12);
    });

    const fontBuf = Buffer.concat(parts);
    const adjustment = (0xb1b0afba - checksum(fontBuf)) >>> 0;
    const headInfo = tableOffsets.get('head');
    fontBuf.writeUInt32BE(adjustment, headInfo.offset + 8);

    // CID mapping (CID = new glyph ID) and widths
    const cidForChar = new Map();
    for (const [ch, oldGid] of charToOldGid) cidForChar.set(ch, gidMap.get(oldGid));
    const gidToChar = new Map();
    for (const [ch, cid] of cidForChar) if (!gidToChar.has(cid)) gidToChar.set(cid, ch);

    const widths = oldGids.map((gid) => Math.round((this.hmtx.advance(gid) * 1000) / this.head.unitsPerEm));
    return {
      fontBuffer: fontBuf,
      cidForChar,
      gidToChar,
      widths,
      unitsPerEm: this.head.unitsPerEm,
      ascent: this.hhea.ascender,
      descent: this.hhea.descender,
      bbox: [this.head.xMin, this.head.yMin, this.head.xMax, this.head.yMax],
      numGlyphs,
    };
  }
}
