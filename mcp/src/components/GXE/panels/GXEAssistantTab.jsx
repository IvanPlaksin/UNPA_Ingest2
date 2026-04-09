/**
 * GXEAssistantTab — AI Assistant for building executable graphs.
 *
 * Lives in the BottomPanel of GXE Visualizer.
 * Connects to /api/v1/assistant/chat via SSE streaming.
 * Parses %%ACTION%% blocks and offers "Apply" buttons.
 * Tailwind + lucide-react, GXE dark theme.
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Bot, Send, Trash2, Loader2, Undo2, LayoutGrid,
  Network, Zap, CheckCircle2, AlertCircle, Play,
  XCircle, Activity, Clock, ChevronDown, ChevronRight,
  RotateCcw, ArrowRight, Package,
} from 'lucide-react';
import { API_BASE_URL } from '../../../config/api.config';
import useGraphValidation from './useGraphValidation';
import useAutoLayout from './useAutoLayout';
import AssistantStatusBar from './AssistantStatusBar';

// ── Action type labels ──
const ACTION_LABELS = {
  ADD_NODE: 'Добавить узел',
  REMOVE_NODE: 'Удалить узел',
  UPDATE_NODE: 'Обновить узел',
  ADD_EDGE: 'Добавить ребро',
  REMOVE_EDGE: 'Удалить ребро',
  INSERT_BETWEEN: 'Вставить между',
  CREATE_SUBGRAPH: 'Создать подграф',
  EXTRACT_SUBGRAPH: 'Извлечь подграф',
  BATCH: 'Пакет действий',
  EXECUTE_GRAPH: 'Запустить граф',
};

// ── Phase labels for execution display ──
const PHASE_LABELS = {
  QUEUED: 'В очереди',
  RESOLVE: 'Резолв инструмента',
  VALIDATE_INPUT: 'Валидация входа',
  EXECUTE: 'Исполнение',
  VALIDATE_OUTPUT: 'Валидация выхода',
  PROPAGATE: 'Пропагация данных',
  SKIPPED: 'Пропущен',
};

// ── Format message content (basic markdown) ──
function formatContent(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  lines.forEach((line, li) => {
    if (li > 0) elements.push(<br key={`br-${li}`} />);
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    parts.forEach((part, pi) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        elements.push(<strong key={`${li}-${pi}`} className="text-gray-200">{part.slice(2, -2)}</strong>);
      } else if (part.startsWith('- ')) {
        elements.push(<span key={`${li}-${pi}`} className="block pl-3">{part}</span>);
      } else {
        elements.push(part);
      }
    });
  });
  return elements;
}

function generateSessionId() {
  return 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

/** Format duration in ms to human-readable */
function fmtMs(ms) {
  if (!ms || ms <= 0) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Truncate output string for display */
function previewOutput(output, maxLen = 200) {
  if (output === null || output === undefined) return null;
  const str = typeof output === 'string' ? output : JSON.stringify(output);
  if (str.length > maxLen) return str.substring(0, maxLen) + '…';
  return str;
}

// ── Action card within a message ──
function ActionCard({ action, index, onApply, applied }) {
  const label = ACTION_LABELS[action.type] || action.type;
  const detail = action.node
    ? `${action.node.type || ''} "${action.node.label || action.node.id || ''}"`
    : action.source && action.target
      ? `${action.source} → ${action.target}`
      : '';

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 mt-1 rounded border border-[#30363d] bg-[#161b22]">
      <Zap size={10} className="text-amber-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-gray-300 font-medium">{label}</div>
        {detail && <div className="text-[9px] text-gray-500 truncate">{detail}</div>}
      </div>
      {applied ? (
        <CheckCircle2 size={12} className="text-green-400 flex-shrink-0" />
      ) : (
        <button
          onClick={() => onApply(action, index)}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/40 hover:text-indigo-200 border border-indigo-500/30 transition-colors"
        >
          <Play size={8} />
          Применить
        </button>
      )}
    </div>
  );
}

// ── Node Execution Row — shows one node's full execution lifecycle ──
function NodeExecutionRow({ nodeId, nr, isLast }) {
  const [expanded, setExpanded] = useState(false);
  const hasOutput = nr.output !== null && nr.output !== undefined;
  const hasPhases = nr.phases && Object.keys(nr.phases).length > 0;
  const canExpand = hasOutput || hasPhases || nr.error;

  const statusIcon = {
    SUCCEEDED: <CheckCircle2 size={10} className="text-green-400 flex-shrink-0" />,
    FAILED: <XCircle size={10} className="text-red-400 flex-shrink-0" />,
    RUNNING: <Loader2 size={10} className="text-amber-400 animate-spin flex-shrink-0" />,
    RETRYING: <RotateCcw size={10} className="text-yellow-400 animate-spin flex-shrink-0" />,
    QUEUED: <Clock size={10} className="text-gray-500 flex-shrink-0" />,
    SKIPPED: <ArrowRight size={10} className="text-gray-600 flex-shrink-0" />,
  };

  const statusColors = {
    SUCCEEDED: 'border-green-500/15 bg-green-900/5',
    FAILED: 'border-red-500/15 bg-red-900/5',
    RUNNING: 'border-amber-500/15 bg-amber-900/5',
    RETRYING: 'border-yellow-500/15 bg-yellow-900/5',
    QUEUED: 'border-gray-500/10 bg-gray-900/5',
    SKIPPED: 'border-gray-500/10 bg-gray-900/5',
  };

  return (
    <div className={`rounded border ${statusColors[nr.status] || 'border-gray-500/10'} ${isLast ? '' : 'mb-1'}`}>
      {/* Header row */}
      <div
        className={`flex items-center gap-1.5 px-2 py-1 ${canExpand ? 'cursor-pointer hover:bg-white/[0.02]' : ''}`}
        onClick={() => canExpand && setExpanded(!expanded)}
      >
        {canExpand ? (
          expanded
            ? <ChevronDown size={8} className="text-gray-500 flex-shrink-0" />
            : <ChevronRight size={8} className="text-gray-500 flex-shrink-0" />
        ) : (
          <span className="w-2 flex-shrink-0" />
        )}
        {statusIcon[nr.status] || statusIcon.QUEUED}
        <span className="text-[10px] text-gray-300 font-medium truncate flex-1">{nr.label || nodeId}</span>
        {nr.toolId && <span className="text-[8px] text-gray-600 truncate max-w-[80px]">{nr.toolId}</span>}
        {nr.attempt > 1 && (
          <span className="text-[8px] text-yellow-500 font-mono">×{nr.attempt}</span>
        )}
        {nr.duration > 0 && (
          <span className="text-[9px] text-gray-500 font-mono ml-auto flex-shrink-0">{fmtMs(nr.duration)}</span>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-2 pb-1.5 pt-0 space-y-1 border-t border-white/5">
          {/* Phase timing breakdown */}
          {hasPhases && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
              {Object.entries(nr.phases).map(([phase, ms]) => (
                <div key={phase} className="flex items-center gap-1 text-[8px]">
                  <span className="text-gray-500">{PHASE_LABELS[phase.replace('Ms', '').toUpperCase()] || phase}:</span>
                  <span className="text-gray-400 font-mono">{fmtMs(ms)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Error message */}
          {nr.error && (
            <div className="text-[9px] text-red-400 bg-red-900/10 rounded px-1.5 py-1 mt-1 break-all">
              {nr.error}
              {nr.failedAtPhase && (
                <span className="text-red-500/60 ml-1">(фаза: {PHASE_LABELS[nr.failedAtPhase] || nr.failedAtPhase})</span>
              )}
            </div>
          )}

          {/* Output preview */}
          {hasOutput && (
            <div className="mt-1">
              <div className="text-[8px] text-emerald-600 font-semibold mb-0.5 flex items-center gap-1">
                <Package size={8} /> Результат:
              </div>
              <pre className="text-[8px] text-emerald-300/70 bg-emerald-900/10 rounded px-1.5 py-1 max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono">
                {previewOutput(nr.output, 500)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Execution Progress Card — full execution display ──
function ExecutionCard({ msg }) {
  const nodeEntries = msg.nodeResults ? Object.entries(msg.nodeResults) : [];
  const succeededCount = nodeEntries.filter(([, nr]) => nr.status === 'SUCCEEDED').length;
  const failedCount = nodeEntries.filter(([, nr]) => nr.status === 'FAILED').length;
  const totalNodes = msg.totalNodes || nodeEntries.length;
  const progressPct = totalNodes > 0 ? Math.round(((succeededCount + failedCount) / totalNodes) * 100) : 0;

  return (
    <div className="rounded-lg px-3 py-2 text-xs leading-relaxed bg-[#0d1f17] text-emerald-200 border border-emerald-500/20 rounded-bl-sm">
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-1 font-semibold text-emerald-300">
        {msg.executionStatus === 'RUNNING' && <Loader2 size={11} className="animate-spin" />}
        {msg.executionStatus === 'COMPLETED' && <CheckCircle2 size={11} className="text-green-400" />}
        {msg.executionStatus === 'FAILED' && <XCircle size={11} className="text-red-400" />}
        <span>Выполнение графа</span>
        {msg.executionStatus === 'RUNNING' && (
          <span className="text-emerald-500 font-normal text-[10px]">в процессе...</span>
        )}
        {msg.executionDuration > 0 && (
          <span className="ml-auto text-[9px] text-emerald-500/60 font-mono font-normal">{fmtMs(msg.executionDuration)}</span>
        )}
      </div>

      {/* Progress bar */}
      {msg.executionStatus === 'RUNNING' && totalNodes > 0 && (
        <div className="mb-1.5">
          <div className="flex items-center justify-between text-[8px] text-emerald-500/60 mb-0.5">
            <span>{succeededCount + failedCount}/{totalNodes} узлов</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-1 bg-emerald-900/30 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progressPct}%`,
                background: failedCount > 0
                  ? 'linear-gradient(90deg, #22c55e, #ef4444)'
                  : '#22c55e',
              }}
            />
          </div>
        </div>
      )}

      {/* Summary line */}
      {msg.executionStatus !== 'RUNNING' && (
        <div className="text-[10px] mb-1.5 flex items-center gap-2 flex-wrap">
          {succeededCount > 0 && (
            <span className="flex items-center gap-0.5 text-green-400">
              <CheckCircle2 size={9} /> {succeededCount} ок
            </span>
          )}
          {failedCount > 0 && (
            <span className="flex items-center gap-0.5 text-red-400">
              <XCircle size={9} /> {failedCount} ош.
            </span>
          )}
          {msg.executionDuration > 0 && (
            <span className="flex items-center gap-0.5 text-gray-500">
              <Clock size={9} /> {fmtMs(msg.executionDuration)}
            </span>
          )}
        </div>
      )}

      {/* Per-node execution rows */}
      {nodeEntries.length > 0 && (
        <div className="mt-1 border-t border-emerald-500/10 pt-1">
          {nodeEntries.map(([nodeId, nr], idx) => (
            <NodeExecutionRow
              key={nodeId}
              nodeId={nodeId}
              nr={nr}
              isLast={idx === nodeEntries.length - 1}
            />
          ))}
        </div>
      )}

      {/* Status message */}
      {msg.content && msg.executionStatus !== 'RUNNING' && (
        <div className="text-[9px] text-emerald-400/70 mt-1.5 pt-1 border-t border-emerald-500/10">
          {msg.content}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──
const WELCOME_MSG = {
  id: 'welcome',
  role: 'assistant',
  content: 'Привет! Я GXE AI Assistant. Опишите граф, который хотите создать, или задайте вопрос о существующем графе.',
  timestamp: new Date().toISOString(),
  actions: [],
};

const GXEAssistantTab = ({
  nodes = [],
  edges = [],
  selectedNodes = [],
  selectedEdges = [],
  onApplyAction,
  setNodes,
  setEdges,
  catalogGraphId = null,
}) => {
  const [messages, setMessages] = useState([WELCOME_MSG]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(() =>
    catalogGraphId ? `graph-${catalogGraphId}` : generateSessionId()
  );
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [appliedActions, setAppliedActions] = useState(new Set());
  const [executionState, setExecutionState] = useState(null);
  const [filterStatus, setFilterStatus] = useState(null);
  const [catalogStatus, setCatalogStatus] = useState(null);
  const [reuseStatus, setReuseStatus] = useState(null);
  const [retryStatus, setRetryStatus] = useState(null);
  const { issues, errors, warnings, isValid } = useGraphValidation(nodes, edges);
  const { getNextPosition, relayoutGraph } = useAutoLayout();
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const sendMessageRef = useRef(null);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  // Load chat history when catalogGraphId is available or changes
  useEffect(() => {
    if (!catalogGraphId) {
      setHistoryLoaded(true);
      return;
    }
    const newSessionId = `graph-${catalogGraphId}`;
    setSessionId(newSessionId);

    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`${API_BASE_URL}/assistant/session/${encodeURIComponent(catalogGraphId)}`);
        if (!resp.ok || cancelled) return;
        const data = await resp.json();
        if (cancelled) return;

        if (data.found && data.messages?.length > 0) {
          const restored = data.messages.map((m, i) => ({
            id: `hist-${i}`,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
            actions: [],
          }));
          setMessages([WELCOME_MSG, ...restored]);
          setSessionId(data.sessionId);
        }
      } catch (err) {
        console.warn('[GXEAssistant] Failed to load history:', err.message);
      } finally {
        if (!cancelled) setHistoryLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [catalogGraphId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Selection context summary
  const selectionSummary = useMemo(() => {
    if (!selectedNodes?.length && !selectedEdges?.length) return null;
    const parts = [];
    if (selectedNodes.length) {
      parts.push(`${selectedNodes.length} узл.`);
    }
    if (selectedEdges?.length) {
      parts.push(`${selectedEdges.length} рёб.`);
    }
    return parts.join(', ');
  }, [selectedNodes, selectedEdges]);

  // Determine topological role
  const topologicalRole = useMemo(() => {
    if (!selectedNodes?.length) return 'EMPTY';
    if (selectedNodes.length === 1) return 'SINGLE_NODE';
    const selectedIds = new Set(selectedNodes.map(n => n.id));
    const relevantEdges = edges.filter(
      e => selectedIds.has(e.source) && selectedIds.has(e.target)
    );
    if (relevantEdges.length === selectedNodes.length - 1) return 'LINEAR_CHAIN';
    return 'NODE_GROUP';
  }, [selectedNodes, edges]);

  // ── Execute graph via RuntimeEngine (SSE) ──
  const executeGraph = useCallback(async (action = {}) => {
    // Wait for React state to settle (prior ADD_NODE/ADD_EDGE may still be batched)
    await new Promise(r => setTimeout(r, 100));

    // Read latest state via refs (closure `nodes` may be stale after batch apply)
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;

    if (currentNodes.length === 0) {
      console.warn('[GXEAssistant] executeGraph: no nodes on canvas, skipping');
      return;
    }

    // Build DAG from current canvas nodes/edges
    const dag = {
      nodes: currentNodes.map(n => ({
        id: n.id,
        data: {
          ...(n.data || {}),
          toolId: n.data?.executorType || n.data?.toolId || n.data?.type || n.type,
          label: n.data?.label || n.data?.name || n.id,
        },
      })),
      edges: currentEdges.map(e => ({
        id: e.id || `e-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle || '_output',
        targetHandle: e.targetHandle || '_input',
      })),
    };

    // Create execution message with node inventory
    const execMsgId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const initialNodeResults = {};

    // Pre-populate all nodes as QUEUED
    for (const n of dag.nodes) {
      initialNodeResults[n.id] = {
        status: 'QUEUED',
        label: n.data?.label || n.id,
        toolId: n.data?.toolId || 'unknown',
        output: null,
        error: null,
        duration: 0,
        phases: null,
        attempt: 0,
        failedAtPhase: null,
      };
    }

    setExecutionState({ status: 'RUNNING', nodeResults: initialNodeResults, executionId: null });

    setMessages(prev => [...prev, {
      id: execMsgId,
      role: 'execution',
      content: `Запуск графа: ${dag.nodes.length} узлов, ${dag.edges.length} рёбер...`,
      timestamp: new Date().toISOString(),
      executionStatus: 'RUNNING',
      totalNodes: dag.nodes.length,
      executionDuration: 0,
      nodeResults: { ...initialNodeResults },
      actions: [],
    }]);

    try {
      const body = {
        dag,
        inputData: action.inputData || {},
        config: action.config || { nodeTimeoutMs: 60000 },
        sessionId,
      };

      const response = await fetch(`${API_BASE_URL}/assistant/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const nodeResults = { ...initialNodeResults };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        // Parse SSE: collect event/data pairs
        let currentEventType = null;
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEventType = line.slice(7).trim();
            continue;
          }
          if (!line.startsWith('data: ')) {
            if (line.trim() === '') currentEventType = null; // Reset on blank line
            continue;
          }
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          let event;
          try { event = JSON.parse(jsonStr); }
          catch (_) { continue; }

          const evType = currentEventType || event.type || 'unknown';
          currentEventType = null; // Consume

          // ── Handle SSE events ──
          switch (evType) {
            case 'start': {
              // Execution started — update with node manifest if provided
              if (event.nodes) {
                for (const n of event.nodes) {
                  if (nodeResults[n.id]) {
                    nodeResults[n.id].label = n.label || nodeResults[n.id].label;
                    nodeResults[n.id].toolId = n.toolId || nodeResults[n.id].toolId;
                  }
                }
              }
              break;
            }

            case 'node:start': {
              if (nodeResults[event.nodeId]) {
                nodeResults[event.nodeId] = {
                  ...nodeResults[event.nodeId],
                  status: 'RUNNING',
                  label: event.nodeLabel || nodeResults[event.nodeId].label,
                  toolId: event.toolId || nodeResults[event.nodeId].toolId,
                  attempt: event.attempt || 1,
                };
              } else {
                nodeResults[event.nodeId] = {
                  status: 'RUNNING',
                  label: event.nodeLabel || event.nodeId,
                  toolId: event.toolId || 'unknown',
                  output: null, error: null, duration: 0,
                  phases: null, attempt: event.attempt || 1, failedAtPhase: null,
                };
              }
              break;
            }

            case 'node:phase': {
              if (nodeResults[event.nodeId]) {
                nodeResults[event.nodeId] = {
                  ...nodeResults[event.nodeId],
                  currentPhase: event.phase,
                  status: event.phase === 'SKIPPED' ? 'SKIPPED' : nodeResults[event.nodeId].status,
                };
              }
              break;
            }

            case 'node:complete': {
              if (nodeResults[event.nodeId]) {
                nodeResults[event.nodeId] = {
                  ...nodeResults[event.nodeId],
                  status: 'SUCCEEDED',
                  output: event.result,
                  duration: event.duration || 0,
                  phases: event.phases || null,
                  attempt: event.attempt || nodeResults[event.nodeId].attempt,
                  currentPhase: null,
                };
              }
              break;
            }

            case 'node:error': {
              if (nodeResults[event.nodeId]) {
                nodeResults[event.nodeId] = {
                  ...nodeResults[event.nodeId],
                  status: 'FAILED',
                  error: event.error || 'Unknown error',
                  failedAtPhase: event.failedAtPhase || null,
                  attempt: event.attempt || nodeResults[event.nodeId].attempt,
                  currentPhase: null,
                };
              }
              break;
            }

            case 'node:retry': {
              if (nodeResults[event.nodeId]) {
                nodeResults[event.nodeId] = {
                  ...nodeResults[event.nodeId],
                  status: 'RETRYING',
                  error: event.error || null,
                  attempt: event.attempt || nodeResults[event.nodeId].attempt,
                };
              }
              break;
            }

            case 'progress': {
              // Update progress info on execution message
              setMessages(prev => prev.map(m =>
                m.id === execMsgId ? {
                  ...m,
                  nodeResults: { ...nodeResults },
                  progress: event,
                } : m
              ));
              continue; // Skip the generic update below
            }

            case 'complete': {
              // Merge final nodeResults from backend if provided
              if (event.nodeResults) {
                for (const [nid, nr] of Object.entries(event.nodeResults)) {
                  nodeResults[nid] = {
                    ...nodeResults[nid],
                    ...nr,
                    status: nr.status || nodeResults[nid]?.status || 'SUCCEEDED',
                  };
                }
              }
              setExecutionState({
                status: 'COMPLETED',
                nodeResults: { ...nodeResults },
                executionId: event.executionId,
                duration: event.duration,
              });
              break;
            }

            case 'error': {
              setExecutionState({
                status: 'FAILED',
                nodeResults: { ...nodeResults },
                error: event.error,
              });
              break;
            }

            default:
              break;
          }

          // Update execution message in place (after each event)
          const isTerminal = evType === 'complete' || evType === 'error';
          setMessages(prev => prev.map(m =>
            m.id === execMsgId ? {
              ...m,
              nodeResults: { ...nodeResults },
              executionStatus: isTerminal
                ? (evType === 'complete' ? 'COMPLETED' : 'FAILED')
                : 'RUNNING',
              executionDuration: isTerminal ? (event.duration || event.elapsed || 0) : 0,
              content: evType === 'error' && !event.nodeId
                ? `Ошибка выполнения: ${event.error}`
                : m.content,
            } : m
          ));
        }
      }

      // Finalize
      const finalStatus = Object.values(nodeResults).some(r => r.status === 'FAILED') ? 'FAILED' : 'COMPLETED';
      const succeededCount = Object.values(nodeResults).filter(r => r.status === 'SUCCEEDED').length;
      const failedCount = Object.values(nodeResults).filter(r => r.status === 'FAILED').length;
      const totalDuration = Object.values(nodeResults).reduce((sum, r) => sum + (r.duration || 0), 0);

      setMessages(prev => prev.map(m =>
        m.id === execMsgId ? {
          ...m,
          executionStatus: finalStatus,
          executionDuration: totalDuration,
          nodeResults: { ...nodeResults },
          content: finalStatus === 'COMPLETED'
            ? `Граф выполнен: ${succeededCount}/${dag.nodes.length} узлов завершены успешно.`
            : `Выполнение завершено: ${succeededCount} успешно, ${failedCount} с ошибками.`,
        } : m
      ));

      // If there are failures, send result summary to assistant for analysis
      if (failedCount > 0) {
        const failedDetails = Object.entries(nodeResults)
          .filter(([, r]) => r.status === 'FAILED')
          .map(([id, r]) => `- ${r.label || id} [${r.toolId}]: ${r.error || 'unknown error'}${r.failedAtPhase ? ` (фаза: ${r.failedAtPhase})` : ''}`)
          .join('\n');

        setTimeout(() => {
          sendMessageRef.current?.(
            `[EXECUTION FAILED] Граф выполнен с ${failedCount} ошибками:\n${failedDetails}\n\n` +
            `Проанализируй ошибки и предложи исправления через %%ACTION%% блоки. Обязательно эмитируй %%LESSON%% для каждой ошибки.`
          );
        }, 500);
      }

    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === execMsgId ? {
          ...m,
          executionStatus: 'FAILED',
          content: `Ошибка запуска: ${err.message}`,
        } : m
      ));
      setExecutionState({ status: 'FAILED', error: err.message, nodeResults: {} });
    }
  }, [sessionId]);

  // ── Send message with SSE streaming ──
  const sendMessage = useCallback(async (text) => {
    if (!text?.trim() || isLoading) return;
    const trimmed = text.trim();

    const userMsg = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    // Prepare streaming assistant message
    const assistantMsgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-reply`;
    setMessages(prev => [...prev, {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      actions: [],
      isStreaming: true,
    }]);

    try {
      const body = {
        sessionId,
        graphId: catalogGraphId || undefined,
        message: trimmed,
        selectionContext: {
          nodes: (selectedNodes || []).map(n => ({
            id: n.id,
            type: n.data?.type || n.type,
            label: n.data?.label || n.data?.name || n.id,
          })),
          edges: (selectedEdges || []).map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
          })),
          topologicalRole,
        },
        graphState: {
          nodes: nodes.map(n => ({
            id: n.id,
            type: n.data?.type || n.type,
            label: n.data?.label || n.data?.name || n.id,
            tool: n.data?.tool || n.data?.toolId || null,
            executor: n.data?.executor || null,
            config: n.data?.config || null,
            parameters: n.parameters || null,
            toolRef: n.data?.toolRef || null,
            isToolRef: n.data?.isToolRef || false,
            position: n.position || null,
          })),
          edges: edges.map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
            label: e.label || e.data?.condition || null,
            type: e.type || null,
          })),
          isEmpty: nodes.length === 0,
          graphId: catalogGraphId || null,
        },
      };

      const response = await fetch(`${API_BASE_URL}/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === 'chunk') {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId
                  ? { ...m, content: m.content + event.text }
                  : m
              ));
            } else if (event.type === 'done') {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId
                  ? {
                    ...m,
                    content: event.text || m.content,
                    actions: event.actions || [],
                    rationale: event.rationale || null,
                    lessons: event.lessons || [],
                    isStreaming: false,
                  }
                  : m
              ));
              if (event.sessionId) setSessionId(event.sessionId);
              // Clear processing statuses after 5s
              setTimeout(() => {
                setFilterStatus(null);
                setCatalogStatus(null);
                setReuseStatus(null);
                setRetryStatus(null);
              }, 5000);
            } else if (event.type === 'filter_applied') {
              setFilterStatus({
                domain: event.domain,
                confidence: event.confidence,
                toolsProvided: event.toolsProvided,
                toolsTotal: event.toolsTotal,
                reduction: event.reduction ?? (event.toolsTotal ? Math.round((1 - event.toolsProvided / event.toolsTotal) * 100) : 0),
              });
            } else if (event.type === 'catalog_search') {
              setCatalogStatus({
                strategy: event.strategy,
                score: event.score,
                candidatesCount: event.candidatesCount,
                recommendation: event.recommendation,
              });
            } else if (event.type === 'reuse_suggestion') {
              setReuseStatus({
                action: event.action,
                graphId: event.graphId,
                graphName: event.graphName,
                nodeCount: event.nodeCount,
                message: event.message,
              });
            } else if (event.type === 'status' && event.message) {
              // Retry / overload status
              setRetryStatus({ attempt: 1, delay: 5000, reason: event.message });
              setTimeout(() => setRetryStatus(null), 8000);
            } else if (event.type === 'error') {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId
                  ? {
                    ...m,
                    content: m.content || `Ошибка: ${event.error}`,
                    isStreaming: false,
                    isError: true,
                  }
                  : m
              ));
              setFilterStatus(null);
              setCatalogStatus(null);
              setReuseStatus(null);
              setRetryStatus(null);
            }
          } catch (_) {
            // Skip non-JSON
          }
        }
      }

      // Mark streaming done (in case no 'done' event received)
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId && m.isStreaming
          ? { ...m, isStreaming: false }
          : m
      ));

    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? {
            ...m,
            content: `Ошибка: ${err.message}`,
            isStreaming: false,
            isError: true,
          }
          : m
      ));
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, catalogGraphId, nodes, edges, selectedNodes, selectedEdges, topologicalRole, isLoading]);

  // Keep ref in sync for cross-callback access
  sendMessageRef.current = sendMessage;

  // ── Apply an action to the canvas ──
  const handleApplyAction = useCallback((action, index) => {
    if (onApplyAction) {
      onApplyAction(action);
    } else {
      // Direct manipulation via setNodes/setEdges
      switch (action.type) {
        case 'ADD_NODE': {
          setNodes?.(prev => {
            const pos = action.position || getNextPosition(prev);
            const executorType = action.node.type || 'workflow.start';
            return [...prev, {
              id: action.node.id,
              type: 'graphNode',
              position: pos,
              data: {
                ...action.node,
                label: action.node.label || action.node.id,
                executorType,
                toolRef: executorType,
                kind: executorType.startsWith('workflow.start') ? 'input'
                  : executorType.startsWith('workflow.end') ? 'output'
                  : executorType.startsWith('workflow.condition') ? 'condition'
                  : 'executor',
                status: 'idle',
                params: action.node.params || {},
              },
            }];
          });
          break;
        }
        case 'REMOVE_NODE': {
          const nodeId = action.nodeId || action.node?.id;
          setNodes?.(prev => prev.filter(n => n.id !== nodeId));
          setEdges?.(prev => prev.filter(e => e.source !== nodeId && e.target !== nodeId));
          break;
        }
        case 'ADD_EDGE': {
          setEdges?.(prev => [...prev, {
            id: action.edgeId || `e-${action.source}-${action.target}`,
            source: action.source,
            target: action.target,
            sourceHandle: action.sourceHandle,
            targetHandle: action.targetHandle,
            label: action.label,
          }]);
          break;
        }
        case 'REMOVE_EDGE': {
          if (action.edgeId) {
            setEdges?.(prev => prev.filter(e => e.id !== action.edgeId));
          } else {
            setEdges?.(prev => prev.filter(e => !(e.source === action.source && e.target === action.target)));
          }
          break;
        }
        case 'UPDATE_NODE': {
          const nodeId = action.nodeId || action.node?.id;
          setNodes?.(prev => prev.map(n =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, ...action.updates, ...(action.node || {}) } }
              : n
          ));
          break;
        }
        case 'INSERT_BETWEEN': {
          const pos = { x: 200 + Math.random() * 200, y: 150 + Math.random() * 200 };
          const ibExecutorType = action.node.type || action.node.executorType || 'workflow.task';
          setNodes?.(prev => [...prev, {
            id: action.node.id,
            type: 'graphNode',
            position: pos,
            data: {
              ...action.node,
              label: action.node.label || action.node.id,
              executorType: ibExecutorType,
              toolRef: ibExecutorType,
              kind: 'executor',
              status: 'idle',
              params: action.node.params || {},
            },
          }]);
          setEdges?.(prev => {
            const filtered = prev.filter(e =>
              !(e.source === action.insertAfter && e.target === action.insertBefore)
            );
            return [
              ...filtered,
              { id: `e-${action.insertAfter}-${action.node.id}`, source: action.insertAfter, target: action.node.id },
              { id: `e-${action.node.id}-${action.insertBefore}`, source: action.node.id, target: action.insertBefore },
            ];
          });
          break;
        }
        case 'BATCH': {
          (action.actions || []).forEach(sub => handleApplyAction(sub, 0));
          break;
        }
        case 'EXECUTE_GRAPH': {
          executeGraph(action);
          break;
        }
        default:
          console.warn('[GXEAssistant] Unknown action type:', action.type);
      }
    }
    setAppliedActions(prev => new Set([...prev, index]));

    // Auto-layout after adding nodes (deferred to let React commit)
    if (action.type === 'ADD_NODE' || action.type === 'BATCH' || action.type === 'INSERT_BETWEEN') {
      requestAnimationFrame(() => {
        setNodes?.(currentNodes => {
          const laid = relayoutGraph(currentNodes, edgesRef.current);
          return laid;
        });
      });
    }
  }, [onApplyAction, setNodes, setEdges, getNextPosition, executeGraph, relayoutGraph]);

  // ── Relayout graph using topological sort ──
  const handleRelayout = useCallback(() => {
    setNodes?.(currentNodes => {
      const laid = relayoutGraph(currentNodes, edges);
      return laid;
    });
  }, [setNodes, edges, relayoutGraph]);

  // ── Auto-fix: validate after apply, send errors to assistant for self-correction ──
  const autoFixRef = useRef(0);
  const autoFixLastTs = useRef(0);
  const MAX_AUTO_FIX = 3;
  const AUTO_FIX_COOLDOWN_MS = 5000; // min 5s between auto-fix messages

  const triggerAutoFix = useCallback((currentNodes, currentEdges) => {
    if (autoFixRef.current >= MAX_AUTO_FIX) {
      autoFixRef.current = 0;
      return;
    }

    // Cooldown — prevent rapid-fire duplicate messages
    const now = Date.now();
    if (now - autoFixLastTs.current < AUTO_FIX_COOLDOWN_MS) return;

    const getType = (n) => n.data?.type || n.data?.executorType || n.type;
    const validationIssues = [];

    const startNodes = currentNodes.filter(n => getType(n) === 'workflow.start');
    if (startNodes.length === 0) validationIssues.push('Нет workflow.start');
    if (startNodes.length > 1) validationIssues.push(`${startNodes.length} workflow.start — должен быть один`);

    const endNodes = currentNodes.filter(n => getType(n) === 'workflow.end');
    if (endNodes.length === 0) validationIssues.push('Нет workflow.end');

    for (const node of currentNodes) {
      if (getType(node) === 'workflow.start') continue;
      const hasIn = currentEdges.some(e => e.target === node.id);
      if (!hasIn) {
        validationIssues.push(`Узел ${node.data?.label || node.id} (${getType(node)}) — нет входящего ребра`);
      }
    }

    for (const node of currentNodes.filter(n => getType(n) === 'workflow.condition')) {
      const outgoing = currentEdges.filter(e => e.source === node.id);
      if (outgoing.length < 2) {
        validationIssues.push(`${node.data?.label || node.id} (condition) — нет обоих исходов true/false`);
      }
    }

    if (validationIssues.length === 0) {
      // Validation passed — just log, don't auto-send to LLM (avoids loop)
      autoFixRef.current = 0;
      setMessages(prev => [...prev, {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: 'system',
        content: '✅ Граф прошёл валидацию.',
        timestamp: new Date().toISOString(),
      }]);
      return;
    }

    autoFixRef.current++;
    autoFixLastTs.current = now;
    const errorMsg = `[AUTO-VALIDATION] Граф содержит ${validationIssues.length} ошибок после применения действий:\n` +
      validationIssues.map((e, i) => `${i + 1}. ${e}`).join('\n') +
      '\n\nИсправь эти ошибки. Эмитируй %%LESSON%% блок с описанием причины ошибки, затем %%ACTION%% блоки для исправления.';

    setTimeout(() => sendMessageRef.current?.(errorMsg), 300);
  }, []);

  // ── Undo ──
  const handleUndo = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE_URL}/assistant/undo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const data = await resp.json();
      if (data.success && data.action) {
        handleApplyAction(data.action, -1);
      }
    } catch (err) {
      console.error('[GXEAssistant] Undo error:', err);
    }
  }, [sessionId, handleApplyAction]);

  // ── Reset session ──
  const handleReset = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/assistant/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
    } catch (_) {}

    const newId = catalogGraphId ? `graph-${catalogGraphId}-${Date.now()}` : generateSessionId();
    setSessionId(newId);
    setMessages([{
      id: 'welcome-reset',
      role: 'assistant',
      content: 'Сессия сброшена. Опишите граф, который хотите создать.',
      timestamp: new Date().toISOString(),
      actions: [],
    }]);
    setAppliedActions(new Set());
  }, [sessionId, catalogGraphId]);

  // ── Key handler ──
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  }, [inputValue, sendMessage]);

  const timeStr = (ts) => {
    try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  };

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      {/* Status Bar */}
      <div style={{width: "100%"}} className="flex items-center gap-2 px-3 py-1.5 border-b border-[#21262d] text-[10px]">
        <Bot size={12} className="text-indigo-400" />
        <span className="text-gray-400 font-medium">GXE AI Assistant</span>
        <span className="text-gray-600">·</span>
        <span className="text-gray-500">
          <Network size={9} className="inline mr-0.5" />
          {nodes.length} узлов, {edges.length} рёбер
        </span>
        {nodes.length > 0 && (
          <>
            <span className="text-gray-600">·</span>
            {isValid
              ? <span className="text-green-500"><CheckCircle2 size={9} className="inline mr-0.5" />валиден</span>
              : <span className="text-red-400"><AlertCircle size={9} className="inline mr-0.5" />{errors.length} ош., {warnings.length} пред.</span>
            }
          </>
        )}
        {selectionSummary && (
          <>
            <span className="text-gray-600">·</span>
            <span className="text-indigo-400">{selectionSummary}</span>
          </>
        )}
        <div className="flex-1" style={{width: "100%"}} />
        {nodes.length > 1 && (
          <button
            onClick={handleRelayout}
            className="p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-[#21262d] transition-colors"
            title="Auto Layout"
          >
            <LayoutGrid size={11} />
          </button>
        )}
        <button
          onClick={handleUndo}
          className="p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-[#21262d] transition-colors"
          title="Отменить"
        >
          <Undo2 size={11} />
        </button>
        <button
          onClick={handleReset}
          className="p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-[#21262d] transition-colors"
          title="Сброс сессии"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* AI Processing Status */}
      <AssistantStatusBar
        filterStatus={filterStatus}
        catalogStatus={catalogStatus}
        reuseStatus={reuseStatus}
        retryStatus={retryStatus}
        isProcessing={isLoading}
      />

      {/* Messages */}
      <div style={{width: "100%"}} className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {messages.map(msg => {
          const isUser = msg.role === 'user';
          const isExecution = msg.role === 'execution';
          return (
            <div key={msg.id} className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
              {!isUser && (
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  isExecution ? 'bg-emerald-600/20' : 'bg-indigo-600/20'
                }`}>
                  {msg.isError
                    ? <AlertCircle size={12} className="text-red-400" />
                    : isExecution
                      ? <Activity size={12} className="text-emerald-400" />
                      : <Bot size={12} className="text-indigo-400" />
                  }
                </div>
              )}
              <div className={`max-w-[85%] ${isUser ? 'ml-auto' : ''}`}>
                {/* Execution progress card */}
                {isExecution && <ExecutionCard msg={msg} />}
                {/* Regular message bubble */}
                {!isExecution && (
                  <>
                    <div className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
                      isUser
                        ? 'bg-indigo-600 text-white rounded-br-sm'
                        : msg.isError
                          ? 'bg-red-500/10 text-red-300 border border-red-500/20 rounded-bl-sm'
                          : 'bg-[#21262d] text-gray-300 rounded-bl-sm'
                    }`}>
                      {formatContent(msg.content)}
                      {msg.isStreaming && (
                        <span className="inline-block ml-1">
                          <span className="inline-flex gap-0.5">
                            <span className="w-1 h-1 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1 h-1 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1 h-1 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </span>
                        </span>
                      )}
                    </div>

                    {/* Rationale block */}
                    {msg.rationale && (
                      <div className="mt-1 px-2 py-1.5 rounded border border-indigo-500/20 bg-indigo-900/10 text-[10px] text-indigo-200/80" style={{width: "100%"}}>
                        <div className="flex items-center gap-1 text-[9px] text-indigo-400 font-semibold mb-0.5">
                          <span>💡</span> Обоснование решения
                        </div>
                        <div className="whitespace-pre-wrap">{msg.rationale}</div>
                      </div>
                    )}

                    {/* Lesson blocks */}
                    {msg.lessons?.length > 0 && (
                      <div className="mt-1 space-y-1" style={{width: "100%"}}>
                        {msg.lessons.map((lesson, li) => (
                          <div key={li} className="px-2 py-1.5 rounded border border-yellow-500/20 bg-yellow-900/10 text-[10px] text-yellow-200/80">
                            <div className="flex items-center gap-1 text-[9px] text-yellow-400 font-semibold mb-0.5">
                              <span>📝</span> Урок: {lesson.errorType}
                            </div>
                            <div>{lesson.description}</div>
                            {lesson.rule && <div className="mt-0.5 text-yellow-300/70 italic">Правило: {lesson.rule}</div>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Action cards */}
                    {msg.actions?.length > 0 && (
                      <div className="space-y-1 mt-1" style={{width: "100%"}} >
                        {msg.actions.map((action, idx) => {
                          const globalIdx = `${msg.id}-${idx}`;
                          return (
                            <ActionCard
                              key={idx}
                              action={action}
                              index={globalIdx}
                              onApply={(a) => handleApplyAction(a, globalIdx)}
                              applied={appliedActions.has(globalIdx)}
                            />
                          );
                        })}
                        {msg.actions.length > 1 && !msg.actions.every((_, i) => appliedActions.has(`${msg.id}-${i}`)) && (
                          <button
                            className="w-full flex items-center justify-center gap-1 px-2 py-1 mt-1 rounded text-[10px] bg-indigo-600/10 text-indigo-300 hover:bg-indigo-600/20 border border-indigo-500/20 transition-colors"
                            onClick={() => {
                              msg.actions.forEach((a, i) => {
                                const gIdx = `${msg.id}-${i}`;
                                if (!appliedActions.has(gIdx)) handleApplyAction(a, gIdx);
                              });
                              requestAnimationFrame(() => {
                                handleRelayout();
                                setTimeout(() => {
                                  setNodes?.(curNodes => {
                                    setEdges?.(curEdges => {
                                      triggerAutoFix(curNodes, curEdges);
                                      return curEdges;
                                    });
                                    return curNodes;
                                  });
                                }, 200);
                              });
                            }}
                          >
                            <Zap size={10} />
                            Применить все ({msg.actions.length})
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}

                <div className={`text-[9px] text-gray-600 mt-1 ${isUser ? 'text-right' : ''}`}>
                  {timeStr(msg.timestamp)}
                </div>
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Validation Bar */}
      {nodes.length > 0 && issues.length > 0 && (
        <div style={{width: "100%"}} className="px-3 py-1.5 border-t border-[#21262d] bg-[#161b22] text-[10px] space-y-0.5 max-h-16 overflow-y-auto">
          {errors.map((e, i) => (
            <div key={`e-${i}`} className="flex items-center gap-1 text-red-400">
              <AlertCircle size={9} className="flex-shrink-0" />
              <span>{e.message}</span>
            </div>
          ))}
          {warnings.map((w, i) => (
            <div style={{width: "100%"}} key={`w-${i}`} className="flex items-center gap-1 text-yellow-500">
              <AlertCircle size={9} className="flex-shrink-0" />
              <span>{w.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{width: "100%"}} className="flex items-center gap-2 px-3 py-2 border-t border-[#30363d] bg-[#0d1117]">
        <textarea
          ref={inputRef}
          className="flex-1 bg-transparent text-xs text-gray-200 placeholder-gray-600 outline-none resize-none"
          rows={1}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Опишите граф или задайте вопрос..."
          disabled={isLoading}
        />
        <button
          className="p-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => sendMessage(inputValue)}
          disabled={isLoading || !inputValue.trim()}
          title="Отправить (Enter)"
        >
          {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
        </button>
      </div>
    </div>
  );
};

export default GXEAssistantTab;
