/**
 * DetailsWatcher - Floating panel showing full details of selected node/edge.
 *
 * Displays: description, tool binding, sub-graph link, parameters,
 * input/output format schemas, data contracts on edges, and styling info.
 *
 * Uses FloatingWindow as the draggable shell.
 */

import React, { useMemo } from 'react';
import {
  Eye, Settings2, Layers, ExternalLink, ArrowRight,
  AlertTriangle, Wrench, Box, GitBranch, Brain, Thermometer, Hash
} from 'lucide-react';
import FloatingWindow from './FloatingWindow';

// ── Palette (mirrors GXEVisualizerPage palette) ──
const PALETTE = {
  business:  { border: '#3b82f6', text: '#93c5fd' },
  executor:  { border: '#22c55e', text: '#86efac' },
  actor:     { border: '#a855f7', text: '#d8b4fe' },
  ai:        { border: '#eab308', text: '#fde047' },
  input:     { border: '#06b6d4', text: '#67e8f9' },
  output:    { border: '#ec4899', text: '#f9a8d4' },
  condition: { border: '#f59e0b', text: '#fcd34d' },
  tool:      { border: '#d97706', text: '#fbbf24' },
};

// ── AI Executor Detection ──

const AI_EXECUTOR_PREFIXES = ['session.ai_', 'ai.llm_', 'ai.'];
const isAIExecutor = (node) => {
  const et = node?.data?.executorType;
  return et && AI_EXECUTOR_PREFIXES.some(p => et.startsWith(p));
};

const DEFAULT_MODELS = [
  { id: 'gemini-flash', name: 'Gemini Flash' },
  { id: 'claude-sonnet', name: 'Claude Sonnet' },
  { id: 'claude-haiku', name: 'Claude Haiku' },
  { id: 'claude-opus', name: 'Claude Opus' },
];

// ── Model Settings Editor (for AI executor nodes) ──

const ModelSettingsEditor = ({ node, availableModels, onUpdateNodeData }) => {
  const params = node.data?.parameters || {};
  const models = availableModels?.length ? availableModels : DEFAULT_MODELS;

  const handleChange = (field, value) => {
    onUpdateNodeData(node.id, {
      parameters: { ...params, [field]: value },
    });
  };

  return (
    <Section title="AI Model Settings">
      <div className="space-y-3 bg-[#0d1117] rounded p-2.5">
        {/* Model */}
        <div>
          <label className="block text-[10px] text-[#8b949e] uppercase tracking-wider mb-1">
            <div className="flex items-center gap-1.5"><Brain className="w-3 h-3" /> Model</div>
          </label>
          <select
            value={params.model || 'gemini-flash'}
            onChange={(e) => handleChange('model', e.target.value)}
            className="w-full bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-xs text-[#e6edf3] outline-none focus:border-yellow-500/50"
          >
            {models.map(m => (
              <option key={m.id} value={m.id}>{m.name || m.id}</option>
            ))}
          </select>
        </div>

        {/* Temperature */}
        <div>
          <label className="block text-[10px] text-[#8b949e] uppercase tracking-wider mb-1">
            <div className="flex items-center gap-1.5">
              <Thermometer className="w-3 h-3" />
              Temperature
              <span className="ml-auto text-yellow-400 font-mono">{(params.temperature ?? 0.7).toFixed(2)}</span>
            </div>
          </label>
          <input
            type="range" min="0" max="1" step="0.05"
            value={params.temperature ?? 0.7}
            onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
            className="w-full h-1.5 bg-[#21262d] rounded-full appearance-none cursor-pointer accent-yellow-400"
          />
          <div className="flex justify-between text-[9px] text-[#484f58] mt-0.5">
            <span>Precise</span>
            <span>Creative</span>
          </div>
        </div>

        {/* Max Tokens */}
        <div>
          <label className="block text-[10px] text-[#8b949e] uppercase tracking-wider mb-1">
            <div className="flex items-center gap-1.5"><Hash className="w-3 h-3" /> Max Tokens</div>
          </label>
          <input
            type="number" min="256" max="16384" step="256"
            value={params.maxTokens ?? 1000}
            onChange={(e) => handleChange('maxTokens', parseInt(e.target.value, 10) || 1000)}
            className="w-full bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-xs text-[#e6edf3] font-mono outline-none focus:border-yellow-500/50"
          />
        </div>

        {/* Response Format */}
        <div>
          <label className="block text-[10px] text-[#8b949e] uppercase tracking-wider mb-1">
            Response Format
          </label>
          <select
            value={params.responseFormat || 'text'}
            onChange={(e) => handleChange('responseFormat', e.target.value)}
            className="w-full bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-xs text-[#e6edf3] outline-none focus:border-yellow-500/50"
          >
            <option value="text">Text</option>
            <option value="json">JSON</option>
          </select>
        </div>
      </div>
    </Section>
  );
};

// ── Helpers ──

/** Render an object's fields as a definition list */
const FieldTable = ({ obj, label }) => {
  if (!obj || typeof obj !== 'object') return null;
  const entries = Object.entries(obj);
  if (entries.length === 0) return null;

  return (
    <Section title={label}>
      <div className="space-y-1.5">
        {entries.map(([key, val]) => (
          <FieldRow key={key} name={key} value={val} />
        ))}
      </div>
    </Section>
  );
};

/** Single field row — handles string, object, and nested schemas */
const FieldRow = ({ name, value }) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const type = value.type || 'object';
    const desc = value.description || '';
    const def = value.default !== undefined ? `default: ${JSON.stringify(value.default)}` : '';
    const opt = value.optional ? '(optional)' : '';
    const extra = [desc, def, opt].filter(Boolean).join(' | ');
    // Nested fields
    const nestedFields = value.fields || value.items;
    return (
      <div>
        <div className="flex items-start gap-2">
          <span className="text-cyan-400 font-mono text-xs shrink-0">{name}</span>
          <span className="text-gray-500 text-xs font-mono">{type}</span>
        </div>
        {extra && <div className="text-gray-500 text-[10px] ml-4 mt-0.5">{extra}</div>}
        {nestedFields && typeof nestedFields === 'object' && (
          <div className="ml-4 mt-1 pl-2 border-l border-[#30363d]">
            {typeof nestedFields === 'string' ? (
              <span className="text-gray-500 text-[10px] font-mono">{nestedFields}</span>
            ) : (
              Object.entries(nestedFields).map(([k, v]) => (
                <div key={k} className="flex gap-2 text-[10px]">
                  <span className="text-cyan-400/70 font-mono">{k}</span>
                  <span className="text-gray-500 font-mono">{typeof v === 'string' ? v : JSON.stringify(v)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  }
  // Primitive value
  return (
    <div className="flex items-start gap-2">
      <span className="text-cyan-400 font-mono text-xs shrink-0">{name}</span>
      <span className="text-gray-400 text-xs font-mono break-all">
        {typeof value === 'string' ? value : JSON.stringify(value)}
      </span>
    </div>
  );
};

/** Section header with title line */
const Section = ({ title, children, action }) => (
  <div className="mb-3">
    <div className="flex items-center gap-2 mb-1.5">
      <div className="h-px flex-1 bg-[#30363d]" />
      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{title}</span>
      <div className="h-px flex-1 bg-[#30363d]" />
      {action}
    </div>
    {children}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// NODE DETAIL
// ═══════════════════════════════════════════════════════════════════════════

const NodeDetail = ({ node, onOpenSubGraph, onNavigateToTab, subGraphs, savedSubGraphs, availableModels, onUpdateNodeData }) => {
  const d = node.data || {};
  const kind = d.kind || 'executor';
  const c = PALETTE[kind] || PALETTE.executor;

  const hasSubGraph = d.hasSubGraph || !!(savedSubGraphs?.[node.id]);
  const openTabId = subGraphs?.[node.id];
  const savedSub = savedSubGraphs?.[node.id];

  const handleSubGraphClick = () => {
    if (openTabId) {
      onNavigateToTab?.(openTabId);
    } else if (hasSubGraph) {
      onOpenSubGraph?.(node.id, d);
    }
  };

  return (
    <div className="p-3 space-y-0">
      {/* Header badge */}
      <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-2.5 mb-3">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
            style={{ backgroundColor: c.border + '25', color: c.text }}
          >
            {kind}
          </span>
          {d.isToolRef && <Settings2 className="w-3.5 h-3.5 text-amber-400" />}
        </div>
        <div className="text-white font-medium text-sm">{d.label || node.id}</div>
        {d.executorType && (
          <div className="text-xs text-gray-400 font-mono mt-0.5">{d.executorType}</div>
        )}
      </div>

      {/* Description */}
      {d.description && (
        <Section title="Description">
          <p className="text-xs text-gray-300 leading-relaxed">{d.description}</p>
        </Section>
      )}

      {/* Tool Binding */}
      {d.toolRef && (
        <Section
          title="Tool Binding"
          action={
            hasSubGraph && (
              <button
                onClick={handleSubGraphClick}
                className="flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 transition-colors"
                title={openTabId ? 'Switch to open tab' : 'Open tool sub-graph'}
              >
                <Wrench className="w-3 h-3" />
                <span>{openTabId ? 'Go to tab' : 'Open'}</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </button>
            )
          }
        >
          <div className="text-xs text-gray-300 font-mono">{d.toolRef}</div>
          {d.toolRefDesired && (
            <div className="flex items-center gap-1.5 mt-1.5 text-yellow-500 text-[10px]">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              <span>Stub — needs dedicated executor: <span className="font-mono">{d.toolRefDesired}</span></span>
            </div>
          )}
        </Section>
      )}

      {/* Sub-Graph (when no toolRef but has subgraph) */}
      {!d.toolRef && hasSubGraph && (
        <Section
          title="Sub-Graph"
          action={
            <button
              onClick={handleSubGraphClick}
              className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
              title={openTabId ? 'Switch to open tab' : 'Open sub-graph'}
            >
              <Layers className="w-3 h-3" />
              <span>{openTabId ? 'Go to tab' : 'Open'}</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </button>
          }
        >
          {savedSub && (
            <div className="text-xs text-gray-300">
              {savedSub.name || savedSub.id}
            </div>
          )}
        </Section>
      )}

      {/* Parameters */}
      {d.parameters && Object.keys(d.parameters).length > 0 && (
        <Section title="Parameters">
          <div className="space-y-1 bg-[#0d1117] rounded p-2">
            {Object.entries(d.parameters).map(([k, v]) => (
              <div key={k} className="flex gap-2 text-xs">
                <span className="text-purple-400 font-mono shrink-0">{k}:</span>
                <span className="text-gray-400 font-mono break-all">
                  {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* AI Model Settings (only for AI executor nodes) */}
      {isAIExecutor(node) && onUpdateNodeData && (
        <ModelSettingsEditor
          node={node}
          availableModels={availableModels}
          onUpdateNodeData={onUpdateNodeData}
        />
      )}

      {/* Input Format */}
      <FieldTable obj={d.inputFormat} label="Input Format" />

      {/* Output Format */}
      <FieldTable obj={d.outputFormat} label="Output Format" />

      {/* Position */}
      {node.position && (
        <Section title="Position">
          <div className="text-xs text-gray-500 font-mono">
            x: {node.position.x}, y: {node.position.y}
          </div>
        </Section>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// EDGE DETAIL
// ═══════════════════════════════════════════════════════════════════════════

const EdgeDetail = ({ edge }) => {
  const contract = edge.dataContract || edge.data?.dataContract;
  const style = edge.style || {};

  return (
    <div className="p-3 space-y-0">
      {/* Header */}
      <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-2.5 mb-3">
        <div className="flex items-center gap-2 mb-1">
          <GitBranch className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-700/50 text-gray-300">
            edge
          </span>
          {edge.label && (
            <span className="text-[9px] font-medium text-gray-400">{edge.label}</span>
          )}
        </div>
        <div className="text-white font-medium text-sm flex items-center gap-2">
          <span className="text-cyan-400 font-mono">{edge.source}</span>
          <ArrowRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
          <span className="text-green-400 font-mono">{edge.target}</span>
        </div>
      </div>

      {/* Data Contract */}
      {contract && contract.fields && (
        <Section title="Data Contract">
          <div className="space-y-2">
            <div>
              <div className="text-[10px] text-gray-500 uppercase mb-1">Fields</div>
              <div className="bg-[#0d1117] rounded p-2 space-y-1">
                {Object.entries(contract.fields).map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-xs">
                    <span className="text-cyan-400 font-mono shrink-0">{k}:</span>
                    <span className="text-gray-400 font-mono break-all">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
            {contract.mapping && (
              <div>
                <div className="text-[10px] text-gray-500 uppercase mb-1">Mapping</div>
                <div className="bg-[#0d1117] rounded p-2 space-y-1">
                  {Object.entries(contract.mapping).map(([from, to]) => (
                    <div key={from} className="flex items-center gap-1.5 text-xs">
                      <span className="text-purple-400 font-mono">{from}</span>
                      <ArrowRight className="w-3 h-3 text-gray-600 flex-shrink-0" />
                      <span className="text-green-400 font-mono">{to}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {contract.note && (
              <div className="text-[10px] text-gray-500 italic mt-1">{contract.note}</div>
            )}
          </div>
        </Section>
      )}

      {/* Meta contract (e.g. container → entry) */}
      {contract && contract.type === 'meta' && (
        <Section title="Data Contract">
          <div className="text-xs text-gray-500 italic">{contract.description || 'Meta edge (no data flow)'}</div>
        </Section>
      )}

      {/* Tool-binding contract */}
      {contract && contract.type === 'tool-binding' && (
        <Section title="Binding Type">
          <div className="text-xs text-amber-400">{contract.description || 'Executor → Tool binding'}</div>
        </Section>
      )}

      {/* Edge Style */}
      {(style.stroke || edge.type || edge.animated !== undefined) && (
        <Section title="Edge Style">
          <div className="bg-[#0d1117] rounded p-2 space-y-1 text-xs">
            {edge.type && (
              <div className="flex gap-2">
                <span className="text-gray-500">type:</span>
                <span className="text-gray-300 font-mono">{edge.type}</span>
              </div>
            )}
            {edge.animated !== undefined && (
              <div className="flex gap-2">
                <span className="text-gray-500">animated:</span>
                <span className="text-gray-300 font-mono">{String(edge.animated)}</span>
              </div>
            )}
            {style.stroke && (
              <div className="flex items-center gap-2">
                <span className="text-gray-500">stroke:</span>
                <div className="w-3 h-3 rounded-sm border border-[#30363d]" style={{ backgroundColor: style.stroke }} />
                <span className="text-gray-300 font-mono">{style.stroke}</span>
              </div>
            )}
            {style.strokeDasharray && (
              <div className="flex gap-2">
                <span className="text-gray-500">dash:</span>
                <span className="text-gray-300 font-mono">{style.strokeDasharray}</span>
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// EMPTY STATE
// ═══════════════════════════════════════════════════════════════════════════

const EmptyState = () => (
  <div className="flex flex-col items-center justify-center h-full text-center p-6">
    <Box className="w-10 h-10 text-gray-700 mb-3" />
    <div className="text-sm text-gray-500">Click a node or edge to view details</div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// MAIN: DetailsWatcher
// ═══════════════════════════════════════════════════════════════════════════

const DetailsWatcher = ({
  selectedNode,
  selectedEdge,
  onOpenSubGraph,
  onNavigateToTab,
  subGraphs,
  savedSubGraphs,
  availableModels,
  onUpdateNodeData,
}) => {
  const headerExtra = useMemo(() => {
    if (selectedNode) {
      const kind = selectedNode.data?.kind || 'executor';
      const c = PALETTE[kind] || PALETTE.executor;
      return (
        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ color: c.text }}>
          {selectedNode.id}
        </span>
      );
    }
    if (selectedEdge) {
      return (
        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono text-gray-400">
          {selectedEdge.id}
        </span>
      );
    }
    return null;
  }, [selectedNode, selectedEdge]);

  return (
    <FloatingWindow
      storageKey="gxe-details-watcher"
      title="Details"
      icon={<Eye className="w-3.5 h-3.5" />}
      defaultPosition={{ x: typeof window !== 'undefined' ? window.innerWidth - 420 : 800, y: 100 }}
      defaultSize={{ width: 380, height: 520 }}
      minSize={{ width: 300, height: 200 }}
      zIndex={55}
      headerExtra={headerExtra}
    >
      {selectedNode ? (
        <NodeDetail
          node={selectedNode}
          onOpenSubGraph={onOpenSubGraph}
          onNavigateToTab={onNavigateToTab}
          subGraphs={subGraphs}
          savedSubGraphs={savedSubGraphs}
          availableModels={availableModels}
          onUpdateNodeData={onUpdateNodeData}
        />
      ) : selectedEdge ? (
        <EdgeDetail edge={selectedEdge} />
      ) : (
        <EmptyState />
      )}
    </FloatingWindow>
  );
};

export default DetailsWatcher;
