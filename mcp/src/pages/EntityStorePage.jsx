/**
 * EntityStorePage — central entity knowledge store.
 * Left panel: entity list with filters + CRUD.
 * Right panel: 2D ReactFlow tabs (global + node-centered) or 3D Singularity.
 * Far-right panel: collapsible DocRef sidebar.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import EntityGraph2D, { PALETTE as ES_PALETTE } from '../components/EntityStore/EntityGraph2D';
import DocRefSidebar from '../components/EntityStore/DocRefSidebar';
import FloatingSidePanel from '../components/EntityStore/FloatingSidePanel';
import NodeEdgeInfoPanel from '../components/EntityStore/NodeEdgeInfoPanel';
import LayoutControlPanel from '../components/EntityStore/LayoutControlPanel';
import GraphToolsDialog from '../components/EntityStore/GraphToolsDialog';
import {
    Box, Typography, Stack, Chip, Divider,
    IconButton, Tooltip, Button, TextField, Select, MenuItem,
    FormControl, InputLabel, Dialog, DialogTitle, DialogContent,
    DialogActions, Alert, CircularProgress, InputAdornment,
    List, ListItemButton, ListItemText, Badge,
    Autocomplete, Checkbox, LinearProgress,
} from '@mui/material';
import {
    Archive, Network, Box as Box3D, Plus, Upload,
    Pencil, Trash2, Search, X,
    RefreshCw, AlertTriangle, CheckCircle2,
    FileText, Download, Activity, Database, Check,
    Clock, RotateCcw, FileSearch, SlidersHorizontal, Route,
    ChevronLeft, ChevronRight,
} from 'lucide-react';

const ENT_PAGE_SIZE = 50;
import SingularityGraph from '../components/Singularity/SingularityGraph';
import {
    importFromDocument, createEntity, listEntities, listNamespaces,
    getEntityGraph, updateEntity, deleteEntity, deleteNamespace,
    getPyramidStatus, getDocumentRefs, getEntitySubgraph,
} from '../services/entityStore.service';
import { listDocuments, getDocumentEntities, getDocumentStatus } from '../services/documentProcessing.service';
import { listSources, browseSource, importDocument as importFromCatalog } from '../services/sourceCatalog.service';
import { enqueueDocuments, enqueueDocumentsByMethodology, connectStream } from '../services/pipelineManager.service';
import { useEntityStore } from '../stores/entityStore.store';
import Layers from '@mui/icons-material/Layers';
import HelpPanel from '../components/VectorStore/HelpPanel';

const PALETTE = ES_PALETTE;

/* ── Pipeline step labels ─────────────────────────────────────────────────── */
const PIPELINE_STEPS = [
  'load-source','chunk-text','extract-entities','extract-relations',
  'extract-specialized','deduplicate','persist-graph','embed-and-index',
  'post-process','store-result',
];

/* ── Tab helpers ──────────────────────────────────────────────────────────── */

/* ── BFS shortest path (undirected) ──────────────────────────────────────── */
function bfsPath(graphData, fromId, toId) {
    if (!fromId || !toId || fromId === toId || !graphData?.relationships?.length) return null;
    const adj = new Map();
    for (const r of graphData.relationships) {
        if (!adj.has(r.sourceId)) adj.set(r.sourceId, []);
        if (!adj.has(r.targetId)) adj.set(r.targetId, []);
        adj.get(r.sourceId).push(r.targetId);
        adj.get(r.targetId).push(r.sourceId);
    }
    const visited = new Set([fromId]);
    const queue = [{ id: fromId, path: [fromId] }];
    while (queue.length) {
        const { id, path } = queue.shift();
        for (const nbId of (adj.get(id) || [])) {
            if (!visited.has(nbId)) {
                const next = [...path, nbId];
                if (nbId === toId) return next;
                visited.add(nbId);
                queue.push({ id: nbId, path: next });
            }
        }
    }
    return null;
}

/* ── PathSelectorOverlay — bottom bar shown inside path-result tabs ──────── */
function PathSelectorOverlay({ paths, selectedIndex, onSelect, fromEntity, toEntity }) {
    if (!paths?.length) return null;
    return (
        <Box sx={{
            position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: 0.5,
            bgcolor: 'rgba(8,11,18,0.94)', backdropFilter: 'blur(10px)',
            border: '1px solid #1e293b', borderRadius: 2.5,
            px: 1.25, py: 0.6, zIndex: 25, pointerEvents: 'auto',
            boxShadow: '0 6px 28px rgba(0,0,0,0.7)',
            maxWidth: 'calc(100% - 32px)',
        }}>
            <Route size={11} style={{ color: '#FBBF24', flexShrink: 0 }} />
            <Typography sx={{
                fontSize: '0.6rem', color: '#64748b', px: 0.5, whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120,
            }}>
                {(fromEntity?.name || '').slice(0, 12)} → {(toEntity?.name || '').slice(0, 12)}
            </Typography>
            <Box sx={{ width: '1px', height: 16, bgcolor: '#1e293b', mx: 0.25, flexShrink: 0 }} />
            {paths.map((path, i) => {
                const isSelected = i === selectedIndex;
                const isShortest = i === 0;
                return (
                    <Tooltip key={i} title={`Route ${i + 1}${isShortest ? ' · shortest' : ''} · ${path.hopCount} hop${path.hopCount !== 1 ? 's' : ''}`} placement="top">
                        <Box onClick={() => onSelect(i)} sx={{
                            display: 'flex', alignItems: 'center', gap: 0.4,
                            px: 0.75, py: 0.35, cursor: 'pointer', borderRadius: 1.5,
                            bgcolor: isSelected ? '#FBBF2420' : 'transparent',
                            border: `1px solid ${isSelected ? '#FBBF2455' : 'transparent'}`,
                            '&:hover': { bgcolor: '#FBBF2412', border: '1px solid #FBBF2430' },
                            transition: 'all 0.12s',
                        }}>
                            <Typography sx={{
                                fontSize: '0.62rem', fontWeight: isSelected ? 700 : 500,
                                color: isSelected ? '#FBBF24' : '#475569',
                                lineHeight: 1,
                            }}>
                                {i + 1}
                            </Typography>
                            <Typography sx={{
                                fontSize: '0.55rem',
                                color: isSelected ? '#FBBF2499' : '#64748b',
                                lineHeight: 1,
                            }}>
                                /{path.hopCount}
                            </Typography>
                        </Box>
                    </Tooltip>
                );
            })}
        </Box>
    );
}

function makeGlobalTab() {
    return {
        id: 'global',
        type: 'global',
        label: 'Global',
        centerId: null,
        depth: 2,
        graphData: null,       // node-centered only; global uses page graphData
        loading: false,
        selectedId: null,
        focusNodeId: null,
        focusKey: 0,
        searchQuery: '',
        glowDepth: 2,
        savedViewport: null,
        restoreViewport: null,
    };
}

function makeNodeCenteredTab(entityId, label, depth = 2) {
    return {
        id: `nc-${entityId}-${Date.now()}`,
        type: 'node-centered',
        label: label || entityId,
        centerId: entityId,
        depth,
        graphData: null,
        loading: true,
        selectedId: entityId,
        focusNodeId: entityId,
        focusKey: 0,
        searchQuery: '',
        glowDepth: 2,
        savedViewport: null,
        restoreViewport: null,
    };
}

function computePathGlow(path) {
    if (!path?.nodeIds?.length) return { pathNodeIds: null, pathEdgePairs: null };
    const nodeIds   = new Set(path.nodeIds);
    const edgePairs = new Set();
    for (let i = 0; i < path.nodeIds.length - 1; i++) {
        edgePairs.add(`${path.nodeIds[i]}|${path.nodeIds[i + 1]}`);
        edgePairs.add(`${path.nodeIds[i + 1]}|${path.nodeIds[i]}`);
    }
    return { pathNodeIds: nodeIds, pathEdgePairs: edgePairs };
}

function makePathResultTab(fromEntity, toEntity, paths, graphData, initialPathIndex = 0) {
    const { pathNodeIds, pathEdgePairs } = computePathGlow(paths[initialPathIndex]);
    return {
        id: `path-${fromEntity.id}-${toEntity.id}-${Date.now()}`,
        type: 'path-result',
        label: `${(fromEntity.name || '').slice(0, 16)} → ${(toEntity.name || '').slice(0, 16)}`,
        fromEntity,
        toEntity,
        graphData,
        paths,
        selectedPathIndex: initialPathIndex,
        pathNodeIds,
        pathEdgePairs,
        loading: false,
        selectedId: null,
        focusNodeId: null,
        focusKey: 0,
        searchQuery: '',
        glowDepth: 2,
        savedViewport: null,
        restoreViewport: null,
    };
}

/* ── ExtractRefDialog ─────────────────────────────────────────────────────── */

function ExtractRefDialog({ open, entity, onClose, onJobStarted, onComplete }) {
    const label = entity?.label || entity?.name || '';

    const [step,        setStep]        = useState('init');
    const [catalogs,    setCatalogs]    = useState([]);
    const [catalog,     setCatalog]     = useState(null);
    const [results,     setResults]     = useState([]);
    const [selected,    setSelected]    = useState(null);
    const [method,      setMethod]      = useState('auto');
    const [jobId,       setJobId]       = useState(null);
    const [jobSteps,    setJobSteps]    = useState({});
    const [jobProgress, setJobProgress] = useState(0);
    const [errMsg,      setErrMsg]      = useState('');
    const esRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        setStep('init');
        setResults([]);
        setSelected(null);
        setMethod('auto');
        setJobId(null);
        setJobSteps({});
        setJobProgress(0);
        setErrMsg('');

        async function run() {
            try {
                const res = await listSources();
                const allCats = (res.data || res || []).filter(c => c.enabled !== false);
                setCatalogs(allCats);

                if (allCats.length === 0) {
                    setErrMsg('No source catalogs configured.');
                    setStep('error');
                    return;
                }

                // If we know the provenance document, try its catalog first
                if (entity?.provenanceDocId) {
                    try {
                        const provDoc = await getDocumentStatus(entity.provenanceDocId);
                        const srcRepo = provDoc?.sourceRepository;
                        if (srcRepo) {
                            const matchedCat = allCats.find(c =>
                                (c.type || '').toLowerCase() === srcRepo.toLowerCase() ||
                                (c.name || '').toUpperCase().includes(srcRepo.toUpperCase())
                            );
                            if (matchedCat) {
                                setCatalog(matchedCat);
                                setStep('browsing');
                                const browseRes = await browseSource(matchedCat.id, { query: label, limit: 10 });
                                const payload   = browseRes?.data || browseRes || {};
                                const rawDocs   = payload.results || payload.documents || (Array.isArray(payload) ? payload : []);
                                const docList   = Array.isArray(rawDocs) ? rawDocs : [];

                                if (docList.length > 0) {
                                    // Found in provenance catalog — auto-import immediately
                                    const doc = docList[0];
                                    setSelected(doc);
                                    setStep('importing');
                                    const importRes  = await importFromCatalog(matchedCat.id, { url: doc.url, title: doc.title || label, pdfUrl: doc.pdfUrl || null });
                                    const documentId = importRes.data?.documentId || importRes.data?.id;
                                    if (!documentId) throw new Error('No documentId from import');
                                    const enqueueRes = await enqueueDocuments([documentId], { forceReprocess: false });
                                    const job        = Array.isArray(enqueueRes) ? enqueueRes[0] : enqueueRes;
                                    const jId        = job?.jobId;
                                    if (!jId) throw new Error('No jobId from pipeline enqueue');
                                    setJobId(jId);
                                    onJobStarted?.(jId);
                                    setStep('extracting');
                                    return;
                                }
                                // Not found in provenance catalog — fall through to catalog picker
                                setCatalog(null);
                            }
                        }
                    } catch (provenanceErr) {
                        console.warn('[ExtractRefDialog] Provenance catalog lookup failed:', provenanceErr.message);
                        setCatalog(null);
                    }
                }

                // Standard flow: single catalog → browse directly; multiple → show picker
                if (allCats.length === 1) {
                    setCatalog(allCats[0]);
                    doBrowse(allCats[0].id, label);
                } else {
                    setStep('select-catalog');
                }
            } catch (e) {
                setErrMsg(e.message);
                setStep('error');
            }
        }

        run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, entity]);

    useEffect(() => {
        if (!jobId || step !== 'extracting') return;
        const es = connectStream({
            onJob: (payload) => {
                if (payload.jobId !== jobId) return;
                setJobProgress(payload.progress ?? 0);
                if (payload.stepName) setJobSteps(prev => ({ ...prev, [payload.stepName]: payload.status || 'running' }));
                if (payload.phase === 'completed' || payload.status === 'completed') { setStep('done'); es.close(); }
                if (payload.phase === 'failed'    || payload.status === 'failed')    { setErrMsg(payload.error || 'Extraction failed'); setStep('error'); es.close(); }
            },
        });
        esRef.current = es;
        return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jobId]);

    async function doBrowse(catalogId, query) {
        setStep('browsing');
        try {
            const res = await browseSource(catalogId, { query, limit: 10 });
            const payload = res?.data || res || {};
            const docs = payload.results || payload.documents || (Array.isArray(payload) ? payload : []);
            setResults(Array.isArray(docs) ? docs : []);
            setStep('results');
        } catch (e) { setErrMsg(e.message); setStep('error'); }
    }

    async function doImport() {
        if (!selected || !catalog) return;
        setStep('importing');
        try {
            const importRes = await importFromCatalog(catalog.id, { url: selected.url, title: selected.title || label, pdfUrl: selected.pdfUrl || null });
            const documentId = importRes.data?.documentId || importRes.data?.id;
            if (!documentId) throw new Error('No documentId from import');
            let jId;
            if (method === 'auto') {
                const enqueueRes = await enqueueDocuments([documentId], { forceReprocess: false });
                const job = Array.isArray(enqueueRes) ? enqueueRes[0] : enqueueRes;
                jId = job?.jobId;
            } else {
                const results = await enqueueDocumentsByMethodology([documentId], method);
                jId = results[0]?.data?.jobId;
            }
            if (!jId) throw new Error('No jobId from pipeline enqueue');
            setJobId(jId);
            onJobStarted?.(jId);
            setStep('extracting');
        } catch (e) { setErrMsg(e.message); setStep('error'); }
    }

    const handleClose = () => { esRef.current?.close(); onClose(); };
    const handleDone  = () => { esRef.current?.close(); onComplete?.(); onClose(); };

    const LoadingView = ({ msg }) => (
        <Box sx={{ py: 4, textAlign: 'center' }}>
            <CircularProgress size={28} sx={{ mb: 1.5 }} />
            <Typography variant="body2" color="text.secondary">{msg}</Typography>
        </Box>
    );

    const ErrorView = () => (
        <Box sx={{ py: 2 }}>
            <Alert severity="error" icon={<AlertTriangle size={16} />}>{errMsg}</Alert>
            <Box sx={{ mt: 2, textAlign: 'right' }}><Button size="small" onClick={handleClose}>Close</Button></Box>
        </Box>
    );

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth
            PaperProps={{ sx: { borderRadius: 2, bgcolor: '#0d1117', border: '1px solid #1e293b' } }}>
            <DialogTitle sx={{ pb: 1, borderBottom: '1px solid #1e293b' }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Download size={16} style={{ color: '#86efac' }} />
                        <Typography variant="subtitle1" fontWeight={700} color="text.primary">Extract Document</Typography>
                    </Stack>
                    <IconButton size="small" onClick={handleClose}><X size={14} /></IconButton>
                </Stack>
                <Box sx={{ mt: 1, px: 1.25, py: 0.75, bgcolor: '#1e293b', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.68rem' }}>DOCUMENTREF</Typography>
                    <Typography variant="body2" fontWeight={600} color="primary.main" sx={{ fontSize: '0.85rem', mt: 0.25 }}>{label}</Typography>
                </Box>
            </DialogTitle>
            <DialogContent sx={{ pt: 2, px: 2.5, pb: 2 }}>
                {step === 'init'           && <LoadingView msg="Loading source catalogs…" />}
                {step === 'browsing'       && <LoadingView msg={catalog ? `Searching "${label}" in ${catalog.name}…` : `Searching "${label}"…`} />}
                {step === 'importing'      && <LoadingView msg="Downloading and importing document…" />}
                {step === 'select-catalog' && (
                    <Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                            {entity?.provenanceDocId
                                ? `"${label}" not found in the provenance catalog. Select a catalog to search manually:`
                                : 'Select a source catalog:'}
                        </Typography>
                        <Stack spacing={1}>
                            {catalogs.map(cat => (
                                <Box key={cat.id} onClick={() => { setCatalog(cat); doBrowse(cat.id, label); }}
                                    sx={{ px: 1.5, py: 1, borderRadius: 1, cursor: 'pointer', border: '1px solid',
                                        borderColor: 'divider', '&:hover': { borderColor: 'primary.main', bgcolor: '#1e3a5f20' },
                                        display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <Database size={14} style={{ color: '#64748b', flexShrink: 0 }} />
                                    <Box flex={1} minWidth={0}>
                                        <Typography variant="body2" fontWeight={600} noWrap>{cat.name}</Typography>
                                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.68rem' }}>
                                            {cat.type} · {cat.documentCount ?? 0} docs
                                        </Typography>
                                    </Box>
                                </Box>
                            ))}
                        </Stack>
                    </Box>
                )}
                {step === 'results'   && (
                    <Box>
                        {results.length === 0 ? (
                            <Alert severity="warning">No documents found for "{label}" in {catalog?.name}.</Alert>
                        ) : (
                            <>
                                <Typography variant="caption" color="text.disabled"
                                    sx={{ display: 'block', mb: 1, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    {results.length} result{results.length !== 1 ? 's' : ''} — select to import
                                </Typography>
                                <Stack spacing={0.75} sx={{ maxHeight: 280, overflowY: 'auto', pr: 0.5 }}>
                                    {results.map((doc, i) => {
                                        const isSel = selected?.url === doc.url;
                                        return (
                                            <Box key={i} onClick={() => setSelected(doc)}
                                                sx={{ px: 1.25, py: 1, borderRadius: 1, cursor: 'pointer', border: '1px solid',
                                                    borderColor: isSel ? 'primary.main' : 'divider',
                                                    bgcolor: isSel ? '#1e3a5f20' : 'transparent',
                                                    '&:hover': { borderColor: 'primary.light', bgcolor: '#1e3a5f10' },
                                                    display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                                                <Box sx={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, mt: 0.2,
                                                    border: '2px solid', borderColor: isSel ? 'primary.main' : '#64748b',
                                                    bgcolor: isSel ? 'primary.main' : 'transparent',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {isSel && <Check size={9} style={{ color: '#fff' }} />}
                                                </Box>
                                                <Box flex={1} minWidth={0}>
                                                    <Typography variant="body2" fontWeight={isSel ? 600 : 400} sx={{ fontSize: '0.82rem', lineHeight: 1.35 }}>
                                                        {doc.title || doc.label || '(untitled)'}
                                                    </Typography>
                                                    <Stack direction="row" spacing={0.75} sx={{ mt: 0.35 }} flexWrap="wrap">
                                                        {doc.symbol && <Typography sx={{ fontSize: '0.62rem', color: '#93c5fd', fontFamily: 'monospace', bgcolor: '#1e3a5f40', px: 0.5, borderRadius: 0.4 }}>{doc.symbol}</Typography>}
                                                        {doc.date   && <Typography sx={{ fontSize: '0.62rem', color: '#64748b' }}>{doc.date}</Typography>}
                                                        {doc.fileType && <Chip label={doc.fileType.toUpperCase()} size="small" sx={{ fontSize: '0.55rem', height: 14, px: 0.25 }} />}
                                                    </Stack>
                                                </Box>
                                            </Box>
                                        );
                                    })}
                                </Stack>
                            </>
                        )}
                        {/* ── Extraction method selector ── */}
                        {(() => {
                            const METHODS = [
                                { id: 'auto', label: 'Auto',      desc: 'Catalog auto-selects by document type & layer' },
                                { id: 'M1',   label: 'M1 — LLM',  desc: 'Single-pass Claude (≤18K chars)' },
                                { id: 'M2',   label: 'M2 — Hybrid', desc: 'GLiNER + LLM (~3× cheaper, requires GLiNER)' },
                                { id: 'M4',   label: 'M4 — MapReduce', desc: 'Parallel chunks + reduce (any length)' },
                            ];
                            return (
                                <Box sx={{ mt: 1.5, pt: 1.25, borderTop: '1px solid #1e293b' }}>
                                    <Typography variant="caption" color="text.disabled"
                                        sx={{ display: 'block', mb: 0.75, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Extraction method
                                    </Typography>
                                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                        {METHODS.map(m => {
                                            const active = method === m.id;
                                            return (
                                                <Tooltip key={m.id} title={m.desc} placement="top" arrow>
                                                    <Box onClick={() => setMethod(m.id)} sx={{
                                                        px: 1, py: 0.4, cursor: 'pointer', borderRadius: 1.25,
                                                        border: '1px solid',
                                                        borderColor: active ? '#6366f1' : '#1e293b',
                                                        bgcolor: active ? '#6366f120' : 'transparent',
                                                        color: active ? '#818cf8' : '#64748b',
                                                        fontSize: '0.68rem', fontWeight: active ? 700 : 400,
                                                        userSelect: 'none',
                                                        '&:hover': { borderColor: active ? '#6366f1' : '#334155', color: active ? '#818cf8' : '#94a3b8' },
                                                        transition: 'all 0.1s',
                                                    }}>
                                                        {m.label}
                                                    </Box>
                                                </Tooltip>
                                            );
                                        })}
                                    </Box>
                                </Box>
                            );
                        })()}

                        {catalogs.length > 1 && (
                            <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.68rem' }}>
                                    Searching in: <strong style={{ color: '#94a3b8' }}>{catalog?.name}</strong>
                                </Typography>
                                <Button size="small" variant="text" sx={{ minWidth: 0, fontSize: '0.68rem', py: 0 }}
                                    onClick={() => setStep('select-catalog')}>Change</Button>
                            </Box>
                        )}
                    </Box>
                )}
                {step === 'extracting' && (
                    <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            <CircularProgress size={16} thickness={5} />
                            <Typography variant="body2" color="text.secondary">
                                Pipeline running — Job <code style={{ color: '#60a5fa', fontSize: '0.72rem' }}>{jobId}</code>
                            </Typography>
                        </Box>
                        <LinearProgress variant="determinate" value={jobProgress} sx={{ mb: 2, borderRadius: 1 }} />
                        <Typography variant="caption" color="text.disabled"
                            sx={{ display: 'block', textAlign: 'right', mt: -1.5, mb: 2, fontSize: '0.68rem' }}>
                            {Math.round(jobProgress)}%
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {PIPELINE_STEPS.map(s => {
                                const st = jobSteps[s];
                                const bg = !st ? '#1e293b' : st === 'running' ? '#1e3a5f' : st === 'completed' ? '#166534' : '#7f1d1d';
                                const bc = !st ? '#334155' : st === 'running' ? '#3b82f6' : st === 'completed' ? '#22c55e'  : '#ef4444';
                                return (
                                    <Box key={s} sx={{ px: 0.75, py: 0.35, borderRadius: 0.75, bgcolor: bg,
                                        border: `1px solid ${bc}`, fontSize: '0.6rem', color: bc,
                                        display: 'flex', alignItems: 'center', gap: 0.4 }}>
                                        {st === 'running' && <CircularProgress size={8} thickness={5} style={{ color: bc }} />}
                                        {s.replace(/-/g, ' ')}
                                    </Box>
                                );
                            })}
                        </Box>
                    </Box>
                )}
                {step === 'done' && (
                    <Box sx={{ py: 2, textAlign: 'center' }}>
                        <CheckCircle2 size={36} style={{ color: '#22c55e', marginBottom: 8 }} />
                        <Typography variant="subtitle2" fontWeight={700} color="success.main">Extraction complete!</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            The document has been extracted and the knowledge graph will be updated.
                        </Typography>
                    </Box>
                )}
                {step === 'error' && <ErrorView />}
            </DialogContent>
            {(step === 'results' || step === 'done') && (
                <DialogActions sx={{ px: 2.5, py: 1.5, borderTop: '1px solid #1e293b' }}>
                    {step === 'results' && (
                        <>
                            <Button size="small" onClick={handleClose}>Cancel</Button>
                            <Button size="small" variant="contained" color="success" disabled={!selected}
                                startIcon={<Download size={14} />} onClick={doImport}>
                                Import &amp; Extract{method !== 'auto' ? ` (${method})` : ''}
                            </Button>
                        </>
                    )}
                    {step === 'done' && (
                        <Button size="small" variant="contained" color="success" onClick={handleDone}
                            startIcon={<RefreshCw size={13} />}>
                            Refresh Graph
                        </Button>
                    )}
                </DialogActions>
            )}
        </Dialog>
    );
}

/* ── Singularity color map ────────────────────────────────────────────────── */
const SING_COLORS = {
    ACTOR:'#3b82f6', ORGANIZATION:'#3b82f6', CONCEPT:'#06b6d4',
    DOCUMENT:'#8b5cf6', EVENT:'#eab308', PROCESS:'#eab308',
    PERSON:'#22c55e', TECHNOLOGY:'#a855f7', POLICY:'#ef4444',
    SYSTEM:'#0891b2', WORK_ITEM:'#6b7280', default:'#6b7280',
};
const ENTITY_TYPES = ['ACTOR','CONCEPT','DOCUMENT','EVENT','PERSON','POLICY','PROCESS','SYSTEM','TECHNOLOGY','WORK_ITEM'];
const LAYERS = ['L0','L1','L2','L3','L4','L5'];

/* ── Import Dialog ────────────────────────────────────────────────────────── */

function ImportDialog({ open, onClose, onImported, existingNamespaces }) {
    const [docs,         setDocs]         = useState([]);
    const [docsLoading,  setDocsLoading]  = useState(true);
    const [searchQuery,  setSearchQuery]  = useState('');
    const [checkedDocs,  setCheckedDocs]  = useState(new Set());
    const [focusedDoc,   setFocusedDoc]   = useState(null);
    const [focusedEnts,  setFocusedEnts]  = useState([]);
    const [entLoading,   setEntLoading]   = useState(false);
    const [namespace,    setNamespace]    = useState('DEFAULT');
    const [importing,    setImporting]    = useState(false);
    const [importResult, setImportResult] = useState(null);

    useEffect(() => {
        if (!open) return;
        setDocsLoading(true);
        listDocuments({ limit: 200 })
            .then(d => setDocs(Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : []))
            .catch(() => setDocs([]))
            .finally(() => setDocsLoading(false));
    }, [open]);

    useEffect(() => {
        if (!focusedDoc) { setFocusedEnts([]); return; }
        setEntLoading(true);
        getDocumentEntities(focusedDoc.id)
            .then(ents => setFocusedEnts(Array.isArray(ents) ? ents : []))
            .catch(() => setFocusedEnts([]))
            .finally(() => setEntLoading(false));
    }, [focusedDoc]);

    const filteredDocs = useMemo(() => {
        if (!searchQuery.trim()) return docs;
        const q = searchQuery.toLowerCase();
        return docs.filter(d =>
            (d.documentTitle || '').toLowerCase().includes(q) ||
            (d.originalname  || '').toLowerCase().includes(q) ||
            (d.unSymbol      || '').toLowerCase().includes(q) ||
            (d.documentType  || '').toLowerCase().includes(q) ||
            (d.bodyOrOrgan   || '').toLowerCase().includes(q) ||
            (d.language      || '').toLowerCase().includes(q)
        );
    }, [docs, searchQuery]);

    const toggleDoc = docId => setCheckedDocs(prev => { const n = new Set(prev); n.has(docId) ? n.delete(docId) : n.add(docId); return n; });
    const toggleAll = () => setCheckedDocs(checkedDocs.size === filteredDocs.length ? new Set() : new Set(filteredDocs.map(d => d.id)));

    const handleImport = async () => {
        if (checkedDocs.size === 0) return;
        setImporting(true);
        try {
            const results = await Promise.all([...checkedDocs].map(docId => importFromDocument(docId, { namespace })));
            const totals = results.reduce((acc, r) => ({ created: acc.created + (r?.created||0), linked: acc.linked + (r?.linked||0), skipped: acc.skipped + (r?.skipped||0) }), { created: 0, linked: 0, skipped: 0 });
            setImportResult({ ...totals, docsCount: checkedDocs.size });
            onImported();
        } catch (e) { setImportResult({ error: e.response?.data?.error || e.message }); }
        finally { setImporting(false); }
    };

    const handleClose = () => {
        setSearchQuery(''); setCheckedDocs(new Set()); setFocusedDoc(null);
        setFocusedEnts([]); setImportResult(null); setNamespace('DEFAULT');
        onClose();
    };

    const DOC_FIELDS = focusedDoc ? [
        { label: 'Status',           value: focusedDoc.status,          chip: true },
        { label: 'Type',             value: focusedDoc.documentType },
        { label: 'Language',         value: focusedDoc.language },
        { label: 'Publication Date', value: focusedDoc.publicationDate },
        { label: 'Meeting Date',     value: focusedDoc.meetingDate },
        { label: 'Body / Organ',     value: focusedDoc.bodyOrOrgan },
        { label: 'Agenda',           value: focusedDoc.agenda },
        { label: 'Epistemic Layer',  value: focusedDoc.epistemicLayer },
        { label: 'Namespace',        value: focusedDoc.namespace },
        { label: 'Pages',            value: focusedDoc.pageCount },
        { label: 'Words',            value: focusedDoc.wordCount },
    ].filter(f => f.value) : [];

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth
            PaperProps={{ sx: { borderRadius: 2, height: '82vh', maxHeight: '82vh', display: 'flex', flexDirection: 'column' } }}>
            <DialogTitle sx={{ pb: 1, flexShrink: 0 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Upload size={18} />
                        <Typography variant="subtitle1" fontWeight={700}>Import Entities from Documents</Typography>
                        {checkedDocs.size > 0 && <Chip label={`${checkedDocs.size} selected`} size="small" color="primary" sx={{ fontSize: '0.7rem', height: 20 }} />}
                    </Stack>
                    <IconButton size="small" onClick={handleClose}><X size={16} /></IconButton>
                </Stack>
            </DialogTitle>
            {importResult ? (
                <DialogContent sx={{ display: 'flex', alignItems: 'flex-start', pt: 2 }}>
                    {importResult.error
                        ? <Alert severity="error" sx={{ width: '100%' }}>{importResult.error}</Alert>
                        : <Alert severity="success" icon={<CheckCircle2 size={18} />} sx={{ width: '100%' }}>
                            Imported from <strong>{importResult.docsCount}</strong> document{importResult.docsCount !== 1 ? 's' : ''}:&nbsp;
                            <strong>{importResult.created}</strong> new,&nbsp;
                            <strong>{importResult.linked}</strong> linked,&nbsp;
                            <strong>{importResult.skipped}</strong> skipped.
                          </Alert>
                    }
                </DialogContent>
            ) : (
                <DialogContent sx={{ p: 0, display: 'flex', overflow: 'hidden', flex: 1 }}>
                    <Box sx={{ width: 320, flexShrink: 0, borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <Box sx={{ p: 1.25, borderBottom: 1, borderColor: 'divider' }}>
                            <TextField size="small" fullWidth placeholder="Search by title, symbol, type…"
                                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                InputProps={{ startAdornment: <InputAdornment position="start"><Search size={13} /></InputAdornment>,
                                    endAdornment: searchQuery ? <InputAdornment position="end"><IconButton size="small" onClick={() => setSearchQuery('')}><X size={11} /></IconButton></InputAdornment> : null }} />
                        </Box>
                        <Box sx={{ px: 1.25, py: 0.6, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Checkbox size="small" sx={{ p: 0.25 }}
                                indeterminate={checkedDocs.size > 0 && checkedDocs.size < filteredDocs.length}
                                checked={filteredDocs.length > 0 && checkedDocs.size === filteredDocs.length}
                                onChange={toggleAll} />
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                {filteredDocs.length} document{filteredDocs.length !== 1 ? 's' : ''}{searchQuery ? ' (filtered)' : ''}
                            </Typography>
                        </Box>
                        <Box sx={{ flex: 1, overflowY: 'auto' }}>
                            {docsLoading ? <Box sx={{ p: 2 }}><LinearProgress /></Box> :
                             filteredDocs.length === 0 ? <Box sx={{ p: 3, textAlign: 'center' }}><Typography variant="body2" color="text.disabled">{searchQuery ? 'No matching documents' : 'No documents found'}</Typography></Box> :
                             filteredDocs.map(doc => {
                                const isChecked = checkedDocs.has(doc.id);
                                const isFocused = focusedDoc?.id === doc.id;
                                const statusColor = { COMPLETED:'#4ade80', CLASSIFIED:'#60a5fa', NEEDS_REVIEW:'#fb923c', FAILED:'#f87171', EXTRACTING:'#a78bfa', CLASSIFYING:'#a78bfa', UPLOADED:'#6b7280' }[doc.status] || '#6b7280';
                                return (
                                    <Box key={doc.id} onClick={() => setFocusedDoc(doc)}
                                        sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, px: 1, py: 0.85, cursor: 'pointer',
                                            borderBottom: '1px solid', borderColor: 'divider',
                                            bgcolor: isFocused ? 'action.selected' : 'transparent',
                                            '&:hover': { bgcolor: isFocused ? 'action.selected' : 'action.hover' } }}>
                                        <Checkbox size="small" checked={isChecked}
                                            onClick={e => { e.stopPropagation(); toggleDoc(doc.id); }}
                                            sx={{ mt: 0, p: 0.25, flexShrink: 0 }} />
                                        <Box flex={1} minWidth={0}>
                                            <Typography variant="body2" noWrap sx={{ fontSize: '0.79rem', fontWeight: isFocused ? 600 : 400, color: isFocused ? 'primary.main' : 'text.primary' }}>
                                                {doc.documentTitle || doc.originalname || doc.id}
                                            </Typography>
                                            <Stack direction="row" spacing={0.5} mt={0.3} alignItems="center" flexWrap="wrap">
                                                {doc.unSymbol && <Typography sx={{ fontSize: '0.62rem', color: '#93c5fd', fontFamily: 'monospace', bgcolor: '#1e3a5f40', px: 0.5, borderRadius: 0.4, lineHeight: 1.6 }}>{doc.unSymbol}</Typography>}
                                                {doc.documentType && <Typography sx={{ fontSize: '0.62rem', color: '#94a3b8' }}>{doc.documentType}</Typography>}
                                                {doc.language && <Chip label={doc.language} size="small" sx={{ fontSize: '0.58rem', height: 15, px: 0.25 }} />}
                                                <Tooltip title={doc.status || ''} placement="top">
                                                    <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: statusColor, flexShrink: 0 }} />
                                                </Tooltip>
                                            </Stack>
                                        </Box>
                                    </Box>
                                );
                            })}
                        </Box>
                    </Box>
                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {!focusedDoc ? (
                            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Stack alignItems="center" spacing={1.5} sx={{ opacity: 0.35 }}>
                                    <FileText size={44} />
                                    <Typography variant="body2" color="text.disabled">Click a document to preview details</Typography>
                                </Stack>
                            </Box>
                        ) : (
                            <Box sx={{ flex: 1, overflowY: 'auto', p: 2.5 }}>
                                <Stack spacing={0.75} mb={2}>
                                    <Typography variant="subtitle2" fontWeight={700} sx={{ fontSize: '0.95rem', lineHeight: 1.35 }}>
                                        {focusedDoc.documentTitle || focusedDoc.originalname}
                                    </Typography>
                                    {focusedDoc.unSymbol && (
                                        <Box sx={{ display: 'inline-flex' }}>
                                            <Typography sx={{ fontSize: '0.76rem', fontFamily: 'monospace', color: '#93c5fd', bgcolor: '#1e3a5f', px: 1, py: 0.35, borderRadius: 0.75, letterSpacing: '0.03em' }}>{focusedDoc.unSymbol}</Typography>
                                        </Box>
                                    )}
                                </Stack>
                                <Stack spacing={0} divider={<Divider sx={{ opacity: 0.4 }} />}>
                                    {DOC_FIELDS.map(f => (
                                        <Box key={f.label} sx={{ display: 'flex', gap: 1.5, py: 0.7, alignItems: 'flex-start' }}>
                                            <Typography variant="caption" color="text.disabled" sx={{ minWidth: 120, fontSize: '0.68rem', pt: 0.15, flexShrink: 0 }}>{f.label}</Typography>
                                            {f.chip
                                                ? <Chip label={f.value} size="small" color="success" sx={{ fontSize: '0.65rem', height: 18 }} />
                                                : <Typography variant="caption" sx={{ fontSize: '0.76rem', color: 'text.secondary', lineHeight: 1.4 }}>{f.value}</Typography>
                                            }
                                        </Box>
                                    ))}
                                </Stack>
                                <Divider sx={{ my: 2 }} />
                                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>Extracted Entities</Typography>
                                {entLoading ? <LinearProgress sx={{ mt: 1 }} /> :
                                 focusedEnts.length === 0 ? <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.75, fontSize: '0.73rem' }}>No entities extracted yet</Typography> : (
                                    <>
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, mb: 1.25, fontSize: '0.72rem' }}>
                                            {focusedEnts.length} entities{focusedEnts.filter(e => e.esEntityId).length > 0 && ` · ${focusedEnts.filter(e => e.esEntityId).length} already in ES`}
                                        </Typography>
                                        <Stack direction="row" flexWrap="wrap" gap={0.6}>
                                            {focusedEnts.slice(0, 50).map(e => {
                                                const c = PALETTE[(e.type||'').toUpperCase()] || PALETTE.default;
                                                return <Chip key={e.id} label={e.name} size="small" sx={{ fontSize: '0.63rem', height: 20, bgcolor: c.border + '25', border: `1px solid ${c.border}55`, color: c.text, textDecoration: e.esEntityId ? 'underline' : 'none' }} />;
                                            })}
                                            {focusedEnts.length > 50 && <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem', alignSelf: 'center' }}>+{focusedEnts.length - 50} more</Typography>}
                                        </Stack>
                                    </>
                                )}
                            </Box>
                        )}
                    </Box>
                </DialogContent>
            )}
            <DialogActions sx={{ px: 2, py: 1.25, borderTop: 1, borderColor: 'divider', gap: 1, flexShrink: 0 }}>
                {!importResult && (() => {
                    const opts = Array.isArray(existingNamespaces) ? existingNamespaces : [];
                    const allOpts = opts.length === 0 || !opts.includes('DEFAULT') ? ['DEFAULT', ...opts] : opts;
                    return (
                        <FormControl size="small" sx={{ width: 210 }}>
                            <InputLabel>Target namespace</InputLabel>
                            <Select label="Target namespace" value={allOpts.includes(namespace) ? namespace : allOpts[0]} onChange={e => setNamespace(e.target.value)}>
                                {allOpts.map(ns => <MenuItem key={ns} value={ns}>{ns}</MenuItem>)}
                            </Select>
                        </FormControl>
                    );
                })()}
                <Box flex={1} />
                <Button onClick={handleClose} size="small">{importResult ? 'Close' : 'Cancel'}</Button>
                {!importResult && (
                    <Button variant="contained" size="small" onClick={handleImport}
                        disabled={importing || checkedDocs.size === 0}
                        startIcon={importing ? <CircularProgress size={14} /> : <Upload size={14} />}>
                        {importing ? 'Importing…' : `Import from ${checkedDocs.size} doc${checkedDocs.size !== 1 ? 's' : ''}`}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}

/* ── Edit/Create Entity Dialog ────────────────────────────────────────────── */

function EntityDialog({ open, entity, namespaces, onClose, onSaved }) {
    const isNew = !entity?.id;
    const [form,   setForm]   = useState({ name:'', type:'CONCEPT', namespace:'DEFAULT', description:'', epistemicLayer:'', category:'' });
    const [saving, setSaving] = useState(false);
    const [error,  setError]  = useState(null);

    useEffect(() => {
        if (entity) setForm({ name: entity.name||'', type: entity.type||'CONCEPT', namespace: entity.namespace||'DEFAULT', description: entity.description||'', epistemicLayer: entity.epistemicLayer||'', category: entity.category||'' });
        else setForm({ name:'', type:'CONCEPT', namespace:'DEFAULT', description:'', epistemicLayer:'', category:'' });
        setError(null);
    }, [entity, open]);

    const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

    const handleSave = async () => {
        if (!form.name.trim()) { setError('Name is required'); return; }
        setSaving(true); setError(null);
        try {
            if (isNew) await createEntity(form); else await updateEntity(entity.id, form);
            onSaved(); onClose();
        } catch (e) { setError(e.response?.data?.error || e.message); }
        finally { setSaving(false); }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
            <DialogTitle>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography variant="subtitle1" fontWeight={700}>{isNew ? 'New Entity' : 'Edit Entity'}</Typography>
                    <IconButton size="small" onClick={onClose}><X size={16} /></IconButton>
                </Stack>
            </DialogTitle>
            <DialogContent sx={{ pt: 2 }}>
                <Stack spacing={2}>
                    {error && <Alert severity="error" sx={{ py: 0.25 }}>{error}</Alert>}
                    <TextField label="Name" value={form.name} onChange={set('name')} fullWidth size="small" required />
                    <FormControl fullWidth size="small">
                        <InputLabel>Type</InputLabel>
                        <Select label="Type" value={form.type} onChange={set('type')}>
                            {ENTITY_TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <Autocomplete freeSolo options={Array.isArray(namespaces) ? namespaces : []} value={form.namespace}
                        onInputChange={(_, v) => setForm(p => ({ ...p, namespace: v }))}
                        renderInput={p => <TextField {...p} label="Namespace" size="small" />} />
                    <TextField label="Description" value={form.description} onChange={set('description')} fullWidth size="small" multiline rows={2} />
                    <FormControl fullWidth size="small">
                        <InputLabel>Epistemic Layer</InputLabel>
                        <Select label="Epistemic Layer" value={form.epistemicLayer} onChange={set('epistemicLayer')}>
                            <MenuItem value="">—</MenuItem>
                            {LAYERS.map(l => <MenuItem key={l} value={l}>{l}</MenuItem>)}
                        </Select>
                    </FormControl>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 2, py: 1.5 }}>
                <Button onClick={onClose} size="small">Cancel</Button>
                <Button variant="contained" size="small" onClick={handleSave} disabled={saving}
                    startIcon={saving ? <CircularProgress size={14} /> : null}>
                    {saving ? 'Saving…' : 'Save'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/* ── Delete Namespace Dialog ──────────────────────────────────────────────── */

function DeleteNsDialog({ open, namespace, onClose, onDeleted }) {
    const [loading, setLoading] = useState(false);
    const handleDelete = async () => {
        setLoading(true);
        try { await deleteNamespace(namespace); onDeleted(); onClose(); }
        catch (_) { setLoading(false); }
    };
    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
            <DialogTitle>Delete Namespace</DialogTitle>
            <DialogContent>
                <Alert severity="warning" icon={<AlertTriangle size={18} />}>
                    Delete namespace <strong>{namespace}</strong>? All entities in it will be permanently removed.
                </Alert>
            </DialogContent>
            <DialogActions sx={{ px: 2, py: 1.5 }}>
                <Button onClick={onClose} size="small">Cancel</Button>
                <Button variant="contained" color="error" size="small" onClick={handleDelete} disabled={loading}>
                    {loading ? 'Deleting…' : 'Delete'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/* ── Tab bar component ────────────────────────────────────────────────────── */

function TabBar({ tabs, activeTabId, onSelect, onClose }) {
    return (
        <Box sx={{
            display: 'flex', alignItems: 'stretch', overflow: 'hidden',
            borderBottom: '1px solid', borderColor: 'divider',
            minHeight: 34, flexShrink: 0, bgcolor: '#0a0e17',
        }}>
            {tabs.map(tab => {
                const isActive = tab.id === activeTabId;
                const isGlobal = tab.type === 'global';
                return (
                    <Box key={tab.id} onClick={() => onSelect(tab.id)}
                        sx={{
                            display: 'flex', alignItems: 'center', gap: 0.5,
                            px: 1.25, cursor: 'pointer', flexShrink: 0, maxWidth: 180,
                            borderRight: '1px solid', borderColor: 'divider',
                            borderBottom: isActive ? '2px solid #6366f1' : '2px solid transparent',
                            bgcolor: isActive ? '#1e1e2e' : 'transparent',
                            '&:hover': { bgcolor: isActive ? '#1e1e2e' : '#11151f' },
                        }}>
                        {tab.loading ? (
                            <CircularProgress size={10} thickness={5} style={{ color: '#6366f1', flexShrink: 0 }} />
                        ) : tab.type === 'node-centered' ? (
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#6366f1', flexShrink: 0 }} />
                        ) : tab.type === 'path-result' ? (
                            <Route size={10} style={{ color: '#FBBF24', flexShrink: 0 }} />
                        ) : (
                            <Network size={10} style={{ color: '#94a3b8', flexShrink: 0 }} />
                        )}
                        <Typography sx={{
                            fontSize: '0.72rem', fontWeight: isActive ? 600 : 400,
                            color: isActive ? '#e2e8f0' : '#64748b',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            maxWidth: 130,
                        }}>
                            {tab.label}
                        </Typography>
                        {!isGlobal && (
                            <IconButton size="small" onClick={e => { e.stopPropagation(); onClose(tab.id); }}
                                sx={{ p: 0.15, color: '#94a3b8', '&:hover': { color: '#e2e8f0', bgcolor: '#ef444420' }, ml: 0.25 }}>
                                <X size={10} />
                            </IconButton>
                        )}
                    </Box>
                );
            })}
        </Box>
    );
}

/* ── Main Page ────────────────────────────────────────────────────────────── */

export default function EntityStorePage() {
    /* ── Entity list state ── */
    const [entities,       setEntities]       = useState([]);
    const [graphData,      setGraphData]       = useState(null);
    const [namespaces,     setNamespaces]      = useState([]);
    const [loading,        setLoading]         = useState(false);
    const [graphLoading,   setGraphLoading]    = useState(false);
    const [filterNs,       setFilterNs]        = useState('');
    const [filterType,     setFilterType]      = useState('');
    const [search,         setSearch]          = useState('');
    const [selectedId,     setSelectedId]      = useState(null);
    const [selectedEdge,   setSelectedEdge]    = useState(null);
    const [showGraphTools, setShowGraphTools]  = useState(false);
    const [importOpen,     setImportOpen]      = useState(false);
    const [editEntity,     setEditEntity]      = useState(null);
    const [deleteNs,       setDeleteNs]        = useState(null);
    const [deleteEntityId, setDeleteEntityId]  = useState(null);
    const [deleteLoading,  setDeleteLoading]   = useState(false);
    const [entPage,        setEntPage]         = useState(0);

    /* ── View mode (for global tab) ── */
    const [viewMode, setViewMode] = useState('reactflow');

    /* ── Router ── */
    const { entityId: urlEntityId }  = useParams();
    const [searchParams]             = useSearchParams();
    const navigate                   = useNavigate();
    const urlDepth                   = Math.max(1, Math.min(6, parseInt(searchParams.get('depth') || '2', 10)));

    /* ── Tab system ── */
    const [tabs,        setTabs]        = useState([makeGlobalTab()]);
    const [activeTabId, setActiveTabId] = useState('global');

    // Stable ref so callbacks don't re-create on every tab change
    const tabsRef = useRef(tabs);
    useEffect(() => { tabsRef.current = tabs; }, [tabs]);

    const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId) || tabs[0], [tabs, activeTabId]);

    const activeGraphData = useMemo(() =>
        activeTab.type === 'global' ? graphData : activeTab.graphData,
    [activeTab, graphData]);

    const selectedEntityObj = useMemo(() => {
        if (!selectedId) return null;
        return entities.find(e => e.id === selectedId)
            || activeGraphData?.entities?.find(e => e.id === selectedId)
            || null;
    }, [selectedId, entities, activeGraphData]);

    /* ── BFS path glow: from URL entity → selected entity ── */
    const [pathNodeIds, pathEdgePairs] = useMemo(() => {
        if (!urlEntityId || !selectedId || urlEntityId === selectedId) return [null, null];
        const path = bfsPath(activeGraphData, urlEntityId, selectedId);
        if (!path) return [null, null];
        const nodeIds   = new Set(path);
        const edgePairs = new Set();
        for (let i = 0; i < path.length - 1; i++) {
            edgePairs.add(`${path[i]}|${path[i + 1]}`);
            edgePairs.add(`${path[i + 1]}|${path[i]}`);
        }
        return [nodeIds, edgePairs];
    }, [urlEntityId, selectedId, activeGraphData]);

    const updateTab = useCallback((tabId, updates) => {
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, ...updates } : t));
    }, []);

    // Select a tab and sync the URL
    const handleTabSelect = useCallback((tabId) => {
        setActiveTabId(tabId);
        const tab = tabsRef.current.find(t => t.id === tabId);
        if (!tab) return;
        if (tab.id === 'global') {
            navigate('/entity-store');
        } else if (tab.centerId) {
            navigate(`/entity-store/${tab.centerId}?depth=${tab.depth || 2}`);
        }
    }, [navigate]);

    // Close a tab; navigate to /entity-store if closing the active one
    const closeTab = useCallback((tabId) => {
        if (tabId === 'global') return;
        const isActive = tabId === activeTabId;
        setTabs(prev => prev.filter(t => t.id !== tabId));
        if (isActive) {
            setActiveTabId('global');
            navigate('/entity-store');
        }
    }, [activeTabId, navigate]);

    /* ── DocRef sidebar ── */
    const [docRefs,            setDocRefs]            = useState([]);
    const [docRefsLoading,     setDocRefsLoading]     = useState(false);

    const loadDocRefs = useCallback(async () => {
        setDocRefsLoading(true);
        try {
            const refs = await getDocumentRefs(filterNs || null);
            setDocRefs(Array.isArray(refs) ? refs : []);
        } catch (_) { setDocRefs([]); }
        finally { setDocRefsLoading(false); }
    }, [filterNs]);

    useEffect(() => { loadDocRefs(); }, [loadDocRefs]);

    /* ── Extract DOCUMENTREF ── */
    const [extractTarget, setExtractTarget] = useState(null);
    const [activeJobs,    setActiveJobs]    = useState(new Map());
    const globalEsRef = useRef(null);

    /* ── Viewport restore tracking after extraction ── */
    const pendingRestoreRef = useRef(null); // { viewport, focusNodeId }

    /* ── Time-range filter ── */
    const [timeFilterOpen,  setTimeFilterOpen]  = useState(false);
    const [timeFrom,        setTimeFrom]        = useState('');
    const [timeTo,          setTimeTo]          = useState('');
    const [appliedTimeFrom, setAppliedTimeFrom] = useState('');
    const [appliedTimeTo,   setAppliedTimeTo]   = useState('');
    const [glowAppliedAt,   setGlowAppliedAt]   = useState(null);

    /* ── LOD / Pyramid ── */
    const pyramidStatus       = useEntityStore(s => s.pyramidStatus);
    const setPyramidStatus    = useEntityStore(s => s.setPyramidStatus);
    const buildAndLayoutStore = useEntityStore(s => s.buildAndLayoutPyramid);
    const isBuilding          = useEntityStore(s => s.isLoading);

    const pyramidExists = !!(pyramidStatus?.levels?.length);
    const activeNs      = filterNs || (namespaces[0] ?? null);

    useEffect(() => {
        if (!activeNs) return;
        getPyramidStatus(activeNs)
            .then(s => setPyramidStatus(s))
            .catch(() => setPyramidStatus(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeNs]);

    const handleBuildPyramid = useCallback(async () => {
        if (!activeNs) return;
        await buildAndLayoutStore(activeNs);
    }, [activeNs, buildAndLayoutStore]);

    /* ── Data loading ── */

    const loadAll = useCallback(async () => {
        setLoading(true);
        const [ents, nss] = await Promise.all([
            listEntities({ namespace: filterNs || null, type: filterType || null, search: search || null }).catch(() => null),
            listNamespaces().catch(() => null),
        ]);
        if (Array.isArray(ents)) setEntities(ents);
        if (Array.isArray(nss))  setNamespaces(nss.map(n => n.namespace));
        setLoading(false);
    }, [filterNs, filterType, search]);

    const loadGraph = useCallback(async () => {
        setGraphLoading(true);
        const gd = await getEntityGraph(filterNs || null).catch(() => null);
        if (gd) setGraphData(gd);
        setGraphLoading(false);
    }, [filterNs]);

    const handleShow = useCallback(async () => {
        setGraphLoading(true);
        const gd = await getEntityGraph(filterNs || null).catch(() => null);
        if (gd) setGraphData(gd);
        setGraphLoading(false);
        setAppliedTimeFrom(timeFrom);
        setAppliedTimeTo(timeTo);
        setGlowAppliedAt(Date.now());
    }, [filterNs, timeFrom, timeTo]);

    useEffect(() => { loadAll(); }, [loadAll]);
    useEffect(() => { setEntPage(0); }, [filterNs, filterType, search]);
    // Graph is NOT auto-loaded — triggered manually via "Load Global" button

    /* ── Data date range hint ── */
    const dataDateRange = useMemo(() => {
        if (!graphData?.entities?.length) return null;
        let minT = Infinity, maxT = -Infinity;
        for (const e of graphData.entities) {
            if (!e.createdAt) continue;
            const t = new Date(e.createdAt).getTime();
            if (t < minT) minT = t;
            if (t > maxT) maxT = t;
        }
        if (!isFinite(minT)) return null;
        const toLocal = ms => { const d = new Date(ms); const p = n => String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
        const label   = ms => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        return { minInput: toLocal(minT), maxInput: toLocal(maxT), label: `${label(minT)} – ${label(maxT)}` };
    }, [graphData]);

    /* ── Time-range glow set ── */
    const glowSet = useMemo(() => {
        if (!timeFilterOpen || (!appliedTimeFrom && !appliedTimeTo)) return null;
        if (!graphData?.entities?.length) return null;
        const from = appliedTimeFrom ? new Date(appliedTimeFrom).getTime() : -Infinity;
        const to   = appliedTimeTo   ? new Date(appliedTimeTo).getTime()   :  Infinity;
        const ids  = new Set();
        for (const e of graphData.entities) {
            if (!e.createdAt) continue;
            const t = new Date(e.createdAt).getTime();
            if (t >= from && t <= to) ids.add(e.id);
        }
        return ids;
    }, [timeFilterOpen, appliedTimeFrom, appliedTimeTo, graphData]);

    /* ── Singularity data ── */
    const singularityData = useMemo(() => {
        if (!graphData) return null;
        return {
            nodes: graphData.entities.map(e => ({
                id: e.id, name: e.name, type: (e.type || 'workItem').toLowerCase(),
                val: e.mentionCount > 0 ? 10 : 6,
                color: SING_COLORS[(e.type || '').toUpperCase()] || '#6b7280',
                level: 0, loaded: true, hasSubGraph: false, data: e,
            })),
            links: graphData.relationships
                .filter(r => r.sourceId && r.targetId)
                .map(r => ({ source: r.sourceId, target: r.targetId, type: r.relType || 'RELATED_TO' })),
        };
    }, [graphData]);

    /* ── Extract DOCUMENTREF handler ── */
    const handleExtractRef = useCallback((entityId, label) => {
        const ent = entities.find(e => e.id === entityId) || null;
        setExtractTarget({ entityId, label, provenanceDocId: ent?.provenanceDocId || null });
    }, [entities]);

    const registerJob = useCallback((entityId, jobId) => {
        setActiveJobs(prev => {
            const next = new Map(prev);
            next.set(entityId, { jobId, status: 'running', progress: 0, onViewProgress: () => setExtractTarget({ entityId, jobId, viewOnly: true }) });
            return next;
        });

        if (!globalEsRef.current) {
            globalEsRef.current = connectStream({
                onJob: (payload) => {
                    setActiveJobs(prev => {
                        const entry = [...prev.entries()].find(([, j]) => j.jobId === payload.jobId);
                        if (!entry) return prev;
                        const [eId, job] = entry;
                        const isDone = payload.phase === 'completed' || payload.status === 'completed' || payload.phase === 'failed';
                        if (isDone) {
                            const next = new Map(prev);
                            next.delete(eId);
                            if (next.size === 0) { globalEsRef.current?.close(); globalEsRef.current = null; }
                            return next;
                        }
                        const next = new Map(prev);
                        next.set(eId, { ...job, status: payload.status || job.status, progress: payload.progress ?? job.progress });
                        return next;
                    });
                },
            });
        }
    }, []);

    useEffect(() => { return () => globalEsRef.current?.close(); }, []);

    /* ── Open node-centered tab (stable — reads tabs via ref) ── */
    const handleCenterOnNode = useCallback(async (entityId, label, depth) => {
        const d = Math.max(1, Math.min(6, depth ?? 2));

        // Reuse an existing tab for the same entity instead of duplicating
        const existing = tabsRef.current.find(t => t.centerId === entityId);
        if (existing) {
            setActiveTabId(existing.id);
            navigate(`/entity-store/${entityId}?depth=${existing.depth}`);
            return;
        }

        const newTab = makeNodeCenteredTab(entityId, label || entityId, d);
        setTabs(prev => [...prev, newTab]);
        setActiveTabId(newTab.id);
        navigate(`/entity-store/${entityId}?depth=${d}`);

        try {
            const data = await getEntitySubgraph(entityId, d);
            const name = data.entities?.find(e => e.id === entityId)?.name || label || entityId;
            setTabs(prev => prev.map(t =>
                t.id === newTab.id ? { ...t, graphData: data, loading: false, label: name } : t
            ));
        } catch (_) {
            setTabs(prev => prev.map(t => t.id === newTab.id ? { ...t, loading: false } : t));
        }
    }, [navigate]);

    /* ── Reload node-centered tab with new depth — updates URL depth param ── */
    const handleReloadNodeCenteredTab = useCallback(async (tabId, centerId, newDepth) => {
        updateTab(tabId, { loading: true, depth: newDepth });
        // Reflect new depth in the URL (replace so back-button isn't polluted)
        if (tabId === activeTabId) {
            navigate(`/entity-store/${centerId}?depth=${newDepth}`, { replace: true });
        }
        try {
            const data = await getEntitySubgraph(centerId, newDepth);
            setTabs(prev => prev.map(t => t.id === tabId
                ? { ...t, graphData: data, loading: false, depth: newDepth, focusNodeId: centerId, focusKey: (t.focusKey || 0) + 1 }
                : t
            ));
        } catch (_) {
            updateTab(tabId, { loading: false });
        }
    }, [updateTab, activeTabId, navigate]);

    /* ── URL → tab sync: deep links, browser back/forward, shared URLs ──────
     * Runs when urlEntityId or urlDepth changes (i.e. the browser URL changes).
     * Does NOT call navigate() — the URL is already correct.
     * Creates a tab if one doesn't exist yet; otherwise just activates the existing one.
     */
    useEffect(() => {
        if (!urlEntityId) {
            // /entity-store → activate global tab
            setActiveTabId('global');
            return;
        }

        const existing = tabsRef.current.find(t => t.centerId === urlEntityId);
        if (existing) {
            setActiveTabId(existing.id);
            return;
        }

        // No tab for this entity yet — create one (deep link / shared URL case)
        const depth = urlDepth;
        const newTab = makeNodeCenteredTab(urlEntityId, urlEntityId, depth);
        setTabs(prev => [...prev, newTab]);
        setActiveTabId(newTab.id);

        getEntitySubgraph(urlEntityId, depth)
            .then(data => {
                const name = data.entities?.find(e => e.id === urlEntityId)?.name || urlEntityId;
                setTabs(prev => prev.map(t =>
                    t.id === newTab.id ? { ...t, graphData: data, loading: false, label: name } : t
                ));
            })
            .catch(() => {
                setTabs(prev => prev.map(t => t.id === newTab.id ? { ...t, loading: false } : t));
            });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [urlEntityId, urlDepth]);

    /* ── Focus node from DocRef sidebar ── */
    const handleFocusNode = useCallback((nodeId) => {
        // Switch to global tab to show node
        setActiveTabId('global');
        setSelectedId(nodeId);
        setTabs(prev => prev.map(t => t.id === 'global'
            ? { ...t, selectedId: nodeId, focusNodeId: nodeId, focusKey: (t.focusKey || 0) + 1 }
            : t
        ));
        const el = document.getElementById(`es-item-${nodeId}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, []);

    /* ── Node select from graph ── */
    const makeNodeSelectHandler = useCallback((tabId) => (nodeId) => {
        setSelectedId(nodeId);
        setSelectedEdge(null);
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, selectedId: nodeId } : t));
        const el = document.getElementById(`es-item-${nodeId}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, []);

    /* ── Edge select / deselect ── */
    const handleEdgeSelect = useCallback((edgeData) => {
        setSelectedEdge(edgeData || null);
        if (edgeData) setSelectedId(null);
    }, []);

    const handleDeselect = useCallback(() => {
        setSelectedId(null);
        setSelectedEdge(null);
    }, []);

    /* ── Path Finder: open result in a new tab ── */
    const handleOpenPathTab = useCallback((result, fromEntity, toEntity, initialPathIndex = 0) => {
        const tab = makePathResultTab(fromEntity, toEntity, result.paths, result, initialPathIndex);
        setTabs(prev => [...prev, tab]);
        setActiveTabId(tab.id);
    }, []);

    /* ── Path result tab: change selected path ── */
    const handleSelectPathIndex = useCallback((tabId, index) => {
        setTabs(prev => prev.map(t => {
            if (t.id !== tabId) return t;
            const { pathNodeIds, pathEdgePairs } = computePathGlow(t.paths?.[index]);
            return { ...t, selectedPathIndex: index, pathNodeIds, pathEdgePairs };
        }));
    }, []);

    /* ── Viewport change (save per tab) ── */
    const makeViewportChangeHandler = useCallback((tabId) => (viewport) => {
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, savedViewport: viewport } : t));
    }, []);

    /* ── Layout complete (for viewport restore after extraction) ── */
    const handleLayoutComplete = useCallback(() => {
        if (!pendingRestoreRef.current) return;
        const { viewport, focusNodeId } = pendingRestoreRef.current;
        pendingRestoreRef.current = null;
        setTabs(prev => prev.map(t => {
            if (t.id !== 'global') return t;
            return { ...t, restoreViewport: viewport, focusNodeId, focusKey: (t.focusKey || 0) + 1 };
        }));
    }, []);

    /* ── Clear restoreViewport after EntityGraph2D restores it ── */
    const handleRestoreViewportDone = useCallback((tabId) => () => {
        updateTab(tabId, { restoreViewport: null });
    }, [updateTab]);

    /* ── Delete entity ── */
    const handleDeleteEntity = async id => {
        setDeleteLoading(true);
        try { await deleteEntity(id); await Promise.all([loadAll(), loadGraph()]); }
        catch (_) {}
        setDeleteLoading(false);
        setDeleteEntityId(null);
    };

    const nsOptions = namespaces;
    const allNamespaces = ['', ...nsOptions];

    /* ── Shared EntityGraph2D renderer for a tab ── */
    const renderTabGraph = useCallback((tab) => {
        const isGlobalTab = tab.type === 'global';
        const data        = isGlobalTab ? graphData : tab.graphData;
        const isLoading   = isGlobalTab ? graphLoading : tab.loading;

        if (isLoading && !data) {
            return (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    <CircularProgress size={28} />
                </Box>
            );
        }

        if (isGlobalTab && viewMode === 'lod') {
            if (!pyramidExists) {
                return (
                    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                        <Stack alignItems="center" spacing={2} sx={{ maxWidth: 360, textAlign: 'center' }}>
                            <Layers sx={{ fontSize: 48, opacity: 0.2 }} />
                            <Typography variant="body1" fontWeight={600}>No Knowledge Map</Typography>
                            <Typography variant="body2" color="text.secondary">Build the cluster pyramid to enable LOD viewport rendering.</Typography>
                            {activeNs && (
                                <Button variant="contained" size="small" onClick={handleBuildPyramid}
                                    disabled={isBuilding}
                                    startIcon={isBuilding ? <CircularProgress size={14} /> : <Layers sx={{ fontSize: 14 }} />}>
                                    {isBuilding ? 'Building…' : `Build Map for "${activeNs}"`}
                                </Button>
                            )}
                        </Stack>
                    </Box>
                );
            }
            return (
                <EntityGraph2D
                    lodMode={true}
                    namespace={activeNs}
                    selectedId={tab.selectedId}
                    onNodeSelect={makeNodeSelectHandler(tab.id)}
                    onEdgeSelect={handleEdgeSelect}
                    onCenterOnNode={handleCenterOnNode}
                    searchQuery={tab.searchQuery}
                    glowDepth={tab.glowDepth}
                    focusNodeId={tab.focusNodeId}
                    focusKey={tab.focusKey}
                    onViewportChange={makeViewportChangeHandler(tab.id)}
                    restoreViewport={tab.restoreViewport}
                    onRestoreViewportDone={handleRestoreViewportDone(tab.id)}
                    pathNodeIds={pathNodeIds}
                    pathEdgePairs={pathEdgePairs}
                />
            );
        }

        if (isGlobalTab && viewMode === 'singularity') {
            return singularityData ? (
                <Box sx={{ height: '100%', overflow: 'hidden' }}>
                    <SingularityGraph externalData={singularityData} />
                </Box>
            ) : null;
        }

        // Global tab — graph not loaded yet → show prompt
        if (isGlobalTab && data === null) {
            return (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    <Stack alignItems="center" spacing={2} sx={{ opacity: 0.7 }}>
                        <Network size={52} style={{ opacity: 0.15 }} />
                        <Typography variant="body2" color="text.disabled" sx={{ fontSize: '0.85rem' }}>
                            Global graph not loaded
                        </Typography>
                        <Button size="small" variant="outlined" startIcon={<Network size={13} />}
                            onClick={loadGraph} disabled={graphLoading}>
                            {graphLoading ? 'Loading…' : 'Load Global Graph'}
                        </Button>
                    </Stack>
                </Box>
            );
        }

        // Global tab — loaded but empty
        if (!data || (isGlobalTab && (!data.entities || data.entities.length === 0))) {
            return (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    <Stack alignItems="center" spacing={1}>
                        <Network size={36} style={{ opacity: 0.2 }} />
                        <Typography variant="body2" color="text.disabled">No entities to display</Typography>
                        <Button size="small" variant="text" startIcon={<RefreshCw size={12} />}
                            onClick={loadGraph} disabled={graphLoading}>
                            Reload
                        </Button>
                    </Stack>
                </Box>
            );
        }

        // For path-result tabs use stored per-tab path glow; otherwise use BFS glow
        const effectivePathNodeIds  = tab.type === 'path-result' ? tab.pathNodeIds  : pathNodeIds;
        const effectivePathEdgePairs = tab.type === 'path-result' ? tab.pathEdgePairs : pathEdgePairs;

        const graph = (
            <EntityGraph2D
                graphData={data}
                selectedId={tab.selectedId}
                onNodeSelect={makeNodeSelectHandler(tab.id)}
                onEdgeSelect={handleEdgeSelect}
                onLayoutComplete={isGlobalTab ? handleLayoutComplete : undefined}
                onExtractRef={isGlobalTab ? handleExtractRef : undefined}
                activeJobs={isGlobalTab ? activeJobs : undefined}
                glowSet={isGlobalTab ? glowSet : undefined}
                glowAppliedAt={isGlobalTab ? glowAppliedAt : undefined}
                onCenterOnNode={handleCenterOnNode}
                searchQuery={tab.searchQuery}
                glowDepth={tab.glowDepth}
                focusNodeId={tab.focusNodeId}
                focusKey={tab.focusKey}
                onViewportChange={makeViewportChangeHandler(tab.id)}
                restoreViewport={tab.restoreViewport}
                onRestoreViewportDone={handleRestoreViewportDone(tab.id)}
                pathNodeIds={effectivePathNodeIds}
                pathEdgePairs={effectivePathEdgePairs}
            />
        );

        if (tab.type !== 'path-result') return graph;

        // Path-result tab: graph + paths selector overlay
        return (
            <Box sx={{ position: 'relative', height: '100%' }}>
                {graph}
                <PathSelectorOverlay
                    paths={tab.paths}
                    selectedIndex={tab.selectedPathIndex ?? 0}
                    onSelect={(idx) => handleSelectPathIndex(tab.id, idx)}
                    fromEntity={tab.fromEntity}
                    toEntity={tab.toEntity}
                />
            </Box>
        );
    }, [
        graphData, graphLoading, viewMode, pyramidExists, activeNs, singularityData,
        activeJobs, glowSet, glowAppliedAt, handleLayoutComplete, handleExtractRef,
        handleCenterOnNode, makeNodeSelectHandler, handleEdgeSelect, makeViewportChangeHandler,
        handleRestoreViewportDone, handleBuildPyramid, isBuilding,
        pathNodeIds, pathEdgePairs, handleSelectPathIndex,
    ]);

    /* ── Render ── */
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

            {/* ── Header ── */}
            <Box sx={{ px: 3, py: 1.5, borderBottom: 1, borderColor: 'divider',
                display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                <Archive size={22} style={{ opacity: 0.7 }} />
                <Typography variant="h6" fontWeight={700}>Entity Store</Typography>
                <Divider orientation="vertical" flexItem />

                {/* Namespace tabs */}
                <Stack direction="row" spacing={0.5} flexWrap="wrap" alignItems="center">
                    {allNamespaces.map(ns => (
                        <Chip key={ns || '_all'} label={ns || 'All'} size="small"
                            onClick={() => setFilterNs(ns)}
                            variant={filterNs === ns ? 'filled' : 'outlined'}
                            color={filterNs === ns ? 'primary' : 'default'}
                            sx={{ fontSize: '0.72rem', cursor: 'pointer' }}
                            onDelete={ns && filterNs !== ns ? () => setDeleteNs(ns) : undefined}
                        />
                    ))}
                </Stack>

                <Box flex={1} />

                {/* Load Global Graph — explicit trigger, only relevant on the global tab */}
                {activeTab.type === 'global' && (
                    <Tooltip title={graphData ? 'Reload the full entity graph' : 'Load the full entity graph into the Global tab'}>
                        <span>
                            <Button
                                size="small"
                                variant={graphData ? 'outlined' : 'contained'}
                                color={graphData ? 'inherit' : 'primary'}
                                startIcon={graphLoading ? <CircularProgress size={13} thickness={5} /> : <Network size={13} />}
                                onClick={loadGraph}
                                disabled={graphLoading}
                                sx={{ fontSize: '0.75rem', py: 0.4 }}
                            >
                                {graphLoading ? 'Loading…' : graphData ? 'Reload Graph' : 'Load Global'}
                            </Button>
                        </span>
                    </Tooltip>
                )}

                <Tooltip title="Refresh entity list">
                    <IconButton size="small" onClick={() => { loadAll(); loadDocRefs(); }} disabled={loading}>
                        <RefreshCw size={15} />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Graph Tools — route finder, neighborhood explorer">
                    <IconButton size="small"
                        onClick={() => setShowGraphTools(true)}
                        sx={{ color: showGraphTools ? '#FBBF24' : 'inherit',
                              bgcolor: showGraphTools ? '#FBBF2415' : 'transparent' }}>
                        <Route size={15} />
                    </IconButton>
                </Tooltip>
                <Button size="small" variant="outlined" startIcon={<Plus size={14} />} onClick={() => setEditEntity({})}>
                    New Entity
                </Button>
                <Button size="small" variant="contained" startIcon={<Upload size={14} />} onClick={() => setImportOpen(true)}>
                    Import from Doc
                </Button>
            </Box>

            {/* ── Body ── */}
            <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                {/* ── GRAPH PANEL (full width — floating panels overlay) ── */}
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

                    {/* Tab bar */}
                    <TabBar
                        tabs={tabs}
                        activeTabId={activeTabId}
                        onSelect={handleTabSelect}
                        onClose={closeTab}
                    />

                    {/* Graph toolbar */}
                    <Box sx={{ px: 2, py: 0.75, borderBottom: 1, borderColor: 'divider',
                        display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, minHeight: 42 }}>

                        {/* Global tab specific: loading indicator + LOD/3D view controls */}
                        {activeTab.type === 'global' && (
                            <>
                                {graphLoading && <CircularProgress size={14} />}
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                    {graphData ? `${graphData.entities.length} nodes · ${graphData.relationships.length} edges` : ''}
                                </Typography>
                            </>
                        )}

                        {/* Node-centered tab: depth control + reload */}
                        {activeTab.type === 'node-centered' && (
                            <>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                    Center: <strong style={{ color: '#a78bfa' }}>{activeTab.label}</strong>
                                </Typography>
                                {activeTab.graphData && (
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                        · {activeTab.graphData.entities?.length ?? 0} nodes
                                    </Typography>
                                )}
                                <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                                <Typography sx={{ fontSize: '0.72rem', color: '#64748b' }}>Depth:</Typography>
                                <TextField
                                    size="small" type="number"
                                    value={activeTab.depth}
                                    onChange={e => updateTab(activeTab.id, { depth: Math.max(1, Math.min(6, parseInt(e.target.value) || 2)) })}
                                    onKeyDown={e => { if (e.key === 'Enter') handleReloadNodeCenteredTab(activeTab.id, activeTab.centerId, activeTab.depth); }}
                                    sx={{ width: 52, '& input': { py: 0.4, px: 0.75, fontSize: '0.75rem' } }}
                                    inputProps={{ min: 1, max: 6 }}
                                />
                                <Tooltip title="Reload subgraph with this depth">
                                    <IconButton size="small" onClick={() => handleReloadNodeCenteredTab(activeTab.id, activeTab.centerId, activeTab.depth)}
                                        disabled={activeTab.loading} sx={{ p: 0.5 }}>
                                        <RefreshCw size={13} />
                                    </IconButton>
                                </Tooltip>
                            </>
                        )}

                        <Box flex={1} />

                        {/* Per-tab: search + glow depth */}
                        <Tooltip title="Search nodes by name">
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <TextField
                                    size="small"
                                    placeholder="Search nodes…"
                                    value={activeTab.searchQuery}
                                    onChange={e => updateTab(activeTab.id, { searchQuery: e.target.value })}
                                    InputProps={{
                                        startAdornment: <InputAdornment position="start"><Search size={11} /></InputAdornment>,
                                        endAdornment: activeTab.searchQuery ? (
                                            <InputAdornment position="end">
                                                <IconButton size="small" onClick={() => updateTab(activeTab.id, { searchQuery: '' })}><X size={10} /></IconButton>
                                            </InputAdornment>
                                        ) : null,
                                        sx: { fontSize: '0.75rem' },
                                    }}
                                    sx={{ width: 150, '& .MuiInputBase-root': { py: 0 } }}
                                />
                            </Box>
                        </Tooltip>

                        <Tooltip title="Neighbor glow depth (how many hops from selected node get highlighted)">
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <SlidersHorizontal size={12} style={{ color: '#fbbf24', flexShrink: 0 }} />
                                <TextField
                                    size="small" type="number"
                                    value={activeTab.glowDepth}
                                    onChange={e => updateTab(activeTab.id, { glowDepth: Math.max(1, Math.min(8, parseInt(e.target.value) || 2)) })}
                                    sx={{ width: 44, '& input': { py: 0.4, px: 0.75, fontSize: '0.72rem', color: '#fbbf24' } }}
                                    inputProps={{ min: 1, max: 8 }}
                                />
                            </Box>
                        </Tooltip>

                        {/* Global tab only: layout control + time filter + view mode switcher */}
                        {activeTab.type === 'global' && viewMode === 'reactflow' && (
                            <>
                                <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                                <LayoutControlPanel namespace={filterNs || null} />
                                <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

                                {/* Time filter */}
                                <Tooltip title={timeFilterOpen ? 'Disable time range filter' : 'Filter nodes by creation time'}>
                                    <IconButton size="small" onClick={() => setTimeFilterOpen(v => !v)}
                                        sx={{ border: '1px solid', borderColor: timeFilterOpen ? '#4ade80' : 'divider',
                                            bgcolor: timeFilterOpen ? '#0f291820' : 'transparent',
                                            color: timeFilterOpen ? '#4ade80' : undefined }}>
                                        <Clock size={15} />
                                    </IconButton>
                                </Tooltip>

                                {timeFilterOpen && (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75,
                                        bgcolor: '#0f2918', border: '1px solid #4ade8040',
                                        borderRadius: 1.5, px: 1, py: 0.5 }}>
                                        <Typography sx={{ fontSize: '0.68rem', color: '#4ade80', fontWeight: 600, whiteSpace: 'nowrap' }}>From</Typography>
                                        <input type="datetime-local" value={timeFrom} onChange={e => setTimeFrom(e.target.value)}
                                            style={{ background: 'transparent', border: '1px solid #4ade8040', borderRadius: 4, color: '#e2e8f0', fontSize: '0.68rem', padding: '2px 4px', colorScheme: 'dark', outline: 'none' }} />
                                        <Typography sx={{ fontSize: '0.68rem', color: '#4ade80', fontWeight: 600, whiteSpace: 'nowrap' }}>To</Typography>
                                        <input type="datetime-local" value={timeTo} onChange={e => setTimeTo(e.target.value)}
                                            style={{ background: 'transparent', border: '1px solid #4ade8040', borderRadius: 4, color: '#e2e8f0', fontSize: '0.68rem', padding: '2px 4px', colorScheme: 'dark', outline: 'none' }} />
                                        <Tooltip title="Apply time range filter">
                                            <IconButton size="small" onClick={handleShow}
                                                sx={{ p: 0.4, color: '#0f2918', bgcolor: '#4ade80', borderRadius: 1, '&:hover': { bgcolor: '#86efac' }, flexShrink: 0 }}>
                                                <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, lineHeight: 1, px: 0.25 }}>Show</Typography>
                                            </IconButton>
                                        </Tooltip>
                                        {glowSet !== null && (
                                            <Typography sx={{ fontSize: '0.65rem', color: '#86efac', bgcolor: '#14532d40', px: 0.75, py: 0.25, borderRadius: 1, whiteSpace: 'nowrap', fontWeight: 600 }}>
                                                {glowSet.size} match{glowSet.size !== 1 ? 'es' : ''}
                                            </Typography>
                                        )}
                                        <Tooltip title="Reset time range">
                                            <IconButton size="small" onClick={() => { setTimeFrom(''); setTimeTo(''); setAppliedTimeFrom(''); setAppliedTimeTo(''); }}
                                                sx={{ p: 0.25, color: '#4ade80', '&:hover': { bgcolor: '#4ade8020' } }}>
                                                <RotateCcw size={12} />
                                            </IconButton>
                                        </Tooltip>
                                        {dataDateRange && (
                                            <Tooltip title="Click to fill with data range">
                                                <Typography onClick={() => { setTimeFrom(dataDateRange.minInput); setTimeTo(dataDateRange.maxInput); }}
                                                    sx={{ fontSize: '0.62rem', color: '#4ade8080', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none', '&:hover': { color: '#4ade80' } }}>
                                                    Data: {dataDateRange.label}
                                                </Typography>
                                            </Tooltip>
                                        )}
                                    </Box>
                                )}

                                <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                            </>
                        )}

                        {/* Global tab view mode switchers */}
                        {activeTab.type === 'global' && (
                            <>
                                <Tooltip title="2D flow graph">
                                    <IconButton size="small" onClick={() => setViewMode('reactflow')}
                                        sx={{ border: '1px solid', borderColor: viewMode === 'reactflow' ? 'primary.main' : 'divider', bgcolor: viewMode === 'reactflow' ? 'primary.dark' : 'transparent' }}>
                                        <Network size={15} />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title={pyramidExists ? 'LOD Knowledge Map' : 'Build pyramid first'}>
                                    <span>
                                        <IconButton size="small" onClick={() => setViewMode('lod')}
                                            disabled={!pyramidExists && viewMode !== 'lod'}
                                            sx={{ border: '1px solid', borderColor: viewMode === 'lod' ? '#6366f1' : 'divider', bgcolor: viewMode === 'lod' ? '#6366f120' : 'transparent', color: viewMode === 'lod' ? '#6366f1' : undefined }}>
                                            <Layers sx={{ fontSize: 15 }} />
                                        </IconButton>
                                    </span>
                                </Tooltip>
                                <Tooltip title="3D force graph">
                                    <IconButton size="small" onClick={() => setViewMode('singularity')}
                                        sx={{ border: '1px solid', borderColor: viewMode === 'singularity' ? 'primary.main' : 'divider', bgcolor: viewMode === 'singularity' ? 'primary.dark' : 'transparent' }}>
                                        <Box3D size={15} />
                                    </IconButton>
                                </Tooltip>
                            </>
                        )}
                    </Box>

                    {/* Graph views — all tabs stacked, only active visible */}
                    <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden', bgcolor: '#0d1117' }}>
                        {tabs.map(tab => (
                            <Box key={tab.id} sx={{
                                position: 'absolute', inset: 0,
                                visibility: tab.id === activeTabId ? 'visible' : 'hidden',
                                pointerEvents: tab.id === activeTabId ? 'auto' : 'none',
                            }}>
                                {renderTabGraph(tab)}
                            </Box>
                        ))}

                        {/* ── Floating left panel: Entities + DocRefs tabs ── */}
                        <FloatingSidePanel
                            storageKey="es-side-panel-open"
                            tabs={[
                                {
                                    id: 'entities',
                                    label: 'Entities',
                                    icon: <Archive size={12} />,
                                    content: (
                                        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                                            {/* Filters */}
                                            <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                                                <TextField size="small" fullWidth placeholder="Search entities…"
                                                    value={search} onChange={e => setSearch(e.target.value)}
                                                    InputProps={{
                                                        startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment>,
                                                        endAdornment: search ? <InputAdornment position="end"><IconButton size="small" onClick={() => setSearch('')}><X size={12} /></IconButton></InputAdornment> : null,
                                                    }}
                                                    sx={{ mb: 1 }}
                                                />
                                                <FormControl fullWidth size="small">
                                                    <InputLabel sx={{ fontSize: '0.8rem' }}>Type filter</InputLabel>
                                                    <Select label="Type filter" value={filterType} onChange={e => setFilterType(e.target.value)} sx={{ fontSize: '0.8rem' }}>
                                                        <MenuItem value="">All types</MenuItem>
                                                        {ENTITY_TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                                                    </Select>
                                                </FormControl>
                                            </Box>
                                            {/* Stats */}
                                            <Box sx={{ px: 1.5, py: 0.6, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
                                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                                                    {loading ? 'Loading…' : `${entities.length} entities`}
                                                    {filterNs && ` in ${filterNs}`}
                                                    {filterType && ` · ${filterType}`}
                                                </Typography>
                                            </Box>
                                            {/* Entity list */}
                                            {(() => {
                                                const entPageCount  = Math.ceil(entities.length / ENT_PAGE_SIZE);
                                                const pagedEntities = entities.slice(entPage * ENT_PAGE_SIZE, (entPage + 1) * ENT_PAGE_SIZE);
                                                return (
                                                <>
                                            <Box sx={{ flex: 1, overflowY: 'auto' }}>
                                                {loading && <LinearProgress />}
                                                {!loading && entities.length === 0 && (
                                                    <Box sx={{ p: 3, textAlign: 'center' }}>
                                                        <Archive size={28} style={{ opacity: 0.15, marginBottom: 8 }} />
                                                        <Typography variant="body2" color="text.disabled" sx={{ mb: 0.5, fontSize: '0.78rem' }}>
                                                            {filterNs || filterType || search ? 'No entities match' : 'Entity Store is empty'}
                                                        </Typography>
                                                        {!filterNs && !filterType && !search && (
                                                            <Box mt={1.5}>
                                                                <Button size="small" variant="outlined" startIcon={<Upload size={13} />}
                                                                    onClick={() => setImportOpen(true)}>
                                                                    Import from Doc
                                                                </Button>
                                                            </Box>
                                                        )}
                                                    </Box>
                                                )}
                                                {pagedEntities.map(e => {
                                                    const c = PALETTE[(e.type || '').toUpperCase()] || PALETTE.default;
                                                    const isSelected = e.id === selectedId;
                                                    return (
                                                        <Box key={e.id} id={`es-item-${e.id}`}
                                                            onClick={() => { setSelectedId(e.id); setSelectedEdge(null); }}
                                                            sx={{
                                                                px: 1.25, py: 0.85, cursor: 'pointer', borderLeft: '3px solid',
                                                                borderLeftColor: isSelected ? c.border : 'transparent',
                                                                bgcolor: isSelected ? `${c.border}12` : 'transparent',
                                                                '&:hover': { bgcolor: `${c.border}08` },
                                                                borderBottom: '1px solid', borderBottomColor: 'divider',
                                                            }}>
                                                            <Stack direction="row" alignItems="flex-start" spacing={0.75}>
                                                                <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: c.border, flexShrink: 0, mt: 0.75 }} />
                                                                <Box flex={1} minWidth={0}>
                                                                    <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
                                                                        <Typography variant="body2" sx={{ fontSize: '0.78rem', fontWeight: 500,
                                                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}
                                                                            title={e.name}>{e.name}</Typography>
                                                                        {e.mentionCount > 0 && (
                                                                            <Typography sx={{ fontSize: '0.58rem', color: '#64748b', bgcolor: 'action.selected', px: 0.5, py: 0.1, borderRadius: 0.5 }}>
                                                                                {e.mentionCount}
                                                                            </Typography>
                                                                        )}
                                                                    </Stack>
                                                                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.2 }}>
                                                                        <Chip label={e.type} size="small" sx={{ fontSize: '0.56rem', height: 15, bgcolor: `${c.border}25`, color: c.text, border: 'none' }} />
                                                                        {e.namespace && e.namespace !== filterNs && <Typography sx={{ fontSize: '0.58rem', color: 'text.disabled' }}>{e.namespace}</Typography>}
                                                                        {e.epistemicLayer && <Typography sx={{ fontSize: '0.56rem', color: '#7c3aed', bgcolor: '#7c3aed15', px: 0.5, borderRadius: 0.5 }}>{e.epistemicLayer}</Typography>}
                                                                        {e.provenanceDocTitle && (
                                                                            <Tooltip placement="top" arrow title={
                                                                                <Stack spacing={0.25}>
                                                                                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 600 }}>Source document</Typography>
                                                                                    {e.provenanceDocSymbol && <Typography sx={{ fontSize: '0.68rem', fontFamily: 'monospace', color: '#93c5fd' }}>{e.provenanceDocSymbol}</Typography>}
                                                                                    <Typography sx={{ fontSize: '0.68rem', color: '#cbd5e1' }}>{e.provenanceDocTitle}</Typography>
                                                                                    {e.provenanceImportedAt && <Typography sx={{ fontSize: '0.62rem', color: '#64748b' }}>{new Date(e.provenanceImportedAt).toLocaleDateString()}</Typography>}
                                                                                </Stack>
                                                                            }>
                                                                                <FileText size={10} style={{ color: '#64748b', cursor: 'help', flexShrink: 0 }} />
                                                                            </Tooltip>
                                                                        )}
                                                                    </Stack>
                                                                </Box>
                                                                <Stack direction="row" spacing={0} sx={{ flexShrink: 0 }}>
                                                                    <Tooltip title="Open graph centered on this entity (depth 2)">
                                                                        <IconButton size="small" sx={{ p: 0.2, color: '#6366f1', '&:hover': { color: '#818cf8', bgcolor: '#6366f115' } }} onClick={ev => { ev.stopPropagation(); handleCenterOnNode(e.id, e.name, 2); }}>
                                                                            <Network size={11} />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                    <Tooltip title="Edit">
                                                                        <IconButton size="small" sx={{ p: 0.2 }} onClick={ev => { ev.stopPropagation(); setEditEntity(e); }}>
                                                                            <Pencil size={11} />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                    <Tooltip title="Delete">
                                                                        <IconButton size="small" sx={{ p: 0.2, color: 'error.main' }} onClick={ev => { ev.stopPropagation(); setDeleteEntityId(e.id); }}>
                                                                            <Trash2 size={11} />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                </Stack>
                                                            </Stack>
                                                        </Box>
                                                    );
                                                })}
                                            </Box>
                                            {entPageCount > 1 && (
                                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5,
                                                    px: 1.5, py: 0.5, borderTop: '1px solid #1e293b', flexShrink: 0 }}>
                                                    <IconButton size="small" disabled={entPage === 0} onClick={() => setEntPage(p => p - 1)}
                                                        sx={{ p: 0.35, color: '#64748b', '&:not(:disabled):hover': { color: '#e2e8f0' } }}>
                                                        <ChevronLeft size={13} />
                                                    </IconButton>
                                                    <Typography sx={{ fontSize: '0.65rem', color: '#64748b', minWidth: 48, textAlign: 'center' }}>
                                                        {entPage + 1} / {entPageCount}
                                                    </Typography>
                                                    <IconButton size="small" disabled={entPage >= entPageCount - 1} onClick={() => setEntPage(p => p + 1)}
                                                        sx={{ p: 0.35, color: '#64748b', '&:not(:disabled):hover': { color: '#e2e8f0' } }}>
                                                        <ChevronRight size={13} />
                                                    </IconButton>
                                                </Box>
                                            )}
                                            </>
                                            ); })()}
                                        </Box>
                                    ),
                                },
                                {
                                    id: 'docrefs',
                                    label: 'Doc Refs',
                                    icon: <FileSearch size={12} />,
                                    content: (
                                        <DocRefSidebar
                                            embedded
                                            open={true}
                                            docRefs={docRefs}
                                            loading={docRefsLoading}
                                            onFocusNode={handleFocusNode}
                                            onExtractRef={handleExtractRef}
                                        />
                                    ),
                                },
                            ]}
                        />

                        {/* ── Floating info panel: appears on node/edge selection ── */}
                        {(selectedId || selectedEdge) && (
                            <NodeEdgeInfoPanel
                                entity={selectedEntityObj}
                                edge={selectedEdge}
                                graphData={activeGraphData}
                                urlEntityId={urlEntityId}
                                onClose={handleDeselect}
                            />
                        )}

                        {/* ── Graph Tools dialog (Route Finder, Neighborhood Explorer) ── */}
                        <GraphToolsDialog
                            open={showGraphTools}
                            onClose={() => setShowGraphTools(false)}
                            entities={entities}
                            onOpenPathTab={handleOpenPathTab}
                            onExploreNeighborhood={handleCenterOnNode}
                        />
                    </Box>

                    <HelpPanel tab="entity-store" lang="en" />
                </Box>
            </Box>

            {/* ── Extract DOCUMENTREF dialog ── */}
            {extractTarget && !extractTarget.viewOnly && (
                <ExtractRefDialog
                    open={true}
                    entity={extractTarget}
                    onClose={() => setExtractTarget(null)}
                    onJobStarted={(jobId) => registerJob(extractTarget.entityId, jobId)}
                    onComplete={() => {
                        // Save current viewport + focus entity before reload
                        const globalTab = tabs.find(t => t.id === 'global');
                        pendingRestoreRef.current = {
                            viewport: globalTab?.savedViewport || null,
                            focusNodeId: extractTarget?.entityId || null,
                        };
                        loadAll();
                        loadGraph();
                        loadDocRefs();
                        setExtractTarget(null);
                    }}
                />
            )}

            {/* ── Dialogs ── */}
            {importOpen && (
                <ImportDialog open={true} onClose={() => setImportOpen(false)}
                    onImported={() => { loadAll(); loadGraph(); }}
                    existingNamespaces={nsOptions} />
            )}

            {editEntity !== null && (
                <EntityDialog open={true} entity={editEntity?.id ? editEntity : null}
                    namespaces={nsOptions} onClose={() => setEditEntity(null)}
                    onSaved={() => { loadAll(); loadGraph(); }} />
            )}

            {deleteNs !== null && (
                <DeleteNsDialog open={true} namespace={deleteNs}
                    onClose={() => setDeleteNs(null)}
                    onDeleted={() => { setFilterNs(''); loadAll(); loadGraph(); }} />
            )}

            <Dialog open={!!deleteEntityId} onClose={() => setDeleteEntityId(null)}
                maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
                <DialogTitle>Delete Entity?</DialogTitle>
                <DialogContent>
                    <Alert severity="warning" icon={<AlertTriangle size={18} />}>
                        This will permanently remove the entity from the store and unlink all document mentions.
                    </Alert>
                </DialogContent>
                <DialogActions sx={{ px: 2, py: 1.5 }}>
                    <Button onClick={() => setDeleteEntityId(null)} size="small">Cancel</Button>
                    <Button variant="contained" color="error" size="small"
                        disabled={deleteLoading} onClick={() => handleDeleteEntity(deleteEntityId)}>
                        {deleteLoading ? 'Deleting…' : 'Delete'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
