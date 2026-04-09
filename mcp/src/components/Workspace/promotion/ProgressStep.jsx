import React from 'react';
import { Box, Typography, LinearProgress, Alert, Paper, Stack } from '@mui/material';
import { Loader, CheckCircle, XCircle } from 'lucide-react';

export default function ProgressStep({ loading, result, error }) {
  if (loading) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Loader size={40} className="animate-spin" style={{ margin: '0 auto' }} />
        <Typography variant="h6" sx={{ mt: 2 }}>Executing Promotion...</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Writing to Knowledge Base. Do not close this dialog.</Typography>
        <LinearProgress sx={{ mt: 3, mx: 'auto', maxWidth: 400 }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <XCircle size={48} color="red" style={{ margin: '0 auto' }} />
        <Typography variant="h6" color="error" sx={{ mt: 2 }}>Promotion Failed</Typography>
        <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
        {result?.compensated && <Alert severity="info" sx={{ mt: 1 }}>All changes have been rolled back (SAGA compensation).</Alert>}
      </Box>
    );
  }

  if (result?.success) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <CheckCircle size={48} color="green" style={{ margin: '0 auto' }} />
        <Typography variant="h6" color="success.main" sx={{ mt: 2 }}>Promotion Successful</Typography>
        <Paper sx={{ p: 2, mt: 2, display: 'inline-block' }}>
          <Stack spacing={0.5}>
            <Typography variant="body2">Promoted: {result.promotedCount} entities</Typography>
            <Typography variant="body2">SAGA ID: {result.sagaId}</Typography>
          </Stack>
        </Paper>
      </Box>
    );
  }

  return <Typography color="text.secondary">Waiting...</Typography>;
}
