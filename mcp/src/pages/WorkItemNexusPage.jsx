import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Play, Settings, Sun, Moon, X, ChevronDown, Database } from 'lucide-react';
import { useParams, useLocation } from 'react-router-dom';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import {
    ThemeProvider,
    createTheme,
    CssBaseline,
    Box,
    AppBar,
    Toolbar,
    Typography,
    IconButton,
    Button,
    Paper,
    Tabs,
    Tab,
    CircularProgress,
    Stack
} from '@mui/material';

import SourceSelector from '../components/Nexus/Ingestion/SourceSelector';
import LayeredGraph3D from '../components/Nexus/LayeredGraph3D';
import WorkItemDetails from '../components/Nexus/WorkItemDetails';
import DraggableWindow from '../components/Nexus/DraggableWindow';
import * as api from '../services/api';

const WorkItemNexusPage = () => {
    // 1. Dynamic Route Params
    const params = useParams();
    const location = useLocation();

    // Determine Entity Context
    let entityType = 'workitem';
    let entityId = params.id;
    const wildcardPath = params['*'];
    if (wildcardPath) {
        entityType = 'file';
        entityId = decodeURIComponent(wildcardPath);
    } else if (location.pathname.includes('/changeset/')) {
        entityType = 'changeset';
    } else if (params.type) {
        entityType = params.type;
    }

    // --- State ---
    const [themeMode, setThemeMode] = useState('dark');
    const [isProcessing, setIsProcessing] = useState(false);

    // Data
    const [simulationGraph, setSimulationGraph] = useState({ nodes: [], edges: [] });
    const [sourceStatus, setSourceStatus] = useState({});
    const [entityData, setEntityData] = useState({});

    // Selection
    const [selectedNode, setSelectedNode] = useState(null);
    const [activeTab, setActiveTab] = useState('details');

    // Config
    const [activeSources, setActiveSources] = useState([]);
    const [lockedSources, setLockedSources] = useState([]);
    const [sourceConfig, setSourceConfig] = useState({});

    // Panel State
    const [rightPanelOpen, setRightPanelOpen] = useState(true);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);

    // --- Theme ---
    const theme = useMemo(() => createTheme({
        palette: {
            mode: themeMode,
            primary: { main: '#3b82f6' }, // Tailwind blue-500
            background: {
                default: themeMode === 'dark' ? '#000000' : '#f9fafb',
                paper: themeMode === 'dark' ? '#111827' : '#ffffff',
            }
        },
        components: {
            MuiAppBar: {
                styleOverrides: {
                    root: {
                        backgroundImage: 'none',
                        borderBottom: `1px solid ${themeMode === 'dark' ? '#1f2937' : '#e5e7eb'}`,
                        backgroundColor: themeMode === 'dark' ? '#111827' : '#ffffff',
                        color: themeMode === 'dark' ? '#fff' : '#111827',
                        boxShadow: 'none',
                    }
                }
            },
            MuiTab: {
                styleOverrides: {
                    root: {
                        textTransform: 'none',
                        fontWeight: 600,
                        fontSize: '0.75rem',
                        minHeight: 32,
                        padding: '6px 16px',
                    }
                }
            },
            MuiTabs: {
                styleOverrides: {
                    root: {
                        minHeight: 32,
                    },
                    indicator: {
                        height: 3,
                    }
                }
            }
        }
    }), [themeMode]);

    // --- Effects ---
    useEffect(() => {
        if (themeMode === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [themeMode]);

    useEffect(() => {
        const loadSeed = async () => {
            console.log(`[Cockpit] Loading seed: ${entityType} ${entityId}`);
            if (!entityId) return;

            // Determine Source to Lock
            let primarySource = 'ado';
            if (entityType === 'changeset') primarySource = 'git';
            if (entityType === 'file') primarySource = 'local';

            setLockedSources([primarySource]);
            setActiveSources(prev => [...new Set([...prev, primarySource])]);

            try {
                const seedNode = await api.fetchEntityDetails(entityType, entityId);
                setSimulationGraph({ nodes: [seedNode], edges: [] });
                setSelectedNode(seedNode);

                setEntityData(prev => {
                    const newData = { ...prev };
                    if (primarySource === 'ado') {
                        newData.workItem = seedNode.data;
                        newData.ado = { id: seedNode.id, title: seedNode.data.fields?.['System.Title'], type: seedNode.data.fields?.['System.WorkItemType'] };
                    }
                    if (primarySource === 'git') newData.git = { id: seedNode.id, message: seedNode.label };
                    return newData;
                });
            } catch (e) {
                console.error("Failed to load seed entity", e);
            }
        };
        loadSeed();
    }, [entityType, entityId]);

    // --- Refs ---
    const rightPanelRef = React.useRef(null);
    // const bottomPanelRef = React.useRef(null); // Removed

    // --- Handlers ---
    const handleNodeClick = (node) => {
        console.log("Node Clicked:", node);
        setSelectedNode(node);
        setActiveTab('details'); // Default to details on selection
        setIsDetailsOpen(true);
        // Fetch full details if needed (mocked or real)
        // If real fetching is needed, it can be added here or inside DraggableWindow's effect
    };

    const handleIngest = async () => {
        setIsProcessing(true);
        setSourceStatus({});
        setSourceStatus({});
        setActiveTab('console');
        setIsDetailsOpen(true); // Open window to show console

        const targetId = entityId || sourceConfig.workItemId || 'demo';
        const sourcesParam = activeSources.join(',');
        const url = `http://localhost:3000/api/v1/nexus/stream/analyze?entityType=${entityType}&entityId=${targetId}&sources=${sourcesParam}`;
        const eventSource = new EventSource(url);

        eventSource.addEventListener('progress', (e) => {
            const data = JSON.parse(e.data);
            setSourceStatus(prev => ({ ...prev, [data.source.toLowerCase()]: { message: data.message, type: 'loading' } }));
        });

        eventSource.addEventListener('graph_update', (e) => {
            const graphUpdate = JSON.parse(e.data);

            // Debug: Check for Parent Node 136937
            const parentNode = graphUpdate.nodes.find(n => String(n.id) === '136937');
            if (parentNode) {
                console.log("!!! PARENT WORK ITEM DATA RECEIVED !!!");
                console.log(JSON.stringify(parentNode, null, 2));
            } else {
                console.log("Graph Update received. Nodes:", graphUpdate.nodes.map(n => n.id));
            }

            setSimulationGraph(prev => {
                const existingNodeIds = new Set(prev.nodes.map(n => String(n.id)));
                const newNodes = graphUpdate.nodes.filter(n => !existingNodeIds.has(String(n.id)));
                return { nodes: [...prev.nodes, ...newNodes], edges: [...prev.edges, ...graphUpdate.edges] };
            });
        });

        eventSource.addEventListener('done', (e) => {
            eventSource.close();
            setIsProcessing(false);
            setSourceStatus(prev => {
                const final = {};
                activeSources.forEach(s => { final[s] = { message: 'Done.', type: 'done' }; });
                return final;
            });
        });

        eventSource.onerror = (e) => { console.error("SSE Error:", e); eventSource.close(); setIsProcessing(false); };
    };

    const handleConfigChange = useCallback((config) => setSourceConfig(config), []);
    const handleToggleSource = (id) => {
        if (!lockedSources.includes(id)) {
            setActiveSources(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
        }
    };

    const handleToggleRightPanel = () => {
        const panel = rightPanelRef.current;
        if (panel) {
            if (rightPanelOpen) panel.collapse();
            else panel.expand();
        }
    };

    // toggleBottomPanel removed


    const renderDetailsContent = () => {
        if (!selectedNode) return <Box p={2} color="text.secondary">Select a node to view details.</Box>;
        if (selectedNode.type === 'WorkItem' || selectedNode.source === 'ADO') {
            const fields = selectedNode.data?.fields || selectedNode.metadata;
            if (fields) return <WorkItemDetails core={{ id: selectedNode.id }} fields={fields} relations={selectedNode.data?.relations} />;
        }
        return (
            <Box p={2}>
                <Typography variant="h6" fontWeight="bold" gutterBottom>{selectedNode.label}</Typography>
                <Paper variant="outlined" sx={{ p: 1, bgcolor: 'background.default', maxHeight: 400, overflow: 'auto' }}>
                    <pre style={{ margin: 0, fontSize: '0.75rem' }}>{JSON.stringify(selectedNode, null, 2)}</pre>
                </Paper>
            </Box>
        );
    };

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* 1. Header */}
                <AppBar position="static" elevation={0}>
                    <Toolbar variant="dense">
                        <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Typography variant="h6" fontWeight="bold" sx={{ letterSpacing: '-0.025em' }}>
                                NEXUS <Box component="span" sx={{ color: 'primary.main' }}>COCKPIT</Box>
                            </Typography>
                        </Box>

                        <Stack direction="row" spacing={1} alignItems="center">
                            <Button
                                variant={isProcessing ? "outlined" : "contained"}
                                color={isProcessing ? "warning" : "primary"}
                                size="small"
                                onClick={() => setIsProcessing(!isProcessing) || handleIngest()}
                                disabled={isProcessing}
                                startIcon={isProcessing ? <CircularProgress size={14} color="inherit" /> : <Play size={14} />}
                                sx={{ borderRadius: 10, fontWeight: 'bold', textTransform: 'uppercase', minWidth: 140 }}
                            >
                                {isProcessing ? 'Analyzing...' : 'Run Analysis'}
                            </Button>

                            <IconButton onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')} size="small">
                                {themeMode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                            </IconButton>

                            <IconButton
                                onClick={handleToggleRightPanel}
                                color={rightPanelOpen ? 'primary' : 'default'}
                                size="small"
                            >
                                <Settings size={18} />
                            </IconButton>
                        </Stack>
                    </Toolbar>
                </AppBar>

                {/* 2. Resizable Panels Layout */}
                <Box sx={{ flex: 1, position: 'relative', width: '100%', height: '100%' }}>
                    <PanelGroup direction="horizontal">

                        {/* LEFT SIDE: Graph Only (Window is floating) */}
                        <Panel defaultSize={80} minSize={30}>
                            <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
                                <LayeredGraph3D
                                    graphData={simulationGraph}
                                    themeMode={themeMode}
                                    onNodeClick={handleNodeClick}
                                    selectedNode={selectedNode}
                                    mainPlaneZ={entityType === 'changeset' ? 100 : entityType === 'file' ? 200 : 0}
                                />

                                {/* Floating Details Window */}
                                <DraggableWindow
                                    open={isDetailsOpen}
                                    onClose={() => setIsDetailsOpen(false)}
                                    title={selectedNode ? (selectedNode.label || `Node #${selectedNode.id}`) : 'Details'}
                                >
                                    <Paper square elevation={0} sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                                        {/* Tabs */}
                                        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                                            <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)}>
                                                <Tab label="Details" value="details" />
                                                <Tab label="Console" value="console" />
                                            </Tabs>
                                        </Box>

                                        {/* Content */}
                                        <Box sx={{ flex: 1, p: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                            <Box sx={{ flex: 1, overflowY: 'auto' }}>
                                                {activeTab === 'details' ? renderDetailsContent() : (
                                                    <Box p={2} sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                                        {Object.entries(sourceStatus).map(([source, status]) => (
                                                            <Box key={source} mb={0.5}>
                                                                <Box component="span" sx={{ fontWeight: 'bold', color: 'primary.main' }}>[{source.toUpperCase()}]</Box> {status.message}
                                                            </Box>
                                                        ))}
                                                    </Box>
                                                )}
                                            </Box>
                                        </Box>
                                    </Paper>
                                </DraggableWindow>
                            </Box>
                        </Panel>

                        <PanelResizeHandle style={{ width: 4, backgroundColor: themeMode === 'dark' ? '#1f2937' : '#e5e7eb', cursor: 'col-resize', transition: 'background-color 0.2s' }} />

                        {/* RIGHT SIDE: Source Panel */}
                        <Panel
                            ref={rightPanelRef}
                            defaultSize={20}
                            minSize={0}
                            collapsible={true}
                            collapsedSize={0}
                            onCollapse={() => setRightPanelOpen(false)}
                            onExpand={() => setRightPanelOpen(true)}
                            style={{ display: 'flex', flexDirection: 'column' }}
                        >
                            <Paper square sx={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', borderLeft: 1, borderColor: 'divider' }}>
                                <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Typography variant="overline" fontWeight="bold" sx={{ opacity: 0.7 }}>Data Sources</Typography>
                                    <IconButton size="small" onClick={handleToggleRightPanel}><X size={14} /></IconButton>
                                </Box>
                                <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                                    <SourceSelector
                                        activeSources={activeSources}
                                        lockedSources={lockedSources}
                                        sourceStatus={sourceStatus}
                                        entityData={entityData}
                                        onToggleSource={handleToggleSource}
                                        onConfigChange={handleConfigChange}
                                    />
                                </Box>
                            </Paper>
                        </Panel>

                    </PanelGroup>
                </Box>
            </Box>
        </ThemeProvider>
    );
};

export default WorkItemNexusPage;
