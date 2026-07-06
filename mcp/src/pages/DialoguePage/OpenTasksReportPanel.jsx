import React, { useState, useCallback } from 'react';
import {
  Box, Typography, Stack, Chip, Paper, Collapse, Divider,
  IconButton, Tooltip, Select, MenuItem, FormControl, CircularProgress,
  Alert, Button, Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import {
  ExpandMore, ExpandLess, PlayArrow, Refresh,
  EmojiEvents, HourglassEmpty, RadioButtonUnchecked, Block as BlockIcon,
  OpenInNew, AccountTree, CheckCircleOutline, ContentCopy, Launch,
} from '@mui/icons-material';
import { useDevCollectorReport, useDevCollectorAnalyze } from '../../hooks/useDialogue';
import { prepareDevCollectorTaskSession } from '../../services/dialogue.service';

// ── Config ────────────────────────────────────────────────────────────────────

const MODELS = [
  { value: 'claude-code',              label: 'Claude Code  (current session)' },
  { value: 'claude-opus-4-7',          label: 'Opus 4.7  (best quality)' },
  { value: 'claude-sonnet-4-6',        label: 'Sonnet 4.6  (recommended)' },
  { value: 'claude-haiku-4-5-20251001',label: 'Haiku 4.5  (fastest)' },
];

const CATEGORY_COLOR = {
  bug_fix:   'error',
  feature:   'primary',
  task:      'default',
  research:  'secondary',
  decision:  'warning',
  analysis:  'info',
};

const STATUS_CFG = {
  in_progress: { Icon: HourglassEmpty,       color: 'warning.main', label: 'In progress' },
  pending:     { Icon: RadioButtonUnchecked, color: 'text.disabled', label: 'Pending'     },
  blocked:     { Icon: BlockIcon,            color: 'error.main',    label: 'Blocked'     },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildVSCodeUri(sessionId) {
  return `vscode://devdialogue.connector/open/${encodeURIComponent(sessionId)}`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Launch-in-Claude-Code modal ───────────────────────────────────────────────

function LaunchModal({ task, open, onClose }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState(null);
  const [copied, setCopied]   = useState(false);

  const handlePrepare = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await prepareDevCollectorTaskSession(task.rank);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [task.rank]);

  const handleCopy = useCallback(() => {
    if (result?.prompt) {
      navigator.clipboard.writeText(result.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [result]);

  const handleOpen = useCallback(() => {
    if (result?.vsCodeUri) window.open(result.vsCodeUri, '_self');
  }, [result]);

  // Auto-prepare when modal opens
  React.useEffect(() => {
    if (open && !result && !loading) handlePrepare();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClose = () => { setResult(null); setError(null); onClose(); };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Launch sx={{ color: 'primary.main' }} />
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>
              Launch in Claude Code
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Task #{task.rank}: {task.title}
            </Typography>
          </Box>
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        {loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">
              Preparing task briefing…
            </Typography>
          </Box>
        )}

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {result && !loading && (
          <>
            <Alert severity="info" sx={{ mb: 2 }}>
              Task briefing saved to <strong>{result.filePath?.split(/[\\/]/).pop()}</strong>.
              Open it in VS Code, then start a new Claude Code chat and paste the prompt.
            </Alert>

            <Typography variant="caption" color="text.secondary" fontWeight={700}
              sx={{ display: 'block', mb: 0.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Task Briefing Prompt
            </Typography>
            <Paper
              variant="outlined"
              sx={{
                p: 1.5, maxHeight: 360, overflow: 'auto',
                bgcolor: 'background.default', fontFamily: 'monospace',
              }}
            >
              <Typography
                component="pre"
                variant="caption"
                sx={{ whiteSpace: 'pre-wrap', display: 'block', lineHeight: 1.6 }}
              >
                {result.prompt}
              </Typography>
            </Paper>

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
              Available MCP tools in this session:
              {' '}<strong>devcollector_get_report</strong>,
              {' '}<strong>devcollector_get_session_context</strong>,
              {' '}<strong>devcollector_list_open_tasks</strong>,
              {' '}<strong>search_knowledge</strong>,
              {' '}<strong>query_knowledge_graph</strong>
            </Typography>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Button onClick={handleClose} size="small" color="inherit">Close</Button>
        {result && (
          <>
            <Button
              size="small"
              variant="outlined"
              startIcon={<ContentCopy sx={{ fontSize: 14 }} />}
              onClick={handleCopy}
              color={copied ? 'success' : 'primary'}
            >
              {copied ? 'Copied!' : 'Copy prompt'}
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<OpenInNew sx={{ fontSize: 14 }} />}
              onClick={handleOpen}
            >
              Open in VS Code
            </Button>
          </>
        )}
        {error && (
          <Button size="small" variant="outlined" onClick={handlePrepare}>
            Retry
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

// ── Single ranked task card ───────────────────────────────────────────────────

function TaskCard({ task }) {
  const [expanded, setExpanded]   = useState(false);
  const [launchOpen, setLaunchOpen] = useState(false);
  const statusCfg = STATUS_CFG[task.status] || STATUS_CFG.in_progress;
  const vsUri = buildVSCodeUri(task.sessionId);

  return (
    <Paper variant="outlined" sx={{ mb: 1, overflow: 'hidden' }}>
      {/* Header row */}
      <Box
        sx={{ px: 1.5, py: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
        onClick={() => setExpanded(v => !v)}
      >
        <Stack direction="row" spacing={1} alignItems="flex-start">
          {/* Rank badge */}
          <Box sx={{
            minWidth: 28, height: 28, borderRadius: '50%',
            bgcolor: 'primary.main', color: 'primary.contrastText',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, flexShrink: 0, mt: 0.2,
          }}>
            {task.rank}
          </Box>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
              <Typography variant="body2" fontWeight={600}>
                {task.title}
              </Typography>
              <Chip
                label={task.category?.replace('_', ' ')}
                size="small"
                color={CATEGORY_COLOR[task.category] || 'default'}
                sx={{ height: 16, fontSize: 12 }}
              />
              <Tooltip title={statusCfg.label}>
                <statusCfg.Icon sx={{ fontSize: 14, color: statusCfg.color }} />
              </Tooltip>
            </Stack>

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
              {task.description}
            </Typography>
          </Box>

          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
            {/* Launch in Claude Code with task briefing */}
            <Tooltip title="Launch new Claude Code session with task briefing">
              <IconButton
                size="small"
                onClick={e => { e.stopPropagation(); setLaunchOpen(true); }}
                sx={{ p: 0.5, color: 'success.main' }}
              >
                <Launch sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
            {/* Open source session in VS Code */}
            <Tooltip title="Open source session in Claude Code">
              <IconButton
                size="small"
                component="a"
                href={vsUri}
                onClick={e => e.stopPropagation()}
                sx={{ p: 0.5, color: 'primary.main' }}
              >
                <OpenInNew sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
            {expanded ? <ExpandLess sx={{ fontSize: 16 }} /> : <ExpandMore sx={{ fontSize: 16 }} />}
          </Stack>
        </Stack>
      </Box>

      {/* Expanded detail */}
      <Collapse in={expanded} unmountOnExit>
        <Divider />
        <Box sx={{ px: 2, py: 1.25, bgcolor: 'background.default' }}>
          {task.importance && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="primary.main" fontWeight={700}
                sx={{ textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 0.25 }}>
                Why it matters
              </Typography>
              <Typography variant="caption" color="text.primary">
                {task.importance}
              </Typography>
            </Box>
          )}

          {task.order_rationale && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="warning.main" fontWeight={700}
                sx={{ textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 0.25 }}>
                Why at rank #{task.rank}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {task.order_rationale}
              </Typography>
            </Box>
          )}

          {task.dependencies?.length > 0 && (
            <Box sx={{ mb: 1 }}>
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5 }}>
                <AccountTree sx={{ fontSize: 13, color: 'text.disabled' }} />
                <Typography variant="caption" color="text.disabled" fontWeight={700}
                  sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Depends on
                </Typography>
              </Stack>
              <Stack direction="row" spacing={0.5} flexWrap="wrap">
                {task.dependencies.map((d, i) => (
                  <Chip key={i} label={d} size="small" variant="outlined"
                    sx={{ height: 18, fontSize: 12 }} />
                ))}
              </Stack>
            </Box>
          )}

          <Divider sx={{ my: 0.75 }} />
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" flexWrap="wrap">
            <Typography variant="caption" color="text.disabled" noWrap sx={{ flex: 1 }}>
              Session: {task.sessionTitle || task.sessionId}
            </Typography>
            <Stack direction="row" spacing={0.75}>
              <Button
                size="small"
                variant="contained"
                color="success"
                startIcon={<Launch sx={{ fontSize: 13 }} />}
                onClick={() => setLaunchOpen(true)}
                sx={{ fontSize: 13, py: 0.3, px: 1, whiteSpace: 'nowrap' }}
              >
                Launch in Claude Code
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<OpenInNew sx={{ fontSize: 13 }} />}
                component="a"
                href={vsUri}
                sx={{ fontSize: 13, py: 0.3, px: 1, whiteSpace: 'nowrap' }}
              >
                Source session
              </Button>
            </Stack>
          </Stack>
        </Box>
      </Collapse>

      <LaunchModal task={task} open={launchOpen} onClose={() => setLaunchOpen(false)} />
    </Paper>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function OpenTasksReportPanel() {
  const [panelOpen, setPanelOpen]     = useState(true);
  const [model, setModel]             = useState('claude-code');
  const [pendingInfo, setPendingInfo] = useState(null); // { sessionCount, openTaskCount }
  const [polling, setPolling]         = useState(false);

  const { report, loading: reportLoading, refetch } = useDevCollectorReport();
  const { analyze, loading: analyzing, error: analyzeError } = useDevCollectorAnalyze();

  // Poll every 5 s while waiting for Claude Code to submit the analysis
  React.useEffect(() => {
    if (!polling) return;
    const timer = setInterval(() => refetch(), 5000);
    return () => clearInterval(timer);
  }, [polling, refetch]);

  // Stop polling once a report with tasks arrives
  React.useEffect(() => {
    if (polling && report?.tasks?.length) {
      setPolling(false);
      setPendingInfo(null);
    }
  }, [polling, report]);

  const handleAnalyze = useCallback(() => {
    setPendingInfo(null);
    setPolling(false);
    analyze(model, (newReport, meta) => {
      if (newReport) refetch();
      if (meta?.pending) {
        setPendingInfo(meta);
        setPolling(true);
      }
    });
  }, [analyze, model, refetch]);

  const hasReport = !!report?.tasks?.length;
  const isLoading = reportLoading || analyzing;

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 3,
        overflow: 'hidden',
        borderColor: hasReport ? 'primary.main' : 'divider',
        borderWidth: hasReport ? 1.5 : 1,
      }}
    >
      {/* ── Panel header ── */}
      <Box
        sx={{
          px: 2, py: 1.25,
          cursor: 'pointer',
          bgcolor: 'action.selected',
          '&:hover': { bgcolor: 'action.focus' },
        }}
        onClick={() => setPanelOpen(v => !v)}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <CheckCircleOutline sx={{ fontSize: 20, color: 'primary.main' }} />

          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" fontWeight={700}>
              Open Tasks Priority Report
            </Typography>
            {report?.analyzedAt && (
              <Typography variant="caption" color="text.disabled">
                Last analyzed: {fmtDate(report.analyzedAt)}
                {report.sessionCount != null && ` · ${report.sessionCount} sessions`}
                {report.openTaskCount != null && ` · ${report.openTaskCount} open tasks`}
                {report.model && ` · ${report.model.replace('claude-', '')}`}
              </Typography>
            )}
          </Box>

          {/* Controls */}
          <Stack direction="row" spacing={0.75} alignItems="center" onClick={e => e.stopPropagation()}>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <Select
                value={model}
                onChange={e => setModel(e.target.value)}
                sx={{ fontSize: '0.78rem', height: 30 }}
              >
                {MODELS.map(m => (
                  <MenuItem key={m.value} value={m.value} sx={{ fontSize: '0.8rem' }}>
                    {m.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Tooltip title={hasReport ? 'Re-analyze all open tasks' : 'Analyze all open tasks'}>
              <span>
                <IconButton
                  size="small"
                  onClick={handleAnalyze}
                  disabled={isLoading}
                  color="primary"
                  sx={{ p: 0.6 }}
                >
                  {analyzing
                    ? <CircularProgress size={16} />
                    : hasReport
                      ? <Refresh sx={{ fontSize: 18 }} />
                      : <PlayArrow sx={{ fontSize: 18 }} />
                  }
                </IconButton>
              </span>
            </Tooltip>
          </Stack>

          {panelOpen ? <ExpandLess sx={{ fontSize: 18 }} /> : <ExpandMore sx={{ fontSize: 18 }} />}
        </Stack>
      </Box>

      {/* ── Panel body ── */}
      <Collapse in={panelOpen} unmountOnExit>
        <Box sx={{ p: 2 }}>
          {reportLoading && !report && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={28} />
            </Box>
          )}

          {analyzing && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">
                Analyzing all open tasks with {model.replace('claude-', '')}…
              </Typography>
            </Box>
          )}

          {analyzeError && (
            <Alert severity="error" sx={{ mb: 2 }}>{analyzeError}</Alert>
          )}

          {polling && pendingInfo && (
            <Alert severity="info" sx={{ mb: 2 }} icon={<CircularProgress size={16} />}>
              <strong>Analysis queued for Claude Code</strong> — {pendingInfo.sessionCount} sessions,{' '}
              {pendingInfo.openTaskCount} open tasks.{' '}
              In Claude Code, call <code>devcollector_get_analysis_request</code>, analyze,
              then <code>devcollector_submit_analysis</code>. Polling for result…
            </Alert>
          )}

          {!reportLoading && !analyzing && !hasReport && !polling && (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <Typography color="text.secondary" variant="body2" sx={{ mb: 1.5 }}>
                No report yet. Click <strong>Analyze</strong> to rank all open tasks across all sessions.
              </Typography>
              <Button
                variant="contained"
                startIcon={<PlayArrow />}
                onClick={handleAnalyze}
                disabled={isLoading}
                size="small"
              >
                Analyze open tasks
              </Button>
            </Box>
          )}

          {hasReport && !analyzing && (
            <>
              {/* Summary */}
              <Paper
                variant="outlined"
                sx={{ p: 1.5, mb: 2, bgcolor: 'background.default', borderStyle: 'dashed' }}
              >
                <Typography variant="caption" color="primary.main" fontWeight={700}
                  sx={{ display: 'block', mb: 0.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Summary
                </Typography>
                <Typography variant="body2" color="text.primary" sx={{ lineHeight: 1.7 }}>
                  {report.summary}
                </Typography>
              </Paper>

              {/* Stats row */}
              <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
                <Chip label={`${report.tasks.length} ranked tasks`} size="small" variant="outlined" color="primary" />
                <Chip label={`${report.tasks.filter(t => t.status === 'blocked').length} blocked`} size="small" variant="outlined" color="error" />
                <Chip label={`${report.tasks.filter(t => t.dependencies?.length > 0).length} with dependencies`} size="small" variant="outlined" color="warning" />
              </Stack>

              {/* Ranked task list */}
              {report.tasks.map(task => (
                <TaskCard key={`${task.rank}-${task.sessionId}-${task.title}`} task={task} />
              ))}
            </>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}
