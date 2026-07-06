import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import FormRenderer from '../../../components/Forms/FormRenderer';
import { waitingNodeToFormDefinition, extractFormResponse, isStructuralNode } from './waitingNodeToForm.js';
import {
  Send, User, Bot, Shield, Building2, Globe, MapPin,
  Clock, CheckCircle2, AlertCircle, ChevronDown, Loader2, Zap,
  ListOrdered, Play, ArrowRight, FileText, CircleDot, Timer,
  GitBranch, Database, Copy, Check, RotateCcw
} from 'lucide-react';
import './flowdesk.css';

const API_BASE = '/api/v1/flowdesk';

const DEMO_USERS = [
  { id: 'AC8152B9-DDC7-4C8E-AD8C-15A60B1611AF', name: 'Alex Wani', label: 'UNDSS Sudan' },
  { id: '1D33EC61-C9D7-4E5D-AFDB-003799C0F1DE', name: 'Merce Llopis', label: 'UNLB Brindisi' },
  { id: '6B2594A9-A313-45EB-912B-001D83AA4D07', name: 'Rachel O\'Hanlon', label: 'UNIFIL Lebanon' },
  { id: '68F9A53E-6983-43E4-AA49-0139A8E657F3', name: 'Donika Gjaka', label: 'UNMIK Kosovo' },
  { id: '2E258D8A-9A49-4450-9154-001DC4945C45', name: 'Kristoffer Width', label: 'UNTSO' },
  { id: 'C8ED1196-7EBF-4D3D-B509-01D71C5E8A02', name: 'Fares Bendahmane', label: 'MINURSO' },
];

const CONFIDENCE_CONFIG = {
  high:         { color: '#22c55e', bg: '#22c55e20', label: 'HIGH' },
  medium:       { color: '#eab308', bg: '#eab30820', label: 'MEDIUM' },
  low:          { color: '#f97316', bg: '#f9731620', label: 'LOW' },
  unclassified: { color: '#ef4444', bg: '#ef444420', label: 'UNCLASSIFIED' },
};

/**
 * FlowDeskFormWidget — renders FormRenderer for waiting graph nodes.
 * Shows inline form with choices (select) or text input based on node config.
 */
function FlowDeskFormWidget({ waitingNode, choices, sessionState, loading, onSubmit, onChoiceClick }) {
  const structural = isStructuralNode(waitingNode);

  const formDef = useMemo(
    () => structural ? null : waitingNodeToFormDefinition(waitingNode, sessionState),
    [waitingNode, sessionState, structural]
  );

  const structuralNodeData = useMemo(
    () => structural ? (waitingNode?.data || waitingNode) : null,
    [waitingNode, structural]
  );

  const handleFormSubmit = useCallback((formData) => {
    if (structural) {
      // STRUCTURAL forms submit all fields directly
      onSubmit(formData);
    } else {
      const value = extractFormResponse(formData);
      if (value) onSubmit(value);
    }
  }, [onSubmit, structural]);

  if (!formDef && !structural) return null;

  // If choices exist and are simple buttons (3 or fewer), show as button group
  if (choices && choices.length > 0 && choices.length <= 6 && !choices.some(c => c.disabled)) {
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 13, color: '#6366f1', fontWeight: 600, marginBottom: 6 }}>
          {waitingNode.label}
        </div>
        {waitingNode.prompt && waitingNode.prompt !== waitingNode.label && (
          <div style={{ fontSize: 13, color: '#999', marginBottom: 8 }}>{waitingNode.prompt}</div>
        )}
        <div className="fd-choices">
          {choices.map((choice, ci) => (
            <button
              key={ci}
              className={`fd-choice-btn fd-choice-${choice.variant || 'default'} ${choice.selected ? 'fd-choice-selected' : ''}`}
              onClick={() => onChoiceClick(choice)}
              disabled={loading}
            >
              {choice.selected && <CheckCircle2 size={13} />}
              {choice.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Full form for text input, search, STRUCTURAL, or complex forms
  const formStyle = { marginTop: 8, padding: '10px 14px', background: 'rgba(99,102,241,0.06)', borderRadius: 10, border: '1px solid rgba(99,102,241,0.15)' };
  const formSx = { '& .MuiTypography-h6': { fontSize: 13, fontWeight: 600, color: '#6366f1' }, '& .MuiTypography-body2': { fontSize: 13 }, '& .MuiButton-contained': { fontSize: 13, py: 0.5, px: 2 } };

  return (
    <div style={formStyle}>
      <FormRenderer
        formDefinition={structural ? undefined : formDef}
        structuralNodeData={structuralNodeData}
        mode="EMBEDDED"
        onSubmit={handleFormSubmit}
        submitLabel="Send"
        showCancel={false}
        disabled={loading}
        layout="vertical"
        spacing={1}
        sx={formSx}
      />
    </div>
  );
}

function ExecutionLogEntry({ entry, index }) {
  const [expanded, setExpanded] = React.useState(false);
  const statusIcon = entry.status === 'success' ? <CheckCircle2 size={13} style={{ color: '#22c55e' }} />
    : entry.status === 'waiting' ? <Clock size={13} style={{ color: '#f59e0b' }} />
    : entry.status === 'error' ? <AlertCircle size={13} style={{ color: '#ef4444' }} />
    : <ArrowRight size={13} style={{ color: '#888' }} />;

  const kindColors = { input: '#3b82f6', executor: '#8b5cf6', condition: '#f59e0b', output: '#22c55e' };
  const kindColor = kindColors[entry.kind] || '#888';

  return (
    <div className="fd-log-phase fade-in" style={{ animationDelay: `${index * 60}ms` }}>
      <div
        className="fd-log-phase-header"
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setExpanded(!expanded)}
      >
        {statusIcon}
        <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{entry.label || entry.node}</span>
        <span style={{ fontSize: 11, color: kindColor, background: kindColor + '22', padding: '1px 6px', borderRadius: 3, fontWeight: 600 }}>
          {entry.kind}
        </span>
        {entry.tool && (
          <span style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>{entry.tool}</span>
        )}
        {entry.elapsed_ms != null && (
          <span style={{ fontSize: 11, color: '#666' }}>{entry.elapsed_ms}ms</span>
        )}
        {entry.condition && (
          <span style={{ fontSize: 11, color: entry.condition === 'true' ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
            {entry.condition}
          </span>
        )}
        {entry.waitForInput && (
          <span style={{ fontSize: 11, color: '#f59e0b', background: '#f59e0b22', padding: '1px 4px', borderRadius: 3 }}>WAIT</span>
        )}
        <ChevronDown size={12} style={{ color: '#666', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </div>

      {expanded && (
        <div style={{ padding: '6px 8px 8px 24px', fontSize: 12, color: '#aaa', borderLeft: `2px solid ${kindColor}33`, marginLeft: 6, marginBottom: 4 }}>
          <div style={{ marginBottom: 4 }}>
            <span style={{ color: '#666', fontWeight: 600 }}>Node:</span> {entry.node} | <span style={{ color: '#666', fontWeight: 600 }}>Tool:</span> {entry.tool || 'none'}
          </div>

          {entry.inputState && Object.keys(entry.inputState).length > 0 && (
            <div style={{ marginBottom: 4 }}>
              <div style={{ color: '#3b82f6', fontWeight: 600, marginBottom: 2 }}>Input State:</div>
              <pre style={{ margin: 0, fontSize: 11, color: '#999', background: '#0d1117', padding: 4, borderRadius: 3, overflow: 'auto', maxHeight: 120, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {JSON.stringify(entry.inputState, null, 2)}
              </pre>
            </div>
          )}

          {entry.output && (
            <div style={{ marginBottom: 4 }}>
              <div style={{ color: '#22c55e', fontWeight: 600, marginBottom: 2 }}>Output:</div>
              <pre style={{ margin: 0, fontSize: 11, color: '#999', background: '#0d1117', padding: 4, borderRadius: 3, overflow: 'auto', maxHeight: 120, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {JSON.stringify(entry.output, null, 2)}
              </pre>
            </div>
          )}

          {entry.error && (
            <div style={{ color: '#ef4444' }}>
              <span style={{ fontWeight: 600 }}>Error:</span> {entry.error}
              {entry.errorDetails && <div style={{ fontSize: 11 }}>{entry.errorDetails}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GraphIdRow({ id }) {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(id).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  return (
    <div className="fd-routing-row" style={{ alignItems: 'center' }}>
      <span className="fd-routing-label">Graph ID</span>
      <span className="fd-routing-value" style={{ fontSize: 11, fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }} title={id}>{id}</span>
      <button onClick={handleCopy} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, marginLeft: 4, color: copied ? '#22c55e' : '#888' }} title="Copy ID">
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </div>
  );
}

function ConfidenceBadge({ level, score }) {
  const cfg = CONFIDENCE_CONFIG[level] || CONFIDENCE_CONFIG.unclassified;
  return (
    <span className="fd-confidence-badge" style={{ color: cfg.color, background: cfg.bg }}>
      {cfg.label} {score != null && `(${(score * 100).toFixed(0)}%)`}
    </span>
  );
}

function ScopeBadge({ scope }) {
  const isLocal = scope === 'mission' || scope === 'regional';
  return (
    <span className={`fd-scope-badge ${isLocal ? 'fd-scope-local' : 'fd-scope-global'}`}>
      {isLocal ? <MapPin size={12} /> : <Globe size={12} />}
      {scope}
    </span>
  );
}

function MethodBadge({ method, latency }) {
  const isKw = method === 'keyword';
  return (
    <span className={`fd-method-badge ${isKw ? 'fd-method-kw' : 'fd-method-sem'}`}>
      {isKw ? <Zap size={11} /> : <CircleDot size={11} />}
      {method} {latency != null && `(${latency}ms)`}
    </span>
  );
}

export default function FlowDeskDemo() {
  const [selectedUser, setSelectedUser] = useState(DEMO_USERS[0]);
  const [userContext, setUserContext] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [workflowResult, setWorkflowResult] = useState(null);
  const [executionLog, setExecutionLog] = useState([]);
  const [dialogState, setDialogState] = useState({});
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [systemHealth, setSystemHealth] = useState(null);
  const [sideTab, setSideTab] = useState('overview');
  const [sessionId, setSessionId] = useState(() => 'sess-' + Math.random().toString(36).slice(2, 10));
  const [graphVersions, setGraphVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null); // null = latest
  const [versionDropdownOpen, setVersionDropdownOpen] = useState(false);
  const [graphInfo, setGraphInfo] = useState(null);
  const [selectedGraphId, setSelectedGraphId] = useState('c39d8ac5-a25f-483c-b9ee-bd01433f11f5');
  const [catalogGraphs, setCatalogGraphs] = useState([]);
  const [graphSearch, setGraphSearch] = useState('');
  const [graphDropdownOpen, setGraphDropdownOpen] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const GRAPH_ID = selectedGraphId;

  // Load graph catalog for selector
  useEffect(() => {
    fetch('/api/v1/graph-catalog?limit=100').then(r => r.json()).then(data => {
      const graphs = (data.data || []).filter(g => g.nodes?.length > 0 || g.nodeCount > 0);
      setCatalogGraphs(graphs);
    }).catch(() => null);
  }, []);

  // Load graph info when selected graph changes
  useEffect(() => {
    if (!selectedGraphId) return;
    fetch(`/api/v1/graph-catalog/${selectedGraphId}`).then(r => r.json()).then(data => {
      setGraphInfo(data.data || data);
    }).catch(() => setGraphInfo(null));
    // Reset session when graph changes
    setSessionId('sess-' + Math.random().toString(36).slice(2, 10));
    setExecutionLog([]);
    setLastResult(null);
    setWorkflowResult(null);
    setDialogState({});
    // Fetch graph name for welcome message
    fetch(`/api/v1/graph-catalog/${selectedGraphId}`).then(r => r.json()).then(gData => {
      const g = gData.data || gData;
      setMessages([{
        role: 'bot',
        text: `Graph loaded: **${g.name || selectedGraphId}** (${g.namespace || '?'}, ${g.nodeCount || g.nodes?.length || '?'} nodes, v${g.currentVersion || 1}).\n\nYou are logged in as **${selectedUser.name}** (${selectedUser.label}). How can I help you?`,
      }]);
    }).catch(() => {
      setMessages([{ role: 'bot', text: `Graph **${selectedGraphId}** loaded. How can I help you?` }]);
    });
  }, [selectedGraphId]);

  // Load graph versions
  useEffect(() => {
    fetch(`${API_BASE}/graph-versions`).then(r => r.json()).then(data => {
      setGraphVersions(data.versions || []);
    }).catch(() => null);
  }, []);

  const loadUserContext = useCallback(async (user) => {
    try {
      const res = await fetch(`${API_BASE}/user/${user.id}/context`);
      const data = await res.json();
      setUserContext(data);
    } catch (err) {
      console.error('Failed to load user context:', err);
    }
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/health`).then(r => r.json()).then(setSystemHealth).catch(() => null);
  }, []);

  useEffect(() => {
    loadUserContext(selectedUser);
    setMessages([{
      role: 'bot',
      text: `Welcome! I'm the FlowDesk AI Assistant. You are logged in as **${selectedUser.name}** (${selectedUser.label}). How can I help you today?`,
    }]);
    setLastResult(null);
    setWorkflowResult(null);
    setExecutionLog([]);
  }, [selectedUser, loadUserContext]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Build execution log from route + workflow results
  const buildExecutionLog = (routeData, wfData) => {
    const log = [];
    const ts = () => new Date().toISOString();

    // Phase 1: Classification
    log.push({
      phase: 'Classification',
      icon: 'shield',
      entries: [
        {
          step: 'Intent Analysis',
          method: routeData.classification?.method || 'semantic',
          result: routeData.classification?.service_code,
          detail: routeData.classification?.service_name,
          latency: routeData.classification?.latency_ms,
          confidence: routeData.classification?.confidence,
          score: routeData.classification?.confidence_score,
          status: 'success',
          timestamp: ts(),
        },
        ...(routeData.classification?.alternatives || []).map(alt => ({
          step: 'Alternative',
          result: alt.service_code,
          detail: alt.service_name,
          score: alt.score,
          status: 'info',
        })),
      ],
    });

    // Phase 2: Routing
    log.push({
      phase: 'Routing',
      icon: 'building',
      entries: [
        {
          step: 'Handler Resolution',
          result: routeData.handler?.code,
          detail: routeData.handler?.name,
          scope: routeData.handler?.scope,
          priority: routeData.handler?.priority,
          status: 'success',
          timestamp: ts(),
        },
        {
          step: 'User Context',
          result: routeData.userContext?.orgUnit,
          detail: [routeData.userContext?.dutyStation, routeData.userContext?.country].filter(Boolean).join(', '),
          status: 'info',
        },
      ],
    });

    // Phase 3: Workflow Execution (if spawned)
    if (wfData && wfData.history) {
      log.push({
        phase: 'Workflow Execution',
        icon: 'play',
        graphId: wfData.graphId || routeData.service?.gxeGraphId,
        graphName: wfData.graphName || 'Laptop Request Workflow',
        workflowId: wfData.workflowId,
        status: wfData.status,
        entries: wfData.history.map(h => ({
          step: h.node,
          executor: h.executor,
          result: h.success ? 'OK' : 'FAILED',
          condition: h.condition,
          latency: h.elapsed_ms,
          status: h.success ? 'success' : 'error',
          timestamp: h.timestamp,
        })),
      });

      // Phase 4: Result
      const sr = wfData.result?.['N3-CREATE-SR'];
      const wo = wfData.result?.['N7-WORK-ORD'];
      const notification = wfData.result?.['N10-NOTIFY-A'];
      log.push({
        phase: 'Result',
        icon: 'file',
        entries: [
          sr && { step: 'Service Request', result: sr.requestId, detail: `Status: ${sr.status}`, status: 'success' },
          wo && { step: 'Work Order', result: wo.workOrderId, detail: `SLA: ${wo.slaHours}h, Due: ${new Date(wo.dueDate).toLocaleDateString()}`, status: 'success' },
          notification && { step: 'Notification', result: 'Sent', detail: notification.notification?.data?.message?.slice(0, 80), status: 'success' },
        ].filter(Boolean),
      });
    }

    return log;
  };

  const sendFormValue = useCallback((value) => {
    if (!value || loading) return;
    setMessages(prev => [...prev, { role: 'user', text: value }]);
    setLoading(true);

    fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, userId: selectedUser.id, message: value, graphVersion: selectedVersion, graphId: GRAPH_ID }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) { setMessages(prev => [...prev, { role: 'bot', text: `Error: ${data.error}`, isError: true }]); return; }
        setDialogState(data.state || {});
        setLastResult({ classification: data.state?.intent ? { service_code: data.state.intent } : null });
        if (data.executionLog) setExecutionLog(data.executionLog);
        if (data.spawnResult) { setWorkflowResult(data.spawnResult); setSideTab('log'); }
        if (data.response) {
          const wn = data.executionLog?.find(e => e.status === 'waiting');
          setMessages(prev => [...prev, { role: 'bot', text: data.response, choices: data.choices || null, waitingNode: wn ? { nodeId: wn.node, label: wn.label, prompt: wn.inputState?.prompt, inputType: wn.inputState?.inputType || 'text', choices: wn.inputState?.choices } : null }]);
        }
      })
      .catch(err => setMessages(prev => [...prev, { role: 'bot', text: `Error: ${err.message}`, isError: true }]))
      .finally(() => setLoading(false));
  }, [loading, sessionId, selectedUser, selectedVersion, selectedGraphId]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text }]);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, userId: selectedUser.id, message: text, graphVersion: selectedVersion, graphId: GRAPH_ID }),
      });
      const data = await res.json();

      if (data.error) {
        setMessages(prev => [...prev, { role: 'bot', text: `Error: ${data.error}`, isError: true }]);
        return;
      }

      // Update dialog state for overview panel
      setDialogState(data.state || {});
      setLastResult({
        classification: data.state?.intent ? {
          service_code: data.state.intent,
          service_name: data.state.service_name,
          confidence: 'high',
        } : null,
      });

      // Update execution log (enriched with node details, state, output)
      if (data.executionLog) {
        setExecutionLog(data.executionLog);
      }

      // If workflow was spawned, capture it
      if (data.spawnResult) {
        setWorkflowResult(data.spawnResult);
        setSideTab('log');
      }

      // Add bot response (with choices if any)
      if (data.response) {
        // Build waiting node info for form rendering
        const waitingNode = data.executionLog?.find(e => e.status === 'waiting');
        setMessages(prev => [...prev, {
          role: 'bot',
          text: data.response,
          choices: data.choices || null,
          waitingNode: waitingNode ? {
            nodeId: waitingNode.node,
            label: waitingNode.label,
            prompt: waitingNode.inputState?.prompt,
            inputType: waitingNode.inputState?.inputType || 'text',
            choices: waitingNode.inputState?.choices,
          } : null,
        }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'bot', text: `Error: ${err.message}`, isError: true }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChoiceClick = (choice) => {
    if (loading) return;
    // Disable choices on the message that had them (mark as used)
    setMessages(prev => prev.map(msg =>
      msg.choices ? { ...msg, choices: msg.choices.map(c => ({ ...c, disabled: true, selected: c.value === choice.value })) } : msg
    ));
    // Send choice value as user message
    setInput(choice.value);
    setTimeout(() => {
      setInput('');
      setMessages(prev => [...prev, { role: 'user', text: choice.label }]);
      setLoading(true);
      // Call chat API directly with choice value
      fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, userId: selectedUser.id, message: choice.value, graphVersion: selectedVersion, graphId: GRAPH_ID }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.error) {
            setMessages(prev => [...prev, { role: 'bot', text: `Error: ${data.error}`, isError: true }]);
            return;
          }
          setDialogState(data.state || {});
          setLastResult({
            classification: data.state?.intent ? { service_code: data.state.intent, service_name: data.state.service_name, confidence: 'high' } : null,
          });
          if (data.executionLog) setExecutionLog(data.executionLog);
          if (data.spawnResult) { setWorkflowResult(data.spawnResult); setSideTab('log'); }
          if (data.response) {
            const wn = data.executionLog?.find(e => e.status === 'waiting');
            setMessages(prev => [...prev, { role: 'bot', text: data.response, choices: data.choices || null, waitingNode: wn ? { nodeId: wn.node, label: wn.label, prompt: wn.inputState?.prompt, inputType: wn.inputState?.inputType || 'text', choices: wn.inputState?.choices } : null }]);
          }
        })
        .catch(err => setMessages(prev => [...prev, { role: 'bot', text: `Error: ${err.message}`, isError: true }]))
        .finally(() => setLoading(false));
    }, 0);
  };

  const selectUser = (user) => {
    setSelectedUser(user);
    setUserDropdownOpen(false);
  };

  const classification = lastResult?.classification;
  const handler = lastResult?.handler;

  return (
    <div className="fd-container">
      {/* Header */}
      <div className="fd-header">
        <div className="fd-header-left">
          <Zap size={20} className="fd-logo" />
          <h1>FlowDesk AI Intake</h1>
          {systemHealth && (
            <div className="fd-health-dots">
              <span className={`fd-dot ${systemHealth.qdrant === 'ok' ? 'fd-dot-ok' : 'fd-dot-err'}`} title="Qdrant" />
              <span className={`fd-dot ${systemHealth.memgraph === 'ok' ? 'fd-dot-ok' : 'fd-dot-err'}`} title="Memgraph" />
              <span className={`fd-dot ${systemHealth.tei === 'ok' ? 'fd-dot-ok' : 'fd-dot-err'}`} title="TEI" />
            </div>
          )}
        </div>
        {/* Graph Selector (autocomplete dropdown) */}
        <div className="fd-user-selector" style={{ marginRight: 8, position: 'relative' }}>
          <button className="fd-user-btn" onClick={() => setGraphDropdownOpen(!graphDropdownOpen)} style={{ maxWidth: 280 }}>
            <Database size={14} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
              {graphInfo?.name || selectedGraphId?.substring(0, 12) + '...' || 'Select Graph'}
            </span>
            <ChevronDown size={14} />
          </button>
          {graphDropdownOpen && (
            <div className="fd-user-dropdown" style={{ width: 360, maxHeight: 320 }}>
              <div style={{ padding: '4px 8px', borderBottom: '1px solid #30363d' }}>
                <input
                  type="text"
                  value={graphSearch}
                  onChange={e => setGraphSearch(e.target.value)}
                  placeholder="Search graphs..."
                  autoFocus
                  style={{ width: '100%', padding: '4px 8px', background: '#0d1117', border: '1px solid #30363d', borderRadius: 4, color: '#fff', fontSize: 13, outline: 'none' }}
                />
              </div>
              <div style={{ overflow: 'auto', maxHeight: 260 }}>
                {catalogGraphs
                  .filter(g => {
                    if (!graphSearch) return true;
                    const q = graphSearch.toLowerCase();
                    return (g.name || '').toLowerCase().includes(q) || (g.namespace || '').toLowerCase().includes(q) || (g.id || '').includes(q);
                  })
                  .map(g => (
                    <button
                      key={g.id}
                      className={`fd-user-option ${g.id === selectedGraphId ? 'active' : ''}`}
                      onClick={() => { setSelectedGraphId(g.id); setGraphDropdownOpen(false); setGraphSearch(''); }}
                    >
                      <span className="fd-user-option-name" style={{ fontSize: 13 }}>{g.name || g.id}</span>
                      <span className="fd-user-option-label" style={{ fontSize: 11 }}>
                        {g.namespace} · {g.nodeCount || g.nodes?.length || '?'}N · v{g.currentVersion || 1}
                      </span>
                    </button>
                  ))
                }
                {catalogGraphs.length === 0 && (
                  <div style={{ padding: 12, textAlign: 'center', color: '#666', fontSize: 13 }}>No graphs found</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Reset Chat */}
        <button
          className="fd-user-btn"
          title="Reset chat & session"
          style={{ marginRight: 8, padding: '4px 10px', minWidth: 0 }}
          onClick={() => {
            const newSid = 'sess-' + Math.random().toString(36).slice(2, 10);
            setSessionId(newSid);
            setMessages([{ role: 'bot', text: `Session reset. Graph: **${graphInfo?.name || selectedGraphId}**. How can I help you?` }]);
            setExecutionLog([]);
            setLastResult(null);
            setWorkflowResult(null);
            setDialogState({});
          }}
        >
          <RotateCcw size={14} />
          <span>Reset</span>
        </button>

        {/* Graph Version Selector */}
        {graphVersions.length > 1 && (
          <div className="fd-user-selector" style={{ marginRight: 8 }}>
            <button className="fd-user-btn" onClick={() => setVersionDropdownOpen(!versionDropdownOpen)}>
              <FileText size={14} />
              <span>v{selectedVersion || graphVersions.find(v => v.isCurrent)?.version || '?'}</span>
              <ChevronDown size={14} />
            </button>
            {versionDropdownOpen && (
              <div className="fd-user-dropdown">
                {graphVersions.map(v => (
                  <button key={v.version}
                    className={`fd-user-option ${(selectedVersion || graphVersions.find(vv => vv.isCurrent)?.version) === v.version ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedVersion(v.version);
                      setVersionDropdownOpen(false);
                      // Reset session for new version
                      setSessionId('sess-' + Math.random().toString(36).slice(2, 10));
                      setMessages([{ role: 'bot', text: `Switched to graph **v${v.version}** (${v.nodeCount} nodes). How can I help you?` }]);
                      setLastResult(null);
                      setDialogState({});
                      setExecutionLog([]);
                    }}>
                    <span className="fd-user-option-name">v{v.version} {v.isCurrent ? '(current)' : ''}</span>
                    <span className="fd-user-option-label">{v.nodeCount} nodes, {v.edgeCount} edges</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="fd-user-selector">
          <button className="fd-user-btn" onClick={() => setUserDropdownOpen(!userDropdownOpen)}>
            <User size={16} />
            <span>{selectedUser.name}</span>
            <ChevronDown size={14} />
          </button>
          {userDropdownOpen && (
            <div className="fd-user-dropdown">
              {DEMO_USERS.map(u => (
                <button key={u.id} className={`fd-user-option ${u.id === selectedUser.id ? 'active' : ''}`}
                  onClick={() => selectUser(u)}>
                  <span className="fd-user-option-name">{u.name}</span>
                  <span className="fd-user-option-label">{u.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="fd-body">
        {/* Chat Panel */}
        <div className="fd-chat-panel">
          <div className="fd-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`fd-message fd-message-${msg.role} ${msg.isError ? 'fd-message-error' : ''}`}>
                <div className="fd-message-avatar">
                  {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div className="fd-message-content">
                  {msg.text.split('\n').map((line, j) => (
                    <p key={j}>{line.replace(/\*\*(.*?)\*\*/g, (_, t) => t)}</p>
                  ))}
                  {/* FormRenderer for waiting nodes */}
                  {msg.waitingNode && !msg.formSubmitted && (
                    <FlowDeskFormWidget
                      waitingNode={msg.waitingNode}
                      choices={msg.choices}
                      sessionState={dialogState}
                      loading={loading}
                      onSubmit={(value) => {
                        // Mark form as submitted on this message
                        setMessages(prev => prev.map(m => m === msg ? { ...m, formSubmitted: true } : m));
                        // Send directly using the form value
                        sendFormValue(value);
                      }}
                      onChoiceClick={handleChoiceClick}
                    />
                  )}
                  {/* Fallback: plain choices if no waitingNode */}
                  {!msg.waitingNode && msg.choices && msg.choices.length > 0 && (
                    <div className="fd-choices">
                      {msg.choices.map((choice, ci) => (
                        <button
                          key={ci}
                          className={`fd-choice-btn fd-choice-${choice.variant || 'default'} ${choice.selected ? 'fd-choice-selected' : ''} ${choice.disabled ? 'fd-choice-disabled' : ''}`}
                          onClick={() => !choice.disabled && handleChoiceClick(choice)}
                          disabled={choice.disabled || loading}
                        >
                          {choice.selected && <CheckCircle2 size={13} />}
                          {choice.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="fd-message fd-message-bot">
                <div className="fd-message-avatar"><Bot size={16} /></div>
                <div className="fd-message-content fd-typing">
                  <Loader2 size={16} className="fd-spin" />
                  <span>Analyzing your request...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="fd-input-area">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your request... (e.g., 'I need a new laptop')"
              disabled={loading}
              className="fd-input"
            />
            <button onClick={handleSend} disabled={loading || !input.trim()} className="fd-send-btn">
              <Send size={18} />
            </button>
          </div>
        </div>

        {/* Side Panel with Tabs */}
        <div className="fd-side-panel">
          {/* Tab Headers */}
          <div className="fd-tabs">
            <button
              className={`fd-tab ${sideTab === 'overview' ? 'fd-tab-active' : ''}`}
              onClick={() => setSideTab('overview')}
            >
              <Shield size={14} />
              Overview
            </button>
            <button
              className={`fd-tab ${sideTab === 'log' ? 'fd-tab-active' : ''}`}
              onClick={() => setSideTab('log')}
            >
              <ListOrdered size={14} />
              Execution Log
              {executionLog.length > 0 && <span className="fd-tab-badge">{executionLog.length}</span>}
            </button>
          </div>

          {/* Tab: Overview */}
          {sideTab === 'overview' && (
            <div className="fd-tab-content">
              {/* Graph Info */}
              <div className="fd-panel-section">
                <h3><Database size={16} /> Execution Graph</h3>
                {graphInfo ? (
                  <div className="fd-routing fade-in">
                    <div className="fd-routing-row">
                      <span className="fd-routing-label">Name</span>
                      <span className="fd-routing-value" style={{ fontSize: 13 }}>{graphInfo.name || '-'}</span>
                    </div>
                    <GraphIdRow id={GRAPH_ID} />
                    <div className="fd-routing-row">
                      <span className="fd-routing-label">Version</span>
                      <span className="fd-routing-value">{graphInfo.currentVersion || graphInfo.version || 1}</span>
                    </div>
                    <div className="fd-routing-row">
                      <span className="fd-routing-label">Namespace</span>
                      <span className="fd-routing-value">{graphInfo.namespace || '-'}</span>
                    </div>
                    <div className="fd-routing-row">
                      <span className="fd-routing-label">Type</span>
                      <span className="fd-routing-value">{graphInfo.type || '-'}</span>
                    </div>
                    <div className="fd-routing-row">
                      <span className="fd-routing-label">Nodes</span>
                      <span className="fd-routing-value">{graphInfo.nodeCount || graphInfo.nodes?.length || '-'}</span>
                    </div>
                    <div className="fd-routing-row">
                      <span className="fd-routing-label">Edges</span>
                      <span className="fd-routing-value">{graphInfo.edgeCount || graphInfo.edges?.length || '-'}</span>
                    </div>
                    {graphInfo.createdAt && (
                      <div className="fd-routing-row">
                        <span className="fd-routing-label">Created</span>
                        <span className="fd-routing-value" style={{ fontSize: 12 }}>{new Date(graphInfo.createdAt).toLocaleDateString()}</span>
                      </div>
                    )}
                    {graphInfo.updatedAt && (
                      <div className="fd-routing-row">
                        <span className="fd-routing-label">Updated</span>
                        <span className="fd-routing-value" style={{ fontSize: 12 }}>{new Date(graphInfo.updatedAt).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="fd-panel-empty">Loading graph info...</div>
                )}
              </div>

              {/* Classification */}
              <div className="fd-panel-section">
                <h3><Shield size={16} /> Classification</h3>
                {classification?.service_code ? (
                  <div className="fd-classification fade-in">
                    <div className="fd-match-item fd-match-top">
                      <div className="fd-match-header">
                        <span className="fd-match-code">{classification.service_code}</span>
                        <ConfidenceBadge level={classification.confidence} score={classification.confidence_score} />
                      </div>
                      <div className="fd-match-name">{classification.service_name}</div>
                      <div className="fd-match-meta">
                        <MethodBadge method={classification.method} latency={classification.latency_ms} />
                      </div>
                      <div className="fd-score-bar">
                        <div className="fd-score-fill" style={{ width: `${(classification.confidence_score || 0) * 100}%` }} />
                      </div>
                    </div>
                    {classification.alternatives?.length > 0 && (
                      <div className="fd-alternatives">
                        <span className="fd-alt-label">Alternatives:</span>
                        {classification.alternatives.map((alt, i) => (
                          <div key={i} className="fd-match-item fd-match-alt">
                            <span className="fd-match-code">{alt.service_code}</span>
                            <span className="fd-match-name">{alt.service_name}</span>
                            <span className="fd-match-score">{(alt.score * 100).toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="fd-panel-empty">Send a message to see classification</div>
                )}
              </div>

              {/* Routing */}
              <div className="fd-panel-section">
                <h3><Building2 size={16} /> Routing</h3>
                {handler ? (
                  <div className="fd-routing fade-in">
                    <div className="fd-routing-row">
                      <span className="fd-routing-label">Handler</span>
                      <span className="fd-routing-value">{handler.name}</span>
                    </div>
                    <div className="fd-routing-row">
                      <span className="fd-routing-label">Code</span>
                      <span className="fd-routing-value">{handler.code}</span>
                    </div>
                    <div className="fd-routing-row">
                      <span className="fd-routing-label">Scope</span>
                      <ScopeBadge scope={handler.scope} />
                    </div>
                    <div className="fd-routing-row">
                      <span className="fd-routing-label">Priority</span>
                      <span className="fd-routing-value">P{handler.priority}</span>
                    </div>
                  </div>
                ) : (
                  <div className="fd-panel-empty">Routing result will appear here</div>
                )}
              </div>

              {/* User Context */}
              <div className="fd-panel-section">
                <h3><User size={16} /> User Context</h3>
                {userContext ? (
                  <div className="fd-user-context">
                    <div className="fd-routing-row">
                      <span className="fd-routing-label">Name</span>
                      <span className="fd-routing-value">{userContext.displayName}</span>
                    </div>
                    <div className="fd-routing-row">
                      <span className="fd-routing-label">Org Unit</span>
                      <span className="fd-routing-value">{userContext.orgUnit?.name}</span>
                    </div>
                    <div className="fd-routing-row">
                      <span className="fd-routing-label">Location</span>
                      <span className="fd-routing-value">
                        {[userContext.location?.dutyStation, userContext.location?.country].filter(Boolean).join(', ') || 'N/A'}
                      </span>
                    </div>
                    <div className="fd-routing-row">
                      <span className="fd-routing-label">Region</span>
                      <span className="fd-routing-value">{userContext.location?.region || 'N/A'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="fd-panel-empty"><Loader2 size={14} className="fd-spin" /> Loading...</div>
                )}
              </div>

              {/* Dialog State */}
              <div className="fd-panel-section">
                <h3><ListOrdered size={16} /> Dialog State</h3>
                <div className="fd-user-context">
                  <div className="fd-routing-row">
                    <span className="fd-routing-label">Intent</span>
                    <span className="fd-routing-value">{dialogState.intent || '—'}</span>
                  </div>
                  <div className="fd-routing-row">
                    <span className="fd-routing-label">Service</span>
                    <span className="fd-routing-value">{dialogState.service_name || '—'}</span>
                  </div>
                  <div className="fd-routing-row">
                    <span className="fd-routing-label">Location</span>
                    <span className="fd-routing-value">{dialogState.location || '—'}</span>
                  </div>
                  <div className="fd-routing-row">
                    <span className="fd-routing-label">Beneficiary</span>
                    <span className="fd-routing-value">{dialogState.beneficiary || '—'}</span>
                  </div>
                  <div className="fd-routing-row">
                    <span className="fd-routing-label">Confirmed</span>
                    <span className="fd-routing-value">{dialogState.confirmed ? <CheckCircle2 size={14} style={{color:'#22c55e'}} /> : '—'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab: Execution Log */}
          {sideTab === 'log' && (
            <div className="fd-tab-content">
              {executionLog.length === 0 ? (
                <div className="fd-panel-empty">
                  <ListOrdered size={16} />
                  Send a request to see the execution log
                </div>
              ) : (
                <div className="fd-exec-log">
                  {executionLog.map((entry, i) => (
                    <ExecutionLogEntry key={i} entry={entry} index={i} />
                  ))}

                  {/* Total summary */}
                  {workflowResult && (
                    <div className="fd-log-summary fade-in">
                      <div className="fd-log-summary-row">
                        <span>Total Steps</span>
                        <span>{workflowResult.history?.length || 0}</span>
                      </div>
                      <div className="fd-log-summary-row">
                        <span>Total Time</span>
                        <span>{workflowResult.history?.reduce((s, h) => s + (h.elapsed_ms || 0), 0)}ms</span>
                      </div>
                      <div className="fd-log-summary-row">
                        <span>Workflow Status</span>
                        <span className={`fd-log-status fd-log-status-${workflowResult.status?.toLowerCase()}`}>
                          {workflowResult.status}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
