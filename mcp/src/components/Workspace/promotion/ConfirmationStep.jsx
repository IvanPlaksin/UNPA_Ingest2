import React from 'react';
import { Box, Typography, Paper, Chip, Stack, Alert, Divider } from '@mui/material';
import { CheckCircle, AlertTriangle, Upload } from 'lucide-react';

export default function ConfirmationStep({ selectedDrafts, diffResult, resolutions, targetNamespace }) {
  const grouped = diffResult?.grouped || {};
  const newCount = (grouped.NEW || []).length;
  const enrichCount = (grouped.ENRICH || []).length;
  const supersedeCount = (grouped.SUPERSEDE || []).length;
  const conflictCount = (grouped.CONFLICT || []).length;
  const resolvedCount = Object.values(resolutions).filter(r => r.resolved).length;

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 3 }}>
        Review the promotion summary below. This action will write to the Global Knowledge Base.
      </Alert>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Upload size={20} /> Promotion Summary
        </Typography>
        <Divider sx={{ mb: 2 }} />

        <Stack spacing={1.5}>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2">Target Namespace</Typography>
            <Chip label={targetNamespace} size="small" color="primary" />
          </Stack>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2">Total drafts selected</Typography>
            <Typography variant="body2" fontWeight={600}>{selectedDrafts.length}</Typography>
          </Stack>
          {newCount > 0 && <Stack direction="row" justifyContent="space-between"><Typography variant="body2" color="success.main">New entities to create</Typography><Typography variant="body2" fontWeight={600}>{newCount}</Typography></Stack>}
          {enrichCount > 0 && <Stack direction="row" justifyContent="space-between"><Typography variant="body2" color="info.main">Entities to enrich</Typography><Typography variant="body2" fontWeight={600}>{enrichCount}</Typography></Stack>}
          {supersedeCount > 0 && <Stack direction="row" justifyContent="space-between"><Typography variant="body2" color="warning.main">Entities to supersede</Typography><Typography variant="body2" fontWeight={600}>{supersedeCount}</Typography></Stack>}
          {conflictCount > 0 && <Stack direction="row" justifyContent="space-between"><Typography variant="body2" color="error.main">Conflicts resolved</Typography><Typography variant="body2" fontWeight={600}>{resolvedCount}/{conflictCount}</Typography></Stack>}
        </Stack>
      </Paper>

      <Alert severity="warning" icon={<AlertTriangle size={20} />}>
        This action will modify the Global Knowledge Base. Promoted drafts will be marked as PROMOTED and cannot be re-promoted.
      </Alert>
    </Box>
  );
}
