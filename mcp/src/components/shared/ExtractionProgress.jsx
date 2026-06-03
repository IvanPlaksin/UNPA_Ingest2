/**
 * ExtractionProgress (shared)
 *
 * Unified extraction progress component for both Documents (poll) and
 * Workspaces (SSE). Merges step-list UI (Documents) with phase chip +
 * cancel button (Workspaces) and collapsible error log.
 *
 * Props:
 *   mode        'poll' | 'sse'
 *   source      { type: 'document'|'workspace', id, jobId? }
 *   onComplete  (result?) => void
 *   onCancel    () => void
 *   onClose     () => void  (optional)
 */
import React, { useState } from 'react';
import {
  Box, Typography, Stack, LinearProgress, Chip,
  Button, CircularProgress, Alert, Collapse,
  IconButton, Divider, Paper
} from '@mui/material';
import {
  CheckCircle, XCircle, Clock, AlertTriangle, Info,
  ChevronDown, ChevronUp, X
} from 'lucide-react';
import useExtractionProgress from '../../hooks/useExtractionProgress';

// ── Step label map (unified pipeline names + legacy names) ──
const STEP_LABELS = {
  'load-source':          'Load Source',
  'chunk-text':           'Chunk Text',
  'extract-entities':     'Extract Entities',
  'extract-relations':    'Extract Relations',
  'extract-specialized':  'Extract Specialized',
  'deduplicate':          'Deduplicate',
  'persist-graph':        'Persist Graph',
  'embed-and-index':      'Embed & Index (Qdrant)',
  'post-process':         'Post-Process',
  'store-result':         'Store Result',
  // legacy document names
  'parse-document':       'Parse Document',
  'build-triangle':       'Build Knowledge Triangle',
  'detect-gaps':          'Detect Knowledge Gaps',
  'calculate-kqs':        'Calculate KQS Scores',
  'deduplicate-entities': 'Deduplicate Entities',
  'store-results':        'Store Results',
};

// ── Phase chip config ───────────────────────────────────────
const PHASE_CONFIG = {
  queued:                   { label: 'Queued',                color: 'default' },
  started:                  { label: 'Starting',              color: 'info' },
  'load-source':            { label: 'Loading source',        color: 'info' },
  'chunk-text':             { label: 'Chunking text',         color: 'info' },
  'extract-entities':       { label: 'Extracting entities',   color: 'primary' },
  'extract-relations':      { label: 'Extracting relations',  color: 'primary' },
  'extract-specialized':    { label: 'Extracting specialized',color: 'secondary' },
  'deduplicate':            { label: 'Deduplicating',         color: 'secondary' },
  'persist-graph':          { label: 'Persisting graph',      color: 'secondary' },
  'embed-and-index':        { label: 'Embedding & indexing',  color: 'secondary' },
  'post-process':           { label: 'Post-processing',       color: 'secondary' },
  'store-result':           { label: 'Storing result',        color: 'secondary' },
  // legacy workspace phases
  extracting:               { label: 'Extracting',            color: 'primary' },
  entities:                 { label: 'Extracting entities',   color: 'primary' },
  relations:                { label: 'Extracting relations',  color: 'primary' },
  business_rule:            { label: 'Extracting rules',      color: 'secondary' },
  workflow:                 { label: 'Extracting workflows',  color: 'secondary' },
  concept:                  { label: 'Extracting concepts',   color: 'secondary' },
  anomaly:                  { label: 'Detecting anomalies',   color: 'warning' },
  detecting_contradictions: { label: 'Detecting contradictions', color: 'warning' },
  contradictions_detected:  { label: 'Contradictions analyzed',  color: 'warning' },
  complete:                 { label: 'Finalizing',            color: 'success' },
  completed:                { label: 'Completed',             color: 'success' },
  failed:                   { label: 'Failed',                color: 'error' },
  cancelled:                { label: 'Cancelled',             color: 'warning' },
};

// ── Helpers ─────────────────────────────────────────────────

function StepIcon({ status }) {
  if (status === 'completed') return <CheckCircle size={16} color="#22c55e" />;
  if (status === 'failed')    return <XCircle size={16} color="#ef4444" />;
  if (status === 'running')   return <CircularProgress size={14} />;
  if (status === 'skipped')   return <Clock size={16} style={{ opacity: 0.2 }} />;
  return <Clock size={16} style={{ opacity: 0.3 }} />;
}

function formatMs(ms) {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function stepResultCaption(step) {
  const r = step.result;
  if (!r) return null;
  if (step.name === 'extract-entities')  return `${r.entities ?? r.count ?? 0} entities`;
  if (step.name === 'extract-relations') return `${r.relations ?? r.count ?? 0} relations`;
  if (step.name === 'chunk-text')        return `${r.chunks ?? 0} chunks`;
  if (step.name === 'load-source')       return r.chars != null ? `${(r.chars / 1000).toFixed(0)}K chars` : null;
  if (step.name === 'embed-and-index')   return `${r.vectors ?? 0} vectors`;
  if (step.name === 'persist-graph')     return r.nodes != null ? `${r.nodes} nodes` : null;
  // legacy
  if (step.name === 'parse-document')    return r.chars != null ? `${(r.chars / 1000).toFixed(0)}K chars` : null;
  if (step.name === 'build-triangle')    return r.processesLinked != null ? `${r.processesLinked} linked` : null;
  if (r.method?.includes('fallback'))    return null; // handled by chip
  return null;
}

// ── Main component ───────────────────────────────────────────

export default function ExtractionProgress({
  mode = 'poll',
  source,
  onComplete,
  onCancel,
  onClose,
}) {
  const [logsOpen, setLogsOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const {
    phase, overallProgress, steps, summary, details, error,
    isRunning, isDone, isFailed, isCancelled, logEntries, cancel,
  } = useExtractionProgress({ mode, source, onComplete, onCancel });

  const phaseConf  = PHASE_CONFIG[phase] || PHASE_CONFIG.queued;
  const isTerminal = isDone || isFailed || isCancelled;
  const showCancel = !isTerminal && mode === 'sse';

  // Auto-open logs on error
  React.useEffect(() => {
    if (logEntries.some(l => l.level === 'error') || isFailed) {
      setLogsOpen(true);
    }
  }, [logEntries.length, isFailed]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCancel = async () => {
    setCancelling(true);
    await cancel();
    setCancelling(false);
  };

  return (
    <Box>
      {/* ── Header: phase chip + cancel ── */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="subtitle2" fontWeight={700}>Extraction Progress</Typography>
          <Chip
            label={phaseConf.label}
            size="small"
            color={phaseConf.color}
            variant="outlined"
          />
          {details && (
            <Typography variant="caption" color="text.secondary">{details}</Typography>
          )}
        </Stack>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Typography variant="caption" color="text.secondary">{overallProgress}%</Typography>
          {showCancel && (
            <IconButton size="small" onClick={handleCancel} disabled={cancelling} title="Cancel">
              <X size={15} />
            </IconButton>
          )}
        </Stack>
      </Stack>

      {/* ── Progress bar ── */}
      <LinearProgress
        variant={isRunning && overallProgress === 0 ? 'indeterminate' : 'determinate'}
        value={overallProgress}
        color={isFailed || isCancelled ? 'error' : isDone ? 'success' : 'primary'}
        sx={{ mb: 2, height: 8, borderRadius: 4 }}
      />

      {error && !isFailed && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* ── Step list (shown when available) ── */}
      {steps.length > 0 && (
        <Stack spacing={0.5} sx={{ mb: 1 }}>
          {steps.map((step, i) => (
            <Stack
              key={i}
              direction="row"
              spacing={1.5}
              alignItems="center"
              sx={{
                py: 0.75, px: 1, borderRadius: 1,
                bgcolor: step.status === 'running' ? 'action.selected'
                       : step.status === 'failed'  ? 'error.50'
                       : step.status === 'skipped' ? 'transparent'
                       : 'action.hover',
                opacity: step.status === 'skipped' ? 0.45 : 1,
              }}
            >
              <StepIcon status={step.status} />
              <Typography
                variant="body2"
                sx={{ flex: 1, fontWeight: step.status === 'running' ? 600 : 400 }}
              >
                {STEP_LABELS[step.name] || step.label || step.name}
              </Typography>
              {step.duration != null && (
                <Typography variant="caption" color="text.secondary">
                  {formatMs(step.duration)}
                </Typography>
              )}
              {step.status === 'completed' && stepResultCaption(step) && (
                <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 120, textAlign: 'right' }}>
                  {stepResultCaption(step)}
                </Typography>
              )}
              {step.error && (
                <Chip label="Error" size="small" color="error" variant="outlined"
                  sx={{ fontSize: '0.6rem', height: 18 }} />
              )}
              {step.result?.method?.includes('fallback') && (
                <Chip label="fallback" size="small" color="warning" variant="outlined"
                  sx={{ fontSize: '0.6rem', height: 18 }} />
              )}
            </Stack>
          ))}
        </Stack>
      )}

      {/* ── Skeleton placeholder when no steps yet ── */}
      {steps.length === 0 && !isDone && !isFailed && (
        <Stack spacing={0.5} sx={{ mb: 1 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Stack key={i} direction="row" spacing={1.5} alignItems="center"
              sx={{ py: 0.75, px: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
              <Clock size={16} style={{ opacity: 0.3 }} />
              <Typography variant="body2" color="text.disabled">Waiting…</Typography>
            </Stack>
          ))}
        </Stack>
      )}

      {/* ── Completion summary ── */}
      {isDone && summary && (
        <Box sx={{ mt: 2, p: 1.5, bgcolor: 'success.main', borderRadius: 1, color: 'success.contrastText' }}>
          <Typography variant="subtitle2" fontWeight={700} gutterBottom>Extraction Complete</Typography>
          <Stack direction="row" spacing={2} flexWrap="wrap">
            {summary.entitiesExtracted != null && (
              <Typography variant="caption">{summary.entitiesExtracted} entities</Typography>
            )}
            {summary.relationsFound != null && (
              <Typography variant="caption">{summary.relationsFound} relations</Typography>
            )}
            {summary.vectorsIndexed != null && (
              <Typography variant="caption">{summary.vectorsIndexed} vectors indexed</Typography>
            )}
            {summary.processesLinked != null && (
              <Typography variant="caption">{summary.processesLinked} processes linked</Typography>
            )}
            {summary.kqsScore != null && (
              <Typography variant="caption">KQS: {summary.kqsScore?.toFixed(3)}</Typography>
            )}
            {summary.aiModel && (
              <Typography variant="caption">Model: {summary.aiModel}</Typography>
            )}
          </Stack>
        </Box>
      )}

      {isFailed && (
        <Alert severity="error" sx={{ mt: 2 }}>
          Extraction failed — see logs below for details.
        </Alert>
      )}

      {isCancelled && (
        <Alert severity="warning" sx={{ mt: 2 }}>Extraction was cancelled.</Alert>
      )}

      {/* ── Collapsible log panel ── */}
      {(logEntries.length > 0 || isTerminal) && (
        <Box sx={{ mt: 2 }}>
          <Divider />
          <Stack
            direction="row" alignItems="center" justifyContent="space-between"
            sx={{ mt: 1, cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setLogsOpen(v => !v)}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              {logEntries.some(l => l.level === 'error')
                ? <XCircle size={14} color="#ef4444" />
                : logEntries.some(l => l.level === 'warn')
                  ? <AlertTriangle size={14} color="#f59e0b" />
                  : <Info size={14} style={{ opacity: 0.5 }} />
              }
              <Typography variant="caption" fontWeight={600}>
                Extraction Log
                {logEntries.length > 0 && (
                  <> &mdash; {logEntries.filter(l => l.level === 'error').length} error(s),{' '}
                  {logEntries.filter(l => l.level === 'warn').length} warning(s)</>
                )}
              </Typography>
            </Stack>
            <IconButton size="small">
              {logsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </IconButton>
          </Stack>

          <Collapse in={logsOpen}>
            <Paper variant="outlined" sx={{
              mt: 0.5, p: 1, maxHeight: 220, overflowY: 'auto',
              bgcolor: 'grey.50', fontFamily: 'monospace'
            }}>
              {logEntries.length === 0 ? (
                <Typography variant="caption" color="text.secondary">No errors or warnings.</Typography>
              ) : (
                <Stack spacing={0.5}>
                  {logEntries.map((entry, i) => (
                    <Stack key={i} direction="row" spacing={1} alignItems="flex-start">
                      {entry.level === 'error'
                        ? <XCircle size={13} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
                        : <AlertTriangle size={13} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
                      }
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="caption" sx={{
                          color: entry.level === 'error' ? 'error.main' : 'warning.main',
                          fontWeight: 600, fontSize: '0.68rem'
                        }}>
                          [{STEP_LABELS[entry.step] || entry.step}]
                        </Typography>
                        <Typography variant="caption" component="div" sx={{
                          mt: 0.25, fontSize: '0.72rem', lineHeight: 1.5,
                          color: entry.level === 'error' ? 'error.dark' : 'text.primary',
                          wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                          fontFamily: 'monospace'
                        }}>
                          {entry.message || '(no error details)'}
                        </Typography>
                      </Box>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Paper>
          </Collapse>
        </Box>
      )}

      {onClose && (
        <Button size="small" onClick={onClose} sx={{ mt: 2 }} fullWidth variant="outlined">
          {isTerminal ? 'Close' : 'Minimize'}
        </Button>
      )}
    </Box>
  );
}
