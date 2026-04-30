import React, { useState, useEffect } from 'react';
import { Sparkles, GitBranch, Tags, Users, X, Loader2, Info } from 'lucide-react';
import useImportSqlStore from '../../stores/importSqlStore';
import gnnService from '../../services/gnn.service';

// ═══════════════════════════════════════════════════════════════════════
// GnnAnalysisPrompt
//
// Modal that appears after SQL Import, offering GNN analysis options:
// - Link Prediction (discover hidden relationships)
// - Node Classification (categorize tables)
// - Community Detection (find logical groupings)
// ═══════════════════════════════════════════════════════════════════════

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000,
};

const cardStyle = {
  background: '#161b22',
  border: '1px solid #30363d',
  borderRadius: 12,
  padding: 24,
  width: 440,
  maxWidth: '90vw',
  color: '#e6edf3',
  position: 'relative',
};

const checkboxRowStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: '10px 12px',
  borderRadius: 8,
  background: '#0d1117',
  border: '1px solid #21262d',
  cursor: 'pointer',
  transition: 'border-color 0.15s',
};

const ANALYSES = [
  {
    key: 'linkPrediction',
    icon: GitBranch,
    color: '#58a6ff',
    label: 'Link Prediction',
    desc: 'Discover hidden relationships between tables that aren\'t captured by foreign keys',
  },
  {
    key: 'nodeClassification',
    icon: Tags,
    color: '#3fb950',
    label: 'Node Classification',
    desc: 'Categorize tables automatically (Transaction, Reference, Log, Lookup, etc.)',
  },
  {
    key: 'communityDetection',
    icon: Users,
    color: '#d2a8ff',
    label: 'Community Detection',
    desc: 'Find logical groupings and modules within your database schema',
  },
];

const GnnAnalysisPrompt = () => {
  const showGnnPrompt = useImportSqlStore(s => s.showGnnPrompt);
  const gnnOptions = useImportSqlStore(s => s.gnnOptions);
  const gnnStatus = useImportSqlStore(s => s.gnnStatus);
  const gnnProgress = useImportSqlStore(s => s.gnnProgress);
  const gnnError = useImportSqlStore(s => s.gnnError);
  const lastImportedGraphData = useImportSqlStore(s => s.lastImportedGraphData);
  const [modelsLoaded, setModelsLoaded] = useState(null); // null = checking, true/false

  const {
    hideGnnPrompt,
    setGnnOptions,
    startGnnAnalysis,
    setGnnProgress,
    setGnnResults,
    setGnnError,
  } = useImportSqlStore.getState();

  // Check if GNN models are loaded
  useEffect(() => {
    if (!showGnnPrompt) return;
    let cancelled = false;
    fetch(`${import.meta.env.VITE_GNN_URL || 'http://localhost:5001'}/health`)
      .then(r => r.json())
      .then(h => {
        if (cancelled) return;
        const models = h?.components?.models;
        setModelsLoaded(models?.status === 'healthy');
      })
      .catch(() => !cancelled && setModelsLoaded(false));
    return () => { cancelled = true; };
  }, [showGnnPrompt]);

  if (!showGnnPrompt) return null;

  const isRunning = gnnStatus === 'running';
  const anySelected = Object.values(gnnOptions).some(Boolean);

  const handleToggle = (key) => {
    if (isRunning) return;
    setGnnOptions({ [key]: !gnnOptions[key] });
  };

  const handleRun = async () => {
    const graphData = lastImportedGraphData;

    if (!graphData || !graphData.nodes?.length) {
      setGnnError('No graph data available for GNN analysis');
      return;
    }

    startGnnAnalysis();

    try {
      const results = await gnnService.analyzeImportedGraph(
        graphData,
        gnnOptions,
        (current, total, phase) => setGnnProgress(current, total, phase),
      );
      setGnnResults(results);
    } catch (err) {
      console.error('[GNN Analysis] Error:', err);
      setGnnError(err.message || 'GNN analysis failed');
    }
  };

  return (
    <div style={overlayStyle} onClick={hideGnnPrompt}>
      <div style={cardStyle} onClick={e => e.stopPropagation()}>
        {/* Close button */}
        <button
          onClick={hideGnnPrompt}
          style={{
            position: 'absolute', top: 12, right: 12,
            background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer',
          }}
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Sparkles size={20} style={{ color: '#d2a8ff' }} />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Enhance with GNN Analysis</h3>
        </div>
        <p style={{ color: '#8b949e', fontSize: 13, margin: '0 0 16px', lineHeight: 1.4 }}>
          Run Graph Neural Network analysis on your imported SQL schema to discover patterns invisible in raw structure.
        </p>

        {/* Fallback mode indicator */}
        {modelsLoaded === false && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 6, background: '#d2a8ff10',
            marginBottom: 12, fontSize: 12, color: '#d2a8ff',
            border: '1px solid #d2a8ff30',
          }}>
            <Info size={14} style={{ flexShrink: 0 }} />
            <span>GNN models not loaded — using structural heuristic analysis (naming patterns, column analysis, label propagation)</span>
          </div>
        )}

        {/* Checkboxes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {ANALYSES.map(({ key, icon: Icon, color, label, desc }) => (
            <div
              key={key}
              style={{
                ...checkboxRowStyle,
                borderColor: gnnOptions[key] ? color + '60' : '#21262d',
                opacity: isRunning ? 0.6 : 1,
              }}
              onClick={() => handleToggle(key)}
            >
              <input
                type="checkbox"
                checked={gnnOptions[key]}
                onChange={() => handleToggle(key)}
                disabled={isRunning}
                style={{ marginTop: 2, accentColor: color }}
              />
              <Icon size={16} style={{ color, marginTop: 1, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
                <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Progress */}
        {isRunning && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 6, background: '#0d1117',
            marginBottom: 16, fontSize: 12, color: '#58a6ff',
          }}>
            <Loader2 size={14} className="animate-spin" />
            <span>{gnnProgress.phase || 'Processing...'}</span>
            {gnnProgress.total > 0 && (
              <span style={{ color: '#8b949e', marginLeft: 'auto' }}>
                {gnnProgress.current}/{gnnProgress.total}
              </span>
            )}
          </div>
        )}

        {/* Error */}
        {gnnError && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 6, background: '#f8514920',
            marginBottom: 16, fontSize: 12, color: '#f85149',
            border: '1px solid #f8514940',
          }}>
            <span>{gnnError}</span>
            <button
              onClick={() => setGnnError(null)}
              style={{ background: 'none', border: 'none', color: '#f85149', cursor: 'pointer', marginLeft: 'auto' }}
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={hideGnnPrompt}
            disabled={isRunning}
            style={{
              padding: '7px 16px', borderRadius: 6,
              border: '1px solid #30363d', background: 'transparent',
              color: '#8b949e', fontSize: 13, cursor: 'pointer',
            }}
          >
            Skip
          </button>
          <button
            onClick={handleRun}
            disabled={isRunning || !anySelected}
            style={{
              padding: '7px 16px', borderRadius: 6,
              border: '1px solid #a855f7', background: '#a855f720',
              color: '#d2a8ff', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              opacity: (isRunning || !anySelected) ? 0.5 : 1,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Sparkles size={14} />
            {isRunning ? 'Analyzing...' : 'Run Analysis'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GnnAnalysisPrompt;
