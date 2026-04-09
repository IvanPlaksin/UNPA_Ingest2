import React from 'react';
import { Box, Typography, Paper, Chip, Stack, Button } from '@mui/material';
import { CheckCircle, ExternalLink } from 'lucide-react';

export default function CompletionStep({ result, targetNamespace }) {
  return (
    <Box sx={{ textAlign: 'center', py: 4 }}>
      <CheckCircle size={64} color="#4caf50" style={{ margin: '0 auto' }} />
      <Typography variant="h5" sx={{ mt: 2 }}>Promotion Complete!</Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
        Knowledge has been promoted to the Global Knowledge Base.
      </Typography>

      <Paper sx={{ p: 3, mt: 3, display: 'inline-block', textAlign: 'left' }}>
        <Stack spacing={1}>
          <Stack direction="row" justifyContent="space-between" spacing={4}>
            <Typography variant="body2">Entities promoted</Typography>
            <Typography variant="body2" fontWeight={700}>{result?.promotedCount || 0}</Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between" spacing={4}>
            <Typography variant="body2">Target namespace</Typography>
            <Chip label={targetNamespace} size="small" color="primary" />
          </Stack>
          {result?.sagaId && (
            <Stack direction="row" justifyContent="space-between" spacing={4}>
              <Typography variant="body2">SAGA Transaction</Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{result.sagaId}</Typography>
            </Stack>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}
