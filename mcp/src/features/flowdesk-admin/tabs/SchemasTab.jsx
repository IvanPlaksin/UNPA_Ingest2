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
  TextField, InputAdornment, LinearProgress, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import { X, RefreshCcw, Trash2, Eye, Sparkles, Check, Search, Ban, AlertCircle, Download } from 'lucide-react';
import { getSchemas, getSchemaDetail, invalidateSchema, rematerializeSchema, enrichSchema, exportSchemas } from '../api/adminClient';
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
  { id: 'state', label: 'State' },
  { id: 'hasDescription', label: 'AI desc', bool: true },
  { id: 'approvalRequired', label: 'Approval', bool: true },
];

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

  // Pause the 20s auto-refresh while a bulk run is in flight (avoids churn); the
  // status/selection maps are keyed by ousId so they survive any reload anyway.
  const { loading, error, reload } = useAutoRefresh(async () => {
    setItems(await getSchemas());
  }, bulkRunning ? 0 : 20000, [bulkRunning]);

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
                <TableRow><TableCell colSpan={8}>
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
