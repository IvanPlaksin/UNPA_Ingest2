import React, { useState } from 'react';
import {
  Box, TextField, InputAdornment, Chip, Typography, CircularProgress, Stack,
  Paper, FormControlLabel, Switch, Divider, Collapse, ToggleButton,
  ToggleButtonGroup, Alert, IconButton,
} from '@mui/material';
import {
  AutoAwesome, Search as SearchIcon, ExpandMore, ExpandLess, Link as LinkIcon,
  Psychology, Hub,
} from '@mui/icons-material';
import { useDialogueSearch, useDecisionProvenance, useRelatedSessions, useAISearch } from '../../hooks/useDialogue';
import SessionDetailDrawer from '../../components/Dialogue/SessionDetailDrawer';
import {
  parseSmartTitle, parseTopics, inferSessionType, SESSION_TYPE_STYLE as TYPE_STYLE,
  parseSummaryBlurb, parseEntities, ENTITY_TYPE_COLOR,
} from '../../components/Dialogue/session-meta';

const PLATFORM_LABEL = { claude_code: 'Claude Code', claude_ai: 'Claude.ai' };
const PLATFORM_COLOR = { claude_code: 'primary', claude_ai: 'secondary' };

// ─── Related mini-card ────────────────────────────────────────────────────────

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
        borderRadius: 1, '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Chip label={PLATFORM_LABEL[session.platform] || 'unknown'} size="small"
        color={PLATFORM_COLOR[session.platform] || 'default'} sx={{ flexShrink: 0, mt: 0.2 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={500} sx={{
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{smart}</Typography>
        <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
          <Chip label={type} size="small" variant="outlined"
            sx={{ height: 18, fontSize: 10, borderColor: style.border, color: style.color }} />
          {session.startedAt && (
            <Typography variant="caption" color="text.disabled" sx={{ alignSelf: 'center' }}>
              {new Date(session.startedAt).toLocaleDateString()}
            </Typography>
          )}
        </Stack>
      </Box>
    </Box>
  );
}

function LazyRelatedList({ sessionId, onOpen }) {
  const { related, loading } = useRelatedSessions(sessionId, 5);
  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
      <CircularProgress size={16} />
    </Box>
  );
  if (related.length === 0) return (
    <Typography variant="caption" color="text.disabled" sx={{ px: 1.5, py: 1, display: 'block' }}>
      No related sessions found
    </Typography>
  );
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

function RelatedPanel({ sessionId, onOpen }) {
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const toggle = (e) => {
    e.stopPropagation();
    if (!loaded) setLoaded(true);
    setExpanded(v => !v);
  };
  return (
    <Box onClick={e => e.stopPropagation()}>
      <Box onClick={toggle} sx={{
        display: 'flex', alignItems: 'center', gap: 0.5,
        px: 1.5, py: 0.75, cursor: 'pointer',
        borderTop: '1px solid', borderColor: 'divider',
        color: 'text.secondary', '&:hover': { bgcolor: 'action.hover' },
      }}>
        {expanded ? <ExpandLess sx={{ fontSize: 16 }} /> : <ExpandMore sx={{ fontSize: 16 }} />}
        <Typography variant="caption">Related sessions</Typography>
        <LinkIcon sx={{ fontSize: 12, ml: 0.5 }} />
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ bgcolor: 'background.default', borderTop: '1px solid', borderColor: 'divider' }}>
          {loaded && <LazyRelatedList sessionId={sessionId} onOpen={onOpen} />}
        </Box>
      </Collapse>
    </Box>
  );
}

// ─── Session result card (matches Timeline SessionCard style) ─────────────────

function SearchSessionCard({ result, onOpen, idx, total }) {
  const payload = result.payload || {};
  const session = {
    sessionId: payload.sessionId,
    title: payload.title,
    summary: payload.summary,
    platform: payload.platform,
    startedAt: payload.startedAt,
    messageCount: payload.messageCount,
    gitBranch: payload.gitBranch,
    entities: payload.entities,
  };
  const smart = parseSmartTitle(session.title, session.summary);
  const topics = parseTopics(session.summary);
  const type = inferSessionType(session.title, session.summary);
  const style = TYPE_STYLE[type];
  const blurb = parseSummaryBlurb(session.summary);
  const entities = parseEntities(session);
  const score = result.finalScore ?? result.score ?? 0;

  return (
    <Box sx={{
      borderBottom: idx < total - 1 ? '1px solid' : 'none',
      borderColor: 'divider',
      '&:hover': { bgcolor: 'action.hover' },
    }}>
      <Box
        onClick={() => session.sessionId && onOpen(session.sessionId)}
        sx={{ px: 2, pt: 1.5, pb: 0.5, cursor: 'pointer', display: 'flex', gap: 1.5, alignItems: 'flex-start' }}
      >
        <Chip
          label={PLATFORM_LABEL[session.platform] || session.platform || 'unknown'}
          size="small"
          color={PLATFORM_COLOR[session.platform] || 'default'}
          sx={{ mt: 0.3, flexShrink: 0 }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body1" fontWeight={500} sx={{
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{smart}</Typography>
          <Stack direction="row" spacing={0.5} sx={{ mt: 0.75 }} flexWrap="wrap" gap={0.5}>
            <Chip label={type} size="small" variant="outlined"
              sx={{ height: 20, fontSize: 11, borderColor: style.border, color: style.color, fontWeight: 600 }} />
            {topics.map(topic => (
              <Chip key={topic} label={topic} size="small" variant="outlined"
                sx={{ height: 20, fontSize: 11, color: 'text.secondary' }} />
            ))}
            {score > 0 && (
              <Chip
                label={`${Math.round(score * 100)}% match`}
                size="small"
                color={score >= 0.7 ? 'success' : score >= 0.5 ? 'warning' : 'default'}
                sx={{ height: 20, fontSize: 11 }}
              />
            )}
            <Typography variant="caption" color="text.disabled" sx={{ alignSelf: 'center' }}>
              {session.startedAt ? new Date(session.startedAt).toLocaleDateString() : '—'}
            </Typography>
            {session.messageCount > 0 && (
              <>
                <Typography variant="caption" color="text.disabled" sx={{ alignSelf: 'center' }}>·</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                  {session.messageCount} msgs
                </Typography>
              </>
            )}
          </Stack>
          {entities.length > 0 && (
            <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" gap={0.5}>
              {entities.slice(0, 5).map(e => (
                <Chip key={e.name}
                  label={`${e.name} ${Math.round(e.confidence * 100)}%`}
                  size="small" color={ENTITY_TYPE_COLOR[e.type] || 'default'}
                  variant="outlined" sx={{ height: 18, fontSize: 10 }} />
              ))}
            </Stack>
          )}
        </Box>
      </Box>

      {blurb && (
        <Box onClick={() => session.sessionId && onOpen(session.sessionId)}
          sx={{ px: 2, pb: 1.5, cursor: 'pointer' }}>
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

      {session.sessionId && <RelatedPanel sessionId={session.sessionId} onOpen={onOpen} />}
    </Box>
  );
}

// ─── Decision result card ─────────────────────────────────────────────────────

function DecisionCard({ result }) {
  return (
    <Paper variant="outlined" sx={{ mb: 1, p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap" gap={0.5}>
        <Typography variant="body2" fontWeight={600}>{result.title}</Typography>
        <Chip label={result.category || '?'} size="small" variant="outlined" />
        <Chip
          label={`${Math.round((result.confidence || 0) * 100)}%`}
          size="small"
          color={result.confidence >= 0.7 ? 'success' : 'warning'}
        />
      </Stack>
      {result.decision && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {result.decision}
        </Typography>
      )}
      {result.provenance?.sessionId && (
        <Typography variant="caption" color="text.disabled">
          Session: {result.provenance.sessionId.slice(0, 16)}
          {result.provenance.startedAt ? ` · ${new Date(result.provenance.startedAt).toLocaleDateString()}` : ''}
        </Typography>
      )}
    </Paper>
  );
}

// ─── AI Strategy Panel ────────────────────────────────────────────────────────

const STRATEGY_ICON = { hybrid: <Hub sx={{ fontSize: 14 }} />, vector_only: <Psychology sx={{ fontSize: 14 }} />, graph_first: <Hub sx={{ fontSize: 14 }} /> };
const STRATEGY_COLOR = { hybrid: 'primary', vector_only: 'info', graph_first: 'secondary' };

function AIStrategyPanel({ strategy, reasoning, searchParams }) {
  const [reasoningOpen, setReasoningOpen] = useState(false);
  if (!strategy && !searchParams) return null;

  return (
    <Paper variant="outlined" sx={{ mb: 2, overflow: 'hidden', borderColor: 'primary.main', borderWidth: 1 }}>
      <Box sx={{ px: 2, py: 1, bgcolor: 'primary.50', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" gap={0.5}>
          <AutoAwesome sx={{ fontSize: 14, color: 'primary.main' }} />
          <Typography variant="caption" fontWeight={600} color="primary.main">AI Search Strategy</Typography>
          {strategy && (
            <Chip
              label={strategy}
              size="small"
              color={STRATEGY_COLOR[strategy] || 'default'}
              icon={STRATEGY_ICON[strategy]}
              sx={{ height: 18, fontSize: 10 }}
            />
          )}
        </Stack>
      </Box>

      <Box sx={{ px: 2, py: 1 }}>
        {searchParams?.semanticQuery && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            <span style={{ fontWeight: 600 }}>Query: </span>"{searchParams.semanticQuery}"
          </Typography>
        )}
        {searchParams?.entityFocus?.length > 0 && (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5} sx={{ mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
              <span style={{ fontWeight: 600 }}>Focus: </span>
            </Typography>
            {searchParams.entityFocus.map(e => (
              <Chip key={e} label={e} size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
            ))}
          </Stack>
        )}
        {searchParams?.sessionType && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            <span style={{ fontWeight: 600 }}>Type filter: </span>{searchParams.sessionType}
          </Typography>
        )}

        {reasoning && (
          <>
            <Box
              onClick={() => setReasoningOpen(v => !v)}
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', mt: 0.5, color: 'text.secondary' }}
            >
              {reasoningOpen ? <ExpandLess sx={{ fontSize: 14 }} /> : <ExpandMore sx={{ fontSize: 14 }} />}
              <Typography variant="caption">Model reasoning</Typography>
            </Box>
            <Collapse in={reasoningOpen}>
              <Typography variant="caption" color="text.secondary" sx={{
                display: 'block', mt: 0.5, pl: 1.5, borderLeft: '2px solid', borderColor: 'divider', fontStyle: 'italic',
              }}>
                {reasoning}
              </Typography>
            </Collapse>
          </>
        )}
      </Box>
    </Paper>
  );
}

// ─── SearchTab ────────────────────────────────────────────────────────────────

export default function SearchTab() {
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState('ai'); // 'ai' | 'vector'
  const [useProvenance, setUseProvenance] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  const { results: vectorResults, loading: vectorLoading, searchDebounced } = useDialogueSearch();
  const { results: provenanceResults, loading: provenanceLoading, trace } = useDecisionProvenance(null);
  const { results: aiResults, strategy, reasoning, searchParams, loading: aiLoading, aiAvailable, search: aiSearch } = useAISearch();

  const isAI = searchMode === 'ai';
  const loading = isAI ? aiLoading : (useProvenance ? provenanceLoading : vectorLoading);
  const results = isAI ? aiResults : (useProvenance ? provenanceResults : vectorResults);

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    if (!isAI) {
      if (useProvenance) trace(q);
      else searchDebounced(q, { expandGraph: true, limit: 20 });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && isAI && query.trim()) {
      aiSearch(query.trim());
    }
  };

  const handleModeChange = (_e, newMode) => {
    if (!newMode) return;
    setSearchMode(newMode);
  };

  return (
    <Box>
      {/* Search mode toggle */}
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
        <ToggleButtonGroup
          value={searchMode}
          exclusive
          onChange={handleModeChange}
          size="small"
        >
          <ToggleButton value="ai" sx={{ gap: 0.5, px: 1.5 }}>
            <AutoAwesome sx={{ fontSize: 15 }} />
            <Typography variant="caption" fontWeight={600}>AI Search</Typography>
          </ToggleButton>
          <ToggleButton value="vector" sx={{ gap: 0.5, px: 1.5 }}>
            <SearchIcon sx={{ fontSize: 15 }} />
            <Typography variant="caption" fontWeight={600}>Vector</Typography>
          </ToggleButton>
        </ToggleButtonGroup>

        {!isAI && (
          <FormControlLabel
            control={
              <Switch size="small" checked={useProvenance}
                onChange={e => setUseProvenance(e.target.checked)} />
            }
            label={<Typography variant="body2">Decision search</Typography>}
            sx={{ ml: 0, mr: 0, whiteSpace: 'nowrap' }}
          />
        )}
      </Stack>

      {/* Search input */}
      <TextField
        fullWidth
        placeholder={isAI
          ? 'Describe what you\'re looking for — press Enter to search with AI...'
          : (useProvenance
            ? 'Search decisions by topic, technology, pattern...'
            : 'Search dialogues, sessions, discussions...')
        }
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              {loading
                ? <CircularProgress size={18} />
                : isAI ? <AutoAwesome sx={{ fontSize: 18, color: 'primary.main' }} /> : <SearchIcon />
              }
            </InputAdornment>
          ),
        }}
        size="small"
        sx={{ mb: isAI ? 0.5 : 2 }}
      />

      {/* AI mode hint */}
      {isAI && (
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 2 }}>
          {aiAvailable
            ? 'AI analyzes your query → forms search criteria → vector + graph search'
            : 'AI unavailable (no API key) — using direct semantic search'}
        </Typography>
      )}

      {/* AI Strategy Panel */}
      {isAI && (strategy || searchParams) && (
        <AIStrategyPanel strategy={strategy} reasoning={reasoning} searchParams={searchParams} />
      )}

      {/* Result count */}
      {!loading && results.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          {results.length} result{results.length !== 1 ? 's' : ''}
        </Typography>
      )}

      {!loading && query && results.length === 0 && (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
          {isAI ? 'No results — try rephrasing or pressing Enter' : `No results found for "${query}"`}
        </Typography>
      )}

      {/* Results */}
      {!isAI && useProvenance ? (
        <Box>
          {results.map((result, idx) => (
            <DecisionCard key={result.decisionId || idx} result={result} />
          ))}
        </Box>
      ) : (
        results.length > 0 && (
          <Paper variant="outlined">
            {results.map((result, idx) => (
              <SearchSessionCard
                key={result.id || result.payload?.sessionId || idx}
                result={result}
                onOpen={setSelectedSessionId}
                idx={idx}
                total={results.length}
              />
            ))}
          </Paper>
        )
      )}

      <SessionDetailDrawer
        sessionId={selectedSessionId}
        onClose={() => setSelectedSessionId(null)}
      />
    </Box>
  );
}
