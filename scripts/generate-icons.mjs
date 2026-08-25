/**
 * Generates the PWA icon set as PNG files, with no image dependencies.
 *
 * The mark is drawn from rounded line segments (capsules) and rasterised with 4x4
 * supersampling, then encoded as a PNG by hand. Running `npm run icons` regenerates
 * everything in public/icons.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BRAND = [13, 108, 92];
const INK = [255, 255, 255];

/** The rupee mark, as line segments in a unit square. */
const GLYPH = [
  // Two horizontal bars.
  { a: [0.3, 0.28], b: [0.72, 0.28], w: 0.075 },
  { a: [0.3, 0.42], b: [0.72, 0.42], w: 0.075 },
  // Bowl: down the stem, then back across to the left.
  { a: [0.63, 0.3], b: [0.63, 0.5], w: 0.075 },
  { a: [0.63, 0.5], b: [0.56, 0.565], w: 0.075 },
  { a: [0.58, 0.575], b: [0.33, 0.575], w: 0.075 },
  // Leg down to the baseline.
  { a: [0.42, 0.575], b: [0.71, 0.82], w: 0.075 },
];

function distanceToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function insideGlyph(x, y, scale, centre) {
  // Map the unit square through the requested scale about the icon centre.
  const gx = (x - centre) / scale + 0.5;
  const gy = (y - centre) / scale + 0.5;
  return GLYPH.some(({ a, b, w }) => distanceToSegment(gx, gy, a, b) <= w / 2);
}

function insideRoundedSquare(x, y, radius) {
  const dx = Math.max(radius - x, 0, x - (1 - radius));
  const dy = Math.max(radius - y, 0, y - (1 - radius));
  if (dx === 0 || dy === 0) return x >= 0 && x <= 1 && y >= 0 && y <= 1;
  return Math.hypot(dx, dy) <= radius;
}

/** Renders one icon into raw RGBA bytes. */
function renderIcon(size, { maskable }) {
  const pixels = Buffer.alloc(size * size * 4);
  const samples = 4;
  // A maskable icon may be cropped to a circle, so the mark is kept well inside.
  const cornerRadius = maskable ? 0.5 : 0.22;
  const glyphScale = maskable ? 0.62 : 0.86;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let backgroundHits = 0;
      let glyphHits = 0;

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const x = (px + (sx + 0.5) / samples) / size;
          const y = (py + (sy + 0.5) / samples) / size;
          const inBackground = maskable ? true : insideRoundedSquare(x, y, cornerRadius);
          if (inBackground) backgroundHits += 1;
          if (inBackground && insideGlyph(x, y, glyphScale, 0.5)) glyphHits += 1;
        }
      }

      const total = samples * samples;
      const backgroundAlpha = backgroundHits / total;
      const glyphAlpha = glyphHits / total;
      const offset = (py * size + px) * 4;

      for (let channel = 0; channel < 3; channel += 1) {
        const base = BRAND[channel];
        const blended = base + (INK[channel] - base) * (backgroundAlpha === 0 ? 0 : glyphAlpha / Math.max(backgroundAlpha, glyphAlpha));
        pixels[offset + channel] = Math.round(blended);
      }
      pixels[offset + 3] = Math.round(backgroundAlpha * 255);
    }
  }

  return pixels;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  // One filter byte (0 = None) per scanline.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const TARGETS = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
  { file: 'favicon-32.png', size: 32, maskable: false },
];

mkdirSync(OUT_DIR, { recursive: true });
for (const target of TARGETS) {
  const png = encodePng(target.size, renderIcon(target.size, { maskable: target.maskable }));
  writeFileSync(join(OUT_DIR, target.file), png);
  console.log(`wrote ${target.file} (${target.size}x${target.size}, ${png.length} bytes)`);
}
