import React, { useState } from 'react';
import ChatInterface from '../components/Agent/ChatInterface';
import IngestionControlPanel from '../components/Nexus/IngestionControlPanel';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Box, AppBar, Toolbar, Typography, Avatar, Paper } from '@mui/material';

const AgentPage = () => {
    // Placeholder for graph model - in a real app, this might come from a selected work item or global context
    const [nexusModel, setNexusModel] = useState(null);

    return (
        <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default', overflow: 'hidden' }}>
            {/* Header */}
            <AppBar position="static" color="default" elevation={1} sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
                <Toolbar sx={{ minHeight: 48 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Avatar variant="rounded" sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontWeight: 'bold' }}>
                            PA
                        </Avatar>
                        <Typography variant="h6" color="text.primary">
                            Project Advisor Agent
                        </Typography>
                    </Box>
                </Toolbar>
            </AppBar>

            {/* Main Content - Split View */}
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
                <PanelGroup direction="horizontal">
                    {/* Left Panel: Knowledge Graph (Context) */}
                    <Panel defaultSize={40} minSize={20}>
                        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', borderRight: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
                            <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
                                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase' }}>
                                    Knowledge Context
                                </Typography>
                            </Box>
                            <Box sx={{ flex: 1, position: 'relative' }}>
                                {/* We reuse IngestionControlPanel but maybe in a read-only mode or just for visualization */}
                                <IngestionControlPanel
                                    nexusModel={nexusModel}
                                    width="100%"
                                />
                                {!nexusModel && (
                                    <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.disabled', fontSize: '0.875rem' }}>
                                        Graph context will appear here during analysis
                                    </Box>
                                )}
                            </Box>
                        </Box>
                    </Panel>

                    <PanelResizeHandle style={{ width: '4px', background: 'var(--mui-palette-divider)', cursor: 'col-resize', position: 'relative', zIndex: 10 }} />

                    {/* Right Panel: Chat Interface */}
                    <Panel defaultSize={60} minSize={30}>
                        <ChatInterface />
                    </Panel>
                </PanelGroup>
            </Box>
        </Box>
    );
};

export default AgentPage;
