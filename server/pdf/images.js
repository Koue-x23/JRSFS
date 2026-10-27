// Decode PNG / JPEG data URLs into raw RGB suitable for embedding in a PDF.
import zlib from 'node:zlib';

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilter(raw, width, height, bpp, rowBytes) {
  const out = Buffer.alloc(rowBytes * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const rowStart = y * rowBytes;
    const prevStart = (y - 1) * rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const rawByte = raw[pos++];
      const left = x >= bpp ? out[rowStart + x - bpp] : 0;
      const up = y > 0 ? out[prevStart + x] : 0;
      const upLeft = y > 0 && x >= bpp ? out[prevStart + x - bpp] : 0;
      let val;
      switch (filter) {
        case 0:
          val = rawByte;
          break;
        case 1:
          val = rawByte + left;
          break;
        case 2:
          val = rawByte + up;
          break;
        case 3:
          val = rawByte + ((left + up) >> 1);
          break;
        case 4:
          val = rawByte + paeth(left, up, upLeft);
          break;
        default:
          throw new Error(`Unsupported PNG filter ${filter}.`);
      }
      out[rowStart + x] = val & 0xff;
    }
  }
  return out;
}

function parsePng(buf) {
  let pos = 8;
  let ihdr = null;
  const idat = [];
  let palette = null;
  let transparency = null;
  while (pos < buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        interlace: data[12],
      };
    } else if (type === 'PLTE') {
      palette = Buffer.from(data);
    } else if (type === 'tRNS') {
      transparency = Buffer.from(data);
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + length;
  }
  if (!ihdr) throw new Error('Invalid PNG file.');
  if (ihdr.compression !== 0) throw new Error('Unsupported PNG compression.');
  if (ihdr.interlace !== 0) throw new Error('Interlaced PNG images are not supported.');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr.colorType];
  if (!channels) throw new Error('Unsupported PNG color type.');
  if (ihdr.bitDepth !== 8 && !(ihdr.colorType === 3 && [1, 2, 4].includes(ihdr.bitDepth))) {
    throw new Error('Unsupported PNG bit depth.');
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bitsPerPixel = ihdr.bitDepth * channels;
  const bpp = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const rowBytes = Math.ceil((ihdr.width * bitsPerPixel) / 8);
  const scan = unfilter(raw, ihdr.width, ihdr.height, bpp, rowBytes);

  const rgb = Buffer.alloc(ihdr.width * ihdr.height * 3);
  const alphaAt = (x, y) => {
    // returns 0..255 alpha
    if (ihdr.colorType === 6) return scan[y * rowBytes + x * 4 + 3];
    if (ihdr.colorType === 4) return scan[y * rowBytes + x * 2 + 1];
    if (ihdr.colorType === 3 && transparency) {
      const idx = scan[y * rowBytes + x];
      return idx < transparency.length ? transparency[idx] : 255;
    }
    return 255;
  };
  const pixel = (x, y) => {
    const row = y * rowBytes;
    if (ihdr.colorType === 3) {
      let idx;
      if (ihdr.bitDepth === 8) idx = scan[row + x];
      else {
        const perByte = 8 / ihdr.bitDepth;
        const byte = scan[row + Math.floor(x / perByte)];
        const shift = 8 - ihdr.bitDepth * ((x % perByte) + 1);
        idx = (byte >> shift) & ((1 << ihdr.bitDepth) - 1);
      }
      if (!palette) return [0, 0, 0];
      return [palette[idx * 3], palette[idx * 3 + 1], palette[idx * 3 + 2]];
    }
    if (ihdr.colorType === 0) {
      const v = scan[row + x];
      return [v, v, v];
    }
    if (ihdr.colorType === 4) {
      const v = scan[row + x * 2];
      return [v, v, v];
    }
    if (ihdr.colorType === 2) {
      return [scan[row + x * 3], scan[row + x * 3 + 1], scan[row + x * 3 + 2]];
    }
    return [scan[row + x * 4], scan[row + x * 4 + 1], scan[row + x * 4 + 2]];
  };
  for (let y = 0; y < ihdr.height; y++) {
    for (let x = 0; x < ihdr.width; x++) {
      const [r, g, b] = pixel(x, y);
      const a = alphaAt(x, y) / 255;
      const o = (y * ihdr.width + x) * 3;
      // Composite over white: documents always print on white paper.
      rgb[o] = Math.round(r * a + 255 * (1 - a));
      rgb[o + 1] = Math.round(g * a + 255 * (1 - a));
      rgb[o + 2] = Math.round(b * a + 255 * (1 - a));
    }
  }
  return { width: ihdr.width, height: ihdr.height, rgb, kind: 'png' };
}

function parseJpeg(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('Invalid JPEG file.');
  let pos = 2;
  let info = null;
  while (pos < buf.length - 1) {
    if (buf[pos] !== 0xff) {
      pos++;
      continue;
    }
    const marker = buf[pos + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      pos += 2;
      continue;
    }
    const length = buf.readUInt16BE(pos + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      info = {
        height: buf.readUInt16BE(pos + 5),
        width: buf.readUInt16BE(pos + 7),
        components: buf[pos + 9],
      };
      break;
    }
    pos += 2 + length;
  }
  if (!info) throw new Error('Could not read JPEG dimensions.');
  if (![1, 3].includes(info.components)) throw new Error('Unsupported JPEG color space.');
  return {
    width: info.width,
    height: info.height,
    jpeg: buf,
    colorSpace: info.components === 1 ? 'DeviceGray' : 'DeviceRGB',
    kind: 'jpeg',
  };
}

/** @returns {{width:number,height:number,kind:'png'|'jpeg',rgb?:Buffer,jpeg?:Buffer,colorSpace?:string}} */
export function decodeImageDataUrl(dataUrl) {
  const match = /^data:([a-zA-Z0-9+./-]+);base64,(.*)$/s.exec(String(dataUrl || ''));
  if (!match) throw new Error('Image must be a base64 data URL.');
  const mime = match[1].toLowerCase();
  const buf = Buffer.from(match[2], 'base64');
  if (mime === 'image/png' || buf.subarray(0, 8).equals(PNG_SIG)) return parsePng(buf);
  if (mime === 'image/jpeg' || mime === 'image/jpg') return parseJpeg(buf);
  throw new Error('Only PNG and JPEG images can be embedded. WebP uploads are converted automatically in the browser.');
}
