import React from 'react';
import {
  Box, Typography, Stack, LinearProgress, Chip, CircularProgress,
} from '@mui/material';
import { CheckCircle, AlertCircle, Loader } from 'lucide-react';

export default function ExecutionProgress({ status, methodology }) {
  if (!status) return null;

  const STATES = {
    running:   { icon: <Loader size={18} />,       color: 'info',    label: 'Running…',   progress: true },
    completed: { icon: <CheckCircle size={18} />,   color: 'success', label: 'Completed',  progress: false },
    failed:    { icon: <AlertCircle size={18} />,   color: 'error',   label: 'Failed',     progress: false },
  };

  const s = STATES[status] || STATES.running;

  return (
    <Box sx={{ py: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        {s.progress ? <CircularProgress size={20} /> : s.icon}
        <Typography variant="subtitle2">{s.label}</Typography>
        <Chip size="small" label={methodology?.name} />
      </Stack>

      {s.progress && <LinearProgress sx={{ borderRadius: 1 }} />}
    </Box>
  );
}
