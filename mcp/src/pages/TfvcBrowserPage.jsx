import React, { useState, useEffect } from 'react';
import TfvcTree from '../components/Knowledge/TFVC/TfvcTree';
import FileViewer from '../components/Knowledge/TFVC/FileViewer';
import ChangesetList from '../components/Knowledge/TFVC/ChangesetList';
import { Folder, FileText, History, ChevronRight } from 'lucide-react';
import { Storage } from '../utils/storage';
import { Box, Paper, Tabs, Tab, Typography, Divider, Stack } from '@mui/material';

const STORAGE_KEY_SELECTION = 'tfvc_selected_item';
const STORAGE_KEY_TAB = 'tfvc_active_tab';

import TfvcBreadcrumbs from '../components/Knowledge/TFVC/TfvcBreadcrumbs';

const TfvcBrowserPage = () => {
    const [selectedItem, setSelectedItem] = useState(() => Storage.load(STORAGE_KEY_SELECTION, null));
    const [activeTab, setActiveTab] = useState(() => Storage.load(STORAGE_KEY_TAB, 'contents'));

    useEffect(() => {
        Storage.save(STORAGE_KEY_SELECTION, selectedItem);
    }, [selectedItem]);

    useEffect(() => {
        Storage.save(STORAGE_KEY_TAB, activeTab);
    }, [activeTab]);

    const handleSelect = (item) => {
        setSelectedItem(item);
        if (item.isFolder) {
            // Optional: could show folder contents in right pane too
        } else {
            setActiveTab('contents');
        }
    };

    const handleBreadcrumbNavigate = (newPath) => {
        // When navigating via breadcrumbs, we assume the target is a folder
        // (unless it's the leaf file, but breadcrumbs usually navigate up)
        handleSelect({ path: newPath, isFolder: true });
    };

    const handleTabChange = (event, newValue) => {
        setActiveTab(newValue);
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', bgcolor: 'background.default' }}>
            {/* Header / Breadcrumbs */}
            <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
                <TfvcBreadcrumbs
                    path={selectedItem?.path}
                    onNavigate={handleBreadcrumbNavigate}
                />
            </Box>

            {/* Main Content - Split View */}
            <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Left Panel - Tree */}
                <Paper square sx={{
                    width: 300,
                    minWidth: 250,
                    maxWidth: 400,
                    borderRight: 1,
                    borderColor: 'divider',
                    display: 'flex',
                    flexDirection: 'column',
                    zIndex: 1
                }}>
                    <Box sx={{
                        px: 2,
                        py: 1.5,
                        borderBottom: 1,
                        borderColor: 'divider',
                        bgcolor: 'background.paper'
                    }}>
                        <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase' }}>
                            Explorer
                        </Typography>
                    </Box>
                    <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
                        <TfvcTree
                            onSelect={handleSelect}
                            selectedPath={selectedItem?.path}
                            persistenceKey="tfvc_tree_main"
                        />
                    </Box>
                </Paper>

                {/* Right Panel - Content/History */}
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', bgcolor: 'background.default', overflow: 'hidden' }}>
                    {/* Tabs */}
                    <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
                        <Tabs value={activeTab} onChange={handleTabChange} aria-label="tfvc tabs" sx={{ minHeight: 40 }}>
                            <Tab
                                label="Contents"
                                value="contents"
                                icon={<FileText size={16} />}
                                iconPosition="start"
                                sx={{ minHeight: 40, py: 1 }}
                            />
                            <Tab
                                label="History"
                                value="history"
                                icon={<History size={16} />}
                                iconPosition="start"
                                sx={{ minHeight: 40, py: 1 }}
                            />
                        </Tabs>
                    </Box>

                    {/* Tab Content */}
                    <Box sx={{ flex: 1, p: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        {activeTab === 'contents' && (
                            selectedItem && !selectedItem.isFolder ? (
                                <Paper variant="outlined" sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                    <FileViewer path={selectedItem.path} />
                                </Paper>
                            ) : (
                                <Stack alignItems="center" justifyContent="center" sx={{ height: '100%', color: 'text.disabled' }}>
                                    <Folder size={48} />
                                    <Typography variant="body1" sx={{ mt: 2 }}>Select a file to view content</Typography>
                                </Stack>
                            )
                        )}
                        {activeTab === 'history' && (
                            <Paper variant="outlined" sx={{ flex: 1, overflowY: 'auto' }}>
                                <ChangesetList path={selectedItem?.path} />
                            </Paper>
                        )}
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};

export default TfvcBrowserPage;
