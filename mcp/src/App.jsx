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
import FlowDeskPage from './instances/flowdesk/pages/FlowDeskPage';
import FlowDeskConfigPage from './instances/flowdesk/pages/FlowDeskConfigPage';
import BackLogPage from './pages/BackLogPage';
import CodexViewerPage from './pages/CodexViewerPage';
import DialoguePage from './pages/DialoguePage/DialoguePage';
import ObservabilityPage from './pages/ObservabilityPage';
import WorkspacesPage from './pages/WorkspacesPage';
import WorkspaceDetailPage from './pages/WorkspaceDetailPage';
import StructuralFormDemoPage from './pages/StructuralFormDemoPage';
import StructuralEditorPage from './pages/StructuralEditorPage';
import UnpaChatDemoPage from './pages/UnpaChatDemoPage';

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
                default: mode === 'dark' ? '#0f172a' : '#f8fafc', // Slate-900 / Slate-50
                paper: mode === 'dark' ? '#1e293b' : '#ffffff',   // Slate-800 / White
            }
        },
        typography: {
            fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
            h6: { fontWeight: 700 },
            subtitle1: { fontWeight: 600 },
            button: { textTransform: 'none', fontWeight: 600 },
        },
        components: {
            MuiButton: {
                styleOverrides: {
                    root: { borderRadius: 8 },
                },
            },
            MuiPaper: {
                styleOverrides: {
                    root: { backgroundImage: 'none' }, // Remove default elevation overlay in dark mode
                }
            }
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

                                {/* Experimental Features */}
                                <Route path="/experimental" element={<ExperimentalPage />} />

                                {/* Tensor Dashboard - Real-time Performance Monitoring */}
                                <Route path="/tensor-dashboard" element={<TensorDashboardPage />} />

                                {/* GxeManager - Execution Orchestrator Monitor */}
                                <Route path="/gxe-manager" element={<GxeManagerPage />} />

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
                            </Routes>
                        </Box>
                    </Box>
                </Router>
            </ChatProvider>
        </ThemeProvider>
    );
}

export default App;
