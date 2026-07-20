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
  Collapse, Divider, ToggleButtonGroup, ToggleButton, Switch,
} from '@mui/material';
import {
  Database, FileText, Download, CheckCircle,
  RotateCw, Search, Layers, Clock, Hash,
  TrendingUp, AlertTriangle, ChevronRight, ChevronDown, Server,
  PanelRightClose, PanelRightOpen, BarChart3,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Legend,
} from 'recharts';
import {
  getIndexStats, getIndexerStatus, reindexSource, probeSourceCount,
  getIndexThroughput, getIndexErrors, recountAllSources, setSourceEnabled,
} from '../../../services/documentIndex.service';
import IncidentsPanel from './IncidentsPanel';
import QuarantinePanel from './QuarantinePanel';
import QuotaAllocator from './QuotaAllocator';

const STATUS_META = {
  complete: { color: 'success', label: 'Complete' },
  indexing: { color: 'info',    label: 'Indexing' },
  enriched: { color: 'success', label: 'Enriched' },
  pending:  { color: 'default', label: 'Pending' },
  partial:  { color: 'warning', label: 'Partial' },
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

const TIER_META = {
  fast:    { color: '#16a34a', label: 'Fast' },
  normal:  { color: '#2563eb', label: 'Normal' },
  slow:    { color: '#d97706', label: 'Slow' },
  stalled: { color: '#dc2626', label: 'Stalled' },
  unrated: { color: '#9ca3af', label: '—' },
};

// Per-source indexing-efficiency badge: score/tier + pool quota + new-docs/min.
function EfficiencyCell({ r }) {
  if (!r) return <Typography variant="caption" color="text.disabled">—</Typography>;
  const t = TIER_META[r.tier] || TIER_META.unrated;
  const title = `Efficiency ${r.score ?? '—'}/100 · ${t.label}\nquota ${r.quota} slot(s) · ${r.newPerMin}/min new · ${r.docsPerMin}/min processed\navg latency ${r.avgLatencyMs}ms · new-ratio ${Math.round((r.newRatio||0)*100)}% · pages ${r.pages}`;
  return (
    <Tooltip title={<span style={{ whiteSpace: 'pre-line' }}>{title}</span>}>
      <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end">
        <Chip label={r.tier === 'unrated' ? '—' : `${r.score}`} size="small"
          sx={{ height: 17, minWidth: 30, fontSize: '0.58rem', fontWeight: 700, color: '#fff', bgcolor: t.color }} />
        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.58rem' }}>×{r.quota}</Typography>
      </Stack>
    </Tooltip>
  );
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
  const [reidx,   setReidx]   = useState({});
  const [probing, setProbing] = useState({});
  const [filter,  setFilter]  = useState('');
  const [sortBy,  setSortBy]  = useState('indexed');
  const [statusFilter, setStatusFilter] = useState('');
  const [throughput, setThroughput] = useState([]);
  const [errors, setErrors] = useState({ summary: null, items: [] });
  const [errLevel, setErrLevel] = useState('');
  const [windowMin, setWindowMin] = useState(60);
  const [toggling, setToggling] = useState({});      // per-source enable/disable in flight
  const [showChart, setShowChart] = useState(false); // throughput chart collapsed by default
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const timer = useRef(null);
  const splitRef = useRef(null);
  const resizing = useRef(false);

  // Drag-to-resize the right diagnostics sidebar.
  useEffect(() => {
    const onMove = (e) => {
      if (!resizing.current || !splitRef.current) return;
      const rect = splitRef.current.getBoundingClientRect();
      const w = rect.right - e.clientX;
      const max = Math.max(300, rect.width - 340);   // keep the main column ≥ 340px
      setSidebarWidth(Math.max(300, Math.min(max, w)));
    };
    const onUp = () => { if (resizing.current) { resizing.current = false; document.body.style.userSelect = ''; document.body.style.cursor = ''; } };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);
  const startResize = (e) => { e.preventDefault(); resizing.current = true; document.body.style.userSelect = 'none'; document.body.style.cursor = 'col-resize'; };

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

  // Map sourceId → efficiency rating. Must run unconditionally (before any early
  // return) so the hook order stays stable across renders.
  const ratingsById = React.useMemo(() => {
    const m = {};
    for (const r of (status?.ratings || [])) m[r.sourceId] = r;
    return m;
  }, [status]);

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

  const handleRecountAll = async () => {
    if (!window.confirm('Re-probe an accurate document count for every source and reset Complete/Partial sources back to Pending so they are re-harvested? This runs in the background.')) return;
    try { await recountAllSources(); await load(); }
    catch (e) { setError(e.response?.data?.error || e.message); }
  };

  const handleToggleEnabled = async (id, enabled) => {
    setToggling(m => ({ ...m, [id]: true }));
    // Optimistic: reflect the switch instantly in the table.
    setStats(prev => prev ? { ...prev, sources: prev.sources.map(s => s.id === id ? { ...s, enabled } : s) } : prev);
    try { await setSourceEnabled(id, enabled); await load(); }
    catch (e) { setError(e.response?.data?.error || e.message); await load(); }
    setToggling(m => ({ ...m, [id]: false }));
  };

  if (!stats) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ height: 240 }}>
        {error ? <Alert severity="error">{error}</Alert> : <CircularProgress size={30} />}
      </Stack>
    );
  }

  const active = status?.stats?.active || (status?.stats?.current ? [status.stats.current] : []);
  const activeIds = new Set(active.map(a => a.sourceId));
  const concurrency = status?.stats?.concurrency;
  const recountAll = status?.stats?.recountAll;
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

  // Show ALL sources (including disabled) so they can be toggled back on.
  let rows = (stats.sources || []);
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
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1.25, overflow: 'hidden' }}>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      <Box ref={splitRef} sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* ══════ LEFT — main content ══════ */}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1.25, overflow: 'hidden' }}>

      {/* ── KPI row (counters + coverage + in-sources, one flowing line) ── */}
      <Grid container spacing={1.25} sx={{ flexShrink: 0 }}>
        <Grid item xs={6} sm={4} md={1.6}>
          <Kpi icon={FileText} label="Indexed docs" value={stats.total.toLocaleString()}
            sub={`${stats.withPdf.toLocaleString()} with file link`} />
        </Grid>
        <Grid item xs={6} sm={4} md={1.6}>
          <Kpi icon={Database} label="Enriched" value={stats.enriched.toLocaleString()}
            sub={stats.total ? `${Math.round((stats.enriched / stats.total) * 100)}% of index` : '—'} color="#7c3aed" />
        </Grid>
        <Grid item xs={6} sm={4} md={1.6}>
          <Kpi icon={CheckCircle} label="Sources complete" value={`${stats.sourcesComplete}/${stats.sourcesTotal}`}
            sub={`${stats.sourcesIndexing} indexing · ${stats.sourcesPending} pending`} color="#16a34a" />
        </Grid>
        <Grid item xs={6} sm={4} md={1.6}>
          <Kpi icon={Download} label="With download link" value={stats.withPdf.toLocaleString()}
            sub={stats.total ? `${Math.round((stats.withPdf / stats.total) * 100)}% of index` : '—'} />
        </Grid>
        <Grid item xs={6} sm={4} md={1.6}>
          <Kpi icon={CheckCircle} label="Overall coverage" value={`${overallPct}%`}
            sub={active.length ? `${active.length}/${concurrency} pages active` : `${stats.sourcesComplete}/${stats.sourcesTotal} sources`}
            color={overallPct >= 100 ? '#16a34a' : 'text.primary'} />
        </Grid>
        <Grid item xs={6} sm={4} md={1.6}>
          <Kpi icon={Server} label="In sources" value={knownTotal.toLocaleString()}
            sub={knownTotal ? `${coveragePct}% of known indexed${unknownCount ? ` · +${unknownCount} unknown` : ''}` : '—'} />
        </Grid>
      </Grid>

      {/* ── Throughput chart (collapsible, hidden by default) ── */}
      <Paper variant="outlined" sx={{ flexShrink: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center"
          sx={{ px: 1.25, py: 0.6, cursor: 'pointer' }} onClick={() => setShowChart(v => !v)}>
          {showChart ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <BarChart3 size={15} style={{ opacity: 0.6 }} />
          <Typography variant="caption" fontWeight={700}
            sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.62rem' }}>
            Throughput chart
          </Typography>
          <Box flex={1} />
          {active.length > 0 && (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <CircularProgress size={10} />
              <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 320 }}>
                pool {active.length}/{concurrency} · {[...new Set(active.map(a => a.name).filter(Boolean))].join(', ')}
              </Typography>
            </Stack>
          )}
        </Stack>
        <Collapse in={showChart} unmountOnExit>
          <Box sx={{ px: 1, pb: 1 }}>
            <ThroughputChart data={throughput} windowMin={windowMin} onWindow={setWindowMin} />
          </Box>
        </Collapse>
        {/* Pool-share allocation — same container/width as the chart, below it. */}
        <Divider />
        <Box sx={{ px: 1.25, py: 1 }}>
          <QuotaAllocator />
        </Box>
      </Paper>

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
        {recountAll && !recountAll.finishedAt && (
          <Chip size="small" color="info" variant="outlined"
            icon={<CircularProgress size={11} />}
            label={`Recounting ${recountAll.done}/${recountAll.total}${recountAll.current ? ` · ${recountAll.current}` : ''}`}
            sx={{ maxWidth: 260, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }} />
        )}
        <Tooltip title="Re-probe an accurate document count for every source and reset Complete/Partial sources to re-harvest">
          <span><Button size="small" variant="outlined" color="warning" startIcon={<Hash size={14} />}
            disabled={recountAll && !recountAll.finishedAt} onClick={handleRecountAll}>
            Recount all
          </Button></span>
        </Tooltip>
        {onOpenSearch && (
          <Button size="small" variant="outlined" startIcon={<Layers size={14} />} onClick={onOpenSearch}>
            Search index
          </Button>
        )}
        <Typography variant="caption" color="text.secondary">{rows.length} sources</Typography>
        {!sidebarOpen && (
          <Tooltip title="Show diagnostics (errors, quarantine, incidents)">
            <IconButton size="small" onClick={() => setSidebarOpen(true)}><PanelRightOpen size={16} /></IconButton>
          </Tooltip>
        )}
      </Stack>

      {/* ── Per-source table ── */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell width={52} align="center">
                <Tooltip title="Enable / disable this source for indexing (takes effect immediately)"><span>On</span></Tooltip>
              </TableCell>
              <TableCell>Source</TableCell>
              <TableCell width={64}>Type</TableCell>
              <TableCell width={220}>Progress</TableCell>
              <TableCell width={90} align="right">Indexed</TableCell>
              <TableCell width={80} align="right">Enriched</TableCell>
              <TableCell width={78} align="right">
                <Tooltip title="Indexing efficiency score (0–100) and pool quota (×slots). Slow/stalled sources are capped so they can't clog the pool."><span>Efficiency</span></Tooltip>
              </TableCell>
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
              const enabled = s.enabled !== false;
              return (
                <TableRow key={s.id} hover selected={isCurrent} sx={{ verticalAlign: 'middle', opacity: enabled ? 1 : 0.5 }}>
                  <TableCell align="center" sx={{ py: 0.25 }}>
                    <Tooltip title={enabled ? 'Disable indexing for this source' : 'Enable indexing for this source'}>
                      <span><Switch size="small" checked={enabled} disabled={!!toggling[s.id]}
                        onChange={(e) => handleToggleEnabled(s.id, e.target.checked)} /></span>
                    </Tooltip>
                  </TableCell>
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
                  <TableCell align="right"><EfficiencyCell r={ratingsById[s.id]} /></TableCell>
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
        </Box>{/* ══════ end LEFT ══════ */}

        {/* ══════ resize handle + RIGHT diagnostics sidebar ══════ */}
        {sidebarOpen && (
          <Box onMouseDown={startResize}
            sx={{ width: 6, flexShrink: 0, cursor: 'col-resize', borderRadius: 1, mx: 0.25,
              '&:hover': { bgcolor: 'primary.main' }, transition: 'background-color 0.15s' }} />
        )}
        {sidebarOpen && (
          <Box sx={{ width: sidebarWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ pb: 0.75 }}>
              <AlertTriangle size={15} style={{ opacity: 0.7 }} />
              <Typography variant="caption" fontWeight={700}
                sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.62rem' }}>
                Diagnostics
              </Typography>
              {totalErrors > 0 && <Chip label={`${totalErrors} err`} size="small" sx={{ height: 16, fontSize: '0.55rem', color: '#fff', bgcolor: LEVEL_COLOR.error }} />}
              <Box flex={1} />
              <Tooltip title="Hide diagnostics panel">
                <IconButton size="small" onClick={() => setSidebarOpen(false)}><PanelRightClose size={16} /></IconButton>
              </Tooltip>
            </Stack>
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1.25, pr: 0.5 }}>
              <ErrorsPanel summary={errSummary} items={errors.items} categories={errors.categories} level={errLevel} onLevel={setErrLevel} />
              <QuarantinePanel />
              <IncidentsPanel />
            </Box>
          </Box>
        )}
      </Box>{/* ══════ end split ══════ */}
    </Box>
  );
}
