/**
 * ExecutionAssistantPanel — Right-side AI chat panel for LiveExecutionTab.
 *
 * Features:
 * - SSE streaming chat with Claude + MCP tools
 * - Horizontal resize from left edge
 * - Collapse/expand
 * - Auto-message support via imperative ref
 * - Mutation extraction from AI responses
 * - Tool call visualization
 * - Pre-validation of mutations before applying
 */

import React, {
  useState, useRef, useCallback, useEffect, useMemo,
  forwardRef, useImperativeHandle,
} from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Send, StopCircle, Sparkles, User, Trash2,
  CheckCircle, XCircle, Wrench, Loader2, MessageSquare,
  GripVertical, PanelRightClose, PanelRightOpen,
  ArrowRight, PenLine, Check, GitFork, Link2, Save,
  AlertTriangle, ChevronDown, ChevronRight, ShieldCheck, ShieldAlert,
} from 'lucide-react';
import { streamExecutionAssistantChat } from '../../services/gxe.service';
import { useStreamThrottle } from '../../hooks/useStreamThrottle';

/* ═══════════════════════════════════════════════════════════════════════════
   QUICK ACTIONS
   ═══════════════════════════════════════════════════════════════════════════ */

const QUICK_ACTIONS = [
  { label: 'Validate graph', prompt: 'Pre-execution validation: Analyze this graph. Check all nodes have valid toolIds (not generic kinds). Flag issues that would prevent execution.' },
  { label: 'Check tool assignments', prompt: 'Check every node in this graph and verify that its toolId maps to a real registered tool. List any nodes with generic types (input, action, ai_node, condition, output) that need real tool assignments. Propose mutations.' },
  { label: 'Analyze structure', prompt: 'Analyze the graph structure: check for cycles, orphan nodes, disconnected components, and missing connections. Propose fixes.' },
  { label: 'Analyze for sub-graphs', prompt: 'Analyze each node in this graph. Identify nodes that represent multi-step business logic (3+ transactional steps: read→transform→write). For those nodes, use catalog_search_graphs and catalog_analyze_reuse tools to find existing reusable graphs. Propose create_subgraph or link_subgraph mutations.' },
  { label: 'Save to catalog', prompt: 'Propose saving this graph to the catalog. Analyze the graph contents and suggest an appropriate name, type (atomic/tool/business/composite/template), namespace, and tags. Produce a save_graph mutation.' },
];

/* ═══════════════════════════════════════════════════════════════════════════
   TOOL CALL CHIP
   ═══════════════════════════════════════════════════════════════════════════ */

const ToolCallChip = ({ tool, success, pending }) => (
  <span
    className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded border ${
      pending
        ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
        : success
          ? 'text-green-400 bg-green-500/10 border-green-500/30'
          : 'text-red-400 bg-red-500/10 border-red-500/30'
    }`}
  >
    {pending ? (
      <Loader2 className="w-2.5 h-2.5 animate-spin" />
    ) : success ? (
      <CheckCircle className="w-2.5 h-2.5" />
    ) : (
      <XCircle className="w-2.5 h-2.5" />
    )}
    <Wrench className="w-2.5 h-2.5 opacity-60" />
    {tool}
  </span>
);

/* ═══════════════════════════════════════════════════════════════════════════
   MESSAGE BUBBLE
   ═══════════════════════════════════════════════════════════════════════════ */

const MessageBubble = ({ message }) => {
  const isUser = message.role === 'user';
  const isAuto = message.isAuto;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`flex ${isUser ? 'flex-row-reverse' : 'flex-row'} gap-2 max-w-[95%]`}>
        {/* Avatar */}
        <div
          className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
            isUser ? (isAuto ? 'bg-amber-600' : 'bg-cyan-600') : 'bg-purple-600'
          }`}
        >
          {isUser ? <User className="w-3 h-3 text-white" /> : <Sparkles className="w-3 h-3 text-white" />}
        </div>

        {/* Content */}
        <div className={`flex flex-col min-w-0 ${isUser ? 'items-end' : 'items-start'}`}>
          {/* Auto badge */}
          {isAuto && (
            <span className="text-[9px] text-amber-400/70 mb-0.5">auto</span>
          )}

          {/* Tool calls */}
          {message.toolCalls?.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1">
              {message.toolCalls.map((tc, idx) => (
                <ToolCallChip key={idx} tool={tc.tool} success={tc.success} pending={tc.pending} />
              ))}
            </div>
          )}

          {/* Bubble */}
          <div
            className={`px-2.5 py-1.5 rounded-lg text-xs min-w-0 overflow-hidden ${
              isUser
                ? (isAuto ? 'bg-amber-700/60 text-amber-100 rounded-tr-none' : 'bg-cyan-600 text-white rounded-tr-none')
                : 'bg-[#21262d] text-[#f0f6fc] border border-[#30363d] rounded-tl-none'
            }`}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap leading-relaxed break-words">{message.content}</p>
            ) : (
              <div className="prose prose-invert prose-xs max-w-none min-w-0 overflow-hidden break-words
                [&_p]:m-0 [&_p]:mb-1 [&_p:last-child]:mb-0
                [&_pre]:bg-black/30 [&_pre]:p-2 [&_pre]:rounded [&_pre]:text-[10px] [&_pre]:overflow-x-auto [&_pre]:max-w-full
                [&_code]:font-mono [&_code]:text-[10px] [&_code]:bg-black/20 [&_code]:px-1 [&_code]:rounded [&_code]:break-all
                [&_ul]:pl-3 [&_ul]:my-0.5 [&_ol]:pl-3 [&_ol]:my-0.5 [&_li]:mb-0.5
                [&_h1]:text-sm [&_h1]:font-bold [&_h1]:mt-1.5 [&_h1]:mb-0.5
                [&_h2]:text-xs [&_h2]:font-bold [&_h2]:mt-1.5 [&_h2]:mb-0.5
                [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:mt-1 [&_h3]:mb-0.5
                [&_table]:text-[10px] [&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full
                [&_th]:px-1.5 [&_th]:py-0.5 [&_td]:px-1.5 [&_td]:py-0.5">
                <ReactMarkdown>{message.content || ''}</ReactMarkdown>
                {message.streaming && (
                  <span className="inline-block w-1 h-3.5 bg-cyan-500 ml-0.5 animate-pulse" />
                )}
              </div>
            )}
          </div>

          {/* Error */}
          {message.error && (
            <span className="flex items-center gap-1 mt-1 px-2 py-0.5 text-[9px] text-red-400 bg-red-500/10 border border-red-500/30 rounded">
              <XCircle className="w-2.5 h-2.5" />
              {message.error}
            </span>
          )}

          {/* Usage */}
          {message.usage && (
            <span className="mt-0.5 text-[9px] text-gray-600">
              {message.usage.input_tokens + message.usage.output_tokens} tok · {message.usage.turns}t
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   MUTATION STYLES
   ═══════════════════════════════════════════════════════════════════════════ */

const MUTATION_STYLES = {
  remove_edge:      { Icon: Trash2,    color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30',    label: 'Remove Edge' },
  add_edge:         { Icon: ArrowRight, color: 'text-green-400', bg: 'bg-green-500/10',  border: 'border-green-500/30',  label: 'Add Edge' },
  update_node:      { Icon: PenLine,    color: 'text-blue-400',  bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   label: 'Update Node' },
  remove_node:      { Icon: Trash2,    color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30',    label: 'Remove Node' },
  create_subgraph:  { Icon: GitFork,   color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30', label: 'Create Sub-graph' },
  link_subgraph:    { Icon: Link2,     color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/30',   label: 'Link Sub-graph' },
  save_graph:       { Icon: Save,      color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/30',  label: 'Save Graph' },
};

/* ═══════════════════════════════════════════════════════════════════════════
   MUTATION VALIDATION
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Validate a single mutation against the current graph state.
 * Returns { status: 'valid'|'warning'|'error', errors: string[], warnings: string[] }
 */
function validateMutation(mut, nodes, edges) {
  const nodeIds = new Set(nodes.map(n => n.id));
  const errors = [];
  const warnings = [];

  switch (mut.type) {
    case 'update_node':
      if (!mut.nodeId) errors.push('Missing nodeId');
      else if (!nodeIds.has(mut.nodeId)) errors.push(`Node "${mut.nodeId}" not found in graph`);
      if (!mut.changes || typeof mut.changes !== 'object') errors.push('Missing or invalid changes object');
      else if (Object.keys(mut.changes).length === 0) warnings.push('Empty changes — nothing will be modified');
      break;

    case 'remove_node':
      if (!mut.nodeId) errors.push('Missing nodeId');
      else if (!nodeIds.has(mut.nodeId)) errors.push(`Node "${mut.nodeId}" not found in graph`);
      else {
        const connected = edges.filter(e => e.source === mut.nodeId || e.target === mut.nodeId);
        if (connected.length > 0) warnings.push(`Will also remove ${connected.length} connected edge(s)`);
      }
      break;

    case 'add_edge':
      if (!mut.source) errors.push('Missing source node');
      else if (!nodeIds.has(mut.source)) errors.push(`Source "${mut.source}" not found`);
      if (!mut.target) errors.push('Missing target node');
      else if (!nodeIds.has(mut.target)) errors.push(`Target "${mut.target}" not found`);
      if (mut.source && mut.target) {
        if (mut.source === mut.target) errors.push('Self-loop: source === target');
        const exists = edges.some(e => e.source === mut.source && e.target === mut.target);
        if (exists) warnings.push('Edge already exists (duplicate)');
      }
      break;

    case 'remove_edge':
      if (!mut.source || !mut.target) errors.push('Missing source or target');
      else {
        const exists = edges.some(e => e.source === mut.source && e.target === mut.target);
        if (!exists) warnings.push('Edge not found in current graph');
      }
      break;

    case 'create_subgraph':
      if (!mut.parentNodeId) errors.push('Missing parentNodeId');
      else if (!nodeIds.has(mut.parentNodeId)) errors.push(`Parent node "${mut.parentNodeId}" not found`);
      if (!mut.subgraph) errors.push('Missing subgraph definition');
      else {
        if (!Array.isArray(mut.subgraph.nodes) || mut.subgraph.nodes.length === 0) errors.push('Sub-graph has no nodes');
        if (!Array.isArray(mut.subgraph.edges)) warnings.push('Sub-graph has no edges array');
        else if (mut.subgraph.edges.length === 0) warnings.push('Sub-graph has no edges (linear?)');
        if (!mut.subgraph.name) warnings.push('Sub-graph has no name');
      }
      break;

    case 'link_subgraph':
      if (!mut.parentNodeId) errors.push('Missing parentNodeId');
      else if (!nodeIds.has(mut.parentNodeId)) errors.push(`Parent node "${mut.parentNodeId}" not found`);
      if (!mut.catalogGraphId) errors.push('Missing catalogGraphId');
      break;

    case 'save_graph':
      if (!mut.name) warnings.push('No graph name specified — dialog will open for input');
      break;

    default:
      errors.push(`Unknown mutation type: "${mut.type}"`);
  }

  return {
    errors,
    warnings,
    status: errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'valid',
  };
}

/**
 * Validate all mutations and return per-mutation validation results + summary.
 */
function validateAllMutations(mutations, nodes, edges) {
  const results = mutations.map(mut => validateMutation(mut, nodes, edges));
  const validCount = results.filter(r => r.status === 'valid').length;
  const warningCount = results.filter(r => r.status === 'warning').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  return { results, validCount, warningCount, errorCount };
}

/* ═══════════════════════════════════════════════════════════════════════════
   VALIDATION BADGE
   ═══════════════════════════════════════════════════════════════════════════ */

const ValidationBadge = ({ validation }) => {
  if (validation.status === 'valid') {
    return (
      <span className="flex items-center gap-0.5 text-[9px] text-green-400" title="Valid">
        <CheckCircle className="w-2.5 h-2.5" />
      </span>
    );
  }
  if (validation.status === 'warning') {
    return (
      <span className="flex items-center gap-0.5 text-[9px] text-yellow-400" title={validation.warnings.join('; ')}>
        <AlertTriangle className="w-2.5 h-2.5" />
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 text-[9px] text-red-400" title={validation.errors.join('; ')}>
      <XCircle className="w-2.5 h-2.5" />
    </span>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   MUTATIONS PANEL (inside chat) — with validation
   ═══════════════════════════════════════════════════════════════════════════ */

const MutationsPanel = ({ mutations, applied, validations, onApplyOne, onApplyAll }) => {
  const [expandedIdx, setExpandedIdx] = useState(null);

  const unappliedCount = mutations.filter((_, i) => !applied.has(i)).length;
  const applyableCount = mutations.filter((_, i) => !applied.has(i) && validations?.results?.[i]?.status !== 'error').length;

  const summary = validations || { validCount: mutations.length, warningCount: 0, errorCount: 0 };

  return (
    <div className="border-t border-blue-500/30 bg-[#161b22] p-2 space-y-1.5 max-h-72 overflow-auto shrink-0">
      {/* Header with validation summary */}
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <Wrench className="w-3.5 h-3.5 text-blue-400" />
        <span className="text-xs font-medium text-blue-400">Proposed Changes ({mutations.length})</span>

        {/* Validation summary badges */}
        {validations && (
          <div className="flex items-center gap-1.5">
            {summary.validCount > 0 && (
              <span className="flex items-center gap-0.5 text-[9px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
                <CheckCircle className="w-2.5 h-2.5" /> {summary.validCount}
              </span>
            )}
            {summary.warningCount > 0 && (
              <span className="flex items-center gap-0.5 text-[9px] text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded">
                <AlertTriangle className="w-2.5 h-2.5" /> {summary.warningCount}
              </span>
            )}
            {summary.errorCount > 0 && (
              <span className="flex items-center gap-0.5 text-[9px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                <XCircle className="w-2.5 h-2.5" /> {summary.errorCount}
              </span>
            )}
          </div>
        )}

        <div className="flex-1" />

        {unappliedCount > 0 ? (
          <button
            onClick={onApplyAll}
            disabled={applyableCount === 0}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-colors ${
              applyableCount > 0
                ? 'text-white bg-blue-600 hover:bg-blue-700'
                : 'text-gray-500 bg-gray-700 cursor-not-allowed'
            }`}
            title={summary.errorCount > 0 ? `${summary.errorCount} invalid mutation(s) will be skipped` : undefined}
          >
            <ShieldCheck className="w-3 h-3" />
            Apply Valid ({applyableCount})
          </button>
        ) : (
          <span className="flex items-center gap-1 text-[10px] text-green-400">
            <Check className="w-3 h-3" /> All applied
          </span>
        )}
      </div>

      {/* Mutation cards */}
      {mutations.map((mut, idx) => {
        const style = MUTATION_STYLES[mut.type] || MUTATION_STYLES.update_node;
        const MIcon = style.Icon;
        const isApplied = applied.has(idx);
        const validation = validations?.results?.[idx];
        const isError = validation?.status === 'error';
        const isExpanded = expandedIdx === idx;
        const hasDetails = validation && (validation.errors.length > 0 || validation.warnings.length > 0);

        return (
          <div
            key={idx}
            className={`rounded border transition-all ${style.bg} ${isApplied ? 'opacity-40' : ''} ${
              isError ? 'border-red-500/50' : style.border
            }`}
          >
            {/* Main row */}
            <div className="flex items-start gap-2 p-2">
              <MIcon className={`w-3.5 h-3.5 ${style.color} shrink-0 mt-0.5`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                  <span className={`text-[9px] font-mono px-1 py-0.5 rounded ${style.bg} ${style.color}`}>
                    {style.label}
                  </span>
                  {mut.nodeId && <span className="text-[9px] text-gray-500 font-mono">{mut.nodeId}</span>}
                  {mut.parentNodeId && <span className="text-[9px] text-gray-500 font-mono">→ {mut.parentNodeId}</span>}
                  {mut.source && mut.target && <span className="text-[9px] text-gray-500 font-mono">{mut.source}→{mut.target}</span>}
                  {/* Sub-graph info badges */}
                  {mut.type === 'create_subgraph' && mut.subgraph && (
                    <span className="text-[9px] text-purple-400/80 font-mono">{mut.subgraph.nodes?.length || 0}n/{mut.subgraph.edges?.length || 0}e</span>
                  )}
                  {mut.type === 'link_subgraph' && mut.catalogGraphName && (
                    <span className="text-[9px] text-cyan-400/80 font-mono truncate max-w-[120px]" title={mut.catalogGraphName}>{mut.catalogGraphName}</span>
                  )}
                  {mut.type === 'save_graph' && mut.name && (
                    <span className="text-[9px] text-green-400/80 font-mono truncate max-w-[120px]">{mut.name} v{mut.version || '1.0.0'}</span>
                  )}
                  {/* Validation badge */}
                  {validation && <ValidationBadge validation={validation} />}
                </div>
                <p className="text-[10px] text-gray-300 leading-relaxed">{mut.description}</p>
                {mut.changes && (
                  <pre className="mt-0.5 text-[9px] text-cyan-400/80 font-mono bg-[#0d1117] rounded px-1.5 py-0.5 overflow-x-auto max-h-16 overflow-y-auto">
                    {JSON.stringify(mut.changes, null, 2)}
                  </pre>
                )}
              </div>

              <div className="shrink-0 flex items-center gap-1">
                {/* Expand validation details */}
                {hasDetails && !isApplied && (
                  <button
                    onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                    className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
                    title="Validation details"
                  >
                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </button>
                )}

                {/* Apply button */}
                <button
                  onClick={() => onApplyOne(idx)}
                  disabled={isApplied || isError}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                    isApplied
                      ? 'bg-green-500/10 text-green-400 border border-green-500/30 cursor-default'
                      : isError
                        ? 'bg-red-500/10 text-red-400/50 border border-red-500/20 cursor-not-allowed'
                        : 'bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20'
                  }`}
                  title={isError ? validation.errors.join('; ') : undefined}
                >
                  {isApplied ? <Check className="w-3 h-3" /> : isError ? <ShieldAlert className="w-3 h-3" /> : <Wrench className="w-3 h-3" />}
                  {isApplied ? 'Done' : isError ? 'Invalid' : 'Apply'}
                </button>
              </div>
            </div>

            {/* Expanded validation details */}
            {isExpanded && hasDetails && (
              <div className="px-2 pb-2 pt-0 space-y-0.5 border-t border-[#30363d]/50 mt-0">
                {validation.errors.map((msg, i) => (
                  <div key={`e${i}`} className="flex items-start gap-1.5 text-[9px] text-red-400">
                    <XCircle className="w-2.5 h-2.5 shrink-0 mt-0.5" />
                    <span>{msg}</span>
                  </div>
                ))}
                {validation.warnings.map((msg, i) => (
                  <div key={`w${i}`} className="flex items-start gap-1.5 text-[9px] text-yellow-400">
                    <AlertTriangle className="w-2.5 h-2.5 shrink-0 mt-0.5" />
                    <span>{msg}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

const ExecutionAssistantPanel = forwardRef(({
  graphNodes = [],
  graphEdges = [],
  namespace,
  executionError,
  onApplyMutations,
  isCollapsed,
  onToggleCollapse,
  width = 380,
  onWidthChange,
  onStreamingComplete,
}, ref) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingMutations, setPendingMutations] = useState([]);
  const [appliedMutations, setAppliedMutations] = useState(new Set());
  const [mutationValidations, setMutationValidations] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  // Coalesce per-token stream updates into ≤1 render per ~80ms (avoids
  // re-parsing the whole markdown message on every token).
  const { schedule: scheduleTokenFlush, flushNow: flushTokens } = useStreamThrottle(80);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Re-validate mutations when graph changes (nodes/edges might have been modified externally)
  useEffect(() => {
    if (pendingMutations.length > 0) {
      const v = validateAllMutations(pendingMutations, graphNodes, graphEdges);
      setMutationValidations(v);
    }
  }, [pendingMutations, graphNodes, graphEdges]);

  // Build graph context for API
  const graphContext = useMemo(() => ({
    nodes: graphNodes.map(n => ({
      id: n.id,
      data: { label: n.data?.label, toolId: n.data?.toolId, kind: n.data?.kind, executorType: n.data?.executorType }
    })),
    edges: graphEdges.map(e => ({ source: e.source, target: e.target, label: e.label })),
  }), [graphNodes, graphEdges]);

  // Build history for API
  const buildHistory = useCallback(() => {
    return messages
      .filter(m => m.role === 'user' || (m.role === 'assistant' && !m.streaming))
      .map(m => ({ role: m.role, content: m.content }));
  }, [messages]);

  // Parse mutations from AI response text
  const extractMutations = useCallback((text) => {
    const match = text.match(/```mutations\s*\n([\s\S]*?)```/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[1].trim());
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }, []);

  const sendMessage = useCallback(async (text, execError, isAuto = false) => {
    const userMsg = text || input.trim();
    if (!userMsg || isStreaming) return;

    setInput('');

    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: userMsg,
      timestamp: new Date().toISOString(),
      isAuto,
    };

    const assistantMessage = {
      id: Date.now() + 1,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      streaming: true,
      toolCalls: [],
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setIsStreaming(true);

    const history = buildHistory();

    try {
      const { responsePromise, abort } = streamExecutionAssistantChat(
        userMsg, history, graphContext,
        { namespace, executionError: execError || undefined }
      );
      abortRef.current = abort;

      const response = await responsePromise;

      if (!response.ok) {
        const errText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let receivedMutations = null;
      let fullContent = ''; // Track content locally (sync) for reliable mutation extraction

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const rawData = line.slice(6).trim();
          if (!rawData) continue;

          let data;
          try { data = JSON.parse(rawData); } catch { continue; }

          switch (data.type) {
            case 'token':
              fullContent += (data.content || '');
              scheduleTokenFlush(() => setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, content: fullContent };
                }
                return updated;
              }));
              break;

            case 'tool_call':
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = {
                    ...last,
                    toolCalls: [...(last.toolCalls || []), { tool: data.tool, pending: true }],
                  };
                }
                return updated;
              });
              break;

            case 'tool_result':
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') {
                  const toolCalls = [...(last.toolCalls || [])];
                  const idx = toolCalls.findLastIndex(tc => tc.tool === data.tool && tc.pending);
                  if (idx >= 0) {
                    toolCalls[idx] = { ...toolCalls[idx], pending: false, success: data.success };
                  }
                  updated[updated.length - 1] = { ...last, toolCalls };
                }
                return updated;
              });
              break;

            case 'mutations':
              // Backend-extracted mutations (synchronous — no race condition)
              if (Array.isArray(data.mutations)) {
                receivedMutations = data.mutations;
              }
              break;

            case 'usage':
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = {
                    ...last,
                    usage: { input_tokens: data.input_tokens, output_tokens: data.output_tokens, turns: data.turns },
                  };
                }
                return updated;
              });
              break;

            case 'done':
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, streaming: false };
                }
                return updated;
              });
              break;

            case 'error':
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, streaming: false, error: data.message };
                }
                return updated;
              });
              break;
          }
        }
      }

      // Apply any pending throttled token update before finalizing.
      flushTokens();

      // Extract mutations from text if not received via backend event
      if (!receivedMutations) {
        receivedMutations = extractMutations(fullContent);
      }

      // Store mutations and run validation
      if (receivedMutations && receivedMutations.length > 0) {
        console.log('[ExecutionAssistant] Extracted mutations:', receivedMutations);
        setPendingMutations(receivedMutations);
        setAppliedMutations(new Set());
        // Validation runs automatically via useEffect on pendingMutations change
      }
    } catch (err) {
      flushTokens();
      if (err.name === 'AbortError') {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant') {
            updated[updated.length - 1] = { ...last, streaming: false, content: last.content + '\n\n*(cancelled)*' };
          }
          return updated;
        });
      } else {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant') {
            updated[updated.length - 1] = { ...last, streaming: false, error: err.message };
          }
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
      onStreamingComplete?.();
    }
  }, [input, isStreaming, buildHistory, graphContext, namespace, extractMutations, onStreamingComplete]);

  // Imperative handle for parent to trigger auto-messages
  useImperativeHandle(ref, () => ({
    sendAutoMessage: (text, execError) => sendMessage(text, execError, true),
    isStreaming: () => isStreaming,
    clearMessages: () => {
      setMessages([]);
      setPendingMutations([]);
      setAppliedMutations(new Set());
      setMutationValidations(null);
    },
  }), [sendMessage, isStreaming]);

  const handleStop = useCallback(() => { abortRef.current?.(); }, []);

  const handleClear = useCallback(() => {
    if (isStreaming) return;
    setMessages([]);
    setPendingMutations([]);
    setAppliedMutations(new Set());
    setMutationValidations(null);
  }, [isStreaming]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  // Mutation apply handlers — skip errors on validation
  const handleApplyOne = useCallback((idx) => {
    if (!pendingMutations[idx] || appliedMutations.has(idx)) return;
    const validation = mutationValidations?.results?.[idx];
    if (validation?.status === 'error') return; // block invalid
    onApplyMutations?.([pendingMutations[idx]]);
    setAppliedMutations(prev => new Set(prev).add(idx));
  }, [pendingMutations, appliedMutations, onApplyMutations, mutationValidations]);

  const handleApplyAll = useCallback(() => {
    // Only apply valid + warning mutations, skip errors
    const applyable = [];
    const newApplied = new Set(appliedMutations);
    pendingMutations.forEach((mut, i) => {
      if (newApplied.has(i)) return;
      const validation = mutationValidations?.results?.[i];
      if (validation?.status === 'error') return; // skip
      applyable.push(mut);
      newApplied.add(i);
    });
    if (applyable.length === 0) return;
    onApplyMutations?.(applyable);
    setAppliedMutations(newApplied);
  }, [pendingMutations, appliedMutations, onApplyMutations, mutationValidations]);

  // ─── Horizontal resize ───
  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
  }, [width]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing.current) return;
      const delta = startX.current - e.clientX;
      onWidthChange?.(Math.max(280, Math.min(700, startWidth.current + delta)));
    };
    const handleMouseUp = () => { isResizing.current = false; };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onWidthChange]);

  if (isCollapsed) return null;

  const hasMessages = messages.length > 0;

  return (
    <div
      className="h-full flex flex-col bg-[#0d1117] border-l border-[#30363d] relative shrink-0"
      style={{ width, minWidth: 280 }}
    >
      {/* Resize handle (left edge) */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-cyan-500/30 z-10 transition-colors"
        onMouseDown={handleResizeStart}
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#30363d] bg-[#161b22] shrink-0">
        <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
        <span className="text-xs font-medium text-cyan-400">AI Assistant</span>
        <div className="flex-1" />
        {isStreaming && <Loader2 className="w-3 h-3 animate-spin text-yellow-400" />}
        {hasMessages && !isStreaming && (
          <button onClick={handleClear} className="p-1 text-gray-500 hover:text-gray-300 transition-colors" title="Clear chat">
            <Trash2 className="w-3 h-3" />
          </button>
        )}
        <button onClick={onToggleCollapse} className="p-1 text-gray-500 hover:text-gray-300 transition-colors" title="Close panel">
          <PanelRightClose className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-auto">
        {!hasMessages ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
            <div className="flex items-center gap-2 text-gray-500">
              <Sparkles className="w-4 h-4 text-cyan-500" />
              <span className="text-xs font-medium">Execution Assistant</span>
            </div>
            <p className="text-[10px] text-gray-500 text-center max-w-[240px]">
              Validates graphs before execution, diagnoses failures, and resolves missing tools using MCP.
            </p>
            <div className="flex flex-wrap gap-1.5 justify-center max-w-[280px]">
              {QUICK_ACTIONS.map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => sendMessage(action.prompt)}
                  disabled={isStreaming}
                  className="px-2.5 py-1 text-[10px] text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 rounded-full
                             hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-2">
            {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Mutations panel with validation */}
      {pendingMutations.length > 0 && (
        <MutationsPanel
          mutations={pendingMutations}
          applied={appliedMutations}
          validations={mutationValidations}
          onApplyOne={handleApplyOne}
          onApplyAll={handleApplyAll}
        />
      )}

      {/* Input area */}
      <div className="border-t border-[#30363d] bg-[#161b22] px-2 py-1.5 shrink-0">
        <div className="flex items-end gap-1.5">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about execution..."
            rows={1}
            disabled={isStreaming}
            className="flex-1 bg-[#0d1117] text-xs border border-[#30363d] rounded-lg px-2.5 py-1.5
                       text-white placeholder:text-gray-600 resize-none
                       focus:border-cyan-500 focus:outline-none disabled:opacity-50
                       max-h-24 overflow-auto"
          />
          {isStreaming ? (
            <button
              onClick={handleStop}
              className="p-1.5 text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors"
              title="Stop"
            >
              <StopCircle className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim()}
              className="p-1.5 text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 rounded-lg
                         hover:bg-cyan-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

ExecutionAssistantPanel.displayName = 'ExecutionAssistantPanel';

export default ExecutionAssistantPanel;
