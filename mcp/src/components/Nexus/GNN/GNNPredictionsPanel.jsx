import React, { useState, useCallback } from 'react';
import { useNexusStore } from '../../../stores/nexusStore';
import { addPredictedEdge } from '../../../services/nexus.service';
import { useGNNPredictions } from './useGNNPredictions';
import NodeSelector from '../PathFinder/NodeSelector';
import GNNStatus from './GNNStatus';
import PredictionSettings from './PredictionSettings';
import PredictionsList from './PredictionsList';
import './GNNPredictionsPanel.css';

const EDGE_TYPES = ['DEPENDS_ON', 'USES', 'CALLS', 'REFERENCES', 'IMPLEMENTS', 'EXTENDS'];

/**
 * GNN Link Predictions Panel.
 */
const GNNPredictionsPanel = ({ nodes = [], onClose }) => {
  const [sourceNode, setSourceNode] = useState(null);
  const [settings, setSettings] = useState({
    topK: 10,
    minScore: 0.5,
    edgeType: null,
  });

  const {
    status,
    predictions,
    isLoading,
    error,
    runPrediction,
    refresh,
    clearPredictions,
  } = useGNNPredictions();

  const namespace = useNexusStore(state => state.namespace);
  const selectedNodeIds = useNexusStore(state => state.selectedNodeIds);
  const setHighlight = useNexusStore(state => state.setHighlight);
  const addVisualCluster = useNexusStore(state => state.addVisualCluster);
  const clearVisualClusters = useNexusStore(state => state.clearVisualClusters);

  // Use selected node from canvas if no source selected
  const canvasSelectedNode = nodes.find(n => selectedNodeIds.includes(n.id));
  const effectiveSource = sourceNode || canvasSelectedNode || null;

  const handlePredict = useCallback(() => {
    if (effectiveSource) {
      runPrediction(effectiveSource.id, settings);
    }
  }, [effectiveSource, settings, runPrediction]);

  const handleShow = useCallback((prediction) => {
    setHighlight(
      [effectiveSource?.id, prediction.targetId].filter(Boolean),
      'glow',
      '#f59e0b'
    );
  }, [effectiveSource, setHighlight]);

  const handleAdd = useCallback(async (prediction) => {
    const result = await addPredictedEdge(
      namespace,
      effectiveSource?.id,
      prediction.targetId,
      prediction.edgeType
    );

    if (result.success) {
      console.log('[GNN] Edge added:', prediction);
    }
  }, [namespace, effectiveSource]);

  const handleShowAll = useCallback(() => {
    const allNodeIds = [
      effectiveSource?.id,
      ...predictions.map(p => p.targetId),
    ].filter(Boolean);

    setHighlight(allNodeIds, 'glow', '#f59e0b');
    addVisualCluster({
      id: 'gnn-predictions',
      nodeIds: allNodeIds,
      color: '#f59e0b',
      label: 'Predicted Links',
      opacity: 0.15,
    });
  }, [effectiveSource, predictions, setHighlight, addVisualCluster]);

  const handleExport = useCallback(() => {
    const exportData = {
      source: {
        id: effectiveSource?.id,
        name: effectiveSource?.name || effectiveSource?.label,
        type: effectiveSource?.type,
      },
      predictions,
      settings,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `predictions-${effectiveSource?.id || 'unknown'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [effectiveSource, predictions, settings]);

  const handleSourceChange = useCallback((node) => {
    setSourceNode(node);
    clearPredictions();
    clearVisualClusters();
  }, [clearPredictions, clearVisualClusters]);

  return (
    <div className="gnn-predictions-panel">
      <div className="gnn-predictions-panel__header">
        <h3 className="gnn-predictions-panel__title">
          <span>{'\uD83D\uDD2E'}</span> Link Predictions
        </h3>
        {onClose && (
          <button className="gnn-predictions-panel__close" onClick={onClose}>
            {'\u2715'}
          </button>
        )}
      </div>

      <GNNStatus status={status} onRefresh={refresh} />

      <div className="gnn-predictions-panel__section">
        <label className="gnn-predictions-panel__label">Source Node</label>
        <NodeSelector
          value={effectiveSource}
          nodes={nodes}
          onChange={handleSourceChange}
          onClear={() => handleSourceChange(null)}
          placeholder="Select a node or use canvas selection..."
        />
        {!sourceNode && canvasSelectedNode && (
          <div className="gnn-predictions-panel__hint">
            Using selected node from canvas
          </div>
        )}
      </div>

      <PredictionSettings
        settings={settings}
        onChange={setSettings}
        edgeTypes={EDGE_TYPES}
      />

      <button
        className="gnn-predictions-panel__predict-btn"
        onClick={handlePredict}
        disabled={!effectiveSource || isLoading}
      >
        {isLoading ? '\u23F3 Predicting...' : '\uD83D\uDD2E Predict Links'}
      </button>

      <PredictionsList
        predictions={predictions}
        sourceNode={effectiveSource}
        loading={isLoading}
        error={error}
        onShow={handleShow}
        onAdd={handleAdd}
        onShowAll={handleShowAll}
        onExport={handleExport}
      />
    </div>
  );
};

export default GNNPredictionsPanel;
