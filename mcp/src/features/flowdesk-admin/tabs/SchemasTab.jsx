/**
 * Schemas — cached SchemaSnapshot inventory + viewer: rendered form preview
 * (slots as the chat asks them, with conditionality annotations), snapshot/source
 * JSON, freshness probe, invalidate / re-materialize actions.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Paper, Stack, Table, TableHead, TableRow, TableCell, TableBody,
  Typography, Chip, Button, Drawer, IconButton, Tabs, Tab, Alert,
  CircularProgress, Tooltip, Divider, Checkbox, TableSortLabel, TablePagination,
  TextField, InputAdornment, LinearProgress, ToggleButton, ToggleButtonGroup, useTheme,
} from '@mui/material';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, LabelList,
} from 'recharts';
import { X, RefreshCcw, Trash2, Eye, Sparkles, Check, Search, Ban, AlertCircle, Download, DownloadCloud } from 'lucide-react';
import { getSchemas, getSchemaDetail, invalidateSchema, rematerializeSchema, enrichSchema, exportSchemas, runCatalogSync, getCatalog, materializeService } from '../api/adminClient';
import { Loading, ErrorNote, useAutoRefresh, Kpi, fmtTs } from '../components/common';

const TYPE_COLORS = { enum: 'info', user: 'secondary', location: 'secondary', date: 'warning', number: 'warning', boolean: 'warning', text: 'default', string: 'default' };

function FormPreview({ snapshot, enrichment }) {
  if (!snapshot) return null;
  const meta = snapshot.metadata || {};
  const fieldDesc = (enrichment && enrichment.fields) || {};
  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 0.5 }}>
        <Chip size="small" label={snapshot.serviceId} />
        <Chip size="small" variant="outlined" label={`v${snapshot.version}`} />
        {meta.altioraOusId != null && <Chip size="small" variant="outlined" label={`ous ${meta.altioraOusId}`} />}
        {meta.approvalRequired && <Chip size="small" color="warning" label="approval required" />}
        {meta.slaHours != null && <Chip size="small" variant="outlined" label={`SLA ${meta.slaHours}h`} />}
      </Stack>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>{meta.title}</Typography>
      {snapshot.phases.map((phase) => {
        const slots = snapshot.slots.filter((s) => s.phase === phase);
        if (!slots.length) return null;
        return (
          <Paper key={phase} variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
            <Typography variant="overline" color="text.secondary">{phase}</Typography>
            {slots.map((s) => (
              <Box key={s.slotId} sx={{ py: 0.75, borderBottom: '1px solid', borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                  <Typography variant="body2" fontWeight={600}><code>{s.slotId}</code></Typography>
                  <Chip size="small" variant="outlined" color={TYPE_COLORS[s.type] || 'default'} label={s.type} />
                  {s.required && <Chip size="small" color="error" variant="outlined" label="required" />}
                  {s.lov && <Tooltip title={`LOV: ${s.lov.entityId}`}><Chip size="small" color="info" variant="outlined" label="LOV" /></Tooltip>}
                  {s.resolverRef && <Chip size="small" color="secondary" variant="outlined" label={`resolver: ${s.resolverRef}`} />}
                  {s.altioraFieldId && <Typography variant="caption" color="text.disabled">altiora: {s.altioraFieldId}</Typography>}
                </Stack>
                {s.promptHint && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{s.promptHint}</Typography>}
                {fieldDesc[s.slotId] && (
                  <Typography variant="caption" sx={{ display: 'block', color: 'success.main' }}>
                    <Sparkles size={10} style={{ verticalAlign: -1 }} /> {fieldDesc[s.slotId]}
                  </Typography>
                )}
                {s.trefCondition && (
                  <Typography variant="caption" sx={{ display: 'block', color: 'info.main', fontFamily: 'monospace' }}>
                    shown when: {s.trefCondition}
                  </Typography>
                )}
                {s.requiredWhen && s.requiredWhen !== s.trefCondition && (
                  <Typography variant="caption" sx={{ display: 'block', color: 'warning.main', fontFamily: 'monospace' }}>
                    required when: {s.requiredWhen}
                  </Typography>
                )}
                {s.type === 'enum' && (s.presentOptions || []).length > 0 && (
                  <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
                    {s.presentOptions.map((o) => <Chip key={o.value} size="small" label={o.label} />)}
                  </Stack>
                )}
              </Box>
            ))}
          </Paper>
        );
      })}
    </Box>
  );
}

function JsonView({ value }) {
  return (
    <Box component="pre" sx={{
      m: 0, p: 1.5, fontSize: 12, fontFamily: 'monospace', overflow: 'auto',
      bgcolor: 'action.hover', borderRadius: 1, maxHeight: '70vh',
    }}>{JSON.stringify(value, null, 2)}</Box>
  );
}

function EnrichmentPanel({ ousId, detail, onEnriched }) {
  const enrichment = detail?.enrichment;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [result, setResult] = useState(null);

  const run = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await enrichSchema(ousId);
      setResult(r);
      setMsg({ sev: 'success', text: `Generated & applied by ${r.model} — description embedded into intent search (point ${r.applied?.vector?.pointId?.slice(0, 8)}…), ${r.fieldDescriptions?.length || 0} field meanings.` });
      onEnriched?.();
    } catch (e) { setMsg({ sev: 'error', text: e.message }); } finally { setBusy(false); }
  };

  const shown = result || (enrichment ? {
    serviceDescription: enrichment.text, keywords: enrichment.keywords,
    fieldDescriptions: Object.entries(enrichment.fields || {}).map(([slotId, description]) => ({ slotId, description })),
    model: enrichment.model, updatedAt: enrichment.updatedAt,
  } : null);

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 1.5 }}>
        The AI agent (Claude Haiku) writes an AI-readable service description (embedded into the intent-resolution
        vector store to improve free-text/voice matching, graph-linked to this schema) and a meaning for each field.
      </Alert>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
        <Button variant="contained" size="small" startIcon={busy ? <CircularProgress size={13} /> : <Sparkles size={14} />}
          disabled={busy} onClick={run}>{enrichment ? 'Re-generate & apply' : 'Generate & apply'}</Button>
        {enrichment && <Chip size="small" color="success" icon={<Check size={12} />} label={`described${enrichment.updatedAt ? ` · ${fmtTs(enrichment.updatedAt)}` : ''}`} />}
      </Stack>
      {msg && <Alert severity={msg.sev} sx={{ mb: 1.5 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}
      {!shown && !busy && <Typography variant="body2" color="text.secondary">No AI description yet. Click Generate to create one.</Typography>}
      {shown && (
        <Stack spacing={1.5}>
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Typography variant="overline" color="text.secondary">Service description (AI-readable, in intent search)</Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>{shown.serviceDescription}</Typography>
          </Paper>
          {(shown.keywords || []).length > 0 && (
            <Box>
              <Typography variant="overline" color="text.secondary">Recall keywords</Typography>
              <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                {shown.keywords.map((k, i) => <Chip key={i} size="small" variant="outlined" label={k} />)}
              </Stack>
            </Box>
          )}
          <Box>
            <Typography variant="overline" color="text.secondary">Field meanings</Typography>
            <Table size="small">
              <TableBody>
                {(shown.fieldDescriptions || []).map((f) => (
                  <TableRow key={f.slotId}>
                    <TableCell sx={{ verticalAlign: 'top', width: 200 }}><code>{f.slotId}</code></TableCell>
                    <TableCell><Typography variant="caption">{f.description}</Typography></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Stack>
      )}
    </Box>
  );
}

function SchemaDrawer({ ousId, onClose, onChanged }) {
  const [tab, setTab] = useState('preview');
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = (withSource) => {
    setErr(null);
    getSchemaDetail(ousId, withSource).then(setDetail).catch(setErr);
  };
  useEffect(() => { if (ousId != null) { setDetail(null); setTab('preview'); setMsg(null); load(false); } }, [ousId]); // eslint-disable-line

  const act = async (fn, label) => {
    setBusy(true); setMsg(null);
    try { const r = await fn(ousId); setMsg({ sev: 'success', text: `${label}: ok${r?.slots ? ` (slots=${r.slots})` : ''}` }); load(tab === 'source'); onChanged?.(); }
    catch (e) { setMsg({ sev: 'error', text: e.message }); } finally { setBusy(false); }
  };

  const snap = detail?.snapshot;
  return (
    <Drawer anchor="right" open={ousId != null} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', md: 680 } } }}>
      <Box sx={{ p: 1.5, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="subtitle1">Schema — ous {ousId}</Typography>
            {detail && (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                {detail.fresh === true && <Chip size="small" color="success" label="fresh (hash match)" />}
                {detail.fresh === false && <Chip size="small" color="warning" label="stale (hash drift)" />}
                {detail.liveError && <Tooltip title={detail.liveError}><Chip size="small" color="error" label="live probe failed" /></Tooltip>}
                {detail.liveVersion && <Typography variant="caption" color="text.secondary">Altiora v{detail.liveVersion.version} · {detail.liveVersion.updatedAt}</Typography>}
              </Stack>
            )}
          </Box>
          <IconButton size="small" onClick={onClose}><X size={18} /></IconButton>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ my: 1 }}>
          <Button size="small" variant="outlined" startIcon={busy ? <CircularProgress size={12} /> : <RefreshCcw size={12} />}
            disabled={busy} onClick={() => act(rematerializeSchema, 'Re-materialize')}>Re-materialize</Button>
          <Button size="small" variant="outlined" color="warning" startIcon={<Trash2 size={12} />}
            disabled={busy} onClick={() => act(invalidateSchema, 'Invalidate')}>Invalidate</Button>
        </Stack>
        {msg && <Alert severity={msg.sev} onClose={() => setMsg(null)} sx={{ mb: 1 }}>{msg.text}</Alert>}
        <Tabs value={tab} onChange={(_, v) => { setTab(v); if (v === 'source' && !detail?.sourceSchemaJson) load(true); }}
          sx={{ minHeight: 34, borderBottom: 1, borderColor: 'divider' }}>
          <Tab value="preview" label="Form preview" sx={{ minHeight: 34, py: 0 }} />
          <Tab value="ai" label="AI description" icon={<Sparkles size={13} />} iconPosition="start" sx={{ minHeight: 34, py: 0 }} />
          <Tab value="snapshot" label="Snapshot JSON" sx={{ minHeight: 34, py: 0 }} />
          <Tab value="source" label="Altiora SchemaJson" sx={{ minHeight: 34, py: 0 }} />
        </Tabs>
        <Divider />
        <Box sx={{ flex: 1, overflow: 'auto', pt: 1.5, minHeight: 0 }}>
          <ErrorNote error={err} />
          {!detail && !err && <Loading />}
          {snap && tab === 'preview' && <FormPreview snapshot={snap} enrichment={detail?.enrichment} />}
          {detail && tab === 'ai' && <EnrichmentPanel ousId={ousId} detail={detail} onEnriched={() => { load(tab === 'source'); onChanged?.(); }} />}
          {snap && tab === 'snapshot' && <JsonView value={snap} />}
          {detail && tab === 'source' && (detail.sourceSchemaJson
            ? <JsonView value={detail.sourceSchemaJson} />
            : <Loading label="Fetching live SchemaJson from Altiora…" />)}
        </Box>
      </Box>
    </Drawer>
  );
}

// Mass AI-enrichment runs the existing per-schema enrich endpoint, but never more
// than this many at once (browser-side concurrency pool) — Ivan's ratified batch size.
const BULK_CONCURRENCY = 5;

const SORT_COLS = [
  { id: 'ousId', label: 'ousId', numeric: true },
  { id: 'serviceId', label: 'Service' },
  { id: 'title', label: 'Title' },
  { id: 'slotCount', label: 'Slots', numeric: true },
  { id: 'state', label: 'State' },
  { id: 'hasDescription', label: 'AI desc', bool: true },
  { id: 'approvalRequired', label: 'Approval', bool: true },
];

// Buckets for the slot-count distribution (schema complexity). Fixed edges cover
// typical intake-form sizes; anything larger folds into the open-ended top bucket.
const SLOT_BUCKETS = [
  { label: '1–3', lo: 1, hi: 3 },
  { label: '4–6', lo: 4, hi: 6 },
  { label: '7–9', lo: 7, hi: 9 },
  { label: '10–14', lo: 10, hi: 14 },
  { label: '15–19', lo: 15, hi: 19 },
  { label: '20+', lo: 20, hi: Infinity },
];

/**
 * Distribution of schemas across slot-count buckets, with each bucket's share of
 * the total (percentage). Returns bins even when empty so the curve keeps its shape.
 */
function slotHistogram(items) {
  const bins = SLOT_BUCKETS.map((b) => ({ bucket: b.label, count: 0 }));
  let total = 0;
  for (const s of items || []) {
    const n = Number(s.slotCount);
    if (!Number.isFinite(n) || n <= 0) continue;
    const idx = SLOT_BUCKETS.findIndex((b) => n >= b.lo && n <= b.hi);
    if (idx >= 0) { bins[idx].count += 1; total += 1; }
  }
  return { bins: bins.map((b) => ({ ...b, pct: total ? (b.count / total) * 100 : 0 })), total };
}

/** "12%", ">0%" for a tiny non-zero share, "0%" for none. */
const fmtPctLabel = (v) => {
  const n = Number(v) || 0;
  if (n === 0) return '0%';
  const r = Math.round(n);
  return r === 0 ? '<1%' : `${r}%`;
};

/**
 * Smooth (density-style) single-series area chart of the slot-count distribution,
 * as a share of all schemas — reads as schema-complexity spread. Monotone spline
 * over the buckets (not discrete bars), per-point % labels, theme-hued.
 */
function SlotDistributionCard({ items }) {
  const theme = useTheme();
  const { data, total } = useMemo(() => {
    const { bins, total: t } = slotHistogram(items);
    return { data: bins, total: t };
  }, [items]);
  const axisColor = theme.palette.text.secondary;
  const hue = theme.palette.primary.main;
  const gid = 'slotDistGradient';
  return (
    <Paper variant="outlined" sx={{ p: 1.5, flex: '2 1 300px', minWidth: 260 }}>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
        Slot-count distribution
      </Typography>
      {total === 0 ? (
        <Typography variant="h6" sx={{ lineHeight: 1.3 }}>—</Typography>
      ) : (
        <Box sx={{ width: '100%', height: 92, mt: 0.5 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 12, right: 8, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={hue} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={hue} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: axisColor }} tickLine={false} axisLine={{ stroke: theme.palette.divider }} interval={0} />
              <YAxis width={30} tick={{ fontSize: 10, fill: axisColor }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v)}%`} />
              <RTooltip
                cursor={{ stroke: theme.palette.divider }}
                contentStyle={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: `1px solid ${theme.palette.divider}`, background: theme.palette.background.paper }}
                labelFormatter={(l) => `${l} slots`}
                formatter={(v, _n, p) => [`${p?.payload?.count ?? 0} schema${(p?.payload?.count ?? 0) === 1 ? '' : 's'} · ${fmtPctLabel(v)}`, 'share']}
              />
              <Area type="monotone" dataKey="pct" stroke={hue} strokeWidth={2} fill={`url(#${gid})`} dot={{ r: 2, fill: hue, strokeWidth: 0 }} activeDot={{ r: 3 }} isAnimationActive={false}>
                <LabelList dataKey="pct" position="top" formatter={fmtPctLabel} style={{ fontSize: 9, fill: axisColor }} />
              </Area>
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      )}
      <Typography variant="caption" color="text.secondary">form complexity · {total} schema{total === 1 ? '' : 's'} · % of total</Typography>
    </Paper>
  );
}

function compareBy(a, b, col) {
  const meta = SORT_COLS.find((c) => c.id === col) || {};
  const av = a[col]; const bv = b[col];
  if (meta.bool) return (av ? 1 : 0) - (bv ? 1 : 0);
  if (meta.numeric) { const an = Number(av); const bn = Number(bv); if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn; }
  return String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true });
}

/** Small per-row bulk-status indicator. */
function BulkStatusDot({ st }) {
  if (!st) return null;
  if (st.status === 'queued') return <Tooltip title="Queued"><Chip size="small" variant="outlined" label="queued" sx={{ height: 18, fontSize: 10 }} /></Tooltip>;
  if (st.status === 'running') return <Tooltip title="Generating…"><CircularProgress size={13} /></Tooltip>;
  if (st.status === 'ok') return <Tooltip title="Done"><Check size={15} color="var(--mui-palette-success-main, #2e7d32)" /></Tooltip>;
  if (st.status === 'error') return <Tooltip title={st.error || 'Failed'}><AlertCircle size={15} color="var(--mui-palette-error-main, #d32f2f)" /></Tooltip>;
  return null;
}

export default function SchemasTab() {
  const [items, setItems] = useState(null);
  const [drawerOus, setDrawerOus] = useState(null);
  const [enrichingId, setEnrichingId] = useState(null);
  const [rowMsg, setRowMsg] = useState(null);

  // list controls
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [sortBy, setSortBy] = useState('ousId');
  const [sortDir, setSortDir] = useState('asc');
  const [q, setQ] = useState('');
  const [stateFilter, setStateFilter] = useState('all'); // all | stale | fresh
  const [aiFilter, setAiFilter] = useState('all');        // all | described | undescribed
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // bulk enrichment
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkStatus, setBulkStatus] = useState(() => new Map()); // ousId → { status, error }
  const [bulkSummary, setBulkSummary] = useState(null);          // { total, done, ok, failed }
  const cancelRef = useRef(false);

  // import (catalog sync + materialize-all) — declared before useAutoRefresh so the
  // hook can pause on importBusy without a temporal-dead-zone reference.
  const [importBusy, setImportBusy] = useState(false);
  const [importProgress, setImportProgress] = useState(null); // { phase, total, done, ok, skipped, failed }
  const importCancelRef = useRef(false);

  // Pause the 20s auto-refresh while a bulk run is in flight (avoids churn); the
  // status/selection maps are keyed by ousId so they survive any reload anyway.
  const { loading, error, reload } = useAutoRefresh(async () => {
    setItems(await getSchemas());
  }, (bulkRunning || importBusy) ? 0 : 20000, [bulkRunning, importBusy]);

  const stale = (items || []).filter((s) => s.state === 'stale').length;
  const described = (items || []).filter((s) => s.hasDescription).length;

  const filtered = useMemo(() => {
    let arr = items || [];
    const needle = q.trim().toLowerCase();
    if (needle) arr = arr.filter((s) => [s.ousId, s.serviceId, s.title].some((v) => String(v ?? '').toLowerCase().includes(needle)));
    if (stateFilter !== 'all') arr = arr.filter((s) => (stateFilter === 'stale' ? s.state === 'stale' : s.state !== 'stale'));
    if (aiFilter !== 'all') arr = arr.filter((s) => (aiFilter === 'described' ? s.hasDescription : !s.hasDescription));
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...arr].sort((a, b) => dir * compareBy(a, b, sortBy));
  }, [items, q, stateFilter, aiFilter, sortBy, sortDir]);

  const filteredIds = useMemo(() => filtered.map((s) => s.ousId), [filtered]);
  const paged = useMemo(() => filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage), [filtered, page, rowsPerPage]);

  // Keep the page in range as the filtered set shrinks.
  useEffect(() => { setPage(0); }, [q, stateFilter, aiFilter, rowsPerPage]);

  const selectedInFiltered = filteredIds.filter((id) => selectedIds.has(id)).length;
  const allFilteredSelected = filteredIds.length > 0 && selectedInFiltered === filteredIds.length;
  const someFilteredSelected = selectedInFiltered > 0 && !allFilteredSelected;

  const toggleRow = (id) => setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleSelectAll = () => setSelectedIds((prev) => {
    const n = new Set(prev);
    if (selectedInFiltered > 0) filteredIds.forEach((id) => n.delete(id)); // any selected → Deselect all (filtered)
    else filteredIds.forEach((id) => n.add(id));                           // none → Select all (filtered)
    return n;
  });
  const clearSelection = () => setSelectedIds(new Set());

  const onSort = (col) => { if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); else { setSortBy(col); setSortDir('asc'); } };

  const enrichRow = async (ousId) => {
    setEnrichingId(ousId); setRowMsg(null);
    try {
      const r = await enrichSchema(ousId);
      setRowMsg({ sev: 'success', text: `${r.serviceId}: AI description generated & embedded into intent search (${r.fieldDescriptions?.length || 0} field meanings).` });
      reload();
    } catch (e) { setRowMsg({ sev: 'error', text: e.message }); } finally { setEnrichingId(null); }
  };

  /** Mass-enrich the selected schemas, at most BULK_CONCURRENCY in flight. */
  const runBulk = async () => {
    const ids = [...selectedIds];
    if (!ids.length || bulkRunning) return;
    cancelRef.current = false;
    setRowMsg(null);
    setBulkRunning(true);
    const status = new Map(ids.map((id) => [id, { status: 'queued' }]));
    setBulkStatus(new Map(status));
    let done = 0; let ok = 0; let failed = 0;
    setBulkSummary({ total: ids.length, done, ok, failed });
    const queue = [...ids];
    const worker = async () => {
      while (queue.length) {
        if (cancelRef.current) return;
        const id = queue.shift();
        status.set(id, { status: 'running' }); setBulkStatus(new Map(status));
        try { await enrichSchema(id); status.set(id, { status: 'ok' }); ok += 1; }
        catch (e) { status.set(id, { status: 'error', error: e.message }); failed += 1; }
        done += 1;
        setBulkStatus(new Map(status));
        setBulkSummary({ total: ids.length, done, ok, failed });
      }
    };
    await Promise.all(Array.from({ length: Math.min(BULK_CONCURRENCY, ids.length) }, worker));
    setBulkRunning(false);
    reload();
  };
  const cancelBulk = () => { cancelRef.current = true; };

  const selCount = selectedIds.size;

  // Full import from the Altiora project. Two phases, because the schema list on
  // THIS tab reads materialized ServiceDefs from Memgraph, whereas a catalog sync
  // only refreshes the Qdrant catalog — syncing alone never adds a row here:
  //   1) sync the requestable catalog from live Altiora (POST /catalog/sync);
  //   2) materialize every not-yet-cached service (POST /catalog/:code/materialize),
  //      which is what writes the (:ServiceDef {namespace:'Altiora'}) the list shows.
  // Materialization is browser-orchestrated with the same BULK_CONCURRENCY pool as
  // AI-enrichment; each materialize is a live Altiora round-trip, so it is paced.
  const runImport = async () => {
    if (importBusy || bulkRunning) return;
    importCancelRef.current = false;
    setImportBusy(true); setRowMsg(null);
    setImportProgress({ phase: 'sync' });
    try {
      // Phase 1 — sync the catalog (Qdrant) from live Altiora.
      const sync = await runCatalogSync(false);

      // Phase 2 — materialize services into the schema-graph (Memgraph). Skip the
      // ones already cached so a repeat import is cheap and only fills the gaps.
      const catalog = await getCatalog();
      const targets = (catalog || [])
        .filter((s) => s.materialization?.state !== 'cached')
        .map((s) => s.service_code);
      let done = 0; let ok = 0; let skipped = 0; let failed = 0;
      setImportProgress({ phase: 'materialize', total: targets.length, done, ok, skipped, failed });
      const queue = [...targets];
      const worker = async () => {
        while (queue.length) {
          if (importCancelRef.current) return;
          const code = queue.shift();
          try { const r = await materializeService(code); if (r?.skipped) skipped += 1; else ok += 1; }
          catch (e) { if (/skipped|not in .*catalog/i.test(e.message)) skipped += 1; else failed += 1; }
          done += 1;
          setImportProgress({ phase: 'materialize', total: targets.length, done, ok, skipped, failed });
        }
      };
      await Promise.all(Array.from({ length: Math.min(BULK_CONCURRENCY, targets.length) }, worker));
      setImportProgress((p) => (p ? { ...p, phase: 'done' } : null));
      const stopped = importCancelRef.current;
      setRowMsg({
        sev: failed ? 'warning' : 'success',
        text: `Import ${stopped ? 'stopped' : 'complete'}: catalog synced (fetched ${sync.fetched}, upserted ${sync.upserted}). `
          + `Materialized ${ok}, skipped ${skipped}${failed ? `, failed ${failed}` : ''}`
          + `${targets.length === 0 ? ' — every catalog service was already cached.' : '.'}`,
      });
      reload();
    } catch (e) {
      setImportProgress(null);
      setRowMsg({ sev: 'error', text: `Import failed: ${e.message}` });
    } finally { setImportBusy(false); }
  };
  const cancelImport = () => { importCancelRef.current = true; };

  const [exporting, setExporting] = useState(false);
  const runExport = async () => {
    if (!selCount) return;
    setExporting(true); setRowMsg(null);
    try {
      const r = await exportSchemas([...selectedIds]);
      setRowMsg({ sev: 'success', text: `Exported ${selCount} schema(s) → ${r.filename} (${(r.size / 1024).toFixed(0)} KB): schemas.xlsx + schemas.json.` });
    } catch (e) { setRowMsg({ sev: 'error', text: `Export failed: ${e.message}` }); } finally { setExporting(false); }
  };

  return (
    <Box>
      <Stack direction="row" spacing={1.5} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1.5 }}>
        <Kpi label="Cached schemas" value={items?.length ?? '—'} sub="registry (namespace Altiora)" />
        <Kpi label="Stale" value={stale} color={stale ? 'warning.main' : 'success.main'} sub="needsRefresh flagged" />
        <Kpi label="AI-described" value={described} color={described ? 'success.main' : 'text.primary'} sub="in intent vector store" />
        <SlotDistributionCard items={items} />
      </Stack>

      {/* Toolbar: filter / bulk actions */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap', gap: 1 }}>
        <TextField
          size="small" placeholder="Filter by ousId / service / title…" value={q}
          onChange={(e) => setQ(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search size={15} /></InputAdornment>,
            endAdornment: q ? <InputAdornment position="end"><IconButton size="small" onClick={() => setQ('')}><X size={13} /></IconButton></InputAdornment> : null }}
          sx={{ minWidth: 260 }}
        />
        <ToggleButtonGroup size="small" exclusive value={stateFilter} onChange={(_, v) => v && setStateFilter(v)}>
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="fresh">Fresh</ToggleButton>
          <ToggleButton value="stale">Stale</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup size="small" exclusive value={aiFilter} onChange={(_, v) => v && setAiFilter(v)}>
          <ToggleButton value="all">Any</ToggleButton>
          <ToggleButton value="described">Described</ToggleButton>
          <ToggleButton value="undescribed">No AI</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ flex: 1 }} />
        {!importBusy ? (
          <Tooltip title="Import from the Altiora project: sync the requestable catalog, then materialize every not-yet-cached service into the schema-graph so it appears in this list.">
            <span>
              <Button size="small" variant="outlined" startIcon={<DownloadCloud size={15} />}
                disabled={bulkRunning} onClick={runImport}>
                Import from Altiora
              </Button>
            </span>
          </Tooltip>
        ) : (
          <Button size="small" variant="outlined" color="warning" startIcon={<Ban size={15} />} onClick={cancelImport}>
            Stop import
          </Button>
        )}
        {selCount > 0 && !bulkRunning && (
          <Button size="small" variant="text" color="inherit" onClick={clearSelection}>Clear ({selCount})</Button>
        )}
        <Tooltip title={selCount ? `Export ${selCount} selected schema(s) as a ZIP (xlsx + json)` : 'Select schemas to export'}>
          <span>
            <Button size="small" variant="outlined" startIcon={exporting ? <CircularProgress size={14} /> : <Download size={15} />}
              disabled={selCount === 0 || exporting} onClick={runExport}>
              Export{selCount ? ` (${selCount})` : ''}
            </Button>
          </span>
        </Tooltip>
        {!bulkRunning ? (
          <Tooltip title={selCount ? `Generate AI descriptions for ${selCount} selected, ${BULK_CONCURRENCY} at a time` : 'Select schemas to enable bulk processing'}>
            <span>
              <Button size="small" variant="contained" startIcon={<Sparkles size={15} />} disabled={selCount === 0} onClick={runBulk}>
                Generate for selected{selCount ? ` (${selCount})` : ''}
              </Button>
            </span>
          </Tooltip>
        ) : (
          <Button size="small" variant="outlined" color="warning" startIcon={<Ban size={15} />} onClick={cancelBulk}>
            Stop after in-flight
          </Button>
        )}
      </Stack>

      {/* Import progress (sync + materialize-all) */}
      {importProgress && (
        <Paper variant="outlined" sx={{ p: 1, mb: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
            <DownloadCloud size={14} />
            {importProgress.phase === 'sync' && <Typography variant="body2" fontWeight={600}>Syncing catalog from Altiora…</Typography>}
            {importProgress.phase !== 'sync' && (
              <>
                <Typography variant="body2" fontWeight={600}>
                  {importProgress.phase === 'done' ? 'Import finished' : 'Materializing'} {importProgress.done}/{importProgress.total}
                </Typography>
                <Chip size="small" color="success" variant="outlined" icon={<Check size={12} />} label={`${importProgress.ok} materialized`} />
                {importProgress.skipped > 0 && <Chip size="small" variant="outlined" label={`${importProgress.skipped} skipped`} />}
                {importProgress.failed > 0 && <Chip size="small" color="error" variant="outlined" icon={<AlertCircle size={12} />} label={`${importProgress.failed} failed`} />}
                <Typography variant="caption" color="text.secondary">· up to {BULK_CONCURRENCY} in parallel</Typography>
              </>
            )}
            <Box sx={{ flex: 1 }} />
            {importProgress.phase === 'done' && <IconButton size="small" onClick={() => setImportProgress(null)}><X size={14} /></IconButton>}
          </Stack>
          <LinearProgress
            variant={importProgress.phase === 'sync' || !importProgress.total ? 'indeterminate' : 'determinate'}
            value={importProgress.total ? (importProgress.done / importProgress.total) * 100 : 0}
          />
        </Paper>
      )}

      {/* Bulk progress */}
      {bulkSummary && (
        <Paper variant="outlined" sx={{ p: 1, mb: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
            <Typography variant="body2" fontWeight={600}>
              {bulkRunning ? 'Processing' : 'Finished'} {bulkSummary.done}/{bulkSummary.total}
            </Typography>
            <Chip size="small" color="success" variant="outlined" icon={<Check size={12} />} label={`${bulkSummary.ok} ok`} />
            {bulkSummary.failed > 0 && <Chip size="small" color="error" variant="outlined" icon={<AlertCircle size={12} />} label={`${bulkSummary.failed} failed`} />}
            <Typography variant="caption" color="text.secondary">· up to {BULK_CONCURRENCY} in parallel</Typography>
            <Box sx={{ flex: 1 }} />
            {!bulkRunning && <IconButton size="small" onClick={() => { setBulkSummary(null); setBulkStatus(new Map()); }}><X size={14} /></IconButton>}
          </Stack>
          <LinearProgress variant="determinate" value={bulkSummary.total ? (bulkSummary.done / bulkSummary.total) * 100 : 0} />
        </Paper>
      )}

      {rowMsg && <Alert severity={rowMsg.sev} sx={{ mb: 1 }} onClose={() => setRowMsg(null)}>{rowMsg.text}</Alert>}
      <ErrorNote error={error} onRetry={reload} />

      {loading && !items ? <Loading /> : (
        <Paper variant="outlined">
          <Table size="small" stickyHeader>
            <TableHead><TableRow>
              <TableCell padding="checkbox">
                <Tooltip title={allFilteredSelected ? 'Deselect all' : 'Select all (filtered)'}>
                  <Checkbox
                    size="small"
                    checked={allFilteredSelected}
                    indeterminate={someFilteredSelected}
                    onChange={toggleSelectAll}
                    disabled={filteredIds.length === 0 || bulkRunning}
                  />
                </Tooltip>
              </TableCell>
              {SORT_COLS.map((c) => (
                <TableCell key={c.id} sortDirection={sortBy === c.id ? sortDir : false}>
                  <TableSortLabel active={sortBy === c.id} direction={sortBy === c.id ? sortDir : 'asc'} onClick={() => onSort(c.id)}>
                    {c.label}
                  </TableSortLabel>
                </TableCell>
              ))}
              <TableCell align="right">Actions</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {paged.map((s) => {
                const isSel = selectedIds.has(s.ousId);
                const st = bulkStatus.get(s.ousId);
                return (
                  <TableRow key={s.ousId} hover selected={isSel} sx={{ cursor: 'pointer' }} onClick={() => setDrawerOus(s.ousId)}>
                    <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                      <Checkbox size="small" checked={isSel} onChange={() => toggleRow(s.ousId)} disabled={bulkRunning} />
                    </TableCell>
                    <TableCell><code>{s.ousId}</code></TableCell>
                    <TableCell><code>{s.serviceId}</code></TableCell>
                    <TableCell>{s.title || '—'}</TableCell>
                    <TableCell>{Number.isFinite(Number(s.slotCount)) && s.slotCount > 0
                      ? <Chip size="small" variant="outlined" label={s.slotCount} />
                      : <Typography variant="caption" color="text.disabled">—</Typography>}</TableCell>
                    <TableCell><Chip size="small" variant="outlined" color={s.state === 'stale' ? 'warning' : 'success'} label={s.state} /></TableCell>
                    <TableCell>{s.hasDescription
                      ? <Chip size="small" color="success" variant="outlined" icon={<Check size={12} />} label="described" />
                      : <Typography variant="caption" color="text.disabled">—</Typography>}</TableCell>
                    <TableCell>{s.approvalRequired ? <Chip size="small" color="warning" label="yes" /> : '—'}</TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end">
                        {st && <BulkStatusDot st={st} />}
                        <Tooltip title={s.hasDescription ? 'Re-generate AI description' : 'Generate AI description (improves intent matching)'}>
                          <span><IconButton size="small" color={s.hasDescription ? 'success' : 'primary'} disabled={enrichingId === s.ousId || bulkRunning}
                            onClick={() => enrichRow(s.ousId)}>
                            {enrichingId === s.ousId ? <CircularProgress size={15} /> : <Sparkles size={15} />}
                          </IconButton></span>
                        </Tooltip>
                        <IconButton size="small" onClick={() => setDrawerOus(s.ousId)}><Eye size={14} style={{ opacity: 0.5 }} /></IconButton>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!filtered.length && (
                <TableRow><TableCell colSpan={9}>
                  <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
                    {(items || []).length
                      ? 'No schemas match the current filter.'
                      : 'No materialized schemas — use the Catalog tab to materialize services from Altiora.'}
                  </Typography>
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={filtered.length}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => setRowsPerPage(parseInt(e.target.value, 10))}
            rowsPerPageOptions={[10, 25, 50, 100]}
          />
        </Paper>
      )}
      <SchemaDrawer ousId={drawerOus} onClose={() => setDrawerOus(null)} onChanged={reload} />
    </Box>
  );
}
