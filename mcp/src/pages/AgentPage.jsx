import React, { useState } from 'react';
import ChatInterface from '../components/Agent/ChatInterface';
import IngestionControlPanel from '../components/Nexus/IngestionControlPanel';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

const AgentPage = () => {
    // Placeholder for graph model - in a real app, this might come from a selected work item or global context
    const [nexusModel, setNexusModel] = useState(null);

    return (
        <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm z-10">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold shadow-md">
                        PA
                    </div>
                    <h1 className="text-xl font-bold text-slate-800 tracking-tight">Project Advisor Agent</h1>
                </div>
            </header>

            {/* Main Content - Split View */}
            <div className="flex-1 overflow-hidden">
                <PanelGroup direction="horizontal">
                    {/* Left Panel: Knowledge Graph (Context) */}
                    <Panel defaultSize={40} minSize={20} className="bg-white border-r border-slate-200">
                        <div className="h-full flex flex-col">
                            <div className="p-3 border-b border-slate-100 bg-slate-50/50">
                                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Knowledge Context</h2>
                            </div>
                            <div className="flex-1 relative">
                                {/* We reuse IngestionControlPanel but maybe in a read-only mode or just for visualization */}
                                <IngestionControlPanel
                                    nexusModel={nexusModel}
                                    width="100%"
                                />
                                {!nexusModel && (
                                    <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
                                        Graph context will appear here during analysis
                                    </div>
                                )}
                            </div>
                        </div>
                    </Panel>

                    <PanelResizeHandle className="w-1 bg-slate-200 hover:bg-blue-400 transition-colors cursor-col-resize" />

                    {/* Right Panel: Chat Interface */}
                    <Panel defaultSize={60} minSize={30}>
                        <ChatInterface />
                    </Panel>
                </PanelGroup>
            </div>
        </div>
    );
};

export default AgentPage;
