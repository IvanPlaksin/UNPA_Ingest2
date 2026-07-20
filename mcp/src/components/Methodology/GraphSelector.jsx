import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Stack, TextField, InputAdornment, Button,
  CircularProgress, Alert, List, ListItem, ListItemButton,
  ListItemText, ListItemIcon, Chip, Tooltip,
} from '@mui/material';
import { Search, GitGraph, CheckCircle, Wand2 } from 'lucide-react';
import { listGraphs } from '../../services/graphCatalog.service';

export default function GraphSelector({ value, onChange, onCreateNew }) {
  const [graphs, setGraphs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await listGraphs({ limit: 200 });
      setGraphs(data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const filtered = graphs.filter(g => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (g.name || '').toLowerCase().includes(q) ||
      (g.namespace || '').toLowerCase().includes(q) ||
      (g.entryId || '').toLowerCase().includes(q)
    );
  });

  return (
    <Box>
      <TextField
        fullWidth
        size="small"
        placeholder="Search graphs by name or namespace…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search size={16} />
            </InputAdornment>
          ),
        }}
        sx={{ mb: 1 }}
      />

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={24} />
        </Box>
      )}
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

      {!loading && (
        <Box sx={{ maxHeight: 320, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          {filtered.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
              No graphs found
            </Typography>
          ) : (
            <List dense disablePadding>
              {filtered.map(g => {
                const selected = value === g.entryId;
                return (
                  <ListItem key={g.entryId} disablePadding divider>
                    <ListItemButton
                      selected={selected}
                      onClick={() => onChange(selected ? null : g.entryId)}
                      sx={{ py: 0.75 }}
                    >
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        {selected ? <CheckCircle size={18} color="var(--mui-palette-primary-main)" /> : <GitGraph size={18} />}
                      </ListItemIcon>
                      <ListItemText
                        primary={g.name || g.entryId}
                        secondary={
                          <Stack direction="row" spacing={0.5} component="span">
                            {g.namespace && <Chip component="span" size="small" label={g.namespace} sx={{ height: 16, fontSize: '0.68rem' }} />}
                            {g.graphType && <Chip component="span" size="small" label={g.graphType} variant="outlined" sx={{ height: 16, fontSize: '0.68rem' }} />}
                          </Stack>
                        }
                        primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: selected ? 600 : 400 }}
                        secondaryTypographyProps={{ component: 'span' }}
                      />
                      <Tooltip title={g.entryId}>
                        <Typography variant="caption" color="text.disabled" sx={{ ml: 1, fontFamily: 'monospace', flexShrink: 0 }}>
                          {g.entryId?.slice(0, 8)}…
                        </Typography>
                      </Tooltip>
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          )}
        </Box>
      )}

      {value && (
        <Typography variant="caption" color="primary.main" sx={{ display: 'block', mt: 0.5 }}>
          Selected: {value}
        </Typography>
      )}

      {onCreateNew && (
        <>
          <Box sx={{ my: 1.5, textAlign: 'center', position: 'relative' }}>
            <Box sx={{ borderTop: '1px solid', borderColor: 'divider', position: 'absolute', top: '50%', left: 0, right: 0 }} />
            <Typography variant="caption" color="text.disabled" sx={{ position: 'relative', bgcolor: 'background.paper', px: 1 }}>
              or
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<Wand2 size={16} />}
            onClick={onCreateNew}
            fullWidth
            color="secondary"
          >
            Create New Graph with AI
          </Button>
        </>
      )}
    </Box>
  );
}
