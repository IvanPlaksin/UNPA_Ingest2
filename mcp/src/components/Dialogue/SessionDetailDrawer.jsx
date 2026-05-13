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

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Drawer, Box, Typography, Tabs, Tab, Chip, IconButton, CircularProgress,
  Divider, Stack, Paper, Tooltip, LinearProgress, Avatar,
  List, ListItem, ListItemText, ListItemAvatar, Collapse,
  Alert, InputBase, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import {
  Close, Timeline, Lightbulb, Hub, CheckCircle, Cancel, HelpOutline,
  SmartToy, Person, Link as LinkIcon, OpenInNew, ExpandMore, ExpandLess,
  Code, Chat, AutoAwesome, Search, Clear, AutoFixHigh, Refresh,
} from '@mui/icons-material';
import { useSessionContext, useDialogueSession, useSessionReanalyze } from '../../hooks/useDialogue';
import { useWebSocketListener } from '../../hooks/useWebSocket';
import ProvenanceChain from './ProvenanceChain';
import {
  parseSmartTitle, parseTopics, inferSessionType, SESSION_TYPE_STYLE,
  parseEntities, ENTITY_TYPE_COLOR,
} from './session-meta';

// ── Re-analyze progress panel ─────────────────────────────────────────────────

const STEP_LABELS_TOTAL = 3;

function ReanalyzeProgress({ sessionId, onDone }) {
  const [steps, setSteps] = useState([]);
  const [status, setStatus] = useState(null); // null | 'running' | 'done' | 'error'

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
    if (msg.status === 'done' && msg.step === STEP_LABELS_TOTAL) {
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
        {Array.from({ length: STEP_LABELS_TOTAL }, (_, i) => {
          const s = steps.find(x => x.step === i + 1);
          const isDone = s?.status === 'done';
          const isRunning = s?.status === 'running';
          return (
            <Box key={i}>
              <Stack direction="row" spacing={1} alignItems="center">
                {isDone
                  ? <CheckCircle sx={{ fontSize: 14, flexShrink: 0 }} color="success" />
                  : isRunning
                    ? <CircularProgress size={12} sx={{ flexShrink: 0 }} />
                    : <Box sx={{ width: 14, height: 14, borderRadius: '50%', border: '1px solid', borderColor: 'divider', flexShrink: 0 }} />
                }
                <Typography variant="caption" color={isDone ? 'success.main' : isRunning ? 'text.primary' : 'text.disabled'} fontWeight={isRunning ? 500 : 400}>
                  {s?.label || `Step ${i + 1}`}
                </Typography>
              </Stack>
              {isDone && s?.result && (
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

const PARTICIPANT_CONFIG = {
  human: { label: 'You', color: '#1976d2', Icon: Person, bg: '#e3f2fd' },
  assistant: { label: 'Claude Code', color: '#6d4c41', Icon: SmartToy, bg: '#efebe9' },
  claude: { label: 'Claude', color: '#7b1fa2', Icon: AutoAwesome, bg: '#f3e5f5' },
  claude_code: { label: 'Claude Code', color: '#6d4c41', Icon: Code, bg: '#efebe9' },
  claude_ai: { label: 'Claude.ai', color: '#7b1fa2', Icon: Chat, bg: '#f3e5f5' },
};

function getParticipant(message, platform) {
  const p = (message.participant || '').toLowerCase();
  const r = message.role;
  if (r === 'user' || p === 'human' || p === 'ivan') return PARTICIPANT_CONFIG.human;
  if (p === 'claude code' || p === 'claude_code') return PARTICIPANT_CONFIG.assistant;
  if (p === 'claude') return PARTICIPANT_CONFIG.claude;
  if (r === 'assistant' && platform === 'claude_code') return PARTICIPANT_CONFIG.assistant;
  if (r === 'assistant') return PARTICIPANT_CONFIG.claude;
  return PARTICIPANT_CONFIG.human;
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
  const pc = getParticipant(message, platform);
  const isHuman = message.role === 'user';
  const [expanded, setExpanded] = useState(false);
  const content = message.content || '';
  const PREVIEW = 300;
  const hasMatch = searchQuery && content.toLowerCase().includes(searchQuery.toLowerCase());
  const needsExpand = !hasMatch && content.length > PREVIEW;
  const displayContent = needsExpand && !expanded ? content.slice(0, PREVIEW) + '…' : content;

  return (
    <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexDirection: isHuman ? 'row-reverse' : 'row' }}>
      <Tooltip title={pc.label}>
        <Avatar sx={{ width: 28, height: 28, bgcolor: pc.bg, flexShrink: 0, mt: 0.5 }}>
          <pc.Icon sx={{ fontSize: 16, color: pc.color }} />
        </Avatar>
      </Tooltip>
      <Box sx={{ maxWidth: '80%' }}>
        <Paper
          variant="outlined"
          sx={{
            p: 1.5,
            bgcolor: hasMatch ? '#fffde7' : isHuman ? 'primary.50' : 'background.default',
            borderColor: hasMatch ? 'warning.main' : isHuman ? 'primary.200' : 'divider',
            borderRadius: 2,
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

function OverviewTab({ ctx }) {
  const { session, segments, linkedEntities, _meta } = ctx;
  const entities = parseEntities(session);

  return (
    <Box sx={{ p: 2 }}>
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

function ThreadTab({ ctx, messages, messagesLoading }) {
  const { session, thread } = ctx;
  const [query, setQuery] = useState('');
  const [participant, setParticipant] = useState('all');
  const inputRef = useRef(null);

  const filtered = useMemo(() => {
    if (!messages.length) return messages;
    return messages.filter(msg => {
      if (participant !== 'all') {
        const isHuman = msg.role === 'user';
        if (participant === 'human' && !isHuman) return false;
        if (participant === 'assistant' && isHuman) return false;
      }
      if (query.trim()) {
        return (msg.content || '').toLowerCase().includes(query.toLowerCase());
      }
      return true;
    });
  }, [messages, query, participant]);

  const hasFilter = query.trim() || participant !== 'all';

  return (
    <Box>
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

        <Stack direction="row" spacing={1} alignItems="center">
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

          {hasFilter && (
            <Typography variant="caption" color={filtered.length === 0 ? 'error' : 'text.secondary'}>
              {filtered.length} / {messages.length} messages
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

      {/* Messages */}
      <Box sx={{ px: 2, pt: 1.5, pb: 2 }}>
        {messagesLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : messages.length === 0 ? (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
            No messages loaded
          </Typography>
        ) : filtered.length === 0 ? (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
            No messages match "{query}"
          </Typography>
        ) : (
          filtered.map((msg, idx) => (
            <MessageBubble
              key={msg.messageId || idx}
              message={msg}
              platform={session.platform}
              searchQuery={query.trim() || null}
            />
          ))
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
        <Stack direction="row" spacing={0.5} sx={{ mt: 0.3, flexShrink: 0 }}>
          <Tooltip title="Re-run AI analysis (summary, entities, decisions)">
            <span>
              <IconButton
                size="small"
                disabled={reanalyzeLoading || !sessionId}
                onClick={() => reanalyze(sessionId)}
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
            {tab === 0 && <OverviewTab ctx={context} />}
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
