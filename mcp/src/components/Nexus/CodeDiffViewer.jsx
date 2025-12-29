import React, { useState } from 'react';
import { FileCode, ArrowLeftRight, ChevronRight, ChevronDown } from 'lucide-react';
import {
    Paper,
    Box,
    Typography,
    Stack,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Divider,
    Grid
} from '@mui/material';

const CodeDiffViewer = ({ files }) => {
    const [selectedFileIndex, setSelectedFileIndex] = useState(0);

    if (!files || files.length === 0) return null;

    const selectedFile = files[selectedFileIndex];
    const diff = selectedFile.diff || { old: "", new: "" };

    const oldLines = diff.old.split('\n');
    const newLines = diff.new.split('\n');
    const maxLines = Math.max(oldLines.length, newLines.length);

    return (
        <Paper variant="outlined" sx={{ mt: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ bgcolor: 'background.default', borderBottom: 1, borderColor: 'divider', px: 2, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                    <ArrowLeftRight size={16} className="text-blue-600" />
                    <Typography variant="subtitle2" fontWeight="bold" color="text.primary">Code Changes</Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary">{files.length} file(s) modified</Typography>
            </Box>

            <Box sx={{ display: 'flex', height: 400 }}>
                {/* File List */}
                <Box sx={{ width: '25%', borderRight: 1, borderColor: 'divider', bgcolor: 'background.paper', overflowY: 'auto' }}>
                    <List disablePadding>
                        {files.map((file, index) => (
                            <ListItem key={index} disablePadding>
                                <ListItemButton
                                    selected={selectedFileIndex === index}
                                    onClick={() => setSelectedFileIndex(index)}
                                    sx={{
                                        py: 1.5,
                                        px: 2,
                                        '&.Mui-selected': {
                                            bgcolor: 'action.selected',
                                            borderLeft: 3,
                                            borderLeftColor: 'primary.main',
                                            paddingLeft: '13px' // Adjust for border
                                        }
                                    }}
                                >
                                    <ListItemIcon sx={{ minWidth: 30 }}>
                                        <FileCode size={16} className={selectedFileIndex === index ? 'text-blue-600' : 'text-gray-400'} />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={file.path.split('/').pop()}
                                        secondary={file.path}
                                        primaryTypographyProps={{ variant: 'body2', fontWeight: selectedFileIndex === index ? 'bold' : 'normal', noWrap: true }}
                                        secondaryTypographyProps={{ variant: 'caption', noWrap: true, title: file.path }}
                                    />
                                </ListItemButton>
                                <Divider component="li" />
                            </ListItem>
                        ))}
                    </List>
                </Box>

                {/* Diff View */}
                <Box sx={{ width: '75%', bgcolor: 'common.white', overflow: 'auto', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    <Box sx={{ display: 'flex', borderBottom: 1, borderColor: 'divider', position: 'sticky', top: 0, bgcolor: 'background.paper', zIndex: 1 }}>
                        <Box sx={{ width: '50%', px: 2, py: 1, bgcolor: 'error.light', color: 'error.dark', fontWeight: 'bold', borderRight: 1, borderColor: 'divider' }}>Original</Box>
                        <Box sx={{ width: '50%', px: 2, py: 1, bgcolor: 'success.light', color: 'success.dark', fontWeight: 'bold' }}>Modified</Box>
                    </Box>

                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        {Array.from({ length: maxLines }).map((_, i) => {
                            const oldLine = oldLines[i] || "";
                            const newLine = newLines[i] || "";
                            const isDiff = oldLine !== newLine;

                            return (
                                <Box key={i} sx={{ display: 'flex', '&:hover': { bgcolor: 'action.hover' }, ...(isDiff && { bgcolor: '#fff9c4' }) }}>
                                    {/* Old Line */}
                                    <Box sx={{ width: '50%', display: 'flex', ...(isDiff && oldLine && { bgcolor: '#ffebee' }) }}>
                                        <Box component="span" sx={{ width: 40, textAlign: 'right', pr: 1, color: 'text.disabled', userSelect: 'none', bgcolor: 'background.default', borderRight: 1, borderColor: 'divider', py: 0.5 }}>
                                            {oldLine ? i + 1 : ""}
                                        </Box>
                                        <Box component="span" sx={{ flex: 1, px: 1, py: 0.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'text.secondary' }}>
                                            {oldLine}
                                        </Box>
                                    </Box>

                                    {/* New Line */}
                                    <Box sx={{ width: '50%', display: 'flex', ...(isDiff && newLine && { bgcolor: '#e8f5e9' }) }}>
                                        <Box component="span" sx={{ width: 40, textAlign: 'right', pr: 1, color: 'text.disabled', userSelect: 'none', bgcolor: 'background.default', borderRight: 1, borderLeft: 1, borderColor: 'divider', py: 0.5 }}>
                                            {newLine ? i + 1 : ""}
                                        </Box>
                                        <Box component="span" sx={{ flex: 1, px: 1, py: 0.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'text.primary' }}>
                                            {newLine}
                                        </Box>
                                    </Box>
                                </Box>
                            );
                        })}
                    </Box>
                </Box>
            </Box>
        </Paper>
    );
};

export default CodeDiffViewer;
