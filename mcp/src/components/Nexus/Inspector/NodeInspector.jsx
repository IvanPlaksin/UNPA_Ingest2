import React, { useState } from 'react';
import InspectorHeader from './InspectorHeader';
import PropertiesTab from './PropertiesTab';
import ConnectionsTab from './ConnectionsTab';
import ActionsTab from './ActionsTab';
import './NodeInspector.css';

/**
 * NodeInspector - Detailed node view with tabs
 */
const NodeInspector = ({
  node,
  edges = [],
  allNodes = [],
  onClose,
  onNodeClick,
  onAction,
}) => {
  const [activeTab, setActiveTab] = useState('properties');

  if (!node) return null;

  const tabs = [
    { id: 'properties', label: 'Properties', icon: '📋' },
    { id: 'connections', label: 'Connections', icon: '🔗' },
    { id: 'actions', label: 'Actions', icon: '⚡' },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'properties':
        return <PropertiesTab node={node} />;
      case 'connections':
        return (
          <ConnectionsTab
            node={node}
            edges={edges}
            allNodes={allNodes}
            onNodeClick={onNodeClick}
          />
        );
      case 'actions':
        return <ActionsTab node={node} onAction={onAction} />;
      default:
        return null;
    }
  };

  return (
    <div className="node-inspector">
      <InspectorHeader node={node} onClose={onClose} />

      <div className="node-inspector__tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`node-inspector__tab ${activeTab === tab.id ? 'node-inspector__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="node-inspector__tab-icon">{tab.icon}</span>
            <span className="node-inspector__tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="node-inspector__content">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default NodeInspector;
