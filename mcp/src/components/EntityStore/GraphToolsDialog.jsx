import React, { useState, useCallback } from 'react';
import {
    Dialog, DialogTitle, DialogContent,
    Tabs, Tab, Box, Autocomplete, TextField,
    Button, Chip, Typography, CircularProgress, Alert,
    IconButton, Slider, Tooltip,
} from '@mui/material';
import { X, Route, Crosshair, ArrowRight, ChevronRight, ExternalLink, FileText } from 'lucide-react';
import { findPaths } from '../../services/entityStore.service';
import { PALETTE } from './EntityGraph2D';

/* ── Entity type badge ────────────────────────────────────────────────────── */
function TypeBadge({ type }) {
    const c = PALETTE[(type || '').toUpperCase()] || PALETTE.default;
    return (
        <Box component="span" sx={{
            fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase',
            color: c.text, bgcolor: `${c.border}25`, px: '4px', py: '1px',
            borderRadius: '3px', letterSpacing: '0.05em', flexShrink: 0, display: 'inline-block',
        }}>
            {type || '?'}
        </Box>
    );
}

/* ── Shared entity autocomplete ───────────────────────────────────────────── */
function EntityAutocomplete({ label, value, onChange, options, exclude, accentColor = '#6366f1' }) {
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
                <Box component="li" {...props} sx={{ py: '3px !important', px: '8px !important', gap: 0.75 }}>
                    <TypeBadge type={option.type} />
                    <Typography sx={{ fontSize: '0.75rem', color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {option.name}
                    </Typography>
                    {option.namespace && (
                        <Typography sx={{ fontSize: '0.6rem', color: '#94a3b8', flexShrink: 0 }}>
                            {option.namespace}
                        </Typography>
                    )}
                </Box>
            )}
            renderInput={(params) => (
                <TextField
                    {...params}
                    label={label}
                    placeholder="Search entity…"
                    InputLabelProps={{ sx: { fontSize: '0.78rem', color: `${accentColor}cc` } }}
                    sx={{
                        '& .MuiInputLabel-root.Mui-focused': { color: accentColor },
                        '& .MuiOutlinedInput-root': {
                            fontSize: '0.78rem', bgcolor: '#0a0d14',
                            '& fieldset': { borderColor: '#1e293b' },
                            '&:hover fieldset': { borderColor: `${accentColor}60` },
                            '&.Mui-focused fieldset': { borderColor: accentColor },
                        },
                    }}
                />
            )}
            ListboxProps={{
                sx: { bgcolor: '#0d1117', border: '1px solid #1e293b', maxHeight: 260, py: 0.5 },
            }}
        />
    );
}

const ROBUSTNESS_COLOR = { HIGH: '#22c55e', MODERATE: '#eab308', FRAGILE: '#ef4444' };

/* ── Route Finder tab ─────────────────────────────────────────────────────── */
function RouteFinderTab({ entities, onFind, onOpenReport, onClose }) {
    const [from,    setFrom]    = useState(null);
    const [to,      setTo]      = useState(null);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState(null);
    const [preview, setPreview] = useState(null); // { result, from, to }

    const handleFind = useCallback(async () => {
        if (!from || !to || from.id === to.id) return;
        setLoading(true);
        setError(null);
        setPreview(null);
        try {
            const result = await findPaths(from.id, to.id, 5);
            if (!result.paths?.length) {
                setError('No connection found between these entities.');
                return;
            }
            setPreview({ result, from, to });
        } catch (e) {
            if (e.name === 'AbortError' || e.message?.includes('timeout')) {
                setError('Search timed out. The graph may be too large or disconnected.');
            } else {
                setError(e.response?.data?.error || e.message || 'Search failed');
            }
        } finally {
            setLoading(false);
        }
    }, [from, to]);

    const handleOpenTab = useCallback(() => {
        if (!preview) return;
        onFind(preview.result, preview.from, preview.to);
        onClose();
    }, [preview, onFind, onClose]);

    const handleOpenReport = useCallback(() => {
        if (!preview) return;
        onOpenReport?.(preview.result, preview.from, preview.to);
        onClose();
    }, [preview, onOpenReport, onClose]);

    const handleReset = useCallback(() => {
        setPreview(null);
        setError(null);
    }, []);

    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter') handleFind();
    }, [handleFind]);

    const canFind = from && to && from.id !== to.id && !loading;
    const sa = preview?.result?.structuralAnalysis;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0.5 }}>
            {/* Description */}
            <Typography sx={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.5 }}>
                Finds up to 5 routes between two entities, ranked by semantic strength
                (weighted by relationship type). Includes structural analysis.
            </Typography>

            {/* From / To fields */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <EntityAutocomplete
                    label="From — start entity"
                    value={from}
                    onChange={(v) => { setFrom(v); setPreview(null); }}
                    options={entities}
                    exclude={to}
                    accentColor="#4ade80"
                />
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                    <Box sx={{ flex: 1, height: '1px', bgcolor: '#1e293b' }} />
                    <ChevronRight size={14} style={{ color: '#FBBF24' }} />
                    <Box sx={{ flex: 1, height: '1px', bgcolor: '#1e293b' }} />
                </Box>
                <EntityAutocomplete
                    label="To — destination entity"
                    value={to}
                    onChange={(v) => { setTo(v); setPreview(null); }}
                    options={entities}
                    exclude={from}
                    accentColor="#f87171"
                />
            </Box>

            {/* Selected pair summary */}
            {from && to && from.id !== to.id && !preview && (
                <Box sx={{
                    display: 'flex', alignItems: 'center', gap: 0.75,
                    bgcolor: '#FBBF2408', border: '1px solid #FBBF2420',
                    borderRadius: 1.5, px: 1.25, py: 0.75,
                }}>
                    <TypeBadge type={from.type} />
                    <Typography sx={{ fontSize: '0.72rem', color: '#e2e8f0', flex: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {from.name}
                    </Typography>
                    <ArrowRight size={12} style={{ color: '#FBBF24', flexShrink: 0 }} />
                    <Typography sx={{ fontSize: '0.72rem', color: '#e2e8f0', flex: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {to.name}
                    </Typography>
                    <TypeBadge type={to.type} />
                </Box>
            )}

            {/* Error */}
            {error && (
                <Alert severity={error.includes('No connection') || error.includes('timed out') ? 'warning' : 'error'}
                    sx={{ fontSize: '0.72rem', py: 0.5, px: 1 }}>
                    {error}
                </Alert>
            )}

            {/* Large subgraph warning */}
            {sa && sa.subgraphNodeCount > 50 && (
                <Alert severity="warning" sx={{ fontSize: '0.72rem', py: 0.5, px: 1 }}>
                    Large connecting subgraph ({sa.subgraphNodeCount} nodes). Visualization may be slow.
                </Alert>
            )}

            {/* Preview result */}
            {preview && sa && (
                <Box sx={{
                    bgcolor: '#0f172a', border: '1px solid #1e293b',
                    borderRadius: 1.5, p: 1.5,
                }}>
                    <Typography sx={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1 }}>
                        Connection Found
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.25 }}>
                        <Chip
                            size="small"
                            label={sa.connectionRobustness}
                            sx={{
                                height: 20, fontSize: '0.62rem', fontWeight: 700,
                                bgcolor: `${ROBUSTNESS_COLOR[sa.connectionRobustness]}20`,
                                color: ROBUSTNESS_COLOR[sa.connectionRobustness],
                                border: `1px solid ${ROBUSTNESS_COLOR[sa.connectionRobustness]}50`,
                            }}
                        />
                        <Typography sx={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                            {preview.result.paths.length} route{preview.result.paths.length !== 1 ? 's' : ''}
                            {' · '}{sa.independentPathCount} independent
                            {sa.hasCriticalBottleneck && <span style={{ color: '#ef4444' }}> · ⚠ bottleneck</span>}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                            size="small"
                            variant="contained"
                            startIcon={<ExternalLink size={11} />}
                            onClick={handleOpenTab}
                            sx={{
                                flex: 1, fontSize: '0.68rem', py: 0.5,
                                bgcolor: '#92400e', color: '#fde68a',
                                '&:hover': { bgcolor: '#a16207' },
                            }}
                        >
                            Open Tab
                        </Button>
                        <Button
                            size="small"
                            variant="outlined"
                            startIcon={<FileText size={11} />}
                            onClick={handleOpenReport}
                            sx={{
                                flex: 1, fontSize: '0.68rem', py: 0.5,
                                borderColor: '#1e293b', color: '#94a3b8',
                                '&:hover': { borderColor: '#475569', bgcolor: '#ffffff08' },
                            }}
                        >
                            View Report
                        </Button>
                    </Box>
                </Box>
            )}

            <Button
                variant="contained"
                fullWidth
                onClick={preview ? handleReset : handleFind}
                disabled={!canFind && !preview}
                onKeyDown={handleKeyDown}
                startIcon={loading
                    ? <CircularProgress size={14} thickness={5} sx={{ color: 'inherit' }} />
                    : <Route size={14} />
                }
                sx={{
                    py: 0.85, fontSize: '0.78rem', fontWeight: 600,
                    bgcolor: (canFind || preview) ? '#92400e' : '#1e293b',
                    color: (canFind || preview) ? '#fde68a' : '#475569',
                    '&:hover': { bgcolor: '#a16207' },
                    '&:disabled': { bgcolor: '#1e293b', color: '#94a3b8' },
                    transition: 'all 0.15s',
                }}
            >
                {loading ? 'Searching routes…' : preview ? 'Search Again' : 'Find Routes'}
            </Button>
        </Box>
    );
}

/* ── Neighborhood Explorer tab ────────────────────────────────────────────── */
function NeighborhoodTab({ entities, onExplore, onClose }) {
    const [entity, setEntity] = useState(null);
    const [depth, setDepth]   = useState(2);

    const handleExplore = useCallback(() => {
        if (!entity) return;
        onExplore(entity.id, entity.name, depth);
        onClose();
    }, [entity, depth, onExplore, onClose]);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 0.5 }}>
            <Typography sx={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.5 }}>
                Opens a node-centered subgraph showing all entities reachable
                within N hops from the selected entity.
            </Typography>

            <EntityAutocomplete
                label="Center entity"
                value={entity}
                onChange={setEntity}
                options={entities}
                accentColor="#818cf8"
            />

            <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                    <Typography sx={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        Exploration depth
                    </Typography>
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#818cf8' }}>
                        {depth} hop{depth !== 1 ? 's' : ''}
                    </Typography>
                </Box>
                <Slider
                    value={depth}
                    onChange={(_, v) => setDepth(v)}
                    min={1} max={5} step={1} marks
                    sx={{
                        color: '#818cf8',
                        '& .MuiSlider-markLabel': { fontSize: '0.62rem', color: '#94a3b8' },
                    }}
                />
            </Box>

            <Button
                variant="contained"
                fullWidth
                onClick={handleExplore}
                disabled={!entity}
                startIcon={<Crosshair size={14} />}
                sx={{
                    py: 1, fontSize: '0.8rem', fontWeight: 600,
                    bgcolor: entity ? '#312e81' : '#1e293b',
                    color: entity ? '#c7d2fe' : '#475569',
                    '&:hover': { bgcolor: '#3730a3' },
                    '&:disabled': { bgcolor: '#1e293b', color: '#94a3b8' },
                }}
            >
                Open Subgraph
            </Button>
        </Box>
    );
}

/* ── GraphToolsDialog ────────────────────────────────────────────────────── */
export default function GraphToolsDialog({
    open,
    onClose,
    entities = [],
    onOpenPathTab,
    onOpenPathReport,
    onExploreNeighborhood,
}) {
    const [activeTab, setActiveTab] = useState(0);

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="xs"
            fullWidth
            PaperProps={{
                sx: {
                    bgcolor: '#0d1117',
                    border: '1px solid #1e293b',
                    borderRadius: 2,
                    boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
                    overflow: 'visible',
                },
            }}
        >
            {/* Header */}
            <Box sx={{
                px: 2, pt: 1.5, pb: 0,
                borderBottom: '1px solid #1e293b',
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Route size={16} style={{ color: '#FBBF24', marginRight: 8, flexShrink: 0 }} />
                    <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: '#f8fafc', flex: 1 }}>
                        Graph Tools
                    </Typography>
                    <Tooltip title="Close">
                        <IconButton size="small" onClick={onClose}
                            sx={{ p: 0.4, color: '#94a3b8', '&:hover': { color: '#e2e8f0' } }}>
                            <X size={14} />
                        </IconButton>
                    </Tooltip>
                </Box>

                <Tabs
                    value={activeTab}
                    onChange={(_, v) => setActiveTab(v)}
                    sx={{
                        minHeight: 36,
                        '& .MuiTabs-indicator': { bgcolor: '#FBBF24', height: 2 },
                        '& .MuiTab-root': {
                            minHeight: 36, fontSize: '0.72rem', fontWeight: 500,
                            color: '#64748b', textTransform: 'none', px: 1.5, py: 0,
                            '&.Mui-selected': { color: '#FBBF24' },
                        },
                    }}
                >
                    <Tab
                        label="Route Finder"
                        icon={<Route size={12} />}
                        iconPosition="start"
                        sx={{ gap: 0.5 }}
                    />
                    <Tab
                        label="Neighborhood"
                        icon={<Crosshair size={12} />}
                        iconPosition="start"
                        sx={{ gap: 0.5 }}
                    />
                </Tabs>
            </Box>

            {/* Content */}
            <DialogContent sx={{ px: 2, py: 2.5, bgcolor: '#0d1117' }}>
                {activeTab === 0 && (
                    <RouteFinderTab
                        entities={entities}
                        onFind={onOpenPathTab}
                        onOpenReport={onOpenPathReport}
                        onClose={onClose}
                    />
                )}
                {activeTab === 1 && (
                    <NeighborhoodTab
                        entities={entities}
                        onExplore={onExploreNeighborhood}
                        onClose={onClose}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}
