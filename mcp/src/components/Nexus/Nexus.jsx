import React, { useCallback } from 'react';
import { useNexusStore } from '../../stores/nexusStore';
import { useEmbeddingsStatus } from '../../hooks/useEmbeddingsStatus';
import NexusHeader from './Header/NexusHeader';
import InsightsBar from './Insights/InsightsBar';
import GuidedMode from './Modes/GuidedMode/GuidedMode';
import ExploreMode from './Modes/ExploreMode/ExploreMode';
import SessionPanel from './Session/SessionPanel';
import AssistantPanel from './Assistant/AssistantPanel';
import KeyboardShortcuts from './Keyboard/KeyboardShortcuts';
import './Nexus.css';

/**
 * NEXUS - Graph Intelligence Hub
 *
 * Main container component that orchestrates all Nexus functionality.
 *
 * Layout:
 * ┌─────────────────────────┐
 * │ NexusHeader             │
 * │ (logo, mode selector)   │
 * ├─────────────────────────┤
 * │ InsightsBar             │
 * │ (always visible)        │
 * ├─────────────────────────┤
 * │ ModeContent             │
 * │ (switches by mode)      │
 * ├─────────────────────────┤
 * │ SelectionPanel          │
 * │ (when nodes selected)   │
 * └─────────────────────────┘
 */

const Nexus = ({ nodes = [], edges = [] }) => {
  const mode = useNexusStore(state => state.mode);
  const selectedNodeIds = useNexusStore(state => state.selectedNodeIds);
  const namespace = useNexusStore(state => state.namespace);
  const { available: embeddingsAvailable } = useEmbeddingsStatus();

  const hasSelection = selectedNodeIds.length > 0;

  const setMode = useNexusStore(state => state.setMode);

  const handleInsightAction = useCallback((action, insight) => {
    console.log('Insight action:', action, insight);
  }, []);

  const handleAssistantAction = useCallback((action) => {
    switch (action) {
      case 'switch-guided':
        setMode('guided');
        break;
      case 'refresh-insights':
        console.log('[Nexus] Refresh insights requested');
        break;
      default:
        console.log('[Nexus] Assistant action:', action);
    }
  }, [setMode]);

  return (
    <KeyboardShortcuts>
      <div className="nexus">
        <NexusHeader
          namespace={namespace}
        />

        <div className="nexus__section nexus__insights-bar">
          <InsightsBar onInsightAction={handleInsightAction} />
        </div>

        <div className="nexus__section nexus__mode-content">
          {mode === 'guided' && <GuidedMode embeddingsAvailable={embeddingsAvailable} />}
          {mode === 'explore' && <ExploreMode nodes={nodes} edges={edges} embeddingsAvailable={embeddingsAvailable} />}
          {mode !== 'guided' && mode !== 'explore' && <ModeContentPlaceholder mode={mode} />}
        </div>

        {mode === 'guided' && (
          <div className="nexus__section nexus__session-panel">
            <SessionPanel />
          </div>
        )}

        {hasSelection && (
          <div className="nexus__section nexus__selection-panel">
            <SelectionPanelPlaceholder count={selectedNodeIds.length} />
          </div>
        )}

        <AssistantPanel
          nodes={nodes}
          edges={edges}
          onAction={handleAssistantAction}
        />
      </div>
    </KeyboardShortcuts>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// PLACEHOLDER COMPONENTS (will be replaced in future tasks)
// ═══════════════════════════════════════════════════════════════════════════

const ModeContentPlaceholder = ({ mode }) => {
  const modeInfo = {
    guided: {
      icon: '🎯',
      title: 'Guided Analysis',
      description: 'Step-by-step workflow: Understand → Discover → Evaluate → Act',
    },
    explore: {
      icon: '🔍',
      title: 'Explore Tools',
      description: 'Access all analysis tools freely',
    },
    tasks: {
      icon: '📋',
      title: 'Tasks',
      description: 'Goal-oriented workflows',
    },
    quick: {
      icon: '⚡',
      title: 'Quick Actions',
      description: 'Fast operations on selected nodes',
    },
  };

  const info = modeInfo[mode] || modeInfo.explore;

  return (
    <div className="placeholder-panel">
      <div className="placeholder-panel__header">
        <span className="placeholder-panel__icon">{info.icon}</span>
        <span className="placeholder-panel__title">{info.title}</span>
      </div>
      <div className="placeholder-panel__content">
        <p className="placeholder-panel__description">{info.description}</p>
        <div className="placeholder-panel__coming-soon">
          <span>🚧</span> Content coming in Phase 2
        </div>
      </div>
    </div>
  );
};

const SelectionPanelPlaceholder = ({ count }) => {
  const selectedNodeIds = useNexusStore(state => state.selectedNodeIds);
  const clearSelection = useNexusStore(state => state.clearSelection);
  const setHighlight = useNexusStore(state => state.setHighlight);

  const handleHighlight = () => {
    setHighlight(selectedNodeIds, 'glow', '#6366f1');
  };

  return (
    <div className="placeholder-panel placeholder-panel--selection">
      <div className="placeholder-panel__header">
        <span className="placeholder-panel__icon">✓</span>
        <span className="placeholder-panel__title">
          {count} node{count !== 1 ? 's' : ''} selected
        </span>
        <button
          className="placeholder-panel__close-btn"
          onClick={clearSelection}
          title="Clear selection"
        >
          ✕
        </button>
      </div>
      <div className="placeholder-panel__content">
        <div className="selection-actions">
          <button
            className="selection-actions__btn"
            onClick={handleHighlight}
          >
            ✨ Highlight
          </button>
          <button
            className="selection-actions__btn"
            disabled={count < 3}
            title={count < 3 ? 'Select at least 3 nodes' : 'Extract as SubGraph'}
          >
            📦 Extract SubGraph
          </button>
          <button
            className="selection-actions__btn"
            disabled={count < 2}
          >
            🔗 Find Paths
          </button>
        </div>
      </div>
    </div>
  );
};

export default Nexus;
