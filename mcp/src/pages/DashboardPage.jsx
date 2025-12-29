// mcp/src/pages/DashboardPage.jsx
import React, { useState, useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import ChatWindow from '../components/Chat/ChatWindow';
import ChatInput from '../components/Chat/ChatInput';
import IngestionVisualizer from '../components/Knowledge/IngestionVisualizer';
import { useChat } from '../context/ChatContext';
import { Activity } from 'lucide-react';
import {
    Box,
    AppBar,
    Toolbar,
    Typography,
    IconButton,
    Select,
    MenuItem,
    FormControl,
    Paper,
    Tooltip
} from '@mui/material';

const DashboardPage = () => {
    const { sendMessage, isLoading, currentUser, setCurrentUser, messages } = useChat();

    // State for right panel
    const [activeJobId, setActiveJobId] = useState(null);
    const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);

    // Manual open handler
    const handleOpenVisualizer = (jobId) => {
        setActiveJobId(jobId);
        setIsRightPanelOpen(true);
    };

    // Window event listener
    useEffect(() => {
        const handler = (e) => handleOpenVisualizer(e.detail.jobId);
        window.addEventListener('open-ingestion-visualizer', handler);
        return () => window.removeEventListener('open-ingestion-visualizer', handler);
    }, []);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
            {/* Header */}
            <AppBar position="static" color="default" elevation={1} sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
                <Toolbar variant="dense" sx={{ minHeight: 48, justifyContent: 'space-between' }}>
                    <Typography variant="subtitle2" fontWeight="bold" color="text.primary">
                        Operations Center
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        {/* Role Selector */}
                        <FormControl size="small" variant="standard">
                            <Select
                                value={currentUser}
                                onChange={(e) => setCurrentUser(e.target.value)}
                                disableUnderline
                                sx={{ fontSize: '0.875rem', fontWeight: 500 }}
                            >
                                <MenuItem value="manager@un.org">Manager</MenuItem>
                                <MenuItem value="developer@un.org">Developer</MenuItem>
                            </Select>
                        </FormControl>

                        <Tooltip title="Toggle Process View">
                            <IconButton
                                onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
                                size="small"
                                color={isRightPanelOpen ? 'primary' : 'default'}
                            >
                                <Activity size={18} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Toolbar>
            </AppBar>

            {/* Resizable Content Area */}
            <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                <PanelGroup direction="horizontal">

                    {/* LEFT PANEL: CHAT */}
                    <Panel defaultSize={isRightPanelOpen ? 60 : 100} minSize={30}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <ChatWindow messages={messages} />
                            <ChatInput onSend={sendMessage} disabled={isLoading} />
                        </Box>
                    </Panel>

                    {/* RIGHT PANEL: VISUALIZER (Conditional) */}
                    {isRightPanelOpen && (
                        <>
                            <PanelResizeHandle style={{ width: '4px', background: 'var(--mui-palette-divider)', cursor: 'col-resize', position: 'relative', zIndex: 10 }} />

                            <Panel defaultSize={40} minSize={20}>
                                <Box sx={{ height: '100%', overflowY: 'auto', bgcolor: 'background.default', borderLeft: 1, borderColor: 'divider' }}>
                                    {activeJobId ? (
                                        <IngestionVisualizer
                                            jobId={activeJobId}
                                            onClose={() => setIsRightPanelOpen(false)}
                                        />
                                    ) : (
                                        <Box sx={{ p: 4, color: 'text.secondary', textAlign: 'center', mt: 6 }}>
                                            <Activity size={48} style={{ marginBottom: '10px', opacity: 0.5 }} />
                                            <Typography variant="body1" gutterBottom>No active ETL processes.</Typography>
                                            <Typography variant="caption">Start ingestion via Knowledge Base or Chat.</Typography>
                                        </Box>
                                    )}
                                </Box>
                            </Panel>
                        </>
                    )}
                </PanelGroup>
            </Box>
        </Box>
    );
};

export default DashboardPage;
