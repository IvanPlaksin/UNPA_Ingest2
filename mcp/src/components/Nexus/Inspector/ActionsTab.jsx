import React from 'react';
import { useNexusStore } from '../../../stores/nexusStore';

/**
 * Actions tab with node operations
 */
const ActionsTab = ({ node, onAction }) => {
  const setHighlight = useNexusStore(state => state.setHighlight);
  const selectAndFocus = useNexusStore(state => state.selectAndFocus);
  const isGnnReady = useNexusStore(state => state.isGnnReady);

  const gnnAvailable = isGnnReady?.() || false;

  const actions = [
    { id: 'explore', icon: '🔍', label: 'Explore Neighbors', description: 'Show all connected nodes', primary: true },
    { id: 'highlight', icon: '✨', label: 'Highlight', description: 'Highlight this node on canvas' },
    { id: 'paths', icon: '🛤️', label: 'Find Paths', description: 'Find paths to another node' },
    { id: 'extract', icon: '📦', label: 'Extract SubGraph', description: 'Extract node and neighbors as SubGraph' },
    { id: 'similar', icon: '👥', label: 'Find Similar', description: 'Find nodes with similar properties', requiresGnn: true },
    { id: 'predict', icon: '🔮', label: 'Predict Links', description: 'Predict potential connections', requiresGnn: true },
  ];

  const handleAction = (actionId) => {
    switch (actionId) {
      case 'highlight':
        setHighlight([node.id], 'glow', '#6366f1');
        break;
      case 'explore':
        selectAndFocus([node.id]);
        onAction?.('explore', node);
        break;
      default:
        onAction?.(actionId, node);
    }
  };

  return (
    <div className="actions-tab">
      <div className="actions-group">
        <div className="actions-group__title">Quick Actions</div>
        <div className="actions-grid">
          {actions.filter(a => !a.requiresGnn).map(action => (
            <button
              key={action.id}
              className="action-button"
              onClick={() => handleAction(action.id)}
              title={action.description}
            >
              <span className="action-button__icon">{action.icon}</span>
              <span className="action-button__label">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="actions-group">
        <div className="actions-group__title">
          AI Actions
          {!gnnAvailable && <span className="actions-group__badge">GNN not ready</span>}
        </div>
        <div className="actions-grid">
          {actions.filter(a => a.requiresGnn).map(action => (
            <button
              key={action.id}
              className={`action-button ${!gnnAvailable ? 'action-button--disabled' : ''}`}
              onClick={() => gnnAvailable && handleAction(action.id)}
              disabled={!gnnAvailable}
              title={gnnAvailable ? action.description : 'GNN model not loaded'}
            >
              <span className="action-button__icon">{action.icon}</span>
              <span className="action-button__label">{action.label}</span>
              {!gnnAvailable && <span className="action-button__gnn-badge">GNN</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="actions-group actions-group--danger">
        <div className="actions-group__title">Danger Zone</div>
        <button
          className="action-button action-button--danger"
          onClick={() => onAction?.('delete', node)}
          title="Delete this node"
        >
          <span className="action-button__icon">🗑️</span>
          <span className="action-button__label">Delete Node</span>
        </button>
      </div>
    </div>
  );
};

export default ActionsTab;
