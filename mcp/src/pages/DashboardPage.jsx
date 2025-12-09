// mcp/src/pages/DashboardPage.jsx
import React, { useState, useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import ChatWindow from '../components/Chat/ChatWindow';
import ChatInput from '../components/Chat/ChatInput';
import IngestionVisualizer from '../components/Knowledge/IngestionVisualizer';
import { useChat } from '../context/ChatContext';
import { Activity } from 'lucide-react';

const DashboardPage = () => {
    const { sendMessage, isLoading, currentUser, setCurrentUser, messages } = useChat();

    // Состояние для правой панели
    const [activeJobId, setActiveJobId] = useState(null);
    const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);

    // Функция для ручного открытия панели (например, для демо)
    const handleOpenVisualizer = (jobId) => {
        setActiveJobId(jobId);
        setIsRightPanelOpen(true);
    };

    // Слушатель событий на window
    useEffect(() => {
        const handler = (e) => handleOpenVisualizer(e.detail.jobId);
        window.addEventListener('open-ingestion-visualizer', handler);
        return () => window.removeEventListener('open-ingestion-visualizer', handler);
    }, []);

    return (
        <div className="page-content">
            {/* Compact Header */}
            <header style={{
                height: '48px',
                padding: '0 16px',
                background: 'var(--bg-header)',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{ fontWeight: 500, fontSize: '14px', color: 'var(--un-navy)' }}>Operations Center</div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {/* Compact Role Selector */}
                    <select
                        value={currentUser}
                        onChange={(e) => setCurrentUser(e.target.value)}
                        style={{ height: '28px', padding: '0 8px', fontSize: '12px' }}
                    >
                        <option value="manager@un.org">Manager</option>
                        <option value="developer@un.org">Developer</option>
                    </select>

                    <button
                        onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
                        className="btn-secondary"
                        style={{ height: '28px', padding: '0 8px' }}
                        title="Toggle Process View"
                    >
                        <Activity size={14} />
                    </button>
                </div>
            </header>

            {/* Resizable Content Area */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
                <PanelGroup direction="horizontal">

                    {/* LEFT PANEL: CHAT */}
                    <Panel defaultSize={isRightPanelOpen ? 60 : 100} minSize={30}>
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <ChatWindow messages={messages} />
                            <ChatInput onSend={sendMessage} disabled={isLoading} />
                        </div>
                    </Panel>

                    {/* RIGHT PANEL: VISUALIZER (Conditional) */}
                    {isRightPanelOpen && (
                        <>
                            <PanelResizeHandle style={{ width: '4px', background: 'var(--border-color)', cursor: 'col-resize' }} />

                            <Panel defaultSize={40} minSize={20}>
                                <div style={{ height: '100%', overflowY: 'auto', background: 'var(--bg-app)', borderLeft: '1px solid var(--border-color)' }}>
                                    {activeJobId ? (
                                        <IngestionVisualizer
                                            jobId={activeJobId}
                                            onClose={() => setIsRightPanelOpen(false)}
                                        />
                                    ) : (
                                        <div style={{ padding: '20px', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '50px' }}>
                                            <Activity size={48} style={{ marginBottom: '10px', opacity: 0.5 }} />
                                            <p>No active ETL processes.</p>
                                            <p style={{ fontSize: '12px' }}>Start ingestion via Knowledge Base or Chat.</p>
                                        </div>
                                    )}
                                </div>
                            </Panel>
                        </>
                    )}
                </PanelGroup>
            </div>
        </div>
    );
};

export default DashboardPage;
