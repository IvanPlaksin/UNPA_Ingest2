/**
 * PropertiesPanel — GXE node/edge property editor.
 *
 * Migrated from AOPEG/PropertiesPanel.tsx (CONS-10).
 * Standalone FloatingWindow panel for editing selected node/edge properties.
 * Features: basic info, parameters (JSON), execution settings (retry/timeout/quality),
 *           edge conditions, duplicate, delete.
 * Tailwind + GXE dark theme, lucide-react icons.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings, ArrowRight, Copy, Trash2, RotateCcw,
  ChevronDown, ChevronRight, Zap, Clock, Shield,
  AlertCircle,
} from 'lucide-react';

// ── Form primitives ──
const Label = ({ children }) => (
  <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">
    {children}
  </label>
);

const Input = (props) => (
  <input
    {...props}
    className={`w-full h-8 px-2.5 text-xs rounded-md bg-[#0d1117] border border-[#30363d] text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-[#58a6ff] focus:border-transparent ${props.className || ''}`}
  />
);

const Textarea = (props) => (
  <textarea
    {...props}
    className={`w-full px-2.5 py-1.5 text-xs rounded-md bg-[#0d1117] border border-[#30363d] text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-[#58a6ff] focus:border-transparent ${props.className || ''}`}
  />
);

const Select = (props) => (
  <select
    {...props}
    className={`w-full h-8 px-2.5 text-xs rounded-md bg-[#0d1117] border border-[#30363d] text-gray-200 focus:outline-none focus:ring-1 focus:ring-[#58a6ff] focus:border-transparent ${props.className || ''}`}
  />
);

// ── JSON Editor ──
const JsonEditor = ({ value, onChange }) => {
  const [text, setText] = useState(JSON.stringify(value || {}, null, 2));
  const [error, setError] = useState(null);

  useEffect(() => {
    setText(JSON.stringify(value || {}, null, 2));
  }, [value]);

  const handleChange = (newText) => {
    setText(newText);
    try {
      const parsed = JSON.parse(newText);
      setError(null);
      onChange(parsed);
    } catch {
      setError('Invalid JSON');
    }
  };

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        className={`w-full h-28 px-2.5 py-1.5 font-mono text-[11px] rounded-md bg-[#0d1117] border text-gray-200 focus:outline-none focus:ring-1 focus:ring-[#58a6ff] ${error ? 'border-red-500/50' : 'border-[#30363d]'}`}
        spellCheck={false}
      />
      {error && <p className="text-[10px] text-red-400 mt-0.5">{error}</p>}
    </div>
  );
};

// ── Collapsible Section ──
const Section = ({ title, icon: Icon, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[#21262d]">
      <button
        className="flex items-center gap-2 w-full px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider hover:bg-[#1c2128] transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        {Icon && <Icon size={11} />}
        {title}
      </button>
      {open && <div className="px-3 pb-3 space-y-3">{children}</div>}
    </div>
  );
};

// ── Node Properties ──
const NodeProperties = ({ node, onUpdate, onDelete, onDuplicate }) => {
  const data = node.data || {};
  const label = data.label || data.displayName || '';
  const description = data.description || '';
  const tool = data.tool || data.executorType || '';
  const params = data.params || data.parameters || {};
  const timeout = data.timeout || 30000;
  const qualityThreshold = data.qualityThreshold;
  const retryPolicy = data.retryPolicy || { maxRetries: 0, backoffMs: 1000, backoffMultiplier: 2 };

  const update = useCallback((partial) => {
    onUpdate(node.id, partial);
  }, [node.id, onUpdate]);

  return (
    <>
      {/* Node header info */}
      <div className="px-3 py-2 border-b border-[#21262d]">
        <div className="flex items-center gap-2">
          <Settings size={12} className="text-gray-500" />
          <span className="text-xs font-medium text-gray-200 truncate">{label || node.id}</span>
        </div>
        {tool && (
          <div className="mt-1 text-[10px] font-mono text-gray-500 truncate">{tool}</div>
        )}
        <div className="mt-0.5 text-[10px] text-gray-600">ID: {node.id}</div>
      </div>

      {/* Basic */}
      <Section title="Basic" defaultOpen={true}>
        <div>
          <Label>Label</Label>
          <Input
            type="text"
            value={label}
            onChange={(e) => update({ label: e.target.value, displayName: e.target.value })}
          />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => update({ description: e.target.value })}
            rows={2}
          />
        </div>
      </Section>

      {/* Parameters */}
      <Section title="Parameters" icon={Settings} defaultOpen={true}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-500">JSON</span>
          <button
            onClick={() => update({ params: {}, parameters: {} })}
            className="flex items-center gap-1 text-[10px] text-[#58a6ff] hover:text-[#79c0ff]"
          >
            <RotateCcw size={10} /> Reset
          </button>
        </div>
        <JsonEditor
          value={params}
          onChange={(p) => update({ params: p, parameters: p })}
        />
      </Section>

      {/* Execution Settings */}
      <Section title="Execution" icon={Zap} defaultOpen={false}>
        <div>
          <Label>Timeout (ms)</Label>
          <Input
            type="number"
            value={timeout}
            onChange={(e) => update({ timeout: parseInt(e.target.value) || 30000 })}
            min={1000}
            step={1000}
          />
        </div>

        <div>
          <Label>Quality Threshold (0-1)</Label>
          <Input
            type="number"
            value={qualityThreshold || ''}
            onChange={(e) => update({ qualityThreshold: parseFloat(e.target.value) || undefined })}
            min={0}
            max={1}
            step={0.1}
            placeholder="Optional"
          />
        </div>

        <div>
          <Label>Retry Policy</Label>
          <div className="space-y-2 p-2 bg-[#0d1117] border border-[#30363d] rounded-md">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 w-20">Max Retries</span>
              <Input
                type="number"
                value={retryPolicy.maxRetries}
                onChange={(e) => update({ retryPolicy: { ...retryPolicy, maxRetries: parseInt(e.target.value) || 0 } })}
                min={0}
                max={10}
                className="flex-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 w-20">Backoff (ms)</span>
              <Input
                type="number"
                value={retryPolicy.backoffMs}
                onChange={(e) => update({ retryPolicy: { ...retryPolicy, backoffMs: parseInt(e.target.value) || 1000 } })}
                min={100}
                step={100}
                className="flex-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 w-20">Multiplier</span>
              <Input
                type="number"
                value={retryPolicy.backoffMultiplier}
                onChange={(e) => update({ retryPolicy: { ...retryPolicy, backoffMultiplier: parseFloat(e.target.value) || 2 } })}
                min={1}
                max={5}
                step={0.5}
                className="flex-1"
              />
            </div>
          </div>
        </div>
      </Section>

      {/* Actions */}
      <div className="px-3 py-2 flex gap-2">
        <button
          onClick={() => onDuplicate(node.id)}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] rounded-md bg-[#21262d] border border-[#30363d] text-gray-300 hover:bg-[#30363d] transition-colors"
        >
          <Copy size={11} /> Duplicate
        </button>
        <button
          onClick={() => onDelete(node.id)}
          className="flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] rounded-md bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors"
        >
          <Trash2 size={11} /> Delete
        </button>
      </div>
    </>
  );
};

// ── Edge Properties ──
const CONDITION_TYPES = ['always', 'success', 'failure', 'quality', 'expression'];

const EdgeProperties = ({ edge, onUpdate, onDelete }) => {
  const data = edge.data || {};
  const label = data.label || '';
  const priority = data.priority || 1;
  const condition = data.condition || null;

  const update = useCallback((partial) => {
    onUpdate(edge.id, partial);
  }, [edge.id, onUpdate]);

  return (
    <>
      {/* Edge header */}
      <div className="px-3 py-2 border-b border-[#21262d]">
        <div className="flex items-center gap-2">
          <ArrowRight size={12} className="text-gray-500" />
          <span className="text-xs font-medium text-gray-200">Edge</span>
        </div>
        <div className="mt-0.5 text-[10px] text-gray-600">
          {edge.source} → {edge.target}
        </div>
      </div>

      {/* Basic */}
      <Section title="Basic" defaultOpen={true}>
        <div>
          <Label>Label</Label>
          <Input
            type="text"
            value={label}
            onChange={(e) => update({ label: e.target.value })}
            placeholder="Optional label"
          />
        </div>
        <div>
          <Label>Priority</Label>
          <Input
            type="number"
            value={priority}
            onChange={(e) => update({ priority: parseInt(e.target.value) || 1 })}
            min={1}
          />
          <p className="text-[10px] text-gray-600 mt-0.5">Lower = higher priority</p>
        </div>
      </Section>

      {/* Condition */}
      <Section title="Condition" icon={Zap} defaultOpen={true}>
        <div>
          <Label>Trigger</Label>
          <Select
            value={condition?.type || 'always'}
            onChange={(e) => update({
              condition: e.target.value === 'always' ? null : { type: e.target.value, config: {} },
            })}
          >
            {CONDITION_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
        </div>

        {condition && condition.type !== 'always' && (
          <>
            {condition.type === 'quality' && (
              <div className="flex gap-2 mt-2">
                <Select
                  value={condition.config?.operator || '>='}
                  onChange={(e) => update({
                    condition: { ...condition, config: { ...condition.config, operator: e.target.value } },
                  })}
                  className="w-16"
                >
                  {['<', '<=', '=', '>=', '>'].map(op => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </Select>
                <Input
                  type="number"
                  value={condition.config?.threshold || 0.8}
                  onChange={(e) => update({
                    condition: { ...condition, config: { ...condition.config, threshold: parseFloat(e.target.value) } },
                  })}
                  min={0}
                  max={1}
                  step={0.1}
                  className="flex-1"
                />
              </div>
            )}

            {condition.type === 'expression' && (
              <Textarea
                value={condition.config?.expression || ''}
                onChange={(e) => update({
                  condition: { ...condition, config: { expression: e.target.value } },
                })}
                placeholder="result.success && quality >= 0.8"
                rows={2}
                className="mt-2 font-mono"
              />
            )}

            {!['quality', 'expression'].includes(condition.type) && (
              <div className="mt-2">
                <Label>Config (JSON)</Label>
                <JsonEditor
                  value={condition.config || {}}
                  onChange={(config) => update({
                    condition: { ...condition, config },
                  })}
                />
              </div>
            )}
          </>
        )}
      </Section>

      {/* Delete */}
      <div className="px-3 py-2">
        <button
          onClick={() => onDelete(edge.id)}
          className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] rounded-md bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors"
        >
          <Trash2 size={11} /> Delete Edge
        </button>
      </div>
    </>
  );
};

// ── Main PropertiesPanel ──
const PropertiesPanel = ({
  selectedNode,
  selectedEdge,
  onNodeUpdate,
  onEdgeUpdate,
  onNodeDelete,
  onEdgeDelete,
  onNodeDuplicate,
}) => {
  if (!selectedNode && !selectedEdge) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <Settings size={24} className="text-gray-600 mb-2" />
        <p className="text-xs text-gray-500">Select a node or edge</p>
        <p className="text-[10px] text-gray-600">to view properties</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {selectedNode && (
        <NodeProperties
          node={selectedNode}
          onUpdate={onNodeUpdate}
          onDelete={onNodeDelete}
          onDuplicate={onNodeDuplicate}
        />
      )}
      {selectedEdge && !selectedNode && (
        <EdgeProperties
          edge={selectedEdge}
          onUpdate={onEdgeUpdate}
          onDelete={onEdgeDelete}
        />
      )}
    </div>
  );
};

export default PropertiesPanel;
