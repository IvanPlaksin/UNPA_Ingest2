/**
 * SourcesTab — Knowledge provenance tracking
 * Shows all SourceReference nodes linked to the task
 */
import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Chip, Stack,
  CircularProgress, Alert, IconButton, Collapse
} from '@mui/material';
import { ExpandMore, ExpandLess, Link as LinkIcon } from '@mui/icons-material';
import api from '../../../services/api';

const SOURCE_TYPE_CONFIG = {
  MCP_TOOL: { color: 'primary', label: 'MCP Tool' },
  CODEX_RULE: { color: 'success', label: 'Codex Rule' },
  CODEX_PRINCIPLE: { color: 'success', label: 'Codex Principle' },
  BLACKCODEX: { color: 'error', label: 'Anti-Pattern' },
  KNOWLEDGE_NODE: { color: 'info', label: 'Knowledge' },
  EXTERNAL_URL: { color: 'secondary', label: 'External URL' },
  AUDIT_FINDING: { color: 'warning', label: 'Audit Finding' },
  CONVERSATION: { color: 'default', label: 'Conversation' },
  FILE_CONTENT: { color: 'default', label: 'File' }
};

function SourceCard({ source }) {
  const [expanded, setExpanded] = useState(false);
  const config = SOURCE_TYPE_CONFIG[source.sourceType] || { color: 'default', label: source.sourceType };
  const hasDetails = source.excerpt || source.toolInput || source.url;

  return (
    <Card variant="outlined" sx={{ mb: 1 }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
          <Chip label={config.label} size="small" color={config.color} variant="outlined" />
          <Typography variant="body2" fontWeight={600} noWrap sx={{ flex: 1 }}>
            {source.sourceTitle || source.sourceId}
          </Typography>
          {hasDetails && (
            <IconButton size="small" onClick={() => setExpanded(!expanded)} sx={{ p: 0.25 }}>
              {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
            </IconButton>
          )}
        </Stack>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          {source.relevance}
        </Typography>

        <Collapse in={expanded}>
          <Box sx={{ mt: 1, pl: 1, borderLeft: '2px solid', borderColor: 'divider' }}>
            {source.excerpt && (
              <Typography variant="caption" component="pre" sx={{
                whiteSpace: 'pre-wrap', fontFamily: 'monospace',
                bgcolor: 'action.hover', p: 1, borderRadius: 1, mb: 0.5
              }}>
                {source.excerpt}
              </Typography>
            )}
            {source.url && (
              <Typography variant="caption" display="block">
                URL: <a href={source.url} target="_blank" rel="noopener noreferrer">{source.url}</a>
              </Typography>
            )}
            {source.toolInput && (
              <Typography variant="caption" component="pre" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
                Input: {typeof source.toolInput === 'string' ? source.toolInput : JSON.stringify(source.toolInput, null, 2)}
              </Typography>
            )}
          </Box>
        </Collapse>

        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
          {new Date(source.accessedAt || source._addedAt).toLocaleString()} by {source.accessedBy}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function SourcesTab({ backlogId }) {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!backlogId) return;
    setLoading(true);
    setError(null);
    api.get(`/backlog/items/${backlogId}/sources`)
      .then(res => setSources(res.data?.data || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [backlogId]);

  if (loading) return <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress size={24} /></Box>;
  if (error) return <Alert severity="error" sx={{ m: 2 }}>Failed to load sources: {error}</Alert>;

  if (sources.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <LinkIcon sx={{ fontSize: 48, opacity: 0.3 }} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No source references yet</Typography>
        <Typography variant="caption" color="text.disabled">Sources are added when creating or executing tasks</Typography>
      </Box>
    );
  }

  const grouped = sources.reduce((acc, s) => {
    (acc[s.sourceType] = acc[s.sourceType] || []).push(s);
    return acc;
  }, {});

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {sources.length} Source Reference{sources.length !== 1 ? 's' : ''}
      </Typography>
      {Object.entries(grouped).map(([type, items]) => (
        <Box key={type} sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
            {SOURCE_TYPE_CONFIG[type]?.label || type} ({items.length})
          </Typography>
          {items.map((s, i) => <SourceCard key={s.id || i} source={s} />)}
        </Box>
      ))}
    </Box>
  );
}
