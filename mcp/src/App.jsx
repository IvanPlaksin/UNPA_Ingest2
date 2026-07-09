import React, { useState, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, useParams } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline, Box } from '@mui/material';
import { ChatProvider } from './context/ChatContext';
import Sidebar from './components/Layout/Sidebar';
import DashboardPage from './pages/DashboardPage';
import KnowledgePage from './pages/KnowledgePage';
import WorkItemPage from './pages/WorkItemPage';
import WorkItemsListPage from './pages/WorkItemsListPage';
import RabbitHolePage from './pages/RabbitHolePage';
import WorkItemNexusPage from './pages/WorkItemNexusPage';
import TfvcBrowserPage from './pages/TfvcBrowserPage';
import AgentPage from './pages/AgentPage';
import SingularityGraph from './components/Singularity/SingularityGraph';
import KnowledgeGraphPage from './pages/KnowledgeGraphPage';
import KnowledgePlanesPage from './pages/KnowledgePlanesPage';
import PipelineLabPage from './pages/PipelineLabPage';
import AOPEGEditorPage from './pages/AOPEGEditorPage';
import GXEVisualizerPage from './pages/GXEVisualizerPage';
import GNNDashboardPage from './pages/GNNDashboardPage';
import SingularityPage from './pages/SingularityPage';
import ExperimentalPage from './pages/ExperimentalPage';
import GraphCRUDPage from './pages/GraphCRUDPage';
import TensorDashboardPage from './pages/TensorDashboardPage';
import GxeManagerPage from './pages/GxeManagerPage';
import GraphVerifierPage from './pages/GraphVerifierPage';
import FlowDeskPage from './instances/flowdesk/pages/FlowDeskPage';
import FlowDeskConfigPage from './instances/flowdesk/pages/FlowDeskConfigPage';
import BackLogPage from './pages/BackLogPage';
import CodexViewerPage from './pages/CodexViewerPage';
import DialoguePage from './pages/DialoguePage/DialoguePage';
import ObservabilityPage from './pages/ObservabilityPage';
import WorkspacesPage from './pages/WorkspacesPage';
import WorkspaceDetailPage from './pages/WorkspaceDetailPage';
import DocumentProcessingPage from './pages/DocumentProcessingPage';
import TriangleExplorerPage from './pages/TriangleExplorerPage';
import GapManagerPage from './pages/GapManagerPage';
import KnowledgeHealthPage from './pages/KnowledgeHealthPage';
import StructuralFormDemoPage from './pages/StructuralFormDemoPage';
import StructuralEditorPage from './pages/StructuralEditorPage';
import UnpaChatDemoPage from './pages/UnpaChatDemoPage';
import EntityStorePage      from './pages/EntityStorePage';
import VectorStorePage      from './pages/VectorStorePage';
import KnowledgeMapPage     from './pages/KnowledgeMapPage';
import PipelineManagerPage  from './pages/PipelineManagerPage';
import PipelineStatsPage    from './pages/PipelineStatsPage';
import LLMAccessControlPage from './pages/LLMAccessControlPage';
import InvestigationPage from './pages/InvestigationPage';
import InvestigationSessionPage from './pages/InvestigationSessionPage';
import EntitySingularityPage from './pages/EntitySingularityPage';
import MethodologyLibraryPage from './components/Methodology/MethodologyLibraryPage';
import MethodologyEditorPage from './components/Methodology/MethodologyEditorPage';
import MethodologyRunnerPage from './components/Methodology/MethodologyRunnerPage';

// import './index.css'; // Removing in favor of CssBaseline and MUI styles

const SingularityWrapper = () => {
    const { id } = useParams();
    return <SingularityGraph rootId={id} />;
};

function App() {
    const [mode, setMode] = useState('dark');

    // Sync MUI mode with Tailwind 'dark' class
    React.useEffect(() => {
        if (mode === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [mode]);

    const theme = useMemo(() => createTheme({
        palette: {
            mode,
            primary: { main: '#3b82f6' },
            background: {
                default: mode === 'dark' ? '#0f172a' : '#f8fafc',
                paper:   mode === 'dark' ? '#1e293b' : '#ffffff',
            },
            ...(mode === 'dark' ? {
                text: {
                    primary:   '#e2e8f0',  // slate-200 — readable white
                    secondary: '#94a3b8',  // slate-400 — readable secondary
                    disabled:  '#64748b',  // slate-500 — muted but visible
                },
            } : {}),
        },
        typography: {
            fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
            fontSize: 14,
            body1:    { fontSize: '0.9rem',   lineHeight: 1.5 },
            body2:    { fontSize: '0.8375rem', lineHeight: 1.5 },
            caption:  { fontSize: '0.75rem',  lineHeight: 1.4 },
            overline: { fontSize: '0.7rem',   lineHeight: 1.4 },
            h6:        { fontWeight: 700 },
            subtitle1: { fontWeight: 600 },
            button:    { textTransform: 'none', fontWeight: 600 },
        },
        components: {
            MuiButton: {
                styleOverrides: {
                    root: { borderRadius: 8 },
                },
            },
            MuiPaper: {
                styleOverrides: {
                    root: { backgroundImage: 'none' },
                },
            },
            MuiTypography: {
                defaultProps: { variantMapping: { body1: 'p', body2: 'p' } },
            },
            MuiTableCell: {
                styleOverrides: {
                    root: { fontSize: '0.8375rem' },
                },
            },
            MuiMenuItem: {
                styleOverrides: {
                    root: { fontSize: '0.875rem' },
                },
            },
            MuiListItemText: {
                styleOverrides: {
                    secondary: { fontSize: '0.8rem' },
                },
            },
            MuiTooltip: {
                styleOverrides: {
                    tooltip: { fontSize: '0.75rem', maxWidth: 320 },
                },
            },
            MuiChip: {
                styleOverrides: {
                    label: { fontSize: '0.78rem' },
                },
            },
            MuiInputBase: {
                styleOverrides: {
                    root: { fontSize: '0.875rem' },
                },
            },
        },
    }), [mode]);

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <ChatProvider>
                <Router>
                    <Box sx={{ display: 'flex', height: '100vh', width: '100vw', bgcolor: 'background.default', color: 'text.primary' }}>
                        <Sidebar />
                        <Box component="main" sx={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
                            <Routes>
                                <Route path="/" element={<DashboardPage />} />
                                <Route path="/knowledge" element={<KnowledgePage />} />
                                <Route path="/knowledge/rabbit-hole" element={<RabbitHolePage />} />
                                <Route path="/workitems" element={<WorkItemsListPage />} />
                                <Route path="/workitem/:id" element={<WorkItemPage />} />
                                <Route path="/workitem/:id" element={<WorkItemPage />} />

                                {/* Nexus Routes */}
                                <Route path="/nexus/workitem/:id" element={<WorkItemNexusPage />} />
                                <Route path="/nexus/changeset/:id" element={<WorkItemNexusPage />} />
                                <Route path="/nexus/file/*" element={<WorkItemNexusPage />} />
                                {/* Fallback/Legacy */}
                                <Route path="/nexus/:id" element={<WorkItemNexusPage />} />
                                <Route path="/knowledge/tfvc" element={<TfvcBrowserPage />} />

                                {/* Singularity Test Route */}
                                <Route path="/singularity/workitem/:id" element={<SingularityWrapper />} />

                                {/* Knowledge Graph Route */}
                                <Route path="/knowledge/graph" element={<KnowledgeGraphPage />} />

                                {/* Knowledge Planes Route */}
                                <Route path="/knowledge/planes" element={<KnowledgePlanesPage />} />

                                {/* Graph Database Manager */}
                                <Route path="/knowledge/crud" element={<GraphCRUDPage />} />

                                <Route path="/agent" element={<AgentPage />} />

                                {/* Pipeline Lab - Consolidated extraction tools */}
                                <Route path="/pipeline-lab" element={<PipelineLabPage />} />

                                {/* AOPEG Graph Editor */}
                                <Route path="/aopeg" element={<AOPEGEditorPage />} />
                                <Route path="/aopeg/:graphId" element={<AOPEGEditorPage />} />

                                {/* GXE Visualizer - AI Tool Orchestration */}
                                <Route path="/gxe" element={<GXEVisualizerPage />} />

                                {/* GNN Dashboard - Graph Neural Networks */}
                                <Route path="/gnn" element={<GNNDashboardPage />} />

                                {/* Singularity - 3D Graph Explorer */}
                                <Route path="/singularity" element={<SingularityPage />} />

                                {/* Entity Singularity - Optimized 3D Entity Store Graph */}
                                <Route path="/entity-singularity" element={<EntitySingularityPage />} />

                                {/* Experimental Features */}
                                <Route path="/experimental" element={<ExperimentalPage />} />

                                {/* Tensor Dashboard - Real-time Performance Monitoring */}
                                <Route path="/tensor-dashboard" element={<TensorDashboardPage />} />

                                {/* GxeManager - Execution Orchestrator Monitor */}
                                <Route path="/gxe-manager" element={<GxeManagerPage />} />

                                {/* Graph Verifier - ExecutableGraphVerifier L1-L3 dashboard */}
                                <Route path="/graph-verifier" element={<GraphVerifierPage />} />

                                {/* FlowDesk AI Intake Demo */}
                                <Route path="/flowdesk" element={<FlowDeskPage />} />
                                <Route path="/forms-demo" element={<StructuralFormDemoPage />} />
                                <Route path="/unpa-chat-demo" element={<UnpaChatDemoPage />} />
                                <Route path="/structural-editor" element={<StructuralEditorPage />} />
                                <Route path="/flowdesk/config" element={<FlowDeskConfigPage />} />

                                {/* BackLog — AI-generated code modification tasks */}
                                <Route path="/backlog" element={<BackLogPage />} />
                                <Route path="/codex" element={<CodexViewerPage />} />
                                <Route path="/dialogue/*" element={<DialoguePage />} />

                                {/* WorkSpace — Isolated knowledge extraction sandbox */}
                                <Route path="/workspaces" element={<WorkspacesPage />} />
                                <Route path="/workspaces/:workspaceId" element={<WorkspaceDetailPage />} />

                                {/* Observability Dashboard */}
                                <Route path="/observability" element={<ObservabilityPage />} />

                                {/* Document Processing — UN document lifecycle */}
                                <Route path="/documents" element={<DocumentProcessingPage />} />
                                <Route path="/documents/dashboard" element={<DocumentProcessingPage />} />
                                <Route path="/documents/search" element={<DocumentProcessingPage />} />
                                <Route path="/documents/sources" element={<DocumentProcessingPage />} />
                                <Route path="/documents/sources/:sourceId" element={<DocumentProcessingPage />} />
                                <Route path="/documents/:documentId" element={<DocumentProcessingPage />} />

                                {/* Triangle Explorer — Knowledge Triangle visualization */}
                                <Route path="/knowledge-triangle" element={<TriangleExplorerPage />} />

                                {/* Gap Manager — centralised gap management */}
                                <Route path="/gaps" element={<GapManagerPage />} />

                                {/* Knowledge Health — namespace health dashboard */}
                                <Route path="/knowledge-health" element={<KnowledgeHealthPage />} />
                                <Route path="/entity-store"           element={<EntityStorePage />} />
                                <Route path="/entity-store/:entityId" element={<EntityStorePage />} />
                                <Route path="/investigation"                              element={<InvestigationPage />} />
                                <Route path="/investigation/methodologies"               element={<MethodologyLibraryPage />} />
                                <Route path="/investigation/methodologies/:id/edit"      element={<MethodologyEditorPage />} />
                                <Route path="/investigation/methodologies/:id/run"       element={<MethodologyRunnerPage />} />
                                <Route path="/investigation/:sessionId"                  element={<InvestigationSessionPage />} />
                                <Route path="/vector-store"      element={<VectorStorePage />} />
                                <Route path="/knowledge-map"     element={<KnowledgeMapPage />} />
                                <Route path="/pipeline-manager"  element={<PipelineManagerPage />} />
                                <Route path="/pipeline-stats"    element={<PipelineStatsPage />} />
                                <Route path="/llm-access-control" element={<LLMAccessControlPage />} />
                            </Routes>
                        </Box>
                    </Box>
                </Router>
            </ChatProvider>
        </ThemeProvider>
    );
}

export default App;
