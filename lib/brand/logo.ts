/**
 * The Potli mark: a drawstring money bag with a rupee sign on it.
 *
 * The geometry lives here once, in a 100x100 viewBox, and is used by both the React
 * component and the PNG icon generator. Keeping a single source means the app icon, the
 * favicon and the logo on screen can never drift apart.
 */

export const LOGO_VIEWBOX = 100;

export const LOGO_COLORS = {
  /** Rounded-square backdrop behind the bag on app icons. */
  backdrop: '#0d6c5c',
  bag: '#f0a92e',
  /** Lower third of the bag, a shade deeper, for a little weight. */
  bagShade: '#dc8f16',
  cloth: '#f7c65f',
  tie: '#b8551a',
  rupee: '#0d6c5c',
} as const;

/**
 * Paths in draw order. Later entries sit on top of earlier ones; `clip` restricts a
 * shape to the bag body so the shading follows its curve.
 */
export const LOGO_PATHS: { d: string; fill: keyof typeof LOGO_COLORS; clip?: boolean }[] = [
  // Gathered cloth above the tie, with a scalloped top edge.
  {
    d: 'M32 40 L27 20 Q33 26 38 20 Q44 27 50 19 Q56 27 62 20 Q67 26 73 20 L68 40 Z',
    fill: 'cloth',
  },
  // The bag itself: a heavy teardrop, widest low down.
  {
    d: 'M34 38 C22 46 12 60 12 71 C12 85 29 94 50 94 C71 94 88 85 88 71 C88 60 78 46 66 38 Z',
    fill: 'bag',
  },
  // Weight along the bottom, clipped to the bag's silhouette.
  { d: 'M8 74 L92 74 L92 98 L8 98 Z', fill: 'bagShade', clip: true },
  // Drawstring tie across the neck.
  { d: 'M30 34 L70 34 Q74 34 74 39 Q74 44 70 44 L30 44 Q26 44 26 39 Q26 34 30 34 Z', fill: 'tie' },
  // Loose end of the string, trailing to the right.
  { d: 'M72 36 L92 28 L86 39 L94 46 L74 43 Z', fill: 'tie' },
];

/** The rupee sign, as stroked segments with round caps, in a 0-1 space over the bag. */
export const RUPEE_STROKES: { a: [number, number]; b: [number, number] }[] = [
  { a: [0.3, 0.28], b: [0.72, 0.28] },
  { a: [0.3, 0.42], b: [0.72, 0.42] },
  { a: [0.63, 0.3], b: [0.63, 0.5] },
  { a: [0.63, 0.5], b: [0.56, 0.565] },
  { a: [0.58, 0.575], b: [0.33, 0.575] },
  { a: [0.42, 0.575], b: [0.71, 0.82] },
];

export const RUPEE_STROKE_WIDTH = 0.075;

/** Where the rupee sign sits on the bag, in viewBox units. */
export const RUPEE_PLACEMENT = { centreX: 50, centreY: 67, size: 50 } as const;

/**
 * The glyph does not fill its unit box evenly - it leans up and to the left - so it is
 * projected about its own visual centre rather than about (0.5, 0.5), which would sit it
 * off-centre on the bag.
 */
const GLYPH_CENTRE = { x: 0.52, y: 0.55 } as const;

/** The rupee strokes mapped into viewBox coordinates, ready to draw. */
export function rupeeSegments(): { x1: number; y1: number; x2: number; y2: number }[] {
  const { centreX, centreY, size } = RUPEE_PLACEMENT;
  const project = ([x, y]: [number, number]) => ({
    x: centreX + (x - GLYPH_CENTRE.x) * size,
    y: centreY + (y - GLYPH_CENTRE.y) * size,
  });
  return RUPEE_STROKES.map(({ a, b }) => {
    const from = project(a);
    const to = project(b);
    return { x1: from.x, y1: from.y, x2: to.x, y2: to.y };
  });
}

export const RUPEE_SEGMENT_WIDTH = RUPEE_STROKE_WIDTH * RUPEE_PLACEMENT.size;
