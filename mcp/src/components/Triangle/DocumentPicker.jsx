/**
 * DocumentPicker — modal for linking a document to a triangle vertex
 *
 * Fetches available documents filtered by layer constraints:
 *   normative   → L0, L1, L2 only
 *   operational → L3 only
 *   empirical   → L4 only
 *
 * Props:
 *   open         boolean
 *   processId    string
 *   vertexType   'normative' | 'operational' | 'empirical'
 *   onConfirm    (docId, edgeType) => void
 *   onClose      () => void
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Box, Typography, Stack, Chip, TextField, Button,
    InputAdornment, LinearProgress, Radio, RadioGroup,
    FormControlLabel, CircularProgress, Alert, Divider
} from '@mui/material';
import { Search, FileText, X } from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL } from '../../config/api.config';

const VERTEX_META = {
    normative:   { color: '#7c3aed', label: 'Normative',   edgeType: 'GOVERNS',          layers: ['L0','L1','L2'], edgeLabel: 'GOVERNS'          },
    operational: { color: '#059669', label: 'Operational', edgeType: 'OPERATIONALIZES',   layers: ['L3'],          edgeLabel: 'OPERATIONALIZES'  },
    empirical:   { color: '#ef4444', label: 'Empirical',   edgeType: 'REVEALS_GAP_IN',    layers: ['L4'],          edgeLabel: 'REVEALS_GAP_IN'   }
};

const LAYER_COLORS = {
    L0: '#7c3aed', L1: '#2563eb', L2: '#0891b2',
    L3: '#059669', L4: '#d97706', L5: '#9333ea'
};

function KQSBar({ score }) {
    if (score == null) return null;
    const pct   = Math.round(score * 100);
    const color = score >= 0.7 ? '#22c55e' : score >= 0.4 ? '#f59e0b' : '#ef4444';
    return (
        <Stack direction="row" spacing={0.5} alignItems="center">
            <LinearProgress variant="determinate" value={pct}
                sx={{ width: 40, height: 4, borderRadius: 2,
                      bgcolor: color + '22',
                      '& .MuiLinearProgress-bar': { bgcolor: color } }} />
            <Typography variant="caption" color="text.secondary">{pct}</Typography>
        </Stack>
    );
}

export default function DocumentPicker({ open, processId, vertexType = 'normative', onConfirm, onClose }) {
    const meta = VERTEX_META[vertexType] || VERTEX_META.normative;

    const [documents, setDocuments]   = useState([]);
    const [loading,   setLoading]     = useState(false);
    const [error,     setError]       = useState(null);
    const [search,    setSearch]      = useState('');
    const [selected,  setSelected]    = useState('');
    const [linking,   setLinking]     = useState(false);

    useEffect(() => {
        if (!open) { setSearch(''); setSelected(''); return; }
        setLoading(true);
        setError(null);
        // Fetch all classified documents; filter by layer client-side
        axios.get(`${API_BASE_URL}/documents`, { params: { limit: 200, status: 'CLASSIFIED,COMPLETED' } })
            .then(r => {
                const docs = r.data?.data || r.data?.documents || [];
                // Filter to only layers valid for this vertex type
                const valid = docs.filter(d => !d.layer || meta.layers.includes(d.layer));
                setDocuments(valid);
            })
            .catch(e => setError(e.response?.data?.error || 'Failed to load documents'))
            .finally(() => setLoading(false));
    }, [open, vertexType]);

    const filtered = useMemo(() => {
        if (!search.trim()) return documents;
        const q = search.toLowerCase();
        return documents.filter(d =>
            (d.name || d.id || '').toLowerCase().includes(q) ||
            (d.documentType || '').toLowerCase().includes(q)
        );
    }, [documents, search]);

    async function handleConfirm() {
        if (!selected) return;
        setLinking(true);
        try {
            await onConfirm?.(selected, meta.edgeType);
            onClose?.();
        } catch (e) {
            setError(e.response?.data?.error || e.message);
        } finally {
            setLinking(false);
        }
    }

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ pb: 1 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Stack direction="row" spacing={1} alignItems="center">
                        <FileText size={18} color={meta.color} />
                        <Typography variant="subtitle1" fontWeight={700}>
                            Link Document
                        </Typography>
                    </Stack>
                    <Button size="small" onClick={onClose} variant="text" sx={{ minWidth: 0 }}>
                        <X size={16} />
                    </Button>
                </Stack>
            </DialogTitle>

            <DialogContent dividers sx={{ p: 0 }}>
                {/* Context info */}
                <Box sx={{ px: 2, py: 1.5, bgcolor: meta.color + '11', borderBottom: 1, borderColor: 'divider' }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Chip label={meta.label} size="small"
                            sx={{ bgcolor: meta.color + '22', color: meta.color, fontWeight: 600 }} />
                        <Typography variant="caption" color="text.secondary">
                            → edge: <strong>{meta.edgeLabel}</strong>
                            &nbsp;·&nbsp; layers: <strong>{meta.layers.join(', ')}</strong>
                        </Typography>
                    </Stack>
                </Box>

                {/* Search */}
                <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                    <TextField
                        size="small"
                        fullWidth
                        placeholder="Search documents..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <Search size={16} />
                                </InputAdornment>
                            )
                        }}
                        autoFocus
                    />
                </Box>

                {error && (
                    <Alert severity="error" sx={{ mx: 2, my: 1 }}>{error}</Alert>
                )}

                {/* Document list */}
                <Box sx={{ maxHeight: 360, overflow: 'auto' }}>
                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                            <CircularProgress size={28} />
                        </Box>
                    ) : filtered.length === 0 ? (
                        <Box sx={{ textAlign: 'center', py: 4 }}>
                            <Typography variant="body2" color="text.secondary">
                                {documents.length === 0
                                    ? `No classified documents found for ${meta.layers.join('/')} layers`
                                    : 'No documents match your search'}
                            </Typography>
                        </Box>
                    ) : (
                        <RadioGroup value={selected} onChange={e => setSelected(e.target.value)}>
                            {filtered.map(doc => (
                                <Box
                                    key={doc.id}
                                    onClick={() => setSelected(doc.id)}
                                    sx={{
                                        px: 2, py: 1.25,
                                        borderBottom: '1px solid',
                                        borderColor: 'divider',
                                        cursor: 'pointer',
                                        bgcolor: selected === doc.id ? meta.color + '11' : 'transparent',
                                        '&:hover': { bgcolor: 'action.hover' }
                                    }}
                                >
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Radio value={doc.id} size="small"
                                            sx={{ p: 0.5, color: meta.color,
                                                  '&.Mui-checked': { color: meta.color } }} />
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Stack direction="row" spacing={0.75} alignItems="center">
                                                <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 280 }}>
                                                    {doc.name || doc.id}
                                                </Typography>
                                                {doc.layer && (
                                                    <Chip label={doc.layer} size="small"
                                                        sx={{ height: 16, fontSize: 12,
                                                              bgcolor: (LAYER_COLORS[doc.layer] || '#64748b') + '22',
                                                              color:   LAYER_COLORS[doc.layer] || '#64748b' }} />
                                                )}
                                            </Stack>
                                            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 0.25 }}>
                                                <KQSBar score={doc.kqsScore} />
                                                {doc.documentType && (
                                                    <Typography variant="caption" color="text.disabled">
                                                        {doc.documentType}
                                                    </Typography>
                                                )}
                                            </Stack>
                                        </Box>
                                    </Stack>
                                </Box>
                            ))}
                        </RadioGroup>
                    )}
                </Box>
            </DialogContent>

            <DialogActions sx={{ px: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                    {filtered.length} document{filtered.length !== 1 ? 's' : ''} available
                </Typography>
                <Button onClick={onClose} variant="outlined" size="small">Cancel</Button>
                <Button
                    onClick={handleConfirm}
                    variant="contained"
                    size="small"
                    disabled={!selected || linking}
                    startIcon={linking ? <CircularProgress size={12} /> : null}
                    sx={{ bgcolor: meta.color, '&:hover': { bgcolor: meta.color } }}
                >
                    Link Document
                </Button>
            </DialogActions>
        </Dialog>
    );
}
