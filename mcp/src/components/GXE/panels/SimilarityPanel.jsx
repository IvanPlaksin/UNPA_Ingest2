/**
 * SimilarityPanel — GXE node similarity explorer.
 *
 * Migrated from Nexus/Similarity (CONS-09).
 * Standalone: no nexusStore dependency.
 * Features: reference node, method selector, options, results, comparison.
 * Tailwind + GXE dark theme, lucide-react icons.
 */

import React, { useState, useCallback } from 'react';
import {
  Link, ClipboardList, Shuffle, Info,
  Loader2, AlertCircle, ArrowRight, X,
  Eye, GitCompare, Box, Settings, Puzzle,
  FileText, Database, Globe, ChevronDown,
  CheckCircle, XCircle, Minus,
} from 'lucide-react';
import api from '../../../services/api';

// ── Similarity methods ──
const METHODS = [
  { id: 'structural', name: 'Structural', icon: Link,          desc: 'Based on graph position and connections' },
  { id: 'properties', name: 'Properties', icon: ClipboardList, desc: 'Based on node attributes and metadata' },
  { id: 'hybrid',     name: 'Hybrid',     icon: Shuffle,       desc: 'Combined structural + property similarity' },
];

// ── Type icons ──
const TYPE_ICON = {
  CLASS: Box, METHOD: Settings, SERVICE: Globe, INTERFACE: Puzzle, FILE: FileText,
};
const LAYER_COLORS = { Strategic: '#f59e0b', Business: '#3b82f6', Code: '#22c55e' };

const simColor = (s) => s >= 0.8 ? '#22c55e' : s >= 0.5 ? '#f59e0b' : '#64748b';

// ── Client-side fallback ──
function clientSimilarity(refNode, nodes, edges, { method = 'structural', limit = 10, sameTypeOnly = false, sameLayerOnly = false } = {}) {
  if (!refNode) return [];

  const refEdges = edges.filter(e => e.source === refNode.id || e.target === refNode.id);
  const refNeighbors = new Set(refEdges.map(e => e.source === refNode.id ? e.target : e.source));

  return nodes
    .filter(n => n.id !== refNode.id)
    .filter(n => !sameTypeOnly || n.type === refNode.type)
    .filter(n => !sameLayerOnly || n.layer === refNode.layer)
    .map(n => {
      const nEdges = edges.filter(e => e.source === n.id || e.target === n.id);
      const nNeighbors = new Set(nEdges.map(e => e.source === n.id ? e.target : e.source));

      let sim = 0;
      const reasons = [];

      // Structural: Jaccard on neighbors
      if (method !== 'properties') {
        const inter = [...refNeighbors].filter(x => nNeighbors.has(x)).length;
        const union = new Set([...refNeighbors, ...nNeighbors]).size;
        const jaccard = union > 0 ? inter / union : 0;
        sim += jaccard * (method === 'hybrid' ? 0.5 : 1.0);
        if (jaccard > 0.3) reasons.push(`${inter} shared connections`);
      }

      // Properties: type + layer match
      if (method !== 'structural') {
        let propSim = 0;
        if (n.type === refNode.type) { propSim += 0.5; reasons.push('same type'); }
        if (n.layer === refNode.layer) { propSim += 0.3; reasons.push('same layer'); }
        const degDiff = Math.abs((nEdges.length || 0) - (refEdges.length || 0));
        propSim += Math.max(0, 0.2 - degDiff * 0.02);
        sim += propSim * (method === 'hybrid' ? 0.5 : 1.0);
      }

      return { node: { id: n.id, name: n.data?.label || n.name || n.id, type: n.type, layer: n.layer, degree: nEdges.length }, similarity: Math.min(sim, 1.0), matchReasons: reasons };
    })
    .filter(r => r.similarity > 0.05)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

// ── ComparisonView ──
const ComparisonView = ({ refNode, compNode, onClose }) => {
  if (!refNode || !compNode) return null;
  const cmp = (a, b) => a === b ? 'match' : 'different';
  const icon = (s) => s === 'match' ? <CheckCircle size={11} className="text-green-400" /> : <XCircle size={11} className="text-red-400" />;
  const props = [
    { label: 'Type',   ref: refNode.type,           comp: compNode.type },
    { label: 'Layer',  ref: refNode.layer,           comp: compNode.layer },
    { label: 'Degree', ref: refNode.degree ?? 0,     comp: compNode.degree ?? 0 },
  ];

  return (
    <div className="mt-3 p-3 rounded-lg bg-[#0d1117] border border-[#30363d]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-gray-300">Comparison</span>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={12} /></button>
      </div>
      <div className="flex items-center justify-between mb-2 text-[10px]">
        <span className="text-indigo-400 truncate max-w-[40%]">{refNode.name || refNode.id}</span>
        <span className="text-gray-600 mx-1">vs</span>
        <span className="text-emerald-400 truncate max-w-[40%]">{compNode.name || compNode.id}</span>
      </div>
      {props.map(p => {
        const status = cmp(p.ref, p.comp);
        return (
          <div key={p.label} className="flex items-center gap-2 py-1 text-[10px]">
            <span className="text-gray-500 w-12">{p.label}</span>
            <span className="text-gray-300 flex-1 truncate">{p.ref ?? 'N/A'}</span>
            {icon(status)}
            <span className="text-gray-300 flex-1 truncate text-right">{p.comp ?? 'N/A'}</span>
          </div>
        );
      })}
    </div>
  );
};

// ── Main SimilarityPanel ──
const SimilarityPanel = ({ selectedNode, nodes = [], edges = [], namespace = 'GXE', onNavigate }) => {
  const [method, setMethod] = useState('structural');
  const [options, setOptions] = useState({ limit: 10, sameTypeOnly: false, sameLayerOnly: false });
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [comparedNode, setComparedNode] = useState(null);

  const refNode = selectedNode ? {
    id: selectedNode.id,
    name: selectedNode.data?.label || selectedNode.name || selectedNode.id,
    type: selectedNode.type,
    layer: selectedNode.layer || selectedNode.data?.layer,
    degree: edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id).length,
  } : null;

  const findSimilar = useCallback(async () => {
    if (!selectedNode) return;
    setLoading(true);
    setError(null);
    setComparedNode(null);

    try {
      const resp = await api.post('/gnn/similar', {
        namespace,
        nodeId: selectedNode.id,
        method,
        ...options,
      });
      if (resp.data?.results) {
        setResults(resp.data.results);
      } else {
        setResults(clientSimilarity(selectedNode, nodes, edges, { method, ...options }));
      }
    } catch {
      setResults(clientSimilarity(selectedNode, nodes, edges, { method, ...options }));
    } finally {
      setLoading(false);
    }
  }, [selectedNode, namespace, method, options, nodes, edges]);

  const RefIcon = refNode ? (TYPE_ICON[refNode.type?.toUpperCase()] || FileText) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Reference Node */}
      <div className="px-3 py-2 border-b border-[#21262d]">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Reference Node</span>
        {refNode ? (
          <div className="flex items-center gap-2 mt-1.5 p-2 rounded-md bg-[#0d1117] border border-[#30363d]">
            <RefIcon size={14} className="text-gray-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-gray-200 truncate">{refNode.name}</div>
              <div className="flex items-center gap-1 text-[10px] text-gray-500">
                <span>{refNode.type}</span>
                {refNode.layer && (
                  <>
                    <span>&middot;</span>
                    <span style={{ color: LAYER_COLORS[refNode.layer] || '#64748b' }}>{refNode.layer}</span>
                  </>
                )}
                <span>&middot;</span>
                <span>{refNode.degree} connections</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-1.5 p-3 rounded-md bg-[#0d1117] border border-dashed border-[#30363d] text-center text-[11px] text-gray-500">
            Select a node on the canvas
          </div>
        )}
      </div>

      {/* Method Selector */}
      <div className="px-3 py-2 border-b border-[#21262d]">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Method</span>
        <div className="flex gap-1 mt-1.5">
          {METHODS.map(m => {
            const MIcon = m.icon;
            const selected = method === m.id;
            return (
              <button
                key={m.id}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${
                  selected
                    ? 'bg-[#58a6ff]/20 text-[#58a6ff] border border-[#58a6ff]/30'
                    : 'text-gray-400 hover:bg-[#21262d] hover:text-gray-300'
                }`}
                onClick={() => setMethod(m.id)}
                title={m.desc}
              >
                <MIcon size={11} />
                {m.name}
              </button>
            );
          })}
        </div>
        <div className="mt-1 text-[10px] text-gray-600 flex items-center gap-1">
          <Info size={10} />
          {METHODS.find(m => m.id === method)?.desc}
        </div>
      </div>

      {/* Options */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[#21262d]">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-500">Limit</span>
          <select
            className="bg-[#0d1117] border border-[#30363d] rounded text-[10px] text-gray-300 px-1 py-0.5"
            value={options.limit}
            onChange={(e) => setOptions(prev => ({ ...prev, limit: parseInt(e.target.value) }))}
          >
            {[5, 10, 20, 50].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            className="rounded border-[#30363d]"
            checked={options.sameTypeOnly}
            onChange={(e) => setOptions(prev => ({ ...prev, sameTypeOnly: e.target.checked }))}
          />
          Same type
        </label>
        <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            className="rounded border-[#30363d]"
            checked={options.sameLayerOnly}
            onChange={(e) => setOptions(prev => ({ ...prev, sameLayerOnly: e.target.checked }))}
          />
          Same layer
        </label>
      </div>

      {/* Find button */}
      <div className="px-3 py-2">
        <button
          className="w-full py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-indigo-600 text-white hover:bg-indigo-500"
          onClick={findSimilar}
          disabled={!selectedNode || loading}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-1.5">
              <Loader2 size={12} className="animate-spin" /> Searching...
            </span>
          ) : (
            'Find Similar Nodes'
          )}
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {error && (
          <div className="flex items-center gap-2 p-2 rounded-md bg-red-500/10 text-red-400 text-[11px] mb-2">
            <AlertCircle size={12} /> {error}
          </div>
        )}

        {!loading && results.length > 0 && (
          <>
            <div className="text-[10px] text-gray-500 mb-2">
              {results.length} similar node{results.length !== 1 ? 's' : ''}
            </div>
            {results.map((r, i) => {
              const n = r.node;
              const NIcon = TYPE_ICON[n.type?.toUpperCase()] || FileText;
              const pct = Math.round(r.similarity * 100);
              return (
                <div
                  key={n.id || i}
                  className="flex items-start gap-2 p-2 rounded-md hover:bg-[#30363d] transition-colors group mb-1"
                >
                  <NIcon size={13} className="text-gray-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-200 truncate">{n.name}</span>
                      <span className="text-[10px] font-semibold tabular-nums" style={{ color: simColor(r.similarity) }}>
                        {pct}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-gray-500 mt-0.5">
                      <span>{n.type}</span>
                      {n.layer && (
                        <>
                          <span>&middot;</span>
                          <span style={{ color: LAYER_COLORS[n.layer] || '#64748b' }}>{n.layer}</span>
                        </>
                      )}
                      <span>&middot;</span>
                      <span>{n.degree ?? 0} conn</span>
                    </div>
                    {r.matchReasons?.length > 0 && (
                      <div className="text-[9px] text-gray-600 mt-0.5">
                        Match: {r.matchReasons.join(', ')}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="p-1 rounded text-gray-500 hover:text-gray-200 hover:bg-[#21262d]"
                      onClick={() => onNavigate?.(n)}
                      title="Show on graph"
                    >
                      <Eye size={12} />
                    </button>
                    <button
                      className="p-1 rounded text-gray-500 hover:text-gray-200 hover:bg-[#21262d]"
                      onClick={() => setComparedNode(n)}
                      title="Compare"
                    >
                      <GitCompare size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {!loading && results.length === 0 && !error && selectedNode && (
          <div className="text-center text-[11px] text-gray-500 py-4">
            Click &ldquo;Find Similar Nodes&rdquo; to start
          </div>
        )}

        {/* Comparison */}
        {comparedNode && refNode && (
          <ComparisonView
            refNode={refNode}
            compNode={comparedNode}
            onClose={() => setComparedNode(null)}
          />
        )}
      </div>
    </div>
  );
};

export default SimilarityPanel;
