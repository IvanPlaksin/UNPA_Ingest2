/**
 * CodexSearchPanel - full-text search across Codex with result cards
 */
import React, { useState } from 'react';
import { Box, TextField, InputAdornment, Chip, Typography, Card, CardContent, IconButton, CircularProgress } from '@mui/material';
import { Search, X, Book, FileText, CheckSquare, Lightbulb, Shield } from 'lucide-react';
import { useCodexSearch } from '../../hooks/useCodex';

const TYPE_ICONS = {
  CodexPart: Book,
  CodexSection: FileText,
  CodexRule: CheckSquare,
  CodexPrinciple: Lightbulb,
  CodexADR: Shield,
};

function prop(node, key) {
  return node?.properties?.[key] ?? node?.[key] ?? '';
}

function ResultItem({ item, onSelect }) {
  const Icon = TYPE_ICONS[item.type] || FileText;
  const node = item.node?.properties || item.node || item.n?.properties || item.n || {};
  const title = node.title || node.ruleId || node.sectionId || node.partId || '';
  const description = node.description || node.content || '';
  const modality = node.modality;

  return (
    <Card
      onClick={() => onSelect?.(node, item.type)}
      sx={{
        mb: 0.75, cursor: 'pointer',
        bgcolor: 'background.paper',
        border: 1, borderColor: 'divider',
        '&:hover': { borderColor: '#4fd1c5' }
      }}
    >
      <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Icon size={15} style={{ marginTop: 2, flexShrink: 0, opacity: 0.6 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25, flexWrap: 'wrap' }}>
              <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '12px' }}>{title}</Typography>
              <Chip label={item.type?.replace('Codex', '')} size="small"
                sx={{ height: 16, fontSize: '9px', '& .MuiChip-label': { px: 0.5 } }} />
              {modality && (
                <Chip label={modality.toUpperCase()} size="small"
                  color={modality === 'MUST' || modality === 'mandatory' ? 'error' : 'default'}
                  sx={{ height: 16, fontSize: '9px', '& .MuiChip-label': { px: 0.5 } }} />
              )}
            </Box>
            {description && (
              <Typography variant="caption" sx={{
                color: 'text.disabled', display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                fontSize: '11px'
              }}>
                {description.slice(0, 200)}
              </Typography>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function CodexSearchPanel({ onSelect }) {
  const [query, setQuery] = useState('');
  const { results, loading, error, search, clear } = useCodexSearch();

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (val.length >= 2) {
      search(val);
    } else {
      clear();
    }
  };

  const handleClear = () => {
    setQuery('');
    clear();
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <TextField
          size="small" placeholder="Search rules, sections, parts..." fullWidth
          value={query} onChange={handleChange}
          InputProps={{
            startAdornment: <InputAdornment position="start"><Search size={15} /></InputAdornment>,
            endAdornment: query && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={handleClear}><X size={14} /></IconButton>
              </InputAdornment>
            ),
            sx: { fontSize: '12px' }
          }}
        />
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
        {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>}
        {error && <Typography color="error" variant="body2">{error}</Typography>}

        {!loading && query.length >= 2 && results.length === 0 && (
          <Typography sx={{ color: 'text.disabled', textAlign: 'center', py: 4, fontSize: '13px' }}>
            No results for "{query}"
          </Typography>
        )}

        {!loading && results.length > 0 && (
          <>
            <Typography variant="caption" sx={{ color: 'text.disabled', mb: 1, display: 'block' }}>
              {results.length} results
            </Typography>
            {results.map((item, i) => (
              <ResultItem key={i} item={item} onSelect={onSelect} />
            ))}
          </>
        )}

        {!loading && !query && (
          <Box sx={{ textAlign: 'center', py: 4, color: 'text.disabled' }}>
            <Search size={28} style={{ marginBottom: 8, opacity: 0.4 }} />
            <Typography variant="body2" sx={{ fontSize: '12px' }}>
              Search across 602 rules, 70 sections, and 10 parts
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
