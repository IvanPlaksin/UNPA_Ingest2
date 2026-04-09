/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Properties Panel
 * Panel for editing selected node/edge properties - Dark Theme
 * With Immutable Graph DeleteConfirmation integration
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { X, Copy, Trash2, Settings, ArrowRight, RotateCcw, History, Shield } from 'lucide-react';
import { AOPEGNodeData, AOPEGEdgeData, ExecutorInfo } from '../../types/aopeg.types';
import { DeleteConfirmation, NodeVersionHistory } from '../ImmutableGraph';

// ────────────────────────────────────────────────────────────────────────────
// JSON EDITOR
// ────────────────────────────────────────────────────────────────────────────

interface JsonEditorProps {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}

const JsonEditor: React.FC<JsonEditorProps> = ({ value, onChange }) => {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(JSON.stringify(value, null, 2));
  }, [value]);

  const handleChange = (newText: string) => {
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
        className={`
          w-full h-32 px-3 py-2 font-mono text-xs rounded-md
          bg-[#0d1117] border text-[#f0f6fc]
          ${error ? 'border-red-500/50' : 'border-[#30363d]'}
          focus:outline-none focus:ring-2 focus:ring-[#388bfd] focus:border-transparent
        `}
        spellCheck={false}
      />
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// FORM COMPONENTS
// ────────────────────────────────────────────────────────────────────────────

const FormLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="block text-xs font-medium text-[#8b949e] uppercase tracking-wide mb-1.5">
    {children}
  </label>
);

const FormInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input
    {...props}
    className={`
      w-full h-9 px-3 text-sm rounded-md
      bg-[#21262d] border border-[#30363d] text-[#f0f6fc]
      placeholder-[#6e7681]
      focus:outline-none focus:ring-2 focus:ring-[#388bfd] focus:border-transparent
      ${props.className || ''}
    `}
  />
);

const FormTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => (
  <textarea
    {...props}
    className={`
      w-full px-3 py-2 text-sm rounded-md
      bg-[#21262d] border border-[#30363d] text-[#f0f6fc]
      placeholder-[#6e7681]
      focus:outline-none focus:ring-2 focus:ring-[#388bfd] focus:border-transparent
      ${props.className || ''}
    `}
  />
);

const FormSelect: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
  <select
    {...props}
    className={`
      w-full h-9 px-3 text-sm rounded-md
      bg-[#21262d] border border-[#30363d] text-[#f0f6fc]
      focus:outline-none focus:ring-2 focus:ring-[#388bfd] focus:border-transparent
      ${props.className || ''}
    `}
  />
);

// ────────────────────────────────────────────────────────────────────────────
// NODE PROPERTIES
// ────────────────────────────────────────────────────────────────────────────

interface NodePropertiesProps {
  node: { id: string; data: AOPEGNodeData };
  executorInfo?: ExecutorInfo;
  onUpdate: (data: Partial<AOPEGNodeData>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  // Immutable Graph integration
  useImmutableDelete?: boolean;
  godModeActive?: boolean;
  entityId?: string;
  onShowHistory?: () => void;
  onDeleteError?: (error: string) => void;
}

const NodeProperties: React.FC<NodePropertiesProps> = ({
  node,
  executorInfo,
  onUpdate,
  onDelete,
  onDuplicate,
  useImmutableDelete = false,
  godModeActive = false,
  entityId,
  onShowHistory,
  onDeleteError,
}) => {
  const { data } = node;
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);

  const handleDeleteClick = () => {
    if (useImmutableDelete && godModeActive) {
      setShowDeleteConfirmation(true);
    } else {
      onDelete();
    }
  };

  return (
    <div className="space-y-5">
      {/* Basic Info */}
      <div>
        <FormLabel>Display Name</FormLabel>
        <FormInput
          type="text"
          value={data.displayName}
          onChange={(e) => onUpdate({ displayName: e.target.value })}
        />
      </div>

      <div>
        <FormLabel>Description</FormLabel>
        <FormTextarea
          value={data.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          rows={2}
        />
      </div>

      {/* Executor Info (read-only) */}
      <div className="p-3 bg-[#0d1117] border border-[#30363d] rounded-lg">
        <div className="text-xs text-[#6e7681] mb-1">Executor Type</div>
        <div className="text-sm font-mono text-[#f0f6fc]">{data.executorType}</div>
        <div className="text-xs text-[#6e7681] mt-2">Domain: {data.domain}</div>
      </div>

      {/* Parameters */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <FormLabel>Parameters</FormLabel>
          {executorInfo && (
            <button
              onClick={() => onUpdate({ parameters: executorInfo.defaultParameters })}
              className="flex items-center gap-1 text-xs text-[#58a6ff] hover:text-[#79c0ff]"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}
        </div>
        <JsonEditor
          value={data.parameters}
          onChange={(params) => onUpdate({ parameters: params })}
        />
      </div>

      {/* Timeout */}
      <div>
        <FormLabel>Timeout (ms)</FormLabel>
        <FormInput
          type="number"
          value={data.timeout}
          onChange={(e) => onUpdate({ timeout: parseInt(e.target.value) || 30000 })}
          min={1000}
          step={1000}
        />
      </div>

      {/* Quality Threshold */}
      <div>
        <FormLabel>Quality Threshold (0-1)</FormLabel>
        <FormInput
          type="number"
          value={data.qualityThreshold || ''}
          onChange={(e) =>
            onUpdate({ qualityThreshold: parseFloat(e.target.value) || undefined })
          }
          min={0}
          max={1}
          step={0.1}
          placeholder="Optional"
        />
      </div>

      {/* Retry Policy */}
      <div>
        <FormLabel>Retry Policy</FormLabel>
        <div className="space-y-3 p-3 bg-[#0d1117] border border-[#30363d] rounded-lg">
          <div className="flex items-center gap-3">
            <label className="text-xs text-[#8b949e] w-24">Max Retries</label>
            <FormInput
              type="number"
              value={data.retryPolicy.maxRetries}
              onChange={(e) =>
                onUpdate({
                  retryPolicy: {
                    ...data.retryPolicy,
                    maxRetries: parseInt(e.target.value) || 0,
                  },
                })
              }
              min={0}
              max={10}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-[#8b949e] w-24">Backoff (ms)</label>
            <FormInput
              type="number"
              value={data.retryPolicy.backoffMs}
              onChange={(e) =>
                onUpdate({
                  retryPolicy: {
                    ...data.retryPolicy,
                    backoffMs: parseInt(e.target.value) || 1000,
                  },
                })
              }
              min={100}
              step={100}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-[#8b949e] w-24">Multiplier</label>
            <FormInput
              type="number"
              value={data.retryPolicy.backoffMultiplier}
              onChange={(e) =>
                onUpdate({
                  retryPolicy: {
                    ...data.retryPolicy,
                    backoffMultiplier: parseFloat(e.target.value) || 2,
                  },
                })
              }
              min={1}
              max={5}
              step={0.5}
              className="flex-1"
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-4 border-t border-[#30363d]">
        {/* History button (only in immutable mode) */}
        {useImmutableDelete && onShowHistory && (
          <button
            onClick={onShowHistory}
            className="flex items-center justify-center gap-2 px-3 py-2 text-sm
                       text-[#8b949e] bg-[#21262d] border border-[#30363d] rounded-md
                       hover:bg-[#30363d] hover:text-[#f0f6fc] transition-colors"
            title="View version history"
          >
            <History className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={onDuplicate}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm
                     text-[#f0f6fc] bg-[#21262d] border border-[#30363d] rounded-md
                     hover:bg-[#30363d] hover:border-[#3d444d] transition-colors"
        >
          <Copy className="w-4 h-4" />
          Duplicate
        </button>
        <button
          onClick={handleDeleteClick}
          disabled={useImmutableDelete && !godModeActive}
          className={`
            flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md transition-colors
            ${useImmutableDelete && !godModeActive
              ? 'text-[#6e7681] bg-[#21262d] border border-[#30363d] cursor-not-allowed opacity-50'
              : 'text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50'}
          `}
          title={useImmutableDelete && !godModeActive ? 'Enable God Mode to delete' : 'Delete node'}
        >
          <Trash2 className="w-4 h-4" />
          {useImmutableDelete && !godModeActive && <Shield className="w-3 h-3" />}
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirmation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <DeleteConfirmation
            entityId={entityId || node.id}
            entityType="NODE"
            entityName={data.displayName}
            onDeleted={() => {
              setShowDeleteConfirmation(false);
              onDelete();
            }}
            onCancel={() => setShowDeleteConfirmation(false)}
            onError={onDeleteError}
          />
        </div>
      )}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// EDGE PROPERTIES
// ────────────────────────────────────────────────────────────────────────────

interface EdgePropertiesProps {
  edge: { id: string; data: AOPEGEdgeData };
  onUpdate: (data: Partial<AOPEGEdgeData>) => void;
  onDelete: () => void;
  // Immutable Graph integration
  useImmutableDelete?: boolean;
  godModeActive?: boolean;
  edgeId?: string;
  onDeleteError?: (error: string) => void;
}

const EdgeProperties: React.FC<EdgePropertiesProps> = ({
  edge,
  onUpdate,
  onDelete,
  useImmutableDelete = false,
  godModeActive = false,
  edgeId,
  onDeleteError,
}) => {
  const { data } = edge;
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);

  const handleDeleteClick = () => {
    if (useImmutableDelete && godModeActive) {
      setShowDeleteConfirmation(true);
    } else {
      onDelete();
    }
  };

  const conditionTypes = [
    'always',
    'success',
    'failure',
    'quality',
    'metric',
    'expression',
    'output_type',
    'output_match',
  ];

  return (
    <div className="space-y-5">
      {/* Label */}
      <div>
        <FormLabel>Label</FormLabel>
        <FormInput
          type="text"
          value={data.label || ''}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="Optional label"
        />
      </div>

      {/* Priority */}
      <div>
        <FormLabel>Priority</FormLabel>
        <FormInput
          type="number"
          value={data.priority}
          onChange={(e) => onUpdate({ priority: parseInt(e.target.value) || 1 })}
          min={1}
        />
        <p className="text-xs text-[#6e7681] mt-1">Lower = higher priority</p>
      </div>

      {/* Condition */}
      <div>
        <FormLabel>Condition Type</FormLabel>
        <FormSelect
          value={data.condition?.type || 'always'}
          onChange={(e) =>
            onUpdate({
              condition:
                e.target.value === 'always' ? null : { type: e.target.value, config: {} },
            })
          }
        >
          {conditionTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </FormSelect>
      </div>

      {/* Condition Config */}
      {data.condition && data.condition.type !== 'always' && (
        <div>
          <FormLabel>Condition Config</FormLabel>
          <JsonEditor
            value={data.condition.config}
            onChange={(config) =>
              onUpdate({
                condition: { ...data.condition!, config },
              })
            }
          />

          {/* Quick config for quality condition */}
          {data.condition.type === 'quality' && (
            <div className="mt-3 flex gap-2">
              <FormSelect
                value={(data.condition.config.operator as string) || '>='}
                onChange={(e) =>
                  onUpdate({
                    condition: {
                      ...data.condition!,
                      config: { ...data.condition!.config, operator: e.target.value },
                    },
                  })
                }
                className="w-20"
              >
                <option value="<">&lt;</option>
                <option value="<=">&lt;=</option>
                <option value="=">=</option>
                <option value=">=">&gt;=</option>
                <option value=">">&gt;</option>
              </FormSelect>
              <FormInput
                type="number"
                value={(data.condition.config.threshold as number) || 0.8}
                onChange={(e) =>
                  onUpdate({
                    condition: {
                      ...data.condition!,
                      config: {
                        ...data.condition!.config,
                        threshold: parseFloat(e.target.value),
                      },
                    },
                  })
                }
                min={0}
                max={1}
                step={0.1}
                className="flex-1"
              />
            </div>
          )}

          {/* Expression textarea */}
          {data.condition.type === 'expression' && (
            <FormTextarea
              value={(data.condition.config.expression as string) || ''}
              onChange={(e) =>
                onUpdate({
                  condition: {
                    ...data.condition!,
                    config: { expression: e.target.value },
                  },
                })
              }
              placeholder="result.success && quality >= 0.8"
              rows={2}
              className="mt-2 font-mono text-xs"
            />
          )}
        </div>
      )}

      {/* Delete */}
      <button
        onClick={handleDeleteClick}
        disabled={useImmutableDelete && !godModeActive}
        className={`
          w-full flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md transition-colors
          ${useImmutableDelete && !godModeActive
            ? 'text-[#6e7681] bg-[#21262d] border border-[#30363d] cursor-not-allowed opacity-50'
            : 'text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50'}
        `}
        title={useImmutableDelete && !godModeActive ? 'Enable God Mode to delete' : 'Delete edge'}
      >
        <Trash2 className="w-4 h-4" />
        Delete Edge
        {useImmutableDelete && !godModeActive && <Shield className="w-3 h-3 ml-1" />}
      </button>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirmation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <DeleteConfirmation
            entityId={edgeId || edge.id}
            entityType="EDGE"
            entityName={data.label || `Edge ${edge.id}`}
            onDeleted={() => {
              setShowDeleteConfirmation(false);
              onDelete();
            }}
            onCancel={() => setShowDeleteConfirmation(false)}
            onError={onDeleteError}
          />
        </div>
      )}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// MAIN PANEL
// ────────────────────────────────────────────────────────────────────────────

interface PropertiesPanelProps {
  selectedNode: { id: string; data: AOPEGNodeData } | null;
  selectedEdge: { id: string; data: AOPEGEdgeData } | null;
  executorInfo?: ExecutorInfo;
  onNodeUpdate: (nodeId: string, data: Partial<AOPEGNodeData>) => void;
  onEdgeUpdate: (edgeId: string, data: Partial<AOPEGEdgeData>) => void;
  onNodeDelete: (nodeId: string) => void;
  onEdgeDelete: (edgeId: string) => void;
  onNodeDuplicate: (nodeId: string) => void;
  onClose: () => void;
  // Immutable Graph integration
  useImmutableGraph?: boolean;
  godModeActive?: boolean;
  onDeleteError?: (error: string) => void;
  onShowNodeHistory?: (nodeId: string) => void;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedNode,
  selectedEdge,
  executorInfo,
  onNodeUpdate,
  onEdgeUpdate,
  onNodeDelete,
  onEdgeDelete,
  onNodeDuplicate,
  onClose,
  useImmutableGraph = false,
  godModeActive = false,
  onDeleteError,
  onShowNodeHistory,
}) => {
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const handleShowHistory = (nodeId: string) => {
    if (onShowNodeHistory) {
      onShowNodeHistory(nodeId);
    } else {
      // Show internal history modal
      setShowHistoryModal(true);
    }
  };

  if (!selectedNode && !selectedEdge) {
    return (
      <div className="w-80 bg-[#1c2128] border-l border-[#30363d] p-4 flex items-center justify-center">
        <div className="text-center text-[#6e7681]">
          <Settings className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Select a node or edge</p>
          <p className="text-xs">to view properties</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 bg-[#1c2128] border-l border-[#30363d] flex flex-col h-full">
      {/* Header */}
      <div className="h-12 px-4 border-b border-[#30363d] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          {selectedNode ? (
            <>
              <Settings className="w-4 h-4 text-[#8b949e]" />
              <span className="font-medium text-sm text-[#f0f6fc]">Properties</span>
            </>
          ) : (
            <>
              <ArrowRight className="w-4 h-4 text-[#8b949e]" />
              <span className="font-medium text-sm text-[#f0f6fc]">Edge</span>
            </>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-[#30363d] rounded transition-colors"
        >
          <X className="w-4 h-4 text-[#8b949e]" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {selectedNode && (
          <NodeProperties
            node={selectedNode}
            executorInfo={executorInfo}
            onUpdate={(data) => onNodeUpdate(selectedNode.id, data)}
            onDelete={() => onNodeDelete(selectedNode.id)}
            onDuplicate={() => onNodeDuplicate(selectedNode.id)}
            useImmutableDelete={useImmutableGraph}
            godModeActive={godModeActive}
            entityId={selectedNode.data.entityId}
            onShowHistory={useImmutableGraph ? () => handleShowHistory(selectedNode.id) : undefined}
            onDeleteError={onDeleteError}
          />
        )}

        {selectedEdge && (
          <EdgeProperties
            edge={selectedEdge}
            onUpdate={(data) => onEdgeUpdate(selectedEdge.id, data)}
            onDelete={() => onEdgeDelete(selectedEdge.id)}
            useImmutableDelete={useImmutableGraph}
            godModeActive={godModeActive}
            edgeId={selectedEdge.data.edgeId}
            onDeleteError={onDeleteError}
          />
        )}
      </div>

      {/* Node Version History Modal */}
      {showHistoryModal && selectedNode?.data.entityId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="relative max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <button
              onClick={() => setShowHistoryModal(false)}
              className="absolute top-4 right-4 z-10 p-2 bg-[#21262d] rounded-full
                         hover:bg-[#30363d] transition-colors"
            >
              <X className="w-4 h-4 text-[#8b949e]" />
            </button>
            <NodeVersionHistory
              entityId={selectedNode.data.entityId}
              onVersionSelect={(version) => {
                console.log('Selected version:', version);
                // Could implement version restoration here
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default PropertiesPanel;
