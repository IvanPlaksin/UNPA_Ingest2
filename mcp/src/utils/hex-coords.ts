/**
 * hex-coords.ts — Hex Math Foundation (Step 1.1)
 *
 * Cube coordinate system for hexagonal grids (flat-top orientation).
 * Constraint: q + r + s = 0
 *
 * Flat-top hex pixel formulas:
 *   x = size * 3/2 * q
 *   y = size * (√3/2 * q + √3 * r)
 */

// ── Types ────────────────────────────────────────────────────────────────

export interface HexCoord {
  q: number;
  r: number;
  s: number;
}

export interface PixelCoord {
  x: number;
  y: number;
}

export interface HexGridConfig {
  hexSize: number;       // distance from center to corner
  originX: number;       // pixel origin X
  originY: number;       // pixel origin Y
}

// ── Constants ────────────────────────────────────────────────────────────

const SQRT3 = Math.sqrt(3);

/** Six cube-coordinate direction vectors (flat-top, clockwise from right) */
const HEX_DIRECTIONS: readonly HexCoord[] = [
  { q:  1, r:  0, s: -1 },  // 0° right
  { q:  1, r: -1, s:  0 },  // 60°
  { q:  0, r: -1, s:  1 },  // 120°
  { q: -1, r:  0, s:  1 },  // 180° left
  { q: -1, r:  1, s:  0 },  // 240°
  { q:  0, r:  1, s: -1 },  // 300°
] as const;

// ── Core Functions ───────────────────────────────────────────────────────

/** Create a HexCoord with auto-computed s = -q - r */
export function hex(q: number, r: number): HexCoord {
  return { q, r, s: -q - r };
}

/** Convert hex cube coordinate to pixel position (flat-top) */
export function hexToPixel(h: HexCoord, config: HexGridConfig): PixelCoord {
  const { hexSize, originX, originY } = config;
  return {
    x: originX + hexSize * (3 / 2) * h.q,
    y: originY + hexSize * (SQRT3 / 2 * h.q + SQRT3 * h.r),
  };
}

/** Convert pixel position to fractional hex coordinate (flat-top) */
export function pixelToHex(pixel: PixelCoord, config: HexGridConfig): HexCoord {
  const { hexSize, originX, originY } = config;
  const px = pixel.x - originX;
  const py = pixel.y - originY;

  const q = (2 / 3) * px / hexSize;
  const r = (-1 / 3 * px + SQRT3 / 3 * py) / hexSize;
  return hexRound({ q, r, s: -q - r });
}

/** Round fractional hex to nearest integer hex cell */
export function hexRound(h: HexCoord): HexCoord {
  let rq = Math.round(h.q);
  let rr = Math.round(h.r);
  let rs = Math.round(h.s);

  const dq = Math.abs(rq - h.q);
  const dr = Math.abs(rr - h.r);
  const ds = Math.abs(rs - h.s);

  // Reset the component with the largest rounding error
  if (dq > dr && dq > ds) {
    rq = -rr - rs;
  } else if (dr > ds) {
    rr = -rq - rs;
  } else {
    rs = -rq - rr;
  }

  return { q: rq, r: rr, s: rs };
}

/** Manhattan distance between two hex cells */
export function hexDistance(a: HexCoord, b: HexCoord): number {
  return Math.max(
    Math.abs(a.q - b.q),
    Math.abs(a.r - b.r),
    Math.abs(a.s - b.s),
  );
}

/** Return the 6 neighbors of a hex cell */
export function hexNeighbors(h: HexCoord): HexCoord[] {
  return HEX_DIRECTIONS.map(d => ({
    q: h.q + d.q,
    r: h.r + d.r,
    s: h.s + d.s,
  }));
}

/** Return all hex cells within a given radius (inclusive) */
export function hexRange(center: HexCoord, radius: number): HexCoord[] {
  const results: HexCoord[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const rMin = Math.max(-radius, -dq - radius);
    const rMax = Math.min(radius, -dq + radius);
    for (let dr = rMin; dr <= rMax; dr++) {
      results.push({
        q: center.q + dq,
        r: center.r + dr,
        s: center.s - dq - dr,
      });
    }
  }
  return results;
}

/** Return all hex cells along a line from a to b (inclusive) */
export function hexLine(a: HexCoord, b: HexCoord): HexCoord[] {
  const dist = hexDistance(a, b);
  if (dist === 0) return [{ ...a }];

  const results: HexCoord[] = [];
  // Nudge to avoid landing exactly on cell edges
  const aNudge = { q: a.q + 1e-6, r: a.r + 1e-6, s: a.s - 2e-6 };
  const bNudge = { q: b.q + 1e-6, r: b.r + 1e-6, s: b.s - 2e-6 };

  for (let i = 0; i <= dist; i++) {
    const t = i / dist;
    results.push(hexRound({
      q: aNudge.q + (bNudge.q - aNudge.q) * t,
      r: aNudge.r + (bNudge.r - aNudge.r) * t,
      s: aNudge.s + (bNudge.s - aNudge.s) * t,
    }));
  }
  return results;
}

/** Return the 6 pixel corners of a flat-top hex cell for rendering */
export function hexCorners(h: HexCoord, config: HexGridConfig): PixelCoord[] {
  const center = hexToPixel(h, config);
  const corners: PixelCoord[] = [];
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i;
    const angleRad = (Math.PI / 180) * angleDeg;
    corners.push({
      x: center.x + config.hexSize * Math.cos(angleRad),
      y: center.y + config.hexSize * Math.sin(angleRad),
    });
  }
  return corners;
}

/** Serialize a hex coordinate to a unique string key "q,r" */
export function hexKey(h: HexCoord): string {
  return `${h.q},${h.r}`;
}

/** Parse a hex key back to a HexCoord */
export function parseHexKey(key: string): HexCoord {
  const [q, r] = key.split(',').map(Number);
  return { q, r, s: -q - r };
}

/** Add two hex coordinates */
export function hexAdd(a: HexCoord, b: HexCoord): HexCoord {
  return { q: a.q + b.q, r: a.r + b.r, s: a.s + b.s };
}

/** Subtract b from a */
export function hexSubtract(a: HexCoord, b: HexCoord): HexCoord {
  return { q: a.q - b.q, r: a.r - b.r, s: a.s - b.s };
}

/** Scale a hex coordinate by a scalar */
export function hexScale(h: HexCoord, factor: number): HexCoord {
  return { q: h.q * factor, r: h.r * factor, s: h.s * factor };
}

/** Check if two hex coordinates are equal */
export function hexEquals(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r && a.s === b.s;
}

/** Get the hex direction vector for index 0-5 */
export function hexDirection(index: number): HexCoord {
  return HEX_DIRECTIONS[((index % 6) + 6) % 6];
}

/** Get the hex neighbor in a specific direction (0-5) */
export function hexNeighborAt(h: HexCoord, direction: number): HexCoord {
  return hexAdd(h, hexDirection(direction));
}

/** Pixel position of a specific corner, inset toward center by `inset` px */
export function hexInsetCornerPixel(
  h: HexCoord,
  cornerIndex: number,
  config: HexGridConfig,
  inset: number,
): PixelCoord {
  const center = hexToPixel(h, config);
  const insetRadius = config.hexSize - inset;
  const angleDeg = 60 * cornerIndex;
  const angleRad = (Math.PI / 180) * angleDeg;
  return {
    x: center.x + insetRadius * Math.cos(angleRad),
    y: center.y + insetRadius * Math.sin(angleRad),
  };
}

/** Pixel position of a boundary corner (at full hexSize radius) */
export function hexCornerPixel(
  h: HexCoord,
  cornerIndex: number,
  config: HexGridConfig,
): PixelCoord {
  const center = hexToPixel(h, config);
  const angleDeg = 60 * cornerIndex;
  const angleRad = (Math.PI / 180) * angleDeg;
  return {
    x: center.x + config.hexSize * Math.cos(angleRad),
    y: center.y + config.hexSize * Math.sin(angleRad),
  };
}

// ── Guide Rail Geometry ─────────────────────────────────────────────────
// Concentric inner hexagons used as routing guide rails.
// Rail 0 = outermost (hexSize - railStep), Rail k = hexSize - (k+1)*railStep

/** How many concentric guide rails fit inside a hex cell.
 *  Rail 0 = hexSize - railStep (outermost), Rail k = hexSize - (k+1)*railStep.
 *  Returns count of rails with positive radius.
 */
export function guideRailCount(hexSize: number, railStep: number = 20): number {
  return Math.max(1, Math.floor(hexSize / railStep) - 1);
}

/** Pixel position of a corner on guide rail k.
 *  Rail 0 = outermost inset (hexSize - railStep), Rail 1 = hexSize - 2*railStep, etc.
 *  Routes are visually distinct from the hex grid boundary.
 */
export function guideRailCornerPixel(
  h: HexCoord,
  cornerIndex: number,
  config: HexGridConfig,
  railIndex: number,
  railStep: number = 20,
): PixelCoord {
  const center = hexToPixel(h, config);
  const radius = config.hexSize - (railIndex + 1) * railStep;
  const angleDeg = 60 * cornerIndex;
  const angleRad = (Math.PI / 180) * angleDeg;
  return {
    x: center.x + radius * Math.cos(angleRad),
    y: center.y + radius * Math.sin(angleRad),
  };
}

/**
 * Face-to-corner mapping for flat-top hex.
 * Face index matches HEX_DIRECTIONS order; corners are clockwise from 0° right.
 *
 *   face 0 → (1,0)  right:        corners [0, 1]
 *   face 1 → (1,-1) top-right:    corners [5, 0]
 *   face 2 → (0,-1) top-left:     corners [4, 5]
 *   face 3 → (-1,0) left:         corners [3, 4]
 *   face 4 → (-1,1) bottom-left:  corners [2, 3]
 *   face 5 → (0,1)  bottom-right: corners [1, 2]
 */
export const FACE_CORNER_MAP: readonly [number, number][] = [
  [0, 1],  // face 0
  [5, 0],  // face 1
  [4, 5],  // face 2
  [3, 4],  // face 3
  [2, 3],  // face 4
  [1, 2],  // face 5
] as const;

/**
 * Pixel position of a face port at a given guide rail level.
 * A face port = midpoint of the face segment on the inner hex at railIndex.
 * faceIndex 0-5 matches HEX_DIRECTIONS order (flat-top).
 */
export function facePortPixel(
  h: HexCoord,
  faceIndex: number,
  railIndex: number,
  config: HexGridConfig,
  railStep: number = 20,
): PixelCoord {
  const [ci0, ci1] = FACE_CORNER_MAP[faceIndex];
  const c0 = guideRailCornerPixel(h, ci0, config, railIndex, railStep);
  const c1 = guideRailCornerPixel(h, ci1, config, railIndex, railStep);
  return {
    x: (c0.x + c1.x) / 2,
    y: (c0.y + c1.y) / 2,
  };
}

/** Return all hex cells at exactly the given radius from center (ring) */
export function hexRing(center: HexCoord, radius: number): HexCoord[] {
  if (radius === 0) return [{ ...center }];

  const results: HexCoord[] = [];
  // Start at direction 4 (southwest), scaled by radius
  let current = hexAdd(center, hexScale(hexDirection(4), radius));

  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < radius; step++) {
      results.push({ ...current });
      current = hexAdd(current, hexDirection(side));
    }
  }
  return results;
}
