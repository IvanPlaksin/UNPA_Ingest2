import React, { useMemo } from 'react';

// ═══════════════════════════════════════════════════════════════════════
// GnnInsightsOverlay
//
// Visual overlay for GNN analysis results on ReactFlow graph:
// - Predicted links as dashed SVG edges
// - Node classification badges
// - Community color-coding info
//
// This component renders as an absolutely positioned SVG overlay
// and also provides helper data for ReactFlow integration.
// ═══════════════════════════════════════════════════════════════════════

const COMMUNITY_COLORS = [
  '#58a6ff', '#3fb950', '#d2a8ff', '#f0883e', '#f85149',
  '#e8a83e', '#a5d6ff', '#7ee787', '#c9a8ff', '#ffa657',
];

const CATEGORY_COLORS = {
  Transaction: '#58a6ff',
  Reference: '#3fb950',
  Log: '#d29922',
  Lookup: '#d2a8ff',
  Junction: '#f0883e',
  Config: '#e8a83e',
  Audit: '#f85149',
  Unknown: '#6b7280',
};

/**
 * Build additional ReactFlow edges for predicted links.
 *
 * @param {Array} predictions - [{source, target, probability}]
 * @returns {Array} ReactFlow-compatible edges
 */
export function buildPredictedEdges(predictions = []) {
  if (!predictions?.length) return [];

  return predictions.map((p, i) => ({
    id: `gnn-pred-${p.source}-${p.target}-${i}`,
    source: p.source,
    target: p.target,
    type: 'default',
    animated: true,
    style: {
      stroke: '#a855f7',
      strokeWidth: 2,
      strokeDasharray: '6 3',
      opacity: Math.min(p.probability || 0.5, 0.9),
    },
    label: `${Math.round((p.probability || 0) * 100)}%`,
    labelStyle: { fill: '#d2a8ff', fontSize: 10, fontWeight: 600 },
    markerEnd: { type: 'arrowclosed', color: '#a855f7' },
    data: { isGnnPrediction: true, probability: p.probability },
  }));
}

/**
 * Build node style overrides for classification results.
 *
 * @param {Object} classifications - { nodeId: { category, confidence } }
 * @returns {Object} { nodeId: { borderColor, badge, category } }
 */
export function buildClassificationStyles(classifications = {}) {
  const styles = {};
  for (const [nodeId, { category, confidence }] of Object.entries(classifications)) {
    const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.Unknown;
    styles[nodeId] = {
      borderColor: color,
      badge: `${category} (${Math.round((confidence || 0) * 100)}%)`,
      category,
      confidence,
      color,
    };
  }
  return styles;
}

/**
 * Build community color map for nodes.
 *
 * @param {Array} communities - [{ id, nodeIds, label }]
 * @returns {Object} { nodeId: { communityId, color, label } }
 */
export function buildCommunityMap(communities = []) {
  const map = {};
  communities.forEach((c, i) => {
    const color = COMMUNITY_COLORS[i % COMMUNITY_COLORS.length];
    (c.nodeIds || c.nodes || []).forEach(nodeId => {
      map[nodeId] = {
        communityId: c.id || c.communityId || i,
        color,
        label: c.label || `Group ${i + 1}`,
      };
    });
  });
  return map;
}

/**
 * GnnInsightsOverlay component — classification + community badges rendered
 * as absolutely positioned elements over the ReactFlow canvas.
 */
const GnnInsightsOverlay = ({
  predictions = [],
  classifications = {},
  communities = [],
  nodes = [],
  visible = true,
}) => {
  const classStyles = useMemo(() => buildClassificationStyles(classifications), [classifications]);
  const communityMap = useMemo(() => buildCommunityMap(communities), [communities]);

  if (!visible) return null;
  if (!Object.keys(classStyles).length && !Object.keys(communityMap).length) return null;

  // We render floating badges for each node that has classification or community data.
  // Position data comes from ReactFlow node positions (approximate).
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 5,
        overflow: 'hidden',
      }}
    >
      {nodes.map(node => {
        const cls = classStyles[node.id];
        const comm = communityMap[node.id];
        if (!cls && !comm) return null;

        // Approximate badge position — top-right of node
        const x = (node.position?.x || 0) + 140;
        const y = (node.position?.y || 0) - 8;

        return (
          <div
            key={`gnn-badge-${node.id}`}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              display: 'flex',
              gap: 4,
              transform: 'scale(0.8)',
              transformOrigin: 'top left',
            }}
          >
            {cls && (
              <span style={{
                padding: '2px 6px',
                borderRadius: 4,
                fontSize: 9,
                fontWeight: 600,
                background: cls.color + '20',
                color: cls.color,
                border: `1px solid ${cls.color}40`,
                whiteSpace: 'nowrap',
              }}>
                {cls.category}
              </span>
            )}
            {comm && (
              <span style={{
                padding: '2px 6px',
                borderRadius: 4,
                fontSize: 9,
                fontWeight: 600,
                background: comm.color + '20',
                color: comm.color,
                border: `1px solid ${comm.color}40`,
                whiteSpace: 'nowrap',
              }}>
                {comm.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default GnnInsightsOverlay;
