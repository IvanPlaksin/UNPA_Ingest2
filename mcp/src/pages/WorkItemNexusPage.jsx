import React, { useState, useCallback, useEffect } from 'react';
import { Play, Settings, Sun, Moon, Maximize2, X, ChevronUp, ChevronDown, List, Terminal, Database } from 'lucide-react';
import { useParams, useLocation } from 'react-router-dom';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

import SourceSelector from '../components/Nexus/Ingestion/SourceSelector';
import LayeredGraph3D from '../components/Nexus/LayeredGraph3D';
import WorkItemDetails from '../components/Nexus/WorkItemDetails';
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
    const [bottomPanelOpen, setBottomPanelOpen] = useState(true);

    // --- Effects ---
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

    // --- Handlers ---
    // --- Refs ---
    const rightPanelRef = React.useRef(null);
    const bottomPanelRef = React.useRef(null);

    // --- Handlers ---
    const handleNodeClick = (node) => {
        console.log("Node Clicked:", node);
        setSelectedNode(node);
        setActiveTab('details');
        if (bottomPanelRef.current) bottomPanelRef.current.expand();
    };

    const handleIngest = async () => {
        setIsProcessing(true);
        setSourceStatus({});
        setActiveTab('console');
        if (bottomPanelRef.current) bottomPanelRef.current.expand();

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
            setSimulationGraph(prev => {
                const existingNodeIds = new Set(prev.nodes.map(n => n.id));
                const newNodes = graphUpdate.nodes.filter(n => !existingNodeIds.has(n.id));
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

    // Bottom Panel Toggle logic is tri-state (collapsed vs expanded). 
    // If we want a header to toggle it, we do similar:
    const handleToggleBottomPanel = () => {
        const panel = bottomPanelRef.current;
        if (panel) {
            if (bottomPanelOpen) panel.collapse();
            else panel.expand();
        }
    };


    const renderDetailsContent = () => {
        if (!selectedNode) return <div className="p-4 text-gray-400">Select a node to view details.</div>;
        if (selectedNode.type === 'WorkItem' || selectedNode.source === 'ADO') {
            const fields = selectedNode.data?.fields || selectedNode.metadata;
            if (fields) return <WorkItemDetails core={{ id: selectedNode.id }} fields={fields} relations={selectedNode.data?.relations} />;
        }
        return (
            <div className="p-4">
                <h3 className="font-bold text-lg mb-2">{selectedNode.label}</h3>
                <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-60">{JSON.stringify(selectedNode, null, 2)}</pre>
            </div>
        );
    };

    return (
        <div className={`h-screen flex flex-col relative overflow-hidden ${themeMode === 'dark' ? 'bg-black text-white' : 'bg-gray-50 text-gray-900'}`}>

            {/* 1. Header */}
            <header className={`h-14 flex items-center justify-between px-4 z-50 border-b ${themeMode === 'dark' ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
                <div className="flex items-center gap-4">
                    <span className={`font-bold tracking-tight ${themeMode === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                        NEXUS <span className="text-blue-500">COCKPIT</span>
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsProcessing(!isProcessing) || handleIngest()}
                        disabled={isProcessing}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all
                            ${isProcessing ? 'bg-yellow-500/20 text-yellow-500 animate-pulse border border-yellow-500/50' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
                    >
                        {isProcessing ? <Play size={14} className="animate-spin" /> : <Play size={14} />} {isProcessing ? 'Analyzing...' : 'Run Analysis'}
                    </button>
                    <button onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')} className="p-2 rounded-full hover:bg-gray-800">
                        {themeMode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                    </button>
                    {/* Source Panel Toggle */}
                    <button
                        onClick={handleToggleRightPanel}
                        className={`p-2 rounded-full transition-colors ${rightPanelOpen ? 'bg-blue-500/20 text-blue-500' : 'text-gray-400 hover:bg-gray-800'}`}
                    >
                        <Settings size={18} />
                    </button>
                </div>
            </header>

            {/* 2. Resizable Panels Layout */}
            <div className="flex-1 relative w-full h-full">
                <PanelGroup direction="horizontal">

                    {/* LEFT SIDE: Graph + Bottom Panel */}
                    <Panel defaultSize={80} minSize={30}>
                        <PanelGroup direction="vertical">
                            {/* Graph Area */}
                            <Panel defaultSize={70} minSize={10} className="relative">
                                <div className="w-full h-full absolute inset-0">
                                    <LayeredGraph3D graphData={simulationGraph} themeMode={themeMode} onNodeClick={handleNodeClick} />
                                </div>
                            </Panel>

                            <PanelResizeHandle className={`h-1 hover:bg-blue-500 transition-colors ${themeMode === 'dark' ? 'bg-gray-800' : 'bg-gray-200'}`} />

                            {/* Bottom Details Area */}
                            <Panel
                                ref={bottomPanelRef}
                                defaultSize={30}
                                minSize={0}
                                collapsible={true}
                                collapsedSize={0}
                                onCollapse={() => setBottomPanelOpen(false)}
                                onExpand={() => setBottomPanelOpen(true)}
                                className="relative"
                            >
                                <div className={`absolute inset-0 flex flex-col ${themeMode === 'dark' ? 'bg-gray-900' : 'bg-white'}`}>
                                    {/* Tabs / Header */}
                                    <div className={`h-8 flex-none flex items-center justify-between border-b px-2 ${themeMode === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}>
                                        <div className="flex items-center">
                                            <button onClick={() => setActiveTab('details')} className={`mr-4 text-xs font-bold uppercase ${activeTab === 'details' ? 'text-blue-500' : 'text-gray-500'}`}>Details</button>
                                            <button onClick={() => setActiveTab('console')} className={`text-xs font-bold uppercase ${activeTab === 'console' ? 'text-blue-500' : 'text-gray-500'}`}>Console</button>
                                        </div>
                                        <button onClick={handleToggleBottomPanel} className="text-gray-500 hover:text-gray-300">
                                            <ChevronDown size={14} />
                                        </button>
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-h-0 overflow-y-auto w-full">
                                        {activeTab === 'details' ? renderDetailsContent() : (
                                            <div className="p-4 font-mono text-xs w-full">
                                                {Object.entries(sourceStatus).map(([source, status]) => (
                                                    <div key={source} className="mb-1"><span className="font-bold text-blue-400">[{source.toUpperCase()}]</span> {status.message}</div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </Panel>
                        </PanelGroup>
                    </Panel>

                    <PanelResizeHandle className={`w-1 hover:bg-blue-500 transition-colors ${themeMode === 'dark' ? 'bg-gray-800' : 'bg-gray-200'}`} />

                    {/* RIGHT SIDE: Source Panel */}
                    <Panel
                        ref={rightPanelRef}
                        defaultSize={20}
                        minSize={0}
                        collapsible={true}
                        collapsedSize={0}
                        onCollapse={() => setRightPanelOpen(false)}
                        onExpand={() => setRightPanelOpen(true)}
                        className="relative"
                    >
                        <div className={`absolute inset-0 border-l flex flex-col ${themeMode === 'dark' ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'}`}>
                            <div className="p-3 border-b text-xs font-bold uppercase opacity-70 flex justify-between items-center flex-none">
                                <span>Data Sources</span>
                                <button onClick={handleToggleRightPanel}><X size={14} /></button>
                            </div>
                            <div className="flex-1 min-h-0 overflow-y-auto w-full">
                                <SourceSelector
                                    activeSources={activeSources}
                                    lockedSources={lockedSources}
                                    sourceStatus={sourceStatus}
                                    entityData={entityData}
                                    onToggleSource={handleToggleSource}
                                    onConfigChange={handleConfigChange}
                                />
                            </div>
                        </div>
                    </Panel>

                </PanelGroup>
            </div>
        </div>
    );
};

export default WorkItemNexusPage;
