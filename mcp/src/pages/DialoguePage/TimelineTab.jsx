import React, { useState, useEffect } from 'react';
import {
  Box, Chip, Select, MenuItem, FormControl, InputLabel,
  Pagination, CircularProgress, Typography, Stack, Paper,
  Collapse, Divider, Tooltip, IconButton, InputBase,
} from '@mui/material';
import { ExpandMore, ExpandLess, Link as LinkIcon, AutoFixHigh, Check, Search as SearchIcon, Clear as ClearIcon } from '@mui/icons-material';
import { useLocation } from 'react-router-dom';
import { useDialogueSessions, useRelatedSessions, useSessionReanalyze, useSessionTextSearch } from '../../hooks/useDialogue';
import SessionDetailDrawer from '../../components/Dialogue/SessionDetailDrawer';
import {
  parseSmartTitle, parseTopics, inferSessionType, SESSION_TYPE_STYLE as TYPE_STYLE,
  parseSummaryBlurb, parseEntities, ENTITY_TYPE_COLOR,
} from '../../components/Dialogue/session-meta';

const PLATFORM_LABEL = { claude_code: 'Claude Code', claude_ai: 'Claude.ai' };
const PLATFORM_COLOR = { claude_code: 'primary', claude_ai: 'secondary' };

// ─── Compact card for related sessions (inside expandable panel) ──────────────

function RelatedSessionMiniCard({ session, onOpen }) {
  const smart = parseSmartTitle(session.title, session.summary);
  const type = inferSessionType(session.title, session.summary);
  const style = TYPE_STYLE[type];

  return (
    <Box
      onClick={() => onOpen(session.sessionId)}
      sx={{
        px: 1.5, py: 1, cursor: 'pointer',
        display: 'flex', gap: 1, alignItems: 'flex-start',
        borderRadius: 1,
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Chip
        label={PLATFORM_LABEL[session.platform] || 'unknown'}
        size="small"
        color={PLATFORM_COLOR[session.platform] || 'default'}
        sx={{ flexShrink: 0, mt: 0.2 }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={500} sx={{
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {smart}
        </Typography>
        <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap">
          <Chip
            label={type}
            size="small"
            variant="outlined"
            sx={{ height: 18, fontSize: 12, borderColor: style.border, color: style.color }}
          />
          {session.startedAt && (
            <Typography variant="caption" color="text.disabled" sx={{ alignSelf: 'center' }}>
              {new Date(session.startedAt).toLocaleDateString()}
            </Typography>
          )}
          {session.chainScore != null && (
            <Chip
              label={`${Math.round(session.chainScore * 100)}% match`}
              size="small"
              color={session.chainScore >= 0.8 ? 'success' : 'default'}
              sx={{ height: 18, fontSize: 12 }}
            />
          )}
        </Stack>
      </Box>
    </Box>
  );
}

// ─── Lazy-loaded related sessions panel ──────────────────────────────────────

function LazyRelatedList({ sessionId, onOpen }) {
  const { related, loading } = useRelatedSessions(sessionId, 5);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
        <CircularProgress size={16} />
      </Box>
    );
  }

  if (related.length === 0) {
    return (
      <Typography variant="caption" color="text.disabled" sx={{ px: 1.5, py: 1, display: 'block' }}>
        No related sessions found
      </Typography>
    );
  }

  return (
    <Box>
      {related.map((s, i) => (
        <React.Fragment key={s.sessionId}>
          {i > 0 && <Divider />}
          <RelatedSessionMiniCard session={s} onOpen={onOpen} />
        </React.Fragment>
      ))}
    </Box>
  );
}

function RelatedPanel({ session, onOpen }) {
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const toggle = (e) => {
    e.stopPropagation();
    if (!loaded) setLoaded(true);
    setExpanded(v => !v);
  };

  return (
    <Box onClick={e => e.stopPropagation()}>
      <Box
        onClick={toggle}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5,
          px: 1.5, py: 0.75,
          cursor: 'pointer',
          borderTop: '1px solid',
          borderColor: 'divider',
          color: 'text.secondary',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        {expanded ? <ExpandLess sx={{ fontSize: 16 }} /> : <ExpandMore sx={{ fontSize: 16 }} />}
        <Typography variant="caption">Related sessions</Typography>
        <LinkIcon sx={{ fontSize: 13, ml: 0.5 }} />
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ bgcolor: 'background.default', borderTop: '1px solid', borderColor: 'divider' }}>
          {loaded && <LazyRelatedList sessionId={session.sessionId} onOpen={onOpen} />}
        </Box>
      </Collapse>
    </Box>
  );
}

// ─── Main session card ────────────────────────────────────────────────────────

function ReanalyzeButton({ sessionId }) {
  const { reanalyze, loading, error, lastSessionId } = useSessionReanalyze();
  const [done, setDone] = useState(false);

  const handle = (e) => {
    e.stopPropagation();
    reanalyze(sessionId).then(() => {
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    });
  };

  const isDone = done && lastSessionId === sessionId && !loading;

  return (
    <Tooltip title={isDone ? 'Re-analysis complete' : error ? `Error: ${error}` : 'Re-run AI analysis'}>
      <IconButton
        size="small"
        onClick={handle}
        disabled={loading && lastSessionId === sessionId}
        sx={{ opacity: 0.5, '&:hover': { opacity: 1 }, flexShrink: 0 }}
      >
        {loading && lastSessionId === sessionId
          ? <CircularProgress size={14} />
          : isDone
            ? <Check sx={{ fontSize: 16, color: 'success.main' }} />
            : <AutoFixHigh sx={{ fontSize: 16 }} />
        }
      </IconButton>
    </Tooltip>
  );
}

function SessionCard({ session, idx, total, onOpen }) {
  const smart = parseSmartTitle(session.title, session.summary);
  const topics = parseTopics(session.summary);
  const type = inferSessionType(session.title, session.summary);
  const style = TYPE_STYLE[type];
  const blurb = parseSummaryBlurb(session.summary);
  const entities = parseEntities(session);

  return (
    <Box
      sx={{
        borderBottom: idx < total - 1 ? '1px solid' : 'none',
        borderColor: 'divider',
        '&:hover': { bgcolor: 'action.hover' },
        '&:hover .reanalyze-btn': { opacity: 1 },
      }}
    >
      {/* Clickable header row */}
      <Box
        onClick={() => onOpen(session.sessionId)}
        sx={{ px: 2, pt: 1.5, pb: 0.5, cursor: 'pointer', display: 'flex', gap: 1.5, alignItems: 'flex-start' }}
      >
        {/* Platform chip */}
        <Chip
          label={PLATFORM_LABEL[session.platform] || session.platform || 'unknown'}
          size="small"
          color={PLATFORM_COLOR[session.platform] || 'default'}
          sx={{ mt: 0.3, flexShrink: 0 }}
        />

        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Smart title */}
          <Typography variant="body1" fontWeight={500} sx={{
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {smart}
          </Typography>

          {/* Tag row: type + topics + meta */}
          <Stack direction="row" spacing={0.5} sx={{ mt: 0.75 }} flexWrap="wrap" gap={0.5}>
            <Chip
              label={type}
              size="small"
              variant="outlined"
              sx={{ height: 20, fontSize: 13, borderColor: style.border, color: style.color, fontWeight: 600 }}
            />
            {topics.map(topic => (
              <Chip key={topic} label={topic} size="small" variant="outlined"
                sx={{ height: 20, fontSize: 13, color: 'text.secondary' }} />
            ))}
            <Typography variant="caption" color="text.disabled" sx={{ alignSelf: 'center' }}>
              {session.startedAt ? new Date(session.startedAt).toLocaleDateString() : '—'}
            </Typography>
            <Typography variant="caption" color="text.disabled" sx={{ alignSelf: 'center' }}>·</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
              {session.messageCount ?? 0} msgs
            </Typography>
            {session.gitBranch && (
              <>
                <Typography variant="caption" color="text.disabled" sx={{ alignSelf: 'center' }}>·</Typography>
                <Tooltip title={session.gitBranch}>
                  <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {session.gitBranch}
                  </Typography>
                </Tooltip>
              </>
            )}
            {session.lastReanalyzedAt && (
              <>
                <Typography variant="caption" color="text.disabled" sx={{ alignSelf: 'center' }}>·</Typography>
                <Tooltip title={`Re-analyzed: ${new Date(session.lastReanalyzedAt).toLocaleString()}`}>
                  <Typography variant="caption" color="success.main" sx={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 0.3 }}>
                    ✓ AI {new Date(session.lastReanalyzedAt).toLocaleDateString()}
                  </Typography>
                </Tooltip>
              </>
            )}
          </Stack>

          {/* Entity tags row */}
          {entities.length > 0 && (
            <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" gap={0.5}>
              {entities.slice(0, 5).map(e => (
                <Chip
                  key={e.name}
                  label={`${e.name} ${Math.round(e.confidence * 100)}%`}
                  size="small"
                  color={ENTITY_TYPE_COLOR[e.type] || 'default'}
                  variant="outlined"
                  sx={{ height: 18, fontSize: 12 }}
                />
              ))}
            </Stack>
          )}
        </Box>

        {/* Re-analyze button (visible on hover) */}
        <Box className="reanalyze-btn" sx={{ opacity: 0, transition: 'opacity 0.15s', flexShrink: 0, mt: 0.5 }}>
          <ReanalyzeButton sessionId={session.sessionId} />
        </Box>
      </Box>

      {/* Summary blurb: goals + achieved */}
      {blurb && (
        <Box
          onClick={() => onOpen(session.sessionId)}
          sx={{ px: 2, pb: 1.5, cursor: 'pointer' }}
        >
          {blurb.goals.length > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.6 }}>
              <span style={{ fontWeight: 600 }}>Goals: </span>{blurb.goals.join(' · ')}
            </Typography>
          )}
          {blurb.achieved.length > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.6 }}>
              <span style={{ fontWeight: 600 }}>Done: </span>{blurb.achieved.join(' · ')}
            </Typography>
          )}
        </Box>
      )}

      {/* Expandable related panel */}
      <RelatedPanel session={session} onOpen={onOpen} />
    </Box>
  );
}

// ─── TimelineTab ──────────────────────────────────────────────────────────────

export default function TimelineTab() {
  const [filters, setFilters] = useState({ platform: '', limit: 20, offset: 0, sort: 'startedAt_desc' });
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { sessions, loading, pagination } = useDialogueSessions(filters);
  const { results: searchResults, loading: searchLoading, searchDebounced, clear: clearSearch } = useSessionTextSearch();
  const location = useLocation();

  useEffect(() => {
    if (location.state?.openSession) {
      setSelectedSessionId(location.state.openSession);
    }
  }, [location.state]);

  const pageCount = pagination ? Math.ceil(pagination.total / filters.limit) : 0;
  const currentPage = Math.floor(filters.offset / filters.limit) + 1;

  const isSearching = searchQuery.trim().length > 0;

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (val.trim()) {
      searchDebounced(val, { platform: filters.platform });
    } else {
      clearSearch();
    }
  };

  const handleSearchClear = () => {
    setSearchQuery('');
    clearSearch();
  };

  return (
    <Box>
      {/* Search bar */}
      <Paper
        variant="outlined"
        sx={{ display: 'flex', alignItems: 'center', mb: 2, px: 1.5, py: 0.5 }}
      >
        <SearchIcon sx={{ color: 'text.secondary', mr: 1, fontSize: 20 }} />
        <InputBase
          fullWidth
          placeholder="Search sessions by title, summary, or topic…"
          value={searchQuery}
          onChange={handleSearchChange}
          sx={{ fontSize: '0.9rem' }}
        />
        {searchLoading && <CircularProgress size={16} sx={{ mr: 1 }} />}
        {searchQuery && (
          <IconButton size="small" onClick={handleSearchClear} sx={{ opacity: 0.6 }}>
            <ClearIcon sx={{ fontSize: 16 }} />
          </IconButton>
        )}
      </Paper>

      {/* Filter row */}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Platform</InputLabel>
          <Select
            value={filters.platform}
            label="Platform"
            onChange={e => setFilters(f => ({ ...f, platform: e.target.value, offset: 0 }))}
          >
            <MenuItem value="">All platforms</MenuItem>
            <MenuItem value="claude_code">Claude Code</MenuItem>
            <MenuItem value="claude_ai">Claude.ai</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Sort</InputLabel>
          <Select
            value={filters.sort}
            label="Sort"
            onChange={e => setFilters(f => ({ ...f, sort: e.target.value, offset: 0 }))}
          >
            <MenuItem value="startedAt_desc">Newest first</MenuItem>
            <MenuItem value="startedAt_asc">Oldest first</MenuItem>
            <MenuItem value="messageCount_desc">Most messages</MenuItem>
          </Select>
        </FormControl>

        {!isSearching && pagination && (
          <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
            {pagination.total} sessions total
          </Typography>
        )}
      </Stack>

      {isSearching ? (
        /* Search results */
        <>
          {!searchLoading && (
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              {searchResults.length > 0
                ? `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} for "${searchQuery}"`
                : `No results for "${searchQuery}"`
              }
            </Typography>
          )}
          {searchResults.length > 0 && (
            <Paper variant="outlined">
              {searchResults.map((session, idx) => (
                <SessionCard
                  key={session.sessionId}
                  session={session}
                  idx={idx}
                  total={searchResults.length}
                  onOpen={setSelectedSessionId}
                />
              ))}
            </Paper>
          )}
        </>
      ) : (
        /* Normal paginated list */
        <>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : sessions.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No sessions found
            </Typography>
          ) : (
            <Paper variant="outlined">
              {sessions.map((session, idx) => (
                <SessionCard
                  key={session.sessionId}
                  session={session}
                  idx={idx}
                  total={sessions.length}
                  onOpen={setSelectedSessionId}
                />
              ))}
            </Paper>
          )}

          {/* Pagination */}
          {pageCount > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Pagination
                count={pageCount}
                page={currentPage}
                onChange={(_e, page) => setFilters(f => ({ ...f, offset: (page - 1) * f.limit }))}
                color="primary"
                size="small"
              />
            </Box>
          )}
        </>
      )}

      <SessionDetailDrawer
        sessionId={selectedSessionId}
        onClose={() => setSelectedSessionId(null)}
      />
    </Box>
  );
}
