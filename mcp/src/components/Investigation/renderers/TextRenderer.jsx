import React from 'react';
import { Box, Typography, Chip, Stack } from '@mui/material';

export default function TextRenderer({ content, compact }) {
  if (!content) return null;

  return (
    <Box>
      {content.title && (
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
          {content.title}
        </Typography>
      )}
      <Typography
        variant="body2"
        sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.75 }}
      >
        {compact && content.body?.length > 300
          ? content.body.slice(0, 300) + '…'
          : content.body || ''}
      </Typography>
      {!compact && (
        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
          <Chip
            size="small"
            label={`${content.wordCount || 0} words`}
            variant="outlined"
            sx={{ fontSize: '0.65rem', height: 18 }}
          />
          {content.hasEvidence && (
            <Chip size="small" label="Evidence linked" color="primary" variant="outlined" sx={{ fontSize: '0.65rem', height: 18 }} />
          )}
        </Stack>
      )}
    </Box>
  );
}
