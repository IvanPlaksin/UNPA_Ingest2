'use strict';
/**
 * pyramid-layout.service.js
 *
 * Server-side layout engine for the cluster pyramid.
 * Runs in Node.js — uses elkjs (synchronous worker bundled version).
 *
 * Exported API:
 *   layoutInBbox(nodes, edges, bbox, options?) → nodes with {x,y} set
 *   computeBbox(nodes, padding?)              → {x,y,width,height,cx,cy}
 *   layoutGrid(nodes, bbox, padding?)         → grid fallback
 */

const ELK = require('elkjs/lib/elk.bundled.js');
const elk = new ELK();

/**
 * Layout nodes within a bounding box using ELK stress algorithm.
 * If ELK fails, falls back to grid layout.
 *
 * @param {Array}  nodes   [{id, width?, height?}]
 * @param {Array}  edges   [{source, target, weight?}]
 * @param {Object} bbox    {x, y, width, height}
 * @param {Object} options {algorithm:'stress'|'force', padding:20}
 * @returns {Promise<Array>} nodes with x,y added
 */
async function layoutInBbox(nodes, edges, bbox, options = {}) {
  const { algorithm = 'stress', padding = 20 } = options;

  if (!nodes.length) return [];

  if (nodes.length === 1) {
    const n = nodes[0];
    const w = n.width || 100, h = n.height || 50;
    return [{ ...n, x: bbox.x + (bbox.width  - w) / 2, y: bbox.y + (bbox.height - h) / 2 }];
  }

  // Remove edges referencing unknown nodes
  const nodeIds = new Set(nodes.map(n => n.id));
  const validEdges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

  // Desired edge length: proportional to bbox diagonal / sqrt(nodes)
  const diag = Math.sqrt(bbox.width * bbox.width + bbox.height * bbox.height);
  const desiredEdge = Math.max(80, Math.min(300, diag / Math.sqrt(nodes.length) * 0.7));

  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm':               algorithm === 'force' ? 'org.eclipse.elk.force' : 'org.eclipse.elk.stress',
      'elk.stress.desiredEdgeLength': String(Math.round(desiredEdge)),
      'elk.spacing.nodeNode':         '30',
      'elk.padding':                  `[top=${padding},left=${padding},bottom=${padding},right=${padding}]`,
    },
    children: nodes.map(n => ({
      id:     n.id,
      width:  n.width  || 100,
      height: n.height || 50,
    })),
    edges: validEdges.map((e, i) => ({
      id:      `e${i}`,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  try {
    const result = await elk.layout(elkGraph);
    return _fitToBbox(result.children, nodes, bbox, padding);
  } catch (err) {
    console.warn('[pyramid-layout] ELK failed, using grid fallback:', err.message);
    return layoutGrid(nodes, bbox, padding);
  }
}

/**
 * Compute axis-aligned bounding box for a set of laid-out nodes.
 */
function computeBbox(nodes, padding = 20) {
  if (!nodes.length) return { x: 0, y: 0, width: 1, height: 1, cx: 0, cy: 0 };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const x = n.x || 0, y = n.y || 0;
    const w = n.width || 100, h = n.height || 50;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }
  return {
    x:      minX - padding,
    y:      minY - padding,
    width:  Math.max(1, maxX - minX + 2 * padding),
    height: Math.max(1, maxY - minY + 2 * padding),
    cx:     (minX + maxX) / 2,
    cy:     (minY + maxY) / 2,
  };
}

/**
 * Grid layout fallback — evenly distributes nodes in rows.
 */
function layoutGrid(nodes, bbox, padding = 20) {
  const cols  = Math.ceil(Math.sqrt(nodes.length));
  const inner = {
    x: bbox.x + padding,
    y: bbox.y + padding,
    w: Math.max(1, bbox.width  - 2 * padding),
    h: Math.max(1, bbox.height - 2 * padding),
  };
  const rows  = Math.ceil(nodes.length / cols);
  const cellW = inner.w / cols;
  const cellH = inner.h / rows;

  return nodes.map((n, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const nw  = n.width  || 100;
    const nh  = n.height || 50;
    return {
      ...n,
      x: inner.x + col * cellW + (cellW - nw) / 2,
      y: inner.y + row * cellH + (cellH - nh) / 2,
    };
  });
}

// ─── Internals ────────────────────────────────────────────────────────────────

function _fitToBbox(elkChildren, originalNodes, bbox, padding) {
  if (!elkChildren?.length) return layoutGrid(originalNodes, bbox, padding);

  // ELK outputs positions starting near (0,0). Scale + translate into bbox.
  const elkBbox = computeBbox(elkChildren, 0);
  if (elkBbox.width <= 0 || elkBbox.height <= 0) return layoutGrid(originalNodes, bbox, padding);

  const innerW = Math.max(1, bbox.width  - 2 * padding);
  const innerH = Math.max(1, bbox.height - 2 * padding);
  const scaleX = innerW / elkBbox.width;
  const scaleY = innerH / elkBbox.height;
  const scale  = Math.min(scaleX, scaleY);          // uniform scale, preserve aspect

  // Center within bbox
  const scaledW = elkBbox.width  * scale;
  const scaledH = elkBbox.height * scale;
  const offX    = bbox.x + padding + (innerW - scaledW) / 2 - elkBbox.x * scale;
  const offY    = bbox.y + padding + (innerH - scaledH) / 2 - elkBbox.y * scale;

  return elkChildren.map(en => {
    const orig = originalNodes.find(n => n.id === en.id) || {};
    return {
      ...orig,
      id: en.id,
      x:  offX + en.x * scale,
      y:  offY + en.y * scale,
    };
  });
}

module.exports = { layoutInBbox, computeBbox, layoutGrid };
