import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Checkbox, FormControlLabel, Stack, Chip,
  TextField, InputAdornment, CircularProgress, Alert,
} from '@mui/material';
import { Search, Network } from 'lucide-react';
import { listSources } from '../../services/sourceCatalog.service';

const ENTITY_STORE_KEY = 'EntityStore';

const TYPE_LABEL = {
  URL_CATALOG:   'URL Catalog',
  REST_API:      'REST API',
  RSS_FEED:      'RSS',
  ODS_API:       'ODS',
  OIOS_PORTAL:   'OIOS',
  OAI_PMH:       'OAI-PMH',
};

export default function SourcesSelector({ value = [], onChange }) {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    listSources()
      .then(r => setSources((r.data || []).filter(s => s.enabled !== false)))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const selected = new Set(value);

  const toggle = (key) => {
    const next = selected.has(key)
      ? value.filter(v => v !== key)
      : [...value, key];
    onChange(next);
  };

  const filtered = sources.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (s.name || '').toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q) ||
      (s.type || '').toLowerCase().includes(q) ||
      (s.namespace || '').toLowerCase().includes(q)
    );
  });

  const entitySelected = selected.has(ENTITY_STORE_KEY);

  const selectedSources = value
    .filter(k => k !== ENTITY_STORE_KEY)
    .map(k => sources.find(s => s.id === k))
    .filter(Boolean);

  return (
    <Box>
      {/* EntityStore — always first */}
      <Box
        sx={{
          display: 'flex', alignItems: 'flex-start', gap: 1,
          border: '1px solid',
          borderColor: entitySelected ? 'primary.main' : 'divider',
          borderRadius: 1, px: 1.5, py: 1, mb: 1.5,
          bgcolor: entitySelected ? 'action.selected' : 'transparent',
          cursor: 'pointer',
        }}
        onClick={() => toggle(ENTITY_STORE_KEY)}
      >
        <Checkbox
          size="small"
          checked={entitySelected}
          onChange={() => toggle(ENTITY_STORE_KEY)}
          onClick={e => e.stopPropagation()}
          sx={{ mt: 0.25, p: 0 }}
        />
        <Box sx={{ flex: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Network size={14} />
            <Typography variant="body2" fontWeight={600}>Entity Knowledge Graph</Typography>
            <Chip size="small" label="Built-in" color="primary" sx={{ height: 18, fontSize: '0.65rem' }} />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Internal entity store — organizations, persons, positions and their relationships
          </Typography>
        </Box>
      </Box>

      {/* Document sources from Source Catalog */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600}
          sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.65rem' }}>
          Document Sources
          {!loading && sources.length > 0 && ` (${filtered.length}${filtered.length !== sources.length ? ` of ${sources.length}` : ''})`}
        </Typography>
        {!loading && filtered.length > 0 && (
          <Stack direction="row" spacing={0.5}>
            <Typography
              variant="caption" color="primary.main"
              sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
              onClick={() => {
                const ids = filtered.map(s => s.id);
                const next = Array.from(new Set([...value, ...ids]));
                onChange(next);
              }}
            >
              Select All
            </Typography>
            <Typography variant="caption" color="text.disabled">·</Typography>
            <Typography
              variant="caption" color="text.secondary"
              sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
              onClick={() => {
                const ids = new Set(filtered.map(s => s.id));
                onChange(value.filter(k => !ids.has(k)));
              }}
            >
              Deselect All
            </Typography>
          </Stack>
        )}
      </Stack>

      <TextField
        size="small" fullWidth
        placeholder="Filter by name, type, namespace…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        InputProps={{
          startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment>,
        }}
        sx={{ mb: 1 }}
      />

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={20} />
        </Box>
      )}
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

      {!loading && (
        <Box sx={{ maxHeight: 260, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          {filtered.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
              {search ? 'No sources match the filter' : 'No document sources configured'}
            </Typography>
          ) : (
            filtered.map((s, i) => {
              const sel = selected.has(s.id);
              return (
                <Box
                  key={s.id}
                  sx={{
                    display: 'flex', alignItems: 'flex-start', gap: 1,
                    borderBottom: i < filtered.length - 1 ? '1px solid' : 'none',
                    borderColor: 'divider',
                    px: 1.5, py: 0.75,
                    bgcolor: sel ? 'action.selected' : 'transparent',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: sel ? 'action.selected' : 'action.hover' },
                  }}
                  onClick={() => toggle(s.id)}
                >
                  <Checkbox
                    size="small"
                    checked={sel}
                    onChange={() => toggle(s.id)}
                    onClick={e => e.stopPropagation()}
                    sx={{ mt: 0.25, p: 0, flexShrink: 0 }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                      <Typography variant="body2" fontWeight={sel ? 600 : 400}
                        sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.name}
                      </Typography>
                      {s.type && (
                        <Chip size="small" label={TYPE_LABEL[s.type] || s.type}
                          sx={{ height: 16, fontSize: '0.62rem', flexShrink: 0 }} />
                      )}
                      {s.namespace && s.namespace !== 'DEFAULT' && (
                        <Chip size="small" label={s.namespace} variant="outlined"
                          sx={{ height: 16, fontSize: '0.62rem', flexShrink: 0 }} />
                      )}
                      {s.documentCount > 0 && (
                        <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0 }}>
                          {s.documentCount.toLocaleString()} docs
                        </Typography>
                      )}
                    </Stack>
                    {s.description && (
                      <Typography variant="caption" color="text.secondary"
                        sx={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {s.description}
                      </Typography>
                    )}
                  </Box>
                </Box>
              );
            })
          )}
        </Box>
      )}

      {/* Selection summary chips */}
      {value.length > 0 && (
        <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center', mr: 0.5 }}>
            Selected:
          </Typography>
          {entitySelected && (
            <Chip size="small" label="Entity Knowledge Graph"
              onDelete={() => toggle(ENTITY_STORE_KEY)} />
          )}
          {selectedSources.map(s => (
            <Chip key={s.id} size="small" label={s.name}
              onDelete={() => toggle(s.id)} />
          ))}
        </Stack>
      )}
    </Box>
  );
}
