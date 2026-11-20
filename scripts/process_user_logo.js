// =========================================================================
// REGISTRE DIARI EF — User Logo Processor & Multi-Asset Icon Generator
// =========================================================================
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const OUT = path.join(ROOT, 'icons');
fs.mkdirSync(OUT, { recursive: true });

const INPUT_IMG = 'C:/Users/mipas/.gemini/antigravity/brain/d1daae96-139b-4e66-968d-a196fb87f668/.user_uploaded/media_1795209919146_42ec8baa.png';

console.log('Reading source logo from:', INPUT_IMG);
const fileBuf = fs.readFileSync(INPUT_IMG);

// 1. Parse PNG chunks and decompress IDAT
let pos = 8;
const idats = [];
while (pos < fileBuf.length) {
  const len = fileBuf.readUInt32BE(pos);
  const type = fileBuf.toString('ascii', pos + 4, pos + 8);
  if (type === 'IDAT') idats.push(fileBuf.subarray(pos + 8, pos + 8 + len));
  pos += 12 + len;
}
const decomp = zlib.inflateSync(Buffer.concat(idats));

const srcW = 1024;
const srcH = 572;
const bpp = 4;
const stride = srcW * bpp;
const srcPixels = Buffer.alloc(srcW * srcH * bpp);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

for (let y = 0; y < srcH; y++) {
  const filter = decomp[y * (stride + 1)];
  const srcRow = y * (stride + 1) + 1;
  const dstRow = y * stride;
  const prevRow = (y - 1) * stride;

  for (let x = 0; x < stride; x++) {
    const byte = decomp[srcRow + x];
    const left = x >= bpp ? srcPixels[dstRow + x - bpp] : 0;
    const up = y > 0 ? srcPixels[prevRow + x] : 0;
    const upLeft = (y > 0 && x >= bpp) ? srcPixels[prevRow + x - bpp] : 0;

    let val = 0;
    if (filter === 0) val = byte;
    else if (filter === 1) val = (byte + left) & 0xff;
    else if (filter === 2) val = (byte + up) & 0xff;
    else if (filter === 3) val = (byte + Math.floor((left + up) / 2)) & 0xff;
    else if (filter === 4) val = (byte + paeth(left, up, upLeft)) & 0xff;

    srcPixels[dstRow + x] = val;
  }
}

// 2. Compute exact bounding box of the logo
let minX = srcW, maxX = 0, minY = srcH, maxY = 0;
for (let y = 0; y < srcH; y++) {
  for (let x = 0; x < srcW; x++) {
    const idx = (y * srcW + x) * 4;
    const r = srcPixels[idx], g = srcPixels[idx + 1], b = srcPixels[idx + 2];
    if (r < 242 || g < 242 || b < 242) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

const cropW = maxX - minX + 1;
const cropH = maxY - minY + 1;
console.log(`Cropped logo dimensions: ${cropW} x ${cropH} at (${minX}, ${minY})`);

// 3. Extract cropped logo with mathematical alpha unblending against white background
const croppedLogo = Buffer.alloc(cropW * cropH * 4);
for (let cy = 0; cy < cropH; cy++) {
  const sy = minY + cy;
  for (let cx = 0; cx < cropW; cx++) {
    const sx = minX + cx;
    const sIdx = (sy * srcW + sx) * 4;
    const dIdx = (cy * cropW + cx) * 4;

    const r = srcPixels[sIdx];
    const g = srcPixels[sIdx + 1];
    const b = srcPixels[sIdx + 2];

    const minC = Math.min(r, g, b);
    let alpha = 255 - minC;

    // Gentle thresholding for clean background
    if (alpha <= 2) {
      croppedLogo[dIdx] = 0;
      croppedLogo[dIdx + 1] = 0;
      croppedLogo[dIdx + 2] = 0;
      croppedLogo[dIdx + 3] = 0;
    } else {
      const aFrac = alpha / 255;
      const unR = Math.min(255, Math.max(0, Math.round((r - 255 * (1 - aFrac)) / aFrac)));
      const unG = Math.min(255, Math.max(0, Math.round((g - 255 * (1 - aFrac)) / aFrac)));
      const unB = Math.min(255, Math.max(0, Math.round((b - 255 * (1 - aFrac)) / aFrac)));

      croppedLogo[dIdx] = unR;
      croppedLogo[dIdx + 1] = unG;
      croppedLogo[dIdx + 2] = unB;
      croppedLogo[dIdx + 3] = alpha;
    }
  }
}

// 4. Function to render square canvas at target size with specific scaling & background
function renderCanvas(targetSize, scale = 0.88, whiteBg = false) {
  const outBuf = Buffer.alloc(targetSize * targetSize * 4);

  // Fill background
  if (whiteBg) {
    for (let i = 0; i < outBuf.length; i += 4) {
      outBuf[i] = 255;
      outBuf[i + 1] = 255;
      outBuf[i + 2] = 255;
      outBuf[i + 3] = 255;
    }
  }

  // Calculate target logo dimensions centered inside canvas
  const maxLogoDim = targetSize * scale;
  const ratio = Math.min(maxLogoDim / cropW, maxLogoDim / cropH);
  const fitW = cropW * ratio;
  const fitH = cropH * ratio;
  const startX = (targetSize - fitW) / 2;
  const startY = (targetSize - fitH) / 2;

  // Bilinear sampling from croppedLogo
  for (let dy = 0; dy < targetSize; dy++) {
    const srcY = (dy - startY) / ratio;
    if (srcY < 0 || srcY >= cropH - 1) continue;
    const y0 = Math.floor(srcY);
    const y1 = Math.min(cropH - 1, y0 + 1);
    const fy = srcY - y0;

    for (let dx = 0; dx < targetSize; dx++) {
      const srcX = (dx - startX) / ratio;
      if (srcX < 0 || srcX >= cropW - 1) continue;
      const x0 = Math.floor(srcX);
      const x1 = Math.min(cropW - 1, x0 + 1);
      const fx = srcX - x0;

      const i00 = (y0 * cropW + x0) * 4;
      const i10 = (y0 * cropW + x1) * 4;
      const i01 = (y1 * cropW + x0) * 4;
      const i11 = (y1 * cropW + x1) * 4;

      // Sample RGBA
      const a00 = croppedLogo[i00 + 3] / 255;
      const a10 = croppedLogo[i10 + 3] / 255;
      const a01 = croppedLogo[i01 + 3] / 255;
      const a11 = croppedLogo[i11 + 3] / 255;

      const alpha = (1 - fy) * ((1 - fx) * a00 + fx * a10) + fy * ((1 - fx) * a01 + fx * a11);
      if (alpha <= 0.003) continue;

      const r = (1 - fy) * ((1 - fx) * croppedLogo[i00] * a00 + fx * croppedLogo[i10] * a10) +
                fy * ((1 - fx) * croppedLogo[i01] * a01 + fx * croppedLogo[i11] * a11);
      const g = (1 - fy) * ((1 - fx) * croppedLogo[i00 + 1] * a00 + fx * croppedLogo[i10 + 1] * a10) +
                fy * ((1 - fx) * croppedLogo[i01 + 1] * a01 + fx * croppedLogo[i11 + 1] * a11);
      const b = (1 - fy) * ((1 - fx) * croppedLogo[i00 + 2] * a00 + fx * croppedLogo[i10 + 2] * a10) +
                fy * ((1 - fx) * croppedLogo[i01 + 2] * a01 + fx * croppedLogo[i11 + 2] * a11);

      const dIdx = (dy * targetSize + dx) * 4;
      const finalR = Math.min(255, Math.round(r / alpha));
      const finalG = Math.min(255, Math.round(g / alpha));
      const finalB = Math.min(255, Math.round(b / alpha));
      const finalA = Math.min(255, Math.round(alpha * 255));

      if (whiteBg) {
        // Blend on top of white
        const outA = finalA / 255;
        outBuf[dIdx] = Math.round(finalR * outA + 255 * (1 - outA));
        outBuf[dIdx + 1] = Math.round(finalG * outA + 255 * (1 - outA));
        outBuf[dIdx + 2] = Math.round(finalB * outA + 255 * (1 - outA));
        outBuf[dIdx + 3] = 255;
      } else {
        outBuf[dIdx] = finalR;
        outBuf[dIdx + 1] = finalG;
        outBuf[dIdx + 2] = finalB;
        outBuf[dIdx + 3] = finalA;
      }
    }
  }

  return outBuf;
}

// 5. PNG / ICO Encoding utilities
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

// 6. Generate all PNG assets
const anySizes = [16, 32, 48, 64, 72, 96, 128, 144, 152, 167, 180, 192, 256, 384, 512];
const transparentPngMap = new Map();

for (const sz of anySizes) {
  const pixels = renderCanvas(sz, 0.88, false);
  const png = encodePNG(sz, pixels);
  transparentPngMap.set(sz, png);

  if ([32, 48, 72, 96, 128, 144, 152, 167, 180, 192, 256, 384, 512].includes(sz)) {
    const fPath = path.join(OUT, `icon-${sz}.png`);
    fs.writeFileSync(fPath, png);
    console.log(`Generated: icons/icon-${sz}.png`);
  }
}

// Save high-res app logo for UI
fs.writeFileSync(path.join(OUT, 'logo.png'), transparentPngMap.get(512));
console.log('Generated: icons/logo.png');

// 7. Multi-resolution Favicon.ico
const icoSizes = [16, 32, 48, 64, 128, 256];
const icoBuf = encodeICO(icoSizes.map((size) => ({ size, png: transparentPngMap.get(size) })));
fs.writeFileSync(path.join(OUT, 'favicon.ico'), icoBuf);
fs.writeFileSync(path.join(ROOT, 'favicon.ico'), icoBuf);
console.log('Generated: icons/favicon.ico & ./favicon.ico');

// 8. Maskable icons for Android (with 18% safe padding and white bg)
for (const sz of [192, 512]) {
  const pixels = renderCanvas(sz, 0.72, true);
  const png = encodePNG(sz, pixels);
  fs.writeFileSync(path.join(OUT, `icon-maskable-${sz}.png`), png);
  console.log(`Generated: icons/icon-maskable-${sz}.png`);
}

// 9. Apple Touch Icons (iOS Homescreen with crisp white background & 10% padding)
const appleIcon180 = encodePNG(180, renderCanvas(180, 0.82, true));
fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), appleIcon180);
fs.writeFileSync(path.join(OUT, 'apple-touch-icon-180x180.png'), appleIcon180);
fs.writeFileSync(path.join(ROOT, 'apple-touch-icon.png'), appleIcon180);
fs.writeFileSync(path.join(ROOT, 'apple-touch-icon-precomposed.png'), appleIcon180);

for (const sz of [152, 167]) {
  const buf = encodePNG(sz, renderCanvas(sz, 0.82, true));
  fs.writeFileSync(path.join(OUT, `apple-touch-icon-${sz}x${sz}.png`), buf);
  console.log(`Generated: icons/apple-touch-icon-${sz}x${sz}.png`);
}

// 10. Generate Vector SVG version (with embedded high-res base64 data URI for 100% pixel fidelity across all browsers)
const base64Data = transparentPngMap.get(512).toString('base64');
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <image href="data:image/png;base64,${base64Data}" x="0" y="0" width="512" height="512" preserveAspectRatio="xMidYMid meet" />
</svg>
`;
fs.writeFileSync(path.join(OUT, 'favicon.svg'), svgIcon, 'utf8');
console.log('Generated: icons/favicon.svg');

console.log('✓ All REGISTRE EF logo assets processed and generated successfully!');
