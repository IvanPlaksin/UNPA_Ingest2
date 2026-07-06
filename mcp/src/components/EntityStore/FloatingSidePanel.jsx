/**
 * FloatingSidePanel — absolute-positioned resizable collapsible panel with tabs.
 * Renders over the graph area. Tabs content is passed as JSX nodes.
 */
import React, { useState, useRef, useCallback } from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function FloatingSidePanel({
    tabs,               // [{ id, label, icon, content }]
    defaultWidth = 320,
    minWidth = 220,
    maxWidth = 620,
    defaultOpen = true,
    defaultTab,         // optional: which tab is active initially
    storageKey,         // optional: key for persisting open/closed state in localStorage
}) {
    const [open,      setOpen]      = useState(() => {
        if (!storageKey) return defaultOpen;
        try { const v = localStorage.getItem(storageKey); return v === null ? defaultOpen : v === 'true'; } catch { return defaultOpen; }
    });
    const [width,     setWidth]     = useState(defaultWidth);
    const [activeTab, setActiveTab] = useState(defaultTab ?? tabs?.[0]?.id ?? '');

    const dragging   = useRef(false);
    const startX     = useRef(0);
    const startW     = useRef(0);

    const onResizeMouseDown = useCallback((e) => {
        e.preventDefault();
        dragging.current = true;
        startX.current   = e.clientX;
        startW.current   = width;

        const onMove = (ev) => {
            if (!dragging.current) return;
            const next = Math.max(minWidth, Math.min(maxWidth, startW.current + (ev.clientX - startX.current)));
            setWidth(next);
        };
        const onUp = () => {
            dragging.current = false;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [width, minWidth, maxWidth]);

    const toggleOpen = useCallback(() => setOpen(v => {
        const next = !v;
        if (storageKey) { try { localStorage.setItem(storageKey, String(next)); } catch {} }
        return next;
    }), [storageKey]);

    return (
        <Box sx={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            zIndex: 20,
            pointerEvents: 'none', // let mouse-events through to graph by default
            display: 'flex',
        }}>
            {/* ── Panel body ── */}
            {open && (
                <Box sx={{
                    width,
                    bgcolor: 'rgba(10, 13, 20, 0.93)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid #1e293b',
                    borderLeft: 'none',
                    borderRadius: '0 12px 12px 0',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: '4px 0 28px rgba(0,0,0,0.55)',
                    pointerEvents: 'auto',
                }}>
                    {/* Tab strip */}
                    <Box sx={{
                        display: 'flex', alignItems: 'stretch',
                        borderBottom: '1px solid #1e293b',
                        bgcolor: '#0d1117',
                        minHeight: 34, flexShrink: 0,
                    }}>
                        {tabs.map(tab => {
                            const active = tab.id === activeTab;
                            return (
                                <Box key={tab.id} onClick={() => setActiveTab(tab.id)}
                                    sx={{
                                        display: 'flex', alignItems: 'center', gap: 0.5,
                                        px: 1.25, cursor: 'pointer',
                                        borderBottom: '2px solid',
                                        borderBottomColor: active ? '#6366f1' : 'transparent',
                                        color: active ? '#e2e8f0' : '#64748b',
                                        '&:hover': { color: '#94a3b8', bgcolor: '#ffffff06' },
                                        transition: 'color 0.12s',
                                    }}>
                                    {tab.icon && React.cloneElement(tab.icon, { size: 12 })}
                                    <Typography sx={{ fontSize: '0.71rem', fontWeight: active ? 600 : 400 }}>
                                        {tab.label}
                                    </Typography>
                                </Box>
                            );
                        })}
                        <Box flex={1} />
                        <Tooltip title="Collapse panel" placement="right">
                            <IconButton size="small" onClick={toggleOpen}
                                sx={{ mr: 0.5, p: 0.35, color: '#94a3b8', '&:hover': { color: '#e2e8f0' } }}>
                                <ChevronLeft size={13} />
                            </IconButton>
                        </Tooltip>
                    </Box>

                    {/* Tab content */}
                    {tabs.map(tab => (
                        <Box key={tab.id} sx={{
                            flex: 1, overflow: 'hidden',
                            display: activeTab === tab.id ? 'flex' : 'none',
                            flexDirection: 'column',
                        }}>
                            {tab.content}
                        </Box>
                    ))}
                </Box>
            )}

            {/* ── Resize handle ── */}
            {open && (
                <Box
                    onMouseDown={onResizeMouseDown}
                    sx={{
                        width: 5, flexShrink: 0, cursor: 'col-resize',
                        pointerEvents: 'auto',
                        bgcolor: 'transparent',
                        '&:hover': { bgcolor: '#6366f133' },
                        transition: 'background-color 0.15s',
                    }}
                />
            )}

            {/* ── Collapse / expand toggle ── */}
            <Box
                onClick={toggleOpen}
                sx={{
                    position: 'absolute',
                    left: open ? width + 5 : 0,
                    top: '50%', transform: 'translateY(-50%)',
                    bgcolor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '0 6px 6px 0',
                    p: '7px 3px',
                    cursor: 'pointer',
                    pointerEvents: 'auto',
                    zIndex: 1,
                    '&:hover': { bgcolor: '#293548' },
                    transition: 'left 0.18s ease',
                }}>
                {open
                    ? <ChevronLeft  size={12} style={{ color: '#94a3b8', display: 'block' }} />
                    : <ChevronRight size={12} style={{ color: '#94a3b8', display: 'block' }} />
                }
            </Box>
        </Box>
    );
}
