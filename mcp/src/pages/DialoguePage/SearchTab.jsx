import React, { useState } from 'react';
import {
  Box, TextField, InputAdornment, List, ListItemButton, ListItemText,
  Chip, Typography, CircularProgress, Stack, Collapse, Paper,
  FormControlLabel, Switch,
} from '@mui/material';
import { Search as SearchIcon, ExpandMore, ExpandLess } from '@mui/icons-material';
import { useDialogueSearch, useDecisionProvenance } from '../../hooks/useDialogue';

function SearchResultItem({ result }) {
  const [expanded, setExpanded] = useState(false);
  const score = Math.round((result.finalScore || result.score || 0) * 100);
  const decisions = result.context?.decisions?.length || 0;
  const chains = result.context?.chains?.length || 0;
  const title = result.payload?.title || result.payload?.sessionId?.slice(0, 16) || 'Result';
  const summary = result.payload?.summary || result.payload?.content || '';

  return (
    <Paper variant="outlined" sx={{ mb: 1 }}>
      <ListItemButton onClick={() => setExpanded(e => !e)} sx={{ borderRadius: 1 }}>
        <ListItemText
          primary={
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" fontWeight={500}>{title}</Typography>
              <Chip label={`${score}%`} size="small"
                color={score >= 70 ? 'success' : score >= 50 ? 'warning' : 'default'} />
              {decisions > 0 && <Chip label={`${decisions} decisions`} size="small" color="primary" variant="outlined" />}
              {chains > 0 && <Chip label={`${chains} chains`} size="small" color="secondary" variant="outlined" />}
            </Stack>
          }
          secondary={
            <Typography variant="caption" color="text.secondary">
              {result.nodeType || 'session'} · {result.payload?.platform || ''}
              {result.payload?.startedAt
                ? ` · ${new Date(result.payload.startedAt).toLocaleDateString()}`
                : ''}
            </Typography>
          }
        />
        {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
      </ListItemButton>

      <Collapse in={expanded}>
        <Box sx={{ px: 2, pb: 2, pt: 0.5 }}>
          {summary && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {summary.slice(0, 400)}{summary.length > 400 ? '…' : ''}
            </Typography>
          )}
          {result.payload?.sessionId && (
            <Typography variant="caption" color="text.disabled">
              ID: {result.payload.sessionId}
            </Typography>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}

export default function SearchTab() {
  const [query, setQuery] = useState('');
  const [useProvenance, setUseProvenance] = useState(false);
  const { results: searchResults, loading: searchLoading, searchDebounced } = useDialogueSearch();
  const { results: provenanceResults, loading: provenanceLoading, trace } = useDecisionProvenance(null);

  const loading = useProvenance ? provenanceLoading : searchLoading;
  const results = useProvenance ? provenanceResults : searchResults;

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    if (useProvenance) {
      trace(q);
    } else {
      searchDebounced(q, { expandGraph: true, limit: 20 });
    }
  };

  const handleModeToggle = (checked) => {
    setUseProvenance(checked);
    if (query) {
      if (checked) trace(query);
      else searchDebounced(query, { expandGraph: true, limit: 20 });
    }
  };

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
        <TextField
          fullWidth
          placeholder={useProvenance
            ? 'Search decisions by topic, technology, pattern...'
            : 'Search dialogues, sessions, discussions...'
          }
          value={query}
          onChange={handleChange}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                {loading ? <CircularProgress size={18} /> : <SearchIcon />}
              </InputAdornment>
            ),
          }}
          size="small"
        />

        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={useProvenance}
              onChange={e => handleModeToggle(e.target.checked)}
            />
          }
          label={<Typography variant="body2">Decision search</Typography>}
          sx={{ whiteSpace: 'nowrap', mr: 0 }}
        />
      </Stack>

      {/* Result count */}
      {!loading && results.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          {results.length} results
        </Typography>
      )}

      {/* Results */}
      {!loading && query && results.length === 0 && (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
          No results found for "{query}"
        </Typography>
      )}

      {!useProvenance ? (
        <List disablePadding>
          {results.map((result, idx) => (
            <SearchResultItem key={result.id || idx} result={result} />
          ))}
        </List>
      ) : (
        // Provenance results (ArchDecision with session context)
        <List disablePadding>
          {results.map((result, idx) => (
            <Paper key={result.decisionId || idx} variant="outlined" sx={{ mb: 1, p: 2 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
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
                  {result.provenance.startedAt
                    ? ` · ${new Date(result.provenance.startedAt).toLocaleDateString()}`
                    : ''}
                </Typography>
              )}
            </Paper>
          ))}
        </List>
      )}
    </Box>
  );
}
