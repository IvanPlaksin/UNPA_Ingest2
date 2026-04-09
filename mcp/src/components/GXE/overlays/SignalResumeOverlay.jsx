import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent,
  Button, Typography, Box, Alert, Chip, Stepper, Step, StepLabel
} from '@mui/material';
import { Close, HourglassEmpty, CheckCircle } from '@mui/icons-material';
import { FormRenderer } from '../../Forms';

/**
 * Modal overlay for responding to a pending signal.
 */
export default function SignalResumeOverlay({
  open, signal, onClose, onComplete, userId, apiBaseUrl = '/api/v1'
}) {
  const [status, setStatus] = useState('pending');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  if (!signal) return null;

  const {
    resumeToken, formId, formDefinition, contextMessage,
    signalType, resolutionMode, votesReceived = 0, votesRequired = 0, timeoutAt
  } = signal;

  const handleSubmit = async (formData) => {
    setStatus('submitting');
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/runtime/signal/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: resumeToken,
          payload: formData,
          actorId: userId || 'anonymous'
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

      setResult(data);
      setStatus('success');

      setTimeout(() => {
        onComplete?.(data);
        onClose();
      }, 2000);
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  const handleCancel = () => {
    if (status === 'submitting') return;
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleCancel} maxWidth="md" fullWidth PaperProps={{ sx: { maxHeight: '90vh' } }}>
      {/* Header */}
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <HourglassEmpty color="warning" />
        <Typography variant="h6" sx={{ flex: 1 }}>
          {signalType === 'APPROVAL' ? 'Approval Required' :
           signalType === 'VOTE' ? 'Vote Required' :
           'Input Required'}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Chip label={signalType} size="small" variant="outlined" />
          <Chip label={resolutionMode} size="small" color="primary" />
        </Box>
        <Button onClick={handleCancel} sx={{ minWidth: 'auto' }}><Close /></Button>
      </DialogTitle>

      <DialogContent dividers>
        {contextMessage && (
          <Alert severity="info" sx={{ mb: 2 }}>{contextMessage}</Alert>
        )}

        {/* Vote progress */}
        {resolutionMode !== 'SINGLE' && votesRequired > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Responses: {votesReceived} of {votesRequired} required
            </Typography>
            <Stepper activeStep={votesReceived} alternativeLabel sx={{ mt: 1 }}>
              {Array.from({ length: votesRequired }).map((_, i) => (
                <Step key={i} completed={i < votesReceived}><StepLabel /></Step>
              ))}
            </Stepper>
          </Box>
        )}

        {/* Success state */}
        {status === 'success' && (
          <Alert severity="success" icon={<CheckCircle />} sx={{ mb: 2 }}>
            {result?.status === 'RESOLVED'
              ? 'Response submitted successfully. Signal resolved.'
              : result?.status === 'VOTE_RECORDED'
              ? `Vote recorded. ${result.votesReceived}/${result.votesRequired} responses.`
              : 'Response submitted.'}
          </Alert>
        )}

        {status === 'error' && (
          <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        )}

        {/* Form */}
        {status !== 'success' && (
          <FormRenderer
            formId={formId}
            formDefinition={formDefinition}
            mode="EMBEDDED"
            onSubmit={handleSubmit}
            contextData={{ userId, contextMessage, signalType }}
            disabled={status === 'submitting'}
            submitLabel={
              signalType === 'APPROVAL' ? 'Submit Approval' :
              signalType === 'VOTE' ? 'Submit Vote' :
              'Submit'
            }
            showCancel
            onCancel={handleCancel}
            cancelLabel="Cancel"
          />
        )}
      </DialogContent>

      {/* Timeout warning */}
      {timeoutAt && status === 'pending' && (
        <Box sx={{ px: 3, py: 1, bgcolor: 'grey.100', borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary">
            ⏱ Expires: {new Date(timeoutAt).toLocaleString()}
          </Typography>
        </Box>
      )}
    </Dialog>
  );
}
