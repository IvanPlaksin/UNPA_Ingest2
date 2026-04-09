import React, { useState, useEffect } from 'react';
import {
  Box, LinearProgress, Typography, IconButton, Paper, Chip,
  Stack, Collapse, Alert
} from '@mui/material';
import {
  X, CheckCircle, XCircle, ChevronDown, ChevronUp,
  FileText, GitBranch, BookOpen, AlertTriangle, Loader
} from 'lucide-react';
import { API_BASE_URL } from '../../config/api.config';
import * as wsApi from '../../services/workspace.service';

const PHASE_CONFIG = {
  queued:    { label: 'Queued',      color: 'default' },
  started:   { label: 'Starting',    color: 'info' },
  init:      { label: 'Loading source', color: 'info' },
  chunking:  { label: 'Chunking text', color: 'info' },
  entities:  { label: 'Extracting entities', color: 'primary' },
  extracting:{ label: 'Extracting',  color: 'primary' },
  extracting_relations: { label: 'Extracting relations', color: 'primary' },
  relations: { label: 'Extracting relations', color: 'primary' },
  business_rule: { label: 'Extracting rules', color: 'secondary' },
  workflow:  { label: 'Extracting workflows', color: 'secondary' },
  concept:   { label: 'Extracting concepts', color: 'secondary' },
  anomaly:   { label: 'Detecting anomalies', color: 'warning' },
  detecting_contradictions: { label: 'Detecting contradictions', color: 'warning' },
  contradictions_detected: { label: 'Contradictions analyzed', color: 'warning' },
  complete:  { label: 'Finalizing', color: 'success' },
  completed: { label: 'Completed',  color: 'success' },
  failed:    { label: 'Failed',     color: 'error' },
  cancelled: { label: 'Cancelled',  color: 'warning' }
};

const ExtractionProgress = ({ workspaceId, jobId, onComplete, onCancel }) => {
  const [phase, setPhase] = useState('queued');
  const [progress, setProgress] = useState(0);
  const [details, setDetails] = useState('');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!jobId || !workspaceId) return;

    const url = `${API_BASE_URL}/workspaces/${workspaceId}/extract/${jobId}/progress`;
    const eventSource = new EventSource(url);

    eventSource.addEventListener('status', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.progress?.phase) setPhase(data.progress.phase);
      } catch { /* ignore */ }
    });

    eventSource.addEventListener('progress', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.phase) setPhase(data.phase);
        if (typeof data.progress === 'number') setProgress(data.progress);
        if (data.current && data.total) setDetails(`${data.current}/${data.total}`);
        if (data.message) setDetails(data.message);
        if (data.count) setDetails(`${data.count} items`);
        if (data.error) setError(data.error);
        if (data.result) setResult(data.result);
        if (data.drafts !== undefined) setDetails(`${data.drafts} drafts, ${data.edges || 0} edges`);
      } catch { /* ignore */ }
    });

    eventSource.addEventListener('done', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.phase === 'completed' || data.status === 'completed') {
          setPhase('completed');
          setProgress(100);
          onComplete?.();
        } else if (data.phase === 'failed') {
          setPhase('failed');
        } else if (data.phase === 'cancelled') {
          setPhase('cancelled');
          onCancel?.();
        }
      } catch { /* ignore */ }
      eventSource.close();
    });

    eventSource.onerror = () => {
      // Connection lost — try to get final status
      wsApi.getExtractionStatus(workspaceId, jobId).then(res => {
        if (res.data?.status === 'completed') {
          setPhase('completed');
          setProgress(100);
          onComplete?.();
        } else if (res.data?.status === 'failed') {
          setPhase('failed');
          setError(res.data.failedReason);
        }
      }).catch(() => {});
      eventSource.close();
    };

    return () => eventSource.close();
  }, [jobId, workspaceId]);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await wsApi.cancelExtraction(workspaceId, jobId);
    } catch { /* ignore */ }
    setCancelling(false);
  };

  const config = PHASE_CONFIG[phase] || PHASE_CONFIG.queued;
  const isTerminal = ['completed', 'failed', 'cancelled'].includes(phase);
  const isRunning = !isTerminal && phase !== 'queued';

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 1, borderColor: isTerminal ? (phase === 'completed' ? 'success.main' : 'error.main') : 'divider' }}>
      <Stack spacing={1.5}>
        {/* Header */}
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={1}>
            {isRunning && <Loader size={16} className="animate-spin" />}
            {phase === 'completed' && <CheckCircle size={16} color="green" />}
            {phase === 'failed' && <XCircle size={16} color="red" />}
            <Chip label={config.label} size="small" color={config.color} variant="outlined" />
            {details && <Typography variant="caption" color="text.secondary">{details}</Typography>}
          </Stack>

          <Stack direction="row" spacing={0.5}>
            {!isTerminal && (
              <IconButton size="small" onClick={handleCancel} disabled={cancelling} title="Cancel">
                <X size={16} />
              </IconButton>
            )}
            <IconButton size="small" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </IconButton>
          </Stack>
        </Stack>

        {/* Progress bar */}
        <LinearProgress
          variant={isRunning && progress === 0 ? 'indeterminate' : 'determinate'}
          value={progress}
          color={config.color === 'default' ? 'primary' : config.color}
          sx={{ height: 6, borderRadius: 1 }}
        />

        {error && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}

        {/* Expandable details */}
        <Collapse in={expanded}>
          {result && (
            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover', mt: 1 }}>
              <Typography variant="caption" component="pre" sx={{ fontFamily: 'monospace', fontSize: '0.7rem', whiteSpace: 'pre-wrap', m: 0 }}>
                {JSON.stringify(result.stats || result, null, 2)}
              </Typography>
            </Paper>
          )}
        </Collapse>
      </Stack>
    </Paper>
  );
};

export default ExtractionProgress;
