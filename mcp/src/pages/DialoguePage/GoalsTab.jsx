import React, { useState, useMemo, useCallback } from 'react';
import {
  Box, Typography, Stack, Chip, Paper, InputBase, IconButton,
  Select, MenuItem, FormControl, Pagination, Collapse,
  Tooltip, CircularProgress, Divider, Alert,
} from '@mui/material';
import {
  Search, Clear, ExpandMore, ExpandLess,
  EmojiEvents, HourglassEmpty, RadioButtonUnchecked,
  Block as BlockIcon, PendingActions, TrackChanges,
  CheckCircle, AutoFixHigh,
} from '@mui/icons-material';
import { useDialogueSessions, useSessionAnalyzeGoals } from '../../hooks/useDialogue';
import { parseSmartTitle } from '../../components/Dialogue/session-meta';
import OpenTasksReportPanel from './OpenTasksReportPanel';
import { useWebSocketListener } from '../../hooks/useWebSocket';

// ── Inline analysis progress (WebSocket-driven) ────────────────────────────────

function GoalsAnalysisProgress({ sessionId }) {
  const [steps, setSteps] = useState([]);
  const [status, setStatus] = useState(null);

  useWebSocketListener(useCallback((msg) => {
    if (msg.type !== 'dialogue:reanalyze' || msg.sessionId !== sessionId) return;
    setStatus(msg.status);
    setSteps(prev => {
      const next = { step: msg.step, label: msg.label, status: msg.status, result: msg.result ?? null };
      const idx = prev.findIndex(s => s.step === msg.step);
      if (idx !== -1) { const u = [...prev]; u[idx] = next; return u; }
      return [...prev, next];
    });
    if (msg.status === 'done' || msg.status === 'error') {
      setTimeout(() => setSteps([]), 3000);
    }
  }, [sessionId]));

  if (!steps.length) return null;

  return (
    <Box sx={{ mt: 0.5, px: 1.5, py: 1, bgcolor: 'action.hover', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.75 }}>
        <AutoFixHigh sx={{ fontSize: 13, color: 'primary.main' }} />
        <Typography variant="caption" fontWeight={600} color="primary.main">Claude Code analysis</Typography>
        {status === 'done' && <Chip label="Done" size="small" color="success" sx={{ height: 16, fontSize: 12 }} />}
        {status === 'error' && <Chip label="Error" size="small" color="error" sx={{ height: 16, fontSize: 12 }} />}
      </Stack>
      <Stack spacing={0.5}>
        {steps.map((s, i) => (
          <Stack key={i} direction="row" spacing={0.75} alignItems="center">
            {s.status === 'done'
              ? <CheckCircle sx={{ fontSize: 13, color: 'success.main', flexShrink: 0 }} />
              : s.status === 'error'
                ? <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: 'error.main', flexShrink: 0 }} />
                : <CircularProgress size={10} sx={{ flexShrink: 0 }} />
            }
            <Typography variant="caption" color={s.status === 'done' ? 'success.main' : s.status === 'error' ? 'error.main' : 'text.primary'}>
              {s.label}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

// ── Goal status config ─────────────────────────────────────────────────────────

const STATUS_CFG = {
  achieved:    { Icon: EmojiEvents,          color: 'success.main', label: 'Achieved',     done: true  },
  in_progress: { Icon: HourglassEmpty,       color: 'warning.main', label: 'In progress',  done: false },
  pending:     { Icon: RadioButtonUnchecked, color: 'text.disabled',label: 'Pending',      done: false },
  blocked:     { Icon: BlockIcon,            color: 'error.main',   label: 'Blocked',      done: false },
};

const PROGRESS_COLOR = { complete: 'success', partial: 'warning', not_started: 'default' };

const PAGE_SIZE = 10;

// ── Parse goals from session ───────────────────────────────────────────────────

function parseGoals(session) {
  if (!session.goals) return [];
  try {
    const g = JSON.parse(session.goals);
    return Array.isArray(g) ? g : [];
  } catch { return []; }
}

// ── Goal row ───────────────────────────────────────────────────────────────────

function GoalRow({ goal, highlight }) {
  const cfg = STATUS_CFG[goal.status] || STATUS_CFG.pending;
  const title = goal.title || '';
  const desc  = goal.description || '';

  function hl(text) {
    if (!highlight) return text;
    const idx = text.toLowerCase().indexOf(highlight.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: '#fff176', borderRadius: 2, padding: '0 1px' }}>
          {text.slice(idx, idx + highlight.length)}
        </mark>
        {text.slice(idx + highlight.length)}
      </>
    );
  }

  return (
    <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ py: 0.5 }}>
      <Tooltip title={cfg.label}>
        <cfg.Icon sx={{ fontSize: 14, color: cfg.color, mt: 0.3, flexShrink: 0 }} />
      </Tooltip>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={500} color="text.primary">
          {hl(title)}
        </Typography>
        {desc && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {hl(desc)}
          </Typography>
        )}
        {goal.evidence && (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', fontStyle: 'italic' }}>
            {goal.evidence}
          </Typography>
        )}
      </Box>
      {goal.category && (
        <Chip label={goal.category} size="small" variant="outlined"
          sx={{ height: 16, fontSize: 12, flexShrink: 0 }} />
      )}
    </Stack>
  );
}

// ── Goals panel (collapsible) ──────────────────────────────────────────────────

function GoalsPanel({ session, highlight }) {
  const [open, setOpen] = useState(false);
  const { analyze, loading, lastSessionId } = useSessionAnalyzeGoals();

  const goals   = parseGoals(session);
  const done    = goals.filter(g => STATUS_CFG[g.status]?.done);
  const open_   = goals.filter(g => !STATUS_CFG[g.status]?.done);
  const hasGoals = goals.length > 0;

  // Filter sublists by highlight
  function filterGoals(list) {
    if (!highlight) return list;
    const q = highlight.toLowerCase();
    return list.filter(g =>
      (g.title || '').toLowerCase().includes(q) ||
      (g.description || '').toLowerCase().includes(q) ||
      (g.evidence || '').toLowerCase().includes(q)
    );
  }

  const doneFilt  = filterGoals(done);
  const openFilt  = filterGoals(open_);
  const anyMatch  = !highlight || doneFilt.length + openFilt.length > 0;

  if (!anyMatch) return null;

  const progress = session.goalsProgress;
  const isLoading = loading && lastSessionId === session.sessionId;

  return (
    <Box sx={{ mt: 1 }}>
      {/* Collapse trigger */}
      <Paper
        variant="outlined"
        onClick={() => setOpen(v => !v)}
        sx={{
          px: 1.5, py: 0.75,
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
          bgcolor: open ? 'action.selected' : 'background.paper',
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          {open ? <ExpandLess sx={{ fontSize: 16 }} /> : <ExpandMore sx={{ fontSize: 16 }} />}

          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flex: 1 }} flexWrap="wrap">
            {hasGoals ? (
              <>
                {done.length > 0 && (
                  <Stack direction="row" spacing={0.4} alignItems="center">
                    <EmojiEvents sx={{ fontSize: 13, color: 'success.main' }} />
                    <Typography variant="caption" fontWeight={600} color="success.main">
                      {done.length} completed
                    </Typography>
                  </Stack>
                )}
                {done.length > 0 && open_.length > 0 && (
                  <Typography variant="caption" color="text.disabled">·</Typography>
                )}
                {open_.length > 0 && (
                  <Stack direction="row" spacing={0.4} alignItems="center">
                    <PendingActions sx={{ fontSize: 13, color: 'warning.main' }} />
                    <Typography variant="caption" fontWeight={600} color="warning.main">
                      {open_.length} open
                    </Typography>
                  </Stack>
                )}
                {progress && (
                  <Chip
                    label={progress.replace('_', ' ')}
                    size="small"
                    color={PROGRESS_COLOR[progress] || 'default'}
                    sx={{ height: 16, fontSize: 12 }}
                  />
                )}
              </>
            ) : (
              <Typography variant="caption" color="text.disabled">No goals analyzed</Typography>
            )}
          </Stack>

          {/* Analyze button */}
          <Tooltip title={isLoading ? 'Analyzing…' : 'Analyze goals'}>
            <span>
              <IconButton
                size="small"
                onClick={e => { e.stopPropagation(); analyze(session.sessionId); }}
                disabled={isLoading}
                sx={{ p: 0.3, opacity: 0.5, '&:hover': { opacity: 1 } }}
              >
                {isLoading
                  ? <CircularProgress size={13} />
                  : <TrackChanges sx={{ fontSize: 14 }} />
                }
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Paper>

      {/* Live analysis progress (WebSocket) — stays until auto-clears after done/error */}
      <GoalsAnalysisProgress sessionId={session.sessionId} />

      {/* Expanded content */}
      <Collapse in={open} unmountOnExit>
        <Paper variant="outlined" sx={{ mt: 0.5, p: 1.5, bgcolor: 'background.default' }}>
          {!hasGoals ? (
            <Typography variant="caption" color="text.disabled">
              Run goals analysis first (click the <TrackChanges sx={{ fontSize: 13, verticalAlign: 'middle' }} /> button above)
            </Typography>
          ) : (
            <>
              {/* Completed */}
              {doneFilt.length > 0 && (
                <Box sx={{ mb: open_.length > 0 ? 1.5 : 0 }}>
                  <Typography variant="caption" color="success.main" fontWeight={700}
                    sx={{ display: 'block', mb: 0.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Completed ({done.length})
                  </Typography>
                  {doneFilt.map((g, i) => (
                    <GoalRow key={g.goalId || i} goal={g} highlight={highlight} />
                  ))}
                  {highlight && doneFilt.length < done.length && (
                    <Typography variant="caption" color="text.disabled">
                      {done.length - doneFilt.length} more not matching filter
                    </Typography>
                  )}
                </Box>
              )}

              {doneFilt.length > 0 && openFilt.length > 0 && <Divider sx={{ my: 1 }} />}

              {/* Incomplete */}
              {openFilt.length > 0 && (
                <Box>
                  <Typography variant="caption" color="warning.main" fontWeight={700}
                    sx={{ display: 'block', mb: 0.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Open ({open_.length})
                  </Typography>
                  {openFilt.map((g, i) => (
                    <GoalRow key={g.goalId || i} goal={g} highlight={highlight} />
                  ))}
                  {highlight && openFilt.length < open_.length && (
                    <Typography variant="caption" color="text.disabled">
                      {open_.length - openFilt.length} more not matching filter
                    </Typography>
                  )}
                </Box>
              )}

              {/* Summary */}
              {session.goalsSummary && (
                <Typography variant="caption" color="text.secondary"
                  sx={{ display: 'block', mt: 1.5, pt: 1, borderTop: '1px solid', borderColor: 'divider', fontStyle: 'italic' }}>
                  {session.goalsSummary}
                </Typography>
              )}
            </>
          )}
        </Paper>
      </Collapse>
    </Box>
  );
}

// ── Session card ───────────────────────────────────────────────────────────────

function SessionCard({ session, highlight, onOpen }) {
  const title   = parseSmartTitle(session.title, session.summary);
  const date    = session.startedAt ? new Date(session.startedAt) : null;
  const summary = session.summary ? session.summary.replace(/\s+/g, ' ').trim() : '';

  return (
    <Paper variant="outlined" sx={{ mb: 1.5, overflow: 'hidden' }}>
      {/* Header row */}
      <Box
        sx={{ px: 2, pt: 1.5, pb: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
        onClick={() => onOpen?.(session.sessionId)}
      >
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight={600} noWrap>
              {title}
            </Typography>

            <Stack direction="row" spacing={1} sx={{ mt: 0.4 }} alignItems="center" flexWrap="wrap">
              <Chip
                label={session.platform === 'claude_code' ? 'Claude Code' : session.platform || 'unknown'}
                size="small"
                color={session.platform === 'claude_code' ? 'primary' : 'secondary'}
              />
              {date && (
                <Typography variant="caption" color="text.secondary">
                  {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Typography>
              )}
              {session.messageCount > 0 && (
                <Typography variant="caption" color="text.disabled">
                  {session.messageCount} msgs
                </Typography>
              )}
            </Stack>
          </Box>
        </Stack>

        {/* Description / summary */}
        {summary && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: '-webkit-box', mt: 0.75, lineHeight: 1.6,
              overflow: 'hidden', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
          >
            {summary}
          </Typography>
        )}
      </Box>

      {/* Goals panel */}
      <Box sx={{ px: 2, pb: 1.5 }}>
        <GoalsPanel session={session} highlight={highlight} />
      </Box>
    </Paper>
  );
}

// ── Sort helpers ───────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: 'date_desc',    label: 'Date (newest first)' },
  { value: 'date_asc',     label: 'Date (oldest first)' },
  { value: 'goals_desc',   label: 'Most goals' },
  { value: 'complete_first', label: 'Complete first' },
  { value: 'open_first',   label: 'Open goals first' },
];

function sortSessions(sessions, sort) {
  const copy = [...sessions];
  const goalCount = s => { const g = parseGoals(s); return g.length; };
  const doneCount = s => { const g = parseGoals(s); return g.filter(x => STATUS_CFG[x.status]?.done).length; };
  const openCount = s => { const g = parseGoals(s); return g.filter(x => !STATUS_CFG[x.status]?.done).length; };

  switch (sort) {
    case 'date_asc':
      return copy.sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));
    case 'goals_desc':
      return copy.sort((a, b) => goalCount(b) - goalCount(a));
    case 'complete_first':
      return copy.sort((a, b) => doneCount(b) - doneCount(a));
    case 'open_first':
      return copy.sort((a, b) => openCount(b) - openCount(a));
    default: // date_desc
      return copy.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  }
}

// ── Session filter by goal search ──────────────────────────────────────────────

function sessionMatchesSearch(session, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const goals = parseGoals(session);
  // Match in title or summary of session
  if ((session.title || '').toLowerCase().includes(q)) return true;
  if ((session.summary || '').toLowerCase().includes(q)) return true;
  // Match in any goal's title, description, or evidence
  return goals.some(g =>
    (g.title || '').toLowerCase().includes(q) ||
    (g.description || '').toLowerCase().includes(q) ||
    (g.evidence || '').toLowerCase().includes(q)
  );
}

// ── Main GoalsTab ──────────────────────────────────────────────────────────────

export default function GoalsTab({ onOpenSession }) {
  const [search, setSearch]   = useState('');
  const [sort, setSort]       = useState('date_desc');
  const [page, setPage]       = useState(1);

  const { sessions, loading, error } = useDialogueSessions({ limit: 200 });

  // Only sessions that have goals or need analysis (all sessions shown, goals panel shows status)
  const filtered = useMemo(() => {
    const sorted = sortSessions(sessions, sort);
    if (!search.trim()) return sorted;
    return sorted.filter(s => sessionMatchesSearch(s, search.trim()));
  }, [sessions, sort, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems  = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const handleSearch = useCallback(v => {
    setSearch(v);
    setPage(1);
  }, []);

  const handleSort = useCallback(v => {
    setSort(v);
    setPage(1);
  }, []);

  const withGoals    = sessions.filter(s => s.goals).length;
  const totalGoals   = sessions.reduce((acc, s) => acc + parseGoals(s).length, 0);
  const totalDone    = sessions.reduce((acc, s) => acc + parseGoals(s).filter(g => STATUS_CFG[g.status]?.done).length, 0);

  return (
    <Box>
      {/* Open tasks priority report */}
      <OpenTasksReportPanel />

      {/* Aggregate stats */}
      <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
        <Chip label={`${withGoals} sessions analyzed`} size="small" variant="outlined" />
        <Chip label={`${totalGoals} total goals`} size="small" variant="outlined" color="primary" />
        <Chip label={`${totalDone} achieved`} size="small" variant="outlined" color="success" />
        <Chip label={`${totalGoals - totalDone} open`} size="small" variant="outlined" color="warning" />
      </Stack>

      {/* Controls row */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap">
        {/* Search */}
        <Paper
          variant="outlined"
          sx={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 220, px: 1.5, py: 0.5 }}
        >
          <Search sx={{ fontSize: 18, color: 'text.disabled', mr: 1, flexShrink: 0 }} />
          <InputBase
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search goals, titles, descriptions…"
            sx={{ flex: 1, fontSize: '0.875rem' }}
          />
          {search && (
            <IconButton size="small" onClick={() => handleSearch('')}>
              <Clear fontSize="small" />
            </IconButton>
          )}
        </Paper>

        {/* Sort */}
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <Select
            value={sort}
            onChange={e => handleSort(e.target.value)}
            displayEmpty
            sx={{ fontSize: '0.875rem' }}
          >
            {SORT_OPTIONS.map(o => (
              <MenuItem key={o.value} value={o.value} sx={{ fontSize: '0.875rem' }}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Results count */}
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {filtered.length} session{filtered.length !== 1 ? 's' : ''}
          {search && ` matching "${search}"`}
        </Typography>
      </Stack>

      {/* Content */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : filtered.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography color="text.secondary">
            {search ? `No sessions match "${search}"` : 'No sessions found'}
          </Typography>
        </Box>
      ) : (
        <>
          {pageItems.map(s => (
            <SessionCard
              key={s.sessionId}
              session={s}
              highlight={search.trim() || null}
              onOpen={onOpenSession}
            />
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(_, p) => setPage(p)}
                color="primary"
                size="small"
              />
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
