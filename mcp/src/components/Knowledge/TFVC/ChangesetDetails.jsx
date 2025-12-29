import React, { useState, useEffect, useCallback } from 'react';
import { FileCode, Loader2, ArrowRight, ChevronRight, ChevronDown } from 'lucide-react';
import { fetchTfvcChangesetChanges, fetchTfvcDiff } from '../../../services/api';
import TfvcDiffViewer from './TfvcDiffViewer';
import {
    Box,
    Paper,
    Typography,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Collapse,
    CircularProgress,
    Stack,
    Divider,
    alpha
} from '@mui/material';

const ChangesetDetails = ({ changesetId }) => {
    const [changes, setChanges] = useState([]);
    const [loadingChanges, setLoadingChanges] = useState(true);
    const [selectedFile, setSelectedFile] = useState(null);
    const [diffData, setDiffData] = useState(null);
    const [loadingDiff, setLoadingDiff] = useState(false);

    const handleSelectFile = useCallback(async (file) => {
        // If clicking the same file, toggle it off (optional, but good for accordion)
        if (selectedFile?.path === file.path) {
            setSelectedFile(null);
            setDiffData(null);
            return;
        }

        setSelectedFile(file);
        setLoadingDiff(true);
        // Don't clear diffData immediately to prevent unmounting the viewer
        try {
            const data = await fetchTfvcDiff(file.path, changesetId);
            setDiffData(data);
        } catch (error) {
            console.error("Error loading diff:", error);
        } finally {
            setLoadingDiff(false);
        }
    }, [changesetId, selectedFile]);

    useEffect(() => {
        const loadChanges = async () => {
            setLoadingChanges(true);
            try {
                const data = await fetchTfvcChangesetChanges(changesetId);
                setChanges(data);
                // Select first file by default if available
                if (data.length > 0) {
                    // handleSelectFile(data[0]); // Don't auto-select in accordion mode to keep list compact
                }
            } catch (error) {
                console.error("Error loading changeset changes:", error);
            } finally {
                setLoadingChanges(false);
            }
        };
        loadChanges();
    }, [changesetId]);

    const [diffHeight, setDiffHeight] = useState(Math.max(300, window.innerHeight * 0.25));
    const [isResizing, setIsResizing] = useState(false);

    const startResizing = useCallback((mouseDownEvent) => {
        setIsResizing(true);
        mouseDownEvent.preventDefault();

        const startY = mouseDownEvent.clientY;
        const startHeight = diffHeight;

        const onMouseMove = (mouseMoveEvent) => {
            const newHeight = startHeight + (mouseMoveEvent.clientY - startY);
            setDiffHeight(Math.max(300, newHeight));
        };

        const onMouseUp = () => {
            setIsResizing(false);
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            document.body.style.cursor = 'default';
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
        document.body.style.cursor = 'ns-resize';
    }, [diffHeight]);

    if (loadingChanges) {
        return (
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={24} />
            </Box>
        );
    }

    if (changes.length === 0) {
        return (
            <Box sx={{ p: 2, color: 'text.secondary' }}>
                <Typography variant="body2">No changes found in this changeset.</Typography>
            </Box>
        );
    }

    return (
        <Paper variant="outlined" sx={{ m: 2, bgcolor: 'background.default', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* File List Header */}
            <Box sx={{ p: 1, px: 2, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" fontWeight="bold" color="text.secondary" textTransform="uppercase">
                    Changed Files ({changes.length})
                </Typography>
                <Typography variant="caption" color="text.disabled">
                    Select a file to view diff
                </Typography>
            </Box>

            <List disablePadding sx={{ overflowY: 'auto', maxHeight: 'calc(100vh - 300px)' }}>
                {changes.map((file, index) => {
                    const isSelected = selectedFile?.path === file.path;
                    return (
                        <React.Fragment key={index}>
                            <ListItem disablePadding divider={index < changes.length - 1}>
                                <Stack width="100%">
                                    <ListItemButton
                                        onClick={() => handleSelectFile(file)}
                                        selected={isSelected}
                                        sx={{
                                            py: 1,
                                            '&.Mui-selected': { bgcolor: 'primary.lighter', color: 'primary.main' }
                                        }}
                                    >
                                        <ListItemIcon sx={{ minWidth: 32, color: isSelected ? 'primary.main' : 'inherit' }}>
                                            <FileCode size={18} />
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={file.path.split('/').pop()}
                                            secondary={file.path}
                                            primaryTypographyProps={{ variant: 'body2', fontWeight: isSelected ? 600 : 400 }}
                                            secondaryTypographyProps={{ variant: 'caption', noWrap: true, sx: { display: 'block' } }}
                                        />
                                        <Box sx={{ ml: 1, display: 'flex', alignItems: 'center', color: isSelected ? 'primary.main' : 'text.disabled' }}>
                                            {isSelected ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                        </Box>
                                    </ListItemButton>

                                    {/* Diff Viewer (Accordion) */}
                                    <Collapse in={isSelected} timeout="auto" unmountOnExit>
                                        <Box
                                            sx={{
                                                width: '100%',
                                                position: 'relative',
                                                bgcolor: 'background.paper',
                                                borderTop: 1,
                                                borderColor: 'divider',
                                                height: diffHeight,
                                                display: 'flex',
                                                flexDirection: 'column'
                                            }}
                                        >
                                            {diffData ? (
                                                <TfvcDiffViewer
                                                    key={selectedFile.path}
                                                    original={diffData.old}
                                                    modified={diffData.new}
                                                    path={selectedFile.path}
                                                />
                                            ) : loadingDiff ? (
                                                <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.paper', zIndex: 1 }}>
                                                    <CircularProgress size={24} />
                                                </Box>
                                            ) : (
                                                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.disabled' }}>
                                                    <Typography variant="body2">Failed to load diff.</Typography>
                                                </Box>
                                            )}

                                            {/* Resize Handle */}
                                            <Box
                                                sx={{
                                                    position: 'absolute',
                                                    bottom: 0,
                                                    left: 0,
                                                    right: 0,
                                                    height: 6,
                                                    cursor: 'ns-resize',
                                                    bgcolor: 'divider',
                                                    opacity: 0.5,
                                                    zIndex: 10,
                                                    transition: 'opacity 0.2s',
                                                    '&:hover': { opacity: 1, bgcolor: 'primary.main' }
                                                }}
                                                onMouseDown={startResizing}
                                            />
                                        </Box>
                                    </Collapse>
                                </Stack>
                            </ListItem>
                        </React.Fragment>
                    );
                })}
            </List>
        </Paper>
    );
};

export default React.memo(ChangesetDetails);
