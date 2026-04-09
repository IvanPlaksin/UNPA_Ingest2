import React, { useState } from 'react';
import { Box, Typography, TextField, Button, Stack, MenuItem, Paper, List, ListItem, ListItemText, Chip, LinearProgress } from '@mui/material';
import { Search, ExternalLink } from 'lucide-react';
import { useWorkspaceStore } from '../../stores/workspaceStore';

const KB_NAMESPACES = ['', 'core', 'project', 'meta', 'common', 'Codex'];

const KBSearchTab = ({ workspaceId }) => {
  const { kbResults, loading, filters, setFilter, searchKB, clearKBResults } = useWorkspaceStore();
  const [query, setQuery] = useState('');

  const handleSearch = () => {
    if (query.trim()) {
      searchKB(workspaceId, query.trim());
    }
  };

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
        Search Global Knowledge Base
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Read-only access to the Global KB. Results create tracked KBReferences in this workspace.
      </Typography>

      {/* Search controls */}
      <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
        <TextField
          size="small"
          placeholder="Search KB by natural language..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          sx={{ flex: 1 }}
        />
        <TextField
          select
          size="small"
          label="Namespace"
          value={filters.kbNamespace}
          onChange={(e) => setFilter('kbNamespace', e.target.value)}
          sx={{ minWidth: 130 }}
        >
          <MenuItem value="">All</MenuItem>
          {KB_NAMESPACES.filter(Boolean).map(ns => (
            <MenuItem key={ns} value={ns}>{ns}</MenuItem>
          ))}
        </TextField>
        <Button variant="contained" onClick={handleSearch} disabled={!query.trim() || loading} startIcon={<Search size={16} />}>
          Search
        </Button>
      </Stack>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Results */}
      {kbResults.length > 0 && (
        <Paper variant="outlined">
          <List dense>
            {kbResults.map((result, i) => (
              <ListItem
                key={result.kbNodeId || result.id || i}
                sx={{ borderBottom: 1, borderColor: 'divider' }}
                secondaryAction={
                  result.score && (
                    <Chip
                      label={`${(result.score * 100).toFixed(0)}%`}
                      size="small"
                      color={result.score > 0.8 ? 'success' : result.score > 0.6 ? 'warning' : 'default'}
                    />
                  )
                }
              >
                <ListItemText
                  primary={
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography variant="body2" fontWeight={500}>{result.name || result.kbNodeId}</Typography>
                      {result.kbNamespace && <Chip label={result.kbNamespace} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />}
                    </Stack>
                  }
                  secondary={
                    <Typography variant="caption" color="text.secondary">
                      {result.type} &bull; KB Node: {result.kbNodeId?.slice(0, 12)}...
                      {result.isStale && ' (stale)'}
                    </Typography>
                  }
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      {kbResults.length === 0 && !loading && query && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">No KB results found for "{query}"</Typography>
        </Paper>
      )}

      {!query && kbResults.length === 0 && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <Search size={40} style={{ opacity: 0.2 }} />
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Search the Global Knowledge Base to find related entities, rules, and schemas
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default KBSearchTab;
