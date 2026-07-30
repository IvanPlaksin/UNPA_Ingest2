/**
 * Graph Transfer Page (/graph-transfer)
 *
 * Selective export of Memgraph(+Qdrant) data as a UGP package for transfer to
 * another instance. Backend: /api/v1/graph-transfer (see graphTransfer.service.js).
 *
 * Flow: pick a slice → Preview (counts + per-collection vector selection) →
 * Start Export (BullMQ job) → live SSE progress → Download → History.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Box, Paper, Typography, Tabs, Tab, TextField, Button, Chip, Stack, Divider,
    Radio, RadioGroup, FormControlLabel, FormControl, FormLabel, Checkbox,
    Table, TableBody, TableRow, TableCell, TableHead, Alert, AlertTitle,
    LinearProgress, CircularProgress, Tooltip, Collapse, Link, IconButton,
    Dialog, DialogTitle, DialogContent, DialogActions,
    Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReplayIcon from '@mui/icons-material/Replay';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import {
    previewExport, startExport, getHistory, jobEventsUrl, jobDownloadUrl, rerunExport,
    updateExportRecord, deleteExportRecord, historyDownloadUrl, getPayloadSchema,
} from '../services/graphTransfer.service';
import VectorFilterBuilder from '../components/graph-transfer/VectorFilterBuilder';
import CatalogTreeSelector from '../components/graph-transfer/CatalogTreeSelector';
import DomainExportFlow from '../components/graph-transfer/DomainExportFlow';
import ExportAssistantChat from '../components/graph-transfer/ExportAssistantChat';
import SyncToInstancePanel from '../components/graph-transfer/SyncToInstancePanel';

const MODES = ['NAMESPACE', 'LABELS', 'CYPHER', 'CATALOG_GRAPHS'];
const BOUNDARY = ['EXCLUDE', 'STUB', 'CLOSURE'];
const VECTOR = ['EMBED_POINTS', 'MANIFEST_ONLY', 'NONE'];

const splitList = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString() : n);

export default function GraphTransferPage() {
    // Selection state
    const [mode, setMode] = useState('LABELS');
    const [namespaceText, setNamespaceText] = useState('');
    const [labelsText, setLabelsText] = useState('');
    const [cypher, setCypher] = useState('MATCH (n:DialogueSegment) RETURN n LIMIT 100');
    const [selectedGraphIds, setSelectedGraphIds] = useState([]);
    const [boundaryPolicy, setBoundaryPolicy] = useState('STUB');
    const [vectorPolicy, setVectorPolicy] = useState('EMBED_POINTS');

    // Preview state
    const [preview, setPreview] = useState(null);
    const [previewing, setPreviewing] = useState(false);
    const [selectedCollections, setSelectedCollections] = useState({});
    const [vectorFilters, setVectorFilters] = useState({});
    const [collectionSchemas, setCollectionSchemas] = useState({});
    const [showGaps, setShowGaps] = useState(false);

    // Job state
    const [jobId, setJobId] = useState(null);
    const [jobStatus, setJobStatus] = useState('idle'); // idle|active|completed|failed
    const [jobProgress, setJobProgress] = useState(0);
    const [jobPhase, setJobPhase] = useState('');
    const [jobResult, setJobResult] = useState(null);
    const [jobError, setJobError] = useState(null);
    const esRef = useRef(null);

    // History
    const [history, setHistory] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleteFile, setDeleteFile] = useState(false);
    const [assistantJob, setAssistantJob] = useState(null); // jobId started by the AI assistant

    const buildRequest = useCallback(() => {
        // Only send filters for collections that are actually selected.
        const activeFilters = {};
        for (const [col, f] of Object.entries(vectorFilters)) {
            if (f && selectedCollections[col]) activeFilters[col] = f;
        }
        const req = { selectionMode: mode, boundaryPolicy, vectorPolicy, selectedCollections, vectorFilters: activeFilters };
        if (mode === 'NAMESPACE') req.namespacePrefixes = splitList(namespaceText);
        if (mode === 'LABELS') req.labels = splitList(labelsText);
        if (mode === 'CYPHER') req.cypher = cypher;
        if (mode === 'CATALOG_GRAPHS') req.graphIds = selectedGraphIds;
        return req;
    }, [mode, boundaryPolicy, vectorPolicy, selectedCollections, vectorFilters, namespaceText, labelsText, cypher, selectedGraphIds]);

    // Lazy-load payload schema for each newly-selected collection (for the filter UI).
    useEffect(() => {
        for (const [col, on] of Object.entries(selectedCollections)) {
            if (on && collectionSchemas[col] === undefined) {
                setCollectionSchemas((prev) => ({ ...prev, [col]: null })); // mark loading
                getPayloadSchema(col)
                    .then((s) => setCollectionSchemas((prev) => ({ ...prev, [col]: s })))
                    .catch(() => setCollectionSchemas((prev) => ({ ...prev, [col]: { fields: [], filterableFields: [] } })));
            }
        }
    }, [selectedCollections, collectionSchemas]);

    const loadHistory = useCallback(async () => {
        try {
            const r = await getHistory(25);
            setHistory(r.records || []);
        } catch { /* non-fatal */ }
    }, []);

    useEffect(() => { loadHistory(); }, [loadHistory]);

    // SSE subscription for the active job
    useEffect(() => {
        if (!jobId) return undefined;
        const es = new EventSource(jobEventsUrl(jobId));
        esRef.current = es;
        es.onmessage = (e) => {
            let data;
            try { data = JSON.parse(e.data); } catch { return; }
            if (typeof data.progress === 'number') setJobProgress(data.progress);
            if (data.phase) setJobPhase(data.phase);
            const type = data.type || data.phase;
            if (type === 'state' && (data.status === 'completed' || data.status === 'failed')) {
                setJobStatus(data.status);
                if (data.status === 'completed') setJobResult(data);
                es.close();
                loadHistory();
            }
            if (type === 'completed') {
                setJobStatus('completed');
                setJobResult(data.result || data);
                setJobProgress(100);
                es.close();
                loadHistory();
            } else if (type === 'failed') {
                setJobStatus('failed');
                setJobError(data.error || 'Export failed');
                es.close();
                loadHistory();
            }
        };
        es.onerror = () => { es.close(); };
        return () => es.close();
    }, [jobId, loadHistory]);

    const handlePreview = async () => {
        setPreviewing(true);
        setPreview(null);
        try {
            const result = await previewExport(buildRequest());
            setPreview(result);
            // Initialize per-collection selection from the preview's defaults.
            const sel = {};
            for (const c of result.vectors?.collections || []) sel[c.name] = !!c.selected;
            setSelectedCollections(sel);
        } catch (e) {
            setPreview({ valid: false, errors: [e.response?.data?.error || e.message], warnings: [], counts: {}, vectors: { collections: [] }, nodesWithoutIdentity: [] });
        } finally {
            setPreviewing(false);
        }
    };

    const toggleCollection = (name) => {
        setSelectedCollections((prev) => ({ ...prev, [name]: !prev[name] }));
    };

    const handleStartExport = async () => {
        setJobStatus('active');
        setJobProgress(0);
        setJobPhase('queued');
        setJobResult(null);
        setJobError(null);
        try {
            const r = await startExport(buildRequest());
            if (!r.success) {
                setJobStatus('failed');
                setJobError((r.errors || [r.error]).join('; '));
                return;
            }
            setJobId(r.jobId);
        } catch (e) {
            setJobStatus('failed');
            setJobError(e.response?.data?.error || e.message);
        }
    };

    const handleRerun = async (exportId) => {
        setJobStatus('active');
        setJobProgress(0);
        setJobPhase('queued');
        setJobResult(null);
        setJobError(null);
        try {
            const r = await rerunExport(exportId);
            if (!r.success) { setJobStatus('failed'); setJobError(r.error || 'Re-run failed'); return; }
            setJobId(r.jobId);
        } catch (e) {
            setJobStatus('failed');
            setJobError(e.response?.data?.error || e.message);
        }
    };

    const startEdit = (record) => { setEditingId(record.exportId); setEditName(record.name || ''); };
    const saveEdit = async () => {
        const id = editingId;
        setEditingId(null);
        try { await updateExportRecord(id, { name: editName }); } catch { /* ignore */ }
        loadHistory();
    };
    const confirmDelete = async () => {
        const target = deleteTarget;
        setDeleteTarget(null);
        try { await deleteExportRecord(target.exportId, deleteFile); } catch { /* ignore */ }
        loadHistory();
    };

    const canExport = preview?.valid && (preview?.counts?.nodes || 0) > 0 && jobStatus !== 'active';

    return (
        <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
            <Typography variant="h5" fontWeight={700} gutterBottom>Graph Transfer</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Pick data by domain from the map, or just tell the assistant what to export. Advanced manual selection is below.
            </Typography>

            {/* Export started by the AI assistant */}
            {assistantJob && (
                <Alert severity="info" sx={{ mb: 2 }} onClose={() => setAssistantJob(null)}
                    action={<Button color="inherit" size="small" startIcon={<DownloadIcon />} href={jobDownloadUrl(assistantJob)}>Download when ready</Button>}>
                    Assistant started export <b>{assistantJob}</b> — it will appear in history below when finished.
                </Alert>
            )}

            {/* PRIMARY: map + AI assistant */}
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} sx={{ mb: 3, alignItems: 'stretch' }}>
                <Box sx={{ flex: 1.6, minWidth: 0 }}>
                    <DomainExportFlow disabled={jobStatus === 'active'} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 340, display: 'flex' }}>
                    <ExportAssistantChat onExportStarted={setAssistantJob} disabled={jobStatus === 'active'} />
                </Box>
            </Stack>

            {/* ADVANCED — the manual selection flow (tabs / preview / filters / history) */}
            <Accordion defaultExpanded={false} sx={{ '&:before': { display: 'none' } }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="subtitle1" fontWeight={600}>Advanced mode — manual selection</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ display: 'block' }}>

            {/* SELECTION */}
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Tabs value={mode} onChange={(_, v) => setMode(v)} sx={{ mb: 2 }}>
                    {MODES.map((m) => <Tab key={m} value={m} label={m} />)}
                </Tabs>

                {mode === 'NAMESPACE' && (
                    <TextField fullWidth size="small" label="Namespace prefixes (comma-separated)"
                        placeholder="PROJECT/FlowDesk, CORE" value={namespaceText}
                        onChange={(e) => setNamespaceText(e.target.value)} />
                )}
                {mode === 'LABELS' && (
                    <TextField fullWidth size="small" label="Labels (comma-separated)"
                        placeholder="KnowledgeQuantum, DialogueSegment" value={labelsText}
                        onChange={(e) => setLabelsText(e.target.value)} />
                )}
                {mode === 'CYPHER' && (
                    <TextField fullWidth multiline minRows={3} size="small" label="Read-only Cypher returning n"
                        helperText="Must RETURN a node bound as n. Write clauses are rejected. Add your own LIMIT."
                        value={cypher} onChange={(e) => setCypher(e.target.value)}
                        sx={{ fontFamily: 'monospace' }} />
                )}
                {mode === 'CATALOG_GRAPHS' && (
                    <CatalogTreeSelector selectedGraphIds={selectedGraphIds} onChange={setSelectedGraphIds} disabled={jobStatus === 'active'} />
                )}

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} sx={{ mt: 2 }}>
                    <FormControl>
                        <FormLabel sx={{ fontSize: 13 }}>Boundary policy</FormLabel>
                        <RadioGroup row value={boundaryPolicy} onChange={(e) => setBoundaryPolicy(e.target.value)}>
                            {BOUNDARY.map((b) => <FormControlLabel key={b} value={b} control={<Radio size="small" />} label={b} />)}
                        </RadioGroup>
                    </FormControl>
                    <FormControl>
                        <FormLabel sx={{ fontSize: 13 }}>Vector policy</FormLabel>
                        <RadioGroup row value={vectorPolicy} onChange={(e) => setVectorPolicy(e.target.value)}>
                            {VECTOR.map((v) => <FormControlLabel key={v} value={v} control={<Radio size="small" />} label={v} />)}
                        </RadioGroup>
                    </FormControl>
                </Stack>

                <Button variant="contained" startIcon={previewing ? <CircularProgress size={16} color="inherit" /> : <VisibilityIcon />}
                    onClick={handlePreview} disabled={previewing} sx={{ mt: 1 }}>
                    Preview
                </Button>
            </Paper>

            {/* PREVIEW */}
            {preview && (
                <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                    <Typography variant="h6" gutterBottom>Preview</Typography>

                    {!preview.valid && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            <AlertTitle>Invalid selection</AlertTitle>
                            {(preview.errors || []).map((er, i) => <div key={i}>{er}</div>)}
                        </Alert>
                    )}
                    {(preview.warnings || []).length > 0 && (
                        <Alert severity="warning" sx={{ mb: 2 }}>
                            {(preview.warnings || []).map((w, i) => <div key={i}>{w}</div>)}
                        </Alert>
                    )}

                    {preview.valid && (
                        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={3}>
                            {/* Counts */}
                            <Box sx={{ minWidth: 280 }}>
                                <Typography variant="subtitle2" gutterBottom>Counts</Typography>
                                <Table size="small">
                                    <TableBody>
                                        <TableRow><TableCell>Nodes</TableCell><TableCell align="right">{fmt(preview.counts.nodes)}</TableCell></TableRow>
                                        <TableRow><TableCell>Relationships</TableCell><TableCell align="right">{fmt(preview.counts.relationships)}</TableCell></TableRow>
                                        <TableRow><TableCell>Boundary edges</TableCell><TableCell align="right">{fmt(preview.counts.boundaryEdges)}</TableCell></TableRow>
                                        <TableRow><TableCell>Stub nodes ({boundaryPolicy})</TableCell><TableCell align="right">{fmt(preview.counts.stubNodes)}</TableCell></TableRow>
                                    </TableBody>
                                </Table>
                                <Box sx={{ mt: 1 }}>
                                    {preview.containsExecutableGraphs && (
                                        <Chip size="small" color="warning" label="Contains executable graphs" sx={{ mr: 1 }} />
                                    )}
                                </Box>
                                {(preview.nodesWithoutIdentity || []).length > 0 && (
                                    <Box sx={{ mt: 1 }}>
                                        <Link component="button" variant="body2" onClick={() => setShowGaps((s) => !s)}
                                            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                            <WarningAmberIcon fontSize="small" color="warning" />
                                            {preview.nodesWithoutIdentity.length} label(s) with nodes lacking identity
                                        </Link>
                                        <Collapse in={showGaps}>
                                            <Table size="small">
                                                <TableBody>
                                                    {preview.nodesWithoutIdentity.map((g, i) => (
                                                        <TableRow key={i}>
                                                            <TableCell>{(g.labels || []).join(':')}</TableCell>
                                                            <TableCell align="right">{fmt(g.count)}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </Collapse>
                                    </Box>
                                )}
                            </Box>

                            {/* Nodes by label (+ vector dependency) */}
                            <Box sx={{ minWidth: 300, maxHeight: 260, overflow: 'auto' }}>
                                <Typography variant="subtitle2" gutterBottom>Nodes by label</Typography>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Label</TableCell>
                                            <TableCell align="right">Count</TableCell>
                                            <TableCell>Vectors</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {Object.entries(preview.counts.nodesByLabel || {})
                                            .sort((a, b) => (b[1].count || 0) - (a[1].count || 0))
                                            .map(([l, info]) => (
                                                <TableRow key={l}>
                                                    <TableCell>{l}</TableCell>
                                                    <TableCell align="right">{fmt(info.count)}</TableCell>
                                                    <TableCell>
                                                        {info.vectorLinkage?.hasVectors ? (
                                                            <Tooltip title={`${fmt(info.vectorLinkage.linkedPoints)} points in ${info.vectorLinkage.linkedCollection} (${Math.round((info.vectorLinkage.coverage || 0) * 100)}% coverage)${info.vectorLinkage.namedVectors ? ` — named: ${info.vectorLinkage.namedVectors.join(', ')}` : ''}`}>
                                                                <Chip size="small" color="primary" variant="outlined" label={`${fmt(info.vectorLinkage.linkedPoints)} vec`} sx={{ height: 18 }} />
                                                            </Tooltip>
                                                        ) : (
                                                            <Typography variant="caption" color="text.secondary">—</Typography>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                    </TableBody>
                                </Table>
                            </Box>

                            {/* Vector collections */}
                            <Box sx={{ flex: 1, minWidth: 320 }}>
                                <Typography variant="subtitle2" gutterBottom>Vector collections</Typography>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell padding="checkbox" />
                                            <TableCell>Collection</TableCell>
                                            <TableCell align="right">In slice</TableCell>
                                            <TableCell align="right">Total</TableCell>
                                            <TableCell>Kind</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {(preview.vectors.collections || []).map((c) => (
                                            <TableRow key={c.name} hover>
                                                <TableCell padding="checkbox">
                                                    <Checkbox size="small" checked={!!selectedCollections[c.name]}
                                                        onChange={() => toggleCollection(c.name)}
                                                        disabled={vectorPolicy === 'NONE'} />
                                                </TableCell>
                                                <TableCell>
                                                    {c.name}
                                                    {c.namedVectors && (
                                                        <Tooltip title={`named vectors: ${c.namedVectors.join(', ')}`}>
                                                            <Chip size="small" variant="outlined" label="named" sx={{ ml: 0.5, height: 18 }} />
                                                        </Tooltip>
                                                    )}
                                                    {c.filtered && c.filterSummary && (
                                                        <Tooltip title={c.filterSummary}>
                                                            <Chip size="small" color="primary" variant="outlined" label="filtered" sx={{ ml: 0.5, height: 18 }} />
                                                        </Tooltip>
                                                    )}
                                                    {c.filterError && (
                                                        <Tooltip title={c.filterError}>
                                                            <Chip size="small" color="error" variant="outlined" label="filter error" sx={{ ml: 0.5, height: 18 }} />
                                                        </Tooltip>
                                                    )}
                                                    {c.linkedLabels?.length > 0 && (
                                                        <Typography variant="caption" color="text.secondary" display="block">→ {c.linkedLabels.join(', ')}</Typography>
                                                    )}
                                                </TableCell>
                                                <TableCell align="right">{(c.linked || c.filtered) ? fmt(c.pointsInSlice) : '—'}</TableCell>
                                                <TableCell align="right">{fmt(c.totalPoints)}</TableCell>
                                                <TableCell>
                                                    <Chip size="small" label={c.linked ? 'linked' : 'unlinked'}
                                                        color={c.linked ? 'primary' : 'default'} variant="outlined" sx={{ height: 18 }} />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </Box>
                        </Stack>
                    )}

                    {/* Per-collection vector filters (selected collections only) */}
                    {preview.valid && vectorPolicy !== 'NONE' && Object.entries(selectedCollections).some(([, on]) => on) && (
                        <Box sx={{ mt: 2 }}>
                            <Typography variant="subtitle2" gutterBottom>Vector filters</Typography>
                            {Object.entries(selectedCollections).filter(([, on]) => on).map(([col]) => (
                                <VectorFilterBuilder
                                    key={col}
                                    collection={col}
                                    schema={collectionSchemas[col]}
                                    filter={vectorFilters[col]}
                                    disabled={jobStatus === 'active'}
                                    onChange={(f) => setVectorFilters((prev) => ({ ...prev, [col]: f }))}
                                />
                            ))}
                            <Button size="small" startIcon={<RefreshIcon />} sx={{ mt: 1 }}
                                onClick={handlePreview} disabled={previewing}>
                                Re-preview with filters
                            </Button>
                        </Box>
                    )}

                    <Divider sx={{ my: 2 }} />
                    <Button variant="contained" color="success" startIcon={<PlayArrowIcon />}
                        onClick={handleStartExport} disabled={!canExport}>
                        Start Export
                    </Button>
                </Paper>
            )}

            {/* ACTIVE JOB */}
            {jobStatus !== 'idle' && (
                <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                    <Typography variant="h6" gutterBottom>Export job</Typography>
                    {jobStatus === 'active' && (
                        <>
                            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                                <Typography variant="body2">{jobPhase || 'working'}…</Typography>
                                <Typography variant="body2">{jobProgress}%</Typography>
                            </Stack>
                            <LinearProgress variant="determinate" value={jobProgress} />
                        </>
                    )}
                    {jobStatus === 'completed' && (
                        <Alert severity="success" action={
                            <Button color="inherit" size="small" startIcon={<DownloadIcon />}
                                href={jobDownloadUrl(jobId)}>Download</Button>
                        }>
                            Export complete — {fmt(jobResult?.counts?.nodes)} nodes, {fmt(jobResult?.counts?.relationships)} relationships,
                            {' '}{fmt(jobResult?.counts?.stubNodes)} stubs.
                        </Alert>
                    )}
                    {jobStatus === 'failed' && (
                        <Alert severity="error"><AlertTitle>Export failed</AlertTitle>{jobError}</Alert>
                    )}
                </Paper>
            )}

            {/* SYNC TO INSTANCE (API-API) — reuses the current selection */}
            <SyncToInstancePanel buildRequest={buildRequest} />

            {/* HISTORY */}
            <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography variant="h6">History</Typography>
                    <Button size="small" startIcon={<RefreshIcon />} onClick={loadHistory}>Refresh</Button>
                </Stack>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Date</TableCell>
                            <TableCell>Name / Selection</TableCell>
                            <TableCell align="right">Nodes</TableCell>
                            <TableCell align="right">Vectors</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {history.length === 0 && (
                            <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.secondary">No exports yet.</Typography></TableCell></TableRow>
                        )}
                        {history.map((h) => {
                            const vp = Object.values(h.counts?.vectorPoints || {}).reduce((a, b) => a + b, 0);
                            return (
                                <TableRow key={h.exportId} hover>
                                    <TableCell>{h.createdAt ? new Date(h.createdAt).toLocaleString() : '—'}</TableCell>
                                    <TableCell>
                                        {editingId === h.exportId ? (
                                            <TextField value={editName} onChange={(e) => setEditName(e.target.value)}
                                                onBlur={saveEdit} onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                                                size="small" autoFocus placeholder="(unnamed)" />
                                        ) : (
                                            <Tooltip title={h.selectionSummary || ''}>
                                                <span>{h.name ? h.name : (h.selectionSummary || '').slice(0, 48)}</span>
                                            </Tooltip>
                                        )}
                                        {h.canRerun && <Chip size="small" variant="outlined" label="re-runnable" sx={{ ml: 1, height: 18 }} />}
                                    </TableCell>
                                    <TableCell align="right">{fmt(h.counts?.nodes)}</TableCell>
                                    <TableCell align="right">{fmt(vp)}</TableCell>
                                    <TableCell><Chip size="small" label={h.status} color={h.status === 'completed' ? 'success' : 'default'} variant="outlined" /></TableCell>
                                    <TableCell align="right">
                                        <Tooltip title="Edit name">
                                            <IconButton size="small" onClick={() => startEdit(h)}><EditIcon fontSize="small" /></IconButton>
                                        </Tooltip>
                                        <Tooltip title={h.canRerun ? 'Re-run this export' : 'Not re-runnable (incomplete saved request)'}>
                                            <span>
                                                <IconButton size="small" disabled={!h.canRerun || jobStatus === 'active'} onClick={() => handleRerun(h.exportId)}>
                                                    <ReplayIcon fontSize="small" />
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                        <Tooltip title="Download package">
                                            <IconButton size="small" component="a" href={historyDownloadUrl(h.exportId)}><DownloadIcon fontSize="small" /></IconButton>
                                        </Tooltip>
                                        <Tooltip title="Delete record">
                                            <IconButton size="small" color="error" onClick={() => { setDeleteTarget(h); setDeleteFile(false); }}><DeleteIcon fontSize="small" /></IconButton>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </Paper>

                </AccordionDetails>
            </Accordion>

            {/* Delete confirmation */}
            <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
                <DialogTitle>Delete export record</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                        Delete “{deleteTarget?.name || deleteTarget?.exportId}”? This removes the history record.
                    </Typography>
                    <FormControlLabel
                        control={<Checkbox size="small" checked={deleteFile} onChange={(e) => setDeleteFile(e.target.checked)} />}
                        label="Also delete the package file on disk"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
                    <Button color="error" onClick={confirmDelete}>Delete</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
