import React, { useState, useRef, useEffect } from 'react';
import { Paper, Box, IconButton, Typography, Collapse } from '@mui/material';
import { X, Maximize2, Minimize2, GripHorizontal } from 'lucide-react';

const DraggableWindow = ({
    open,
    onClose,
    title,
    children,
    initialWidth = 400,
    initialHeight = 300,
    minWidth = 300,
    minHeight = 200
}) => {
    const [position, setPosition] = useState({ x: 20, y: 20 });
    const [size, setSize] = useState({ width: initialWidth, height: initialHeight });
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    const windowRef = useRef(null);

    // Initial Position (Bottom-Left default)
    useEffect(() => {
        // Set initial position to bottom-left 
        setPosition({
            x: 20,
            y: window.innerHeight - initialHeight - 40
        });
    }, []);

    // --- Drag Logic ---
    const handleMouseDown = (e) => {
        if (e.target.closest('.window-controls')) return; // Don't drag if clicking buttons
        setIsDragging(true);
        const rect = windowRef.current.getBoundingClientRect();
        setDragOffset({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        });
    };

    const handleMouseMove = (e) => {
        if (isDragging) {
            setPosition({
                x: e.clientX - dragOffset.x,
                y: e.clientY - dragOffset.y
            });
        }
        if (isResizing) {
            const rect = windowRef.current.getBoundingClientRect();
            setSize({
                width: Math.max(minWidth, e.clientX - rect.left),
                height: Math.max(minHeight, e.clientY - rect.top)
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        setIsResizing(false);
    };

    useEffect(() => {
        if (isDragging || isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, isResizing]);


    if (!open) return null;

    return (
        <Paper
            ref={windowRef}
            elevation={6}
            sx={{
                position: 'fixed', // Fixed to viewport
                left: position.x,
                top: position.y,
                width: isCollapsed ? 250 : size.width,
                height: isCollapsed ? 'auto' : size.height,
                zIndex: 1300, // Above everything
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                outline: '1px solid rgba(255,255,255,0.1)',
                bgcolor: 'background.paper',
                borderRadius: 2,
                transition: isDragging || isResizing ? 'none' : 'width 0.2s, height 0.2s',
            }}
        >
            {/* Header / Drag Handle */}
            <Box
                onMouseDown={handleMouseDown}
                sx={{
                    p: 1,
                    bgcolor: 'background.default',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: isDragging ? 'grabbing' : 'grab',
                    userSelect: 'none'
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <GripHorizontal size={16} opacity={0.5} />
                    <Typography variant="subtitle2" fontWeight="bold" noWrap sx={{ maxWidth: 150 }}>
                        {title}
                    </Typography>
                </Box>

                <Box className="window-controls" sx={{ display: 'flex', alignItems: 'center' }}>
                    <IconButton size="small" onClick={() => setIsCollapsed(!isCollapsed)}>
                        {isCollapsed ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
                    </IconButton>
                    <IconButton size="small" onClick={onClose} color="error">
                        <X size={14} />
                    </IconButton>
                </Box>
            </Box>

            {/* Content */}
            <Collapse in={!isCollapsed} sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ flex: 1, overflow: 'auto', p: 0, height: '100%' }}>
                    {children}
                </Box>
            </Collapse>

            {/* Resize Handle */}
            {!isCollapsed && (
                <Box
                    onMouseDown={(e) => {
                        e.stopPropagation();
                        setIsResizing(true);
                    }}
                    sx={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        width: 16,
                        height: 16,
                        cursor: 'nwse-resize',
                        zIndex: 10,
                        '&::after': {
                            content: '""',
                            position: 'absolute',
                            bottom: 4,
                            right: 4,
                            width: 0,
                            height: 0,
                            borderStyle: 'solid',
                            borderWidth: '0 0 8px 8px',
                            borderColor: 'transparent transparent rgba(128,128,128,0.5) transparent',
                        }
                    }}
                />
            )}
        </Paper>
    );
};

export default DraggableWindow;
