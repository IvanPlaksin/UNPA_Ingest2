import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Box, Typography, IconButton, Tooltip, CircularProgress,
  Chip, Select, MenuItem, FormControl, InputLabel,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, TextField, InputAdornment, Paper,
  ToggleButtonGroup, ToggleButton, Divider, LinearProgress,
} from '@mui/material';
import {
  RefreshCw, Search, ArrowUpDown,
  FileText, Database, Link2, Layers, Zap,
  CheckCircle, Clock, Play, Pause, TrendingUp,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import {
  getStatsOverview, getStatsTimeline, getStatsEntities,
  getStatsNamespaces, getStatsDocuments, getStatsPerformance,
  getStatsStepTiming,
} from '../services/pipelineManager.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const BG0  = '#0f172a';
const BG1  = '#1e293b';
const BG2  = '#0f1e35';
const BORDER = 'rgba(255,255,255,0.08)';
const TEXT  = '#e2e8f0';
const MUTED = '#94a3b8';

const COLORS = {
  blue:   '#3b82f6',
  green:  '#22c55e',
  amber:  '#f59e0b',
  red:    '#ef4444',
  purple: '#8b5cf6',
  cyan:   '#06b6d4',
  pink:   '#ec4899',
};

const STATUS_COLORS = {
  COMPLETED:         COLORS.green,
  EXTRACTION_FAILED: COLORS.red,
  FAILED:            COLORS.red,
  EXTRACTING:        COLORS.blue,
  CLASSIFIED:        COLORS.amber,
  NEEDS_REVIEW:      COLORS.amber,
  PENDING:           MUTED,
  UNKNOWN:           MUTED,
};

const STATUS_LABELS = {
  COMPLETED:         'Completed',
  EXTRACTION_FAILED: 'Failed',
  FAILED:            'Failed',
  EXTRACTING:        'Extracting',
  CLASSIFIED:        'Classified',
  NEEDS_REVIEW:      'Needs Review',
  PENDING:           'Pending',
};

const RANGE_OPTIONS = [
  { label: '24h', value: '24h' },
  { label: '7d',  value: '7d'  },
  { label: '30d', value: '30d' },
  { label: '90d', value: '90d' },
  { label: 'All', value: 'all' },
];

// Efficiency chart: window + bucket size pairs
// windowMs → how much history to show; bucketMs → aggregation interval
const EFFICIENCY_SCALES = [
  { label: '5m',  windowMs:     5*60000, bucketMs:    30000 },
  { label: '30m', windowMs:    30*60000, bucketMs:   120000 },
  { label: '1h',  windowMs:    60*60000, bucketMs:   300000 },
  { label: '6h',  windowMs:  6*60*60000, bucketMs:  1800000 },
  { label: '12h', windowMs: 12*60*60000, bucketMs:  3600000 },
  { label: '1d',  windowMs: 24*60*60000, bucketMs:  7200000 },
  { label: '1w',  windowMs:  7*24*60*60000, bucketMs: 86400000 },
  { label: '1mo', windowMs: 30*24*60*60000, bucketMs: 86400000 },
];

const STEP_SERIES = [
  { key: 'avgTotal',     label: 'Total',          color: '#64748b', strokeWidth: 2, dashed: true },
  { key: 'avgEntities',  label: 'Extract Entities', color: '#22c55e', strokeWidth: 2 },
  { key: 'avgRelations', label: 'Extract Relations', color: '#f59e0b', strokeWidth: 2 },
  { key: 'avgEmbed',     label: 'Embed & Index',   color: '#8b5cf6', strokeWidth: 2 },
  { key: 'avgChunk',     label: 'Chunk Text',      color: '#06b6d4', strokeWidth: 1.5 },
  { key: 'avgGraph',     label: 'Persist Graph',   color: '#ec4899', strokeWidth: 1.5 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDateRange(range) {
  if (range === 'all') return { from: null, to: null };
  const now  = new Date();
  const ms   = { '24h': 86400000, '7d': 7*86400000, '30d': 30*86400000, '90d': 90*86400000 };
  return { from: new Date(now - ms[range]).toISOString(), to: now.toISOString() };
}

function granularityFor(range) {
  return range === '24h' ? 'hour' : 'day';
}

function fmtDuration(ms) {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms/1000).toFixed(1)}s`;
  return `${(ms/60000).toFixed(1)}m`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateShort(iso) {
  if (!iso) return '';
  const s = String(iso);
  // timeline keys are like "2026-06-18" or "2026-06-18T14:00"
  if (s.length <= 10) return s.slice(5); // MM-DD
  if (s.length <= 13) return s.slice(5, 13); // MM-DDTHH:00 → "06-18T14"
  return s.slice(5, 10);
}

function kqsColor(v) {
  if (v >= 0.7) return COLORS.green;
  if (v >= 0.4) return COLORS.amber;
  return COLORS.red;
}

const num = (v, fallback = 0) => (typeof v === 'number' ? v : (parseFloat(v) || fallback));

function fmtEfficiencyTick(ts, windowMs) {
  if (!ts) return '';
  const d = new Date(ts);
  if (windowMs >= 7 * 86400000) {
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }
  if (windowMs >= 86400000) {
    return d.getHours().toString().padStart(2, '0') + ':00';
  }
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function fmtMs(ms) {
  if (ms == null) return '—';
  if (ms < 1000)  return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function EfficiencyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const countEntry = payload.find(p => p.dataKey === 'count');
  return (
    <Box sx={{ background: '#1e293b', border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 1, p: 1.5, minWidth: 160 }}>
      <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', mb: 0.5 }}>
        {label ? new Date(label).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
        {countEntry ? ` · ${countEntry.value} doc${countEntry.value !== 1 ? 's' : ''}` : ''}
      </Typography>
      {payload.filter(p => p.dataKey !== 'count' && p.value != null).map((p, i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.2 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
          <Typography variant="caption" sx={{ color: '#e2e8f0' }}>
            {p.name}: <b>{fmtMs(p.value)}</b>
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Card({ children, sx = {} }) {
  return (
    <Box sx={{
      background: BG1, border: `1px solid ${BORDER}`, borderRadius: 2,
      p: 2.5, ...sx,
    }}>
      {children}
    </Box>
  );
}

function MetricCard({ icon: Icon, label, value, sub, color = COLORS.blue, loading }) {
  return (
    <Card sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Box sx={{
        width: 44, height: 44, borderRadius: 1.5,
        background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={20} color={color} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ color: MUTED, mb: 0.25, fontSize: '0.75rem' }}>{label}</Typography>
        {loading
          ? <CircularProgress size={16} sx={{ color }} />
          : <Typography variant="h6" sx={{ color: TEXT, fontWeight: 700, lineHeight: 1.2 }}>
              {value ?? '—'}
            </Typography>
        }
        {sub && !loading && (
          <Typography variant="caption" sx={{ color: MUTED }}>{sub}</Typography>
        )}
      </Box>
    </Card>
  );
}

function SectionTitle({ children, action }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
      <Typography variant="body2" sx={{ color: MUTED, fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {children}
      </Typography>
      {action}
    </Box>
  );
}

const CHART_STYLE = { fontSize: '0.7rem', fill: MUTED };

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <Box sx={{ background: '#1e293b', border: `1px solid ${BORDER}`, borderRadius: 1, p: 1.5, minWidth: 140 }}>
      <Typography variant="caption" sx={{ color: MUTED, display: 'block', mb: 0.5 }}>{label}</Typography>
      {payload.map((p, i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
          <Typography variant="caption" sx={{ color: TEXT }}>
            {p.name}: <b>{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</b>
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function StatusDot({ status }) {
  return (
    <Box sx={{
      width: 7, height: 7, borderRadius: '50%',
      background: STATUS_COLORS[status] || MUTED,
      flexShrink: 0,
    }} />
  );
}

function KqsBadge({ value }) {
  if (!value) return <Typography variant="caption" sx={{ color: MUTED }}>—</Typography>;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <LinearProgress
        variant="determinate"
        value={value * 100}
        sx={{
          width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)',
          '& .MuiLinearProgress-bar': { background: kqsColor(value) },
        }}
      />
      <Typography variant="caption" sx={{ color: kqsColor(value), fontWeight: 600 }}>
        {value.toFixed(2)}
      </Typography>
    </Box>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const REFRESH_INTERVALS = [
  { label: '15s', value: 15 },
  { label: '30s', value: 30 },
  { label: '1m',  value: 60 },
  { label: '5m',  value: 300 },
];

export default function PipelineStatsPage() {
  const [range, setRange]               = useState('7d');
  const [loading, setLoading]           = useState({ overview: false, timeline: false, entities: false, ns: false, docs: false });
  const [overview, setOverview]         = useState(null);
  const [timeline, setTimeline]         = useState([]);
  const [entities, setEntities]         = useState(null);
  const [namespaces, setNamespaces]     = useState([]);
  const [perf, setPerf]                 = useState(null);
  const [docs, setDocs]                 = useState({ total: 0, items: [] });
  const [docsPage, setDocsPage]         = useState(0);
  const [docsRowsPerPage]               = useState(25);
  const [docsStatus, setDocsStatus]     = useState('');
  const [docsNs, setDocsNs]             = useState('');
  const [docsSearch, setDocsSearch]     = useState('');
  const [docsSort, setDocsSort]         = useState({ by: 'uploadedAt', dir: 'desc' });
  const [activeTimeSeries, setActiveSeries]   = useState(['documents', 'entities']);
  const [effScaleIdx, setEffScaleIdx]         = useState(2); // default: 1h
  const [stepTiming, setStepTiming]           = useState({ points: [], hasStepData: false });
  const [activeStepSeries, setActiveStepSeries] = useState(['avgEntities', 'avgRelations', 'avgEmbed', 'avgTotal']);
  // Auto-refresh: off by default
  const [autoRefresh, setAutoRefresh]         = useState(false);
  const [refreshSec, setRefreshSec]         = useState(30);
  const [lastUpdated, setLastUpdated]       = useState(null);
  const [countdown, setCountdown]           = useState(0);
  const autoRefreshRef = useRef(null);
  const countdownRef   = useRef(null);

  // Memoize from/to so they only change when `range` changes,
  // not on every render (avoids infinite re-fetch loop via useCallback deps)
  const { from, to } = useMemo(() => getDateRange(range), [range]);
  const gran          = granularityFor(range);

  const load = useCallback(async () => {
    const params = {};
    if (from) params.from = from;
    if (to)   params.to   = to;

    setLoading(prev => ({ ...prev, overview: true, timeline: true, entities: true, ns: true }));

    const [ov, tl, ent, ns, pf] = await Promise.allSettled([
      getStatsOverview(params),
      getStatsTimeline({ ...params, granularity: gran }),
      getStatsEntities(params),
      getStatsNamespaces(),
      getStatsPerformance(params),
    ]);

    if (ov.status === 'fulfilled')  setOverview(ov.value);
    if (tl.status === 'fulfilled')  setTimeline(tl.value);
    if (ent.status === 'fulfilled') setEntities(ent.value);
    if (ns.status === 'fulfilled')  setNamespaces(ns.value);
    if (pf.status === 'fulfilled')  setPerf(pf.value);

    setLoading(prev => ({ ...prev, overview: false, timeline: false, entities: false, ns: false }));
    setLastUpdated(new Date());
  }, [from, to, gran]);

  const loadStepTiming = useCallback(async () => {
    const scale = EFFICIENCY_SCALES[effScaleIdx];
    const now   = new Date();
    const fromTs = new Date(now - scale.windowMs).toISOString();
    try {
      const result = await getStatsStepTiming({ from: fromTs, to: now.toISOString(), bucketMs: scale.bucketMs });
      setStepTiming(result || { points: [], hasStepData: false });
    } catch { /* non-fatal */ }
  }, [effScaleIdx]);

  const loadDocs = useCallback(async () => {
    setLoading(prev => ({ ...prev, docs: true }));
    try {
      const params = {
        offset: docsPage * docsRowsPerPage,
        limit:  docsRowsPerPage,
        sortBy: docsSort.by,
        sortDir: docsSort.dir,
      };
      if (from)       params.from      = from;
      if (to)         params.to        = to;
      if (docsStatus) params.status    = docsStatus;
      if (docsNs)     params.namespace = docsNs;
      const result = await getStatsDocuments(params);
      setDocs(result);
    } finally {
      setLoading(prev => ({ ...prev, docs: false }));
    }
  }, [from, to, docsPage, docsRowsPerPage, docsStatus, docsNs, docsSort]);

  // Use refs so the interval always calls the latest version without being recreated
  const loadRef         = useRef(load);
  const loadDocsRef     = useRef(loadDocs);
  const loadStepTimingRef = useRef(loadStepTiming);
  loadRef.current         = load;
  loadDocsRef.current     = loadDocs;
  loadStepTimingRef.current = loadStepTiming;

  // Initial load + reload when range / efficiency scale changes
  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadDocs(); }, [loadDocs]);
  useEffect(() => { loadStepTiming(); }, [loadStepTiming]);

  // Auto-refresh interval
  useEffect(() => {
    clearInterval(autoRefreshRef.current);
    clearInterval(countdownRef.current);
    if (!autoRefresh) { setCountdown(0); return; }

    setCountdown(refreshSec);
    autoRefreshRef.current = setInterval(() => {
      loadRef.current();
      loadDocsRef.current();
      loadStepTimingRef.current();
      setCountdown(refreshSec);
    }, refreshSec * 1000);

    // Countdown ticker (1 s granularity)
    countdownRef.current = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => {
      clearInterval(autoRefreshRef.current);
      clearInterval(countdownRef.current);
    };
  }, [autoRefresh, refreshSec]);

  // ── Derived data ────────────────────────────────────────────────────────────

  const statusPieData = overview
    ? Object.entries(overview.documents.byStatus)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({ name: STATUS_LABELS[k] || k, value: v, color: STATUS_COLORS[k] || MUTED }))
    : [];

  const nsBarData = namespaces.slice(0, 10).map(n => ({
    name: n.namespace,
    total: n.total,
    entities: n.entities,
    vectors: n.vectors,
  }));

  const filteredItems = docs.items.filter(d =>
    !docsSearch || (d.name || '').toLowerCase().includes(docsSearch.toLowerCase())
  );

  // ── Sort toggle ──────────────────────────────────────────────────────────────

  function toggleSort(col) {
    setDocsSort(prev =>
      prev.by === col
        ? { by: col, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { by: col, dir: 'desc' }
    );
    setDocsPage(0);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ height: '100vh', overflow: 'auto', background: BG0, color: TEXT, p: 3 }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 1.5 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: TEXT }}>
            Pipeline Statistics
          </Typography>
          <Typography variant="caption" sx={{ color: MUTED }}>
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
              : 'Extraction analytics · Documents, entities, vectors, KQS quality'}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          {/* Time range selector */}
          <ToggleButtonGroup
            value={range}
            exclusive
            onChange={(_, v) => v && setRange(v)}
            size="small"
            sx={{
              '& .MuiToggleButton-root': {
                color: MUTED, borderColor: BORDER, px: 1.5, py: 0.5,
                fontSize: '0.72rem', fontWeight: 600,
                '&.Mui-selected': { background: COLORS.blue + '33', color: COLORS.blue, borderColor: COLORS.blue + '66' },
              },
            }}
          >
            {RANGE_OPTIONS.map(o => (
              <ToggleButton key={o.value} value={o.value}>{o.label}</ToggleButton>
            ))}
          </ToggleButtonGroup>

          {/* Auto-refresh interval selector — only shown when auto-refresh is on */}
          {autoRefresh && (
            <Select
              value={refreshSec}
              onChange={e => setRefreshSec(e.target.value)}
              size="small"
              sx={{
                fontSize: '0.75rem', color: COLORS.cyan, height: 30,
                background: COLORS.cyan + '11',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: COLORS.cyan + '44' },
                '& .MuiSelect-icon': { color: COLORS.cyan },
              }}
            >
              {REFRESH_INTERVALS.map(r => (
                <MenuItem key={r.value} value={r.value} sx={{ fontSize: '0.78rem' }}>{r.label}</MenuItem>
              ))}
            </Select>
          )}

          {/* Auto-refresh toggle */}
          <Tooltip title={autoRefresh ? `Auto-refresh ON (next in ${countdown}s) — click to disable` : 'Enable auto-refresh'}>
            <Box
              onClick={() => setAutoRefresh(v => !v)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.75, cursor: 'pointer',
                px: 1.25, py: 0.5, borderRadius: 1.5,
                border: `1px solid ${autoRefresh ? COLORS.cyan + '66' : BORDER}`,
                background: autoRefresh ? COLORS.cyan + '11' : 'transparent',
                color: autoRefresh ? COLORS.cyan : MUTED,
                transition: 'all 0.2s',
                '&:hover': { borderColor: COLORS.cyan + '88', color: COLORS.cyan },
                userSelect: 'none',
              }}
            >
              {autoRefresh
                ? <><Pause size={13} /><Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.72rem' }}>{countdown}s</Typography></>
                : <><Play  size={13} /><Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.72rem' }}>Live</Typography></>
              }
            </Box>
          </Tooltip>

          {/* Manual refresh */}
          <Tooltip title="Refresh now">
            <IconButton
              size="small"
              onClick={() => { load(); loadDocs(); loadStepTiming(); }}
              sx={{ color: MUTED, '&:hover': { color: TEXT } }}
            >
              <RefreshCw size={15} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* ── Overview Metric Cards ──────────────────────────────────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1.5, mb: 2.5 }}>
        <MetricCard
          icon={FileText}
          label="Total Documents"
          value={overview?.documents.total?.toLocaleString()}
          sub={range !== 'all' ? `in last ${range}` : 'all time'}
          color={COLORS.blue}
          loading={loading.overview}
        />
        <MetricCard
          icon={CheckCircle}
          label="Success Rate"
          value={overview?.successRate != null ? `${overview.successRate}%` : '—'}
          sub={`${overview?.documents.byStatus?.COMPLETED ?? 0} completed`}
          color={COLORS.green}
          loading={loading.overview}
        />
        <MetricCard
          icon={Database}
          label="Entities Extracted"
          value={overview?.extraction.entities?.toLocaleString()}
          sub={`${overview?.extraction.avgEntities ?? '—'} avg/doc`}
          color={COLORS.green}
          loading={loading.overview}
        />
        <MetricCard
          icon={Link2}
          label="Relations Found"
          value={overview?.extraction.relations?.toLocaleString()}
          sub="across all documents"
          color={COLORS.amber}
          loading={loading.overview}
        />
        <MetricCard
          icon={Layers}
          label="Vectors Indexed"
          value={overview?.extraction.vectors?.toLocaleString()}
          sub="Qdrant embeddings"
          color={COLORS.purple}
          loading={loading.overview}
        />
        <MetricCard
          icon={Zap}
          label="Avg KQS Score"
          value={overview?.extraction.avgKqs != null
            ? overview.extraction.avgKqs.toFixed(3)
            : '—'}
          sub={`${overview?.esEntityCount?.toLocaleString() ?? '—'} ES entities`}
          color={overview?.extraction.avgKqs != null ? kqsColor(overview.extraction.avgKqs) : COLORS.cyan}
          loading={loading.overview}
        />
      </Box>

      {/* ── Performance Row ────────────────────────────────────────────── */}
      {perf && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5, mb: 2.5 }}>
          {[
            { label: 'Avg Duration',  value: fmtDuration(perf.avgDurationMs), color: COLORS.blue },
            { label: 'Avg Entities/Doc', value: perf.avgEntities?.toFixed(1), color: COLORS.green },
            { label: 'Avg Vectors/Doc',  value: perf.avgVectors?.toFixed(1),  color: COLORS.purple },
            { label: 'Total Gaps Detected', value: perf.totalGaps?.toLocaleString(), color: COLORS.amber },
          ].map(m => (
            <Card key={m.label} sx={{ py: 1.5, px: 2 }}>
              <Typography variant="caption" sx={{ color: MUTED, display: 'block' }}>{m.label}</Typography>
              <Typography variant="subtitle1" sx={{ color: m.color, fontWeight: 700 }}>{m.value ?? '—'}</Typography>
            </Card>
          ))}
        </Box>
      )}

      {/* ── Charts Row 1: Timeline + Status Donut ──────────────────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 2, mb: 2 }}>

        {/* Timeline area chart */}
        <Card>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <SectionTitle>Extraction Timeline</SectionTitle>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {[
                { key: 'documents', label: 'Docs',     color: COLORS.blue },
                { key: 'entities',  label: 'Entities', color: COLORS.green },
                { key: 'vectors',   label: 'Vectors',  color: COLORS.purple },
              ].map(s => (
                <Chip
                  key={s.key}
                  label={s.label}
                  size="small"
                  onClick={() => setActiveSeries(prev =>
                    prev.includes(s.key) ? prev.filter(k => k !== s.key) : [...prev, s.key]
                  )}
                  sx={{
                    height: 20, fontSize: '0.68rem', cursor: 'pointer',
                    background: activeTimeSeries.includes(s.key) ? s.color + '33' : 'transparent',
                    borderColor: activeTimeSeries.includes(s.key) ? s.color + '88' : BORDER,
                    color: activeTimeSeries.includes(s.key) ? s.color : MUTED,
                    border: '1px solid',
                  }}
                />
              ))}
            </Box>
          </Box>
          {loading.timeline
            ? <Box sx={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CircularProgress size={28} sx={{ color: COLORS.blue }} />
              </Box>
            : timeline.length === 0
              ? <Box sx={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography variant="body2" sx={{ color: MUTED }}>No extraction data in this range</Typography>
                </Box>
              : <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={timeline} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                    <defs>
                      {[
                        { key: 'documents', color: COLORS.blue },
                        { key: 'entities',  color: COLORS.green },
                        { key: 'vectors',   color: COLORS.purple },
                      ].map(s => (
                        <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={s.color} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={s.color} stopOpacity={0} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                    <XAxis dataKey="date" tick={CHART_STYLE} tickFormatter={fmtDateShort} interval="preserveStartEnd" />
                    <YAxis tick={CHART_STYLE} />
                    <ReTooltip content={<CustomTooltip />} />
                    {activeTimeSeries.includes('documents') && (
                      <Area type="monotone" dataKey="documents" name="Documents" stroke={COLORS.blue}   fill="url(#grad-documents)" strokeWidth={2} dot={false} />
                    )}
                    {activeTimeSeries.includes('entities') && (
                      <Area type="monotone" dataKey="entities"  name="Entities"  stroke={COLORS.green}  fill="url(#grad-entities)"  strokeWidth={2} dot={false} />
                    )}
                    {activeTimeSeries.includes('vectors') && (
                      <Area type="monotone" dataKey="vectors"   name="Vectors"   stroke={COLORS.purple} fill="url(#grad-vectors)"   strokeWidth={2} dot={false} />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
          }
        </Card>

        {/* Status distribution donut */}
        <Card>
          <SectionTitle>Status Distribution</SectionTitle>
          {loading.overview
            ? <Box sx={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CircularProgress size={28} sx={{ color: COLORS.blue }} />
              </Box>
            : statusPieData.length === 0
              ? <Box sx={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography variant="body2" sx={{ color: MUTED }}>No data</Typography>
                </Box>
              : <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie
                        data={statusPieData}
                        cx="50%" cy="50%"
                        innerRadius={48} outerRadius={72}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {statusPieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} stroke="transparent" />
                        ))}
                      </Pie>
                      <ReTooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <Box sx={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 1, p: 1 }}>
                              <Typography variant="caption" sx={{ color: TEXT }}>
                                {d.name}: <b>{d.value}</b>
                              </Typography>
                            </Box>
                          );
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 0.5 }}>
                    {statusPieData.map((d, i) => (
                      <Box key={i} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                          <Typography variant="caption" sx={{ color: MUTED }}>{d.name}</Typography>
                        </Box>
                        <Typography variant="caption" sx={{ color: TEXT, fontWeight: 600 }}>{d.value}</Typography>
                      </Box>
                    ))}
                  </Box>
                </>
          }
        </Card>
      </Box>

      {/* ── Charts Row 2: Entity Types + KQS Distribution ──────────────── */}
      {entities && (
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>

          {/* Entity type bar chart */}
          <Card>
            <SectionTitle>Entity Types</SectionTitle>
            {entities.byType.length === 0
              ? <Box sx={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography variant="body2" sx={{ color: MUTED }}>No entity data</Typography>
                </Box>
              : <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={entities.byType} layout="vertical" margin={{ top: 0, right: 20, left: 60, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={BORDER} horizontal={false} />
                    <XAxis type="number" tick={CHART_STYLE} />
                    <YAxis dataKey="type" type="category" tick={{ ...CHART_STYLE, fontSize: '0.68rem' }} width={60} />
                    <ReTooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="Count" fill={COLORS.green} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
            }
          </Card>

          {/* KQS histogram */}
          <Card>
            <SectionTitle>KQS Score Distribution</SectionTitle>
            {entities.kqsDistribution.every(b => b.count === 0)
              ? <Box sx={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography variant="body2" sx={{ color: MUTED }}>No KQS data</Typography>
                </Box>
              : <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={entities.kqsDistribution} margin={{ top: 0, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                    <XAxis dataKey="range" tick={{ ...CHART_STYLE, fontSize: '0.65rem' }} />
                    <YAxis tick={CHART_STYLE} allowDecimals={false} />
                    <ReTooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="Documents" radius={[3, 3, 0, 0]}>
                      {entities.kqsDistribution.map((entry, i) => {
                        const mid = (i * 0.1) + 0.05;
                        return <Cell key={i} fill={kqsColor(mid)} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
            }
          </Card>
        </Box>
      )}

      {/* ── Charts Row 3: Relation Types + Top Entities ────────────────── */}
      {entities && (
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>

          {/* Relation types */}
          <Card>
            <SectionTitle>Relation Types</SectionTitle>
            {entities.relationTypes.length === 0
              ? <Box sx={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography variant="body2" sx={{ color: MUTED }}>No relation data</Typography>
                </Box>
              : <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={entities.relationTypes} layout="vertical" margin={{ top: 0, right: 20, left: 80, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={BORDER} horizontal={false} />
                    <XAxis type="number" tick={CHART_STYLE} />
                    <YAxis dataKey="type" type="category" tick={{ ...CHART_STYLE, fontSize: '0.67rem' }} width={80} />
                    <ReTooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="Count" fill={COLORS.amber} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
            }
          </Card>

          {/* Top ESEntities */}
          <Card>
            <SectionTitle>Top Entities (Entity Store)</SectionTitle>
            <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
              {entities.topEntities.length === 0
                ? <Typography variant="body2" sx={{ color: MUTED }}>No ES entities</Typography>
                : entities.topEntities.slice(0, 12).map((e, i) => (
                    <Box key={i} sx={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      py: 0.5, borderBottom: `1px solid ${BORDER}`,
                    }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                        <Typography variant="caption" sx={{ color: MUTED, width: 16, flexShrink: 0 }}>{i + 1}.</Typography>
                        <Typography variant="caption" sx={{ color: TEXT, noWrap: true, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {e.name}
                        </Typography>
                        {e.type && (
                          <Chip label={e.type} size="small" sx={{ height: 14, fontSize: '0.6rem', color: MUTED, background: 'rgba(255,255,255,0.05)', ml: 0.5 }} />
                        )}
                      </Box>
                      <Typography variant="caption" sx={{ color: COLORS.cyan, fontWeight: 600, flexShrink: 0, ml: 1 }}>
                        ×{e.mentionCount}
                      </Typography>
                    </Box>
                  ))
              }
            </Box>
          </Card>
        </Box>
      )}

      {/* ── Namespace Breakdown ────────────────────────────────────────── */}
      {nsBarData.length > 0 && (
        <Card sx={{ mb: 2 }}>
          <SectionTitle>Namespace Breakdown</SectionTitle>
          <ResponsiveContainer width="100%" height={nsBarData.length > 4 ? 200 : 120}>
            <BarChart data={nsBarData} layout="vertical" margin={{ top: 0, right: 80, left: 80, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} horizontal={false} />
              <XAxis type="number" tick={CHART_STYLE} />
              <YAxis dataKey="name" type="category" tick={CHART_STYLE} width={80} />
              <ReTooltip content={<CustomTooltip />} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: '0.7rem', color: MUTED }} />
              <Bar dataKey="total"    name="Total"    fill={COLORS.blue}   radius={[0, 2, 2, 0]} stackId="a" />
              <Bar dataKey="entities" name="Entities" fill={COLORS.green}  radius={[0, 0, 0, 0]} stackId="b" />
              <Bar dataKey="vectors"  name="Vectors"  fill={COLORS.purple} radius={[0, 2, 2, 0]} stackId="b" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* ── Pipeline Efficiency ───────────────────────────────────────── */}
      <Card sx={{ mb: 2 }}>
        {/* Header + scale selector */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TrendingUp size={15} color={COLORS.cyan} />
            <SectionTitle>Pipeline Efficiency</SectionTitle>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {/* Step series toggle chips */}
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {STEP_SERIES.map(s => (
                <Chip
                  key={s.key}
                  label={s.label}
                  size="small"
                  onClick={() => setActiveStepSeries(prev =>
                    prev.includes(s.key) ? prev.filter(k => k !== s.key) : [...prev, s.key]
                  )}
                  sx={{
                    height: 20, fontSize: '0.67rem', cursor: 'pointer',
                    background: activeStepSeries.includes(s.key) ? s.color + '33' : 'transparent',
                    borderColor: activeStepSeries.includes(s.key) ? s.color + '88' : BORDER,
                    color: activeStepSeries.includes(s.key) ? s.color : MUTED,
                    border: '1px solid',
                  }}
                />
              ))}
            </Box>
            <Divider orientation="vertical" flexItem sx={{ borderColor: BORDER, mx: 0.5 }} />
            {/* Time scale selector */}
            <ToggleButtonGroup
              value={effScaleIdx}
              exclusive
              onChange={(_, v) => v != null && setEffScaleIdx(v)}
              size="small"
              sx={{
                '& .MuiToggleButton-root': {
                  color: MUTED, borderColor: BORDER, px: 1, py: 0.35,
                  fontSize: '0.68rem', fontWeight: 600, minWidth: 0,
                  '&.Mui-selected': { background: COLORS.cyan + '22', color: COLORS.cyan, borderColor: COLORS.cyan + '55' },
                },
              }}
            >
              {EFFICIENCY_SCALES.map((s, i) => (
                <ToggleButton key={s.label} value={i}>{s.label}</ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
        </Box>

        {stepTiming.points.length === 0 ? (
          <Box sx={{ height: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ color: MUTED }}>No extraction data in selected window</Typography>
            <Typography variant="caption" sx={{ color: MUTED, opacity: 0.6 }}>
              Step-level timing appears for documents processed after this feature was enabled
            </Typography>
          </Box>
        ) : (
          <>
            {/* Step duration trend chart */}
            <Typography variant="caption" sx={{ color: MUTED, display: 'block', mb: 0.75, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Avg step duration per bucket · seconds
            </Typography>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={stepTiming.points} margin={{ top: 4, right: 12, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad-total-eff" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#64748b" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#64748b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                <XAxis
                  dataKey="ts"
                  tick={CHART_STYLE}
                  tickFormatter={ts => fmtEfficiencyTick(ts, EFFICIENCY_SCALES[effScaleIdx].windowMs)}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={CHART_STYLE}
                  tickFormatter={v => v >= 60000 ? `${(v/60000).toFixed(0)}m` : `${(v/1000).toFixed(0)}s`}
                  domain={[0, 'auto']}
                />
                <ReTooltip content={<EfficiencyTooltip />} />
                <Legend
                  iconSize={8}
                  wrapperStyle={{ fontSize: '0.68rem', color: MUTED, paddingTop: 4 }}
                  formatter={v => v}
                />
                {/* Total as area background */}
                {activeStepSeries.includes('avgTotal') && (
                  <Area
                    type="monotone" dataKey="avgTotal" name="Total"
                    stroke="#64748b" fill="url(#grad-total-eff)"
                    strokeWidth={1.5} strokeDasharray="4 2"
                    dot={false} connectNulls={false}
                  />
                )}
                {/* Per-step lines */}
                {STEP_SERIES.filter(s => s.key !== 'avgTotal' && activeStepSeries.includes(s.key)).map(s => (
                  <Line
                    key={s.key}
                    type="monotone" dataKey={s.key} name={s.label}
                    stroke={s.color} strokeWidth={s.strokeWidth}
                    dot={{ r: 2.5, fill: s.color }} activeDot={{ r: 4 }}
                    connectNulls={false}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>

            {/* Throughput mini-chart */}
            <Typography variant="caption" sx={{ color: MUTED, display: 'block', mt: 2, mb: 0.75, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Documents processed per bucket
            </Typography>
            <ResponsiveContainer width="100%" height={90}>
              <BarChart data={stepTiming.points} margin={{ top: 0, right: 12, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
                <XAxis
                  dataKey="ts"
                  tick={CHART_STYLE}
                  tickFormatter={ts => fmtEfficiencyTick(ts, EFFICIENCY_SCALES[effScaleIdx].windowMs)}
                  interval="preserveStartEnd"
                />
                <YAxis tick={CHART_STYLE} allowDecimals={false} />
                <ReTooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0];
                    return (
                      <Box sx={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 1, p: 1 }}>
                        <Typography variant="caption" sx={{ color: TEXT }}>
                          {label ? new Date(label).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                        </Typography>
                        <Typography variant="caption" sx={{ color: COLORS.cyan, display: 'block', fontWeight: 600 }}>
                          {p.value} doc{p.value !== 1 ? 's' : ''} processed
                        </Typography>
                      </Box>
                    );
                  }}
                />
                <Bar dataKey="count" name="Docs" fill={COLORS.cyan} radius={[3, 3, 0, 0]} opacity={0.7} />
              </BarChart>
            </ResponsiveContainer>

            {!stepTiming.hasStepData && (
              <Typography variant="caption" sx={{ color: MUTED, opacity: 0.55, display: 'block', mt: 1, textAlign: 'center' }}>
                Step-level timing (colored lines) will appear for documents processed after this feature was enabled
              </Typography>
            )}
          </>
        )}
      </Card>

      {/* ── Document Table ─────────────────────────────────────────────── */}
      <Card>
        {/* Table controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
          <SectionTitle>Documents</SectionTitle>
          <Box sx={{ flex: 1, minWidth: 0 }} />

          <TextField
            size="small"
            placeholder="Search by name…"
            value={docsSearch}
            onChange={e => setDocsSearch(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start"><Search size={13} color={MUTED} /></InputAdornment>,
              style: { fontSize: '0.8rem', color: TEXT, background: BG2 },
            }}
            sx={{ width: 200, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: BORDER } } }}
          />

          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel sx={{ fontSize: '0.8rem', color: MUTED }}>Status</InputLabel>
            <Select
              value={docsStatus}
              label="Status"
              onChange={e => { setDocsStatus(e.target.value); setDocsPage(0); }}
              sx={{ fontSize: '0.8rem', color: TEXT, background: BG2, '& .MuiOutlinedInput-notchedOutline': { borderColor: BORDER } }}
            >
              <MenuItem value="">All</MenuItem>
              {['COMPLETED','EXTRACTION_FAILED','FAILED','EXTRACTING','CLASSIFIED','NEEDS_REVIEW'].map(s => (
                <MenuItem key={s} value={s} sx={{ fontSize: '0.8rem' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <StatusDot status={s} />
                    {STATUS_LABELS[s] || s}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {namespaces.length > 1 && (
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel sx={{ fontSize: '0.8rem', color: MUTED }}>Namespace</InputLabel>
              <Select
                value={docsNs}
                label="Namespace"
                onChange={e => { setDocsNs(e.target.value); setDocsPage(0); }}
                sx={{ fontSize: '0.8rem', color: TEXT, background: BG2, '& .MuiOutlinedInput-notchedOutline': { borderColor: BORDER } }}
              >
                <MenuItem value="">All</MenuItem>
                {namespaces.map(n => (
                  <MenuItem key={n.namespace} value={n.namespace} sx={{ fontSize: '0.8rem' }}>{n.namespace}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Box>

        {loading.docs
          ? <Box sx={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CircularProgress size={24} sx={{ color: COLORS.blue }} />
            </Box>
          : <>
              <TableContainer>
                <Table size="small" sx={{ '& td, & th': { borderColor: BORDER, fontSize: '0.75rem' } }}>
                  <TableHead>
                    <TableRow sx={{ '& th': { color: MUTED, fontWeight: 600, background: BG2, py: 1 } }}>
                      <TableCell>Status</TableCell>
                      <TableCell>Document</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Namespace</TableCell>
                      <SortableHeader col="uploadedAt"  current={docsSort} onClick={toggleSort}>Uploaded</SortableHeader>
                      <SortableHeader col="extractedAt" current={docsSort} onClick={toggleSort}>Extracted</SortableHeader>
                      <SortableHeader col="entities"    current={docsSort} onClick={toggleSort}>Entities</SortableHeader>
                      <TableCell align="right">Relations</TableCell>
                      <TableCell align="right">Vectors</TableCell>
                      <SortableHeader col="kqs"         current={docsSort} onClick={toggleSort} align="right">KQS</SortableHeader>
                      <TableCell align="right">Duration</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredItems.length === 0
                      ? <TableRow>
                          <TableCell colSpan={11} align="center" sx={{ color: MUTED, py: 4 }}>
                            No documents found
                          </TableCell>
                        </TableRow>
                      : filteredItems.map((d, i) => (
                          <TableRow
                            key={d.id || i}
                            sx={{ '&:hover': { background: 'rgba(255,255,255,0.025)' }, cursor: 'pointer' }}
                            onClick={() => window.open(`/documents/${d.id}`, '_blank')}
                          >
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                <StatusDot status={d.status} />
                                <Typography variant="caption" sx={{ color: STATUS_COLORS[d.status] || MUTED }}>
                                  {STATUS_LABELS[d.status] || d.status || '—'}
                                </Typography>
                              </Box>
                            </TableCell>
                            <TableCell sx={{ maxWidth: 220 }}>
                              <Tooltip title={d.name || d.id}>
                                <Typography variant="caption" sx={{
                                  color: TEXT, display: 'block',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                  {d.name || d.id}
                                </Typography>
                              </Tooltip>
                            </TableCell>
                            <TableCell><Typography variant="caption" sx={{ color: MUTED }}>{d.docType || '—'}</Typography></TableCell>
                            <TableCell><Typography variant="caption" sx={{ color: MUTED }}>{d.namespace || 'DEFAULT'}</Typography></TableCell>
                            <TableCell><Typography variant="caption" sx={{ color: MUTED }}>{fmtDate(d.uploadedAt)}</Typography></TableCell>
                            <TableCell><Typography variant="caption" sx={{ color: MUTED }}>{fmtDate(d.extractedAt)}</Typography></TableCell>
                            <TableCell align="right">
                              <Typography variant="caption" sx={{ color: d.entities > 0 ? COLORS.green : MUTED, fontWeight: d.entities > 0 ? 600 : 400 }}>
                                {d.entities}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="caption" sx={{ color: d.relations > 0 ? COLORS.amber : MUTED }}>
                                {d.relations}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="caption" sx={{ color: d.vectors > 0 ? COLORS.purple : MUTED }}>
                                {d.vectors}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <KqsBadge value={d.kqs} />
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="caption" sx={{ color: MUTED }}>{fmtDuration(d.durationMs)}</Typography>
                            </TableCell>
                          </TableRow>
                        ))
                    }
                  </TableBody>
                </Table>
              </TableContainer>

              <TablePagination
                component="div"
                count={docs.total}
                page={docsPage}
                onPageChange={(_, p) => setDocsPage(p)}
                rowsPerPage={docsRowsPerPage}
                rowsPerPageOptions={[25]}
                sx={{ color: MUTED, fontSize: '0.75rem', '& .MuiTablePagination-toolbar': { minHeight: 40 } }}
              />
            </>
        }
      </Card>
    </Box>
  );
}

// ─── SortableHeader helper ────────────────────────────────────────────────────

function SortableHeader({ col, current, onClick, children, align = 'right' }) {
  const active = current.by === col;
  return (
    <TableCell
      align={align}
      onClick={() => onClick(col)}
      sx={{ cursor: 'pointer', userSelect: 'none', '&:hover': { color: TEXT } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: align === 'right' ? 'flex-end' : 'flex-start', gap: 0.25 }}>
        {children}
        <ArrowUpDown size={11} color={active ? COLORS.blue : MUTED} />
      </Box>
    </TableCell>
  );
}
