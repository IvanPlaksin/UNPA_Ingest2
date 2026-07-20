import React from 'react';
import { Box, Typography, Chip, Stack } from '@mui/material';
import { fromEnvelope } from './envelope-compat';

export default function TextRenderer({ content, compact }) {
  const c = fromEnvelope(content, 'TEXT');
  if (!c) return null;

  return (
    <Box>
      {c.title && (
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
          {c.title}
        </Typography>
      )}
      <Typography
        variant="body2"
        sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.75 }}
      >
        {compact && c.body?.length > 300
          ? c.body.slice(0, 300) + '…'
          : c.body || ''}
      </Typography>
      {!compact && (
        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
          <Chip
            size="small"
            label={`${c.wordCount || 0} words`}
            variant="outlined"
            sx={{ fontSize: '0.65rem', height: 18 }}
          />
          {c.hasEvidence && (
            <Chip size="small" label="Evidence linked" color="primary" variant="outlined" sx={{ fontSize: '0.65rem', height: 18 }} />
          )}
        </Stack>
      )}
    </Box>
  );
}
