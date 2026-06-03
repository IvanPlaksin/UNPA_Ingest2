/**
 * SessionDetailDrawer — detailed view of a DialogueSession
 *
 * Tabs:
 *   Overview   — summary, stats, segments, linked entities
 *   Thread     — full chat history with participant identification + cross-session thread
 *   Decisions  — accepted / proposed / rejected ADR cards
 *   Related    — CONTINUES_FROM chain with platform indicators
 *
 * Future AI assistant: the /context API endpoint returns SessionContextPackage
 * which becomes the system context for the assistant (see _meta.dataCompleteness).
 */

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  Drawer, Box, Typography, Tabs, Tab, Chip, IconButton, CircularProgress,
  Divider, Stack, Paper, Tooltip, LinearProgress, Avatar,
  List, ListItem, ListItemText, ListItemAvatar, Collapse,
  Alert, InputBase, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import {
  Close, CheckCircle, Cancel, HelpOutline,
  SmartToy, Person, Link as LinkIcon, OpenInNew, ExpandMore, ExpandLess,
  Code, Chat, Search, Clear, AutoFixHigh,
  ContentCopy, Check, Bookmark, BookmarkBorder, Add,
  TrackChanges, EmojiEvents, HourglassEmpty, RadioButtonUnchecked,
  Block as BlockIcon, PendingActions,
} from '@mui/icons-material';
import { useSessionContext, useDialogueSession, useSessionReanalyze, useLinkedConversations, useSessionAnalyzeGoals } from '../../hooks/useDialogue';
import { useWebSocketListener } from '../../hooks/useWebSocket';
import ProvenanceChain from './ProvenanceChain';
import {
  parseSmartTitle, parseTopics, inferSessionType, SESSION_TYPE_STYLE,
  parseEntities, ENTITY_TYPE_COLOR,
} from './session-meta';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// ── Session navigation actions ────────────────────────────────────────────────

function SessionActions({ sessionId }) {
  const [openState, setOpenState] = useState('idle');  // idle | loading | done | error
  const [copied, setCopied] = useState(false);

  const permalink = `${window.location.origin}/dialogue/session/${sessionId}`;
  const vsCodeUri = `vscode://devdialogue.connector/open/${sessionId}`;

  const openInVSCode = async () => {
    setOpenState('loading');
    try {
      const res = await fetch(`${API_BASE}/dialogue/navigate/open/${sessionId}`);
      const data = await res.json();
      const uri = data.uri || vsCodeUri;
      window.location.href = uri;
      setOpenState('done');
    } catch {
      window.location.href = vsCodeUri;
      setOpenState('done');
    }
    setTimeout(() => setOpenState('idle'), 2500);
  };

  const copyPermalink = () => {
    navigator.clipboard.writeText(permalink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openLabel =
    openState === 'done' ? 'Opened' :
    openState === 'error' ? 'Check VS Code' :
    'Open in Claude Code';

  return (
    <>
      <Tooltip title={copied ? 'Link copied!' : 'Copy session permalink'}>
        <IconButton size="small" onClick={copyPermalink}>
          {copied
            ? <Check sx={{ fontSize: 16, color: 'success.main' }} />
            : <ContentCopy sx={{ fontSize: 16 }} />
          }
        </IconButton>
      </Tooltip>
      <Tooltip title={openLabel}>
        <span>
          <IconButton
            size="small"
            onClick={openInVSCode}
            disabled={openState === 'loading'}
            sx={{ color: openState === 'done' ? 'success.main' : openState === 'error' ? 'warning.main' : 'inherit' }}
          >
            {openState === 'loading'
              ? <CircularProgress size={16} />
              : openState === 'done'
                ? <Check sx={{ fontSize: 16 }} />
                : <OpenInNew sx={{ fontSize: 16 }} />
            }
          </IconButton>
        </span>
      </Tooltip>
    </>
  );
}

// ── Tags panel ────────────────────────────────────────────────────────────────

function SessionTagsPanel({ sessionId }) {
  const [tags, setTags] = useState(null);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    fetch(`${API_BASE}/dialogue/sessions/${sessionId}/tags`)
      .then(r => r.json())
      .then(d => setTags(d.tags || []))
      .catch(() => setTags([]));
  }, [sessionId]);

  const isBookmarked = tags?.includes('bookmark');
  const userTags = (tags || []).filter(t => t !== 'bookmark');

  const applyTags = async (body) => {
    setSaving(true);
    try {
      const method = body.remove ? 'DELETE' : 'POST';
      const res = await fetch(`${API_BASE}/dialogue/sessions/${sessionId}/tags`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const updated = data.currentTags ?? data.tags;
      if (updated) setTags(updated);
    } catch { /* non-fatal */ } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    const tag = input.trim();
    if (!tag || saving) return;
    setInput('');
    applyTags({ tags: [tag] });
  };

  if (tags === null) return null;

  return (
    <Box sx={{ mb: 2 }}>
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.75 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600}>TAGS</Typography>
        <Tooltip title={isBookmarked ? 'Remove bookmark' : 'Bookmark this session'}>
          <IconButton size="small" onClick={() => applyTags(isBookmarked ? { tags: ['bookmark'], remove: true } : { tags: ['bookmark'] })} disabled={saving}>
            {isBookmarked
              ? <Bookmark sx={{ fontSize: 15, color: 'warning.main' }} />
              : <BookmarkBorder sx={{ fontSize: 15, color: 'text.disabled' }} />}
          </IconButton>
        </Tooltip>
      </Stack>
      <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5} alignItems="center">
        {userTags.map(tag => (
          <Chip
            key={tag}
            label={tag}
            size="small"
            onDelete={() => applyTags({ tags: [tag], remove: true })}
            disabled={saving}
            sx={{ height: 22, fontSize: 11 }}
          />
        ))}
        <Paper
          variant="outlined"
          component="form"
          onSubmit={e => { e.preventDefault(); addTag(); }}
          sx={{ display: 'flex', alignItems: 'center', height: 24, px: 0.75, borderRadius: 3, borderStyle: 'dashed' }}
        >
          <InputBase
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="add tag…"
            sx={{ fontSize: 11, width: input ? 'auto' : 55, minWidth: 48 }}
            disabled={saving}
          />
          {input.trim() && (
            <IconButton size="small" type="submit" disabled={saving} sx={{ p: 0.2 }}>
              <Add sx={{ fontSize: 13 }} />
            </IconButton>
          )}
        </Paper>
      </Stack>
    </Box>
  );
}

// ── Navigator links panel ─────────────────────────────────────────────────────

function SessionNavigatorPanel({ sessionId }) {
  const [vsRunning, setVsRunning] = useState(null);
  const [copied, setCopied] = useState(null);

  const vsCodeUri  = `vscode://devdialogue.connector/open/${sessionId}`;
  const permalink  = `${window.location.origin}/dialogue/session/${sessionId}`;
  const navigatorUrl = `${API_BASE}/dialogue/navigate/open/${sessionId}`;

  useEffect(() => {
    fetch(`${API_BASE}/dialogue/navigate/status`)
      .then(r => r.json())
      .then(d => setVsRunning(d.vsCodeRunning ?? null))
      .catch(() => setVsRunning(false));
  }, []);

  const copy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const links = [
    { key: 'vscode',    label: 'VS Code URI',    value: vsCodeUri,    display: `vscode://devdialogue.connector/open/${sessionId.slice(0, 8)}…` },
    { key: 'permalink', label: 'Permalink',       value: permalink,    display: `/dialogue/session/${sessionId.slice(0, 8)}…` },
    { key: 'api',       label: 'Navigator API',   value: navigatorUrl, display: `/navigate/open/${sessionId.slice(0, 8)}…` },
  ];

  return (
    <Box sx={{ mb: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600}>NAVIGATOR</Typography>
        {vsRunning !== null && (
          <Chip
            label={vsRunning ? 'VS Code running' : 'VS Code not detected'}
            size="small"
            color={vsRunning ? 'success' : 'default'}
            variant="outlined"
            sx={{ height: 18, fontSize: 10 }}
          />
        )}
      </Stack>
      <Stack spacing={0.4}>
        {links.map(({ key, label, value, display }) => (
          <Stack key={key} direction="row" spacing={0.5} alignItems="center">
            <Typography variant="caption" color="text.disabled" sx={{ minWidth: 88, flexShrink: 0 }}>{label}</Typography>
            <Typography
              variant="caption"
              sx={{ flex: 1, fontFamily: 'monospace', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'text.secondary' }}
            >
              {display}
            </Typography>
            <Tooltip title={copied === key ? 'Copied!' : `Copy ${label}`}>
              <IconButton size="small" onClick={() => copy(value, key)} sx={{ flexShrink: 0 }}>
                {copied === key
                  ? <Check sx={{ fontSize: 13, color: 'success.main' }} />
                  : <ContentCopy sx={{ fontSize: 13 }} />}
              </IconButton>
            </Tooltip>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

// ── Re-analyze progress panel ─────────────────────────────────────────────────

function ReanalyzeProgress({ sessionId, onDone }) {
  const [steps, setSteps] = useState([]);
  const [status, setStatus] = useState(null); // null | 'running' | 'done' | 'error'
  const doneFiredRef = useRef(false);

  useWebSocketListener(useCallback((msg) => {
    if (msg.type !== 'dialogue:reanalyze' || msg.sessionId !== sessionId) return;
    setStatus(msg.status);
    setSteps(prev => {
      const next = { step: msg.step, label: msg.label, status: msg.status, result: msg.result ?? null };
      const idx = prev.findIndex(s => s.step === msg.step);
      if (idx !== -1) {
        const updated = [...prev];
        updated[idx] = next;
        return updated;
      }
      return [...prev, next];
    });
    // Fire onDone only once — on the final done event that carries a result (route's emit, post-persistence)
    if (msg.status === 'done' && msg.result && !doneFiredRef.current) {
      doneFiredRef.current = true;
      setTimeout(() => onDone?.(), 1500);
    }
  }, [sessionId, onDone]));

  if (!steps.length) return null;

  return (
    <Box sx={{ px: 2, py: 1.5, bgcolor: 'background.default', borderBottom: '1px solid', borderColor: 'divider' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <AutoFixHigh sx={{ fontSize: 14, color: 'primary.main' }} />
        <Typography variant="caption" fontWeight={600} color="primary.main">AI Re-analysis</Typography>
        {status === 'done' && <Chip label="Complete" size="small" color="success" sx={{ height: 18, fontSize: 10 }} />}
        {status === 'error' && <Chip label="Error" size="small" color="error" sx={{ height: 18, fontSize: 10 }} />}
      </Stack>
      <Stack spacing={0.75}>
        {steps.map((s) => {
          const isDone = s.status === 'done';
          const isError = s.status === 'error';
          const isRunning = s.status === 'running';
          return (
            <Box key={s.step}>
              <Stack direction="row" spacing={1} alignItems="center">
                {isDone
                  ? <CheckCircle sx={{ fontSize: 14, flexShrink: 0 }} color="success" />
                  : isError
                    ? <CheckCircle sx={{ fontSize: 14, flexShrink: 0 }} color="error" />
                    : isRunning
                      ? <CircularProgress size={12} sx={{ flexShrink: 0 }} />
                      : <Box sx={{ width: 14, height: 14, borderRadius: '50%', border: '1px solid', borderColor: 'divider', flexShrink: 0 }} />
                }
                <Typography variant="caption" color={isDone ? 'success.main' : isError ? 'error.main' : isRunning ? 'text.primary' : 'text.disabled'} fontWeight={isRunning ? 500 : 400}>
                  {s.label}
                </Typography>
              </Stack>
              {isDone && s.result && (
                <Typography variant="caption" color="text.secondary" sx={{ pl: 3, display: 'block', mt: 0.25 }}>
                  {s.result}
                </Typography>
              )}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}

// ── Participant identification ────────────────────────────────────────────────

// Three canonical author types — same identity regardless of which conversation they appear in.
// Source (claude_ai_linked) controls visual framing (border, chip), not the author icon/color.
const PARTICIPANT_CONFIG = {
  // ── Author type 1: the human user ──────────────────────────────────────────
  user:        { label: 'User',        color: '#1565c0', Icon: Person,      bg: '#e3f2fd' },
  // ── Author type 2: Claude Code (the agent driving the session) ─────────────
  claude_code: { label: 'Claude Code', color: '#4e342e', Icon: Code,        bg: '#efebe9' },
  // ── Author type 3: Claude Chat (responses from a linked Claude.ai chat) ────
  claude_chat: { label: 'Claude Chat', color: '#6a1b9a', Icon: Chat,        bg: '#ede7f6' },
};

function getParticipant(message) {
  const p = (message.participant || '').toLowerCase().trim();
  const r = message.role;

  // Explicit participant names take priority
  if (p === 'user' || p === 'human' || p === 'ivan') return PARTICIPANT_CONFIG.user;
  if (p === 'claudecode' || p === 'claude code' || p === 'claude_code')
    return PARTICIPANT_CONFIG.claude_code;
  if (p === 'claudechat' || p === 'claude chat' || p === 'claude_chat')
    return PARTICIPANT_CONFIG.claude_chat;

  // Fallback on role + context
  if (r === 'user') return PARTICIPANT_CONFIG.user;
  // assistant in a claude_code session is Claude Code; assistant in a linked chat is Claude Chat
  if (r === 'assistant') {
    return message.source === 'claude_ai_linked'
      ? PARTICIPANT_CONFIG.claude_chat
      : PARTICIPANT_CONFIG.claude_code;
  }
  return PARTICIPANT_CONFIG.user;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PlatformChip({ platform, size = 'small' }) {
  const label = platform === 'claude_code' ? 'Claude Code' : platform === 'claude_ai' ? 'Claude.ai' : platform;
  const color = platform === 'claude_code' ? 'primary' : 'secondary';
  return <Chip label={label} size={size} color={color} variant="outlined" />;
}

function DecisionCard({ decision, type }) {
  const [expanded, setExpanded] = useState(false);
  const conf = Math.round((parseFloat(decision.confidence) || 0) * 100);

  const typeConfig = {
    accepted: { color: 'success', Icon: CheckCircle },
    proposed: { color: 'warning', Icon: HelpOutline },
    rejected: { color: 'error', Icon: Cancel },
  };
  const { color, Icon } = typeConfig[type] || typeConfig.proposed;

  let alternatives = [];
  try {
    alternatives = typeof decision.alternatives === 'string'
      ? JSON.parse(decision.alternatives) : (decision.alternatives || []);
  } catch { alternatives = []; }

  return (
    <Paper variant="outlined" sx={{ mb: 1, overflow: 'hidden' }}>
      <Box
        sx={{ p: 1.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
        onClick={() => setExpanded(e => !e)}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <Icon color={color} fontSize="small" />
          <Typography variant="body2" fontWeight={500} sx={{ flex: 1 }}>
            {decision.title}
          </Typography>
          <Chip label={decision.category} size="small" variant="outlined" />
          <Chip label={`${conf}%`} size="small" color={color} />
          {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
        </Stack>
      </Box>
      <Collapse in={expanded}>
        <Divider />
        <Box sx={{ p: 1.5, bgcolor: 'background.default' }}>
          {decision.decision && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>Decision</Typography>
              <Typography variant="body2">{decision.decision}</Typography>
            </Box>
          )}
          {decision.rationale && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>Rationale</Typography>
              <Typography variant="body2">{decision.rationale}</Typography>
            </Box>
          )}
          {alternatives.length > 0 && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>Alternatives</Typography>
              <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                {alternatives.map((a, i) => (
                  <li key={i}><Typography variant="body2">{a}</Typography></li>
                ))}
              </ul>
            </Box>
          )}
          {decision.consequences && (
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>Consequences</Typography>
              <Typography variant="body2">{decision.consequences}</Typography>
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}

function highlightText(text, query) {
  if (!query || !text) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  const parts = [];
  let last = 0;
  let i = idx;
  while (i !== -1 && parts.length < 20) {
    parts.push(text.slice(last, i));
    parts.push(
      <mark key={i} style={{ background: '#fff176', borderRadius: 2, padding: '0 1px' }}>
        {text.slice(i, i + query.length)}
      </mark>
    );
    last = i + query.length;
    i = text.toLowerCase().indexOf(query.toLowerCase(), last);
  }
  parts.push(text.slice(last));
  return parts;
}

function MessageBubble({ message, platform, searchQuery }) {
  const pc = getParticipant(message);
  // Align right only for the actual human user, not for ClaudeCode messages that
  // happen to carry role='user' because they act as the sender in a linked chat.
  const isHuman = pc === PARTICIPANT_CONFIG.user;
  const [expanded, setExpanded] = useState(false);
  const content = message.content || '';
  const isToolOnly = message.isToolOnly || (!content.trim() && message.toolUseCount > 0);
  const PREVIEW = 300;
  const hasMatch = searchQuery && content.toLowerCase().includes(searchQuery.toLowerCase());
  const needsExpand = !hasMatch && content.length > PREVIEW;
  const displayContent = needsExpand && !expanded ? content.slice(0, PREVIEW) + '…' : content;

  // Tool-only message: compact indicator row without empty bubble
  if (isToolOnly) {
    return (
      <Box sx={{ display: 'flex', gap: 1, mb: 0.75, flexDirection: isHuman ? 'row-reverse' : 'row', alignItems: 'center' }}>
        <Avatar sx={{ width: 22, height: 22, bgcolor: pc.bg, flexShrink: 0 }}>
          <pc.Icon sx={{ fontSize: 13, color: pc.color }} />
        </Avatar>
        <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" gap={0.5}>
          {(message.toolUse || []).map((t, i) => (
            <Chip
              key={i}
              icon={<Code sx={{ fontSize: '11px !important' }} />}
              label={t.name}
              size="small"
              variant="outlined"
              sx={{ height: 20, fontSize: 10, color: 'text.secondary', borderColor: 'divider' }}
            />
          ))}
          {message.toolUseCount > (message.toolUse?.length || 0) && (
            <Chip
              label={`+${message.toolUseCount - (message.toolUse?.length || 0)}`}
              size="small"
              variant="outlined"
              sx={{ height: 20, fontSize: 10, color: 'text.disabled' }}
            />
          )}
          <Typography variant="caption" color="text.disabled">
            {message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : ''}
          </Typography>
        </Stack>
      </Box>
    );
  }

  const isLinked = message.source === 'claude_ai_linked' || message.source === 'claude_ai_full';

  return (
    <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexDirection: isHuman ? 'row-reverse' : 'row' }}>
      <Tooltip title={`${pc.label}${isLinked && message.conversationTitle ? ` · ${message.conversationTitle}` : ''}`}>
        <Avatar sx={{ width: 28, height: 28, bgcolor: pc.bg, flexShrink: 0, mt: 0.5 }}>
          <pc.Icon sx={{ fontSize: 16, color: pc.color }} />
        </Avatar>
      </Tooltip>
      <Box sx={{ maxWidth: '80%' }}>
        {isLinked && (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 0.3, px: 0.5, fontStyle: 'italic' }}>
            {message.conversationTitle || 'Linked Claude.ai chat'}
          </Typography>
        )}
        <Paper
          variant="outlined"
          sx={{
            p: 1.5,
            bgcolor: hasMatch ? '#fffde7' : isHuman ? 'primary.50' : 'background.default',
            borderColor: hasMatch ? 'warning.main' : isLinked ? '#9c4dcc' : isHuman ? 'primary.200' : 'divider',
            borderRadius: 2,
            borderLeftWidth: isLinked ? 3 : 1,
          }}
        >
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {searchQuery ? highlightText(displayContent, searchQuery) : displayContent}
          </Typography>
          {needsExpand && (
            <Typography
              variant="caption"
              color="primary"
              sx={{ cursor: 'pointer', mt: 0.5, display: 'block' }}
              onClick={() => setExpanded(e => !e)}
            >
              {expanded ? 'Show less' : `Show more (${content.length} chars)`}
            </Typography>
          )}
        </Paper>
        <Stack direction="row" spacing={1} sx={{ mt: 0.3, px: 0.5 }} alignItems="center">
          <Typography variant="caption" color="text.disabled">
            {message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : ''}
          </Typography>
          {isLinked && (
            <Chip label="claude.ai" size="small" variant="outlined"
              sx={{ height: 16, fontSize: 10, color: '#9c4dcc', borderColor: '#9c4dcc' }} />
          )}
          {message.toolUseCount > 0 && (
            <Chip label={`${message.toolUseCount} tools`} size="small" variant="outlined"
              sx={{ height: 16, fontSize: 10 }} />
          )}
        </Stack>
      </Box>
    </Box>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

const GOAL_STATUS_CFG = {
  achieved:    { Icon: EmojiEvents,    muiColor: 'success', iconColor: 'success.main',  label: 'Achieved'    },
  in_progress: { Icon: HourglassEmpty, muiColor: 'warning', iconColor: 'warning.main',  label: 'In progress' },
  pending:     { Icon: PendingActions, muiColor: 'default', iconColor: 'text.disabled', label: 'Pending'     },
  blocked:     { Icon: BlockIcon,      muiColor: 'error',   iconColor: 'error.main',    label: 'Blocked'     },
};

const PROGRESS_COLOR = { complete: 'success', partial: 'warning', not_started: 'error' };

function GoalsSection({ session, sessionId, refetch }) {
  const { analyze, loading, lastSessionId, error, result } = useSessionAnalyzeGoals();

  // Merge fresh result into local session view after analyze completes
  const goalsJson = (result && lastSessionId === sessionId) ? JSON.stringify(result.goals) : session?.goals;
  const goalsProgress = (result && lastSessionId === sessionId) ? result.overallProgress : session?.goalsProgress;
  const goalsSummary = (result && lastSessionId === sessionId) ? result.summary : session?.goalsSummary;
  const pendingActions = (result && lastSessionId === sessionId) ? result.pendingActions : (() => {
    try { return JSON.parse(session?.goalsPendingActions || '[]'); } catch { return []; }
  })();

  const goals = (() => { try { return JSON.parse(goalsJson || '[]'); } catch { return []; } })();
  const hasGoals = goals.length > 0;

  const handleAnalyze = () => analyze(sessionId).then(() => refetch?.());

  return (
    <Box sx={{ mb: 2 }}>
      {/* Section header + button */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: hasGoals ? 1 : 0.5 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ flex: 1 }}>
          GOALS & PROGRESS
        </Typography>
        {goalsProgress && (
          <Chip
            label={goalsProgress.replace('_', ' ')}
            size="small"
            color={PROGRESS_COLOR[goalsProgress] || 'default'}
            sx={{ height: 18, fontSize: 10 }}
          />
        )}
        <Tooltip title={loading && lastSessionId === sessionId ? 'Analyzing…' : error && lastSessionId === sessionId ? `Error: ${error}` : 'Analyze goals'}>
          <span>
            <IconButton
              size="small"
              onClick={handleAnalyze}
              disabled={loading && lastSessionId === sessionId}
              sx={{ p: 0.4 }}
            >
              {loading && lastSessionId === sessionId
                ? <CircularProgress size={14} />
                : <TrackChanges sx={{ fontSize: 16 }} />
              }
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {/* Goals summary sentence */}
      {goalsSummary && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontStyle: 'italic' }}>
          {goalsSummary}
        </Typography>
      )}

      {!hasGoals && (
        <Typography variant="caption" color="text.disabled">
          No goals extracted yet — click <TrackChanges sx={{ fontSize: 12, verticalAlign: 'middle' }} /> to analyze
        </Typography>
      )}

      {/* Goal cards */}
      {goals.map(goal => {
        const cfg = GOAL_STATUS_CFG[goal.status] || GOAL_STATUS_CFG.in_progress;
        return (
          <Paper
            key={goal.goalId}
            variant="outlined"
            sx={{
              mb: 0.75, p: 1,
              bgcolor: 'background.default',
              borderColor: 'divider',
              borderLeftWidth: 3,
              borderLeftStyle: 'solid',
              borderLeftColor: `${cfg.muiColor}.main`,
            }}
          >
            <Stack direction="row" spacing={0.75} alignItems="flex-start">
              <cfg.Icon sx={{ fontSize: 15, color: cfg.iconColor, mt: 0.15, flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" gap={0.25}>
                  <Typography variant="body2" fontWeight={500} color="text.primary" sx={{ flex: 1 }}>
                    {goal.title}
                  </Typography>
                  <Chip
                    label={goal.category || 'task'}
                    size="small"
                    variant="outlined"
                    sx={{ height: 16, fontSize: 10 }}
                  />
                  <Chip
                    label={cfg.label}
                    size="small"
                    color={cfg.muiColor}
                    sx={{ height: 16, fontSize: 10 }}
                  />
                </Stack>
                {goal.description && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                    {goal.description}
                  </Typography>
                )}
                {goal.evidence && (
                  <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.2, fontStyle: 'italic' }}>
                    {goal.evidence}
                  </Typography>
                )}
              </Box>
            </Stack>
          </Paper>
        );
      })}

      {/* Pending actions */}
      {pendingActions.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>PENDING ACTIONS</Typography>
          {pendingActions.map((action, i) => (
            <Stack key={i} direction="row" spacing={0.5} alignItems="flex-start" sx={{ mt: 0.4 }}>
              <RadioButtonUnchecked sx={{ fontSize: 12, color: 'text.disabled', mt: 0.25, flexShrink: 0 }} />
              <Typography variant="caption" color="text.secondary">{action}</Typography>
            </Stack>
          ))}
        </Box>
      )}
    </Box>
  );
}

function OverviewTab({ ctx, refetch }) {
  const { session, segments, linkedEntities, _meta } = ctx;
  const entities = parseEntities(session);
  const sessionId = session?.sessionId;

  return (
    <Box sx={{ p: 2 }}>
      {/* Tags & bookmark */}
      {sessionId && <SessionTagsPanel sessionId={sessionId} />}

      {/* Session summary */}
      {session.summary ? (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>SESSION SUMMARY</Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>{session.summary}</Typography>
        </Paper>
      ) : segments.length > 0 ? (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            SEGMENT SUMMARIES ({segments.length})
          </Typography>
          {segments.filter(s => s.summary).slice(0, 5).map(s => (
            <Box key={s.segmentId || s.index} sx={{ mt: 1 }}>
              <Typography variant="caption" color="text.disabled">Segment {s.index + 1}</Typography>
              <Typography variant="body2">{s.summary}</Typography>
            </Box>
          ))}
        </Paper>
      ) : null}

      {/* Stats */}
      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2, gap: 1 }}>
        <Chip label={`${session.messageCount} messages`} size="small" />
        {session.totalInputTokens > 0 && (
          <Chip label={`${Math.round((session.totalInputTokens + session.totalOutputTokens) / 1000)}k tokens`} size="small" />
        )}
        {session.gitBranch && <Chip label={`branch: ${session.gitBranch}`} size="small" variant="outlined" />}
        {session.model && <Chip label={session.model.split('-').slice(-2).join('-')} size="small" variant="outlined" />}
        {session.projectPath && (
          <Chip label={session.projectPath.split(/[/\\]/).pop()} size="small" variant="outlined" />
        )}
      </Stack>

      {/* Last reanalyzed */}
      {session.lastReanalyzedAt && (
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 2 }}>
          <AutoFixHigh sx={{ fontSize: 13, color: 'text.disabled' }} />
          <Typography variant="caption" color="text.secondary">
            Last re-analyzed: {new Date(session.lastReanalyzedAt).toLocaleString()}
          </Typography>
        </Stack>
      )}

      {/* Entity chips */}
      {entities.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', mb: 0.75 }}>
            TECHNOLOGIES & CONCEPTS
          </Typography>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5}>
            {entities.map(e => (
              <Chip
                key={e.name}
                label={`${e.name} ${Math.round(e.confidence * 100)}%`}
                size="small"
                color={ENTITY_TYPE_COLOR[e.type] || 'default'}
                variant="outlined"
                sx={{ height: 20, fontSize: 11 }}
              />
            ))}
          </Stack>
        </Box>
      )}

      {/* Goals & Progress */}
      {sessionId && <GoalsSection session={session} sessionId={sessionId} refetch={refetch} />}

      {/* Data completeness for AI assistant */}
      {_meta && (
        <Box sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">AI context quality</Typography>
            <Tooltip title="Completeness of structured data for AI assistant analysis">
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                {Math.round((_meta.dataCompleteness || 0) * 100)}%
              </Typography>
            </Tooltip>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={(_meta.dataCompleteness || 0) * 100}
            color={_meta.dataCompleteness >= 0.7 ? 'success' : _meta.dataCompleteness >= 0.4 ? 'warning' : 'error'}
            sx={{ height: 6, borderRadius: 3 }}
          />
          <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} flexWrap="wrap">
            {[
              ['Summary', _meta.hasSegmentSummaries],
              ['Decisions', _meta.hasDecisions],
              ['Entities', _meta.hasLinkedEntities],
              ['Related', _meta.hasRelated],
            ].map(([label, has]) => (
              <Chip
                key={label}
                label={label}
                size="small"
                color={has ? 'success' : 'default'}
                variant={has ? 'filled' : 'outlined'}
                sx={{ height: 18, fontSize: 10 }}
              />
            ))}
          </Stack>
        </Box>
      )}

      {/* Linked entities */}
      {linkedEntities && (
        <>
          {linkedEntities.backlog?.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                BACKLOG ITEMS ({linkedEntities.backlog.length})
              </Typography>
              <List dense disablePadding>
                {linkedEntities.backlog.map(b => (
                  <ListItem key={b.backlogId} disablePadding sx={{ py: 0.3 }}>
                    <LinkIcon fontSize="small" sx={{ mr: 1, color: 'text.disabled' }} />
                    <ListItemText
                      primary={b.title}
                      secondary={b.backlogId}
                      primaryTypographyProps={{ variant: 'body2' }}
                      secondaryTypographyProps={{ variant: 'caption' }}
                    />
                    {b.status && <Chip label={b.status} size="small" />}
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
          {linkedEntities.codex?.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                CODEX RULES ({linkedEntities.codex.length})
              </Typography>
              <List dense disablePadding>
                {linkedEntities.codex.map(r => (
                  <ListItem key={r.codexId} disablePadding sx={{ py: 0.3 }}>
                    <LinkIcon fontSize="small" sx={{ mr: 1, color: 'text.disabled' }} />
                    <ListItemText
                      primary={r.title}
                      secondary={r.codexId}
                      primaryTypographyProps={{ variant: 'body2' }}
                      secondaryTypographyProps={{ variant: 'caption' }}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
          {linkedEntities.catalog?.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                KNOWLEDGE GRAPH ({linkedEntities.catalog.length})
              </Typography>
              <List dense disablePadding>
                {linkedEntities.catalog.map(e => (
                  <ListItem key={e.entryId} disablePadding sx={{ py: 0.3 }}>
                    <LinkIcon fontSize="small" sx={{ mr: 1, color: 'text.disabled' }} />
                    <ListItemText
                      primary={e.title}
                      secondary={e.graphType}
                      primaryTypographyProps={{ variant: 'body2' }}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
        </>
      )}

      {/* Navigator links */}
      {sessionId && <SessionNavigatorPanel sessionId={sessionId} />}

      {/* AI assistant placeholder */}
      <Alert
        severity="info"
        icon={<SmartToy />}
        sx={{ mt: 2, bgcolor: 'background.default' }}
      >
        <Typography variant="body2" fontWeight={500}>AI Assistant</Typography>
        <Typography variant="caption">
          Контекстный анализ этой сессии будет доступен здесь — поиск по решениям,
          связям с другими чатами, и объяснение архитектурных выборов.
          Данные для ассистента готовы (completeness: {Math.round((_meta?.dataCompleteness || 0) * 100)}%).
        </Typography>
      </Alert>
    </Box>
  );
}

// ── Thread Tab ────────────────────────────────────────────────────────────────

// ── Linked Conversation Block (hierarchical branch view) ───────────────────────

function LinkedConversationBlock({ conversation, searchQuery }) {
  const [contextOpen, setContextOpen] = useState(false);
  const msgs = conversation.messages || [];
  const contextMsgs = msgs.filter(m => m.branchType === 'context');
  const exchangeMsgs = msgs.filter(m => m.branchType !== 'context');
  const webUrl = conversation.webUrl || `https://claude.ai/chat/${conversation.conversationId}`;
  const isFull = conversation.source === 'claude_ai_full';

  return (
    <Box sx={{ border: '2px solid', borderColor: '#9c4dcc44', borderRadius: 2, mb: 2, overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ px: 2, py: 0.75, bgcolor: '#f3e5f5', display: 'flex', alignItems: 'center', gap: 1 }}>
        <Chat sx={{ fontSize: 15, color: '#7b1fa2', flexShrink: 0 }} />
        <Typography variant="caption" fontWeight={700} color="#7b1fa2" sx={{ flex: 1, letterSpacing: 0.3 }}>
          {conversation.title || `Chat ${conversation.conversationId?.slice(0, 8)}`}
        </Typography>
        <Chip
          label={isFull ? `${msgs.length} msgs (full)` : `${msgs.length} msgs`}
          size="small"
          sx={{ height: 18, fontSize: 10, bgcolor: isFull ? '#e8f5e9' : undefined, color: isFull ? '#2e7d32' : undefined }}
        />
        <Tooltip title="Open in Claude.ai">
          <IconButton size="small" component="a" href={webUrl} target="_blank" rel="noopener noreferrer" sx={{ p: 0.3 }}>
            <OpenInNew sx={{ fontSize: 13, color: '#7b1fa2' }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Context section (messages before Claude Code joined) */}
      {contextMsgs.length > 0 && (
        <>
          <Box
            sx={{ px: 2, py: 0.6, bgcolor: '#ede7f6', display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', '&:hover': { bgcolor: '#e8eaf6' } }}
            onClick={() => setContextOpen(v => !v)}
          >
            {contextOpen ? <ExpandLess sx={{ fontSize: 14 }} /> : <ExpandMore sx={{ fontSize: 14 }} />}
            <Typography variant="caption" color="text.secondary">
              {contextOpen ? 'Hide' : 'Show'} {contextMsgs.length} prior message{contextMsgs.length !== 1 ? 's' : ''} (before Claude Code joined)
            </Typography>
          </Box>
          <Collapse in={contextOpen}>
            <Box sx={{ px: 1.5, py: 1, bgcolor: '#fafafa', opacity: 0.85 }}>
              {contextMsgs.map((msg, i) => (
                <MessageBubble key={msg.messageId || i} message={msg} searchQuery={searchQuery} />
              ))}
            </Box>
          </Collapse>
        </>
      )}

      {/* Exchange messages (CC ↔ Claude Chat) */}
      {exchangeMsgs.length > 0 && (
        <Box sx={{ px: 1.5, py: 1 }}>
          {contextMsgs.length > 0 && (
            <Typography variant="caption" color="#7b1fa2" fontWeight={600} sx={{ display: 'block', mb: 0.75, ml: 0.5 }}>
              ↕ Claude Code exchange
            </Typography>
          )}
          {exchangeMsgs.map((msg, i) => (
            <MessageBubble key={msg.messageId || i} message={msg} searchQuery={searchQuery} />
          ))}
        </Box>
      )}

      {msgs.length === 0 && (
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="caption" color="text.disabled">No messages extracted yet — run Reanalyze to fetch history</Typography>
        </Box>
      )}
    </Box>
  );
}

function ThreadTab({ ctx, messages, messagesLoading }) {
  const { session, thread } = ctx;
  const sessionId = session?.sessionId;
  const [query, setQuery] = useState('');
  const [participant, setParticipant] = useState('all');
  const [showLinked, setShowLinked] = useState(true);
  const inputRef = useRef(null);

  const { conversations: linkedConversations } = useLinkedConversations(sessionId);

  // CC session messages only (flat, sorted)
  const ccMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return ta - tb;
    });
  }, [messages]);

  const filtered = useMemo(() => {
    if (!ccMessages.length) return ccMessages;
    return ccMessages.filter(msg => {
      if (!msg.content?.trim() && !msg.toolUseCount) return false;
      if (participant !== 'all') {
        const isUser = getParticipant(msg) === PARTICIPANT_CONFIG.user;
        if (participant === 'human' && !isUser) return false;
        if (participant === 'assistant' && isUser) return false;
      }
      if (query.trim()) {
        const q = query.toLowerCase();
        const inContent = (msg.content || '').toLowerCase().includes(q);
        const inTools = (msg.toolUse || []).some(t => t.name.toLowerCase().includes(q));
        return inContent || inTools;
      }
      return true;
    });
  }, [ccMessages, query, participant]);

  // Build hierarchical render list: interleave CC messages with linked conversation panels
  // Each panel is inserted at the point where CC first contacted that chat (firstCcTimestamp)
  const renderList = useMemo(() => {
    if (!showLinked || linkedConversations.length === 0) {
      return filtered.map(m => ({ type: 'message', message: m }));
    }

    const panels = linkedConversations
      .filter(c => c.messages?.length || true)
      .map(c => ({
        type: 'conv_panel',
        key: `panel-${c.conversationId}`,
        conversation: c,
        insertTs: c.firstCcTimestamp ? new Date(c.firstCcTimestamp).getTime() : Infinity,
      }))
      .sort((a, b) => a.insertTs - b.insertTs);

    const result = [];
    let panelIdx = 0;

    for (const msg of filtered) {
      const msgTs = msg.timestamp ? new Date(msg.timestamp).getTime() : 0;
      // Insert panels whose insertion point falls before or at this message
      while (panelIdx < panels.length && panels[panelIdx].insertTs <= msgTs) {
        result.push(panels[panelIdx]);
        panelIdx++;
      }
      result.push({ type: 'message', message: msg });
    }
    // Append any remaining panels after all CC messages
    while (panelIdx < panels.length) {
      result.push(panels[panelIdx]);
      panelIdx++;
    }
    return result;
  }, [filtered, linkedConversations, showLinked]);

  const hasFilter = query.trim() || participant !== 'all';
  const linkedMsgCount = linkedConversations.reduce((s, c) => s + (c.messageCount || 0), 0);

  // Participant list from session node (stored after reanalyze)
  const participants = useMemo(() => {
    try { return JSON.parse(session?.participants || '[]'); } catch { return []; }
  }, [session?.participants]);

  return (
    <Box>
      {/* Participants header */}
      {participants.length > 0 && (
        <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" gap={0.5}>
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mr: 0.5 }}>
              {participants.length} PARTICIPANTS
            </Typography>
            {participants.map((p, i) => {
              const IconComp = p.type === 'user' ? Person
                : p.type === 'claude_code' ? Code
                : Chat;
              const color = p.type === 'user' ? '#1976d2'
                : p.type === 'claude_code' ? '#6d4c41'
                : '#7b1fa2';
              if (p.type === 'claude_code' && p.vsCodeUrl) {
                return (
                  <Chip
                    key={i}
                    size="small"
                    icon={<IconComp sx={{ fontSize: '12px !important', color: `${color} !important` }} />}
                    label={p.label}
                    variant="outlined"
                    clickable
                    onClick={() => { window.location.href = p.vsCodeUrl; }}
                    sx={{ height: 22, fontSize: 10, borderColor: color, color }}
                  />
                );
              }
              if (p.type === 'claude_ai' && p.webUrl) {
                return (
                  <Chip
                    key={i}
                    size="small"
                    icon={<IconComp sx={{ fontSize: '12px !important', color: `${color} !important` }} />}
                    label={p.label}
                    variant="outlined"
                    clickable
                    component="a"
                    href={p.webUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ height: 22, fontSize: 10, borderColor: color, color, textDecoration: 'none' }}
                  />
                );
              }
              return (
                <Chip
                  key={i}
                  size="small"
                  icon={<IconComp sx={{ fontSize: '12px !important' }} />}
                  label={p.label}
                  variant="outlined"
                  sx={{ height: 22, fontSize: 10 }}
                />
              );
            })}
          </Stack>
          <Divider sx={{ mt: 1 }} />
        </Box>
      )}

      {/* Cross-session thread indicator */}
      {thread?.sessions?.length > 1 && (
        <Box sx={{ px: 2, pt: 2, pb: 1 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            CONVERSATION THREAD ({thread.totalSessions} sessions)
          </Typography>
          <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap">
            {thread.sessions.map(s => (
              <Chip
                key={s.sessionId}
                label={s.title?.slice(0, 30) || s.sessionId.slice(0, 10)}
                size="small"
                color={s.sessionId === session.sessionId ? 'primary' : 'default'}
                variant={s.sessionId === session.sessionId ? 'filled' : 'outlined'}
                icon={s.platform === 'claude_code' ? <Code sx={{ fontSize: '12px !important' }} /> : <Chat sx={{ fontSize: '12px !important' }} />}
              />
            ))}
          </Stack>
          <Divider sx={{ mt: 1.5 }} />
        </Box>
      )}

      {/* Search + filter bar */}
      <Box sx={{ px: 2, pt: 1.5, pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Paper
          variant="outlined"
          sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 0.5, mb: 1 }}
        >
          <Search sx={{ color: 'text.disabled', fontSize: 18, mr: 1, flexShrink: 0 }} />
          <InputBase
            inputRef={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search messages…"
            sx={{ flex: 1, fontSize: '0.875rem' }}
            inputProps={{ 'aria-label': 'search messages' }}
          />
          {query && (
            <IconButton size="small" onClick={() => { setQuery(''); inputRef.current?.focus(); }}>
              <Clear fontSize="small" />
            </IconButton>
          )}
        </Paper>

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" gap={0.5}>
          <ToggleButtonGroup
            value={participant}
            exclusive
            onChange={(_, v) => { if (v !== null) setParticipant(v); }}
            size="small"
            sx={{ '& .MuiToggleButton-root': { py: 0.3, px: 1, fontSize: '0.75rem', textTransform: 'none' } }}
          >
            <ToggleButton value="all">All</ToggleButton>
            <ToggleButton value="human">You</ToggleButton>
            <ToggleButton value="assistant">Claude</ToggleButton>
          </ToggleButtonGroup>

          {linkedConversations.length > 0 && (
            <Chip
              label={`+ ${linkedMsgCount} from Claude.ai`}
              size="small"
              variant={showLinked ? 'filled' : 'outlined'}
              color={showLinked ? 'secondary' : 'default'}
              onClick={() => setShowLinked(v => !v)}
              sx={{ height: 22, fontSize: 10, cursor: 'pointer', borderColor: '#9c4dcc', color: showLinked ? undefined : '#9c4dcc' }}
            />
          )}

          {hasFilter && (
            <Typography variant="caption" color={filtered.length === 0 ? 'error' : 'text.secondary'}>
              {filtered.length} / {ccMessages.length}
            </Typography>
          )}
          {hasFilter && (
            <Typography
              variant="caption"
              color="primary"
              sx={{ cursor: 'pointer' }}
              onClick={() => { setQuery(''); setParticipant('all'); }}
            >
              Clear
            </Typography>
          )}
        </Stack>
      </Box>

      {/* Messages (hierarchical: CC thread + linked conversation panels) */}
      <Box sx={{ px: 2, pt: 1.5, pb: 2 }}>
        {messagesLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : ccMessages.length === 0 && linkedConversations.length === 0 ? (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
            No messages loaded
          </Typography>
        ) : filtered.length === 0 && (!showLinked || linkedConversations.length === 0) ? (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
            No messages match "{query}"
          </Typography>
        ) : (
          renderList.map((item, idx) =>
            item.type === 'conv_panel' ? (
              <LinkedConversationBlock
                key={item.key}
                conversation={item.conversation}
                searchQuery={query.trim() || null}
              />
            ) : (
              <MessageBubble
                key={item.message.messageId || idx}
                message={item.message}
                platform={session.platform}
                searchQuery={query.trim() || null}
              />
            )
          )
        )}
      </Box>
    </Box>
  );
}

// ── Decisions Tab ─────────────────────────────────────────────────────────────

function DecisionsTab({ decisions }) {
  const total = (decisions?.accepted?.length || 0) + (decisions?.proposed?.length || 0) + (decisions?.rejected?.length || 0);

  if (!total) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">No architectural decisions extracted for this session</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      {decisions.accepted?.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <CheckCircle color="success" fontSize="small" />
            <Typography variant="subtitle2">Accepted ({decisions.accepted.length})</Typography>
          </Stack>
          {decisions.accepted.map(d => <DecisionCard key={d.decisionId} decision={d} type="accepted" />)}
        </Box>
      )}
      {decisions.proposed?.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <HelpOutline color="warning" fontSize="small" />
            <Typography variant="subtitle2">Proposed / Low confidence ({decisions.proposed.length})</Typography>
          </Stack>
          {decisions.proposed.map(d => <DecisionCard key={d.decisionId} decision={d} type="proposed" />)}
        </Box>
      )}
      {decisions.rejected?.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <Cancel color="error" fontSize="small" />
            <Typography variant="subtitle2">Rejected alternatives ({decisions.rejected.length})</Typography>
          </Stack>
          {decisions.rejected.map(d => <DecisionCard key={d.decisionId} decision={d} type="rejected" />)}
        </Box>
      )}
    </Box>
  );
}

function SessionMiniCard({ session }) {
  const smart = parseSmartTitle(session.title, session.summary);
  const topics = parseTopics(session.summary);
  const type = inferSessionType(session.title, session.summary);
  const style = SESSION_TYPE_STYLE[type];
  return (
    <Box>
      <Typography variant="body2" fontWeight={500} sx={{
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {smart}
      </Typography>
      <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" gap={0.5}>
        <Chip label={type} size="small" variant="outlined"
          sx={{ height: 18, fontSize: 10, borderColor: style.border, color: style.color, fontWeight: 600 }} />
        {topics.map(t => (
          <Chip key={t} label={t} size="small" variant="outlined"
            sx={{ height: 18, fontSize: 10, color: 'text.secondary' }} />
        ))}
      </Stack>
    </Box>
  );
}

// ── Related Tab ───────────────────────────────────────────────────────────────

function RelatedTab({ sessionId, relatedSessions, thread }) {
  return (
    <Box sx={{ p: 2 }}>
      {/* ProvenanceChain: direct CONTINUES_FROM graph chain */}
      {sessionId && (
        <Box sx={{ mb: 2 }}>
          <ProvenanceChain type="session" nodeId={sessionId} />
        </Box>
      )}

      {relatedSessions?.length > 0 && (
        <>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            Semantically related sessions
          </Typography>
        </>
      )}
      {relatedSessions?.map(s => (
        <Paper key={s.sessionId} variant="outlined" sx={{ p: 1.5, mb: 1 }}>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <PlatformChip platform={s.platform} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <SessionMiniCard session={s} />
              <Stack direction="row" spacing={1} sx={{ mt: 0.75 }}>
                <Chip
                  label={`${Math.round((s.score || 0) * 100)}% similarity`}
                  size="small"
                  color={(s.score || 0) >= 0.7 ? 'success' : 'warning'}
                />
                {s.startedAt && (
                  <Typography variant="caption" color="text.disabled" sx={{ alignSelf: 'center' }}>
                    {new Date(s.startedAt).toLocaleDateString()}
                  </Typography>
                )}
              </Stack>
            </Box>
          </Stack>
        </Paper>
      ))}

      {!relatedSessions?.length && !sessionId && (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
          No connected sessions found
        </Typography>
      )}
    </Box>
  );
}

// ── Main Drawer ───────────────────────────────────────────────────────────────

export default function SessionDetailDrawer({ sessionId, onClose }) {
  const [tab, setTab] = useState(0);
  const [analysisModel, setAnalysisModel] = useState('claude-sonnet-4-6');
  const { context, loading: ctxLoading, error: ctxError, refetch } = useSessionContext(sessionId);
  const { reanalyze, loading: reanalyzeLoading } = useSessionReanalyze();
  const { session: sessionWithMessages, loading: msgLoading } = useDialogueSession(
    tab === 1 ? sessionId : null // lazy load messages only when Thread tab is active
  );

  const messages = sessionWithMessages?.messages || [];
  const open = !!sessionId;

  const totalDecisions = context
    ? (context.decisions?.accepted?.length || 0) +
      (context.decisions?.proposed?.length || 0) +
      (context.decisions?.rejected?.length || 0)
    : 0;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 640, md: 720 } } }}
    >
      {/* Header */}
      <Box sx={{
        px: 2, py: 1.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
        position: 'sticky', top: 0, bgcolor: 'background.paper', zIndex: 1,
      }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {ctxLoading ? (
            <CircularProgress size={16} />
          ) : context ? (
            <>
              <Typography variant="subtitle1" fontWeight={600} noWrap>
                {parseSmartTitle(context.session?.title, context.session?.summary) || 'Session Detail'}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 0.3 }}>
                <PlatformChip platform={context.session?.platform} />
                {context.session?.startedAt && (
                  <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                    {new Date(context.session.startedAt).toLocaleString()}
                  </Typography>
                )}
              </Stack>
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">{sessionId}</Typography>
          )}
        </Box>
        <Stack direction="row" spacing={0.5} sx={{ mt: 0.3, flexShrink: 0 }} alignItems="center">
          {sessionId && <SessionActions sessionId={sessionId} />}
          <ToggleButtonGroup
            value={analysisModel}
            exclusive
            onChange={(_e, v) => { if (v) setAnalysisModel(v); }}
            size="small"
            disabled={reanalyzeLoading}
            sx={{ height: 28 }}
          >
            <ToggleButton value="claude-haiku-4-5-20251001" sx={{ px: 1, fontSize: '0.65rem', textTransform: 'none' }}>
              Haiku
            </ToggleButton>
            <ToggleButton value="claude-sonnet-4-6" sx={{ px: 1, fontSize: '0.65rem', textTransform: 'none' }}>
              Sonnet
            </ToggleButton>
            <ToggleButton value="claude-opus-4-7" sx={{ px: 1, fontSize: '0.65rem', textTransform: 'none' }}>
              Opus
            </ToggleButton>
            <ToggleButton
              value="claude-code"
              sx={{ px: 1, fontSize: '0.65rem', textTransform: 'none', fontWeight: 600 }}
            >
              CC
            </ToggleButton>
          </ToggleButtonGroup>
          <Tooltip title={
            analysisModel === 'claude-code'
              ? 'Re-run analysis via Claude Code agent (subprocess)'
              : `Re-run AI analysis using ${analysisModel}`
          }>
            <span>
              <IconButton
                size="small"
                disabled={reanalyzeLoading || !sessionId}
                onClick={() => reanalyze(sessionId, analysisModel)}
              >
                {reanalyzeLoading
                  ? <CircularProgress size={16} />
                  : <AutoFixHigh fontSize="small" />
                }
              </IconButton>
            </span>
          </Tooltip>
          <IconButton size="small" onClick={onClose}>
            <Close fontSize="small" />
          </IconButton>
        </Stack>
      </Box>

      {ctxError && (
        <Alert severity="error" sx={{ m: 2 }}>{ctxError}</Alert>
      )}

      <ReanalyzeProgress sessionId={sessionId} onDone={refetch} />

      {context && (
        <>
          {/* Tab bar */}
          <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 1 }}>
            <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
              <Tab label="Overview" />
              <Tab label={`Thread (${context.session?.messageCount || 0})`} />
              <Tab label={`Decisions (${totalDecisions})`} />
              <Tab label={`Related (${context.relatedSessions?.length || 0})`} />
            </Tabs>
          </Box>

          {/* Tab content */}
          <Box sx={{ overflow: 'auto', flex: 1 }}>
            {tab === 0 && <OverviewTab ctx={context} refetch={refetch} />}
            {tab === 1 && (
              <ThreadTab
                ctx={context}
                messages={messages}
                messagesLoading={msgLoading}
              />
            )}
            {tab === 2 && <DecisionsTab decisions={context.decisions} />}
            {tab === 3 && (
              <RelatedTab
                sessionId={sessionId}
                relatedSessions={context.relatedSessions}
                thread={context.thread}
              />
            )}
          </Box>
        </>
      )}
    </Drawer>
  );
}
