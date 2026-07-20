import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Stack, Button, TextField, IconButton,
  Paper, Chip, CircularProgress, Alert, Divider, Tooltip,
} from '@mui/material';
import { Send, Bot, User, GitGraph, Save, StopCircle, Wand2 } from 'lucide-react';
import { useGraphBuilderAgent } from '../../hooks/useGraphBuilderAgent';
import { createGraph } from '../../services/graphCatalog.service';

// Investigation executors available as tools in methodology graphs
const INVESTIGATION_EXECUTORS = [
  'investigation.locate',
  'investigation.expand',
  'investigation.connect',
  'investigation.profile',
  'investigation.structure',
  'investigation.impact',
  'investigation.resolve',
  'investigation.matrix',
  'investigation.timeline',
  'investigation.text',
  'investigation.synthesize',
];

const SEED_PROMPT = `You are building a GXE investigation methodology graph.

**Available executor types:**
- workflow.start — required root node (carries parameterSchema for user inputs)
- workflow.end — required terminal node
${INVESTIGATION_EXECUTORS.map(e => `- ${e}`).join('\n')}

**Template syntax for data flow:**
- \`{{input.paramName}}\` — user parameter
- \`{{N02.content.nodes[0].id}}\` — first entity ID from a locate/expand result
- \`{{N03.content.nodes}}\` — full node list from a prior step

**Hard rules:**
- Linear DAG only — no fan-in merge nodes
- workflow.start must be first, workflow.end must be last
- All node templates must reference nodeIds that appear earlier in the chain

Describe the methodology goal and I will build the graph for you.`;

const QUICK_STARTS = [
  {
    label: 'UN Service Research',
    prompt: 'Build a 6-node methodology to research a UN service: locate the entity, expand its neighbourhood, profile the primary entity, synthesize a narrative report. Parameters: serviceName (required string), maxDepth (number, default 3).',
  },
  {
    label: 'Impact Assessment',
    prompt: 'Build a methodology for impact assessment: locate an entity, run impact analysis, structure the results, synthesize an impact report. Parameters: entityName (required string).',
  },
  {
    label: 'Document Timeline',
    prompt: 'Build a methodology for document timeline research: locate a topic entity, build a timeline, connect related entities, synthesize a chronological narrative. Parameters: topic (required string), startYear (number).',
  },
];

function mapAgentGraphToCatalog(agentGraph, name, methodologyName) {
  const nodes = (agentGraph.nodes || []).map(n => ({
    id: n.id,
    type: n.data?.executorType || n.type || 'unknown',
    name: n.data?.displayName || n.id,
    parameters: n.data?.parameters || {},
    position: n.position,
  }));

  const edges = (agentGraph.edges || []).map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceNodeId: e.source,
    targetNodeId: e.target,
  }));

  return {
    name,
    namespace: 'METHODOLOGY',
    type: 'business',
    description: `Investigation methodology graph: ${methodologyName || name}`,
    nodes,
    edges,
  };
}

export default function AIGraphBuilderDialog({ open, onClose, methodologyName, onGraphSaved }) {
  const {
    sessionId, messages, graph, loading, streaming, error,
    startSession, sendMessageStream, cancelStream, clearError,
  } = useGraphBuilderAgent();

  const [graphName, setGraphName] = useState('');
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const messagesEndRef = useRef(null);
  const sessionStarted = useRef(false);

  // Start session and seed context when dialog opens
  useEffect(() => {
    if (open && !sessionStarted.current) {
      sessionStarted.current = true;
      (async () => {
        try {
          await startSession(null);
          setSeeding(true);
          await sendMessageStream(SEED_PROMPT);
        } catch {} finally {
          setSeeding(false);
        }
      })();
    }
    if (!open) {
      sessionStarted.current = false;
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (methodologyName) setGraphName(`${methodologyName} — Graph`);
  }, [methodologyName]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async () => {
    if (!input.trim() || streaming || seeding) return;
    const msg = input.trim();
    setInput('');
    try { await sendMessageStream(msg); } catch {}
  }, [input, streaming, seeding, sendMessageStream]);

  const applyQuickStart = (prompt) => {
    setInput(prompt);
  };

  const saveAndUse = async () => {
    if (!graph || !graphName.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = mapAgentGraphToCatalog(graph, graphName.trim(), methodologyName);
      const created = await createGraph(payload);
      // entryId is the catalog entry ID used as graphId in methodology
      const entryId = created?.entryId || created?.id;
      if (!entryId) throw new Error('Graph was created but returned no ID');
      onGraphSaved(entryId, graphName.trim());
      onClose();
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Filter out the seed message from display (it's a system prompt, not user-visible conversation)
  const visibleMessages = messages.filter(m => {
    if (m.role === 'user' && m.content === SEED_PROMPT) return false;
    return true;
  });

  const hasValidGraph = graph && (graph.nodes?.length ?? 0) >= 2;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { height: '88vh', maxHeight: '88vh' } }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Wand2 size={22} />
          <Typography variant="h6">AI Graph Builder</Typography>
          {methodologyName && (
            <Chip size="small" label={methodologyName} variant="outlined" />
          )}
          <Box sx={{ flex: 1 }} />
          {graph && (
            <Chip
              icon={<GitGraph size={14} />}
              size="small"
              label={`${graph.nodes?.length ?? 0} nodes · ${graph.edges?.length ?? 0} edges`}
              color="info"
            />
          )}
        </Stack>
      </DialogTitle>

      <DialogContent
        dividers
        sx={{ display: 'flex', gap: 2, p: 2, overflow: 'hidden' }}
      >
        {/* ── Chat column ─────────────────────────────────────────────── */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Messages */}
          <Box sx={{ flex: 1, overflowY: 'auto', pr: 0.5 }}>
            {!sessionId && loading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={24} />
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1.5, alignSelf: 'center' }}>
                  Starting AI session…
                </Typography>
              </Box>
            )}

            {visibleMessages.map((msg, idx) => (
              <Stack
                key={msg.id ?? idx}
                direction={msg.role === 'user' ? 'row-reverse' : 'row'}
                spacing={1}
                alignItems="flex-start"
                sx={{ mb: 1.5 }}
              >
                <Box sx={{ pt: 0.5, flexShrink: 0, opacity: 0.6 }}>
                  {msg.role === 'user' ? <User size={17} /> : <Bot size={17} />}
                </Box>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    maxWidth: '85%',
                    borderColor: msg.role === 'user' ? 'primary.main' : 'divider',
                    bgcolor: msg.role === 'user' ? 'primary.dark' : msg.error ? 'error.dark' : 'background.paper',
                    opacity: msg.streaming ? 0.85 : 1,
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: msg.role === 'assistant' ? 'inherit' : 'inherit' }}
                  >
                    {msg.content || (msg.streaming ? '…' : '')}
                  </Typography>
                  {msg.toolCalls?.length > 0 && (
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                      {msg.toolCalls.map((tc, i) => (
                        <Chip
                          key={i}
                          size="small"
                          label={tc.tool}
                          color={tc.result?.success !== false ? 'success' : 'error'}
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                      ))}
                    </Stack>
                  )}
                </Paper>
              </Stack>
            ))}
            <div ref={messagesEndRef} />
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 1, mt: 0.5 }} onClose={clearError}>{error}</Alert>
          )}

          {/* Input row */}
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <TextField
              fullWidth
              size="small"
              multiline
              maxRows={4}
              placeholder={
                !sessionId ? 'Starting AI session…' :
                seeding    ? 'Setting up investigation context…' :
                             'Describe what to build, or refine the current graph…'
              }
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={!sessionId || streaming || seeding}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
            {streaming ? (
              <Tooltip title="Cancel">
                <IconButton onClick={cancelStream} color="error" size="small">
                  <StopCircle size={20} />
                </IconButton>
              </Tooltip>
            ) : (
              <IconButton
                onClick={send}
                disabled={!input.trim() || !sessionId || seeding}
                color="primary"
                size="small"
              >
                <Send size={20} />
              </IconButton>
            )}
          </Stack>
        </Box>

        {/* ── Right panel: graph preview + quick starts ────────────────── */}
        <Box
          sx={{
            width: 280,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderLeft: '1px solid',
            borderColor: 'divider',
            pl: 2,
          }}
        >
          {/* Quick starts */}
          <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 0.75 }}>
            Quick starts
          </Typography>
          {QUICK_STARTS.map(({ label, prompt }) => (
            <Button
              key={label}
              size="small"
              variant="outlined"
              sx={{ mb: 0.5, justifyContent: 'flex-start', textAlign: 'left', fontSize: '0.75rem' }}
              disabled={!sessionId || streaming || seeding}
              onClick={() => applyQuickStart(prompt)}
            >
              {label}
            </Button>
          ))}

          <Divider sx={{ my: 1.5 }} />

          {/* Graph preview */}
          <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 0.75 }}>
            Current graph
          </Typography>
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            {!graph ? (
              <Typography variant="caption" color="text.disabled" sx={{ display: 'block', py: 1 }}>
                No graph yet — chat with the AI to build one
              </Typography>
            ) : (
              <Stack spacing={0.75}>
                {(graph.nodes || []).map((n, i) => {
                  const executorType = n.data?.executorType || n.type || '?';
                  const isStart = executorType === 'workflow.start';
                  const isEnd = executorType === 'workflow.end';
                  return (
                    <Paper
                      key={n.id || i}
                      variant="outlined"
                      sx={{
                        p: 1,
                        bgcolor: isStart || isEnd ? 'action.selected' : 'action.hover',
                      }}
                    >
                      <Typography variant="caption" fontWeight={700} sx={{ fontFamily: 'monospace', display: 'block' }}>
                        {n.id}
                      </Typography>
                      <Typography variant="caption" color={isStart || isEnd ? 'text.secondary' : 'primary.main'} sx={{ display: 'block' }}>
                        {executorType}
                      </Typography>
                      {n.data?.displayName && n.data.displayName !== n.id && (
                        <Typography variant="caption" color="text.disabled">{n.data.displayName}</Typography>
                      )}
                    </Paper>
                  );
                })}
                {graph.edges?.length > 0 && (
                  <Typography variant="caption" color="text.disabled">
                    {graph.edges.length} edge{graph.edges.length !== 1 ? 's' : ''}:{' '}
                    {graph.edges.map(e => `${e.source}→${e.target}`).join(', ')}
                  </Typography>
                )}
              </Stack>
            )}
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5, gap: 1 }}>
        {saveError && (
          <Alert severity="error" sx={{ py: 0, flex: 1 }}>{saveError}</Alert>
        )}
        <TextField
          size="small"
          label="Graph name"
          value={graphName}
          onChange={e => setGraphName(e.target.value)}
          sx={{ minWidth: 260 }}
          disabled={!hasValidGraph}
        />
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Tooltip title={!hasValidGraph ? 'Build a graph first by chatting with the AI' : ''}>
          <span>
            <Button
              variant="contained"
              startIcon={saving ? <CircularProgress size={16} /> : <Save size={16} />}
              onClick={saveAndUse}
              disabled={!hasValidGraph || !graphName.trim() || saving}
            >
              Save & Use
            </Button>
          </span>
        </Tooltip>
      </DialogActions>
    </Dialog>
  );
}
