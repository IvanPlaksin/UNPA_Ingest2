import React, { useMemo, useState, useEffect } from 'react';
import {
    Box, Typography, IconButton, Tooltip, Divider,
    CircularProgress, TextField, InputAdornment, Chip,
} from '@mui/material';
import { X, Search, Download, CheckCircle2, Circle, AlertCircle, FileText, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 50;

const FILTER_OPTS = [
    { key: 'all',          label: 'All' },
    { key: 'extracted',    label: 'Extracted' },
    { key: 'unextracted',  label: 'Not extracted' },
];

function StatusIcon({ docRef }) {
    if (docRef.linkedDocId)             return <CheckCircle2 size={12} style={{ color: '#4ade80', flexShrink: 0 }} />;
    if (docRef.extractedEntityCount > 0) return <AlertCircle  size={12} style={{ color: '#fbbf24', flexShrink: 0 }} />;
    return <Circle size={12} style={{ color: '#94a3b8', flexShrink: 0 }} />;
}

/**
 * When `embedded={true}` the outer Box wrapper and header are omitted —
 * the component renders just the filters + list for use inside FloatingSidePanel.
 */
export default function DocRefSidebar({ open, onClose, docRefs, loading, onFocusNode, onExtractRef, embedded = false }) {
    const [filter,      setFilter]      = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [page,        setPage]        = useState(0);

    const filtered = useMemo(() => {
        if (!docRefs) return [];
        let list = docRefs;
        if (filter === 'extracted')   list = list.filter(d => d.extractedEntityCount > 0 || d.linkedDocId);
        if (filter === 'unextracted') list = list.filter(d => d.extractedEntityCount === 0 && !d.linkedDocId);
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(d => d.name.toLowerCase().includes(q));
        }
        return list;
    }, [docRefs, filter, searchQuery]);

    useEffect(() => { setPage(0); }, [filtered]);

    const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
    const paged     = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    if (!open && !embedded) return null;

    const total       = docRefs?.length ?? 0;
    const extracted   = docRefs?.filter(d => d.extractedEntityCount > 0 || d.linkedDocId).length ?? 0;
    const unextracted = total - extracted;

    const inner = (
        <>
            {/* Stats chips */}
            <Box sx={{ px: 1.5, py: 0.75, display: 'flex', gap: 0.5, flexWrap: 'wrap', borderBottom: 1, borderColor: 'divider' }}>
                <Chip size="small" label={`${total} total`}
                    sx={{ fontSize: '0.6rem', height: 17, bgcolor: '#1e293b', color: '#94a3b8' }} />
                <Chip size="small" label={`${extracted} extracted`}
                    sx={{ fontSize: '0.6rem', height: 17, bgcolor: '#0f291820', color: '#4ade80', border: '1px solid #4ade8040' }} />
                <Chip size="small" label={`${unextracted} pending`}
                    sx={{ fontSize: '0.6rem', height: 17, bgcolor: '#2d200820', color: '#fbbf24', border: '1px solid #fbbf2440' }} />
            </Box>

            {/* Filter tabs */}
            <Box sx={{ display: 'flex', borderBottom: 1, borderColor: 'divider' }}>
                {FILTER_OPTS.map(opt => (
                    <Box key={opt.key} onClick={() => setFilter(opt.key)}
                        sx={{
                            flex: 1, py: 0.6, textAlign: 'center', cursor: 'pointer',
                            fontSize: '0.65rem', fontWeight: filter === opt.key ? 700 : 400,
                            color: filter === opt.key ? '#c4b5fd' : '#64748b',
                            borderBottom: filter === opt.key ? '2px solid #8b5cf6' : '2px solid transparent',
                            '&:hover': { color: '#a78bfa' },
                        }}>
                        {opt.label}
                    </Box>
                ))}
            </Box>

            {/* Search */}
            <Box sx={{ px: 1, py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
                <TextField size="small" fullWidth placeholder="Filter by name…"
                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    InputProps={{
                        startAdornment: <InputAdornment position="start"><Search size={12} /></InputAdornment>,
                        endAdornment: searchQuery ? (
                            <InputAdornment position="end">
                                <IconButton size="small" onClick={() => setSearchQuery('')}><X size={10} /></IconButton>
                            </InputAdornment>
                        ) : null,
                        sx: { fontSize: '0.75rem' },
                    }}
                    sx={{ '& .MuiInputBase-root': { py: 0 } }}
                />
            </Box>

            {/* List */}
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
                {loading ? (
                    <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
                        <CircularProgress size={20} />
                    </Box>
                ) : filtered.length === 0 ? (
                    <Box sx={{ p: 2.5, textAlign: 'center' }}>
                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.7rem' }}>
                            {searchQuery ? 'No matches' : 'No document refs'}
                        </Typography>
                    </Box>
                ) : paged.map(ref => (
                    <Box key={ref.id}
                        onClick={() => onFocusNode(ref.id)}
                        sx={{
                            px: 1.25, py: 0.85, cursor: 'pointer',
                            borderBottom: '1px solid', borderColor: 'divider',
                            '&:hover': { bgcolor: '#8b5cf615' },
                            display: 'flex', alignItems: 'flex-start', gap: 0.75,
                        }}>
                        <Box sx={{ mt: 0.35 }}>
                            <StatusIcon docRef={ref} />
                        </Box>
                        <Box flex={1} minWidth={0}>
                            <Typography variant="body2"
                                sx={{ fontSize: '0.75rem', lineHeight: 1.35, color: '#e2e8f0',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                title={ref.name}>
                                {ref.name}
                            </Typography>
                            {ref.extractedEntityCount > 0 && (
                                <Typography sx={{ fontSize: '0.62rem', color: '#fbbf24', mt: 0.15 }}>
                                    {ref.extractedEntityCount} entities extracted
                                </Typography>
                            )}
                            {ref.linkedDocName && (
                                <Typography sx={{ fontSize: '0.6rem', color: '#4ade80', mt: 0.1 }}>
                                    linked
                                </Typography>
                            )}
                        </Box>
                        <Tooltip title="Extract this document" placement="left">
                            <Box
                                component="button"
                                onClick={e => { e.stopPropagation(); onExtractRef(ref.id, ref.name); }}
                                sx={{
                                    background: '#1a2e1a', border: '1px solid #22c55e55',
                                    borderRadius: 0.75, p: '3px 5px', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', flexShrink: 0,
                                    '&:hover': { bgcolor: '#14532d', borderColor: '#22c55e' },
                                }}>
                                <Download size={10} style={{ color: '#86efac' }} />
                            </Box>
                        </Tooltip>
                    </Box>
                ))}
            </Box>

            {/* Pagination */}
            {pageCount > 1 && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5,
                    px: 1.5, py: 0.5, borderTop: '1px solid #1e293b', flexShrink: 0 }}>
                    <IconButton size="small" disabled={page === 0} onClick={() => setPage(p => p - 1)}
                        sx={{ p: 0.35, color: '#64748b', '&:not(:disabled):hover': { color: '#e2e8f0' } }}>
                        <ChevronLeft size={13} />
                    </IconButton>
                    <Typography sx={{ fontSize: '0.65rem', color: '#64748b', minWidth: 48, textAlign: 'center' }}>
                        {page + 1} / {pageCount}
                    </Typography>
                    <IconButton size="small" disabled={page >= pageCount - 1} onClick={() => setPage(p => p + 1)}
                        sx={{ p: 0.35, color: '#64748b', '&:not(:disabled):hover': { color: '#e2e8f0' } }}>
                        <ChevronRight size={13} />
                    </IconButton>
                </Box>
            )}

            {/* Legend */}
            <Box sx={{ px: 1.5, py: 0.75, borderTop: 1, borderColor: 'divider',
                display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <CheckCircle2 size={10} style={{ color: '#4ade80' }} />
                    <Typography sx={{ fontSize: '0.6rem', color: '#64748b' }}>linked</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <AlertCircle size={10} style={{ color: '#fbbf24' }} />
                    <Typography sx={{ fontSize: '0.6rem', color: '#64748b' }}>extracted</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Circle size={10} style={{ color: '#94a3b8' }} />
                    <Typography sx={{ fontSize: '0.6rem', color: '#64748b' }}>pending</Typography>
                </Box>
            </Box>
        </>
    );

    /* Embedded mode — no outer wrapper */
    if (embedded) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                {inner}
            </Box>
        );
    }

    return (
        <Box sx={{
            width: 270, flexShrink: 0, borderLeft: 1, borderColor: 'divider',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            bgcolor: '#0d1117',
        }}>
            {/* Header (non-embedded mode only) */}
            <Box sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider',
                display: 'flex', alignItems: 'center', gap: 1 }}>
                <FileText size={14} style={{ color: '#8b5cf6', flexShrink: 0 }} />
                <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.75rem', flex: 1, color: '#c4b5fd' }}>
                    Document Refs
                </Typography>
                <Tooltip title="Close sidebar">
                    <IconButton size="small" onClick={onClose} sx={{ p: 0.25 }}>
                        <X size={13} />
                    </IconButton>
                </Tooltip>
            </Box>

            {inner}
        </Box>
    );
}
