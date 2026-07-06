/**
 * InvestigationChat — self-contained AI chat panel for an investigation session.
 *
 * Renders chat history with:
 *   - User messages (right-aligned bubbles)
 *   - Tool call result cards (primitive type, params, summary, "View Result" button)
 *   - Freeform assistant messages (left-aligned bubbles)
 *   - Clarification bubbles (entity resolution)
 *   - Entity picker bubbles (after multi-result LOCATE)
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Box, Typography, Stack, Paper, Chip, IconButton,
  TextField, Button, CircularProgress, Alert, Divider, Tooltip,
} from '@mui/material';
import {
  Send, FlaskConical, Bot,
  Search, Link2, Network, BookOpen, Braces, Cpu, Clock, ScanLine, FileText, StickyNote,
  ExternalLink, Zap,
} from 'lucide-react';
import ClarificationBubble from './ClarificationBubble';
import EntityPickerBubble from './EntityPickerBubble';

// ─── Primitive metadata ───────────────────────────────────────────────────────

const PRIMITIVE_META = {
  LOCATE:    { icon: Search,    color: '#3b82f6', label: 'Locate' },
  CONNECT:   { icon: Link2,     color: '#8b5cf6', label: 'Connect' },
  EXPAND:    { icon: Network,   color: '#06b6d4', label: 'Expand' },
  PROFILE:   { icon: BookOpen,  color: '#f59e0b', label: 'Profile' },
  IMPACT:    { icon: Zap,       color: '#ef4444', label: 'Impact' },
  MATRIX:    { icon: Braces,    color: '#10b981', label: 'Matrix' },
  STRUCTURE: { icon: Cpu,       color: '#ec4899', label: 'Structure' },
  TIMELINE:  { icon: Clock,     color: '#f97316', label: 'Timeline' },
  RESOLVE:   { icon: ScanLine,  color: '#84cc16', label: 'Resolve' },
  SYNTHESIZE:{ icon: FileText,  color: '#a78bfa', label: 'Synthesize' },
  TEXT:      { icon: StickyNote,color: '#64748b', label: 'Note' },
  FREEFORM:  { icon: Bot,       color: '#94a3b8', label: 'Chat' },
};

// Human-readable labels for each primitive's params
const PARAM_LABELS = {
  CONNECT: {
    fromEntityId:    'Source Entity',
    toEntityId:      'Target Entity',
    maxHops:         'Max Hops',
    maxPaths:        'Max Paths',
    minPathStrength: 'Min Strength',
    minEdgeConfidence: 'Min Confidence',
  },
  EXPAND: {
    entityId: 'Entity',
    depth:    'Depth',
  },
  LOCATE: {
    query:       'Query',
    entityTypes: 'Types',
    namespace:   'Namespace',
    limit:       'Limit',
  },
  MATRIX: {
    rowEntityIds: 'Row Entities',
    colEntityIds: 'Column Entities',
  },
  STRUCTURE: {
    entityIds: 'Entities',
  },
  TIMELINE: {
    entityIds: 'Entities',
    fromDate:  'From',
    toDate:    'To',
  },
  RESOLVE: {
    entityId:  'Entity',
    threshold: 'Threshold',
  },
  SYNTHESIZE: {
    entityIds: 'Entities',
    focus:     'Focus',
  },
  TEXT: {
    title: 'Title',
  },
  PROFILE: {
    entityId: 'Entity',
  },
  IMPACT: {
    entityId: 'Entity',
    maxDepth: 'Max Depth',
  },
};

// Params to skip (defaults, internal) from display
const SKIP_PARAM_VALUES = new Set([null, undefined, '', 0]);
const SKIP_PARAM_KEYS   = new Set(['minPathStrength', 'minEdgeConfidence', 'limit', 'threshold']);

// ─── Entity name resolution from artifact content ─────────────────────────────

function resolveEntityId(entityId, artifact) {
  if (!entityId) return null;
  const content = artifact?.content || {};
  const allEnts = [
    ...(content.entities || []),
    ...(content.nodes   || []),
    ...(content.rowEntities || []),
    ...(content.colEntities || []),
    ...(content.results || []),
  ];
  const found = allEnts.find(e => (e.id || e.entityId) === entityId);
  return found ? (found.name || entityId) : (entityId?.slice(0, 8) + '…');
}

function resolveParamValue(key, value, artifact) {
  if (Array.isArray(value)) {
    return value.map(v => (typeof v === 'string' && v.length > 20)
      ? resolveEntityId(v, artifact)
      : v
    ).filter(Boolean).join(', ') || '—';
  }
  if (typeof value === 'string' && value.length > 20) {
    return resolveEntityId(value, artifact);
  }
  return String(value);
}

// ─── ToolCallCard ─────────────────────────────────────────────────────────────

function ToolCallCard({ msg, onViewResult }) {
  const { primitiveType, params, text, artifact } = msg;
  const meta = PRIMITIVE_META[primitiveType] || PRIMITIVE_META.FREEFORM;
  const Icon = meta.icon;
  const col  = meta.color;

  const labelMap = PARAM_LABELS[primitiveType] || {};
  const paramRows = Object.entries(params || {})
    .filter(([k, v]) => labelMap[k] && !SKIP_PARAM_VALUES.has(v) && !(SKIP_PARAM_KEYS.has(k) && v === 0))
    .map(([k, v]) => ({
      label: labelMap[k],
      value: resolveParamValue(k, v, artifact),
    }));

  const isProposed = artifact?.status === 'PROPOSED';

  return (
    <Box sx={{
      mb: 1.25,
      border: '1px solid',
      borderColor: `${col}44`,
      borderLeft: `3px solid ${col}`,
      borderRadius: 1.5,
      overflow: 'hidden',
      bgcolor: 'background.paper',
      maxWidth: '96%',
    }}>
      {/* Header row */}
      <Stack direction="row" alignItems="center" spacing={0.75}
        sx={{ px: 1.25, py: 0.6, bgcolor: `${col}10`, borderBottom: '1px solid', borderColor: `${col}22` }}>
        <Icon size={13} style={{ color: col, flexShrink: 0 }} />
        <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: col, letterSpacing: '0.04em', flex: 1 }}>
          {meta.label}
        </Typography>
        {artifact && (
          <Chip
            label={isProposed ? 'Draft' : 'Committed'}
            size="small"
            color={isProposed ? 'warning' : 'success'}
            sx={{ fontSize: '0.52rem', height: 16 }}
          />
        )}
      </Stack>

      {/* Params grid */}
      {paramRows.length > 0 && (
        <Box sx={{ px: 1.25, pt: 0.75, pb: 0.5 }}>
          {paramRows.map(({ label, value }) => (
            <Stack key={label} direction="row" spacing={1} sx={{ mb: 0.3, minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled', whiteSpace: 'nowrap', flexShrink: 0, lineHeight: 1.6, minWidth: 80 }}>
                {label}:
              </Typography>
              <Typography sx={{ fontSize: '0.72rem', color: 'text.primary', lineHeight: 1.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {value}
              </Typography>
            </Stack>
          ))}
        </Box>
      )}

      {/* Result summary + View button */}
      {text && (
        <Box sx={{ px: 1.25, py: 0.6, borderTop: paramRows.length > 0 ? '1px solid' : 'none', borderColor: `${col}18` }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography sx={{ fontSize: '0.73rem', color: 'text.secondary', flex: 1, lineHeight: 1.5 }}>
              {text}
            </Typography>
            {artifact && onViewResult && (
              <Button
                size="small"
                variant="outlined"
                endIcon={<ExternalLink size={11} />}
                onClick={() => onViewResult(artifact)}
                sx={{
                  fontSize: '0.63rem', py: 0.2, px: 0.9, height: 22, flexShrink: 0,
                  borderColor: col + '66', color: col,
                  '&:hover': { borderColor: col, bgcolor: col + '10' },
                }}
              >
                {isProposed ? 'Preview & Commit' : 'View Result'}
              </Button>
            )}
          </Stack>
        </Box>
      )}
    </Box>
  );
}

// ─── ChatBubble ───────────────────────────────────────────────────────────────

function ChatBubble({ msg, sessionId, onRunTool, onAddArtifact, onSetEntityContext, onViewResult }) {
  const isUser = msg.role === 'user';
  const isError = msg.role === 'error';

  if (isError) {
    return <Alert severity="error" sx={{ mb: 0.5 }}><Typography variant="caption">{msg.text}</Typography></Alert>;
  }

  const hasToolCall = !isUser && msg.primitiveType && msg.primitiveType !== 'FREEFORM' && msg.type !== 'CLARIFICATION';
  if (hasToolCall) {
    return (
      <Box sx={{ mb: 1.25 }}>
        <ToolCallCard msg={msg} onViewResult={onViewResult} />
        {msg.clarificationIssues?.length > 0 && (
          <ClarificationBubble msg={msg} sessionId={sessionId} onRunTool={onRunTool} onAddArtifact={onAddArtifact} onViewResult={onViewResult} />
        )}
      </Box>
    );
  }

  const isClarification = !isUser && msg.type === 'CLARIFICATION';
  const locateResults = !isUser && msg.primitiveType === 'LOCATE' ? msg.artifact?.content?.results : null;
  const showPicker = locateResults?.length > 1;

  return (
    <Box sx={{ mb: 1.25, display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
      <Paper
        elevation={0}
        sx={{
          px: 1.25, py: 0.6, maxWidth: '92%',
          bgcolor: isUser ? 'primary.main' : isClarification ? 'warning.50' : 'action.hover',
          color: isUser ? 'primary.contrastText' : 'text.primary',
          borderRadius: isUser ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
          border: isClarification ? 1 : 0,
          borderColor: 'warning.light',
        }}
      >
        <Typography variant="body2" sx={{ fontSize: '0.8rem', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
          {msg.text}
        </Typography>
      </Paper>

      {/* Clarification bubbles */}
      {isClarification && (msg.clarificationIssues?.length > 0 || msg.clarificationOptions?.length > 0) && (
        <ClarificationBubble msg={msg} sessionId={sessionId} onRunTool={onRunTool} onAddArtifact={onAddArtifact} onViewResult={onViewResult} />
      )}

      {/* Entity picker after LOCATE */}
      {showPicker && (
        <EntityPickerBubble results={locateResults} onSetEntityContext={onSetEntityContext} />
      )}
    </Box>
  );
}

// ─── InvestigationChat ────────────────────────────────────────────────────────

export default function InvestigationChat({ messages, sending, onSend, onRunTool, onAddArtifact, onViewResult, disabled, sessionId }) {
  const [text, setText] = useState('');
  const [entityContext, setEntityContext] = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSetEntityContext = useCallback((entities) => {
    setEntityContext(entities);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if ((!trimmed && entityContext.length === 0) || sending || disabled) return;

    let finalText = trimmed || `Use entities: ${entityContext.map(e => e.label).join(', ')}`;
    const contextSuffix = entityContext.length > 0 ? ` [${entityContext.map(e => e.label).join(', ')}]` : '';

    onSend(finalText + contextSuffix, entityContext);
    setText('');
    setEntityContext([]);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Message area */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
        {messages.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 5, opacity: 0.35 }}>
            <FlaskConical size={28} />
            <Typography variant="body2" sx={{ mt: 1, fontSize: '0.8rem' }}>
              Type a query or use the toolbar buttons above
            </Typography>
          </Box>
        )}

        {messages.map((msg, i) => (
          <ChatBubble
            key={msg.messageId || i}
            msg={msg}
            sessionId={sessionId}
            onRunTool={onRunTool}
            onAddArtifact={onAddArtifact}
            onSetEntityContext={handleSetEntityContext}
            onViewResult={onViewResult}
          />
        ))}

        {sending && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, px: 1, opacity: 0.7 }}>
            <CircularProgress size={12} />
            <Typography variant="caption">Investigating…</Typography>
          </Box>
        )}
        <div ref={bottomRef} />
      </Box>

      {/* Entity context strip */}
      {entityContext.length > 0 && (
        <Box sx={{ px: 1.5, py: 0.6, borderTop: 1, borderColor: 'primary.light', bgcolor: 'primary.50' }}>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.4 }}>
            <Typography variant="caption" sx={{ fontSize: '0.62rem', color: 'primary.main', fontWeight: 700, flexShrink: 0 }}>
              Context:
            </Typography>
            {entityContext.map(e => (
              <Chip
                key={e.id}
                label={e.label}
                size="small"
                onDelete={() => setEntityContext(ctx => ctx.filter(c => c.id !== e.id))}
                sx={{ fontSize: '0.65rem', height: 18 }}
                color="primary"
                variant="outlined"
              />
            ))}
          </Stack>
        </Box>
      )}

      {/* Input form */}
      <Box component="form" onSubmit={handleSubmit} sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={0.75}>
          <TextField
            fullWidth size="small"
            placeholder={
              disabled ? 'Session closed'
              : entityContext.length > 0 ? 'Describe operation with selected entities…'
              : 'Ask or investigate…'
            }
            value={text}
            onChange={e => setText(e.target.value)}
            disabled={sending || disabled}
            autoComplete="off"
            sx={{ bgcolor: 'background.default' }}
          />
          <IconButton
            type="submit" color="primary"
            disabled={(!text.trim() && entityContext.length === 0) || sending || disabled}
            sx={{
              bgcolor: 'primary.main', color: 'white', width: 36, height: 36,
              '&:hover': { bgcolor: 'primary.dark' },
              '&.Mui-disabled': { bgcolor: 'action.disabledBackground', color: 'action.disabled' },
            }}
          >
            <Send size={16} />
          </IconButton>
        </Stack>
      </Box>
    </Box>
  );
}
