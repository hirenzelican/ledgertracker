/**
 * Generates the PWA icon set as PNG files, with no image dependencies.
 *
 * The artwork comes from lib/brand/logo.ts - the same geometry the React logo renders -
 * so the app icon and the on-screen mark can never drift apart. SVG paths are flattened
 * to polygons here, filled with a non-zero winding test and 4x4 supersampling, then
 * encoded as a PNG by hand. Run `npm run icons` to regenerate.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LOGO_COLORS,
  LOGO_PATHS,
  LOGO_VIEWBOX,
  RUPEE_SEGMENT_WIDTH,
  rupeeSegments,
} from '../lib/brand/logo.ts';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

/* ------------------------------------------------------------------ path flattening */

/** Parses the subset of path syntax used by the logo: M, L, C, Q, Z, absolute only. */
function flattenPath(d, steps = 24) {
  const tokens = d.match(/[MLCQZ]|-?\d*\.?\d+/gi) ?? [];
  const points = [];
  let index = 0;
  let current = [0, 0];
  let start = [0, 0];

  const number = () => Number(tokens[index++]);

  while (index < tokens.length) {
    const command = tokens[index++];
    switch (command) {
      case 'M': {
        current = [number(), number()];
        start = current;
        points.push(current);
        break;
      }
      case 'L': {
        current = [number(), number()];
        points.push(current);
        break;
      }
      case 'Q': {
        const control = [number(), number()];
        const end = [number(), number()];
        for (let step = 1; step <= steps; step += 1) {
          const t = step / steps;
          const inverse = 1 - t;
          points.push([
            inverse * inverse * current[0] + 2 * inverse * t * control[0] + t * t * end[0],
            inverse * inverse * current[1] + 2 * inverse * t * control[1] + t * t * end[1],
          ]);
        }
        current = end;
        break;
      }
      case 'C': {
        const c1 = [number(), number()];
        const c2 = [number(), number()];
        const end = [number(), number()];
        for (let step = 1; step <= steps; step += 1) {
          const t = step / steps;
          const u = 1 - t;
          points.push([
            u * u * u * current[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * end[0],
            u * u * u * current[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * end[1],
          ]);
        }
        current = end;
        break;
      }
      case 'Z': {
        points.push(start);
        current = start;
        break;
      }
      default:
        break;
    }
  }

  return points;
}

/** Non-zero winding test: true when the point lies inside the polygon. */
function insidePolygon(polygon, x, y) {
  let winding = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    if (y1 <= y) {
      if (y2 > y && (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1) > 0) winding += 1;
    } else if (y2 <= y && (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1) < 0) {
      winding -= 1;
    }
  }
  return winding !== 0;
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function insideRoundedSquare(x, y, size, radius) {
  const dx = Math.max(radius - x, 0, x - (size - radius));
  const dy = Math.max(radius - y, 0, y - (size - radius));
  if (dx === 0 || dy === 0) return x >= 0 && x <= size && y >= 0 && y <= size;
  return Math.hypot(dx, dy) <= radius;
}

/* ------------------------------------------------------------------------ rendering */

const SHAPES = LOGO_PATHS.map((path) => ({
  polygon: flattenPath(path.d),
  colour: hexToRgb(LOGO_COLORS[path.fill]),
  clip: path.clip === true,
}));
const BAG_POLYGON = SHAPES[1].polygon;
const RUPEE = rupeeSegments();
const RUPEE_COLOUR = hexToRgb(LOGO_COLORS.rupee);
const BACKDROP = hexToRgb(LOGO_COLORS.backdrop);

/**
 * Fills a polygon into a sample mask one row at a time.
 *
 * Testing every sample against every edge is quadratic and takes minutes at 512px; this
 * walks each row once, collects the edge crossings with their winding direction, and
 * fills the spans where the winding is non-zero.
 */
function fillPolygon(mask, width, height, polygon, toSampleX, toSampleY, value, clipMask) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of polygon) {
    const sampleY = toSampleY(y);
    if (sampleY < minY) minY = sampleY;
    if (sampleY > maxY) maxY = sampleY;
  }
  const firstRow = Math.max(0, Math.floor(minY));
  const lastRow = Math.min(height - 1, Math.ceil(maxY));

  for (let row = firstRow; row <= lastRow; row += 1) {
    const y = row + 0.5;
    const crossings = [];

    for (let i = 0; i < polygon.length; i += 1) {
      const [ax, ay] = polygon[i];
      const [bx, by] = polygon[(i + 1) % polygon.length];
      const y1 = toSampleY(ay);
      const y2 = toSampleY(by);
      if (y1 === y2) continue;
      if (y < Math.min(y1, y2) || y >= Math.max(y1, y2)) continue;
      const t = (y - y1) / (y2 - y1);
      crossings.push({ x: toSampleX(ax) + t * (toSampleX(bx) - toSampleX(ax)), dir: y2 > y1 ? 1 : -1 });
    }

    if (crossings.length < 2) continue;
    crossings.sort((a, b) => a.x - b.x);

    let winding = 0;
    for (let i = 0; i < crossings.length - 1; i += 1) {
      winding += crossings[i].dir;
      if (winding === 0) continue;
      const from = Math.max(0, Math.ceil(crossings[i].x - 0.5));
      const to = Math.min(width - 1, Math.floor(crossings[i + 1].x - 0.5));
      for (let column = from; column <= to; column += 1) {
        const index = row * width + column;
        if (clipMask && clipMask[index] === 0) continue;
        mask[index] = value;
      }
    }
  }
}

function renderIcon(size, { maskable }) {
  const samples = 4;
  const width = size * samples;
  const height = size * samples;
  // 0 = outside the tile, 1 = backdrop, 2+ = shape index + 2, 255 = rupee.
  const mask = new Uint8Array(width * height);

  // The backdrop fills the tile; the artwork is inset within it.
  const scale = maskable ? 0.66 : 0.82;
  const offset = (LOGO_VIEWBOX * (1 - scale)) / 2;
  const radius = maskable ? 0 : LOGO_VIEWBOX * 0.22;
  const toSample = (viewValue) => (viewValue / LOGO_VIEWBOX) * width;
  const artX = (x) => toSample(offset + x * scale);
  const artY = (y) => toSample(offset + y * scale);

  for (let row = 0; row < height; row += 1) {
    const viewY = ((row + 0.5) / height) * LOGO_VIEWBOX;
    for (let column = 0; column < width; column += 1) {
      const viewX = ((column + 0.5) / width) * LOGO_VIEWBOX;
      if (insideRoundedSquare(viewX, viewY, LOGO_VIEWBOX, radius)) {
        mask[row * width + column] = 1;
      }
    }
  }

  // The bag silhouette, kept so the shading below can be clipped to it.
  const bagMask = new Uint8Array(width * height);
  fillPolygon(bagMask, width, height, BAG_POLYGON, artX, artY, 1, null);

  SHAPES.forEach((shape, index) => {
    fillPolygon(mask, width, height, shape.polygon, artX, artY, index + 2, shape.clip ? bagMask : null);
  });

  // The rupee sign: a handful of round-capped strokes, only over the artwork itself.
  const strokeRadius = (RUPEE_SEGMENT_WIDTH / 2 / LOGO_VIEWBOX) * width * scale;
  for (const segment of RUPEE) {
    const x1 = artX(segment.x1);
    const y1 = artY(segment.y1);
    const x2 = artX(segment.x2);
    const y2 = artY(segment.y2);
    const fromRow = Math.max(0, Math.floor(Math.min(y1, y2) - strokeRadius));
    const toRow = Math.min(height - 1, Math.ceil(Math.max(y1, y2) + strokeRadius));
    const fromColumn = Math.max(0, Math.floor(Math.min(x1, x2) - strokeRadius));
    const toColumn = Math.min(width - 1, Math.ceil(Math.max(x1, x2) + strokeRadius));

    for (let row = fromRow; row <= toRow; row += 1) {
      for (let column = fromColumn; column <= toColumn; column += 1) {
        const index = row * width + column;
        if (mask[index] < 2) continue; // Never draw the sign onto the backdrop.
        if (distanceToSegment(column + 0.5, row + 0.5, x1, y1, x2, y2) <= strokeRadius) {
          mask[index] = 255;
        }
      }
    }
  }

  const palette = [null, BACKDROP, ...SHAPES.map((shape) => shape.colour)];
  const pixels = Buffer.alloc(size * size * 4);

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let hits = 0;

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const value = mask[(py * samples + sy) * width + (px * samples + sx)];
          if (value === 0) continue;
          const colour = value === 255 ? RUPEE_COLOUR : palette[value];
          r += colour[0];
          g += colour[1];
          b += colour[2];
          hits += 1;
        }
      }

      if (hits === 0) continue;
      const index = (py * size + px) * 4;
      pixels[index] = Math.round(r / hits);
      pixels[index + 1] = Math.round(g / hits);
      pixels[index + 2] = Math.round(b / hits);
      pixels[index + 3] = Math.round((hits / (samples * samples)) * 255);
    }
  }

  return pixels;
}

/* -------------------------------------------------------------------- PNG encoding */

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
