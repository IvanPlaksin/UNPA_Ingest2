/**
 * LiveExecutionTab — Real-time graph execution monitoring & launch
 *
 * Shows execution controls, input parameters, timeline, wait-input forms,
 * detailed validation errors with AI-powered fix recommendations,
 * and node parameter inspection.
 * Integrated with RuntimeEngine SSE events.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Loader2, CheckCircle, XCircle, Clock, SkipForward,
  ChevronRight, ChevronDown, Cpu, Zap, Send, XOctagon,
  Play, AlertTriangle, Pause, Upload, GitBranch, Sparkles, Info, Shield,
  Wrench, Trash2, ArrowRight, PenLine, Check, RefreshCw, MessageSquare
} from 'lucide-react';
import { API_BASE_URL } from '../../config/api.config';
import ExecutionAssistantPanel from './ExecutionAssistantPanel';

/* ═══════════════════════════════════════════════════════════════════════════
   STATUS BADGE
   ═══════════════════════════════════════════════════════════════════════════ */

const STATUS_CONFIG = {
  idle:      { label: 'Idle',      color: 'text-gray-400',   bg: 'bg-gray-500/10',   border: 'border-gray-500/30' },
  running:   { label: 'Running',   color: 'text-yellow-400', bg: 'bg-yellow-500/10',  border: 'border-yellow-500/30' },
  paused:    { label: 'Waiting',   color: 'text-amber-400',  bg: 'bg-amber-500/10',   border: 'border-amber-500/30' },
  completed: { label: 'Completed', color: 'text-green-400',  bg: 'bg-green-500/10',   border: 'border-green-500/30' },
  failed:    { label: 'Failed',    color: 'text-red-400',    bg: 'bg-red-500/10',     border: 'border-red-500/30' },
  cancelled: { label: 'Cancelled', color: 'text-gray-400',   bg: 'bg-gray-500/10',    border: 'border-gray-500/30' },
};

const ExecutionStatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.idle;
  return (
    <span className={`flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      {status === 'running' && <Loader2 className="w-3 h-3 animate-spin" />}
      {status === 'paused' && <Clock className="w-3 h-3 animate-pulse" />}
      {status === 'completed' && <CheckCircle className="w-3 h-3" />}
      {status === 'failed' && <XCircle className="w-3 h-3" />}
      {cfg.label}
    </span>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   STATUS ICON
   ═══════════════════════════════════════════════════════════════════════════ */

const StatusIcon = ({ status }) => {
  switch (status) {
    case 'running':
      return <Loader2 className="w-3.5 h-3.5 text-yellow-400 animate-spin" />;
    case 'completed':
      return <CheckCircle className="w-3.5 h-3.5 text-green-400" />;
    case 'error':
    case 'failed':
      return <XCircle className="w-3.5 h-3.5 text-red-400" />;
    case 'waiting':
      return <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />;
    case 'skipped':
      return <SkipForward className="w-3.5 h-3.5 text-gray-500" />;
    case 'resumed':
      return <Play className="w-3.5 h-3.5 text-blue-400" />;
    default:
      return <Cpu className="w-3.5 h-3.5 text-gray-500" />;
  }
};

/* ═══════════════════════════════════════════════════════════════════════════
   JSON VIEWER
   ═══════════════════════════════════════════════════════════════════════════ */

const JsonPreview = ({ data, label }) => {
  if (data === undefined || data === null) return null;

  let display;
  try {
    display = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  } catch {
    display = String(data);
  }

  // Truncate if too long
  const maxLen = 2000;
  const truncated = display.length > maxLen;
  if (truncated) display = display.slice(0, maxLen) + '\n... (truncated)';

  return (
    <div className="mt-1">
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      <pre className="mt-0.5 p-2 bg-[#0d1117] rounded text-xs text-gray-300 overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
        {display}
      </pre>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   EXECUTION ROW
   ═══════════════════════════════════════════════════════════════════════════ */

const LiveExecutionRow = ({ event, isExpanded, onToggle, onNodeClick }) => {
  const ts = new Date(event.timestamp);
  const timeStr = ts.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    + '.' + String(ts.getMilliseconds()).padStart(3, '0');

  const statusColors = {
    running: 'border-l-yellow-400',
    completed: 'border-l-green-400',
    error: 'border-l-red-400',
    failed: 'border-l-red-400',
    waiting: 'border-l-amber-400',
    skipped: 'border-l-gray-600',
    resumed: 'border-l-blue-400',
  };

  return (
    <div className={`border-l-2 ${statusColors[event.status] || 'border-l-gray-600'} bg-[#0d1117]/50 rounded-r`}>
      {/* Main row */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-[#161b22] transition-colors"
        onClick={onToggle}
      >
        {/* Expand icon */}
        <span className="text-gray-500 w-3">
          {isExpanded
            ? <ChevronDown className="w-3 h-3" />
            : <ChevronRight className="w-3 h-3" />
          }
        </span>

        {/* Status icon */}
        <StatusIcon status={event.status} />

        {/* Timestamp */}
        <span className="text-xs text-gray-500 font-mono w-24 shrink-0">{timeStr}</span>

        {/* Node name */}
        <span
          className="text-sm text-gray-200 truncate cursor-pointer hover:text-white hover:underline"
          onClick={(e) => { e.stopPropagation(); onNodeClick?.(event.nodeId); }}
          title={event.nodeId}
        >
          {event.nodeLabel || event.nodeId}
        </span>

        {/* Duration */}
        {event.duration != null && (
          <span className="ml-auto text-xs text-gray-500 shrink-0">{event.duration}ms</span>
        )}

        {/* Error indicator */}
        {event.error && (
          <AlertTriangle className="w-3 h-3 text-red-400 shrink-0 ml-1" />
        )}
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-4 pb-2 space-y-1 border-t border-[#21262d]">
          {event.error && (
            <div className="mt-1 p-1.5 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-300">
              {event.error}
            </div>
          )}
          <JsonPreview data={event.input} label="Input" />
          <JsonPreview data={event.result} label="Output" />
          {event.inputProvided && <JsonPreview data={event.inputProvided} label="User Input Provided" />}
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   WAIT INPUT FIELD
   ═══════════════════════════════════════════════════════════════════════════ */

const WaitInputField = ({ input, value, onChange }) => {
  const { name, type, values: enumValues, required } = input;
  const labelEl = (
    <label className="text-sm text-gray-400 mb-1 block">
      {name} {required !== false && <span className="text-red-400">*</span>}
    </label>
  );

  if (type === 'enum' && enumValues) {
    return (
      <div>
        {labelEl}
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2 py-1.5 bg-[#0d1117] border border-[#30363d] rounded text-sm text-white focus:border-amber-500 focus:outline-none"
        >
          <option value="">Select...</option>
          {enumValues.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
    );
  }

  if (type === 'boolean') {
    return (
      <label className="flex items-center gap-2 cursor-pointer py-1">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 rounded border-[#30363d] bg-[#0d1117] text-amber-500 focus:ring-amber-500"
        />
        <span className="text-sm text-gray-300">{name}</span>
        {required !== false && <span className="text-red-400 text-xs">*</span>}
      </label>
    );
  }

  if (type === 'number') {
    return (
      <div>
        {labelEl}
        <input
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}
          className="w-full px-2 py-1.5 bg-[#0d1117] border border-[#30363d] rounded text-sm text-white focus:border-amber-500 focus:outline-none"
        />
      </div>
    );
  }

  // Default: string → textarea
  return (
    <div>
      {labelEl}
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full px-2 py-1.5 bg-[#0d1117] border border-[#30363d] rounded text-sm text-white resize-none focus:border-amber-500 focus:outline-none"
      />
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   WAIT INPUT FORM
   ═══════════════════════════════════════════════════════════════════════════ */

const formatTimeLeft = (ms) => {
  if (ms <= 0) return 'Expired';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const WaitInputForm = ({ nodeId, nodeLabel, expectedInputs, resumeToken, prompt, timeoutAt, onSubmit }) => {
  const [values, setValues] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);

  // Countdown timer
  useEffect(() => {
    if (!timeoutAt) return;
    const update = () => {
      const remaining = new Date(timeoutAt) - Date.now();
      setTimeLeft(Math.max(0, remaining));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [timeoutAt]);

  const handleSubmit = async () => {
    // Validate required fields
    const missing = (expectedInputs || [])
      .filter(inp => inp.required !== false && (values[inp.name] === undefined || values[inp.name] === '' || values[inp.name] === null))
      .map(inp => inp.name);

    if (missing.length > 0) {
      setValidationError(`Required: ${missing.join(', ')}`);
      return;
    }

    setValidationError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setValidationError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-3 my-2 p-3 rounded-lg border-2 border-amber-500/50 bg-amber-500/5 animate-in fade-in">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
        <span className="text-base font-medium text-amber-300">
          Input Required: {nodeLabel}
        </span>
        {timeLeft != null && (
          <span className="ml-auto text-sm text-amber-400/70">
            {formatTimeLeft(timeLeft)}
          </span>
        )}
      </div>

      {/* Prompt */}
      {prompt && (
        <p className="text-sm text-gray-400 mb-3 leading-relaxed">{prompt}</p>
      )}

      {/* Form fields */}
      <div className="space-y-2.5 mb-3">
        {(expectedInputs || []).map(input => (
          <WaitInputField
            key={input.name}
            input={input}
            value={values[input.name]}
            onChange={(val) => setValues(prev => ({ ...prev, [input.name]: val }))}
          />
        ))}
      </div>

      {/* Validation error */}
      {validationError && (
        <p className="text-xs text-red-400 mb-2">{validationError}</p>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="w-full py-2 bg-amber-600 text-white rounded text-base font-medium hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
      >
        {isSubmitting
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <Send className="w-4 h-4" />
        }
        Submit Input
      </button>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   TYPE BADGE — shows param data type
   ═══════════════════════════════════════════════════════════════════════════ */

const TYPE_STYLES = {
  textarea: { label: 'text',   color: 'text-blue-400',   bg: 'bg-blue-500/10' },
  select:   { label: 'select', color: 'text-purple-400', bg: 'bg-purple-500/10' },
  number:   { label: 'number', color: 'text-cyan-400',   bg: 'bg-cyan-500/10' },
  boolean:  { label: 'bool',   color: 'text-green-400',  bg: 'bg-green-500/10' },
};

const ParamTypeBadge = ({ type }) => {
  const cfg = TYPE_STYLES[type] || TYPE_STYLES.textarea;
  return (
    <span className={`px-1.5 py-0.5 rounded text-[11px] font-mono ${cfg.color} ${cfg.bg}`}>
      {cfg.label}
    </span>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   INPUT PARAMETERS PANEL (collapsible)
   ═══════════════════════════════════════════════════════════════════════════ */

const InputParamsPanel = ({ requiredParams, paramValues, onParamChange, isExecuting }) => {
  const [collapsed, setCollapsed] = useState(false);
  const paramKeys = Object.keys(requiredParams || {});
  if (paramKeys.length === 0) return null;

  return (
    <div className="border-b border-[#30363d] shrink-0 w-full">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:bg-[#161b22] transition-colors"
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        <Upload className="w-3.5 h-3.5" />
        <span className="font-medium">Input Parameters</span>
        <span className="text-xs text-gray-500">({paramKeys.length})</span>
      </button>
      {!collapsed && (
        <div className="px-4 pb-3 w-full">
          <div className="flex flex-wrap gap-3 w-full">
            {paramKeys.map(k => {
              const s = requiredParams[k];
              const hasValue = paramValues[k] !== undefined && paramValues[k] !== '';
              return (
                <div key={k} className="flex-1 min-w-[200px] max-w-full rounded border border-[#30363d] bg-[#161b22]/50 p-2.5">
                  {/* Label + type badge */}
                  <div className="flex items-center gap-2 mb-1">
                    <label className="text-sm text-gray-300 font-medium">{s.label || k}</label>
                    <ParamTypeBadge type={s.type} />
                    {s.default !== undefined && !hasValue && (
                      <span className="text-[11px] text-gray-600 ml-auto">default: {String(s.default)}</span>
                    )}
                  </div>
                  {/* Description */}
                  {s.placeholder && (
                    <p className="text-xs text-gray-500 mb-1.5 leading-relaxed">{s.placeholder}</p>
                  )}
                  {/* Input control */}
                  {s.type === 'select' ? (
                    <select
                      value={paramValues[k] ?? s.default ?? ''}
                      onChange={ev => onParamChange(k, ev.target.value)}
                      disabled={isExecuting}
                      className="w-full px-2 py-1.5 bg-[#0d1117] border border-[#30363d] rounded text-sm text-white focus:border-green-500 focus:outline-none disabled:opacity-50"
                    >
                      <option value="">Select...</option>
                      {(s.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <textarea
                      value={paramValues[k] ?? s.default ?? ''}
                      onChange={ev => onParamChange(k, ev.target.value)}
                      placeholder={s.placeholder}
                      disabled={isExecuting}
                      rows={s.type === 'textarea' ? 3 : 1}
                      className="w-full px-2 py-1.5 bg-[#0d1117] border border-[#30363d] rounded text-sm text-white focus:border-green-500 focus:outline-none resize-none disabled:opacity-50"
                    />
                  )}
                  {/* Options hint for select */}
                  {s.type === 'select' && s.options?.length > 0 && (
                    <p className="text-[11px] text-gray-600 mt-1">
                      Options: {s.options.join(' | ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   VALIDATION LEVEL LABELS
   ═══════════════════════════════════════════════════════════════════════════ */

const VALIDATION_LEVELS = {
  1: 'Structural',
  2: 'DAG (acyclicity)',
  3: 'Flow (connectivity)',
  4: 'Tool validity',
  5: 'Type check',
  6: 'Execution readiness',
};

const SEVERITY_STYLES = {
  critical: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', icon: XCircle },
  warning:  { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: AlertTriangle },
  info:     { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: Info },
};

/* ═══════════════════════════════════════════════════════════════════════════
   VALIDATION ERRORS PANEL — detailed errors + AI recommendations
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─── Mutation type icons and colors ─── */
const MUTATION_STYLES = {
  remove_edge:  { Icon: Trash2,    color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30',    label: 'Remove Edge' },
  add_edge:     { Icon: ArrowRight, color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/30',  label: 'Add Edge' },
  update_node:  { Icon: PenLine,   color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   label: 'Update Node' },
  remove_node:  { Icon: Trash2,    color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30',    label: 'Remove Node' },
};

const MutationCard = ({ mutation, index, applied, onApply }) => {
  const style = MUTATION_STYLES[mutation.type] || MUTATION_STYLES.update_node;
  const MIcon = style.Icon;

  return (
    <div className={`flex items-start gap-2 p-2 rounded border ${style.border} ${style.bg} ${applied ? 'opacity-50' : ''}`}>
      <MIcon className={`w-3.5 h-3.5 ${style.color} shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[10px] font-mono px-1 py-0.5 rounded ${style.bg} ${style.color} shrink-0`}>
            {style.label}
          </span>
          {mutation.nodeId && (
            <span className="text-[10px] text-gray-500 font-mono truncate">{mutation.nodeId}</span>
          )}
          {mutation.source && mutation.target && (
            <span className="text-[10px] text-gray-500 font-mono truncate">{mutation.source} → {mutation.target}</span>
          )}
        </div>
        {mutation.description && (
          <p className="text-[11px] text-gray-300 leading-snug mt-0.5 line-clamp-2">{mutation.description}</p>
        )}
        {mutation.changes && (
          <pre className="mt-1 text-[10px] text-cyan-400/80 font-mono bg-[#0d1117] rounded px-1.5 py-1 overflow-x-auto max-h-16 whitespace-pre-wrap break-all">
            {JSON.stringify(mutation.changes, null, 2)}
          </pre>
        )}
      </div>
      <button
        onClick={() => onApply(index)}
        disabled={applied}
        className={`shrink-0 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
          applied
            ? 'bg-green-500/10 text-green-400 border border-green-500/30 cursor-default'
            : 'bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20'
        }`}
      >
        {applied ? <Check className="w-3 h-3" /> : <Wrench className="w-3 h-3" />}
      </button>
    </div>
  );
};

/* ─── Collapsible section helper ─── */
const CollapsibleSection = ({ title, count, icon: SectionIcon, iconColor, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 py-1 text-[11px] text-gray-400 hover:text-gray-200 transition-colors"
      >
        {open ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
        {SectionIcon && <SectionIcon className={`w-3 h-3 shrink-0 ${iconColor || ''}`} />}
        <span className="font-medium">{title}</span>
        {count != null && <span className="text-gray-600">({count})</span>}
      </button>
      {open && children}
    </div>
  );
};

const ValidationErrorsPanel = ({ executionError, graphNodes, graphEdges, onApplyMutations, onExecute, isExecuting, canExecute }) => {
  const [aiAdvice, setAiAdvice] = useState(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [adviceError, setAdviceError] = useState(null);
  const [appliedMutations, setAppliedMutations] = useState(new Set());
  const [collapsed, setCollapsed] = useState(false);

  // Normalize: executionError can be string or object
  const isRich = executionError && typeof executionError === 'object';
  const message = isRich ? executionError.message : executionError;
  const errors = isRich ? (executionError.errors || []) : [];
  const warnings = isRich ? (executionError.warnings || []) : [];
  const completedLevel = isRich ? executionError.completedLevel : null;

  const fetchAIAdvice = useCallback(async () => {
    if (errors.length === 0) return;
    setLoadingAdvice(true);
    setAdviceError(null);
    setAppliedMutations(new Set());

    try {
      const res = await fetch(`${API_BASE_URL}/runtime/validation-advice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errors,
          warnings,
          completedLevel,
          graph: {
            nodes: (graphNodes || []).map(n => ({
              id: n.id,
              data: { label: n.data?.label, toolId: n.data?.toolId, kind: n.data?.kind }
            })),
            edges: (graphEdges || []).map(e => ({
              source: e.source,
              target: e.target,
              sourceHandle: e.sourceHandle,
              targetHandle: e.targetHandle
            }))
          }
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setAiAdvice(data.advice);
        } else {
          setAdviceError(data.error || 'Failed to get advice');
        }
      } else {
        setAdviceError(`HTTP ${res.status}`);
      }
    } catch (err) {
      setAdviceError(err.message);
    } finally {
      setLoadingAdvice(false);
    }
  }, [errors, warnings, completedLevel, graphNodes, graphEdges]);

  const handleApplyOne = useCallback((idx) => {
    if (!aiAdvice?.mutations?.[idx] || appliedMutations.has(idx)) return;
    onApplyMutations?.([aiAdvice.mutations[idx]]);
    setAppliedMutations(prev => new Set(prev).add(idx));
  }, [aiAdvice, appliedMutations, onApplyMutations]);

  const handleApplyAll = useCallback(() => {
    if (!aiAdvice?.mutations?.length) return;
    const unapplied = aiAdvice.mutations.filter((_, i) => !appliedMutations.has(i));
    if (unapplied.length === 0) return;
    onApplyMutations?.(unapplied);
    setAppliedMutations(new Set(aiAdvice.mutations.map((_, i) => i)));
  }, [aiAdvice, appliedMutations, onApplyMutations]);

  if (!executionError) return null;

  const getRecommendation = (idx) => {
    if (!aiAdvice?.recommendations) return null;
    return aiAdvice.recommendations.find(r => r.errorIndex === idx);
  };

  const mutations = aiAdvice?.mutations || [];
  const unappliedCount = mutations.filter((_, i) => !appliedMutations.has(i)).length;

  // For long error messages (e.g. tool validation), extract first line as title
  const msgLines = (message || '').split('\n');
  const msgTitle = msgLines[0];
  const msgHasDetails = msgLines.length > 1;

  return (
    <div className="mx-2 mt-2 flex flex-col rounded border border-red-500/30 bg-[#0d1117] overflow-hidden">
      {/* ═══ Sticky Header — always visible ═══ */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-red-500/10 cursor-pointer hover:bg-red-500/15 transition-colors shrink-0"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed
          ? <ChevronRight className="w-3.5 h-3.5 text-red-400 shrink-0" />
          : <ChevronDown className="w-3.5 h-3.5 text-red-400 shrink-0" />
        }
        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-red-400 truncate">{msgTitle}</p>
        </div>
        {/* Counters */}
        {errors.length > 0 && (
          <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-red-500/20 text-red-400 shrink-0">
            {errors.length} err
          </span>
        )}
        {warnings.length > 0 && (
          <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-amber-500/20 text-amber-400 shrink-0">
            {warnings.length} warn
          </span>
        )}
        {completedLevel != null && (
          <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-red-500/15 text-red-400 shrink-0">
            L{completedLevel}/6
          </span>
        )}
      </div>

      {/* ═══ Collapsible Body ═══ */}
      {!collapsed && (
        <div className="flex flex-col overflow-hidden">

          {/* ── Actions bar — Re-execute + AI advice button (pinned top of body) ── */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#21262d] bg-[#0d1117] shrink-0 flex-wrap">
            {/* Re-execute */}
            {appliedMutations.size > 0 && !isExecuting && (
              <button
                onClick={onExecute}
                disabled={!canExecute}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-40 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Re-execute ({appliedMutations.size} applied)
              </button>
            )}
            {/* AI advice button */}
            {errors.length > 0 && !aiAdvice && !loadingAdvice && (
              <button
                onClick={fetchAIAdvice}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-purple-400 bg-purple-500/10 border border-purple-500/30 rounded hover:bg-purple-500/20 transition-colors"
              >
                <Sparkles className="w-3 h-3" />
                AI Fix
              </button>
            )}
            {loadingAdvice && (
              <span className="flex items-center gap-1 text-[11px] text-purple-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                Analyzing...
              </span>
            )}
            {adviceError && (
              <span className="text-[10px] text-red-400 truncate">AI: {adviceError}</span>
            )}
            {/* Apply all mutations */}
            {mutations.length > 0 && unappliedCount > 0 && (
              <button
                onClick={handleApplyAll}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors ml-auto"
              >
                <Wrench className="w-3 h-3" />
                Apply All ({unappliedCount})
              </button>
            )}
            {mutations.length > 0 && unappliedCount === 0 && (
              <span className="flex items-center gap-1 text-[11px] text-green-400 ml-auto">
                <Check className="w-3 h-3" /> All applied
              </span>
            )}
          </div>

          {/* ── Scrollable content ── */}
          <div className="overflow-y-auto max-h-[50vh] px-3 py-2 space-y-2">

            {/* Full error message (if multiline, e.g. tool validation details) */}
            {msgHasDetails && (
              <pre className="text-[11px] text-red-300/80 font-mono bg-red-500/5 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap break-words">
                {msgLines.slice(1).join('\n').trim()}
              </pre>
            )}

            {/* AI Summary */}
            {aiAdvice?.summary && (
              <div className="p-2 bg-purple-500/5 border border-purple-500/20 rounded">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Sparkles className="w-3 h-3 text-purple-400" />
                  <span className="text-[11px] font-medium text-purple-400">AI Summary</span>
                  {aiAdvice.fallback && (
                    <span className="text-[10px] text-gray-500">(basic)</span>
                  )}
                </div>
                <p className="text-[11px] text-gray-300 leading-relaxed">{aiAdvice.summary}</p>
              </div>
            )}

            {/* Detailed errors */}
            {errors.length > 0 && (
              <CollapsibleSection
                title="Errors"
                count={errors.length}
                icon={XCircle}
                iconColor="text-red-400"
                defaultOpen={errors.length <= 10}
              >
                <div className="space-y-1 mt-1">
                  {errors.map((err, idx) => {
                    const rec = getRecommendation(idx);
                    const sevCfg = rec ? SEVERITY_STYLES[rec.severity] || SEVERITY_STYLES.critical : SEVERITY_STYLES.critical;
                    const SevIcon = sevCfg.icon;

                    return (
                      <div key={idx} className={`p-1.5 rounded border ${sevCfg.border} ${sevCfg.bg}`}>
                        <div className="flex items-start gap-1.5">
                          <SevIcon className={`w-3 h-3 ${sevCfg.color} shrink-0 mt-0.5`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-gray-200 leading-snug">
                              {err.message || String(err)}
                            </p>
                            {err.level && (
                              <span className="text-[10px] text-gray-500 block">
                                L{err.level}: {VALIDATION_LEVELS[err.level] || ''}
                                {err.nodeId && ` · ${err.nodeId}`}
                              </span>
                            )}
                          </div>
                        </div>
                        {rec && (
                          <div className="mt-1.5 ml-4.5 p-1.5 bg-[#0d1117] rounded border border-[#30363d]">
                            <div className="flex items-center gap-1 mb-0.5">
                              <Sparkles className="w-2.5 h-2.5 text-purple-400" />
                              <span className="text-[10px] font-medium text-purple-400">Fix</span>
                            </div>
                            <p className="text-[10px] text-gray-400 leading-snug">{rec.explanation}</p>
                            <p className="text-[10px] text-green-400/90 mt-0.5 leading-snug">
                              <Shield className="w-2.5 h-2.5 inline mr-0.5" />
                              {rec.fix}
                            </p>
                            {rec.affectedNodes?.length > 0 && (
                              <p className="text-[9px] text-gray-600 mt-0.5">
                                Nodes: {rec.affectedNodes.join(', ')}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CollapsibleSection>
            )}

            {/* Warnings */}
            {warnings.length > 0 && (
              <CollapsibleSection
                title="Warnings"
                count={warnings.length}
                icon={AlertTriangle}
                iconColor="text-amber-400"
                defaultOpen={warnings.length <= 5}
              >
                <div className="space-y-0.5 mt-1">
                  {warnings.map((w, idx) => (
                    <div key={`w-${idx}`} className="flex items-start gap-1.5 p-1 rounded bg-amber-500/5 border border-amber-500/20">
                      <AlertTriangle className="w-2.5 h-2.5 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-amber-300/80 leading-snug">{w.message || String(w)}</p>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {/* AI Proposed Mutations */}
            {mutations.length > 0 && (
              <CollapsibleSection
                title="Proposed Changes"
                count={mutations.length}
                icon={Wrench}
                iconColor="text-blue-400"
              >
                <div className="space-y-1 mt-1">
                  {mutations.map((mut, idx) => (
                    <MutationCard
                      key={idx}
                      mutation={mut}
                      index={idx}
                      applied={appliedMutations.has(idx)}
                      onApply={handleApplyOne}
                    />
                  ))}
                </div>
              </CollapsibleSection>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   LIVE EXECUTION TAB (MAIN COMPONENT)
   ═══════════════════════════════════════════════════════════════════════════ */

const LiveExecutionTab = ({
  // Execution monitoring
  executionEvents = [],
  isExecuting = false,
  executionStatus = 'idle',
  executionProgress = { completed: 0, total: 0 },
  waitingInputs = [],
  onResumeInput,
  onCancelExecution,
  onNodeClick,
  onClearLog,
  executionError,
  // Execution launch
  canExecute = false,
  onExecute,
  requiredParams,
  paramValues,
  onParamChange,
  nodesCount = 0,
  edgesCount = 0,
  // Graph context for AI advice
  graphNodes,
  graphEdges,
  // Mutation callbacks
  onApplyMutations,
  // AI Execution Assistant props
  assistantRef,
  isAssistantOpen = false,
  onToggleAssistant,
  assistantWidth = 380,
  onAssistantWidthChange,
  namespace,
  onAssistantStreamingComplete,
}) => {
  const [expandedIds, setExpandedIds] = useState(new Set());
  const logEndRef = useRef(null);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [executionEvents.length]);

  const toggleExpand = useCallback((id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isEmpty = executionEvents.length === 0 && waitingInputs.length === 0;
  const hasGraph = nodesCount > 0;

  return (
    <div className="h-full flex flex-row bg-[#0d1117]">
      {/* ─── Left: Main execution content ─── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* ─── Control Bar (sticky top) ─── */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-[#30363d] bg-[#161b22] shrink-0">
          {/* Graph info */}
          <span className="flex items-center gap-1 text-sm text-gray-500">
            <GitBranch className="w-3.5 h-3.5" />
            {nodesCount}n / {edgesCount}e
          </span>

          {/* Separator */}
          <div className="w-px h-4 bg-[#30363d]" />

          {/* Progress */}
          <span className="flex items-center gap-1 text-sm text-gray-400">
            <Cpu className="w-3.5 h-3.5" />
            {executionProgress.completed}/{executionProgress.total}
          </span>

          {/* Status badge */}
          <ExecutionStatusBadge status={executionStatus} />

          <div className="flex-1" />

          {/* AI Assistant toggle */}
          <button
            onClick={onToggleAssistant}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors ${
              isAssistantOpen
                ? 'text-cyan-400 bg-cyan-500/10 border border-cyan-500/30'
                : 'text-gray-400 hover:text-white hover:bg-[#21262d] border border-transparent'
            }`}
            title="Toggle AI Execution Assistant"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            AI
          </button>

          {/* Clear button */}
          {executionEvents.length > 0 && !isExecuting && (
            <button
              onClick={onClearLog}
              className="px-2.5 py-1 text-sm text-gray-400 hover:text-white hover:bg-[#21262d] rounded transition-colors"
            >
              Clear
            </button>
          )}

          {/* Execute / Cancel button */}
          {isExecuting ? (
            <button
              onClick={onCancelExecution}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/30 rounded hover:bg-red-500/20 transition-colors"
            >
              <Pause className="w-4 h-4" />
              Cancel
            </button>
          ) : (
            <button
              onClick={onExecute}
              disabled={!canExecute || !hasGraph}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Play className="w-4 h-4" />
              Execute
            </button>
          )}
        </div>

        {/* ─── Scrollable content area ─── */}
        <div className="flex-1 overflow-y-auto">
          {/* ─── Input Parameters (full width, collapsible) ─── */}
          <InputParamsPanel
            requiredParams={requiredParams}
            paramValues={paramValues}
            onParamChange={onParamChange}
            isExecuting={isExecuting}
          />

          {/* ─── Validation / Execution Errors ─── */}
          <ValidationErrorsPanel
            executionError={executionError}
            graphNodes={graphNodes}
            graphEdges={graphEdges}
            onApplyMutations={onApplyMutations}
            onExecute={onExecute}
            isExecuting={isExecuting}
            canExecute={canExecute}
          />

          {/* Empty state */}
          {isEmpty && !executionError && (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <Zap className="w-8 h-8 mb-2 opacity-30" />
              {hasGraph ? (
                <>
                  <p className="text-sm">Ready to execute</p>
                  <p className="text-xs mt-1 opacity-60">Click Execute to run the graph</p>
                </>
              ) : (
                <>
                  <p className="text-sm">No graph loaded</p>
                  <p className="text-xs mt-1 opacity-60">Load or build a graph first</p>
                </>
              )}
            </div>
          )}

          {/* Wait Input Forms */}
          {waitingInputs.map(wait => (
            <WaitInputForm
              key={wait.nodeId}
              nodeId={wait.nodeId}
              nodeLabel={wait.nodeLabel}
              expectedInputs={wait.expected_inputs}
              resumeToken={wait.resume_token}
              prompt={wait.prompt}
              timeoutAt={wait.timeout_at}
              onSubmit={(payload) => onResumeInput?.(wait.nodeId, {
                resume_token: wait.resume_token,
                payload
              })}
            />
          ))}

          {/* Event Timeline */}
          {executionEvents.length > 0 && (
            <div className="p-2 space-y-0.5">
              {executionEvents.map((event, idx) => (
                <LiveExecutionRow
                  key={event.id || idx}
                  event={event}
                  isExpanded={expandedIds.has(event.id || idx)}
                  onToggle={() => toggleExpand(event.id || idx)}
                  onNodeClick={onNodeClick}
                />
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* ─── Right: AI Execution Assistant Panel ─── */}
      {isAssistantOpen && (
        <ExecutionAssistantPanel
          ref={assistantRef}
          graphNodes={graphNodes}
          graphEdges={graphEdges}
          namespace={namespace}
          executionError={executionError}
          onApplyMutations={onApplyMutations}
          isCollapsed={!isAssistantOpen}
          onToggleCollapse={onToggleAssistant}
          width={assistantWidth}
          onWidthChange={onAssistantWidthChange}
          onStreamingComplete={onAssistantStreamingComplete}
        />
      )}
    </div>
  );
};

export default LiveExecutionTab;
