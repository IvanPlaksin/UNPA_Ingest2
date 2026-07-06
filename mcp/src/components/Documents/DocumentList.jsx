/**
 * DocumentList
 *
 * Table view of uploaded UN documents with status indicators, filters,
 * sorting, and per-row actions (review, re-classify, extract, delete).
 *
 * Props:
 *   documents   Document[]       — list from DocumentProcessingPage state
 *   loading     boolean
 *   onReview    (doc) => void    — open ClassificationReview
 *   onExtract   (doc) => void    — trigger extraction
 *   onReclassify (doc) => void   — re-trigger classification
 *   onRefresh   () => void       — reload list
 */
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Table, TableHead, TableBody, TableRow, TableCell,
    TableSortLabel, TablePagination,
    Chip, Stack, IconButton, Tooltip, TextField, MenuItem,
    Select, FormControl, InputLabel, Typography, Skeleton,
    LinearProgress
} from '@mui/material';
import {
    Search, RefreshCw, CheckCircle, AlertCircle, Clock,
    XCircle, Eye, Play, RotateCcw, FileText, ExternalLink, Zap, Info
} from 'lucide-react';

const STATUSES = ['', 'UPLOADED', 'CLASSIFYING', 'CLASSIFIED', 'NEEDS_REVIEW', 'EXTRACTING', 'COMPLETED', 'FAILED', 'EXTRACTION_FAILED'];
const LAYERS   = ['', 'L0', 'L1', 'L2', 'L3', 'L4', 'L5'];

const STATUS_CONFIG = {
    UPLOADED:          { color: 'default',  Icon: Clock,        label: 'Uploaded' },
    CLASSIFYING:       { color: 'info',     Icon: Clock,        label: 'Classifying…' },
    CLASSIFIED:        { color: 'success',  Icon: CheckCircle,  label: 'Classified' },
    NEEDS_REVIEW:      { color: 'warning',  Icon: AlertCircle,  label: 'Needs Review' },
    EXTRACTING:        { color: 'info',     Icon: Clock,        label: 'Extracting…' },
    COMPLETED:         { color: 'success',  Icon: CheckCircle,  label: 'Completed' },
    FAILED:            { color: 'error',    Icon: XCircle,      label: 'Failed' },
    EXTRACTION_FAILED: { color: 'error',    Icon: XCircle,      label: 'Extr. Failed' },
};

function StatusChip({ status }) {
    const cfg = STATUS_CONFIG[status] || { color: 'default', Icon: FileText, label: status };
    const { Icon, color, label } = cfg;
    return (
        <Chip
            icon={<Icon size={14} />}
            label={label}
            color={color}
            size="small"
            variant="outlined"
        />
    );
}

function LayerChip({ layer }) {
    if (!layer) return <Typography variant="caption" color="text.disabled">—</Typography>;
    const colors = { L0: '#7c3aed', L1: '#2563eb', L2: '#0891b2', L3: '#059669', L4: '#d97706', L5: '#9333ea' };
    return (
        <Chip
            label={layer}
            size="small"
            sx={{ bgcolor: colors[layer] || 'grey.500', color: '#fff', fontWeight: 700, fontSize: '0.7rem' }}
        />
    );
}

function ConfidenceBar({ value }) {
    if (value == null) return <Typography variant="caption" color="text.disabled">—</Typography>;
    const pct = Math.round(value * 100);
    const color = pct >= 70 ? 'success' : pct >= 40 ? 'warning' : 'error';
    return (
        <Stack spacing={0.25}>
            <LinearProgress variant="determinate" value={pct} color={color} sx={{ height: 6, borderRadius: 3 }} />
            <Typography variant="caption" color="text.secondary">{pct}%</Typography>
        </Stack>
    );
}

const REPO_COLORS = {
    ODS: '#2563eb', OIOS: '#dc2626', JIU: '#7c3aed',
    POLICY_PORTAL: '#059669', MANUAL: '#6b7280'
};

function SourceBadge({ repo, url }) {
    if (!repo && !url) return <Typography variant="caption" color="text.disabled">—</Typography>;
    const color = REPO_COLORS[repo] || '#6b7280';
    const chip = (
        <Chip
            label={repo || 'SRC'}
            size="small"
            sx={{ bgcolor: color, color: '#fff', fontWeight: 700, fontSize: '0.65rem', height: 18 }}
        />
    );
    if (url) return (
        <Tooltip title={url}>
            <a href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ cursor: 'pointer' }}>
                    {chip}
                    <ExternalLink size={11} style={{ color }} />
                </Stack>
            </a>
        </Tooltip>
    );
    return chip;
}

function formatBytes(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentList({ documents = [], loading, onReview, onExtract, onForceExtract, onReclassify, onRefresh }) {
    const navigate = useNavigate();
    const [search,    setSearch]    = useState('');
    const [status,    setStatus]    = useState('');
    const [layer,     setLayer]     = useState('');
    const [order,     setOrder]     = useState('desc');
    const [orderBy,   setOrderBy]   = useState('uploadedAt');
    const [page,      setPage]      = useState(0);
    const [rowsPerPage] = useState(25);

    const filtered = useMemo(() => {
        return documents.filter(d => {
            if (search && !d.originalname?.toLowerCase().includes(search.toLowerCase()) &&
                          !d.documentType?.toLowerCase().includes(search.toLowerCase())) return false;
            if (status && d.status !== status) return false;
            if (layer  && d.epistemicLayer !== layer) return false;
            return true;
        });
    }, [documents, search, status, layer]);

    const sorted = useMemo(() => {
        return [...filtered].sort((a, b) => {
            const va = a[orderBy] ?? '';
            const vb = b[orderBy] ?? '';
            const cmp = va < vb ? -1 : va > vb ? 1 : 0;
            return order === 'asc' ? cmp : -cmp;
        });
    }, [filtered, order, orderBy]);

    const paginated = sorted.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

    const handleSort = (col) => {
        if (orderBy === col) setOrder(o => o === 'asc' ? 'desc' : 'asc');
        else { setOrderBy(col); setOrder('desc'); }
    };

    const SortLabel = ({ col, children }) => (
        <TableSortLabel
            active={orderBy === col}
            direction={orderBy === col ? order : 'asc'}
            onClick={() => handleSort(col)}
        >
            {children}
        </TableSortLabel>
    );

    return (
        <Box>
            {/* Filters */}
            <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} alignItems="center" flexWrap="wrap">
                <TextField
                    size="small"
                    placeholder="Search by filename or type…"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(0); }}
                    InputProps={{ startAdornment: <Search size={16} style={{ marginRight: 6, opacity: 0.5 }} /> }}
                    sx={{ minWidth: 220 }}
                />
                <FormControl size="small" sx={{ minWidth: 140 }}>
                    <InputLabel>Status</InputLabel>
                    <Select value={status} label="Status" onChange={e => { setStatus(e.target.value); setPage(0); }}>
                        {STATUSES.map(s => <MenuItem key={s} value={s}>{s || 'All statuses'}</MenuItem>)}
                    </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel>Layer</InputLabel>
                    <Select value={layer} label="Layer" onChange={e => { setLayer(e.target.value); setPage(0); }}>
                        {LAYERS.map(l => <MenuItem key={l} value={l}>{l || 'All layers'}</MenuItem>)}
                    </Select>
                </FormControl>
                <Box sx={{ flex: 1 }} />
                <Tooltip title="Refresh">
                    <IconButton size="small" onClick={onRefresh} disabled={loading}>
                        <RefreshCw size={18} />
                    </IconButton>
                </Tooltip>
                <Typography variant="caption" color="text.secondary">
                    {filtered.length} document{filtered.length !== 1 ? 's' : ''}
                </Typography>
            </Stack>

            {/* Table */}
            <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ width: 32 }}></TableCell>
                            <TableCell><SortLabel col="originalname">Filename</SortLabel></TableCell>
                            <TableCell><SortLabel col="unSymbol">UN Symbol</SortLabel></TableCell>
                            <TableCell><SortLabel col="documentType">Type</SortLabel></TableCell>
                            <TableCell><SortLabel col="epistemicLayer">Layer</SortLabel></TableCell>
                            <TableCell>Confidence</TableCell>
                            <TableCell><SortLabel col="kqsScore">KQS</SortLabel></TableCell>
                            <TableCell><SortLabel col="status">Status</SortLabel></TableCell>
                            <TableCell>Source</TableCell>
                            <TableCell><SortLabel col="fileSize">Size</SortLabel></TableCell>
                            <TableCell><SortLabel col="uploadedAt">Dates</SortLabel></TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading && !documents.length && (
                            Array.from({ length: 5 }).map((_, i) => (
                                <TableRow key={i}>
                                    {Array.from({ length: 12 }).map((__, j) => (
                                        <TableCell key={j}><Skeleton /></TableCell>
                                    ))}
                                </TableRow>
                            ))
                        )}
                        {!loading && !paginated.length && (
                            <TableRow>
                                <TableCell colSpan={12} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                    No documents found
                                </TableCell>
                            </TableRow>
                        )}
                        {paginated.map(doc => {
                            const canExtract   = ['CLASSIFIED', 'NEEDS_REVIEW'].includes(doc.status);
                            const canForce     = ['FAILED', 'COMPLETED', 'EXTRACTION_FAILED'].includes(doc.status);
                            const isExtracting = doc.status === 'EXTRACTING';
                            const isProcessing = ['CLASSIFYING', 'EXTRACTING'].includes(doc.status);
                            return (
                                <TableRow key={doc.id} hover>
                                    <TableCell>
                                        <FileText size={16} style={{ opacity: 0.5 }} />
                                    </TableCell>
                                    <TableCell>
                                        <Tooltip title={doc.originalname}>
                                            <Typography
                                                variant="body2"
                                                sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                            >
                                                {doc.originalname}
                                            </Typography>
                                        </Tooltip>
                                        {doc.documentTitle && (
                                            <Typography variant="caption" color="text.secondary"
                                                sx={{ display: 'block', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {doc.documentTitle}
                                            </Typography>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="caption" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                            {doc.unSymbol || '—'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                                            {doc.documentType || '—'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell><LayerChip layer={doc.epistemicLayer} /></TableCell>
                                    <TableCell sx={{ minWidth: 90 }}>
                                        <ConfidenceBar value={doc.classificationConfidence} />
                                    </TableCell>
                                    <TableCell sx={{ minWidth: 60 }}>
                                        {doc.kqsScore != null
                                            ? <Chip label={`${Math.round(doc.kqsScore * 100)}%`} size="small"
                                                sx={{ bgcolor: doc.kqsScore >= 0.7 ? '#15803d' : doc.kqsScore >= 0.4 ? '#b45309' : '#991b1b',
                                                      color: '#fff', fontWeight: 700, fontSize: '0.65rem', height: 18 }} />
                                            : <Typography variant="caption" color="text.disabled">—</Typography>
                                        }
                                    </TableCell>
                                    <TableCell>
                                        {doc.extractionError
                                            ? <Tooltip title={doc.extractionError}><span><StatusChip status={doc.status} /></span></Tooltip>
                                            : <StatusChip status={doc.status} />
                                        }
                                    </TableCell>
                                    <TableCell>
                                        <SourceBadge repo={doc.sourceRepository} url={doc.sourceUrl} />
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="caption">{formatBytes(doc.fileSize)}</Typography>
                                    </TableCell>
                                    <TableCell sx={{ minWidth: 100 }}>
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                            {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : '—'}
                                        </Typography>
                                        {doc.aiExtractedAt && (
                                            <Typography variant="caption" sx={{ color: '#4ade80', display: 'block' }}>
                                                ↳ {new Date(doc.aiExtractedAt).toLocaleDateString()}
                                            </Typography>
                                        )}
                                    </TableCell>
                                    <TableCell align="right">
                                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                            <Tooltip title="Document card">
                                                <IconButton size="small" onClick={() => navigate('/documents/' + doc.id)}>
                                                    <Info size={15} />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Review classification">
                                                <span>
                                                    <IconButton size="small" onClick={() => onReview?.(doc)}>
                                                        <Eye size={15} />
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                            <Tooltip title="Re-classify">
                                                <span>
                                                    <IconButton size="small" onClick={() => onReclassify?.(doc)} disabled={isProcessing}>
                                                        <RotateCcw size={15} />
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                            {canExtract && (
                                                <Tooltip title="Extract knowledge">
                                                    <span>
                                                        <IconButton size="small" onClick={() => onExtract?.(doc)}
                                                            sx={{ color: 'success.main' }}>
                                                            <Play size={15} />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                            )}
                                            {canForce && (
                                                <Tooltip title="Re-extract (force reset)">
                                                    <span>
                                                        <IconButton size="small" onClick={() => onForceExtract?.(doc)}
                                                            sx={{ color: 'warning.main' }}>
                                                            <Zap size={15} />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                            )}
                                            {isExtracting && (
                                                <Tooltip title="Extraction in progress…">
                                                    <span>
                                                        <IconButton size="small" disabled>
                                                            <Play size={15} />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                            )}
                                        </Stack>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </Box>

            <TablePagination
                component="div"
                count={filtered.length}
                page={page}
                onPageChange={(_, p) => setPage(p)}
                rowsPerPage={rowsPerPage}
                rowsPerPageOptions={[25]}
            />

        </Box>
    );
}
