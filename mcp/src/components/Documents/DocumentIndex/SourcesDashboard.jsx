/**
 * SourcesDashboard — /documents/dashboard
 *
 * Progress dashboard for the document-source indexer: overall KPIs, the running
 * indexer state + controls, and a per-source progress table (coverage, enrich %,
 * status, last indexed) with a re-index action. Polls the local index API only.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Stack, Typography, Paper, Grid, Chip, IconButton, Tooltip, Button,
  LinearProgress, Table, TableBody, TableCell, TableHead, TableRow,
  CircularProgress, Alert, FormControl, InputLabel, Select, MenuItem, TextField,
  Collapse, Divider, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import {
  Database, FileText, Download, CheckCircle, Activity, RefreshCw,
  Play, Pause, Square, RotateCw, Search, Layers, Clock, Hash,
  TrendingUp, AlertTriangle, ChevronRight, ChevronDown, Server,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Legend,
} from 'recharts';
import {
  getIndexStats, getIndexerStatus, controlIndexer, reindexSource, probeSourceCount,
  getIndexThroughput, getIndexErrors, setIndexerConfig,
} from '../../../services/documentIndex.service';
import IncidentsPanel from './IncidentsPanel';

const STATUS_META = {
  complete: { color: 'success', label: 'Complete' },
  indexing: { color: 'info',    label: 'Indexing' },
  enriched: { color: 'success', label: 'Enriched' },
  pending:  { color: 'default', label: 'Pending' },
  failed:   { color: 'error',   label: 'Failed' },
};

const TYPE_LABEL = {
  URL_CATALOG: 'Web', REST_API: 'REST', RSS_FEED: 'RSS',
  ODS_API: 'ODS', OIOS_PORTAL: 'OIOS', OAI_PMH: 'OAI',
};

function pct(indexed, total, status) {
  if (status === 'complete') return 100;
  if (!total) return indexed > 0 ? 5 : 0;
  return Math.min(100, Math.round((indexed / total) * 100));
}

function timeAgo(iso) {
  if (!iso) return '—';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.round(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
  } catch { return iso; }
}

// ── KPI card ────────────────────────────────────────────────────

function Kpi({ icon: Icon, label, value, sub, color = 'text.primary' }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, height: '100%' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        <Icon size={15} style={{ opacity: 0.6 }} />
        <Typography variant="caption" color="text.secondary" fontWeight={600}
          sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.62rem' }}>
          {label}
        </Typography>
      </Stack>
      <Typography variant="h5" fontWeight={700} sx={{ color, lineHeight: 1.1 }}>{value}</Typography>
      {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
    </Paper>
  );
}

function StateChip({ state }) {
  const map = {
    RUNNING: { color: 'success', label: 'Running' },
    PAUSED:  { color: 'warning', label: 'Paused' },
    STOPPED: { color: 'error',   label: 'Stopped' },
    IDLE:    { color: 'default', label: 'Idle' },
  };
  const m = map[state] || map.IDLE;
  return <Chip label={m.label} color={m.color} size="small" />;
}

function hhmm(iso) {
  try { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
  catch { return ''; }
}
function mmdd(iso) {
  try { const d = new Date(iso); return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  catch { return ''; }
}
// Throughput chart windows (minutes) — history is retained 30 days server-side.
const TP_WINDOWS = [
  { m: 60, l: '1h' }, { m: 360, l: '6h' }, { m: 1440, l: '24h' }, { m: 10080, l: '7d' }, { m: 43200, l: '30d' },
];
function granLabel(mins) {
  if (!mins || mins <= 1) return 'min';
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${mins / 60}h`;
  return `${mins / 1440}d`;
}

const LEVEL_COLOR = { error: '#dc2626', warn: '#d97706' };

// ── Throughput chart (documents processed per minute) ───────────

function ThroughputChart({ data, windowMin, onWindow }) {
  const hasData = Array.isArray(data) && data.some(d => d.processed || d.newNodes || d.errors);
  const peak = hasData ? Math.max(...data.map(d => d.processed || 0)) : 0;
  const totalNew = hasData ? data.reduce((a, d) => a + (d.newNodes || 0), 0) : 0;
  const bucketMin = data?.[0]?.bucketMinutes || 1;
  const gran = granLabel(bucketMin);
  const longWin = windowMin > 1440;
  const fmtTick = (v) => (longWin ? mmdd(v) : hhmm(v));
  return (
    <Paper variant="outlined" sx={{ p: 1.25 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <TrendingUp size={15} style={{ opacity: 0.6 }} />
        <Typography variant="caption" color="text.secondary" fontWeight={600}
          sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.62rem' }}>
          Throughput — docs processed / {gran}
        </Typography>
        <Box flex={1} />
        <Typography variant="caption" color="text.disabled">
          peak {peak.toLocaleString()}/{gran} · {totalNew.toLocaleString()} new in window
        </Typography>
        <ToggleButtonGroup size="small" exclusive value={windowMin} onChange={(_, v) => v && onWindow(v)}>
          {TP_WINDOWS.map(w => (
            <ToggleButton key={w.m} value={w.m} sx={{ py: 0, px: 0.75, fontSize: '0.6rem' }}>{w.l}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>
      <Box sx={{ height: 150, width: '100%' }}>
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="gProc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gNew" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#16a34a" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#16a34a" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} vertical={false} />
              <XAxis dataKey="minute" tickFormatter={fmtTick} minTickGap={40}
                tick={{ fontSize: 10 }} stroke="currentColor" strokeOpacity={0.4} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={34}
                stroke="currentColor" strokeOpacity={0.4} />
              <RTooltip
                labelFormatter={(v) => new Date(v).toLocaleString()}
                contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconSize={9} />
              <Area type="monotone" dataKey="processed" name="Processed" stroke="#2563eb"
                strokeWidth={1.5} fill="url(#gProc)" isAnimationActive={false} />
              <Area type="monotone" dataKey="newNodes" name="New docs" stroke="#16a34a"
                strokeWidth={1.5} fill="url(#gNew)" isAnimationActive={false} />
              <Line type="monotone" dataKey="errors" name="Errors" stroke="#dc2626"
                strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <Stack alignItems="center" justifyContent="center" sx={{ height: '100%' }}>
            <Typography variant="caption" color="text.disabled">
              No processing activity in the last window
            </Typography>
          </Stack>
        )}
      </Box>
    </Paper>
  );
}

// ── Errors / warnings panel (expandable, per-item detail) ───────

function ErrorRow({ e }) {
  const [open, setOpen] = useState(false);
  const color = LEVEL_COLOR[e.level] || 'text.secondary';
  return (
    <Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
      <Stack direction="row" spacing={1} alignItems="center"
        sx={{ px: 1, py: 0.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
        onClick={() => setOpen(o => !o)}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <Chip label={e.level} size="small"
          sx={{ height: 16, fontSize: '0.55rem', fontWeight: 700, color: '#fff', bgcolor: color }} />
        {e.status != null && <Chip label={e.status} size="small" variant="outlined" sx={{ height: 16, fontSize: '0.55rem' }} />}
        <Chip label={e.phase} size="small" variant="outlined" sx={{ height: 16, fontSize: '0.55rem' }} />
        <Typography variant="caption" fontWeight={600} noWrap sx={{ maxWidth: 160 }} title={e.sourceName || ''}>
          {e.sourceName || '—'}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1, minWidth: 0 }}>
          {e.message}
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: 'nowrap' }}>
          {timeAgo(e.at)}
        </Typography>
      </Stack>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ px: 3, py: 1, bgcolor: 'action.hover' }}>
          <Typography variant="caption" component="div" color="text.secondary">
            <b>Time:</b> {new Date(e.at).toLocaleString()}
          </Typography>
          {e.sourceId && <Typography variant="caption" component="div" color="text.secondary"><b>Source ID:</b> {e.sourceId}</Typography>}
          <Typography variant="caption" component="div" color="text.secondary"><b>Phase:</b> {e.phase}{e.status != null ? ` · HTTP ${e.status}` : ''}</Typography>
          <Typography variant="caption" component="div" sx={{ mt: 0.5 }}><b>Message:</b> {e.message}</Typography>
          {e.detail && (
            <Box component="pre" sx={{
              mt: 0.5, p: 1, m: 0, fontSize: '0.68rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              bgcolor: 'background.default', border: '1px solid', borderColor: 'divider', borderRadius: 1, maxHeight: 180, overflow: 'auto',
            }}>{e.detail}</Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

const SEV_COLOR = { high: '#dc2626', medium: '#d97706', low: '#6b7280' };

function ErrorsPanel({ summary, items, categories, level, onLevel }) {
  const [open, setOpen] = useState(false);
  const errCount = summary?.errors || 0;
  const warnCount = summary?.warnings || 0;
  return (
    <Paper variant="outlined">
      <Stack direction="row" spacing={1} alignItems="center"
        sx={{ px: 1.25, py: 0.75, cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <AlertTriangle size={15} style={{ opacity: 0.7, color: errCount ? LEVEL_COLOR.error : undefined }} />
        <Typography variant="caption" fontWeight={700}
          sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.62rem' }}>
          Processing errors &amp; warnings
        </Typography>
        <Chip label={`${errCount} errors`} size="small"
          sx={{ height: 17, fontSize: '0.6rem', color: '#fff', bgcolor: errCount ? LEVEL_COLOR.error : 'action.disabled' }} />
        <Chip label={`${warnCount} warnings`} size="small" variant="outlined"
          sx={{ height: 17, fontSize: '0.6rem', borderColor: LEVEL_COLOR.warn, color: LEVEL_COLOR.warn }} />
        <Box flex={1} />
        {summary?.logFile && (
          <Tooltip title={`Persisted to ${summary.logFile}`}>
            <Typography variant="caption" color="text.disabled" noWrap sx={{ maxWidth: 220, display: { xs: 'none', md: 'block' } }}>
              log: {summary.logFile.split(/[\\/]/).slice(-1)[0]}
            </Typography>
          </Tooltip>
        )}
      </Stack>
      <Collapse in={open} unmountOnExit>
        <Divider />
        {!!(categories && categories.length) && (
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ px: 1.25, py: 0.75 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mr: 0.5 }}>Categories:</Typography>
            {categories.map(c => (
              <Tooltip key={c.id} title={c.methodology || ''}>
                <Chip label={`${c.label} · ${c.count}`} size="small" variant="outlined"
                  sx={{ height: 18, fontSize: '0.58rem', borderColor: SEV_COLOR[c.severity], color: SEV_COLOR[c.severity] }} />
              </Tooltip>
            ))}
          </Stack>
        )}
        <Divider />
        <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1.25, py: 0.5 }}>
          <ToggleButtonGroup size="small" exclusive value={level} onChange={(_, v) => onLevel(v || '')}>
            <ToggleButton value="" sx={{ py: 0, px: 1, fontSize: '0.6rem' }}>All</ToggleButton>
            <ToggleButton value="error" sx={{ py: 0, px: 1, fontSize: '0.6rem' }}>Errors</ToggleButton>
            <ToggleButton value="warn" sx={{ py: 0, px: 1, fontSize: '0.6rem' }}>Warnings</ToggleButton>
          </ToggleButtonGroup>
          <Box flex={1} />
          <Typography variant="caption" color="text.disabled">{items?.length || 0} shown (newest first)</Typography>
        </Stack>
        <Divider />
        <Box sx={{ maxHeight: 280, overflow: 'auto' }}>
          {items && items.length
            ? items.map(e => <ErrorRow key={e.id} e={e} />)
            : <Typography variant="caption" color="text.disabled" sx={{ display: 'block', p: 2, textAlign: 'center' }}>
                No {level || ''} entries recorded
              </Typography>}
        </Box>
      </Collapse>
    </Paper>
  );
}

// ── Dashboard ───────────────────────────────────────────────────

export default function SourcesDashboard({ onOpenSearch, onBrowseSource }) {
  const [stats,   setStats]   = useState(null);
  const [status,  setStatus]  = useState(null);
  const [error,   setError]   = useState(null);
  const [busy,    setBusy]    = useState(false);
  const [reidx,   setReidx]   = useState({});
  const [probing, setProbing] = useState({});
  const [filter,  setFilter]  = useState('');
  const [sortBy,  setSortBy]  = useState('indexed');
  const [statusFilter, setStatusFilter] = useState('');
  const [throughput, setThroughput] = useState([]);
  const [errors, setErrors] = useState({ summary: null, items: [] });
  const [errLevel, setErrLevel] = useState('');
  const [windowMin, setWindowMin] = useState(60);
  const [workers, setWorkers] = useState(10);
  const workersInit = useRef(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const [s, st, tp, er] = await Promise.all([
        getIndexStats(),
        getIndexerStatus(),
        getIndexThroughput(windowMin),
        getIndexErrors({ level: errLevel || undefined, limit: 200 }),
      ]);
      setStats(s.data); setStatus(st.data);
      setThroughput(tp.data || []);
      setErrors(er.data || { summary: null, items: [] });
      // Initialize the workers field once from the live concurrency (don't clobber typing after).
      if (!workersInit.current && st.data?.stats?.concurrency != null) { setWorkers(st.data.stats.concurrency); workersInit.current = true; }
      setError(null);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  }, [windowMin, errLevel]);

  useEffect(() => {
    load();
    timer.current = setInterval(load, 4000);
    return () => clearInterval(timer.current);
  }, [load]);

  const control = async (action) => {
    setBusy(true);
    try { await controlIndexer(action); await load(); }
    catch (e) { setError(e.response?.data?.error || e.message); }
    setBusy(false);
  };

  const applyWorkers = async () => {
    const n = parseInt(workers, 10);
    if (!Number.isFinite(n) || n < 1) return;
    try {
      const r = await setIndexerConfig({ concurrency: n });
      if (r?.data?.status) setStatus(r.data.status);
    } catch (e) { setError(e.response?.data?.error || e.message); }
  };

  const handleReindex = async (id) => {
    setReidx(m => ({ ...m, [id]: true }));
    try { await reindexSource(id); await load(); }
    catch (e) { setError(e.response?.data?.error || e.message); }
    setReidx(m => ({ ...m, [id]: false }));
  };

  const handleProbe = async (id) => {
    setProbing(m => ({ ...m, [id]: true }));
    try { await probeSourceCount(id); await load(); }
    catch (e) { setError(e.response?.data?.error || e.message); }
    setProbing(m => ({ ...m, [id]: false }));
  };

  if (!stats) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ height: 240 }}>
        {error ? <Alert severity="error">{error}</Alert> : <CircularProgress size={30} />}
      </Stack>
    );
  }

  const state = status?.state || 'IDLE';
  const active = status?.stats?.active || (status?.stats?.current ? [status.stats.current] : []);
  const activeIds = new Set(active.map(a => a.sourceId));
  const concurrency = status?.stats?.concurrency;
  const overallPct = stats.sourcesTotal ? Math.round((stats.sourcesComplete / stats.sourcesTotal) * 100) : 0;

  // Sources summary: total docs known to exist in sources (where the count is
  // known) vs processed (indexed) vs errors.
  const enabledSources = (stats.sources || []).filter(s => s.enabled);
  const knownTotal = enabledSources.reduce((a, s) => a + (s.indexTotal != null ? Number(s.indexTotal) : 0), 0);
  const unknownCount = enabledSources.filter(s => s.indexTotal == null).length;
  const sourcesWithErrors = new Set((errors.items || []).map(e => e.sourceId).filter(Boolean)).size;
  const errSummary = errors.summary || status?.errorSummary || null;
  const totalErrors = errSummary?.errors || 0;
  const totalWarns = errSummary?.warnings || 0;
  const coveragePct = knownTotal ? Math.min(100, Math.round((stats.total / knownTotal) * 100)) : 0;

  let rows = (stats.sources || []).filter(s => s.enabled);
  if (filter.trim()) rows = rows.filter(s => s.name.toLowerCase().includes(filter.toLowerCase()));
  if (statusFilter) rows = rows.filter(s => (s.indexStatus || 'pending') === statusFilter);
  rows = [...rows].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'progress') return pct(b.indexed, b.indexTotal, b.indexStatus) - pct(a.indexed, a.indexTotal, a.indexStatus);
    if (sortBy === 'enriched') return b.enriched - a.enriched;
    return b.indexed - a.indexed; // default: indexed count
  });

  const maxIndexed = Math.max(1, ...rows.map(s => s.indexed));

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1.5, overflow: 'hidden' }}>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      {/* ── KPI row ── */}
      <Grid container spacing={1.5}>
        <Grid item xs={6} sm={4} md={2.4}>
          <Kpi icon={FileText} label="Indexed docs" value={stats.total.toLocaleString()}
            sub={`${stats.withPdf.toLocaleString()} with file link`} />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <Kpi icon={Database} label="Enriched" value={stats.enriched.toLocaleString()}
            sub={stats.total ? `${Math.round((stats.enriched / stats.total) * 100)}% of index` : '—'} color="#7c3aed" />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <Kpi icon={CheckCircle} label="Sources complete" value={`${stats.sourcesComplete}/${stats.sourcesTotal}`}
            sub={`${stats.sourcesIndexing} indexing · ${stats.sourcesPending} pending`} color="#16a34a" />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <Kpi icon={Download} label="With download link" value={stats.withPdf.toLocaleString()}
            sub={stats.total ? `${Math.round((stats.withPdf / stats.total) * 100)}% of index` : '—'} />
        </Grid>
        <Grid item xs={12} sm={4} md={2.4}>
          <Paper variant="outlined" sx={{ p: 1.5, height: '100%' }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
              <Activity size={15} style={{ opacity: 0.6 }} />
              <Typography variant="caption" color="text.secondary" fontWeight={600}
                sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.62rem' }}>Indexer</Typography>
              <Box flex={1} />
              <StateChip state={state} />
            </Stack>
            <Stack direction="row" spacing={0.25}>
              <Tooltip title="Start"><span><IconButton size="small" disabled={busy || state === 'RUNNING'} onClick={() => control('start')}><Play size={16} /></IconButton></span></Tooltip>
              <Tooltip title="Pause"><span><IconButton size="small" disabled={busy || state !== 'RUNNING'} onClick={() => control('pause')}><Pause size={16} /></IconButton></span></Tooltip>
              <Tooltip title="Resume"><span><IconButton size="small" disabled={busy || state !== 'PAUSED'} onClick={() => control('resume')}><Play size={16} /></IconButton></span></Tooltip>
              <Tooltip title="Stop"><span><IconButton size="small" disabled={busy || ['STOPPED', 'IDLE'].includes(state)} onClick={() => control('stop')}><Square size={16} /></IconButton></span></Tooltip>
              <Tooltip title="Refresh"><IconButton size="small" onClick={load}><RefreshCw size={15} /></IconButton></Tooltip>
            </Stack>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.75 }}>
              <Tooltip title="Number of parallel indexing workers — press Enter to apply instantly">
                <TextField
                  label="Workers" size="small" type="number" value={workers}
                  onChange={e => setWorkers(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyWorkers(); } }}
                  onBlur={applyWorkers}
                  inputProps={{ min: 1, max: 64 }}
                  sx={{ width: 96, '& input': { py: 0.5 } }}
                />
              </Tooltip>
              {status?.stats?.concurrency != null && String(status.stats.concurrency) !== String(workers) && (
                <Typography variant="caption" color="warning.main">↵ apply ({status.stats.concurrency} now)</Typography>
              )}
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {/* ── Overall progress + current activity ── */}
      <Paper variant="outlined" sx={{ p: 1.25 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Typography variant="caption" fontWeight={700} sx={{ minWidth: 130 }}>
            Overall coverage {overallPct}%
          </Typography>
          <Box sx={{ flex: 1 }}>
            <LinearProgress variant="determinate" value={overallPct} sx={{ height: 8, borderRadius: 4 }} />
          </Box>
          {active.length
            ? <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                <CircularProgress size={11} />
                <Typography variant="caption" color="text.secondary" noWrap>
                  harvesting {active.length}{concurrency ? `/${concurrency}` : ''}:{' '}
                  <b>{active.map(a => a.name).filter(Boolean).join(', ')}</b>
                </Typography>
              </Stack>
            : <Typography variant="caption" color="text.disabled">
                {status?.stats?.ticks ? `${status.stats.docsIndexed} indexed this run` : 'idle'}
              </Typography>}
        </Stack>
      </Paper>

      {/* ── Sources summary: total-in-sources vs processed vs errors ── */}
      <Paper variant="outlined" sx={{ p: 1.25 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
          <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ minWidth: 180 }}>
            <Server size={14} style={{ opacity: 0.6, alignSelf: 'center' }} />
            <Typography variant="h6" fontWeight={700}>{knownTotal.toLocaleString()}</Typography>
            <Typography variant="caption" color="text.secondary">
              in sources{unknownCount ? ` (+${unknownCount} unknown)` : ''}
            </Typography>
          </Stack>
          <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />
          <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ minWidth: 150 }}>
            <FileText size={14} style={{ opacity: 0.6, alignSelf: 'center' }} />
            <Typography variant="h6" fontWeight={700} sx={{ color: '#2563eb' }}>{stats.total.toLocaleString()}</Typography>
            <Typography variant="caption" color="text.secondary">processed</Typography>
          </Stack>
          <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />
          <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ minWidth: 150 }}>
            <AlertTriangle size={14} style={{ opacity: 0.7, alignSelf: 'center', color: totalErrors ? LEVEL_COLOR.error : undefined }} />
            <Typography variant="h6" fontWeight={700} sx={{ color: totalErrors ? LEVEL_COLOR.error : 'text.primary' }}>
              {totalErrors.toLocaleString()}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              errors{totalWarns ? ` · ${totalWarns} warn` : ''}{sourcesWithErrors ? ` · ${sourcesWithErrors} sources` : ''}
            </Typography>
          </Stack>
          <Box sx={{ flex: 1, minWidth: 120 }}>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="caption" color="text.secondary">Coverage of known</Typography>
              <Typography variant="caption" color="text.secondary">{knownTotal ? `${coveragePct}%` : '—'}</Typography>
            </Stack>
            <LinearProgress variant="determinate" value={coveragePct} sx={{ height: 6, borderRadius: 3 }} />
          </Box>
        </Stack>
      </Paper>

      {/* ── Throughput chart ── */}
      <ThroughputChart data={throughput} windowMin={windowMin} onWindow={setWindowMin} />

      {/* ── Errors / warnings log ── */}
      <ErrorsPanel summary={errSummary} items={errors.items} categories={errors.categories} level={errLevel} onLevel={setErrLevel} />

      {/* ── Incidents & AI response ── */}
      <IncidentsPanel />

      {/* ── Toolbar ── */}
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter sources…" size="small"
          sx={{ minWidth: 180 }} InputProps={{ startAdornment: <Search size={14} style={{ marginRight: 6, opacity: 0.5 }} /> }} />
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Status</InputLabel>
          <Select value={statusFilter} label="Status" onChange={e => setStatusFilter(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            {['pending', 'indexing', 'complete'].map(s => <MenuItem key={s} value={s}>{STATUS_META[s]?.label || s}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Sort by</InputLabel>
          <Select value={sortBy} label="Sort by" onChange={e => setSortBy(e.target.value)}>
            <MenuItem value="indexed">Indexed count</MenuItem>
            <MenuItem value="progress">Progress %</MenuItem>
            <MenuItem value="enriched">Enriched</MenuItem>
            <MenuItem value="name">Name</MenuItem>
          </Select>
        </FormControl>
        <Box flex={1} />
        {onOpenSearch && (
          <Button size="small" variant="outlined" startIcon={<Layers size={14} />} onClick={onOpenSearch}>
            Search index
          </Button>
        )}
        <Typography variant="caption" color="text.secondary">{rows.length} sources</Typography>
      </Stack>

      {/* ── Per-source table ── */}
      <Box sx={{ flex: 1, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Source</TableCell>
              <TableCell width={64}>Type</TableCell>
              <TableCell width={220}>Progress</TableCell>
              <TableCell width={90} align="right">Indexed</TableCell>
              <TableCell width={80} align="right">Enriched</TableCell>
              <TableCell width={90}>Updated</TableCell>
              <TableCell width={60} align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(s => {
              const p = pct(s.indexed, s.indexTotal, s.indexStatus);
              const sm = STATUS_META[s.indexStatus] || STATUS_META.pending;
              const isCurrent = activeIds.has(s.id);
              const unknownTotal = s.indexTotal == null;
              return (
                <TableRow key={s.id} hover selected={isCurrent} sx={{ verticalAlign: 'middle' }}>
                  <TableCell sx={{ py: 0.75 }}>
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      {isCurrent && <CircularProgress size={11} />}
                      <Typography variant="body2" fontWeight={600}
                        sx={{ cursor: onBrowseSource ? 'pointer' : 'default', '&:hover': onBrowseSource ? { color: 'primary.main' } : {} }}
                        onClick={() => onBrowseSource?.(s.id)} noWrap title={s.name}>
                        {s.name}
                      </Typography>
                      {s.namespace && s.namespace !== 'DEFAULT' &&
                        <Chip label={s.namespace} size="small" variant="outlined" sx={{ fontSize: '0.55rem', height: 15 }} />}
                    </Stack>
                  </TableCell>
                  <TableCell><Chip label={TYPE_LABEL[s.type] || s.type} size="small" variant="outlined" sx={{ fontSize: '0.58rem', height: 17 }} /></TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <Chip label={sm.label} size="small" color={sm.color} variant="outlined" sx={{ fontSize: '0.58rem', height: 16, minWidth: 62 }} />
                      <Box sx={{ flex: 1, minWidth: 60 }}>
                        {unknownTotal && s.indexStatus === 'indexing'
                          ? <LinearProgress sx={{ height: 5, borderRadius: 3 }} />
                          : <LinearProgress variant="determinate" value={p}
                              color={s.indexStatus === 'complete' ? 'success' : 'primary'}
                              sx={{ height: 5, borderRadius: 3 }} />}
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 28, textAlign: 'right' }}>
                        {unknownTotal && s.indexStatus !== 'complete' ? '—' : `${p}%`}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="caption" fontWeight={600}>{s.indexed.toLocaleString()}</Typography>
                    {s.indexTotal != null && (
                      <Tooltip title={s.indexTotalMethod === 'probe'
                        ? 'Total discovered by sequential paging' + (s.indexTotalAt ? ` (${timeAgo(s.indexTotalAt)})` : '')
                        : 'Total reported by the source API' + (s.indexTotalAt ? ` (${timeAgo(s.indexTotalAt)})` : '')}>
                        <Typography variant="caption" color="text.disabled" component="span">
                          {' / '}{s.indexTotalMethod === 'probe' ? '~' : ''}{s.indexTotal.toLocaleString()}
                        </Typography>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell align="right"><Typography variant="caption" color={s.enriched ? '#7c3aed' : 'text.disabled'}>{s.enriched.toLocaleString()}</Typography></TableCell>
                  <TableCell><Typography variant="caption" color="text.secondary"><Clock size={10} style={{ verticalAlign: -1, marginRight: 3, opacity: 0.5 }} />{timeAgo(s.lastIndexedAt)}</Typography></TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0} justifyContent="flex-end">
                      <Tooltip title="Recount documents (sequential paging) — re-indexes if grown">
                        <span><IconButton size="small" disabled={probing[s.id]} onClick={() => handleProbe(s.id)}>
                          {probing[s.id] ? <CircularProgress size={12} /> : <Hash size={13} />}
                        </IconButton></span>
                      </Tooltip>
                      <Tooltip title="Re-index this source (reset cursor)">
                        <span><IconButton size="small" disabled={reidx[s.id]} onClick={() => handleReindex(s.id)}>
                          {reidx[s.id] ? <CircularProgress size={12} /> : <RotateCw size={13} />}
                        </IconButton></span>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}
