/**
 * GNNPanel — unified GNN predictions + settings panel.
 * CONS-14 + CONS-15. Self-contained, FloatingWindow shell.
 * Tailwind + lucide-react, GXE dark theme.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Brain, RefreshCw, Eye, Check, XCircle, Sliders,
  TrendingUp, Database, Clock, ToggleLeft, ToggleRight,
} from 'lucide-react';
import FloatingWindow from '../FloatingWindow';

const GNN_BASE = 'http://localhost:5000';

/* ── Helpers ─────────────────────────────────────────────── */

const ConfidenceBar = ({ value }) => {
  const pct = Math.round((value ?? 0) * 100);
  const color = pct >= 90 ? 'bg-emerald-500' : pct >= 70 ? 'bg-indigo-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5 w-full">
      <div className="flex-1 h-1.5 bg-[#21262d] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-400 w-8 text-right">{pct}%</span>
    </div>
  );
};

const MetricBar = ({ label, value, max = 1 }) => {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-gray-500 w-10 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-[#21262d] rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-purple-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-400 w-10 text-right">{typeof value === 'number' ? value.toFixed(3) : value}</span>
    </div>
  );
};

/* ── PredictionCard ──────────────────────────────────────── */

const PredictionCard = ({ prediction, onShow, onAccept, onReject }) => {
  const { sourceLabel, targetLabel, edgeType, confidence } = prediction;
  return (
    <div className="rounded border border-[#30363d] bg-[#161b22] p-2 space-y-1.5">
      <ConfidenceBar value={confidence} />
      <div className="text-xs text-gray-200">
        <span className="text-indigo-300">{sourceLabel || prediction.sourceId}</span>
        {' → '}
        <span className="text-emerald-300">{targetLabel || prediction.targetId}</span>
      </div>
      {edgeType && <div className="text-[10px] text-gray-500">Type: {edgeType}</div>}
      <div className="flex gap-1 pt-0.5">
        <button onClick={() => onShow(prediction)} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-gray-400 hover:text-indigo-400 hover:bg-[#21262d] transition-colors" title="Show on canvas">
          <Eye size={10} /> Show
        </button>
        <button onClick={() => onAccept(prediction)} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-gray-400 hover:text-emerald-400 hover:bg-[#21262d] transition-colors" title="Accept prediction">
          <Check size={10} /> Accept
        </button>
        <button onClick={() => onReject(prediction)} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-gray-400 hover:text-red-400 hover:bg-[#21262d] transition-colors" title="Reject prediction">
          <XCircle size={10} /> Reject
        </button>
      </div>
    </div>
  );
};

/* ── Predictions Tab ─────────────────────────────────────── */

const PredictionsTab = ({ nodes, onHighlight, onAddEdge }) => {
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [modelStatus, setModelStatus] = useState(null);
  const [filters, setFilters] = useState({ minConfidence: 0.7, edgeType: 'all', limit: 20 });

  // Fetch model status
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${GNN_BASE}/api/health`);
        if (res.ok) setModelStatus(await res.json());
      } catch { setModelStatus(null); }
    })();
  }, []);

  const fetchPredictions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nodeIds = (nodes || []).map(n => n.id);
      const res = await fetch(`${GNN_BASE}/api/predict/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeIds,
          minConfidence: filters.minConfidence,
          edgeType: filters.edgeType === 'all' ? undefined : filters.edgeType,
          limit: filters.limit,
        }),
      });
      if (!res.ok) throw new Error(`GNN service error: ${res.status}`);
      const data = await res.json();
      setPredictions(data.predictions || []);
    } catch (err) {
      setError(err.message);
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  }, [nodes, filters]);

  const handleAccept = async (pred) => {
    try {
      onAddEdge?.({
        source: pred.sourceId,
        target: pred.targetId,
        type: pred.edgeType || 'RELATED_TO',
        data: { fromGNN: true, confidence: pred.confidence },
      });
      setPredictions(prev => prev.filter(p => p.id !== pred.id));
    } catch { /* ignore */ }
  };

  const handleReject = async (pred) => {
    try {
      await fetch(`${GNN_BASE}/api/predict/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predictionId: pred.id, feedback: 'reject' }),
      });
    } catch { /* ignore */ }
    setPredictions(prev => prev.filter(p => p.id !== pred.id));
  };

  const handleBulkAccept = () => {
    predictions.filter(p => p.confidence >= 0.9).forEach(p => handleAccept(p));
  };

  const handleBulkReject = () => {
    predictions.filter(p => p.confidence < 0.5).forEach(p => handleReject(p));
  };

  return (
    <div className="space-y-3">
      {/* Model status bar */}
      <div className="flex items-center gap-2 text-[10px] text-gray-500">
        <span className={`w-1.5 h-1.5 rounded-full ${modelStatus ? 'bg-emerald-400' : 'bg-red-400'}`} />
        <span>{modelStatus ? 'GNN Service Active' : 'GNN Service Offline'}</span>
        {modelStatus?.model && <span className="text-gray-600">| {modelStatus.model}</span>}
      </div>

      {/* Filters */}
      <div className="bg-[#161b22] rounded border border-[#21262d] p-2 space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-gray-500 w-24 flex-shrink-0">Min confidence</label>
          <input
            type="range"
            min="0" max="1" step="0.05"
            value={filters.minConfidence}
            onChange={e => setFilters(f => ({ ...f, minConfidence: +e.target.value }))}
            className="flex-1 h-1 accent-purple-500"
          />
          <span className="text-[10px] text-gray-400 w-8 text-right">{filters.minConfidence.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-gray-500 w-24 flex-shrink-0">Limit</label>
          <input
            type="number"
            min="1" max="100"
            value={filters.limit}
            onChange={e => setFilters(f => ({ ...f, limit: Math.max(1, +e.target.value) }))}
            className="w-16 bg-[#0d1117] border border-[#30363d] rounded px-1.5 py-0.5 text-[10px] text-gray-300 outline-none focus:border-purple-500"
          />
        </div>
        <button
          onClick={fetchPredictions}
          disabled={loading || !modelStatus}
          className="w-full py-1.5 rounded text-xs font-medium bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? <RefreshCw size={12} className="inline animate-spin mr-1" /> : <Brain size={12} className="inline mr-1" />}
          Find Predictions
        </button>
      </div>

      {/* Error */}
      {error && <div className="text-[10px] text-red-400 px-1">{error}</div>}

      {/* Predictions list */}
      {predictions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-medium text-gray-400">Predictions ({predictions.length})</span>
          </div>
          <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-0.5">
            {predictions.map((pred, i) => (
              <PredictionCard
                key={pred.id || i}
                prediction={pred}
                onShow={() => onHighlight?.([pred.sourceId, pred.targetId])}
                onAccept={handleAccept}
                onReject={handleReject}
              />
            ))}
          </div>

          {/* Bulk actions */}
          <div className="flex gap-2 mt-2">
            <button onClick={handleBulkAccept} className="text-[10px] text-emerald-400 hover:text-emerald-300">
              Accept all ≥0.9
            </button>
            <button onClick={handleBulkReject} className="text-[10px] text-red-400 hover:text-red-300">
              Reject all &lt;0.5
            </button>
          </div>
        </div>
      )}

      {predictions.length === 0 && !loading && !error && (
        <div className="text-[10px] text-gray-600 text-center py-4">
          Click "Find Predictions" to discover potential edges
        </div>
      )}
    </div>
  );
};

/* ── Settings Tab ────────────────────────────────────────── */

const SettingsTab = () => {
  const [modelStatus, setModelStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [settings, setSettings] = useState({
    defaultMinConfidence: 0.7,
    maxPerRequest: 50,
    autoAcceptThreshold: 0.95,
    autoAcceptEnabled: false,
    showOnCanvas: true,
    includeInSimilarity: true,
    includeFeedback: true,
    autoRetrain: false,
  });
  const [saved, setSaved] = useState(false);
  const [training, setTraining] = useState(false);

  const fetchStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch(`${GNN_BASE}/api/health`);
      if (res.ok) setModelStatus(await res.json());
    } catch { setModelStatus(null); }
    finally { setStatusLoading(false); }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleSave = async () => {
    try {
      await fetch(`${GNN_BASE}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ }
  };

  const handleRetrain = async () => {
    setTraining(true);
    try {
      await fetch(`${GNN_BASE}/api/training/start`, { method: 'POST' });
    } catch { /* ignore */ }
    finally { setTraining(false); }
  };

  const toggle = (key) => setSettings(s => ({ ...s, [key]: !s[key] }));

  return (
    <div className="space-y-4">
      {/* Model Status */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[11px] font-medium text-gray-400">Model Status</h4>
          <button onClick={fetchStatus} className="p-0.5 text-gray-500 hover:text-gray-300">
            <RefreshCw size={10} className={statusLoading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="bg-[#161b22] rounded border border-[#21262d] p-2 space-y-1.5">
          <div className="flex items-center gap-2 text-[10px]">
            <span className={`w-1.5 h-1.5 rounded-full ${modelStatus ? 'bg-emerald-400' : 'bg-red-400'}`} />
            <span className="text-gray-300">{modelStatus ? 'Active' : 'Offline'}</span>
            {modelStatus?.model && <span className="text-gray-500">({modelStatus.model})</span>}
          </div>
          {modelStatus?.trainedAt && (
            <div className="flex items-center gap-1 text-[10px] text-gray-500">
              <Clock size={9} />
              Trained: {new Date(modelStatus.trainedAt).toLocaleDateString()}
            </div>
          )}
          {modelStatus?.metrics && (
            <div className="space-y-1 pt-1">
              {modelStatus.metrics.auc != null && <MetricBar label="AUC" value={modelStatus.metrics.auc} />}
              {modelStatus.metrics.f1 != null && <MetricBar label="F1" value={modelStatus.metrics.f1} />}
              {modelStatus.metrics.accuracy != null && <MetricBar label="Acc" value={modelStatus.metrics.accuracy} />}
            </div>
          )}
          {modelStatus?.trainingData && (
            <div className="flex gap-3 pt-1 text-[10px] text-gray-500">
              <span><Database size={9} className="inline mr-0.5" />{modelStatus.trainingData.graphs} graphs</span>
              <span>{modelStatus.trainingData.nodes} nodes</span>
              <span>{modelStatus.trainingData.edges} edges</span>
            </div>
          )}
        </div>
      </div>

      {/* Prediction Defaults */}
      <div>
        <h4 className="text-[11px] font-medium text-gray-400 mb-2">Prediction Defaults</h4>
        <div className="bg-[#161b22] rounded border border-[#21262d] p-2 space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-gray-500 w-28 flex-shrink-0">Min confidence</label>
            <input
              type="number" min="0" max="1" step="0.05"
              value={settings.defaultMinConfidence}
              onChange={e => setSettings(s => ({ ...s, defaultMinConfidence: +e.target.value }))}
              className="w-16 bg-[#0d1117] border border-[#30363d] rounded px-1.5 py-0.5 text-[10px] text-gray-300 outline-none focus:border-purple-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-gray-500 w-28 flex-shrink-0">Max per request</label>
            <input
              type="number" min="1" max="200"
              value={settings.maxPerRequest}
              onChange={e => setSettings(s => ({ ...s, maxPerRequest: +e.target.value }))}
              className="w-16 bg-[#0d1117] border border-[#30363d] rounded px-1.5 py-0.5 text-[10px] text-gray-300 outline-none focus:border-purple-500"
            />
          </div>
          <SettingToggle label="Show predictions on canvas" checked={settings.showOnCanvas} onChange={() => toggle('showOnCanvas')} />
          <SettingToggle label="Include in similarity search" checked={settings.includeInSimilarity} onChange={() => toggle('includeInSimilarity')} />
        </div>
      </div>

      {/* Training */}
      <div>
        <h4 className="text-[11px] font-medium text-gray-400 mb-2">Training</h4>
        <div className="bg-[#161b22] rounded border border-[#21262d] p-2 space-y-2">
          <button
            onClick={handleRetrain}
            disabled={training || !modelStatus}
            className="w-full py-1.5 rounded text-xs font-medium bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {training ? <RefreshCw size={12} className="inline animate-spin mr-1" /> : <TrendingUp size={12} className="inline mr-1" />}
            Retrain Model
          </button>
          <SettingToggle label="Include user feedback" checked={settings.includeFeedback} onChange={() => toggle('includeFeedback')} />
          <SettingToggle label="Auto-retrain weekly" checked={settings.autoRetrain} onChange={() => toggle('autoRetrain')} />
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center justify-end gap-2 pt-1">
        {saved && <span className="text-[10px] text-emerald-400">Saved!</span>}
        <button
          onClick={handleSave}
          className="px-3 py-1 rounded text-xs font-medium bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-colors"
        >
          <Sliders size={10} className="inline mr-1" /> Save Settings
        </button>
      </div>
    </div>
  );
};

/* ── SettingToggle ────────────────────────────────────────── */

const SettingToggle = ({ label, checked, onChange }) => (
  <button onClick={onChange} className="flex items-center gap-2 w-full text-left">
    {checked
      ? <ToggleRight size={16} className="text-purple-400 flex-shrink-0" />
      : <ToggleLeft size={16} className="text-gray-600 flex-shrink-0" />}
    <span className={`text-[10px] ${checked ? 'text-gray-300' : 'text-gray-500'}`}>{label}</span>
  </button>
);

/* ── Main Panel ──────────────────────────────────────────── */

const GNNPanel = ({ isOpen, onClose, nodes, edges, onHighlight, onAddEdge }) => {
  const [activeTab, setActiveTab] = useState('predictions');

  if (!isOpen) return null;

  return (
    <FloatingWindow
      storageKey="gxe-gnn-panel"
      title="GNN Intelligence"
      icon={<Brain size={14} className="text-purple-400" />}
      defaultPosition={{ x: 60, y: 80 }}
      defaultSize={{ width: 360, height: 520 }}
      onClose={onClose}
    >
      {/* Tabs */}
      <div className="flex border-b border-[#21262d] mb-3 -mx-3 px-3">
        {['predictions', 'settings'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-xs capitalize transition-colors
              ${activeTab === tab
                ? 'text-purple-400 border-b-2 border-purple-400'
                : 'text-gray-500 hover:text-gray-300'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'predictions' ? (
        <PredictionsTab nodes={nodes} onHighlight={onHighlight} onAddEdge={onAddEdge} />
      ) : (
        <SettingsTab />
      )}
    </FloatingWindow>
  );
};

export default GNNPanel;
