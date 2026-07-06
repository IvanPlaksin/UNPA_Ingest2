import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  Box, Typography, Button, IconButton, Chip, LinearProgress, CircularProgress,
  Drawer, Dialog, DialogTitle, DialogContent, DialogActions, Divider,
  Tooltip, Alert, Select, MenuItem, FormControl, InputLabel, Switch,
  FormControlLabel, Checkbox, Stack, Badge,
} from '@mui/material';
import {
  Activity, AlertTriangle, CheckCircle2, Clock, RefreshCw, X, Play,
  RotateCcw, Plus, Layers, Cpu, Database, GitGraph, ChevronRight,
  ChevronDown, Zap, List, Bot, Pause, Square, SkipForward, Microscope, Send,
} from 'lucide-react';
import {
  getStats, getJobs, enqueueDocuments, enqueueDocumentsByMethodology, getExtractionMethodologies,
  getExtractionHistory, verifyCompletedJobs, getDocRefStats, queueDocRefs, reconcileDocRefs,
  cancelJob, retryJob, retryAllFailed, connectStream,
  requeueDocuments, getZeroEntityDocs, setConcurrency, enqueuePendingFromQueue,
  agentStatus, agentStart, agentStop, agentPause, agentResume, connectAgentLogStream,
  advisorCommands, advisorAnalyze,
} from '../services/pipelineManager.service';
import { API_BASE_URL } from '../config/api.config';

// ─── Constants ────────────────────────────────────────────────────────────────

const STEP_SHORT = {
  '01': 'Load', 'ocr': 'OCR', '02': 'Chunk', '03': 'Ent', '04': 'Rel',
  '05': 'Spec', '06': 'Dedup', '07': 'Graph', '08': 'Embed',
  '09': 'Post', '10': 'Store', '11': 'Refs',
};
const ALL_STEP_KEYS = ['01', 'ocr', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11'];

const STEP_NAMES = {
  '01':  'load-source',
  'ocr': 'ocr-scan',
  '02':  'chunk-text',
  '03':  'extract-entities',
  '04':  'extract-relations',
  '05':  'extract-specialized',
  '06':  'deduplicate',
  '07':  'persist-graph',
  '08':  'embed-and-index',
  '09':  'post-process',
  '10':  'store-result',
  '11':  'queue-refs',
};

const STEP_COLORS = {
  pending:   { bg: '#1e293b', text: '#94a3b8', border: 'transparent' },
  running:   { bg: '#1e3a5f', text: '#93c5fd', border: '#3b82f6' },
  completed: { bg: '#166534', text: '#4ade80', border: '#22c55e' },
  failed:    { bg: '#7f1d1d', text: '#fca5a5', border: '#ef4444' },
};

const MODE_CHIP = {
  DOCUMENT:  { label: 'DOC',  color: '#6366f1' },
  WORKSPACE: { label: 'WS',   color: '#0891b2' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortId(id = '') {
  if (!id) return '—';
  return id.length > 20 ? id.slice(0, 8) + '…' + id.slice(-4) : id;
}

function fmtMs(ms) {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString();
}

// ─── StepBar ─────────────────────────────────────────────────────────────────

function getStepStatus(key, steps = []) {
  if (!steps || !steps.length) return 'pending';
  const canonical = STEP_NAMES[key]; // e.g. 'load-source'
  const found = steps.find(s => {
    if (!s.name) return false;
    return (
      s.name === canonical ||           // exact: 'load-source'
      s.name === `${key}-${canonical}` || // prefixed: '01-load-source'
      s.name.includes(canonical)          // substring fallback
    );
  });
  if (!found) return 'pending';
  return found.status || 'pending';
}

function StepBar({ steps = [] }) {
  return (
    <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75 }}>
      {ALL_STEP_KEYS.map(key => {
        const status = getStepStatus(key, steps);
        const c = STEP_COLORS[status] || STEP_COLORS.pending;
        return (
          <Tooltip key={key} title={`${key}: ${STEP_SHORT[key]} (${status})`}>
            <Box sx={{
              position: 'relative', width: 28, height: 22,
              bgcolor: c.bg,
              border: `1px solid ${c.border}`,
              borderRadius: 0.75,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 600, color: c.text, userSelect: 'none',
              flexShrink: 0,
              transition: 'background 0.3s',
            }}>
              {status === 'running' && (
                <CircularProgress size={10} thickness={5}
                  sx={{ position: 'absolute', color: '#3b82f6', opacity: 0.7 }} />
              )}
              <span style={{ position: 'relative', zIndex: 1 }}>
                {status === 'completed' ? '✓' : status === 'failed' ? '✗' : STEP_SHORT[key]}
              </span>
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}

// ─── Active Job Card ──────────────────────────────────────────────────────────

function ActiveJobCard({ job, liveProgress, onCancel, onClick }) {
  const progress  = liveProgress || job.progress || {};
  const pct       = progress.overallProgress ?? 0;
  const phase     = progress.phase || 'processing';
  const steps     = progress.steps || [];
  const summary   = progress.summary || {};
  const mode      = job.mode || 'DOCUMENT';
  const modeConf  = MODE_CHIP[mode] || MODE_CHIP.DOCUMENT;

  return (
    <Box
      onClick={onClick}
      sx={{
        bgcolor: '#0d1117', border: '1px solid #1e293b', borderRadius: 2,
        p: 1.5, mb: 1.5, cursor: 'pointer',
        '&:hover': { borderColor: '#3b82f6', bgcolor: '#0f172a' },
        transition: 'border-color 0.2s',
      }}
    >
      {/* Header row */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <Chip
            label={modeConf.label}
            size="small"
            sx={{ height: 18, fontSize: 13, fontWeight: 700,
                  bgcolor: modeConf.color + '22', color: modeConf.color,
                  border: `1px solid ${modeConf.color}44` }}
          />
          <Typography noWrap variant="caption" sx={{ color: '#94a3b8', fontSize: 13, fontFamily: 'monospace' }}>
            {shortId(job.sourceId)}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Chip
            label={`${pct}%`}
            size="small"
            sx={{ height: 18, fontSize: 13, fontWeight: 700,
                  bgcolor: '#1e293b', color: '#60a5fa' }}
          />
          <Tooltip title="Cancel job">
            <IconButton size="small" onClick={e => { e.stopPropagation(); onCancel(job.jobId); }}
              sx={{ color: '#64748b', '&:hover': { color: '#ef4444' }, p: 0.5 }}>
              <X size={13} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Phase text */}
      <Typography variant="caption" sx={{ color: '#64748b', fontSize: 13, display: 'block', mb: 0.5 }}>
        Phase: <Box component="span" sx={{ color: '#93c5fd' }}>{phase}</Box>
        {progress.currentStep && ` · ${progress.currentStep}`}
      </Typography>

      {/* Progress bar */}
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          height: 4, borderRadius: 2, bgcolor: '#1e293b', mb: 0.75,
          '& .MuiLinearProgress-bar': { bgcolor: '#3b82f6', borderRadius: 2 },
        }}
      />

      {/* Step bar */}
      <StepBar steps={steps} />

      {/* Summary */}
      {(summary.entitiesExtracted || summary.relationsFound || summary.vectorsIndexed) && (
        <Box sx={{ display: 'flex', gap: 2, mt: 0.75 }}>
          {summary.entitiesExtracted != null && (
            <Typography variant="caption" sx={{ color: '#4ade80', fontSize: 13 }}>
              E: {summary.entitiesExtracted}
            </Typography>
          )}
          {summary.relationsFound != null && (
            <Typography variant="caption" sx={{ color: '#60a5fa', fontSize: 13 }}>
              R: {summary.relationsFound}
            </Typography>
          )}
          {summary.vectorsIndexed != null && (
            <Typography variant="caption" sx={{ color: '#a78bfa', fontSize: 13 }}>
              V: {summary.vectorsIndexed}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}

// ─── Compact job row (waiting / completed / failed) ───────────────────────────

function CompactJobRow({ job, onCancel, onRetry, onClick, onAdvise }) {
  const statusColor = {
    waiting:   '#eab308',
    completed: '#22c55e',
    failed:    '#ef4444',
  }[job.status] || '#64748b';

  const rv = job.returnvalue || {};
  const entities = rv.stats?.entitiesExtracted ?? job.progress?.summary?.entitiesExtracted;
  const vectors  = rv.stats?.vectorsIndexed    ?? null;

  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1,
        px: 1.5, py: 0.75, borderRadius: 1, mb: 0.5,
        bgcolor: '#0d1117', border: '1px solid #1e293b',
        cursor: 'pointer',
        '&:hover': { borderColor: '#334155' },
      }}
    >
      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: statusColor, flexShrink: 0 }} />
      <Typography noWrap variant="caption" sx={{ color: '#94a3b8', fontSize: 13, flex: 1, fontFamily: 'monospace' }}>
        {shortId(job.sourceId)}
      </Typography>
      {job.status === 'completed' && entities != null && (
        <Typography variant="caption" sx={{ color: '#4ade80', fontSize: 13, flexShrink: 0 }}>
          E:{entities}{vectors != null ? ` V:${vectors}` : ''}
        </Typography>
      )}
      {job.status === 'failed' && (
        <Tooltip title={job.failedReason || 'Unknown error'}>
          <Typography noWrap variant="caption" sx={{ color: '#fca5a5', fontSize: 13, maxWidth: 80 }}>
            {(job.failedReason || 'failed').slice(0, 20)}
          </Typography>
        </Tooltip>
      )}
      <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 13, flexShrink: 0 }}>
        {fmtDate(job.finishedOn || job.processedOn || job.enqueuedAt)}
      </Typography>
      {job.status === 'waiting' && (
        <Tooltip title="Cancel">
          <IconButton size="small" onClick={e => { e.stopPropagation(); onCancel(job.jobId); }}
            sx={{ color: '#94a3b8', '&:hover': { color: '#ef4444' }, p: 0.25 }}>
            <X size={12} />
          </IconButton>
        </Tooltip>
      )}
      {job.status === 'failed' && (
        <Tooltip title="Retry">
          <IconButton size="small" onClick={e => { e.stopPropagation(); onRetry(job.jobId); }}
            sx={{ color: '#94a3b8', '&:hover': { color: '#22c55e' }, p: 0.25 }}>
            <RotateCcw size={12} />
          </IconButton>
        </Tooltip>
      )}
      {(job.status === 'completed' || job.status === 'failed') && onAdvise && (
        <Tooltip title="Advisor — AI analysis">
          <IconButton size="small" onClick={e => { e.stopPropagation(); onAdvise(job); }}
            sx={{ color: '#94a3b8', '&:hover': { color: '#a78bfa' }, p: 0.25 }}>
            <Microscope size={12} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}

// ─── Stats Chip ───────────────────────────────────────────────────────────────

function StatChip({ label, value, color }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75,
               bgcolor: '#0d1117', border: '1px solid #1e293b',
               borderRadius: 1.5, px: 1.25, py: 0.5 }}>
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />
      <Typography variant="caption" sx={{ color: '#64748b', fontSize: 13 }}>{label}</Typography>
      <Typography variant="caption" sx={{ color, fontWeight: 700, fontSize: 13 }}>{value ?? 0}</Typography>
    </Box>
  );
}

// ─── Section Header ────────────────────────────────────────────────────────────

function SectionTitle({ children, count, action }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, px: 0.5 }}>
      <Typography variant="caption" sx={{
        fontSize: 13, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: '#94a3b8',
      }}>
        {children}
      </Typography>
      {count != null && (
        <Chip label={count} size="small"
          sx={{ height: 16, fontSize: 13, bgcolor: '#1e293b', color: '#94a3b8' }} />
      )}
      {action && <Box sx={{ ml: 'auto' }}>{action}</Box>}
    </Box>
  );
}

// ─── Job Detail Drawer ────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <Typography variant="caption" sx={{
      color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.07em', display: 'block', mb: 1, mt: 0.5,
    }}>
      {children}
    </Typography>
  );
}

function StatRow({ label, value, color = '#e2e8f0', mono = false }) {
  if (value == null || value === '') return null;
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.3 }}>
      <Typography variant="caption" sx={{ color: '#64748b', fontSize: 13 }}>{label}</Typography>
      <Typography variant="caption" sx={{
        color, fontSize: 13, fontWeight: 600,
        fontFamily: mono ? 'monospace' : 'inherit',
        maxWidth: 220, textAlign: 'right', wordBreak: 'break-all',
      }}>
        {value}
      </Typography>
    </Box>
  );
}

function BigStat({ label, value, color }) {
  return (
    <Box sx={{ textAlign: 'center', minWidth: 64 }}>
      <Typography sx={{ color, fontWeight: 800, fontSize: 20, lineHeight: 1.1 }}>{value ?? '—'}</Typography>
      <Typography variant="caption" sx={{ color: '#64748b', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </Typography>
    </Box>
  );
}

function StepResultBadge({ result, status }) {
  if (!result || status === 'pending') return null;
  const pairs = Object.entries(result).filter(([k, v]) => v != null && k !== 'reason');
  if (!pairs.length) {
    if (result.reason) {
      return (
        <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 13, fontStyle: 'italic', display: 'block', mt: 0.2 }}>
          {String(result.reason).slice(0, 80)}
        </Typography>
      );
    }
    return null;
  }
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.3 }}>
      {pairs.slice(0, 5).map(([k, v]) => (
        <Chip key={k} label={`${k}: ${typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : String(v).slice(0, 20)}`}
          size="small"
          sx={{ height: 16, fontSize: 13, bgcolor: '#1e293b', color: '#94a3b8', '& .MuiChip-label': { px: 0.75 } }} />
      ))}
    </Box>
  );
}

function JobDetailDrawer({ job, liveProgress, onClose, selectedMethodology = 'M2', methodologies = [], onReExtract }) {
  const [docName, setDocName]         = useState(null);
  const [sourceUrl, setSourceUrl]     = useState(null);
  const [logOpen, setLogOpen]         = useState(false);
  const [errOpen, setErrOpen]         = useState(true);
  const [claudeOpen, setClaudeOpen]   = useState(false);
  const [reExtracting, setReExtracting]   = useState(false);
  const [history, setHistory]             = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!job?.sourceId) { setDocName(null); setSourceUrl(null); return; }
    setDocName(null);
    setSourceUrl(null);
    setLogOpen(job?.status === 'failed');
    axios.get(`/api/v1/documents/${job.sourceId}/status`)
      .then(r => {
        const d = r.data?.data || r.data;
        setDocName(d?.originalname || d?.filename || d?.documentTitle || null);
        setSourceUrl(d?.sourceUrl || null);
      })
      .catch(() => {});
  }, [job?.sourceId]);

  useEffect(() => {
    if (!job?.sourceId) { setHistory([]); return; }
    setHistoryLoading(true);
    getExtractionHistory(job.sourceId)
      .then(h => setHistory(h))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [job?.sourceId]);

  const handleReExtract = async () => {
    if (!job?.sourceId || reExtracting) return;
    setReExtracting(true);
    try { await onReExtract?.(job.sourceId, selectedMethodology); }
    finally { setReExtracting(false); }
  };

  if (!job) return null;

  const progress  = liveProgress || job.progress || {};
  const rv        = job.returnvalue || liveProgress?.result || {};
  const steps     = progress.steps || rv.steps || [];
  const stats     = rv.stats || {};
  const pp        = rv.postProcessResults || {};
  const es        = rv.esSync || {};
  const logItems  = rv.log || progress.log || [];

  const kqs      = pp.calculateKQSHook?.score;
  const triangle = pp.buildTriangleHook?.edges || {};
  const triangleTotal = (triangle.governs || 0) + (triangle.operationalizes || 0) + (triangle.revealsGapIn || 0);
  const gaps     = pp.detectGapsHook?.count;

  const statusColor = { completed: '#4ade80', failed: '#f87171', active: '#60a5fa', waiting: '#facc15' };
  const sc = statusColor[job.status] || '#94a3b8';

  const durationMs = stats.durationMs || (
    job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : null
  );

  const errSteps = steps.filter(s => s.status === 'failed');

  return (
    <Drawer anchor="right" open={!!job} onClose={onClose}
      PaperProps={{ sx: { width: 460, bgcolor: '#0d1117', borderLeft: '1px solid #1e293b',
                           display: 'flex', flexDirection: 'column', overflow: 'hidden' } }}>

      {/* ── Header ── */}
      <Box sx={{ px: 2, pt: 2, pb: 1.5, borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
          <Typography variant="subtitle2" sx={{ color: '#e2e8f0', fontWeight: 700, fontSize: 13 }}>
            Job Detail
          </Typography>
          <IconButton size="small" onClick={onClose} sx={{ color: '#64748b' }}>
            <X size={16} />
          </IconButton>
        </Box>
        {docName && (
          <Typography sx={{ color: '#c084fc', fontSize: 13, fontWeight: 600, mb: 0.25,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {docName}
          </Typography>
        )}
        {sourceUrl && (
          <Typography component="a" href={sourceUrl} target="_blank" rel="noopener noreferrer"
            sx={{ color: '#38bdf8', fontSize: 12, display: 'block', mb: 0.5,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  textDecoration: 'none', '&:hover': { textDecoration: 'underline', color: '#7dd3fc' } }}>
            ↗ {sourceUrl}
          </Typography>
        )}
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
          <Chip label={job.mode || 'DOCUMENT'} size="small"
            sx={{ height: 18, fontSize: 13, bgcolor: '#1e293b', color: '#818cf8' }} />
          <Chip label={job.status?.toUpperCase()} size="small"
            sx={{ height: 18, fontSize: 13, bgcolor: '#1e293b', color: sc, fontWeight: 700 }} />
          {job.adapterName && (
            <Chip label={job.adapterName} size="small"
              sx={{ height: 18, fontSize: 13, bgcolor: '#1e293b', color: '#64748b' }} />
          )}
          {job.attemptsMade > 1 && (
            <Chip label={`attempt ${job.attemptsMade}`} size="small"
              sx={{ height: 18, fontSize: 13, bgcolor: '#451a03', color: '#fb923c' }} />
          )}
        </Box>
      </Box>

      {/* ── Scrollable body ── */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 1.5 }}>

        {/* ── Re-extract panel ── */}
        {job.sourceId && (
          <Box sx={{ mb: 1.5, p: 1.25, bgcolor: '#0f172a', borderRadius: 1.5,
                     display: 'flex', gap: 1, alignItems: 'center' }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 11, color: '#64748b', mb: 0.25 }}>Extraction method</Typography>
              <Typography sx={{ fontSize: 12, color: '#c084fc', fontWeight: 600 }}>
                {selectedMethodology === 'standard' || !selectedMethodology
                  ? 'Standard pipeline'
                  : (() => { const m = methodologies.find(x => x.id === selectedMethodology); return m ? `${m.id} — ${m.name}` : selectedMethodology; })()}
              </Typography>
            </Box>
            <Button
              size="small"
              variant="contained"
              disabled={reExtracting}
              onClick={handleReExtract}
              startIcon={reExtracting
                ? <CircularProgress size={11} sx={{ color: '#fff' }} />
                : <RotateCcw size={12} />}
              sx={{ fontSize: 12, py: 0.75, px: 1.5, bgcolor: '#1d4ed8',
                    '&:hover': { bgcolor: '#1e40af' }, whiteSpace: 'nowrap', flexShrink: 0 }}>
              Re-extract
            </Button>
          </Box>
        )}

        {/* Progress bar (active jobs) */}
        {(job.status === 'active' || job.status === 'waiting') && (
          <Box sx={{ mb: 1.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" sx={{ color: '#64748b', fontSize: 13 }}>Overall Progress</Typography>
              <Typography variant="caption" sx={{ color: '#60a5fa', fontWeight: 700 }}>
                {progress.overallProgress ?? 0}%
              </Typography>
            </Box>
            <LinearProgress variant="determinate" value={progress.overallProgress ?? 0}
              sx={{ height: 5, borderRadius: 3, bgcolor: '#1e293b',
                    '& .MuiLinearProgress-bar': { bgcolor: '#3b82f6' } }} />
            {progress.currentStep && (
              <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 13, mt: 0.5, display: 'block' }}>
                Current: {progress.currentStep}
              </Typography>
            )}
          </Box>
        )}

        {/* ── Extraction Statistics ── */}
        {(stats.entitiesExtracted != null || stats.textChars != null) && (
          <>
            <SectionLabel>Extraction Statistics</SectionLabel>
            <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5, flexWrap: 'wrap', justifyContent: 'space-around',
                       bgcolor: '#0f172a', borderRadius: 1.5, p: 1.5 }}>
              {stats.entitiesExtracted != null && <BigStat label="Entities"    value={stats.entitiesExtracted} color="#4ade80" />}
              {stats.relationsFound    != null && <BigStat label="AI Relations" value={stats.relationsFound}    color="#60a5fa" />}
              {stats.vectorsIndexed    != null && <BigStat label="Vectors"     value={stats.vectorsIndexed}    color="#a78bfa" />}
              {stats.chunksCount       != null && <BigStat label="Chunks"      value={stats.chunksCount}       color="#94a3b8" />}
            </Box>
            <Box sx={{ bgcolor: '#0f172a', borderRadius: 1.5, p: 1.25, mb: 1.5 }}>
              <StatRow label="Text chars"   value={stats.textChars != null ? stats.textChars.toLocaleString() : null} />
              <StatRow label="Deduplicated" value={stats.deduplicated} />
              <StatRow label="Duration"     value={durationMs ? fmtMs(durationMs) : null} color="#fbbf24" />
              {stats.errors?.length > 0 && (
                <StatRow label="Step errors" value={stats.errors.length} color="#f87171" />
              )}
            </Box>
          </>
        )}

        {/* ── Vector Indexing ── */}
        {stats.vectorsAttempted > 0 && (
          <>
            <SectionLabel>Vector Indexing</SectionLabel>
            <Box sx={{ bgcolor: '#0f172a', borderRadius: 1.5, p: 1.25, mb: 1.5 }}>
              <StatRow label="Attempted" value={stats.vectorsAttempted} />
              <StatRow label="Indexed"   value={stats.vectorsIndexed}   color="#4ade80" />
              {(stats.vectorsFailed > 0) && (
                <StatRow label="Failed" value={stats.vectorsFailed} color="#f87171" />
              )}
              <StatRow label="Collection" value={rv.mode === 'WORKSPACE' ? `workspace_${rv.workspaceId || '…'}` : 'documents_entities'} />
            </Box>
          </>
        )}

        {/* ── Graph Relationships ── */}
        {(stats.graphNodesCreated > 0 || stats.relationsFound > 0 || (es.refsLinked != null && es.refsLinked > 0) || triangleTotal > 0) && (
          <>
            <SectionLabel>Graph Relationships</SectionLabel>
            <Box sx={{ bgcolor: '#0f172a', borderRadius: 1.5, p: 1.25, mb: 1.5 }}>
              {stats.graphNodesCreated > 0 && (
                <StatRow label="Entity nodes (MENTIONS)" value={stats.graphNodesCreated} />
              )}
              {stats.relationsFound > 0 && (
                <StatRow label="RELATED_TO edges" value={stats.relationsFound} color="#60a5fa" />
              )}
              {es.refsLinked > 0 && (
                <StatRow label="ES references linked" value={es.refsLinked} color="#a78bfa" />
              )}
              {triangleTotal > 0 && (
                <>
                  {triangle.governs         != null && <StatRow label="GOVERNS edges"         value={triangle.governs} />}
                  {triangle.operationalizes != null && <StatRow label="OPERATIONALIZES edges"  value={triangle.operationalizes} />}
                  {triangle.revealsGapIn    != null && <StatRow label="REVEALS_GAP_IN edges"   value={triangle.revealsGapIn} />}
                </>
              )}
            </Box>
          </>
        )}

        {/* ── Quality Metrics ── */}
        {(kqs != null || triangleTotal > 0 || gaps != null) && (
          <>
            <SectionLabel>Quality Metrics</SectionLabel>
            <Box sx={{ bgcolor: '#0f172a', borderRadius: 1.5, p: 1.25, mb: 1.5 }}>
              {kqs != null && <StatRow label="KQS Score" value={kqs.toFixed(3)} color="#fbbf24" />}
              {pp.calculateKQSHook?.entitiesScored != null && (
                <StatRow label="Entities scored" value={pp.calculateKQSHook.entitiesScored} />
              )}
              {triangle.governs       != null && <StatRow label="Triangle — Governs"       value={triangle.governs} />}
              {triangle.operationalizes != null && <StatRow label="Triangle — Operationalizes" value={triangle.operationalizes} />}
              {triangle.revealsGapIn  != null && <StatRow label="Triangle — RevealsGapIn"  value={triangle.revealsGapIn} />}
              {gaps != null && <StatRow label="Gaps detected" value={gaps} color={gaps > 0 ? '#f87171' : '#64748b'} />}
            </Box>
          </>
        )}

        {/* ── Entity Store Sync ── */}
        {es.total != null && (
          <>
            <SectionLabel>Entity Store Sync</SectionLabel>
            <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5, justifyContent: 'space-around',
                       bgcolor: '#0f172a', borderRadius: 1.5, p: 1.25 }}>
              <BigStat label="Created"      value={es.created} color="#4ade80" />
              <BigStat label="Linked"       value={es.linked}  color="#60a5fa" />
              <BigStat label="Already synced" value={es.skipped} color="#94a3b8" />
              <BigStat label="Total"        value={es.total}   color="#e2e8f0" />
            </Box>
            {es.refsLinked > 0 && (
              <Box sx={{ bgcolor: '#0f172a', borderRadius: 1.5, p: 1.25, mb: 1 }}>
                <StatRow label="References linked" value={es.refsLinked} color="#a78bfa" />
              </Box>
            )}
            {es.success && es.created === 0 && es.linked === 0 && (es.skipped || 0) > 0 && (
              <Typography variant="caption" sx={{ color: '#4ade80', display: 'block', mb: 1.5, px: 0.5 }}>
                Previously synced — entities already in store
              </Typography>
            )}
            {!es.success && (
              <Alert severity="warning" sx={{ mb: 1.5, fontSize: 13, bgcolor: '#451a0322', color: '#fb923c',
                '& .MuiAlert-icon': { color: '#fb923c' } }}>
                Entity store sync failed
              </Alert>
            )}
          </>
        )}

        {/* ── IDs ── */}
        <SectionLabel>Identifiers</SectionLabel>
        <Box sx={{ bgcolor: '#0f172a', borderRadius: 1.5, p: 1.25, mb: 1.5 }}>
          <StatRow label="Job ID"        value={job.jobId}       mono color="#64748b" />
          <StatRow label="Source ID"     value={job.sourceId}    mono color="#64748b" />
          <StatRow label="Result ID"     value={rv.resultId}     mono color="#64748b" />
          <StatRow label="Extraction ID" value={rv.extractionJobId} mono color="#64748b" />
          <StatRow label="Methodology"   value={rv.methodologyId} mono color="#64748b" />
        </Box>

        {/* ── Step Timeline ── */}
        <SectionLabel>Step Timeline</SectionLabel>
        {steps.length === 0 ? (
          <Typography variant="caption" sx={{ color: '#94a3b8', fontStyle: 'italic', display: 'block', mb: 1.5 }}>
            No step data yet
          </Typography>
        ) : (
          <Box sx={{ mb: 1.5 }}>
            {steps.map((step, i) => {
              const sc2 = STEP_COLORS[step.status] || STEP_COLORS.pending;
              const isErr = step.status === 'failed';
              const isSkip = step.status === 'skipped';
              return (
                <Box key={i} sx={{
                  display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 0.75,
                  bgcolor: isErr ? '#7f1d1d18' : 'transparent',
                  borderRadius: 1, px: isErr ? 0.75 : 0, py: isErr ? 0.5 : 0,
                }}>
                  <Box sx={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, mt: 0.55,
                             bgcolor: sc2.border || sc2.text || '#475569' }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="caption" sx={{
                        color: isSkip ? '#94a3b8' : '#e2e8f0', fontSize: 13, fontWeight: 500,
                        fontStyle: isSkip ? 'italic' : 'normal',
                      }}>
                        {step.label || step.name}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexShrink: 0 }}>
                        {step.duration != null && (
                          <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 13 }}>
                            {fmtMs(step.duration)}
                          </Typography>
                        )}
                        <Chip label={step.status} size="small"
                          sx={{ height: 14, fontSize: 13, bgcolor: sc2.bg, color: sc2.text,
                                '& .MuiChip-label': { px: 0.5 } }} />
                      </Box>
                    </Box>
                    <StepResultBadge result={step.result} status={step.status} />
                    {step.error && (
                      <Typography variant="caption" sx={{ color: '#fca5a5', fontSize: 13, display: 'block', mt: 0.25 }}>
                        {step.error}
                      </Typography>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}

        {/* ── Timestamps ── */}
        <SectionLabel>Timing</SectionLabel>
        <Box sx={{ bgcolor: '#0f172a', borderRadius: 1.5, p: 1.25, mb: 1.5 }}>
          <StatRow label="Enqueued"  value={fmtDate(job.enqueuedAt)}  />
          <StatRow label="Started"   value={fmtDate(job.processedOn || progress.startedAt)} />
          <StatRow label="Finished"  value={fmtDate(job.finishedOn)} />
          {durationMs && <StatRow label="Duration" value={fmtMs(durationMs)} color="#fbbf24" />}
          {job.attemptsMade != null && <StatRow label="Attempts" value={job.attemptsMade} />}
        </Box>

        {/* ── Error ── */}
        {(job.failedReason || errSteps.length > 0) && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
              <SectionLabel>Errors</SectionLabel>
              <IconButton size="small" onClick={() => setErrOpen(p => !p)} sx={{ color: '#64748b', mt: -0.5 }}>
                {errOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </IconButton>
            </Box>
            {errOpen && (
              <Box sx={{ mb: 1.5 }}>
                {job.failedReason && (
                  <Alert severity="error" sx={{ mb: 1, fontSize: 13, bgcolor: '#7f1d1d22', color: '#fca5a5',
                    '& .MuiAlert-icon': { color: '#ef4444', fontSize: 14 } }}>
                    {job.failedReason}
                  </Alert>
                )}
                {errSteps.map((s, i) => (
                  <Alert key={i} severity="error" sx={{ mb: 0.75, fontSize: 13, bgcolor: '#7f1d1d18',
                    color: '#fca5a5', '& .MuiAlert-icon': { color: '#ef4444', fontSize: 14 } }}>
                    <strong>{s.label || s.name}:</strong> {s.error || 'Step failed'}
                  </Alert>
                ))}
              </Box>
            )}
          </>
        )}

        {/* ── Execution Log ── */}
        {logItems.length > 0 && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
              <SectionLabel>Execution Log</SectionLabel>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Chip label={logItems.length} size="small"
                  sx={{ height: 16, fontSize: 13, bgcolor: '#1e293b', color: '#64748b' }} />
                <IconButton size="small" onClick={() => setLogOpen(p => !p)} sx={{ color: '#64748b', mt: -0.5 }}>
                  {logOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </IconButton>
              </Box>
            </Box>
            {logOpen && (
              <Box sx={{ bgcolor: '#020617', borderRadius: 1.5, p: 1.25, mb: 1.5,
                         maxHeight: 500, overflow: 'auto', fontFamily: 'monospace' }}>
                {logItems.map((entry, i) => {
                  const isErr = entry.level === 'error';
                  const isWarn = entry.level === 'warn';
                  return (
                    <Box key={i} sx={{ display: 'flex', gap: 0.75, mb: 0.3, alignItems: 'flex-start' }}>
                      <Typography sx={{ color: '#64748b', fontSize: 13, flexShrink: 0, mt: 0.15, fontFamily: 'monospace' }}>
                        {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''}
                      </Typography>
                      <Typography sx={{ color: '#94a3b8', fontSize: 13, flexShrink: 0, minWidth: 60, mt: 0.15, fontFamily: 'monospace' }}>
                        [{entry.step || '—'}]
                      </Typography>
                      <Typography sx={{
                        fontSize: 13, fontFamily: 'monospace',
                        color: isErr ? '#f87171' : isWarn ? '#fb923c' : '#64748b',
                        wordBreak: 'break-word', flex: 1,
                      }}>
                        {entry.message}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            )}
          </>
        )}

        {/* ── Claude Output ── */}
        {rv.claudeOutput && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
              <SectionLabel>Claude Output (Phase 1)</SectionLabel>
              <IconButton size="small" onClick={() => setClaudeOpen(p => !p)} sx={{ color: '#64748b', mt: -0.5 }}>
                {claudeOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </IconButton>
            </Box>
            {claudeOpen && (
              <Box sx={{ bgcolor: '#020617', borderRadius: 1.5, p: 1.25, mb: 1.5,
                         maxHeight: 400, overflow: 'auto', fontFamily: 'monospace' }}>
                <Typography sx={{ fontSize: 13, color: '#64748b', fontFamily: 'monospace',
                                  whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {rv.claudeOutput}
                </Typography>
              </Box>
            )}
          </>
        )}

        {/* ── Extraction History ── */}
        {job.sourceId && (
          <>
            <SectionLabel>Extraction History</SectionLabel>
            {historyLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5, mb: 1.5 }}>
                <CircularProgress size={16} sx={{ color: '#64748b' }} />
              </Box>
            ) : history.length === 0 ? (
              <Typography variant="caption" sx={{ color: '#475569', fontStyle: 'italic', display: 'block', mb: 1.5 }}>
                No extraction history yet
              </Typography>
            ) : (
              <Box sx={{ mb: 1.5 }}>
                {history.map((run, i) => {
                  const mColor = run.methodology === 'M1' ? '#3b82f6'
                               : run.methodology === 'M2' ? '#8b5cf6'
                               : run.methodology === 'M4' ? '#f59e0b'
                               : run.methodology === 'M5' ? '#06b6d4'
                               : '#64748b';
                  return (
                    <Box key={run.id || i} sx={{
                      bgcolor: '#0f172a', borderRadius: 1.5, p: 1.25, mb: 0.75,
                      borderLeft: `3px solid ${run.success ? '#22c55e' : '#ef4444'}`,
                    }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.4 }}>
                        <Chip label={run.methodology || 'standard'} size="small"
                          sx={{ height: 16, fontSize: 11, bgcolor: `${mColor}22`, color: mColor,
                                '& .MuiChip-label': { px: 0.75 } }} />
                        <Typography sx={{ color: run.success ? '#4ade80' : '#f87171', fontSize: 11 }}>
                          {run.success ? '✓' : '✗'}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                        {run.entities != null && (
                          <Typography sx={{ color: '#94a3b8', fontSize: 11 }}>
                            {run.entities} ent
                          </Typography>
                        )}
                        {run.relations != null && (
                          <Typography sx={{ color: '#94a3b8', fontSize: 11 }}>
                            {run.relations} rel
                          </Typography>
                        )}
                        {run.vectors != null && (
                          <Typography sx={{ color: '#94a3b8', fontSize: 11 }}>
                            {run.vectors} vec
                          </Typography>
                        )}
                        {run.durationMs > 0 && (
                          <Typography sx={{ color: '#94a3b8', fontSize: 11 }}>
                            {fmtMs(run.durationMs)}
                          </Typography>
                        )}
                      </Box>
                      {run.extractedAt && (
                        <Typography sx={{ color: '#475569', fontSize: 11, display: 'block', mt: 0.25 }}>
                          {fmtDate(run.extractedAt)}
                        </Typography>
                      )}
                    </Box>
                  );
                })}
              </Box>
            )}
          </>
        )}

      </Box>
    </Drawer>
  );
}

// ─── Advisor Dialog ───────────────────────────────────────────────────────────

function AdvisorDialog({ job, onClose }) {
  const [commands, setCommands]   = useState([]);
  const [history, setHistory]     = useState([]);   // [{role, content}]
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [autoRan, setAutoRan]     = useState(false);
  const chatEndRef                = useRef(null);

  // Load suggested commands and auto-run first analysis
  useEffect(() => {
    if (!job) return;
    setHistory([]);
    setAutoRan(false);
    advisorCommands()
      .then(cmds => {
        setCommands(cmds || []);
        // Auto-run first command
        const first = (cmds || [])[0];
        if (first && !autoRan) {
          setAutoRan(true);
          runMessage(first, [], cmds || []);
        }
      })
      .catch(() => {
        const defaultFirst = 'Проанализируй эффективность экстракции: оцени длительность каждого шага, найди узкие места и бессмысленные ожидания';
        setAutoRan(true);
        runMessage(defaultFirst, [], []);
      });
  }, [job?.jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [history, loading]);

  async function runMessage(msg, currentHistory, currentCommands) {
    if (!msg.trim() || !job) return;
    const newHistory = [...currentHistory, { role: 'user', content: msg }];
    setHistory(newHistory);
    setInput('');
    setLoading(true);
    try {
      const result = await advisorAnalyze({
        jobId:   job.jobId,
        message: msg,
        history: currentHistory,
      });
      setHistory(prev => [...prev, { role: 'assistant', content: result.response || '(no response)' }]);
    } catch (e) {
      setHistory(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}`, isError: true }]);
    } finally {
      setLoading(false);
    }
  }

  const handleSend = () => runMessage(input, history, commands);
  const handleCmd  = (cmd) => {
    if (loading) return;
    runMessage(cmd, history, commands);
  };

  if (!job) return null;

  const rv    = job.returnvalue || {};
  const stats = rv.stats || {};
  const dur   = stats.durationMs ? (stats.durationMs < 1000 ? `${stats.durationMs}ms` : `${(stats.durationMs / 1000).toFixed(1)}s`) : null;

  return (
    <Dialog open={!!job} onClose={onClose} maxWidth="lg" fullWidth
      PaperProps={{ sx: {
        bgcolor: '#0a0f1a', border: '1px solid #1e293b', borderRadius: 2,
        height: '90vh', display: 'flex', flexDirection: 'column',
      } }}>

      {/* Header */}
      <DialogTitle sx={{ borderBottom: '1px solid #1e293b', p: 0, flexShrink: 0 }}>
        <Box sx={{ px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Microscope size={18} style={{ color: '#a78bfa' }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ color: '#e2e8f0', fontWeight: 700, fontSize: 14 }}>
              Extraction Advisor
            </Typography>
            <Typography noWrap sx={{ color: '#64748b', fontSize: 13 }}>
              Job: {job.jobId} · {job.status?.toUpperCase()}
              {dur && ` · ${dur}`}
              {stats.entitiesExtracted != null && ` · E:${stats.entitiesExtracted}`}
              {stats.vectorsIndexed    != null && ` · V:${stats.vectorsIndexed}`}
            </Typography>
          </Box>
          <IconButton size="small" onClick={onClose} sx={{ color: '#64748b' }}>
            <X size={16} />
          </IconButton>
        </Box>
      </DialogTitle>

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Quick commands */}
        {commands.length > 0 && (
          <Box sx={{ px: 2, pt: 1.5, pb: 1, borderBottom: '1px solid #0f172a', flexShrink: 0 }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontSize: 13, display: 'block', mb: 0.75,
              textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Quick Commands
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {commands.slice(0, 6).map((cmd, i) => (
                <Chip
                  key={i}
                  label={cmd.length > 55 ? cmd.slice(0, 55) + '…' : cmd}
                  size="small"
                  onClick={() => handleCmd(cmd)}
                  disabled={loading}
                  sx={{
                    height: 20, fontSize: 13, cursor: 'pointer',
                    bgcolor: i === 0 ? '#1e1b4b' : '#0f172a',
                    color: i === 0 ? '#a78bfa' : '#64748b',
                    border: `1px solid ${i === 0 ? '#4c1d9544' : '#1e293b'}`,
                    '&:hover': { bgcolor: '#1e293b', color: '#e2e8f0' },
                    '& .MuiChip-label': { px: 1 },
                  }}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* Chat area */}
        <Box sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {history.length === 0 && !loading && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
              flex: 1, gap: 1, color: '#64748b' }}>
              <Microscope size={20} />
              <Typography sx={{ fontSize: 13 }}>Загрузка анализа…</Typography>
            </Box>
          )}

          {history.map((msg, i) => {
            const isUser = msg.role === 'user';
            return (
              <Box key={i} sx={{ display: 'flex', flexDirection: 'column',
                alignItems: isUser ? 'flex-end' : 'flex-start' }}>
                <Box sx={{
                  maxWidth: '92%',
                  bgcolor: isUser ? '#1e3a5f' : '#0f172a',
                  border: `1px solid ${isUser ? '#3b82f644' : '#1e293b'}`,
                  borderRadius: 1.5,
                  px: 1.5, py: 1,
                }}>
                  {isUser ? (
                    <Typography sx={{ fontSize: 13, color: '#93c5fd', lineHeight: 1.5 }}>
                      {msg.content}
                    </Typography>
                  ) : (
                    <Box sx={{ '& h1,& h2,& h3': { color: '#c084fc', fontSize: 13, fontWeight: 700, mt: 1, mb: 0.5 },
                               '& p': { fontSize: 13, color: msg.isError ? '#f87171' : '#94a3b8', lineHeight: 1.6, my: 0.4 },
                               '& ul,& ol': { pl: 2, my: 0.4 },
                               '& li': { fontSize: 13, color: '#94a3b8', lineHeight: 1.6 },
                               '& code': { fontSize: 13, fontFamily: 'monospace', color: '#4ade80',
                                          bgcolor: '#020617', px: 0.5, borderRadius: 0.5 },
                               '& pre': { bgcolor: '#020617', p: 1, borderRadius: 1, overflow: 'auto',
                                         fontSize: 13, fontFamily: 'monospace', color: '#64748b', my: 0.75 },
                               '& strong': { color: '#e2e8f0', fontWeight: 600 },
                               '& hr': { borderColor: '#1e293b', my: 0.75 },
                    }}>
                      {/* Render markdown-like content by splitting on ### headings */}
                      {msg.content.split('\n').map((line, li) => {
                        if (line.startsWith('### ')) return <h3 key={li}>{line.slice(4)}</h3>;
                        if (line.startsWith('## '))  return <h2 key={li}>{line.slice(3)}</h2>;
                        if (line.startsWith('# '))   return <h1 key={li}>{line.slice(2)}</h1>;
                        if (line.startsWith('---'))  return <hr key={li} />;
                        if (line.startsWith('- ') || line.startsWith('* ')) {
                          return <p key={li} style={{ paddingLeft: 12 }}>• {line.slice(2)}</p>;
                        }
                        if (line.startsWith('**') && line.endsWith('**')) {
                          return <p key={li}><strong>{line.slice(2, -2)}</strong></p>;
                        }
                        if (!line.trim()) return <div key={li} style={{ height: 4 }} />;
                        return <p key={li}>{line}</p>;
                      })}
                    </Box>
                  )}
                </Box>
              </Box>
            );
          })}

          {loading && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
              <CircularProgress size={14} sx={{ color: '#a78bfa' }} />
              <Typography sx={{ fontSize: 13, color: '#64748b', fontStyle: 'italic' }}>
                Advisor is analyzing…
              </Typography>
            </Box>
          )}
          <div ref={chatEndRef} />
        </Box>

        {/* Input */}
        <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid #1e293b', flexShrink: 0,
          display: 'flex', gap: 1, alignItems: 'flex-end' }}>
          <Box
            component="textarea"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            placeholder="Задайте вопрос по экстракции… (Enter — отправить, Shift+Enter — новая строка)"
            disabled={loading}
            sx={{
              flex: 1, bgcolor: '#0f172a', border: '1px solid #1e293b', borderRadius: 1.5,
              color: '#e2e8f0', fontSize: 13, px: 1.25, py: 0.875, resize: 'none',
              fontFamily: 'inherit', outline: 'none', minHeight: 40, maxHeight: 100,
              '&:focus': { borderColor: '#a78bfa44' },
              '&::placeholder': { color: '#64748b' },
            }}
            rows={2}
          />
          <IconButton
            onClick={handleSend}
            disabled={loading || !input.trim()}
            sx={{
              bgcolor: '#4c1d95', color: '#a78bfa', borderRadius: 1.5, p: 1,
              '&:hover': { bgcolor: '#5b21b6' },
              '&:disabled': { bgcolor: '#1e293b', color: '#64748b' },
            }}
          >
            {loading ? <CircularProgress size={16} sx={{ color: '#a78bfa' }} /> : <Send size={16} />}
          </IconButton>
        </Box>
      </Box>
    </Dialog>
  );
}

// ─── Batch Enqueue Modal ──────────────────────────────────────────────────────

function BatchEnqueueModal({ open, onClose, onEnqueued, defaultMethodology = 'standard', availableMethodologies = [] }) {
  const [documents, setDocuments]           = useState([]);
  const [loading, setLoading]               = useState(false);
  const [selected, setSelected]             = useState(new Set());
  const [enqueueing, setEnqueueing]         = useState(false);
  const [methodology, setMethodology]       = useState(defaultMethodology);
  const [forceReprocess, setForceReprocess] = useState(false);
  const [error, setError]                   = useState('');

  // Sync methodology when parent default changes
  useEffect(() => { setMethodology(defaultMethodology); }, [defaultMethodology]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelected(new Set());
    setError('');
    axios.get('/api/v1/documents', { params: { limit: 200 } })
      .then(r => setDocuments(r.data?.documents || r.data?.data || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [open]);

  const toggleAll = () => {
    if (selected.size === documents.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(documents.map(d => d.id)));
    }
  };

  const toggleDoc = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleEnqueue = async () => {
    if (selected.size === 0) return;
    setEnqueueing(true);
    setError('');
    try {
      const ids = [...selected];
      let results;
      if (methodology && methodology !== 'standard') {
        results = await enqueueDocumentsByMethodology(ids, methodology, { force: forceReprocess });
      } else {
        results = await enqueueDocuments(ids, { forceReprocess });
      }
      onEnqueued(results);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setEnqueueing(false);
    }
  };

  const statusColor = {
    pending:    '#eab308',
    processing: '#3b82f6',
    processed:  '#22c55e',
    failed:     '#ef4444',
    draft:      '#64748b',
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
      PaperProps={{ sx: { bgcolor: '#0d1117', border: '1px solid #1e293b', borderRadius: 2 } }}>
      <DialogTitle sx={{ color: '#e2e8f0', borderBottom: '1px solid #1e293b', pb: 1.5,
        display: 'flex', alignItems: 'center', gap: 1 }}>
        <Plus size={18} />
        Batch Enqueue Documents
        {selected.size > 0 && (
          <Chip label={`${selected.size} selected`} size="small"
            sx={{ ml: 'auto', bgcolor: '#1e3a5f', color: '#60a5fa', height: 20, fontSize: 13 }} />
        )}
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        {error && (
          <Alert severity="error" sx={{ m: 2, bgcolor: '#7f1d1d22', color: '#fca5a5' }}>
            {error}
          </Alert>
        )}

        {/* Options row */}
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #1e293b',
          display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 210 }}>
            <InputLabel sx={{ color: '#64748b', fontSize: 13 }}>Extraction Method</InputLabel>
            <Select value={methodology} label="Extraction Method" onChange={e => setMethodology(e.target.value)}
              sx={{ color: '#e2e8f0', bgcolor: '#1e293b', fontSize: 13,
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#334155' },
                    '& .MuiSvgIcon-root': { color: '#64748b' } }}>
              <MenuItem value="standard">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#64748b', flexShrink: 0 }} />
                  <span>Standard pipeline</span>
                </Box>
              </MenuItem>
              {availableMethodologies.map(m => (
                <MenuItem key={m.id} value={m.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                    <Box sx={{ width: 6, height: 6, borderRadius: '50%',
                      bgcolor: m.requiresGLiNER ? '#8b5cf6' : '#3b82f6', flexShrink: 0 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.2 }}>
                        {m.id} — {m.name}
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: '#64748b', lineHeight: 1.2 }}>
                        {m.estimatedCostUSD} · {m.estimatedTimeSec}s
                        {m.requiresGLiNER ? ' · GPU' : ''}
                      </Typography>
                    </Box>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControlLabel
            control={
              <Switch checked={forceReprocess} onChange={e => setForceReprocess(e.target.checked)}
                size="small" sx={{ '& .MuiSwitch-thumb': { bgcolor: forceReprocess ? '#3b82f6' : '#475569' } }} />
            }
            label={<Typography sx={{ fontSize: 13, color: '#94a3b8' }}>Force re-extract</Typography>}
          />
        </Box>

        {/* Document list header */}
        <Box sx={{ px: 2, py: 1, borderBottom: '1px solid #1e293b',
          display: 'flex', alignItems: 'center', gap: 1 }}>
          <Checkbox
            checked={selected.size === documents.length && documents.length > 0}
            indeterminate={selected.size > 0 && selected.size < documents.length}
            onChange={toggleAll} size="small"
            sx={{ color: '#64748b', '&.Mui-checked': { color: '#3b82f6' },
                  '&.MuiCheckbox-indeterminate': { color: '#6366f1' }, p: 0 }}
          />
          <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 13 }}>
            {loading ? 'Loading…' : `${documents.length} documents`}
          </Typography>
        </Box>

        {/* Document rows */}
        <Box sx={{ maxHeight: 360, overflowY: 'auto' }}>
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress size={24} />
            </Box>
          )}
          {!loading && documents.length === 0 && (
            <Typography variant="caption" sx={{ display: 'block', p: 2, color: '#94a3b8', textAlign: 'center' }}>
              No documents found
            </Typography>
          )}
          {!loading && documents.map(doc => (
            <Box key={doc.id} onClick={() => toggleDoc(doc.id)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.5,
                px: 2, py: 0.875, cursor: 'pointer',
                bgcolor: selected.has(doc.id) ? 'rgba(59,130,246,0.06)' : 'transparent',
                borderBottom: '1px solid #0d1117',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' },
              }}>
              <Checkbox
                checked={selected.has(doc.id)}
                onChange={() => toggleDoc(doc.id)}
                size="small" onClick={e => e.stopPropagation()}
                sx={{ color: '#64748b', '&.Mui-checked': { color: '#3b82f6' }, p: 0, flexShrink: 0 }}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>
                  {doc.documentTitle || doc.title || shortId(doc.id)}
                </Typography>
                <Typography noWrap sx={{ color: '#64748b', fontSize: 13 }}>
                  {doc.documentType || doc.namespace || ''}
                  {doc.namespace && doc.documentType ? ` · ${doc.namespace}` : doc.namespace || ''}
                </Typography>
              </Box>
              {doc.status && (
                <Chip label={doc.status} size="small"
                  sx={{ height: 16, fontSize: 13, flexShrink: 0,
                        bgcolor: (statusColor[doc.status] || '#64748b') + '22',
                        color: statusColor[doc.status] || '#64748b' }} />
              )}
            </Box>
          ))}
        </Box>
      </DialogContent>

      <DialogActions sx={{ borderTop: '1px solid #1e293b', px: 2, py: 1.5, gap: 1 }}>
        <Button onClick={onClose} size="small"
          sx={{ color: '#64748b', '&:hover': { bgcolor: '#1e293b' } }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleEnqueue}
          disabled={selected.size === 0 || enqueueing}
          startIcon={enqueueing ? <CircularProgress size={14} /> : <Zap size={14} />}
          size="small"
          sx={{ bgcolor: '#3b82f6', '&:hover': { bgcolor: '#2563eb' },
                '&:disabled': { bgcolor: '#1e293b', color: '#94a3b8' } }}
        >
          {enqueueing ? 'Enqueueing…' : `Enqueue ${selected.size > 0 ? selected.size : ''} documents`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Agent control ───────────────────────────────────────────────────────────

const AGENT_STATE_STYLE = {
  IDLE:    { color: '#94a3b8', glow: 'none',           label: 'IDLE' },
  RUNNING: { color: '#22c55e', glow: '0 0 6px #22c55e88', label: 'RUNNING' },
  PAUSED:  { color: '#eab308', glow: '0 0 6px #eab30888', label: 'PAUSED' },
  STOPPED: { color: '#ef4444', glow: 'none',           label: 'STOPPED' },
};

function AgentStartDialog({ open, onClose, onStart, activeMethodology = 'M2C', availableMethodologies = [] }) {
  const [namespace, setNamespace]   = useState('DEFAULT');
  const [batchSize, setBatchSize]   = useState(5);
  const [agentMeth, setAgentMeth]   = useState(activeMethodology);
  const [busy, setBusy]             = useState(false);

  // Reset dialog selection only when dialog opens anew, not on every activeMethodology change
  // (guards against the page-level selector clobbering an explicit in-dialog selection)
  useEffect(() => { if (open) setAgentMeth(activeMethodology); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStart = async () => {
    setBusy(true);
    try { await onStart({ namespace, batchSize, methodology: agentMeth }); onClose(); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth
      PaperProps={{ sx: { bgcolor: '#0d1117', border: '1px solid #1e293b', borderRadius: 2 } }}>
      <DialogTitle sx={{ color: '#e2e8f0', borderBottom: '1px solid #1e293b', pb: 1.5,
        display: 'flex', alignItems: 'center', gap: 1, fontSize: 14 }}>
        <Bot size={16} style={{ color: '#22c55e' }} />
        Start ES Ingestion Agent
      </DialogTitle>
      <DialogContent sx={{ pt: 2, pb: 1 }}>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <FormControl size="small" fullWidth>
            <InputLabel sx={{ color: '#64748b', fontSize: 13 }}>Namespace</InputLabel>
            <Select value={namespace} label="Namespace" onChange={e => setNamespace(e.target.value)}
              sx={{ color: '#e2e8f0', bgcolor: '#1e293b', fontSize: 13,
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#334155' },
                    '& .MuiSvgIcon-root': { color: '#64748b' } }}>
              <MenuItem value="DEFAULT">DEFAULT</MenuItem>
              <MenuItem value="UN">UN</MenuItem>
              <MenuItem value="CUSTOM">CUSTOM</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth>
            <InputLabel sx={{ color: '#64748b', fontSize: 13 }}>Batch size</InputLabel>
            <Select value={batchSize} label="Batch size" onChange={e => setBatchSize(e.target.value)}
              sx={{ color: '#e2e8f0', bgcolor: '#1e293b', fontSize: 13,
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#334155' },
                    '& .MuiSvgIcon-root': { color: '#64748b' } }}>
              {[1, 2, 3, 5, 10].map(n => <MenuItem key={n} value={n}>{n} documents</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth>
            <InputLabel sx={{ color: '#64748b', fontSize: 13 }}>Extraction method</InputLabel>
            <Select value={agentMeth} label="Extraction method" onChange={e => setAgentMeth(e.target.value)}
              sx={{ color: '#e2e8f0', bgcolor: '#1e293b', fontSize: 13,
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#334155' },
                    '& .MuiSvgIcon-root': { color: '#64748b' } }}>
              <MenuItem value="standard" sx={{ fontSize: 13 }}>Standard pipeline</MenuItem>
              {availableMethodologies.map(m => (
                <MenuItem key={m.id} value={m.id} sx={{ fontSize: 13 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 6, height: 6, borderRadius: '50%',
                      bgcolor: m.requiresGLiNER ? '#8b5cf6' : '#3b82f6', flexShrink: 0 }} />
                    {m.id} — {m.name}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ borderTop: '1px solid #1e293b', px: 2, py: 1.5, gap: 1 }}>
        <Button onClick={onClose} size="small"
          sx={{ color: '#64748b', '&:hover': { bgcolor: '#1e293b' } }}>Cancel</Button>
        <Button variant="contained" onClick={handleStart} disabled={busy}
          startIcon={busy ? <CircularProgress size={12} /> : <Play size={13} />}
          size="small" sx={{ bgcolor: '#22c55e', '&:hover': { bgcolor: '#16a34a' }, fontSize: 13 }}>
          {busy ? 'Starting…' : 'Start'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const LOG_LEVEL_COLOR = { info: '#64748b', warn: '#eab308', error: '#ef4444' };

function AgentControlPanel({ agentState, agentStats, onStart, onPause, onResume, onStop, busy }) {
  const stateStyle = AGENT_STATE_STYLE[agentState] || AGENT_STATE_STYLE.IDLE;
  const isRunning  = agentState === 'RUNNING';
  const isPaused   = agentState === 'PAUSED';
  const isIdle     = agentState === 'IDLE' || agentState === 'STOPPED';

  const [logOpen, setLogOpen]   = useState(false);
  const [logLines, setLogLines] = useState([]);
  const logEndRef               = useRef(null);
  const logEsRef                = useRef(null);

  useEffect(() => {
    if (!logOpen) {
      if (logEsRef.current) { logEsRef.current.close(); logEsRef.current = null; }
      return;
    }
    const es = connectAgentLogStream({
      onHistory: entries => setLogLines(entries),
      onEntry:   entry   => setLogLines(prev => [...prev.slice(-299), entry]),
    });
    logEsRef.current = es;
    return () => { if (logEsRef.current) { logEsRef.current.close(); logEsRef.current = null; } };
  }, [logOpen]);

  // Auto-scroll to bottom on new log entries
  useEffect(() => {
    if (logOpen && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logLines, logOpen]);

  return (
    <Box sx={{ borderBottom: '1px solid #1e293b', bgcolor: '#080f1a', flexShrink: 0 }}>

      {/* ─ Control strip ─ */}
      <Box sx={{ px: 2.5, py: 1, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>

        {/* Icon + label + state dot */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <Bot size={15} style={{ color: stateStyle.color, flexShrink: 0 }} />
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#64748b',
            textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>
            ES Ingestion Agent
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 0.5 }}>
            <Box sx={{ width: 7, height: 7, borderRadius: '50%',
              bgcolor: stateStyle.color, boxShadow: stateStyle.glow }} />
            <Typography sx={{ fontSize: 13, color: stateStyle.color, fontWeight: 700, fontFamily: 'monospace' }}>
              {stateStyle.label}
            </Typography>
          </Box>
          {agentStats?.config?.namespace && agentState !== 'IDLE' && (
            <Chip label={agentStats.config.namespace} size="small"
              sx={{ height: 16, fontSize: 13, bgcolor: '#1e293b', color: '#94a3b8' }} />
          )}
        </Box>

        {/* Stats (only when running/paused) */}
        {!isIdle && agentStats?.stats && (
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 13 }}>
              Batches: <Box component="span" sx={{ color: '#94a3b8', fontWeight: 700 }}>
                {agentStats.stats.totalBatches ?? 0}
              </Box>
            </Typography>
            <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 13 }}>
              Docs: <Box component="span" sx={{ color: '#94a3b8', fontWeight: 700 }}>
                {agentStats.stats.totalDocs ?? 0}
              </Box>
              {agentStats.stats.totalFailed > 0 && (
                <Box component="span" sx={{ color: '#ef4444' }}>
                  {' '}(✗{agentStats.stats.totalFailed})
                </Box>
              )}
            </Typography>
            <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 13 }}>
              ES+: <Box component="span" sx={{ color: '#4ade80', fontWeight: 700 }}>
                {agentStats.stats.totalESCreated ?? 0}
              </Box>
            </Typography>
            {agentStats.stats.lastError && (
              <Tooltip title={agentStats.stats.lastError}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <AlertTriangle size={11} style={{ color: '#eab308' }} />
                  <Typography variant="caption" noWrap
                    sx={{ color: '#eab308', fontSize: 13, maxWidth: 140 }}>
                    {agentStats.stats.lastError.slice(0, 40)}
                  </Typography>
                </Box>
              </Tooltip>
            )}
          </Box>
        )}

        {/* Controls */}
        <Box sx={{ ml: 'auto', display: 'flex', gap: 0.75, alignItems: 'center' }}>
          {/* Log toggle */}
          <Tooltip title={logOpen ? 'Collapse log' : 'Show agent log'}>
            <IconButton size="small" onClick={() => setLogOpen(v => !v)}
              sx={{
                color: logOpen ? '#60a5fa' : '#64748b',
                bgcolor: logOpen ? '#1e3a5f' : 'transparent',
                border: `1px solid ${logOpen ? '#3b82f644' : 'transparent'}`,
                '&:hover': { color: '#60a5fa', bgcolor: '#1e293b' }, p: 0.5,
              }}>
              {logOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </IconButton>
          </Tooltip>

          {isIdle && (
            <Button size="small" variant="contained" onClick={onStart} disabled={busy}
              startIcon={busy ? <CircularProgress size={11} /> : <Play size={12} />}
              sx={{ bgcolor: '#166534', '&:hover': { bgcolor: '#15803d' }, fontSize: 13, py: 0.4, px: 1.25,
                    minWidth: 0, '&:disabled': { bgcolor: '#1e293b', color: '#94a3b8' } }}>
              Start
            </Button>
          )}
          {isRunning && (
            <Tooltip title="Pause agent after current batch">
              <IconButton size="small" onClick={onPause} disabled={busy}
                sx={{ color: '#eab308', bgcolor: '#eab30818', border: '1px solid #eab30833',
                      '&:hover': { bgcolor: '#eab30830' }, p: 0.6 }}>
                <Pause size={13} />
              </IconButton>
            </Tooltip>
          )}
          {isPaused && (
            <Tooltip title="Resume agent">
              <IconButton size="small" onClick={onResume} disabled={busy}
                sx={{ color: '#22c55e', bgcolor: '#22c55e18', border: '1px solid #22c55e33',
                      '&:hover': { bgcolor: '#22c55e30' }, p: 0.6 }}>
                <SkipForward size={13} />
              </IconButton>
            </Tooltip>
          )}
          {!isIdle && (
            <Tooltip title="Stop agent">
              <IconButton size="small" onClick={onStop} disabled={busy}
                sx={{ color: '#ef4444', bgcolor: '#ef444418', border: '1px solid #ef444433',
                      '&:hover': { bgcolor: '#ef444430' }, p: 0.6 }}>
                <Square size={13} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* ─ Log panel ─ */}
      {logOpen && (
        <Box sx={{
          maxHeight: 220, overflowY: 'auto',
          bgcolor: '#060d18', borderTop: '1px solid #1e293b',
          px: 2, py: 0.75,
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          fontSize: 13, lineHeight: 1.65,
        }}>
          {logLines.length === 0 ? (
            <Typography sx={{ color: '#64748b', fontStyle: 'italic', fontSize: 13 }}>
              No log entries yet… agent will stream here when running.
            </Typography>
          ) : (
            logLines.map((entry, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1.25 }}>
                <Box component="span" sx={{ color: '#64748b', flexShrink: 0, userSelect: 'none' }}>
                  {new Date(entry.ts).toLocaleTimeString()}
                </Box>
                <Box component="span" sx={{
                  color: LOG_LEVEL_COLOR[entry.level] || '#64748b',
                  flexShrink: 0, fontWeight: 700, width: 34, textAlign: 'right',
                }}>
                  {entry.level.toUpperCase()}
                </Box>
                <Box component="span" sx={{ color: '#94a3b8', wordBreak: 'break-all' }}>
                  {entry.msg}
                </Box>
              </Box>
            ))
          )}
          <div ref={logEndRef} />
        </Box>
      )}
    </Box>
  );
}

// ─── Verify Completed Dialog ──────────────────────────────────────────────────

const ISSUE_LABELS = {
  'incomplete-steps':        { label: 'Incomplete steps',           color: '#f87171' },
  'no-entities-legacy':      { label: 'Zero entities (legacy)',      color: '#fbbf24' },
  'methodology-no-step-data': { label: 'No step detail (old format)', color: '#a78bfa' },
};

function VerifyCompletedDialog({ open, results, loading, onClose, onReExtract, selectedMethodology, methodologies }) {
  const [selected, setSelected] = useState(new Set());
  const [requeuing, setRequeuing] = useState(false);

  // Reset selection when results change
  useEffect(() => { setSelected(new Set()); }, [results]);

  const items = results?.problematic || [];

  const toggleOne = (sourceId) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(sourceId)) next.delete(sourceId);
      else next.add(sourceId);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(items.map(i => i.sourceId).filter(Boolean)));
  const clearAll  = () => setSelected(new Set());

  const handleReExtract = async () => {
    if (!selected.size) return;
    setRequeuing(true);
    try {
      await onReExtract([...selected]);
      onClose();
    } finally {
      setRequeuing(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
      PaperProps={{ sx: { bgcolor: '#0f172a', color: '#e2e8f0', border: '1px solid #1e293b', borderRadius: 2 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1,
                         borderBottom: '1px solid #1e293b', fontSize: 15, fontWeight: 700 }}>
        <AlertTriangle size={18} style={{ color: '#fbbf24' }} />
        Verify Completed Jobs
        {results && !loading && (
          <Chip
            label={`${results.total} / ${results.checked} issues`}
            size="small"
            sx={{ ml: 1, bgcolor: results.total > 0 ? '#7f1d1d22' : '#16653422',
                  color: results.total > 0 ? '#f87171' : '#4ade80',
                  border: `1px solid ${results.total > 0 ? '#ef444433' : '#22c55e33'}` }}
          />
        )}
        <IconButton onClick={onClose} size="small" sx={{ ml: 'auto', color: '#64748b' }}>
          <X size={16} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', minHeight: 320 }}>
        {loading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 1.5, py: 6 }}>
            <CircularProgress size={20} sx={{ color: '#3b82f6' }} />
            <Typography sx={{ color: '#94a3b8', fontSize: 13 }}>Checking {results?.checked ?? '…'} completed jobs…</Typography>
          </Box>
        ) : items.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, py: 6, gap: 1 }}>
            <CheckCircle2 size={32} style={{ color: '#22c55e' }} />
            <Typography sx={{ color: '#4ade80', fontSize: 14, fontWeight: 600 }}>
              All {results?.checked ?? 0} completed jobs are healthy
            </Typography>
            <Typography sx={{ color: '#64748b', fontSize: 12 }}>Every required pipeline stage completed successfully</Typography>
          </Box>
        ) : (
          <>
            {/* Summary bar */}
            <Box sx={{ px: 2, py: 1, bgcolor: '#0d1117', borderBottom: '1px solid #1e293b',
                       display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Typography sx={{ color: '#94a3b8', fontSize: 12 }}>
                Checked <Box component="span" sx={{ color: '#e2e8f0', fontWeight: 700 }}>{results.checked}</Box> jobs ·
                Found <Box component="span" sx={{ color: '#f87171', fontWeight: 700 }}>{items.length}</Box> requiring attention
              </Typography>
              <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
                <Button size="small" onClick={selectAll}
                  sx={{ fontSize: 12, color: '#60a5fa', py: 0.25, minWidth: 0 }}>
                  Select all
                </Button>
                <Button size="small" onClick={clearAll}
                  sx={{ fontSize: 12, color: '#94a3b8', py: 0.25, minWidth: 0 }}>
                  Clear
                </Button>
              </Box>
            </Box>

            {/* Job list */}
            <Box sx={{ overflowY: 'auto', flex: 1, maxHeight: 420 }}>
              {items.map((item) => {
                const isSel = selected.has(item.sourceId);
                const issueConf = ISSUE_LABELS[item.issue] || { label: item.issue, color: '#94a3b8' };
                return (
                  <Box key={item.jobId}
                    onClick={() => toggleOne(item.sourceId)}
                    sx={{
                      display: 'flex', alignItems: 'flex-start', gap: 1.5,
                      px: 2, py: 1.25,
                      borderBottom: '1px solid #0d1117',
                      bgcolor: isSel ? '#1e3a5f22' : 'transparent',
                      cursor: 'pointer',
                      '&:hover': { bgcolor: isSel ? '#1e3a5f44' : '#0d1117' },
                      transition: 'background 0.15s',
                    }}>
                    <Checkbox
                      checked={isSel}
                      onChange={() => toggleOne(item.sourceId)}
                      onClick={e => e.stopPropagation()}
                      size="small"
                      sx={{ p: 0, color: '#334155', '&.Mui-checked': { color: '#3b82f6' } }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography noWrap sx={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, maxWidth: 280 }}>
                          {item.docName || item.sourceId?.slice(0, 8) + '…' || '—'}
                        </Typography>
                        <Chip label={issueConf.label} size="small"
                          sx={{ height: 16, fontSize: 11, bgcolor: issueConf.color + '22',
                                color: issueConf.color, border: `1px solid ${issueConf.color}44` }} />
                        {item.docStatus && item.docStatus !== 'COMPLETED' && (
                          <Chip label={item.docStatus} size="small"
                            sx={{ height: 16, fontSize: 11, bgcolor: '#1e293b', color: '#94a3b8' }} />
                        )}
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.4, flexWrap: 'wrap' }}>
                        <Typography sx={{ color: '#475569', fontSize: 11, fontFamily: 'monospace' }}>
                          {item.jobId?.slice(0, 40)}
                        </Typography>
                        {item.finishedOn && (
                          <Typography sx={{ color: '#334155', fontSize: 11 }}>
                            · {new Date(item.finishedOn).toLocaleString()}
                          </Typography>
                        )}
                      </Box>
                      {item.hasStepsData && item.failedSteps?.length > 0 && (
                        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                          {item.failedSteps.map(fs => (
                            <Chip key={fs.step}
                              label={`${fs.step}: ${fs.status}`}
                              size="small"
                              sx={{ height: 16, fontSize: 11,
                                    bgcolor: fs.status === 'failed' ? '#7f1d1d22' : '#1e293b',
                                    color: fs.status === 'failed' ? '#fca5a5' : '#94a3b8',
                                    '& .MuiChip-label': { px: 0.75 } }} />
                          ))}
                        </Box>
                      )}
                      {item.issue === 'methodology-no-step-data' && (
                        <Box sx={{ display: 'flex', gap: 1, mt: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                          {item.methodology && (
                            <Chip label={item.methodology} size="small"
                              sx={{ height: 16, fontSize: 11, bgcolor: '#a78bfa22',
                                    color: '#a78bfa', border: '1px solid #a78bfa44',
                                    '& .MuiChip-label': { px: 0.75 } }} />
                          )}
                          {item.stats && (
                            <Typography sx={{ fontSize: 11, color: '#64748b' }}>
                              {item.stats.entitiesExtracted ?? 0}E · {item.stats.relationsFound ?? 0}R · {item.stats.vectorsIndexed ?? 0}V
                              {item.stats.durationMs > 0 && ` · ${Math.round(item.stats.durationMs / 1000)}s`}
                            </Typography>
                          )}
                          <Typography sx={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
                            returnvalue without step detail — re-extract to refresh
                          </Typography>
                        </Box>
                      )}
                    </Box>
                    {item.stats?.entitiesExtracted != null && item.issue !== 'methodology-no-step-data' && (
                      <Typography sx={{ color: '#4ade80', fontSize: 12, flexShrink: 0, pt: 0.25 }}>
                        E:{item.stats.entitiesExtracted}
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Box>
          </>
        )}
      </DialogContent>

      {!loading && items.length > 0 && (
        <DialogActions sx={{ px: 2, py: 1.5, borderTop: '1px solid #1e293b', gap: 1 }}>
          <Typography sx={{ color: '#64748b', fontSize: 12, mr: 'auto' }}>
            {selected.size} of {items.length} selected
          </Typography>
          <Button onClick={onClose} size="small"
            sx={{ color: '#64748b', fontSize: 12 }}>
            Close
          </Button>
          <Button
            variant="contained"
            size="small"
            disabled={!selected.size || requeuing}
            startIcon={requeuing ? <CircularProgress size={12} /> : <RotateCcw size={14} />}
            onClick={handleReExtract}
            sx={{ bgcolor: '#3b82f6', '&:hover': { bgcolor: '#2563eb' },
                  fontSize: 12, '&.Mui-disabled': { bgcolor: '#1e3a5f', color: '#475569' } }}
          >
            Re-extract {selected.size > 0 ? `(${selected.size})` : ''}
          </Button>
        </DialogActions>
      )}
      {!loading && items.length === 0 && (
        <DialogActions sx={{ px: 2, py: 1, borderTop: '1px solid #1e293b' }}>
          <Button onClick={onClose} size="small" sx={{ color: '#64748b', fontSize: 12 }}>Close</Button>
        </DialogActions>
      )}
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PipelineManagerPage() {
  const [stats, setStats]               = useState({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, docs: null });
  const [jobs, setJobs]                 = useState({ waiting: [], active: [], completed: [], failed: [] });
  const [progressMap, setProgressMap]   = useState({});   // jobId → progress payload
  const [selectedJob, setSelectedJob]   = useState(null);
  const [enqueueOpen, setEnqueueOpen]   = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [error, setError]               = useState('');
  const [sseStatus, setSseStatus]       = useState('connecting'); // connecting | live | error
  const [requeueBusy, setRequeueBusy]   = useState(false);
  const [zeroEntityDocs, setZeroEntityDocs] = useState(null); // null=unknown, []=none, [...]=list
  const esRef                           = useRef(null);
  const statsTimerRef                   = useRef(null);
  const sseReconnectRef                 = useRef(null);

  // ── Advisor state ─────────────────────────────────────────────────────
  const [advisorJob, setAdvisorJob]     = useState(null);
  const handleAdvise = useCallback((job) => setAdvisorJob(job), []);

  // ── Verify Completed state ─────────────────────────────────────────────
  const [verifyOpen, setVerifyOpen]         = useState(false);
  const [verifyLoading, setVerifyLoading]   = useState(false);
  const [verifyResults, setVerifyResults]   = useState(null);

  // ── DocRef queue state ─────────────────────────────────────────────────
  const [docRefStats, setDocRefStats]       = useState(null); // { pendingDocRefs, actionableDocuments }
  const [docRefBusy, setDocRefBusy]         = useState(false);
  const [docRefRefreshing, setDocRefRefreshing] = useState(false);

  // ── Agent state ───────────────────────────────────────────────────────
  const [agentState, setAgentState]     = useState('IDLE');
  const [agentStats, setAgentStats]     = useState(null);
  const [agentBusy, setAgentBusy]       = useState(false);
  const [agentStartOpen, setAgentStartOpen] = useState(false);
  const agentTimerRef                   = useRef(null);

  // ── Global extraction methodology ────────────────────────────────────
  const [selectedMethodology, setSelectedMethodology] = useState('M2');
  const [methodologies, setMethodologies]             = useState([]);

  // ── Load extraction methodologies + docref stats once on mount ───────
  useEffect(() => {
    getExtractionMethodologies().then(ms => setMethodologies(ms.filter(m => m.available))).catch(() => {});
    handleLoadDocRefStats();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Data loading ──────────────────────────────────────────────────────

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    setError('');
    try {
      const [s, j] = await Promise.all([getStats(), getJobs({ limit: 500 })]);
      // Preserve `docs` from previous state when Memgraph returned null (transient error)
      if (s) setStats(prev => ({ ...prev, ...s, docs: s.docs ?? prev.docs }));
      if (j) setJobs(j);
    } catch (e) {
      setError(e.message);
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, []);

  // ── SSE stream ────────────────────────────────────────────────────────

  const connectSSE = useCallback((retryDelay = 0) => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    if (sseReconnectRef.current) {
      clearTimeout(sseReconnectRef.current);
      sseReconnectRef.current = null;
    }
    setSseStatus('connecting');
    const es = connectStream({
      onConnected: (data) => {
        setSseStatus('live');
        // Use stats from the connected event (includes doc stats)
        if (data?.stats) setStats(s => ({ ...s, ...data.stats }));
      },
      onJob: (payload) => {
        const { jobId, phase, status } = payload;
        setProgressMap(prev => ({ ...prev, [jobId]: payload }));

        // On terminal events: refresh from Memgraph at 300ms, 2s, 6s.
        // No optimistic counter increment — re-runs of COMPLETED docs don't change
        // the total count, causing false increments that then revert on reconcile.
        const isTerminal = phase === 'completed' || phase === 'failed' || phase === 'cancelled'
          || status === 'completed' || status === 'failed';
        if (isTerminal) {
          setTimeout(() => loadAll(true), 300);
          setTimeout(() => loadAll(true), 2000);
          setTimeout(() => loadAll(true), 6000);
        }
      },
      onError: () => {
        setSseStatus('error');
        // Auto-reconnect with exponential backoff (max 30s)
        const nextDelay = Math.min((retryDelay || 2000) * 1.5, 30000);
        sseReconnectRef.current = setTimeout(() => connectSSE(nextDelay), nextDelay);
      },
    });
    esRef.current = es;
  }, [loadAll]);

  // ── Agent polling ─────────────────────────────────────────────────────

  const refreshAgentStatus = useCallback(async () => {
    try {
      const s = await agentStatus();
      setAgentState(s.state || 'IDLE');
      setAgentStats(s);
    } catch {
      // silently fail — API might be restarting
    }
  }, []);

  // ── Effects ───────────────────────────────────────────────────────────

  useEffect(() => {
    loadAll();
    connectSSE();
    refreshAgentStatus();

    statsTimerRef.current = setInterval(() => {
      getStats().then(s => {
        if (s) setStats(prev => ({ ...prev, ...s, docs: s.docs ?? prev.docs }));
      }).catch(() => {});
    }, 5000);
    agentTimerRef.current = setInterval(refreshAgentStatus, 5000);

    return () => {
      if (esRef.current) esRef.current.close();
      if (sseReconnectRef.current) clearTimeout(sseReconnectRef.current);
      clearInterval(statsTimerRef.current);
      clearInterval(agentTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ───────────────────────────────────────────────────────────

  const handleCancel = async (jobId) => {
    try {
      await cancelJob(jobId);
      setTimeout(() => loadAll(true), 500);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleRetry = async (jobId) => {
    try {
      await retryJob(jobId);
      setTimeout(() => loadAll(true), 500);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleLoadDocRefStats = useCallback(async () => {
    setDocRefRefreshing(true);
    try {
      const s = await getDocRefStats();
      setDocRefStats(s);
    } catch { /* non-critical */ } finally {
      setDocRefRefreshing(false);
    }
  }, []);

  const handleQueueDocRefs = async () => {
    setDocRefBusy(true);
    setError('');
    try {
      const mOpt = selectedMethodology !== 'standard' ? { methodology: selectedMethodology } : {};
      const result = await queueDocRefs(mOpt);
      if (result.found === 0) {
        setError('No pending document references with matching unextracted documents');
      } else {
        setDocRefStats(null); // reset so it reloads
        setTimeout(() => { loadAll(true); handleLoadDocRefStats(); }, 800);
      }
    } catch (e) {
      setError(`DocRef queue failed: ${e.message}`);
    } finally {
      setDocRefBusy(false);
    }
  };

  const handleReconcileDocRefs = async () => {
    setDocRefRefreshing(true);
    try {
      const result = await reconcileDocRefs();
      setTimeout(() => handleLoadDocRefStats(), 500);
      if (result.linked > 0) setError('');
    } catch (e) {
      setError(`DocRef reconcile failed: ${e.message}`);
    } finally {
      setDocRefRefreshing(false);
    }
  };

  const handleVerifyCompleted = async () => {
    setVerifyOpen(true);
    setVerifyLoading(true);
    setVerifyResults(null);
    try {
      const data = await verifyCompletedJobs(500);
      setVerifyResults(data);
    } catch (e) {
      setError(`Verify failed: ${e.message}`);
      setVerifyOpen(false);
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleVerifyReExtract = async (sourceIds) => {
    if (!sourceIds?.length) return;
    const now = new Date().toISOString();
    const mOpt = selectedMethodology !== 'standard' ? { methodology: selectedMethodology } : {};
    const result = await requeueDocuments('ids', sourceIds, { force: true, ...mOpt });
    if (result.queued > 0) setTimeout(() => loadAll(true), 800);
    else setError(`Re-extract: queued ${result.queued}/${sourceIds.length}`);
  };

  const handleRequeueSuspicious = async () => {
    setError('');
    const suspicious = (jobs.completed || []).filter(j => {
      const rv = j.returnvalue || {};
      const entities = rv.stats?.entitiesExtracted ?? null;
      const vectors  = rv.stats?.vectorsIndexed    ?? null;
      return !rv.success || entities === 0 || vectors === 0;
    });
    if (suspicious.length === 0) {
      setError(`Checked ${(jobs.completed || []).length} completed jobs — all healthy`);
      return;
    }
    for (const j of suspicious) {
      try { await retryJob(j.jobId); } catch { /* skip individual */ }
    }
    setTimeout(() => loadAll(true), 800);
  };

  const [retryingAll, setRetryingAll] = useState(false);
  const handleRetryAllFailed = async () => {
    if (retryingAll) return;
    setRetryingAll(true);
    setError('');
    try {
      await retryAllFailed();
      setTimeout(() => loadAll(true), 800);
    } catch (e) {
      setError(e.message);
    } finally {
      setRetryingAll(false);
    }
  };

  const handleEnqueued = (results) => {
    setTimeout(() => loadAll(true), 800);
  };

  const handleRequeueFailed = async () => {
    setRequeueBusy(true);
    setError('');
    try {
      const result = await retryAllFailed();
      if (result.retried === 0) {
        setError('No failed jobs to retry');
      } else {
        setTimeout(() => loadAll(true), 1000);
      }
    } catch (e) {
      setError(`Re-queue failed: ${e.message}`);
    } finally {
      setRequeueBusy(false);
    }
  };

  const handleRequeueZeroEntity = async () => {
    setRequeueBusy(true);
    setError('');
    try {
      const mOpt = selectedMethodology !== 'standard' ? { methodology: selectedMethodology } : {};
      const result = await requeueDocuments('zero-entity', [], { force: true, ...mOpt });
      if (result.attempted === 0) {
        setError('No zero-entity documents found');
      } else {
        setZeroEntityDocs([]);
        setTimeout(() => loadAll(true), 1000);
      }
    } catch (e) {
      setError(`Re-queue failed: ${e.message}`);
    } finally {
      setRequeueBusy(false);
    }
  };

  const handleCheckZeroEntity = async () => {
    try {
      const docs = await getZeroEntityDocs();
      setZeroEntityDocs(docs || []);
    } catch (e) {
      setError(`Check failed: ${e.message}`);
    }
  };

  const handleReExtractFromDrawer = useCallback(async (docId, methodology) => {
    if (!docId) return;
    try {
      const mOpt = methodology && methodology !== 'standard' ? { methodology } : {};
      await requeueDocuments('ids', [docId], { force: true, ...mOpt });
      setTimeout(() => loadAll(true), 800);
    } catch (e) {
      setError(`Re-extract failed: ${e.message}`);
    }
  }, [loadAll]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSyncQueue = async () => {
    setRequeueBusy(true);
    setError('');
    try {
      const mOpt = selectedMethodology !== 'standard' ? { methodology: selectedMethodology } : {};
      const result = await enqueuePendingFromQueue({ force: true, ...mOpt }, false);
      if (result.queued === 0 && result.found === 0) {
        setError('No pending documents found in queue');
      } else if (result.queued > 0) {
        setTimeout(() => loadAll(true), 1000);
      } else {
        setError(`Sync: found ${result.found}, queued ${result.queued}, skipped ${result.skipped}`);
      }
    } catch (e) {
      setError(`Sync failed: ${e.message}`);
    } finally {
      setRequeueBusy(false);
    }
  };

  const handleAgentStart = async (config) => {
    setAgentBusy(true);
    try {
      await agentStart(config);
      await refreshAgentStatus();
    } catch (e) {
      setError(`Agent start failed: ${e.message}`);
    } finally {
      setAgentBusy(false);
    }
  };

  const handleAgentPause = async () => {
    setAgentBusy(true);
    try { await agentPause(); await refreshAgentStatus(); }
    catch (e) { setError(`Agent pause failed: ${e.message}`); }
    finally { setAgentBusy(false); }
  };

  const handleAgentResume = async () => {
    setAgentBusy(true);
    try { await agentResume(); await refreshAgentStatus(); }
    catch (e) { setError(`Agent resume failed: ${e.message}`); }
    finally { setAgentBusy(false); }
  };

  const handleAgentStop = async () => {
    setAgentBusy(true);
    try { await agentStop(); await refreshAgentStatus(); }
    catch (e) { setError(`Agent stop failed: ${e.message}`); }
    finally { setAgentBusy(false); }
  };

  // ── Derived data ──────────────────────────────────────────────────────

  // Merge live progress into active jobs for display
  const activeWithProgress = (jobs.active || []).map(j => ({
    ...j,
    _liveProgress: progressMap[j.jobId] || null,
  }));

  // Also show active jobs we know from SSE but not yet in poll result
  const knownActiveJobIds = new Set((jobs.active || []).map(j => j.jobId));
  const sseActiveExtra = Object.values(progressMap)
    .filter(p => p.phase && !['completed', 'failed', 'cancelled'].includes(p.phase))
    .filter(p => !knownActiveJobIds.has(p.jobId))
    .map(p => ({
      jobId: p.jobId, status: 'active', sourceId: p.sourceId, mode: p.mode,
      _liveProgress: p,
    }));

  const allActive = [...activeWithProgress, ...sseActiveExtra];

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column',
               bgcolor: '#0f172a', color: '#e2e8f0', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <Box sx={{ px: 3, py: 1.5, borderBottom: '1px solid #1e293b',
        display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', flexShrink: 0 }}>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Activity size={20} style={{ color: '#3b82f6' }} />
          <Typography variant="h6" sx={{ color: '#e2e8f0', fontWeight: 700, fontSize: 16 }}>
            Pipeline Manager
          </Typography>
          {/* SSE status indicator */}
          <Tooltip title={`SSE: ${sseStatus}`}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%',
              bgcolor: sseStatus === 'live' ? '#22c55e' : sseStatus === 'error' ? '#ef4444' : '#eab308',
              boxShadow: sseStatus === 'live' ? '0 0 6px #22c55e88' : 'none',
            }} />
          </Tooltip>
        </Box>

        {/* Stats — queue state */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <StatChip label="Waiting"   value={(jobs.waiting   || []).length} color="#eab308" />
          <StatChip label="Active"    value={allActive.length}              color="#3b82f6" />
          <Box sx={{ width: '1px', height: 20, bgcolor: '#1e293b', mx: 0.5 }} />
          <StatChip label="Completed" value={(jobs.completed || []).length} color="#22c55e" />
          <StatChip label="Failed"    value={(jobs.failed    || []).length} color="#ef4444" />
          <Box sx={{ width: '1px', height: 20, bgcolor: '#1e293b', mx: 0.5 }} />
          <Tooltip title="EntityMention nodes of type DOCUMENTREF with no outgoing relationships — these reference documents not yet linked in the graph">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5,
                       px: 1, py: 0.25, borderRadius: 1,
                       bgcolor: (stats.docs?.docRefOrphans ?? 0) > 0 ? '#451a0322' : 'transparent',
                       border: '1px solid',
                       borderColor: (stats.docs?.docRefOrphans ?? 0) > 0 ? '#fb923c55' : '#1e293b' }}>
              <GitGraph size={12} style={{ color: (stats.docs?.docRefOrphans ?? 0) > 0 ? '#fb923c' : '#475569' }} />
              <Typography sx={{ fontSize: 12, color: (stats.docs?.docRefOrphans ?? 0) > 0 ? '#fb923c' : '#475569',
                                fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {stats.docs?.docRefOrphans ?? '—'}
              </Typography>
              <Typography sx={{ fontSize: 11, color: '#475569' }}>
                unlinked refs
              </Typography>
            </Box>
          </Tooltip>
          <Box sx={{ width: '1px', height: 20, bgcolor: '#1e293b', mx: 0.5 }} />
          <Tooltip title="Worker concurrency — how many documents process simultaneously">
            <Select
              value={stats.concurrency ?? 3}
              size="small"
              onChange={async (e) => {
                const n = parseInt(e.target.value, 10);
                try {
                  const r = await setConcurrency(n);
                  setStats(prev => ({ ...prev, concurrency: r.concurrency ?? n }));
                } catch {}
              }}
              sx={{
                height: 24, fontSize: 13, color: '#a78bfa',
                bgcolor: 'transparent',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#a78bfa44' },
                '& .MuiSvgIcon-root': { color: '#a78bfa', fontSize: 16 },
                '& .MuiSelect-select': { py: 0, pl: 1, pr: 2.5 },
              }}
            >
              {[1, 2, 3, 5, 8, 10, 15, 20].map(n => (
                <MenuItem key={n} value={n} sx={{ fontSize: 13 }}>
                  {n} workers
                </MenuItem>
              ))}
            </Select>
          </Tooltip>
        </Box>

        <Box sx={{ ml: 'auto', display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>

          {/* ── Global extraction methodology selector ── */}
          <Tooltip title="Extraction methodology used for all new enqueue operations">
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <Select
                value={selectedMethodology}
                onChange={e => setSelectedMethodology(e.target.value)}
                displayEmpty
                sx={{
                  color: '#e2e8f0', bgcolor: '#0d1117', fontSize: 12, height: 30,
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#334155' },
                  '& .MuiSvgIcon-root': { color: '#64748b' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6366f1' },
                }}
              >
                <MenuItem value="standard" sx={{ fontSize: 12 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#64748b' }} />
                    Standard pipeline
                  </Box>
                </MenuItem>
                {methodologies.map(m => (
                  <MenuItem key={m.id} value={m.id} sx={{ fontSize: 12 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 6, height: 6, borderRadius: '50%',
                        bgcolor: m.requiresGLiNER ? '#8b5cf6' : '#3b82f6' }} />
                      <Box>
                        <Box sx={{ fontSize: 12, color: '#e2e8f0' }}>{m.id} — {m.name}</Box>
                        <Box sx={{ fontSize: 10, color: '#64748b' }}>
                          {m.estimatedCostUSD} · {m.estimatedTimeSec}s{m.requiresGLiNER ? ' · GPU' : ''}
                        </Box>
                      </Box>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Tooltip>

          <Tooltip title="Reconnect SSE">
            <IconButton size="small" onClick={() => connectSSE(0)}
              sx={{ color: '#64748b', '&:hover': { color: '#3b82f6' } }}>
              <Zap size={15} />
            </IconButton>
          </Tooltip>
          <Button
            size="small"
            startIcon={refreshing ? <CircularProgress size={12} /> : <RefreshCw size={14} />}
            onClick={() => loadAll(false)}
            disabled={refreshing}
            sx={{ color: '#64748b', '&:hover': { color: '#e2e8f0', bgcolor: '#1e293b' }, fontSize: 13 }}
          >
            Refresh
          </Button>
          <Tooltip title="Find and re-queue BullMQ documents not yet completed in Memgraph">
            <Button
              size="small"
              startIcon={requeueBusy ? <CircularProgress size={12} sx={{ color: '#22c55e' }} /> : <RotateCcw size={14} />}
              onClick={handleSyncQueue}
              disabled={requeueBusy}
              sx={{ color: '#22c55e', border: '1px solid #22c55e33',
                    '&:hover': { bgcolor: '#22c55e11' }, fontSize: 13 }}
            >
              Sync Queue
            </Button>
          </Tooltip>
          {/* DOCUMENTREF counter chip */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, border: '1px solid #1e293b', borderRadius: 1, px: 0.75, py: 0.25 }}>
            <GitGraph size={12} style={{ color: docRefStats?.pendingDocRefs > 0 ? '#a78bfa' : '#64748b', flexShrink: 0 }} />
            <Typography variant="caption" sx={{ color: docRefStats?.pendingDocRefs > 0 ? '#a78bfa' : '#64748b', fontFamily: 'monospace', fontSize: 11, lineHeight: 1 }}>
              DOCREF:&nbsp;{docRefStats === null ? '…' : docRefStats.pendingDocRefs}
            </Typography>
            <Tooltip title="Refresh DOCUMENTREF count">
              <IconButton size="small" onClick={handleLoadDocRefStats} disabled={docRefRefreshing}
                sx={{ p: 0.25, ml: 0.25, color: '#64748b', '&:hover': { color: '#a78bfa' } }}>
                {docRefRefreshing ? <CircularProgress size={10} sx={{ color: '#a78bfa' }} /> : <RefreshCw size={10} />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Reconcile: link unresolved DOCUMENTREFs to already-extracted DOCUMENT entities in Entity Store">
              <IconButton size="small" onClick={handleReconcileDocRefs} disabled={docRefRefreshing}
                sx={{ p: 0.25, color: '#64748b', '&:hover': { color: '#4ade80' } }}>
                <RotateCcw size={10} />
              </IconButton>
            </Tooltip>
          </Box>
          {/* DocRef backlog button — shows count if there are actionable pending refs */}
          <Tooltip title={
            docRefStats
              ? `${docRefStats.pendingDocRefs} pending DOCUMENTREF(s) · ${docRefStats.actionableDocuments} matched unextracted document(s)`
              : 'Queue documents referenced by pending DOCUMENTREF entities'
          }>
            <Button
              size="small"
              startIcon={docRefBusy ? <CircularProgress size={12} sx={{ color: '#a78bfa' }} /> : <GitGraph size={14} />}
              onClick={docRefStats === null ? handleLoadDocRefStats : handleQueueDocRefs}
              disabled={docRefBusy}
              sx={{
                color: docRefStats?.actionableDocuments > 0 ? '#a78bfa' : '#64748b',
                border: `1px solid ${docRefStats?.actionableDocuments > 0 ? '#a78bfa33' : '#1e293b'}`,
                '&:hover': { bgcolor: '#a78bfa11', color: '#a78bfa' }, fontSize: 13,
              }}
            >
              {docRefStats === null
                ? 'DocRef Check'
                : docRefStats.actionableDocuments > 0
                  ? `Queue ${docRefStats.actionableDocuments} DocRefs`
                  : 'DocRefs OK'}
            </Button>
          </Tooltip>
          <Tooltip title="Check all Completed jobs for incomplete pipeline stages">
            <Button
              size="small"
              startIcon={verifyLoading ? <CircularProgress size={12} sx={{ color: '#fbbf24' }} /> : <AlertTriangle size={14} />}
              onClick={handleVerifyCompleted}
              disabled={verifyLoading}
              sx={{ color: '#fbbf24', border: '1px solid #fbbf2433',
                    '&:hover': { bgcolor: '#fbbf2411' }, fontSize: 13 }}
            >
              Verify Completed
            </Button>
          </Tooltip>
          <Tooltip title="Re-queue all failed documents for extraction">
            <Button
              size="small"
              startIcon={requeueBusy ? <CircularProgress size={12} sx={{ color: '#ef4444' }} /> : <RotateCcw size={14} />}
              onClick={handleRequeueFailed}
              disabled={requeueBusy}
              sx={{ color: '#ef4444', border: '1px solid #ef444433',
                    '&:hover': { bgcolor: '#ef444411' }, fontSize: 13 }}
            >
              Re-queue Failed
            </Button>
          </Tooltip>
          <Tooltip title="Find and re-queue completed documents with 0 extracted entities">
            <Button
              size="small"
              startIcon={requeueBusy ? <CircularProgress size={12} sx={{ color: '#eab308' }} /> : <RotateCcw size={14} />}
              onClick={zeroEntityDocs === null ? handleCheckZeroEntity : handleRequeueZeroEntity}
              disabled={requeueBusy}
              sx={{ color: '#eab308', border: '1px solid #eab30833',
                    '&:hover': { bgcolor: '#eab30811' }, fontSize: 13 }}
            >
              {zeroEntityDocs === null
                ? 'Check 0-Entity'
                : zeroEntityDocs.length === 0
                  ? '0-Entity: none'
                  : `Re-queue ${zeroEntityDocs.length} 0-Entity`}
            </Button>
          </Tooltip>
          <Button
            variant="contained"
            size="small"
            startIcon={<Plus size={14} />}
            onClick={() => setEnqueueOpen(true)}
            sx={{ bgcolor: '#3b82f6', '&:hover': { bgcolor: '#2563eb' }, fontSize: 13 }}
          >
            Enqueue
          </Button>
        </Box>
      </Box>

      {/* ── ES Ingestion Agent panel ── */}
      <AgentControlPanel
        agentState={agentState}
        agentStats={agentStats}
        busy={agentBusy}
        onStart={() => setAgentStartOpen(true)}
        onPause={handleAgentPause}
        onResume={handleAgentResume}
        onStop={handleAgentStop}
      />

      {/* ── Error banner ── */}
      {error && (
        <Alert severity="error" onClose={() => setError('')}
          sx={{ m: 1.5, mt: 1, bgcolor: '#7f1d1d22', color: '#fca5a5', fontSize: 13,
                '& .MuiAlert-icon': { color: '#ef4444' } }}>
          {error}
        </Alert>
      )}

      {/* ── Body ── */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', gap: 0 }}>

        {/* ── Left panel: Waiting + Failed ── */}
        <Box sx={{ width: 320, flexShrink: 0, borderRight: '1px solid #1e293b',
          display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* WAITING */}
          <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5, borderBottom: '1px solid #1e293b' }}>
            <SectionTitle count={(jobs.waiting || []).length}>Waiting</SectionTitle>
            {(jobs.waiting || []).length === 0 ? (
              <Typography variant="caption" sx={{ color: '#64748b', fontStyle: 'italic', px: 0.5 }}>
                No jobs queued
              </Typography>
            ) : (
              (jobs.waiting || []).map(job => (
                <CompactJobRow
                  key={job.jobId} job={job}
                  onCancel={handleCancel}
                  onRetry={handleRetry}
                  onClick={() => setSelectedJob(job)}
                />
              ))
            )}
          </Box>

          {/* FAILED */}
          <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
            <SectionTitle
              count={(jobs.failed || []).length}
              action={(jobs.failed || []).length > 0 ? (
                <Tooltip title="Retry all failed jobs">
                  <IconButton size="small" onClick={handleRetryAllFailed} disabled={retryingAll}
                    sx={{ color: '#94a3b8', '&:hover': { color: '#22c55e' }, p: 0.25 }}>
                    <RotateCcw size={11} />
                  </IconButton>
                </Tooltip>
              ) : null}
            >
              Failed
            </SectionTitle>
            {(jobs.failed || []).length === 0 ? (
              <Typography variant="caption" sx={{ color: '#64748b', fontStyle: 'italic', px: 0.5 }}>
                No failed jobs
              </Typography>
            ) : (
              (jobs.failed || []).map(job => (
                <CompactJobRow
                  key={job.jobId} job={job}
                  onCancel={handleCancel}
                  onRetry={handleRetry}
                  onClick={() => setSelectedJob(job)}
                  onAdvise={handleAdvise}
                />
              ))
            )}
          </Box>
        </Box>

        {/* ── Right panel: Active + Completed ── */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* ACTIVE */}
          <Box sx={{ flex: allActive.length > 0 ? 3 : 1, overflowY: 'auto',
            p: 1.5, borderBottom: '1px solid #1e293b' }}>
            <SectionTitle count={allActive.length}>Active Jobs</SectionTitle>
            {allActive.length === 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', py: 4, gap: 1 }}>
                <Cpu size={28} style={{ color: '#1e293b' }} />
                <Typography variant="caption" sx={{ color: '#64748b' }}>
                  No active jobs — queue is idle
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 0 }}>
                {allActive.map(job => (
                  <ActiveJobCard
                    key={job.jobId}
                    job={job}
                    liveProgress={job._liveProgress}
                    onCancel={handleCancel}
                    onClick={() => setSelectedJob(job)}
                  />
                ))}
              </Box>
            )}
          </Box>

          {/* COMPLETED */}
          <Box sx={{ flex: 2, overflowY: 'auto', p: 1.5 }}>
            <SectionTitle
              count={(jobs.completed || []).length}
              action={(jobs.completed || []).length > 0 ? (
                <Tooltip title="Check all completed jobs and re-queue those where entities = 0 or vectors = 0">
                  <IconButton size="small" onClick={handleRequeueSuspicious}
                    sx={{ color: '#94a3b8', '&:hover': { color: '#eab308' }, p: 0.25 }}>
                    <CheckCircle2 size={11} />
                  </IconButton>
                </Tooltip>
              ) : null}
            >
              Completed
            </SectionTitle>
            {(jobs.completed || []).length === 0 ? (
              <Typography variant="caption" sx={{ color: '#64748b', fontStyle: 'italic', px: 0.5 }}>
                No completed jobs in window
              </Typography>
            ) : (
              (jobs.completed || []).map(job => (
                <CompactJobRow
                  key={job.jobId} job={job}
                  onCancel={handleCancel}
                  onRetry={handleRetry}
                  onClick={() => setSelectedJob(job)}
                  onAdvise={handleAdvise}
                />
              ))
            )}
          </Box>
        </Box>
      </Box>

      {/* ── Job Detail Drawer ── */}
      <JobDetailDrawer
        job={selectedJob}
        liveProgress={selectedJob ? progressMap[selectedJob.jobId] : null}
        onClose={() => setSelectedJob(null)}
        selectedMethodology={selectedMethodology}
        methodologies={methodologies}
        onReExtract={handleReExtractFromDrawer}
      />

      {/* ── Pipeline Advisor Dialog ── */}
      <AdvisorDialog job={advisorJob} onClose={() => setAdvisorJob(null)} />

      {/* ── Verify Completed Dialog ── */}
      <VerifyCompletedDialog
        open={verifyOpen}
        results={verifyResults}
        loading={verifyLoading}
        onClose={() => setVerifyOpen(false)}
        onReExtract={handleVerifyReExtract}
        selectedMethodology={selectedMethodology}
        methodologies={methodologies}
      />

      {/* ── Batch Enqueue Modal ── */}
      <BatchEnqueueModal
        open={enqueueOpen}
        onClose={() => setEnqueueOpen(false)}
        onEnqueued={handleEnqueued}
        defaultMethodology={selectedMethodology}
        availableMethodologies={methodologies}
      />

      {/* ── Agent Start Dialog ── */}
      <AgentStartDialog
        open={agentStartOpen}
        onClose={() => setAgentStartOpen(false)}
        onStart={handleAgentStart}
        activeMethodology={selectedMethodology !== 'standard' ? selectedMethodology : 'M2C'}
        availableMethodologies={methodologies}
      />
    </Box>
  );
}
