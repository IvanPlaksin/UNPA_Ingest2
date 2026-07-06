/**
 * DocumentIndexTab — cross-source local document search (/documents/search).
 *
 * Searches the locally-harvested SourceDocument index (never hits external
 * sources) and shows an indexer status/control panel. Each result exposes the
 * direct download link; the file is not downloaded until the user clicks it.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Stack, Typography, Button, Chip, IconButton, TextField, Paper,
  FormControl, InputLabel, Select, MenuItem, Checkbox, FormControlLabel,
  Table, TableBody, TableCell, TableHead, TableRow, CircularProgress,
  Alert, Tooltip, LinearProgress, Collapse, Divider,
} from '@mui/material';
import {
  Search, Download, ExternalLink, Database, RefreshCw, Play, Pause,
  Square, ChevronDown, ChevronRight, FileText, Layers, Activity,
} from 'lucide-react';
import {
  searchIndex, getIndexFacets, getIndexStats, getIndexerStatus, controlIndexer,
} from '../../../services/documentIndex.service';
import { importDocument } from '../../../services/sourceCatalog.service';

const PAGE_SIZE = 20;
const LANGS = ['', 'EN', 'FR', 'ES', 'AR', 'RU', 'ZH'];

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

// ── Indexer status + control panel ──────────────────────────────

function IndexerPanel({ stats, status, onControl, onRefresh, busy }) {
  const [open, setOpen] = useState(false);
  const state = status?.state || 'IDLE';
  const cur = status?.stats?.current;
  const sources = stats?.sources || [];
  const done = sources.filter(s => s.indexStatus === 'complete').length;

  return (
    <Paper variant="outlined" sx={{ p: 1.25 }}>
      <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap">
        <Database size={16} style={{ opacity: 0.7 }} />
        <Typography variant="subtitle2" fontWeight={700}>Index</Typography>
        <StateChip state={state} />
        <Chip size="small" variant="outlined" label={`${stats?.total ?? 0} docs`} />
        <Chip size="small" variant="outlined" label={`${stats?.enriched ?? 0} enriched`} />
        <Chip size="small" variant="outlined" label={`${done}/${sources.length} sources complete`} />
        {cur && (
          <Typography variant="caption" color="text.secondary">
            indexing <b>{cur.name}</b> (page {cur.page})
          </Typography>
        )}
        <Box flex={1} />
        <Tooltip title="Start"><span><IconButton size="small" disabled={busy || state === 'RUNNING'} onClick={() => onControl('start')}><Play size={15} /></IconButton></span></Tooltip>
        <Tooltip title="Pause"><span><IconButton size="small" disabled={busy || state !== 'RUNNING'} onClick={() => onControl('pause')}><Pause size={15} /></IconButton></span></Tooltip>
        <Tooltip title="Resume"><span><IconButton size="small" disabled={busy || state !== 'PAUSED'} onClick={() => onControl('resume')}><Play size={15} /></IconButton></span></Tooltip>
        <Tooltip title="Stop"><span><IconButton size="small" disabled={busy || state === 'STOPPED' || state === 'IDLE'} onClick={() => onControl('stop')}><Square size={15} /></IconButton></span></Tooltip>
        <Tooltip title="Refresh"><IconButton size="small" onClick={onRefresh}><RefreshCw size={15} /></IconButton></Tooltip>
        <IconButton size="small" onClick={() => setOpen(v => !v)}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</IconButton>
      </Stack>

      <Collapse in={open}>
        <Divider sx={{ my: 1 }} />
        <Box sx={{ maxHeight: 220, overflow: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Source</TableCell>
                <TableCell align="right">Indexed</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sources.map(s => {
                const pct = s.indexTotal ? Math.min(100, Math.round((s.indexed / s.indexTotal) * 100)) : (s.indexStatus === 'complete' ? 100 : 0);
                return (
                  <TableRow key={s.id} hover>
                    <TableCell sx={{ maxWidth: 220 }}><Typography variant="caption" noWrap>{s.name}</Typography></TableCell>
                    <TableCell align="right"><Typography variant="caption">{s.indexed}</Typography></TableCell>
                    <TableCell align="right"><Typography variant="caption" color="text.secondary">{s.indexTotal ?? '—'}</Typography></TableCell>
                    <TableCell sx={{ minWidth: 120 }}>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Chip label={s.indexStatus} size="small" variant="outlined"
                          color={s.indexStatus === 'complete' ? 'success' : s.indexStatus === 'indexing' ? 'info' : 'default'}
                          sx={{ fontSize: '0.6rem', height: 16 }} />
                        {s.indexStatus === 'indexing' && (
                          <Box sx={{ flex: 1, minWidth: 40 }}><LinearProgress variant="determinate" value={pct} sx={{ height: 4, borderRadius: 2 }} /></Box>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      </Collapse>
    </Paper>
  );
}

// ── Main tab ────────────────────────────────────────────────────

export default function DocumentIndexTab({ onDocumentImported }) {
  const [query,     setQuery]     = useState('');
  const [results,   setResults]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [page,      setPage]      = useState(1);

  const [sourceId,  setSourceId]  = useState('');
  const [language,  setLanguage]  = useState('');
  const [hasPdf,    setHasPdf]    = useState(false);
  const [semantic,  setSemantic]  = useState(false);

  const [facets,    setFacets]    = useState({ sources: [], fileTypes: [] });
  const [stats,     setStats]     = useState(null);
  const [status,    setStatus]    = useState(null);
  const [ctlBusy,   setCtlBusy]   = useState(false);
  const [importing, setImporting] = useState({});
  const [lastQuery, setLastQuery] = useState('');

  const timerRef = useRef(null);

  const refreshStatus = useCallback(async () => {
    try {
      const [s, st] = await Promise.all([getIndexStats(), getIndexerStatus()]);
      setStats(s.data); setStatus(st.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    getIndexFacets().then(r => setFacets(r.data)).catch(() => {});
    refreshStatus();
    timerRef.current = setInterval(refreshStatus, 5000);
    return () => clearInterval(timerRef.current);
  }, [refreshStatus]);

  const doSearch = useCallback(async (p = 1) => {
    setLoading(true); setError(null);
    try {
      const resp = await searchIndex({
        q: query.trim(), sourceId: sourceId || undefined, language: language || undefined,
        hasPdf: hasPdf || undefined, semantic: semantic || undefined,
        page: p, limit: PAGE_SIZE,
      });
      setResults(resp); setPage(p); setLastQuery(query.trim());
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
    setLoading(false);
  }, [query, sourceId, language, hasPdf, semantic]);

  const handleControl = async (action) => {
    setCtlBusy(true);
    try { await controlIndexer(action); await refreshStatus(); }
    catch (e) { setError(e.response?.data?.error || e.message); }
    setCtlBusy(false);
  };

  const handleImport = async (doc) => {
    setImporting(m => ({ ...m, [doc.id]: 'importing' }));
    try {
      await importDocument(doc.sourceId, {
        url: doc.url, pdfUrl: doc.pdfUrl || doc.downloadUrl, title: doc.title,
        namespace: 'DEFAULT',
        meta: { symbol: doc.symbol, date: doc.date, languages: doc.languages, description: doc.description },
      });
      setImporting(m => ({ ...m, [doc.id]: 'done' }));
      onDocumentImported?.();
    } catch {
      setImporting(m => ({ ...m, [doc.id]: 'error' }));
    }
  };

  const totalPages = results ? Math.ceil((results.total || 0) / PAGE_SIZE) || 1 : 1;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1.5, overflow: 'hidden' }}>

      <IndexerPanel stats={stats} status={status} onControl={handleControl} onRefresh={refreshStatus} busy={ctlBusy} />

      {/* ── Search bar ── */}
      <Stack component="form" onSubmit={e => { e.preventDefault(); doSearch(1); }}
        direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search all sources by name, symbol, subject…" size="small" sx={{ flex: 1, minWidth: 240 }}
          InputProps={{ startAdornment: <Search size={16} style={{ marginRight: 6, opacity: 0.5 }} /> }} />
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel>Source</InputLabel>
          <Select value={sourceId} label="Source" onChange={e => setSourceId(e.target.value)}>
            <MenuItem value=""><em>All sources</em></MenuItem>
            {facets.sources.map(s => <MenuItem key={s.id} value={s.id}>{s.name} ({s.count})</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 110 }}>
          <InputLabel>Language</InputLabel>
          <Select value={language} label="Language" onChange={e => setLanguage(e.target.value)}>
            {LANGS.map(l => <MenuItem key={l} value={l}>{l || 'Any'}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControlLabel control={<Checkbox size="small" checked={hasPdf} onChange={e => setHasPdf(e.target.checked)} />}
          label={<Typography variant="caption">Has file</Typography>} />
        <Tooltip title="Semantic (meaning-based) search — requires the semantic index">
          <FormControlLabel control={<Checkbox size="small" checked={semantic} onChange={e => setSemantic(e.target.checked)} />}
            label={<Typography variant="caption">Semantic</Typography>} />
        </Tooltip>
        <Button type="submit" variant="contained" size="small" disabled={loading}
          startIcon={loading ? <CircularProgress size={14} /> : <Search size={15} />}>Search</Button>
      </Stack>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      {/* ── Results ── */}
      <Box sx={{ flex: 1, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
        {!results && !loading && (
          <Stack alignItems="center" justifyContent="center" sx={{ height: 240, color: 'text.secondary', gap: 1 }}>
            <Layers size={40} style={{ opacity: 0.2 }} />
            <Typography variant="body2">Search indexed documents across all sources</Typography>
            <Typography variant="caption" color="text.disabled">Results come from the local index — no external calls</Typography>
          </Stack>
        )}
        {results && (
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Document</TableCell>
                <TableCell width={150}>Source</TableCell>
                <TableCell width={90} align="center">Date</TableCell>
                <TableCell width={110} align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {results.results.length === 0 ? (
                <TableRow><TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>No documents found</TableCell></TableRow>
              ) : results.results.map(doc => {
                const st = importing[doc.id];
                return (
                  <TableRow key={doc.id} hover sx={{ verticalAlign: 'top' }}>
                    <TableCell sx={{ py: 0.75 }}>
                      <Stack direction="row" spacing={0.5} alignItems="flex-start">
                        {doc.pdfUrl && <FileText size={13} style={{ marginTop: 2, color: '#ef4444', flexShrink: 0 }} />}
                        <Box minWidth={0}>
                          <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3, wordBreak: 'break-word' }}>{doc.title}</Typography>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.3, flexWrap: 'wrap' }}>
                            {doc.symbol && <Typography variant="caption" color="text.disabled" sx={{ fontFamily: 'monospace', fontSize: '0.65rem' }}>{doc.symbol}</Typography>}
                            {doc.languages?.slice(0, 4).map(l => <Chip key={l} label={l} size="small" sx={{ fontSize: '0.55rem', height: 14 }} />)}
                            {doc.enrichStatus && doc.enrichStatus !== 'none' && (
                              <Chip label={doc.enrichStatus} size="small" color="success" variant="outlined" sx={{ fontSize: '0.55rem', height: 14 }} />
                            )}
                          </Stack>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ py: 0.75 }}><Typography variant="caption" color="text.secondary">{doc.sourceName}</Typography></TableCell>
                    <TableCell align="center" sx={{ py: 0.75 }}>
                      <Typography variant="caption" color="text.secondary">
                        {doc.date ? (() => { try { return new Date(doc.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return doc.date; } })() : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ py: 0.75 }}>
                      <Stack direction="row" spacing={0.25} justifyContent="flex-end">
                        <Tooltip title={doc.downloadUrl ? 'Open direct download link' : 'No link'}>
                          <span><IconButton size="small" component="a" href={doc.downloadUrl || '#'} target="_blank" rel="noopener" disabled={!doc.downloadUrl}><Download size={15} /></IconButton></span>
                        </Tooltip>
                        <Tooltip title="Open source record page">
                          <span><IconButton size="small" component="a" href={doc.url || '#'} target="_blank" rel="noopener" disabled={!doc.url}><ExternalLink size={14} /></IconButton></span>
                        </Tooltip>
                        <Tooltip title={st === 'done' ? 'Imported' : 'Import into Documents'}>
                          <span><IconButton size="small" disabled={st === 'importing' || st === 'done'} onClick={() => handleImport(doc)}>
                            {st === 'importing' ? <CircularProgress size={13} /> : <FileText size={14} color={st === 'done' ? '#22c55e' : undefined} />}
                          </IconButton></span>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Box>

      {/* ── Footer / pagination ── */}
      {results && results.total > 0 && (
        <Stack direction="row" alignItems="center" justifyContent="center" spacing={1}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
            {results.total} results{results.mode ? ` · ${results.mode}` : ''}
          </Typography>
          {!semantic && totalPages > 1 && (
            <>
              <Button size="small" variant="outlined" disabled={page <= 1 || loading} onClick={() => doSearch(page - 1)}>‹ Prev</Button>
              <Typography variant="caption" sx={{ minWidth: 110, textAlign: 'center' }}>Page {page} / {totalPages}</Typography>
              <Button size="small" variant="outlined" disabled={page >= totalPages || loading} onClick={() => doSearch(page + 1)}>Next ›</Button>
            </>
          )}
        </Stack>
      )}
    </Box>
  );
}
