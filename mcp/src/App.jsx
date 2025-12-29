import React, { useState, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
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
import SingularityPage from './pages/SingularityPage';
import ExperimentalPage from './pages/ExperimentalPage';
// import './index.css'; // Removing in favor of CssBaseline and MUI styles

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
                                {/* Duplicate removed */}

                                {/* Nexus Routes */}
                                <Route path="/nexus/workitem/:id" element={<WorkItemNexusPage />} />
                                <Route path="/nexus/changeset/:id" element={<WorkItemNexusPage />} />
                                <Route path="/nexus/file/*" element={<WorkItemNexusPage />} />
                                {/* Fallback/Legacy */}
                                <Route path="/nexus/:id" element={<WorkItemNexusPage />} />
                                <Route path="/knowledge/tfvc" element={<TfvcBrowserPage />} />
                                <Route path="/agent" element={<AgentPage />} />
                                <Route path="/singularity" element={<SingularityPage />} />
                                <Route path="/singularity/workitem/:id" element={<SingularityPage />} />
                                <Route path="/experimental" element={<ExperimentalPage />} />
                            </Routes>
                        </Box>
                    </Box>
                </Router>
            </ChatProvider>
        </ThemeProvider>
    );
}

export default App;
