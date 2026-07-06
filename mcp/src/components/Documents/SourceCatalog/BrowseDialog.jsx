/**
 * BrowseDialog
 * Search an external source for documents and import selected ones.
 * Features: rich row display, complete metadata panel, pagination, background enrichment.
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Typography, Stack, Chip, IconButton,
  Table, TableBody, TableCell, TableHead, TableRow, Collapse,
  CircularProgress, Alert, Checkbox, Divider, Paper, Box,
  Tooltip, Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import {
  X, Search, Download, Globe, FileText,
  CheckCircle, AlertCircle, ChevronDown, ChevronRight,
  ExternalLink, Languages, Calendar, Hash, DatabaseZap,
  BookOpen, Tag, Building2, FileArchive, StickyNote, FolderOpen,
  Link2, Info, SlidersHorizontal, Ban, List
} from 'lucide-react';
import { browseSource, importDocument, startEnrich } from '../../../services/sourceCatalog.service';
import EnrichProgressModal from './EnrichProgressModal';
import SourceDocumentCardDialog from './SourceDocumentCardDialog';

const NAMESPACES = ['DEFAULT', 'INEED', 'KM', 'HR', 'FINANCE', 'PROCUREMENT', 'LEGAL', 'IT', 'AUDIT'];
const PAGE_SIZES = [10, 20, 50];

function ImportStatus({ status }) {
  if (status === 'importing') return <CircularProgress size={14} />;
  if (status === 'done')      return <CheckCircle size={16} color="#22c55e" />;
  if (status === 'error')     return <AlertCircle size={16} color="#ef4444" />;
  return null;
}

function LangChips({ languages, compact = false }) {
  if (!languages?.length) return null;
  return (
    <Stack direction="row" spacing={0.4} flexWrap="wrap">
      {languages.map(l => (
        <Chip key={l} label={l} size="small"
          sx={{ fontSize: '0.58rem', height: compact ? 14 : 16,
               bgcolor: l === 'EN' ? 'primary.main' : 'action.hover',
               color:   l === 'EN' ? 'primary.contrastText' : 'text.primary' }} />
      ))}
    </Stack>
  );
}

// ── Capabilities ────────────────────────────────────────────────

const CAP_LABELS = {
  search: 'Search', browseAll: 'Browse all', paginate: 'Pagination', filter: 'Filters',
  sort: 'Sort', download: 'Download', enrich: 'Metadata', fulltext: 'Full-text',
};

function CapabilityBar({ caps }) {
  const list = caps?.capabilities || [];
  if (!list.length) return null;
  return (
    <Stack direction="row" spacing={0.5} flexWrap="wrap" alignItems="center">
      {Object.keys(CAP_LABELS).map(c => {
        const on = list.includes(c);
        return (
          <Chip key={c} label={CAP_LABELS[c]} size="small"
            variant={on ? 'filled' : 'outlined'}
            color={on ? 'success' : 'default'}
            icon={on ? undefined : <Ban size={10} />}
            sx={{ fontSize: '0.58rem', height: 18,
                  opacity: on ? 1 : 0.4,
                  '& .MuiChip-icon': { ml: 0.5 } }} />
        );
      })}
    </Stack>
  );
}

// ── Dynamic filter panel (driven by the source's filterSchema) ──

function FilterField({ schema, value, onChange }) {
  const { type, label, options } = schema;
  const lbl = label || type;

  if (type === 'dateFrom' || type === 'dateTo') {
    return (
      <TextField type="date" size="small" label={lbl} value={value || ''}
        onChange={e => onChange(type, e.target.value)}
        InputLabelProps={{ shrink: true }} sx={{ minWidth: 150 }} />
    );
  }
  if (type === 'year' || type === 'yearFrom' || type === 'yearTo') {
    return (
      <TextField type="number" size="small" label={lbl} value={value || ''}
        onChange={e => onChange(type, e.target.value)}
        sx={{ minWidth: 110 }} inputProps={{ min: 1945, max: 2100 }} />
    );
  }
  if (Array.isArray(options) && options.length) {
    return (
      <FormControl size="small" sx={{ minWidth: 160 }}>
        <InputLabel>{lbl}</InputLabel>
        <Select label={lbl} value={value || ''} onChange={e => onChange(type, e.target.value)}>
          <MenuItem value=""><em>Any</em></MenuItem>
          {options.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
        </Select>
      </FormControl>
    );
  }
  return (
    <TextField size="small" label={lbl} value={value || ''}
      onChange={e => onChange(type, e.target.value)} sx={{ minWidth: 150 }} />
  );
}

function FilterPanel({ schema, filters, onChange, onClear, open }) {
  if (!open || !schema?.length) return null;
  const active = Object.values(filters).filter(v => v !== '' && v != null).length;
  return (
    <Paper variant="outlined" sx={{ p: 1.25, bgcolor: 'action.hover', borderRadius: 1 }}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mr: 0.5 }}>
          <SlidersHorizontal size={14} style={{ opacity: 0.6 }} />
          <Typography variant="caption" fontWeight={700}>Filters</Typography>
        </Stack>
        {schema.map(s => (
          <FilterField key={s.type} schema={s} value={filters[s.type]} onChange={onChange} />
        ))}
        {active > 0 && (
          <Button size="small" onClick={onClear} sx={{ fontSize: '0.7rem' }}>Clear ({active})</Button>
        )}
      </Stack>
    </Paper>
  );
}

// ── Row header — visible without expanding ──────────────────────

function DocRowHeader({ item }) {
  return (
    <Box minWidth={0}>
      {/* Title */}
      <Stack direction="row" spacing={0.5} alignItems="flex-start">
        {item.pdfUrl && (
          <Tooltip title="English PDF available">
            <Box sx={{ color: 'error.main', mt: '1px', flexShrink: 0 }}>
              <FileText size={13} />
            </Box>
          </Tooltip>
        )}
        <Typography variant="body2" fontWeight={600} title={item.title}
          sx={{ lineHeight: 1.3, wordBreak: 'break-word', flex: 1 }}>
          {item.title}
        </Typography>
      </Stack>

      {/* Description preview */}
      {item.description && (
        <Typography variant="caption" color="text.secondary"
          sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                overflow: 'hidden', lineHeight: 1.4, mt: 0.3 }}>
          {item.description}
        </Typography>
      )}

      {/* Symbol + languages inline */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.4, flexWrap: 'wrap' }}>
        {item.symbol && (
          <Typography variant="caption" color="text.disabled"
            sx={{ fontFamily: 'monospace', fontSize: '0.65rem' }}>
            {item.symbol}
          </Typography>
        )}
        <LangChips languages={item.languages} compact />
      </Stack>
    </Box>
  );
}

// ── Full metadata panel — shown when row is expanded ────────────

function MetadataPanel({ item, open }) {
  if (!open) return null;
  const files = item.metadata?.files || [];

  const InfoRow = ({ icon: Icon, label, children }) => (
    <Stack direction="row" spacing={0.75} alignItems="flex-start">
      <Box sx={{ mt: '2px', flexShrink: 0, opacity: 0.55 }}><Icon size={13} /></Box>
      <Box flex={1} minWidth={0}>
        <Typography variant="caption" fontWeight={700} color="text.secondary"
          sx={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </Typography>
        <Box sx={{ mt: 0.2 }}>{children}</Box>
      </Box>
    </Stack>
  );

  const TextField_ = ({ value }) => (
    <Typography variant="caption" color="text.primary" sx={{ display: 'block', lineHeight: 1.5 }}>
      {value}
    </Typography>
  );

  const ChipList = ({ values, color }) => (
    <Stack direction="row" spacing={0.4} flexWrap="wrap">
      {values.map((v, i) => (
        <Chip key={i} label={v} size="small"
          sx={{ fontSize: '0.6rem', height: 18, bgcolor: color || 'action.selected',
               color: color ? '#fff' : 'text.primary' }} />
      ))}
    </Stack>
  );

  const UrlRow = ({ href, label }) => (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.62rem',
        color: 'text.secondary', wordBreak: 'break-all', flex: 1 }}>
        {href}
      </Typography>
      <IconButton size="small" component="a" href={href} target="_blank" rel="noopener"
        sx={{ p: 0.25, flexShrink: 0 }}>
        <ExternalLink size={11} />
      </IconButton>
    </Stack>
  );

  return (
    <TableRow>
      <TableCell colSpan={6} sx={{ p: 0, border: 0 }}>
        <Collapse in={open} timeout="auto" unmountOnExit>
          <Paper variant="outlined"
            sx={{ m: 1, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Stack spacing={1.25}>

              {/* ── Row 1: key identifiers ── */}
              <Stack direction="row" spacing={3} flexWrap="wrap" alignItems="flex-start">
                {item.symbol && (
                  <InfoRow icon={Hash} label="Symbol">
                    <Typography variant="caption"
                      sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.75rem' }}>
                      {item.symbol}
                    </Typography>
                  </InfoRow>
                )}
                {item.date && (
                  <InfoRow icon={Calendar} label="Date">
                    <Typography variant="caption">
                      {(() => { try { return new Date(item.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); } catch { return item.date; } })()}
                    </Typography>
                  </InfoRow>
                )}
                {item.fileType && (
                  <InfoRow icon={FileArchive} label="Format">
                    <Chip label={(item.fileType || 'html').toUpperCase()} size="small" color="default"
                      variant="outlined" sx={{ fontSize: '0.6rem', height: 18 }} />
                  </InfoRow>
                )}
                {item.languages?.length > 0 && (
                  <InfoRow icon={Languages} label="Languages">
                    <LangChips languages={item.languages} />
                  </InfoRow>
                )}
              </Stack>

              {item.symbol && <Divider />}

              {/* ── Abstract (enriched) ── */}
              {item.abstract && (
                <InfoRow icon={BookOpen} label="Abstract">
                  <Typography variant="caption" color="text.primary"
                    sx={{ display: 'block', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {item.abstract}
                  </Typography>
                </InfoRow>
              )}

              {/* ── Description (fallback) ── */}
              {!item.abstract && item.description && (
                <InfoRow icon={FileText} label="Description">
                  <TextField_ value={item.description} />
                </InfoRow>
              )}

              {/* ── Subjects ── */}
              {item.subjects?.length > 0 && (
                <InfoRow icon={Tag} label="Subjects">
                  <ChipList values={item.subjects} color="#1d4ed8" />
                </InfoRow>
              )}

              {/* ── Bodies / Committees ── */}
              {item.bodies?.length > 0 && (
                <InfoRow icon={Building2} label="Bodies">
                  <ChipList values={item.bodies} color="#7c3aed" />
                </InfoRow>
              )}

              {/* ── Report / Document Numbers ── */}
              {item.reportNumbers?.length > 0 && (
                <InfoRow icon={Hash} label="Report Numbers">
                  <ChipList values={item.reportNumbers} />
                </InfoRow>
              )}

              {/* ── Notes ── */}
              {item.notes?.length > 0 && (
                <InfoRow icon={StickyNote} label="Notes">
                  <Stack spacing={0.3}>
                    {item.notes.map((n, i) => <TextField_ key={i} value={n} />)}
                  </Stack>
                </InfoRow>
              )}

              {/* ── Collections ── */}
              {item.collections?.length > 0 && (
                <InfoRow icon={FolderOpen} label="Collections">
                  <ChipList values={item.collections} />
                </InfoRow>
              )}

              <Divider />

              {/* ── URLs ── */}
              {item.url && (
                <InfoRow icon={Globe} label="Record Page">
                  <UrlRow href={item.url} />
                </InfoRow>
              )}
              {item.pdfUrl && (
                <InfoRow icon={FileText} label="English PDF">
                  <UrlRow href={item.pdfUrl} />
                </InfoRow>
              )}

              {/* ── Files ── */}
              {files.length > 0 && (
                <InfoRow icon={Link2} label={`Files (${files.length})`}>
                  <Stack spacing={0.3}>
                    {files.map((f, i) => {
                      const name  = f.full_name || f.name || '';
                      const isEn  = name.toUpperCase().includes('-EN.');
                      const href  = item.metadata?.recid
                        ? `https://digitallibrary.un.org/record/${item.metadata.recid}/files/${encodeURIComponent(name)}`
                        : null;
                      return (
                        <Stack key={i} direction="row" spacing={0.5} alignItems="center">
                          <Typography variant="caption"
                            sx={{ fontFamily: 'monospace', fontSize: '0.62rem',
                                 color: isEn ? 'error.light' : 'text.secondary',
                                 fontWeight: isEn ? 700 : 400 }}>
                            {name}
                          </Typography>
                          {href && (
                            <IconButton size="small" component="a" href={href} target="_blank"
                              rel="noopener" sx={{ p: 0.15 }}>
                              <ExternalLink size={10} />
                            </IconButton>
                          )}
                        </Stack>
                      );
                    })}
                  </Stack>
                </InfoRow>
              )}

              {/* ── Enrich status ── */}
              {item.enrichStatus && item.enrichStatus !== 'none' && (
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <Chip label={`enriched: ${item.enrichStatus}`} size="small"
                    color={item.enrichStatus === 'full' ? 'success' : 'warning'}
                    variant="outlined" sx={{ fontSize: '0.58rem', height: 16 }} />
                  {item.enrichedAt && (
                    <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem' }}>
                      {new Date(item.enrichedAt).toLocaleString()}
                    </Typography>
                  )}
                </Stack>
              )}

            </Stack>
          </Paper>
        </Collapse>
      </TableCell>
    </TableRow>
  );
}

// ── Main dialog ────────────────────────────────────────────────

export default function BrowseDialog({ open, source, onClose, onImported }) {
  const [query,        setQuery]        = useState('');
  const [results,      setResults]      = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [selected,     setSelected]     = useState(new Set());
  const [importNs,     setImportNs]     = useState('DEFAULT');
  const [statuses,     setStatuses]     = useState({});
  const [bulkImporting, setBulkImporting] = useState(false);

  const [page,         setPage]         = useState(1);
  const [pageSize,     setPageSize]     = useState(20);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [lastQuery,    setLastQuery]    = useState('');
  const [filters,      setFilters]      = useState({});
  const [showFilters,  setShowFilters]  = useState(false);

  // Capability descriptor: from the last browse response, else from the source.
  const caps         = results?.capabilities || source?.capabilities || {};
  const capList      = caps.capabilities || [];
  const filterSchema = caps.filterSchema || [];
  const canSearch    = capList.includes('search');
  const canFilter    = capList.includes('filter') && filterSchema.length > 0;
  const canEnrich    = capList.includes('enrich');

  const [enrichJobId,  setEnrichJobId]  = useState(null);
  const [enrichItems,  setEnrichItems]  = useState([]);
  const [enriching,    setEnriching]    = useState(false);

  const [cardItem,     setCardItem]     = useState(null);

  const doSearch = useCallback(async (searchQuery, searchPage, searchLimit) => {
    if (!source) return;
    setLoading(true); setError(null); setSelected(new Set()); setStatuses({}); setExpandedRows(new Set());
    try {
      // Only send filters the source can actually apply.
      const activeFilters = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== '' && v != null)
      );
      const resp = await browseSource(source.id, {
        query: searchQuery.trim(), page: searchPage, limit: searchLimit,
        ...(Object.keys(activeFilters).length ? { filters: activeFilters } : {}),
      });
      setResults(resp.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setLoading(false);
  }, [source, filters]);

  const handleSearch = useCallback(async (e) => {
    e?.preventDefault();
    setPage(1);
    setLastQuery(query.trim());
    await doSearch(query.trim(), 1, pageSize);
  }, [query, pageSize, doSearch]);

  const handlePageChange = useCallback(async (newPage) => {
    setPage(newPage);
    await doSearch(lastQuery, newPage, pageSize);
  }, [lastQuery, pageSize, doSearch]);

  const handlePageSizeChange = useCallback(async (newSize) => {
    setPageSize(newSize);
    setPage(1);
    await doSearch(lastQuery, 1, newSize);
  }, [lastQuery, doSearch]);

  const handleFilterChange = (type, value) =>
    setFilters(prev => ({ ...prev, [type]: value }));
  const handleClearFilters = () => setFilters({});

  // Reset transient state when switching sources.
  useEffect(() => {
    setFilters({}); setShowFilters(false); setResults(null);
    setQuery(''); setLastQuery(''); setPage(1); setSelected(new Set());
  }, [source?.id]);

  const toggleSelect = (id) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleAll = () => {
    const ids = (results?.results || []).map(r => r.id);
    setSelected(selected.size === ids.length ? new Set() : new Set(ids));
  };

  const toggleExpand = (id) =>
    setExpandedRows(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleImportOne = async (item) => {
    setStatuses(s => ({ ...s, [item.id]: 'importing' }));
    try {
      await importDocument(source.id, {
        url: item.url, pdfUrl: item.pdfUrl, title: item.title, namespace: importNs,
        meta: { symbol: item.symbol, date: item.date, languages: item.languages,
                description: item.description, ...(item.metadata || {}) },
      });
      setStatuses(s => ({ ...s, [item.id]: 'done' }));
      onImported?.();
    } catch {
      setStatuses(s => ({ ...s, [item.id]: 'error' }));
    }
  };

  const handleImportSelected = async () => {
    const items = (results?.results || []).filter(r => selected.has(r.id));
    if (!items.length) return;
    setBulkImporting(true);
    for (const item of items) {
      if (statuses[item.id] === 'done') continue;
      await handleImportOne(item);
    }
    setBulkImporting(false);
    onImported?.();
  };

  const handleFetchMetadata = async () => {
    const items = (results?.results || []).filter(r => selected.has(r.id));
    if (!items.length) return;
    setEnriching(true);
    try {
      const resp = await startEnrich(source.id, items);
      setEnrichItems(items);
      setEnrichJobId(resp.jobId);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setEnriching(false);
  };

  const allResults = results?.results || [];
  const totalItems = results?.total   || 0;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const doneCount  = Object.values(statuses).filter(s => s === 'done').length;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth
      PaperProps={{ sx: { borderRadius: 2, height: '94vh' } }}>

      {/* ── Title ── */}
      <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', pb: 1 }}>
        <Stack spacing={0.75} sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Globe size={18} />
            <Typography variant="subtitle1" fontWeight={700} noWrap>Browse: {source?.name}</Typography>
            <Chip label={source?.type?.replace('_', ' ')} size="small" variant="outlined" />
            {caps.family && (
              <Chip label={caps.family} size="small" color="info" variant="outlined"
                sx={{ fontSize: '0.6rem', height: 18 }} />
            )}
          </Stack>
          <CapabilityBar caps={caps} />
        </Stack>
        <IconButton size="small" onClick={onClose}><X size={16} /></IconButton>
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1, overflow: 'hidden' }}>

        {/* ── Search bar ── */}
        <Stack component="form" onSubmit={handleSearch} direction="row" spacing={1} alignItems="center">
          <Tooltip title={canSearch ? '' : 'This source does not support keyword search — use “List all”.'}>
            <TextField
              value={query} onChange={e => setQuery(e.target.value)}
              disabled={!canSearch}
              placeholder={canSearch ? 'Search documents… (leave empty to list all)' : 'Keyword search not supported by this source'}
              size="small" fullWidth
              InputProps={{ startAdornment: <Search size={16} style={{ marginRight: 6, opacity: 0.5 }} /> }}
            />
          </Tooltip>
          {canFilter && (
            <Tooltip title="Filters">
              <Button variant={showFilters ? 'contained' : 'outlined'} size="small" color="secondary"
                onClick={() => setShowFilters(v => !v)}
                startIcon={<SlidersHorizontal size={15} />} sx={{ flexShrink: 0 }}>
                Filters{Object.values(filters).filter(v => v !== '' && v != null).length
                  ? ` (${Object.values(filters).filter(v => v !== '' && v != null).length})` : ''}
              </Button>
            </Tooltip>
          )}
          <FormControl size="small" sx={{ minWidth: 80 }}>
            <InputLabel>Per page</InputLabel>
            <Select value={pageSize} label="Per page" onChange={e => handlePageSizeChange(e.target.value)}>
              {PAGE_SIZES.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </Select>
          </FormControl>
          <Button type="submit" variant="contained" size="small" disabled={loading}
            startIcon={loading ? <CircularProgress size={14} /> : (canSearch ? <Search size={15} /> : <List size={15} />)}
            sx={{ flexShrink: 0 }}>
            {loading ? 'Loading…' : (canSearch ? 'Search' : 'List all')}
          </Button>
        </Stack>

        {/* ── Filter panel ── */}
        {canFilter && (
          <Collapse in={showFilters}>
            <FilterPanel schema={filterSchema} filters={filters}
              onChange={handleFilterChange} onClear={handleClearFilters} open={showFilters} />
          </Collapse>
        )}

        {caps.notes && (
          <Alert severity="info" icon={<Info size={16} />} sx={{ py: 0, fontSize: '0.72rem' }}>
            {caps.notes}
          </Alert>
        )}

        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

        {/* ── Results ── */}
        {results && (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
            border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>

            {/* Toolbar */}
            <Stack direction="row" alignItems="center" justifyContent="space-between"
              sx={{ px: 2, py: 0.75, borderBottom: '1px solid', borderColor: 'divider',
                    position: 'sticky', top: 0, bgcolor: 'background.paper', zIndex: 1, flexShrink: 0 }}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Checkbox size="small"
                  indeterminate={selected.size > 0 && selected.size < allResults.length}
                  checked={selected.size === allResults.length && allResults.length > 0}
                  onChange={toggleAll} />
                <Typography variant="caption" fontWeight={600}>
                  {totalItems} total
                  {selected.size > 0 && ` · ${selected.size} selected`}
                  {doneCount > 0  && ` · ${doneCount} imported`}
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel>Namespace</InputLabel>
                  <Select value={importNs} label="Namespace" onChange={e => setImportNs(e.target.value)}>
                    {NAMESPACES.map(ns => <MenuItem key={ns} value={ns}>{ns}</MenuItem>)}
                  </Select>
                </FormControl>
                <Tooltip title={canEnrich
                  ? 'Fetch full metadata for selected documents (runs in background)'
                  : 'This source does not support metadata enrichment'}>
                  <span>
                    <Button variant="outlined" size="small"
                      disabled={!canEnrich || selected.size === 0 || enriching}
                      startIcon={enriching ? <CircularProgress size={14} /> : <DatabaseZap size={14} />}
                      onClick={handleFetchMetadata} sx={{ fontSize: '0.72rem' }}>
                      {enriching ? 'Starting…' : `Fetch Metadata${selected.size > 0 ? ` (${selected.size})` : ''}`}
                    </Button>
                  </span>
                </Tooltip>
                <Button variant="contained" size="small" disabled={selected.size === 0 || bulkImporting}
                  startIcon={bulkImporting ? <CircularProgress size={14} /> : <Download size={14} />}
                  onClick={handleImportSelected}>
                  Import {selected.size > 0 ? `(${selected.size})` : 'Selected'}
                </Button>
              </Stack>
            </Stack>

            {/* Table */}
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" width={40} />
                    <TableCell width={32} />
                    <TableCell>Document</TableCell>
                    <TableCell width={90} align="center">Date</TableCell>
                    <TableCell width={80} align="right">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {allResults.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                        No documents found
                      </TableCell>
                    </TableRow>
                  ) : allResults.map((item) => {
                    const st       = statuses[item.id];
                    const expanded = expandedRows.has(item.id);
                    return (
                      <React.Fragment key={item.id}>
                        <TableRow hover selected={selected.has(item.id)}
                          sx={{ opacity: st === 'done' ? 0.5 : 1, verticalAlign: 'top',
                               '& > td': { borderBottom: expanded ? 0 : undefined } }}>

                          <TableCell padding="checkbox" sx={{ pt: 1 }}>
                            <Checkbox size="small" checked={selected.has(item.id)} disabled={st === 'done'}
                              onChange={() => toggleSelect(item.id)} />
                          </TableCell>

                          <TableCell padding="none" sx={{ pl: 0.5, pt: 1 }}>
                            <IconButton size="small" onClick={() => toggleExpand(item.id)} sx={{ p: 0.25 }}>
                              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </IconButton>
                          </TableCell>

                          {/* Rich document header */}
                          <TableCell sx={{ py: 0.75 }}>
                            <DocRowHeader item={item} />
                          </TableCell>

                          {/* Date */}
                          <TableCell align="center" sx={{ pt: 0.75 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                              {item.date
                                ? (() => { try {
                                    return new Date(item.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                                  } catch { return item.date; } })()
                                : '—'}
                            </Typography>
                          </TableCell>

                          {/* Action */}
                          <TableCell align="right" sx={{ pt: 0.75 }}>
                            <Stack direction="row" spacing={0.25} justifyContent="flex-end" alignItems="center">
                              <Tooltip title="Open document card">
                                <IconButton size="small" onClick={() => setCardItem(item)}>
                                  <Info size={15} />
                                </IconButton>
                              </Tooltip>
                              {st ? (
                                <ImportStatus status={st} />
                              ) : (
                                <Tooltip title={item.pdfUrl ? `Import English PDF → ${importNs}` : `Import to ${importNs}`}>
                                  <IconButton size="small" onClick={() => handleImportOne(item)}>
                                    <Download size={15} />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Stack>
                          </TableCell>
                        </TableRow>

                        <MetadataPanel item={item} open={expanded} />
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>

            {/* Pagination */}
            {totalPages > 1 && (
              <Stack direction="row" alignItems="center" justifyContent="center" spacing={1}
                sx={{ px: 2, py: 1, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
                <Button size="small" variant="outlined" disabled={page <= 1 || loading}
                  onClick={() => handlePageChange(page - 1)} sx={{ minWidth: 32, px: 1 }}>
                  ‹ Prev
                </Button>
                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 130, textAlign: 'center' }}>
                  Page {page} of {totalPages} ({totalItems} total)
                </Typography>
                <Button size="small" variant="outlined" disabled={page >= totalPages || loading}
                  onClick={() => handlePageChange(page + 1)} sx={{ minWidth: 32, px: 1 }}>
                  Next ›
                </Button>
              </Stack>
            )}
          </Box>
        )}

        {!results && !loading && (
          <Stack alignItems="center" justifyContent="center" sx={{ flex: 1, color: 'text.secondary', gap: 1 }}>
            <Search size={40} style={{ opacity: 0.2 }} />
            <Typography variant="body2">Enter a search query and click Search</Typography>
            <Typography variant="caption" color="text.disabled">Leave empty to list all documents</Typography>
          </Stack>
        )}

        {loading && !results && (
          <Stack alignItems="center" justifyContent="center" sx={{ flex: 1, gap: 2 }}>
            <CircularProgress size={32} />
            <Typography variant="body2" color="text.secondary">Searching {source?.name}…</Typography>
          </Stack>
        )}

      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>

      {enrichJobId && (
        <EnrichProgressModal
          open={Boolean(enrichJobId)}
          onClose={() => { setEnrichJobId(null); setEnrichItems([]); }}
          sourceId={source?.id}
          jobId={enrichJobId}
          initialItems={enrichItems}
        />
      )}

      <SourceDocumentCardDialog
        open={Boolean(cardItem)}
        onClose={() => setCardItem(null)}
        item={cardItem}
        sourceId={source?.id}
        sourceName={source?.name}
      />
    </Dialog>
  );
}
