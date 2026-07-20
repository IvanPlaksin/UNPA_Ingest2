import React from 'react';
import { Typography } from '@mui/material';
import { fromEnvelope } from './envelope-compat';

export default function SynthesizeRenderer({ content, compact }) {
  const c = fromEnvelope(content, 'SYNTHESIZE');
  const text = c?.narrative || 'No narrative generated.';
  return (
    <Typography
      variant="body2"
      sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}
    >
      {compact ? text.slice(0, 200) + (text.length > 200 ? '…' : '') : text}
    </Typography>
  );
}
