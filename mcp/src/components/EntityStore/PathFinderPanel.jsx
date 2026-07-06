import React, { useState, useCallback } from 'react';
import {
    Box, Typography, IconButton, Tooltip, Autocomplete, TextField,
    Button, CircularProgress, Chip, Divider, Alert,
} from '@mui/material';
import { X, Route, ArrowRight, ExternalLink, RotateCcw } from 'lucide-react';
import { findPaths } from '../../services/entityStore.service';
import { PALETTE } from './EntityGraph2D';

/* ── Small inline type badge ──────────────────────────────────────────────── */
function TypeBadge({ type }) {
    const c = PALETTE[(type || '').toUpperCase()] || PALETTE.default;
    return (
        <Typography component="span" sx={{
            fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase',
            color: c.text, bgcolor: `${c.border}25`, px: 0.5, py: 0.1,
            borderRadius: 0.4, letterSpacing: '0.05em', flexShrink: 0,
        }}>
            {type || '?'}
        </Typography>
    );
}

/* ── Path chain preview ───────────────────────────────────────────────────── */
function PathChain({ segments, entityMap }) {
    const nodes = segments.filter((_, i) => i % 2 === 0 || segments[i]?.id); // all segments
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.3, mt: 0.5 }}>
            {segments.map((seg, i) => {
                if (!seg.id) return null; // safety
                const entity = seg;
                const isLast = i === segments.length - 1;
                return (
                    <React.Fragment key={i}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                            <TypeBadge type={entity.type} />
                            <Typography sx={{
                                fontSize: '0.65rem', color: '#e2e8f0', fontWeight: 500,
                                maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }} title={entity.name}>
                                {entity.name}
                            </Typography>
                        </Box>
                        {!isLast && seg.edge && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.2, flexShrink: 0 }}>
                                <ArrowRight size={9} style={{ color: '#FBBF24', opacity: 0.8 }} />
                                <Typography sx={{
                                    fontSize: '0.52rem', color: '#FBBF2499', fontStyle: 'italic',
                                    maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }} title={seg.edge.relType}>
                                    {String(seg.edge.relType || '').replace(/_/g, ' ').toLowerCase()}
                                </Typography>
                                <ArrowRight size={9} style={{ color: '#FBBF24', opacity: 0.5 }} />
                            </Box>
                        )}
                        {!isLast && !seg.edge && (
                            <ArrowRight size={9} style={{ color: '#64748b', flexShrink: 0 }} />
                        )}
                    </React.Fragment>
                );
            })}
        </Box>
    );
}

/* ── PathFinderPanel ─────────────────────────────────────────────────────── */
export default function PathFinderPanel({ open, onClose, entities = [], onOpenTab }) {
    const [from,    setFrom]    = useState(null);
    const [to,      setTo]      = useState(null);
    const [loading, setLoading] = useState(false);
    const [result,  setResult]  = useState(null);
    const [error,   setError]   = useState(null);

    const handleFind = useCallback(async () => {
        if (!from || !to || from.id === to.id) return;
        setLoading(true);
        setError(null);
        setResult(null);
        try {
            const data = await findPaths(from.id, to.id, 5);
            setResult(data);
        } catch (e) {
            setError(e.response?.data?.error || e.message || 'Path search failed');
        } finally {
            setLoading(false);
        }
    }, [from, to]);

    const handleReset = useCallback(() => {
        setFrom(null); setTo(null);
        setResult(null); setError(null);
    }, []);

    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter') handleFind();
    }, [handleFind]);

    if (!open) return null;

    const hasPaths = result?.paths?.length > 0;

    return (
        <Box sx={{
            position: 'absolute', top: 8, right: 8,
            width: 400, maxHeight: 'calc(100% - 16px)',
            bgcolor: 'rgba(10, 13, 20, 0.96)',
            backdropFilter: 'blur(12px)',
            border: '1px solid #1e293b',
            borderRadius: 2,
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
            zIndex: 30,
        }}>
            {/* Header */}
            <Box sx={{
                px: 1.5, py: 1, borderBottom: '1px solid #1e293b',
                display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#0d1117', flexShrink: 0,
            }}>
                <Route size={14} style={{ color: '#FBBF24', flexShrink: 0 }} />
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#f8fafc', flex: 1 }}>
                    Route Finder
                </Typography>
                {(from || to || result) && (
                    <Tooltip title="Reset">
                        <IconButton size="small" onClick={handleReset} sx={{ p: 0.3, color: '#94a3b8' }}>
                            <RotateCcw size={12} />
                        </IconButton>
                    </Tooltip>
                )}
                <Tooltip title="Close">
                    <IconButton size="small" onClick={onClose} sx={{ p: 0.3, color: '#94a3b8' }}>
                        <X size={13} />
                    </IconButton>
                </Tooltip>
            </Box>

            {/* Search form */}
            <Box sx={{ px: 1.5, py: 1.25, borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <EntityAutocomplete
                        label="From"
                        value={from}
                        onChange={setFrom}
                        options={entities}
                        exclude={to}
                        onKeyDown={handleKeyDown}
                        color="#4ade80"
                    />
                    <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                        <ArrowRight size={14} style={{ color: '#FBBF24' }} />
                    </Box>
                    <EntityAutocomplete
                        label="To"
                        value={to}
                        onChange={setTo}
                        options={entities}
                        exclude={from}
                        onKeyDown={handleKeyDown}
                        color="#f87171"
                    />
                </Box>

                <Button
                    fullWidth
                    size="small"
                    variant="contained"
                    onClick={handleFind}
                    disabled={!from || !to || from.id === to.id || loading}
                    startIcon={loading ? <CircularProgress size={11} thickness={5} /> : <Route size={13} />}
                    sx={{
                        mt: 1.25, fontSize: '0.72rem', py: 0.6,
                        bgcolor: '#854d0e', color: '#fde68a',
                        '&:hover': { bgcolor: '#92400e' },
                        '&:disabled': { bgcolor: '#1e293b', color: '#94a3b8' },
                    }}
                >
                    {loading ? 'Searching…' : 'Find Routes'}
                </Button>
            </Box>

            {/* Results */}
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
                {error && (
                    <Box sx={{ p: 1.5 }}>
                        <Alert severity="error" sx={{ fontSize: '0.7rem', py: 0.5 }}>
                            {error}
                        </Alert>
                    </Box>
                )}

                {result && !hasPaths && !loading && (
                    <Box sx={{ p: 2, textAlign: 'center' }}>
                        <Typography sx={{ fontSize: '0.75rem', color: '#64748b' }}>
                            No path found between these entities.
                        </Typography>
                    </Box>
                )}

                {hasPaths && (
                    <>
                        <Box sx={{ px: 1.5, py: 0.75, borderBottom: '1px solid #1e293b',
                            display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Typography sx={{ fontSize: '0.65rem', color: '#94a3b8', flex: 1 }}>
                                {result.paths.length} route{result.paths.length !== 1 ? 's' : ''} found
                                · {result.entities.length} entities involved
                            </Typography>
                            {result.structuralAnalysis && (() => {
                                const sa = result.structuralAnalysis;
                                const RC = { HIGH: '#22c55e', MODERATE: '#eab308', FRAGILE: '#ef4444' };
                                const col = RC[sa.connectionRobustness] || '#64748b';
                                return (
                                    <Typography sx={{ fontSize: '0.6rem', color: col, fontWeight: 700 }}>
                                        {sa.connectionRobustness} · {sa.independentPathCount} indep.
                                    </Typography>
                                );
                            })()}
                            <Tooltip title="Open all routes in a new tab">
                                <Button size="small" variant="outlined"
                                    startIcon={<ExternalLink size={11} />}
                                    onClick={() => onOpenTab?.(result, from, to)}
                                    sx={{ fontSize: '0.62rem', py: 0.3, px: 1,
                                        borderColor: '#FBBF2450', color: '#FBBF24',
                                        '&:hover': { borderColor: '#FBBF24', bgcolor: '#FBBF2410' } }}>
                                    Open All
                                </Button>
                            </Tooltip>
                        </Box>

                        {result.paths.map((path, idx) => (
                            <PathCard
                                key={idx}
                                index={idx}
                                path={path}
                                onOpen={() => onOpenTab?.(result, from, to, idx)}
                            />
                        ))}
                    </>
                )}
            </Box>
        </Box>
    );
}

/* ── EntityAutocomplete ───────────────────────────────────────────────────── */
function EntityAutocomplete({ label, value, onChange, options, exclude, onKeyDown, color }) {
    const filtered = exclude ? options.filter(e => e.id !== exclude.id) : options;

    return (
        <Autocomplete
            size="small"
            options={filtered}
            value={value}
            onChange={(_, v) => onChange(v)}
            getOptionLabel={o => o?.name || ''}
            isOptionEqualToValue={(o, v) => o?.id === v?.id}
            renderOption={(props, option) => (
                <Box component="li" {...props} sx={{ py: '4px !important', px: '8px !important' }}>
                    <TypeBadge type={option.type} />
                    <Typography sx={{ fontSize: '0.72rem', ml: 0.5, color: '#e2e8f0' }}>
                        {option.name}
                    </Typography>
                    {option.namespace && (
                        <Typography sx={{ fontSize: '0.6rem', color: '#94a3b8', ml: 0.5 }}>
                            ({option.namespace})
                        </Typography>
                    )}
                </Box>
            )}
            renderInput={(params) => (
                <TextField
                    {...params}
                    label={label}
                    placeholder="Search entity…"
                    onKeyDown={onKeyDown}
                    sx={{
                        '& .MuiInputLabel-root': { fontSize: '0.72rem', color: color },
                        '& .MuiInputLabel-root.Mui-focused': { color: color },
                        '& .MuiOutlinedInput-root': {
                            fontSize: '0.75rem',
                            '& fieldset': { borderColor: `${color}50` },
                            '&:hover fieldset': { borderColor: `${color}80` },
                            '&.Mui-focused fieldset': { borderColor: color },
                        },
                    }}
                    InputProps={{ ...params.InputProps, sx: { bgcolor: '#0f172a' } }}
                />
            )}
            ListboxProps={{ sx: { bgcolor: '#0d1117', border: '1px solid #1e293b', fontSize: '0.72rem' } }}
            sx={{ '& .MuiAutocomplete-paper': { bgcolor: '#0d1117' } }}
        />
    );
}

/* ── PathCard ─────────────────────────────────────────────────────────────── */
function PathCard({ index, path, onOpen }) {
    const isShortest = index === 0;
    return (
        <Box sx={{
            px: 1.5, py: 1, borderBottom: '1px solid #0f172a',
            '&:hover': { bgcolor: '#ffffff05' },
        }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                <Chip
                    size="small"
                    label={`#${index + 1}`}
                    sx={{
                        height: 18, fontSize: '0.6rem', fontWeight: 700,
                        bgcolor: isShortest ? '#FBBF2420' : '#1e293b',
                        color: isShortest ? '#FBBF24' : '#64748b',
                        border: `1px solid ${isShortest ? '#FBBF2450' : '#1e293b'}`,
                    }}
                />
                {isShortest && (
                    <Chip size="small" label="strongest"
                        sx={{ height: 15, fontSize: '0.55rem', bgcolor: '#14532d20', color: '#4ade80',
                            border: '1px solid #4ade8030' }} />
                )}
                <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    {path.pathStrength != null && (
                        <Typography sx={{ fontSize: '0.62rem', color: '#009EDB', fontFamily: 'monospace', fontWeight: 700 }}>
                            {(path.pathStrength * 100).toFixed(1)}%
                        </Typography>
                    )}
                    <Typography sx={{ fontSize: '0.65rem', color: '#64748b' }}>
                        {path.hopCount} hop{path.hopCount !== 1 ? 's' : ''}
                    </Typography>
                </Box>
                <Tooltip title="Open this route in a new tab">
                    <IconButton size="small" onClick={onOpen}
                        sx={{ p: 0.3, color: '#94a3b8', '&:hover': { color: '#FBBF24' } }}>
                        <ExternalLink size={11} />
                    </IconButton>
                </Tooltip>
            </Box>
            <PathChain segments={path.segments} />
        </Box>
    );
}
