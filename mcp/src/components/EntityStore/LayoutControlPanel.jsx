import React, { useState, useRef, useCallback } from 'react';
import {
    Box, Typography, Select, MenuItem, Slider, IconButton,
    Tooltip, Popover, Divider, FormControl, InputLabel,
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import RefreshIcon from '@mui/icons-material/Refresh';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import BubbleChartIcon from '@mui/icons-material/BubbleChart';
import SaveIcon from '@mui/icons-material/Save';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { useEntityStore } from '../../stores/entityStore.store';
import { getAvailableAlgorithms, getDefaultConfig } from '../../services/layoutEngine.service';

const ALGORITHMS = getAvailableAlgorithms();

/* ── LayoutControlPanel — horizontal toolbar ─────────────────────────────── */

export default function LayoutControlPanel({ namespace }) {
    const layoutConfig         = useEntityStore(s => s.layoutConfig);
    const isLayouting          = useEntityStore(s => s.isLayouting);
    const isSavingLayout       = useEntityStore(s => s.isSavingLayout);
    const lastLayoutSavedAt    = useEntityStore(s => s.lastLayoutSavedAt);
    const isLayoutFrozen       = useEntityStore(s => s.isLayoutFrozen);
    const setLayoutConfig      = useEntityStore(s => s.setLayoutConfig);
    const setLayoutFrozen      = useEntityStore(s => s.setLayoutFrozen);
    const clearFrozenPositions = useEntityStore(s => s.clearFrozenPositions);
    const saveLayoutToKB       = useEntityStore(s => s.saveLayoutToKB);
    const loadLayoutFromKB     = useEntityStore(s => s.loadLayoutFromKB);

    const [anchorEl, setAnchorEl] = useState(null);

    // Debounce slider changes so layout doesn't recompute on every pixel of drag
    const debounceTimer = useRef(null);
    const debouncedSetConfig = useCallback((patch) => {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => setLayoutConfig(patch), 350);
    }, [setLayoutConfig]);
    const paramsOpen = Boolean(anchorEl);

    const handleAlgorithmChange = (e) => {
        const newAlgo  = e.target.value;
        const defaults = getDefaultConfig(newAlgo);
        setLayoutConfig({ ...defaults, algorithm: newAlgo });
    };

    const handleRecalculate = () => {
        setLayoutConfig({ ...layoutConfig, _ts: Date.now() });
    };

    const handleFreezeToggle = () => {
        if (isLayoutFrozen) clearFrozenPositions();
        setLayoutFrozen(!isLayoutFrozen);
    };

    const handleHullToggle = () => setLayoutConfig({ groupByType: !layoutConfig.groupByType });

    const savedLabel = lastLayoutSavedAt
        ? new Date(lastLayoutSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : null;

    const currentAlgo = ALGORITHMS.find(a => a.id === layoutConfig.algorithm);

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>

            {/* Algorithm selector — compact inline */}
            <FormControl size="small" variant="outlined" sx={{ minWidth: 140 }}>
                <Select
                    value={layoutConfig.algorithm}
                    onChange={handleAlgorithmChange}
                    disabled={isLayouting}
                    sx={{
                        fontSize: '0.7rem', height: 28,
                        '.MuiSelect-select': { py: '4px', px: '8px' },
                    }}
                    renderValue={(val) => {
                        const a = ALGORITHMS.find(x => x.id === val);
                        return a?.name ?? val;
                    }}
                >
                    {ALGORITHMS.map(a => (
                        <MenuItem key={a.id} value={a.id}>
                            <Box>
                                <Typography sx={{ fontSize: '0.72rem', fontWeight: 500 }}>{a.name}</Typography>
                                <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary' }}>{a.description}</Typography>
                            </Box>
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>

            {/* Params popover button */}
            <Tooltip title="Layout parameters">
                <IconButton
                    size="small"
                    onClick={e => setAnchorEl(e.currentTarget)}
                    color={paramsOpen ? 'primary' : 'default'}
                    sx={{ p: 0.5 }}
                >
                    <TuneIcon sx={{ fontSize: 16 }} />
                </IconButton>
            </Tooltip>

            {/* Recalculate */}
            <Tooltip title="Recalculate layout">
                <span>
                    <IconButton size="small" onClick={handleRecalculate} disabled={isLayouting} sx={{ p: 0.5 }}>
                        <RefreshIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                </span>
            </Tooltip>

            {/* Freeze toggle */}
            <Tooltip title={isLayoutFrozen ? 'Unfreeze layout' : 'Freeze layout (preserve node positions on drag)'}>
                <IconButton
                    size="small"
                    onClick={handleFreezeToggle}
                    color={isLayoutFrozen ? 'primary' : 'default'}
                    sx={{ p: 0.5 }}
                >
                    {isLayoutFrozen
                        ? <AcUnitIcon sx={{ fontSize: 16 }} />
                        : <LockOpenIcon sx={{ fontSize: 16 }} />}
                </IconButton>
            </Tooltip>

            {/* Hull overlay toggle */}
            <Tooltip title={layoutConfig.groupByType ? 'Hide type groups' : 'Show type groups (convex hull)'}>
                <IconButton
                    size="small"
                    onClick={handleHullToggle}
                    color={layoutConfig.groupByType ? 'secondary' : 'default'}
                    sx={{ p: 0.5 }}
                >
                    <BubbleChartIcon sx={{ fontSize: 16 }} />
                </IconButton>
            </Tooltip>

            {/* Save layout to knowledge base */}
            <Tooltip title={namespace
                ? (savedLabel ? `Save layout (last: ${savedLabel})` : 'Save layout to knowledge base')
                : 'Select a namespace to save layout'}>
                <span>
                    <IconButton
                        size="small"
                        onClick={() => saveLayoutToKB(namespace)}
                        disabled={!namespace || isLayouting || isSavingLayout}
                        sx={{ p: 0.5 }}
                    >
                        <SaveIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                </span>
            </Tooltip>

            {/* Load layout from knowledge base */}
            <Tooltip title={namespace ? 'Restore saved layout' : 'Select a namespace to restore layout'}>
                <span>
                    <IconButton
                        size="small"
                        onClick={() => loadLayoutFromKB(namespace)}
                        disabled={!namespace || isLayouting}
                        sx={{ p: 0.5 }}
                    >
                        <FolderOpenIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                </span>
            </Tooltip>

            {/* ── Parameters popover ── */}
            <Popover
                open={paramsOpen}
                anchorEl={anchorEl}
                onClose={() => setAnchorEl(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                PaperProps={{ sx: { p: 2, width: 220, border: 1, borderColor: 'divider' } }}
            >
                <Typography variant="caption" fontWeight={600} sx={{ fontSize: '0.72rem', display: 'block', mb: 1.5 }}>
                    {currentAlgo?.name ?? 'Layout'} parameters
                </Typography>

                {/* Spacing */}
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                    Node spacing — {layoutConfig.spacing}
                </Typography>
                <Slider
                    size="small"
                    value={layoutConfig.spacing}
                    min={30} max={300} step={10}
                    valueLabelDisplay="auto"
                    disabled={isLayouting}
                    onChange={(_, v) => debouncedSetConfig({ spacing: v })}
                    sx={{ mt: 0.5, mb: 1.5 }}
                />

                {/* Edge length (stress + force) */}
                {['stress', 'force'].includes(layoutConfig.algorithm) && (
                    <>
                        <Divider sx={{ mb: 1.5 }} />
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                            Edge length — {layoutConfig.edgeLength}
                        </Typography>
                        <Slider
                            size="small"
                            value={layoutConfig.edgeLength}
                            min={50} max={400} step={10}
                            valueLabelDisplay="auto"
                            disabled={isLayouting}
                            onChange={(_, v) => debouncedSetConfig({ edgeLength: v })}
                            sx={{ mt: 0.5, mb: 1.5 }}
                        />
                    </>
                )}

                {/* Cluster strength (force only) */}
                {layoutConfig.algorithm === 'force' && (
                    <>
                        <Divider sx={{ mb: 1.5 }} />
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                            Cluster pull — {layoutConfig.clusterStrength}
                        </Typography>
                        <Slider
                            size="small"
                            value={layoutConfig.clusterStrength}
                            min={0} max={1} step={0.1}
                            valueLabelDisplay="auto"
                            disabled={isLayouting}
                            onChange={(_, v) => debouncedSetConfig({ clusterStrength: v })}
                            sx={{ mt: 0.5 }}
                        />
                    </>
                )}
            </Popover>
        </Box>
    );
}
