import React from 'react';

const TYPE_ICONS = {
  CLASS: '\uD83D\uDCE6', METHOD: '\u2699\uFE0F', SERVICE: '\uD83D\uDD27',
  INTERFACE: '\uD83D\uDD0C', FILE: '\uD83D\uDCC4',
};

const LAYER_COLORS = { Strategic: '#f59e0b', Business: '#3b82f6', Code: '#22c55e' };

/**
 * Reference node display with change button.
 */
const ReferenceNode = ({ node, onChangeClick }) => {
  if (!node) {
    return (
      <div className="reference-node reference-node--empty">
        <div className="reference-node__placeholder">
          <span className="reference-node__placeholder-icon">{'\uD83D\uDC46'}</span>
          <span className="reference-node__placeholder-text">
            Select a node on the canvas or search for one
          </span>
        </div>
      </div>
    );
  }

  const name = node.name || node.label || node.id;
  const degree = node.degree ?? 0;

  return (
    <div className="reference-node">
      <div className="reference-node__card">
        <span className="reference-node__icon">
          {TYPE_ICONS[node.type?.toUpperCase()] || '\uD83D\uDCC4'}
        </span>
        <div className="reference-node__info">
          <div className="reference-node__name">{name}</div>
          <div className="reference-node__meta">
            <span className="reference-node__type">{node.type}</span>
            {node.layer && (
              <>
                <span className="reference-node__separator">{'\u2022'}</span>
                <span
                  className="reference-node__layer"
                  style={{ color: LAYER_COLORS[node.layer] || '#64748b' }}
                >
                  {node.layer}
                </span>
              </>
            )}
            <span className="reference-node__separator">{'\u2022'}</span>
            <span className="reference-node__degree">{degree} connections</span>
          </div>
        </div>
      </div>

      {onChangeClick && (
        <button className="reference-node__change" onClick={onChangeClick}>
          Change node...
        </button>
      )}
    </div>
  );
};

export default ReferenceNode;
