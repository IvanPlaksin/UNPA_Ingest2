import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
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
import './index.css';

function App() {
    return (
        <ChatProvider>
            <Router>
                <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
                    <Sidebar />
                    <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                        <Routes>
                            <Route path="/" element={<DashboardPage />} />
                            <Route path="/knowledge" element={<KnowledgePage />} />
                            <Route path="/knowledge/rabbit-hole" element={<RabbitHolePage />} />
                            <Route path="/workitems" element={<WorkItemsListPage />} />
                            <Route path="/workitem/:id" element={<WorkItemPage />} />
                            <Route path="/nexus/:id" element={<WorkItemNexusPage />} />
                            <Route path="/knowledge/tfvc" element={<TfvcBrowserPage />} />
                            <Route path="/agent" element={<AgentPage />} />
                        </Routes>
                    </main>
                </div>
            </Router>
        </ChatProvider>
    );
}

export default App;
