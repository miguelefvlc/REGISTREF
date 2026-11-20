// Generates all PWA / Desktop / Mobile / Tablet PNG, SVG, and ICO icons for REGISTRE EF (no external dependencies).
// Usage: node scripts/make_icons.js
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'icons');
fs.mkdirSync(OUT, { recursive: true });

// Sophisticated Academic & Sports Palette
const BG_DARK = [15, 23, 42, 255];         // #0F172A (Deep Slate)
const TRANSPARENT = [0, 0, 0, 0];
const BADGE_BG = [15, 23, 42, 255];        // #0F172A
const BADGE_RING = [56, 189, 248, 255];    // #38BDF8 (Sky Accent Ring)
const SHEET_WHITE = [248, 250, 252, 255];  // #F8FAFC
const HEADER_BLUE = [2, 132, 199, 255];    // #0284C7
const HEADER_AMBER = [217, 119, 6, 255];   // #D97706
const MARK_RED = [225, 29, 72, 255];       // #E11D48 (Crimson Painted Cell)
const GRID_LINE = [203, 213, 225, 255];    // #CBD5E1

function inRoundedRect(x, y, rx, ry, rw, rh, rad) {
  if (x < rx || x > rx + rw || y < ry || y > ry + rh) return false;
  const cx = Math.max(rx + rad, Math.min(x, rx + rw - rad));
  const cy = Math.max(ry + rad, Math.min(y, ry + rh - rad));
  return Math.hypot(x - cx, y - cy) <= rad;
}

// Evaluates point (u, v) in [-1, 1] x [-1, 1] mapped to 64x64 viewBox
function sampleRegistreIcon(uRaw, vRaw, scale, transparentOutside = false) {
  const outsideColor = transparentOutside ? TRANSPARENT : BG_DARK;
  const u = uRaw / scale;
  const v = vRaw / scale;

  const x = 32 + u * 30.5;
  const y = 32 + v * 30.5;

  // 1. Circular badge: cx=32, cy=32, r=28.5
  const distCenter = Math.hypot(x - 32, y - 32);
  if (distCenter > 29.5) {
    return outsideColor;
  }

  let color = distCenter >= 27.3 ? BADGE_RING : BADGE_BG;

  // 2. Crisp Document / Grid Sheet inside badge: x in [15, 49], y in [14, 50], radius 4
  if (inRoundedRect(x, y, 15, 14, 34, 36, 3.5)) {
    color = SHEET_WHITE;

    // Top Category Headers (y in [14, 21])
    if (y <= 21) {
      color = x < 32 ? HEADER_BLUE : HEADER_AMBER;
    } else {
      // 3x3 Grid inside sheet: columns at [15..26.3..37.6..49], rows at [21..30.6..40.3..50]
      // Painted Crimson Cells: (col 1, row 1), (col 3, row 2), (col 2, row 3)
      const col = x < 26.33 ? 0 : (x < 37.66 ? 1 : 2);
      const row = y < 30.66 ? 0 : (y < 40.33 ? 1 : 2);

      if ((col === 0 && row === 0) || (col === 2 && row === 1) || (col === 1 && row === 2)) {
        if (
          x > 16.2 && x < 47.8 && y > 22.2 && y < 48.8 &&
          Math.abs(x - 26.33) > 1.1 && Math.abs(x - 37.66) > 1.1 &&
          Math.abs(y - 30.66) > 1.1 && Math.abs(y - 40.33) > 1.1
        ) {
          color = MARK_RED;
        }
      }

      // Grid lines
      if (
        Math.abs(x - 26.33) <= 0.65 ||
        Math.abs(x - 37.66) <= 0.65 ||
        Math.abs(y - 21.0) <= 0.75 ||
        Math.abs(y - 30.66) <= 0.65 ||
        Math.abs(y - 40.33) <= 0.65
      ) {
        color = GRID_LINE;
      }
    }
  }

  return color;
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePNG(size, pixelsRgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    pixelsRgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function encodeICO(pngEntries) {
  const count = pngEntries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  let offset = 6 + count * 16;

  for (const { size, png } of pngEntries) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    offset += png.length;
  }

  return Buffer.concat([header, ...dirEntries, ...pngEntries.map((e) => e.png)]);
}

function render(size, scale = 1.0, transparentOutside = false) {
  const SS = 4;
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rAcc = 0, gAcc = 0, bAcc = 0, aAcc = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = ((x + (sx + 0.5) / SS) / size) * 2 - 1;
          const v = ((y + (sy + 0.5) / SS) / size) * 2 - 1;
          const c = sampleRegistreIcon(u, v, scale, transparentOutside);
          const alpha = c[3] / 255;
          rAcc += c[0] * alpha;
          gAcc += c[1] * alpha;
          bAcc += c[2] * alpha;
          aAcc += c[3];
        }
      }
      const n = SS * SS;
      const finalA = Math.round(aAcc / n);
      const i = (y * size + x) * 4;
      if (finalA === 0) {
        px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; px[i + 3] = 0;
      } else {
        const weight = aAcc / 255;
        px[i] = Math.min(255, Math.round(rAcc / weight));
        px[i + 1] = Math.min(255, Math.round(gAcc / weight));
        px[i + 2] = Math.min(255, Math.round(bAcc / weight));
        px[i + 3] = finalA;
      }
    }
  }
  return encodePNG(size, px);
}

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <circle cx="32" cy="32" r="28.4" fill="#0F172A" stroke="#38BDF8" stroke-width="2.2"/>
  <rect x="15" y="14" width="34" height="36" rx="3.5" fill="#F8FAFC"/>
  <path d="M15 17.5C15 15.567 16.567 14 18.5 14H32V21H15V17.5Z" fill="#0284C7"/>
  <path d="M32 14H45.5C47.433 14 49 15.567 49 17.5V21H32V14Z" fill="#D97706"/>
  <rect x="16.5" y="22.5" width="8.5" height="7" rx="1.2" fill="#E11D48"/>
  <rect x="39" y="32" width="8.5" height="7" rx="1.2" fill="#E11D48"/>
  <rect x="27.75" y="41.5" width="8.5" height="7" rx="1.2" fill="#E11D48"/>
  <line x1="26.33" y1="21" x2="26.33" y2="50" stroke="#CBD5E1" stroke-width="1.2"/>
  <line x1="37.66" y1="21" x2="37.66" y2="50" stroke="#CBD5E1" stroke-width="1.2"/>
  <line x1="15" y1="30.66" x2="49" y2="30.66" stroke="#CBD5E1" stroke-width="1.2"/>
  <line x1="15" y1="40.33" x2="49" y2="40.33" stroke="#CBD5E1" stroke-width="1.2"/>
</svg>
`;

fs.writeFileSync(path.join(OUT, 'favicon.svg'), svgContent, 'utf8');
console.log('Generated: icons/favicon.svg');

const anySizes = [16, 32, 48, 64, 72, 96, 128, 144, 152, 167, 180, 192, 256, 384, 512];
const pngCache = new Map();

for (const size of anySizes) {
  const buf = render(size, 1.0, true);
  pngCache.set(size, buf);
  if ([32, 48, 72, 96, 128, 144, 152, 167, 180, 192, 256, 384, 512].includes(size)) {
    const fileName = `icon-${size}.png`;
    fs.writeFileSync(path.join(OUT, fileName), buf);
    console.log(`Generated: icons/${fileName}`);
  }
}

const icoSizes = [16, 32, 48, 64, 128, 256];
const icoBuf = encodeICO(icoSizes.map((size) => ({ size, png: pngCache.get(size) })));
fs.writeFileSync(path.join(OUT, 'favicon.ico'), icoBuf);
fs.writeFileSync(path.join(ROOT, 'favicon.ico'), icoBuf);
console.log('Generated: icons/favicon.ico & ./favicon.ico');

for (const size of [192, 512]) {
  const fileName = `icon-maskable-${size}.png`;
  const buf = render(size, 0.84, false);
  fs.writeFileSync(path.join(OUT, fileName), buf);
  console.log(`Generated: icons/${fileName}`);
}

const appleIcon180 = render(180, 0.92, false);
fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), appleIcon180);
fs.writeFileSync(path.join(OUT, 'apple-touch-icon-180x180.png'), appleIcon180);
fs.writeFileSync(path.join(ROOT, 'apple-touch-icon.png'), appleIcon180);
fs.writeFileSync(path.join(ROOT, 'apple-touch-icon-precomposed.png'), appleIcon180);
console.log('Generated: icons/apple-touch-icon.png & ./apple-touch-icon.png');

for (const size of [152, 167]) {
  const buf = render(size, 0.92, false);
  fs.writeFileSync(path.join(OUT, `apple-touch-icon-${size}x${size}.png`), buf);
  console.log(`Generated: icons/apple-touch-icon-${size}x${size}.png`);
}
