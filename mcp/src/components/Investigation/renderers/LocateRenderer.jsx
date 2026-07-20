import React from 'react';
import { Box, Typography, Stack, Chip } from '@mui/material';
import { AlertTriangle } from 'lucide-react';
import { fromEnvelope } from './envelope-compat';

const DOC_TYPES = new Set(['DOCUMENT', 'POLICY', 'RESOLUTION', 'REGULATION', 'GUIDELINE']);

export default function LocateRenderer({ content, compact }) {
  const data = fromEnvelope(content, 'LOCATE');
  if (!data?.results?.length) {
    return (
      <Typography color="text.secondary" variant="body2">
        No entities found{data?.query ? ` for "${data.query}"` : ''}.
      </Typography>
    );
  }

  const results = compact ? data.results.slice(0, 5) : data.results;

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
        Query: <strong>{data.query}</strong> — {data.results.length} result(s)
      </Typography>
      {results.map((e, i) => {
        const isDocType = DOC_TYPES.has((e.type || '').toUpperCase());
        const superseded = isDocType && e.isInForce === false;

        return (
          <Box key={i} sx={{ py: 0.5, borderBottom: '1px solid', borderColor: 'divider', opacity: superseded ? 0.8 : 1 }}>
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.3 }}>
              <Typography variant="body2" fontWeight={600}>{e.name}</Typography>
              {superseded && (
                <Chip
                  icon={<AlertTriangle size={9} />}
                  label="Superseded"
                  size="small"
                  color="warning"
                  sx={{ fontSize: '0.55rem', height: 16 }}
                />
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary">{e.type} · {e.namespace}</Typography>
            {e.description && (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25, fontStyle: 'italic' }}>
                {e.description}
              </Typography>
            )}
          </Box>
        );
      })}
      {compact && data.results.length > 5 && (
        <Typography variant="caption" color="text.secondary" sx={{ pt: 0.5, display: 'block' }}>
          +{data.results.length - 5} more
        </Typography>
      )}
    </Box>
  );
}
