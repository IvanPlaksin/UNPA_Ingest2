/**
 * CollisionResolver — detects and fixes overlapping nodes.
 * Migrated from AOPEG/utils/collisionResolver.ts (CONS-21).
 * Iterative push-apart algorithm.
 */

const DEFAULT_WIDTH = 260;
const DEFAULT_HEIGHT = 130;
const SMALL_WIDTH = 190;
const SMALL_HEIGHT = 70;

function rectsOverlap(a, b, padding) {
  return !(
    a.x + a.width + padding <= b.x ||
    b.x + b.width + padding <= a.x ||
    a.y + a.height + padding <= b.y ||
    b.y + b.height + padding <= a.y
  );
}

function getOverlapVector(a, b, padding) {
  const aCx = a.x + a.width / 2;
  const aCy = a.y + a.height / 2;
  const bCx = b.x + b.width / 2;
  const bCy = b.y + b.height / 2;

  const overlapX = (a.width / 2 + b.width / 2 + padding) - Math.abs(aCx - bCx);
  const overlapY = (a.height / 2 + b.height / 2 + padding) - Math.abs(aCy - bCy);

  if (overlapX <= 0 || overlapY <= 0) return { dx: 0, dy: 0 };

  if (overlapX < overlapY) {
    return { dx: overlapX * (aCx < bCx ? -1 : 1), dy: 0 };
  } else {
    return { dx: 0, dy: overlapY * (aCy < bCy ? -1 : 1) };
  }
}

function getNodeSize(node, sizes, measureDOM) {
  if (sizes) {
    const s = sizes.get(node.id);
    if (s) return s;
  }
  if (measureDOM !== false) {
    try {
      const el = document.querySelector(`[data-id="${node.id}"]`);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return { width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
        }
      }
    } catch { /* ignore */ }
  }
  if (node.measured?.width && node.measured?.height) {
    return { width: node.measured.width, height: node.measured.height };
  }
  if (node.width && node.height) {
    return { width: node.width, height: node.height };
  }
  if (node.data?.nodeWidth && node.data?.nodeHeight) {
    return { width: node.data.nodeWidth, height: node.data.nodeHeight };
  }
  const isSmall = node.data?.kind?.startsWith('tool.') || node.data?.kind === 'tool-ref';
  return {
    width: isSmall ? SMALL_WIDTH : DEFAULT_WIDTH,
    height: isSmall ? SMALL_HEIGHT : DEFAULT_HEIGHT,
  };
}

export function resolveCollisions(nodes, options = {}) {
  const { padding = 20, maxIterations = 50, sizes, measureDOM = true } = options;

  if (nodes.length <= 1) return nodes;

  const rects = nodes.map(n => {
    const { width, height } = getNodeSize(n, sizes, measureDOM);
    return { id: n.id, x: n.position?.x || 0, y: n.position?.y || 0, width, height };
  });

  for (let iter = 0; iter < maxIterations; iter++) {
    let hasCollision = false;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        if (!rectsOverlap(rects[i], rects[j], padding)) continue;
        hasCollision = true;
        const { dx, dy } = getOverlapVector(rects[i], rects[j], padding);
        rects[i].x -= dx / 2;
        rects[i].y -= dy / 2;
        rects[j].x += dx / 2;
        rects[j].y += dy / 2;
      }
    }
    if (!hasCollision) break;
  }

  const rectMap = new Map(rects.map(r => [r.id, r]));
  return nodes.map(n => {
    const r = rectMap.get(n.id);
    if (!r) return n;
    return { ...n, position: { x: Math.round(r.x), y: Math.round(r.y) } };
  });
}
