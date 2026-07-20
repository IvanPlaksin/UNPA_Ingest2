/**
 * Catalog — the mirrored Altiora service catalog: usage + materialization state,
 * sync-now action + run history, intent-resolution diagnostics, provider drill-in.
 */
import React, { useState } from 'react';
import {
  Box, Paper, Stack, Table, TableHead, TableRow, TableCell, TableBody,
  Typography, Chip, Button, TextField, InputAdornment, Dialog, DialogTitle,
  DialogContent, Alert, Tooltip, CircularProgress, FormControlLabel, Checkbox,
} from '@mui/material';
import { Search, RefreshCcw, Hammer, TestTubeDiagonal } from 'lucide-react';
import {
  getCatalog, runCatalogSync, getCatalogSyncRuns, materializeService,
  getCatalogProviders, resolveIntent,
} from '../api/adminClient';
import { Loading, ErrorNote, useAutoRefresh, fmtTs, Kpi } from '../components/common';

const MAT_META = { cached: ['success', 'cached'], stale: ['warning', 'stale'], never: ['default', 'not materialized'] };

function IntentProbe() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const run = async () => {
    if (q.trim().length < 2) return;
    setBusy(true); setErr(null);
    try { setHits(await resolveIntent(q.trim())); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}><TestTubeDiagonal size={14} style={{ verticalAlign: -2 }} /> Intent-resolution probe</Typography>
      <Stack direction="row" spacing={1}>
        <TextField size="small" fullWidth placeholder='Try a user phrase, e.g. "I need to initiate the separation process"'
          value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment> }} />
        <Button variant="contained" size="small" onClick={run} disabled={busy || q.trim().length < 2}>
          {busy ? <CircularProgress size={16} /> : 'Resolve'}
        </Button>
      </Stack>
      <ErrorNote error={err} />
      {hits && (
        <Table size="small" sx={{ mt: 1 }}>
          <TableHead><TableRow><TableCell>Type</TableCell><TableCell>Result</TableCell><TableCell align="right">Score / confidence</TableCell></TableRow></TableHead>
          <TableBody>
            {hits.map((h, i) => (
              <TableRow key={i}>
                <TableCell><Chip size="small" variant="outlined" label={h.type} /></TableCell>
                <TableCell>{h.serviceId ? <code>{h.serviceId}</code> : null} {h.title || h.summary || ''}</TableCell>
                <TableCell align="right">{h.score != null ? Number(h.score).toFixed(3) : (h.confidence || '—')}</TableCell>
              </TableRow>
            ))}
            {!hits.length && <TableRow><TableCell colSpan={3}><Typography variant="caption" color="text.secondary">no candidates</Typography></TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
    </Paper>
  );
}

function ProvidersDialog({ code, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  React.useEffect(() => {
    if (!code) return;
    setData(null); setErr(null);
    getCatalogProviders(code).then(setData).catch(setErr);
  }, [code]);
  return (
    <Dialog open={!!code} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Providers — {code}</DialogTitle>
      <DialogContent>
        <ErrorNote error={err} />
        {!data && !err && <Loading />}
        {data && (
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>ousId</TableCell><TableCell>Provider</TableCell><TableCell>Location scope</TableCell>
              <TableCell align="right">Our score</TableCell><TableCell align="right">Altiora score</TableCell><TableCell>Focal point</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {data.providers.map((p, i) => (
                <TableRow key={p.organizationUnitServiceId} sx={i === 0 ? { bgcolor: 'action.selected' } : undefined}>
                  <TableCell><code>{p.organizationUnitServiceId}</code>{i === 0 && <Chip size="small" color="primary" label="chosen" sx={{ ml: 1 }} />}</TableCell>
                  <TableCell>{p.providerName}</TableCell>
                  <TableCell>{p.matchedLocationScope || 'all'}</TableCell>
                  <TableCell align="right">{p.score}</TableCell>
                  <TableCell align="right"><Tooltip title="Altiora MatchScore is unreliable (inverted specificity) — our re-ranking wins"><span>{p.altioraMatchScore}</span></Tooltip></TableCell>
                  <TableCell>{p.focalPoint?.name || '—'}</TableCell>
                </TableRow>
              ))}
              {!data.providers.length && <TableRow><TableCell colSpan={6}>No distribution — service not offered by any org unit.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function CatalogTab() {
  const [items, setItems] = useState(null);
  const [runs, setRuns] = useState([]);
  const [filter, setFilter] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [purge, setPurge] = useState(false);
  const [msg, setMsg] = useState(null);
  const [provCode, setProvCode] = useState(null);
  const [matBusy, setMatBusy] = useState({});

  const { loading, error, reload } = useAutoRefresh(async () => {
    const [cat, r] = await Promise.all([getCatalog(), getCatalogSyncRuns().catch(() => [])]);
    setItems(cat); setRuns(r || []);
  }, 30000, []);

  const doSync = async () => {
    setSyncBusy(true); setMsg(null);
    try {
      const run = await runCatalogSync(purge);
      setMsg({ sev: 'success', text: `Synced: fetched ${run.fetched}, upserted ${run.upserted}, purged ${run.purged ?? 0}` });
      reload();
    } catch (e) { setMsg({ sev: 'error', text: e.message }); } finally { setSyncBusy(false); }
  };

  const doMaterialize = async (code) => {
    setMatBusy((m) => ({ ...m, [code]: true })); setMsg(null);
    try {
      const r = await materializeService(code);
      setMsg({ sev: 'success', text: `Materialized ${code}: ous=${r.ousId}, slots=${r.slots}${r.warnings?.length ? `, ⚠ ${r.warnings.length} warnings` : ''}` });
      reload();
    } catch (e) { setMsg({ sev: 'error', text: `${code}: ${e.message}` }); }
    finally { setMatBusy((m) => ({ ...m, [code]: false })); }
  };

  const list = (items || []).filter((s) => !filter
    || s.service_code.toLowerCase().includes(filter.toLowerCase())
    || (s.service_name || '').toLowerCase().includes(filter.toLowerCase()));
  const materialized = (items || []).filter((s) => s.materialization.state !== 'never').length;

  return (
    <Box>
      <IntentProbe />
      <Stack direction="row" spacing={1.5} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1.5, alignItems: 'stretch' }}>
        <Kpi label="Services" value={items?.length ?? '—'} sub="source: altiora" />
        <Kpi label="Materialized" value={`${materialized}/${items?.length ?? 0}`} />
        <Paper variant="outlined" sx={{ p: 1.5, flex: '2 1 300px' }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Button size="small" variant="contained" startIcon={syncBusy ? <CircularProgress size={14} /> : <RefreshCcw size={14} />}
              disabled={syncBusy} onClick={doSync}>Sync catalog now</Button>
            <FormControlLabel control={<Checkbox size="small" checked={purge} onChange={(e) => setPurge(e.target.checked)} />}
              label={<Typography variant="caption">purge stale (non-altiora) points</Typography>} />
            {runs[0] && <Typography variant="caption" color="text.secondary">
              last run: {fmtTs(runs[0].startedAt)} — {runs[0].error ? `error: ${runs[0].error}` : `fetched ${runs[0].fetched}, upserted ${runs[0].upserted}`}
            </Typography>}
          </Stack>
        </Paper>
      </Stack>
      {msg && <Alert severity={msg.sev} onClose={() => setMsg(null)} sx={{ mb: 1 }}>{msg.text}</Alert>}
      <ErrorNote error={error} onRetry={reload} />

      <Paper variant="outlined" sx={{ mb: 1.5 }}>
        <Box sx={{ p: 1 }}>
          <TextField size="small" placeholder="Filter by code or name…" value={filter} onChange={(e) => setFilter(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment> }} />
        </Box>
        {loading && !items ? <Loading /> : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>Code</TableCell><TableCell>Name</TableCell><TableCell>Domain</TableCell>
                <TableCell>Approval</TableCell><TableCell>Form</TableCell>
                <TableCell align="right">Sessions</TableCell><TableCell align="right">Negative</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {list.map((s) => {
                  const [color, label] = MAT_META[s.materialization.state] || MAT_META.never;
                  return (
                    <TableRow key={s.service_code} hover>
                      <TableCell><code>{s.service_code}</code></TableCell>
                      <TableCell>{s.service_name}</TableCell>
                      <TableCell>{s.domain_code}</TableCell>
                      <TableCell>{s.approval_required ? <Chip size="small" color="warning" label="required" /> : '—'}</TableCell>
                      <TableCell><Chip size="small" color={color} variant="outlined" label={label} />
                        {s.materialization.ousId != null && <Typography variant="caption" sx={{ ml: 0.5 }}>ous {s.materialization.ousId}</Typography>}</TableCell>
                      <TableCell align="right">{s.usage.sessions}</TableCell>
                      <TableCell align="right">{s.usage.negative ? <Chip size="small" color="error" label={s.usage.negative} /> : 0}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5}>
                          <Button size="small" variant="text" onClick={() => setProvCode(s.service_code)}>providers</Button>
                          <Button size="small" variant="text" startIcon={matBusy[s.service_code] ? <CircularProgress size={12} /> : <Hammer size={12} />}
                            disabled={!!matBusy[s.service_code]} onClick={() => doMaterialize(s.service_code)}>
                            {s.materialization.state === 'never' ? 'materialize' : 're-materialize'}
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!list.length && <TableRow><TableCell colSpan={8}><Typography variant="caption" color="text.secondary" sx={{ p: 1 }}>Catalog empty — run "Sync catalog now" (requires live Altiora).</Typography></TableCell></TableRow>}
              </TableBody>
            </Table>
          </Box>
        )}
      </Paper>

      {runs.length > 0 && (
        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Sync run history</Typography>
          <Table size="small">
            <TableHead><TableRow><TableCell>Started</TableCell><TableCell>Trigger</TableCell><TableCell align="right">Fetched</TableCell><TableCell align="right">Upserted</TableCell><TableCell align="right">Purged</TableCell><TableCell>Error</TableCell></TableRow></TableHead>
            <TableBody>
              {runs.map((r, i) => (
                <TableRow key={i}>
                  <TableCell><Typography variant="caption">{fmtTs(r.startedAt)}</Typography></TableCell>
                  <TableCell>{r.trigger}</TableCell>
                  <TableCell align="right">{r.fetched ?? '—'}</TableCell>
                  <TableCell align="right">{r.upserted ?? '—'}</TableCell>
                  <TableCell align="right">{r.purged ?? '—'}</TableCell>
                  <TableCell>{r.error ? <Chip size="small" color="error" label={r.error.slice(0, 60)} /> : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
      <ProvidersDialog code={provCode} onClose={() => setProvCode(null)} />
    </Box>
  );
}
