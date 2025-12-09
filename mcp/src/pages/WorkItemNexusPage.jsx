import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import IngestionControlPanel from '../components/Nexus/IngestionControlPanel';
import VectorizationInspector from '../components/Nexus/VectorizationInspector';
import AttachmentsList from '../components/Nexus/AttachmentsList';
import WorkItemDetails from '../components/Nexus/WorkItemDetails';

import {
    Database, GitBranch, Mail, ShieldCheck, Activity,
    AlertCircle, Calendar, User, Tag, Layers,
    ArrowRight, GitCommit, FileText, Clock, Paperclip, Microscope
} from 'lucide-react';

const WorkItemNexusPage = () => {
    const { id } = useParams();
    const [nexusModel, setNexusModel] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [ingestionReport, setIngestionReport] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [inspectorData, setInspectorData] = useState(null); // { chunks: [] }
    const [analyzingAttachment, setAnalyzingAttachment] = useState(null); // url or id

    // Sidebar Resizing State
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const saved = localStorage.getItem('nexus_sidebar_width');
        return saved ? parseInt(saved, 10) : window.innerWidth * 0.3;
    });
    const [isResizing, setIsResizing] = useState(false);

    useEffect(() => {
        setLoading(true);
        setError(null);
        api.get(`/knowledge/context/${id}`)
            .then(res => {
                setNexusModel(res.data);
            })
            .catch(err => {
                console.error("Error loading Nexus data:", err);
                setError(err.message || "Failed to load Work Item data");
            })
            .finally(() => setLoading(false));
    }, [id]);

    // Resizing Handlers
    const startResizing = React.useCallback((mouseDownEvent) => {
        setIsResizing(true);
    }, []);

    const stopResizing = React.useCallback(() => {
        setIsResizing(false);
        localStorage.setItem('nexus_sidebar_width', sidebarWidth);
    }, [sidebarWidth]);

    const resize = React.useCallback((mouseMoveEvent) => {
        if (isResizing) {
            const newWidth = window.innerWidth - mouseMoveEvent.clientX;
            if (newWidth > 200 && newWidth < window.innerWidth * 0.6) {
                setSidebarWidth(newWidth);
            }
        }
    }, [isResizing]);

    useEffect(() => {
        window.addEventListener("mousemove", resize);
        window.addEventListener("mouseup", stopResizing);
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
        };
    }, [resize, stopResizing]);

    const handleIngest = async () => {
        setIsProcessing(true);
        try {
            const res = await api.post('/knowledge/simulate', nexusModel);
            setIngestionReport(res.data.report);
        } catch (e) {
            alert("Error: " + e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const [activeTab, setActiveTab] = useState('graph'); // 'graph' | 'vector'

    const [simulationGraph, setSimulationGraph] = useState(null);

    const handleAnalyzeAttachment = async (attachment) => {
        setAnalyzingAttachment(attachment.url);
        setActiveTab('graph'); // Switch to graph tab to see the ghost nodes
        try {
            const res = await api.post('/knowledge/analyze-attachment', {
                attachmentUrl: attachment.url,
                workItemId: id,
                fileType: attachment.name
            });

            // Merge ghost nodes
            const { graphPreview, atoms, stats } = res.data;

            setSimulationGraph(graphPreview);
            setInspectorData({ atoms, stats });

        } catch (e) {
            console.error("Analysis failed", e);
            alert("Analysis failed: " + e.message);
        } finally {
            setAnalyzingAttachment(null);
        }
    };

    if (loading) {
        return (
            <div className="p-8 flex flex-col gap-4 animate-pulse max-w-5xl mx-auto">
                <div className="h-8 bg-gray-200 rounded w-1/3"></div>
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-center text-red-600">
                <AlertCircle size={48} className="mx-auto mb-4" />
                <h2 className="text-xl font-bold">Error Loading Work Item</h2>
                <p>{error}</p>
            </div>
        );
    }

    if (!nexusModel || !nexusModel.core) return null;

    const { core, linkedArtifacts = {} } = nexusModel;
    const fields = core.fields || {};

    // --- Render Helpers ---
    const renderHTML = (htmlContent) => {
        if (!htmlContent) return <span className="text-gray-400 italic">No content</span>;
        return (
            <div
                className="prose prose-sm max-w-none text-gray-800"
                dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
        );
    };

    const renderTags = (tags) => {
        if (!tags || tags.length === 0) return <span className="text-gray-400">-</span>;
        return (
            <div className="flex flex-wrap gap-2">
                {tags.map(tag => (
                    <span key={tag} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded border border-blue-100">
                        {tag}
                    </span>
                ))}
            </div>
        );
    };

    return (
        <div className="page-content overflow-hidden flex flex-row absolute inset-0 w-full h-full">

            {/* LEFT: DASHBOARD CONTENT (Scrollable, Flexible) */}
            <div className="flex-1 overflow-y-auto min-h-0 bg-gray-50 p-6" style={{ overflowY: 'auto', height: '100%' }}>
                <div className="max-w-5xl mx-auto flex flex-col gap-6">

                    {/* HEADER */}
                    <WorkItemDetails core={core} fields={fields} />

                    {/* MAIN GRID */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        {/* MAIN COLUMN (2/3) */}
                        <div className="lg:col-span-2 flex flex-col gap-6">

                            {/* Description */}
                            <div className="card p-6">
                                <h3 className="flex items-center gap-2 text-gray-900 font-bold mb-4 border-b pb-2">
                                    <FileText size={18} className="text-blue-600" /> Description
                                </h3>
                                <div className="bg-gray-50 p-4 rounded border border-gray-100 min-h-[100px]">
                                    {renderHTML(fields['System.Description'])}
                                </div>
                            </div>

                            {/* Repro Steps */}
                            {fields['Microsoft.VSTS.TCM.ReproSteps'] && (
                                <div className="card p-6">
                                    <h3 className="flex items-center gap-2 text-gray-900 font-bold mb-4 border-b pb-2">
                                        <Activity size={18} className="text-red-600" /> Repro Steps
                                    </h3>
                                    <div className="bg-gray-50 p-4 rounded border border-gray-100">
                                        {renderHTML(fields['Microsoft.VSTS.TCM.ReproSteps'])}
                                    </div>
                                </div>
                            )}

                            {/* Attachments */}
                            <AttachmentsList
                                attachments={linkedArtifacts.attachments}
                                onAnalyze={handleAnalyzeAttachment}
                                analyzingAttachmentUrl={analyzingAttachment}
                            />

                            {/* Linked Entities (List View) */}
                            <div className="card p-6">
                                <h3 className="flex items-center gap-2 text-gray-900 font-bold mb-4 border-b pb-2">
                                    <GitBranch size={18} className="text-purple-600" /> Linked Entities
                                </h3>

                                {/* Commits / Changesets */}
                                {(linkedArtifacts.commits?.length > 0 || linkedArtifacts.tfvcChangesets?.length > 0) ? (
                                    <div>
                                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Code Changes</h4>
                                        <div className="space-y-2">
                                            {[...(linkedArtifacts.commits || []), ...(linkedArtifacts.tfvcChangesets || [])].map(commit => (
                                                <div key={commit.id} className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-100 rounded">
                                                    <GitCommit size={16} className="text-gray-500 mt-0.5" />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex justify-between items-center mb-1">
                                                            <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-1 rounded">
                                                                {commit.type === 'tfvc' ? `CS ${commit.id}` : commit.id.substring(0, 7)}
                                                            </span>
                                                            <span className="text-xs text-gray-400">{commit.author}</span>
                                                        </div>
                                                        <p className="text-sm text-gray-700 truncate" title={commit.message}>
                                                            {commit.message}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-400 italic">No code changes found.</p>
                                )}
                            </div>
                        </div>

                        {/* SIDE COLUMN (1/3) */}
                        <div className="flex flex-col gap-6">

                            {/* Planning */}
                            <div className="card p-5">
                                <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                                    <Calendar size={16} className="text-green-600" /> Planning
                                </h3>
                                <div className="space-y-4">
                                    <div>
                                        <label>Iteration</label>
                                        <div className="text-sm font-medium text-gray-800 truncate" title={fields['System.IterationPath']}>
                                            {fields['System.IterationPath']}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label>Priority</label>
                                            <div className="text-sm font-medium">{fields['Microsoft.VSTS.Common.Priority'] || '-'}</div>
                                        </div>
                                        <div>
                                            <label>Severity</label>
                                            <div className="text-sm font-medium">{fields['Microsoft.VSTS.Common.Severity'] || '-'}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Tags */}
                            <div className="card p-5">
                                <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                                    <Tag size={16} className="text-orange-500" /> Tags
                                </h3>
                                {renderTags(fields['System.Tags'])}
                            </div>

                            {/* Metadata */}
                            <div className="card p-5 bg-gray-50 border-dashed">
                                <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">System Info</h3>
                                <div className="space-y-2 text-xs text-gray-600">
                                    <div className="flex justify-between">
                                        <span>Created By:</span>
                                        <span className="font-medium">{fields['System.CreatedBy']?.displayName || 'Unknown'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Created Date:</span>
                                        <span>{new Date(fields['System.CreatedDate']).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </div>

            {/* RESIZER HANDLE */}
            <div
                className="w-1 bg-gray-200 hover:bg-blue-500 cursor-col-resize transition-colors z-20"
                onMouseDown={startResizing}
            />

            {/* RIGHT: TABBED PANEL (Resizable) */}
            <div
                className="bg-white border-l border-gray-200 flex flex-col shrink-0 z-10 shadow-xl h-full"
                style={{ width: sidebarWidth }}
            >
                {/* TABS */}
                <div className="flex border-b border-gray-200 bg-gray-50">
                    <button
                        onClick={() => setActiveTab('graph')}
                        className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'graph'
                            ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                            : 'text-gray-500 hover:bg-gray-100'
                            }`}
                    >
                        <ShieldCheck size={16} /> Graph
                    </button>
                    <button
                        onClick={() => setActiveTab('vector')}
                        className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'vector'
                            ? 'bg-white text-green-600 border-b-2 border-green-600'
                            : 'text-gray-500 hover:bg-gray-100'
                            }`}
                    >
                        <Activity size={16} /> Vector QA
                    </button>
                </div>

                {/* CONTENT */}
                <div className="flex-1 relative overflow-hidden">
                    {activeTab === 'graph' && (
                        <IngestionControlPanel
                            nexusModel={nexusModel}
                            onIngest={handleIngest}
                            isProcessing={isProcessing}
                            ingestionReport={ingestionReport}
                            onResetReport={() => setIngestionReport(null)}
                            width="100%" // Full width of container
                            simulationGraph={simulationGraph}
                        />
                    )}
                    {activeTab === 'vector' && (
                        <VectorizationInspector
                            chunks={inspectorData?.atoms}
                            stats={inspectorData?.stats}
                            onClose={() => { }} // Not needed in embedded mode
                            embedded={true}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default WorkItemNexusPage;
