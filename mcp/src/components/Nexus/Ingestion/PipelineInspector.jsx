import React, { useState } from 'react';
import { Activity, Database, FileText, Layers, Hash, Code, ChevronRight, Cpu } from 'lucide-react';

const PipelineInspector = ({ data, isProcessing }) => {
    const [activeTab, setActiveTab] = useState('atoms');

    if (isProcessing) {
        return (
            <div className="flex flex-col h-full bg-gray-50 items-center justify-center text-gray-400 p-8 border-l border-gray-200">
                <Activity className="animate-spin mb-4 text-blue-500" size={32} />
                <p className="text-sm font-semibold">Processing Pipeline...</p>
                <div className="mt-2 text-xs flex gap-2">
                    <span className="px-2 py-1 bg-gray-200 rounded animate-pulse">Parsing</span>
                    <span className="px-2 py-1 bg-gray-200 rounded animate-pulse delay-100">Enriching</span>
                    <span className="px-2 py-1 bg-gray-200 rounded animate-pulse delay-200">Vectorizing</span>
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex flex-col h-full bg-gray-50 items-center justify-center text-gray-400 p-8 border-l border-gray-200 text-center">
                <Database size={48} className="mb-4 opacity-20" />
                <h3 className="text-sm font-semibold text-gray-600">No Analysis Data</h3>
                <p className="text-xs max-w-[200px] mt-2">Run an analysis locally or trigger an ingestion job to inspect the pipeline internals.</p>
            </div>
        );
    }

    const { atoms = [], stats = {} } = data;

    return (
        <div className="flex flex-col h-full bg-slate-50 border-l border-gray-200">
            {/* Header / Stats */}
            <div className="bg-white border-b border-gray-200 p-4">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide flex items-center gap-2 mb-3">
                    <Cpu size={16} /> Pipeline Inspector
                </h2>
                <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-slate-100 p-2 rounded border border-slate-200">
                        <span className="block text-slate-400 font-mono text-[10px] uppercase">Atoms</span>
                        <span className="font-semibold text-slate-700 text-lg">{atoms.length}</span>
                    </div>
                    <div className="bg-slate-100 p-2 rounded border border-slate-200">
                        <span className="block text-slate-400 font-mono text-[10px] uppercase">Tokens</span>
                        <span className="font-semibold text-slate-700 text-lg">{stats.totalTokens || 0}</span>
                    </div>
                    <div className="bg-slate-100 p-2 rounded border border-slate-200">
                        <span className="block text-slate-400 font-mono text-[10px] uppercase">Entities</span>
                        <span className="font-semibold text-slate-700 text-lg">{stats.entitiesCount || 0}</span>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 bg-white">
                {['atoms', 'enrichment', 'vectors'].map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wide border-b-2 transition-colors ${activeTab === tab
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Content Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">

                {/* ATOMS TAB */}
                {activeTab === 'atoms' && (
                    <div className="space-y-4">
                        {atoms.map((atom, index) => (
                            <div key={index} className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden group">
                                {/* Context Header */}
                                {atom.context && atom.context.length > 0 && (
                                    <div className="bg-slate-50 px-3 py-2 border-b border-gray-100 flex flex-wrap gap-1 items-center">
                                        <Layers size={12} className="text-slate-400 mr-1" />
                                        {atom.context.map((ctx, i) => (
                                            <span key={i} className="inline-flex items-center text-[10px] text-slate-600 bg-slate-200 px-1.5 py-0.5 rounded-full border border-slate-300">
                                                {i > 0 && <ChevronRight size={10} className="text-slate-400 -ml-0.5 mr-0.5" />}
                                                {ctx}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Content Body */}
                                <div className="p-3">
                                    <div className="font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                                        {atom.content}
                                    </div>
                                </div>

                                {/* Metadata Footer */}
                                <div className="bg-gray-50 px-3 py-1.5 border-t border-gray-100 flex justify-between items-center text-[10px] text-gray-400 font-mono">
                                    <div className="flex gap-3">
                                        <span className="flex items-center gap-1">
                                            <Hash size={10} /> {index}
                                        </span>
                                        <span className="uppercase text-blue-500 font-semibold">{atom.type}</span>
                                    </div>
                                    <div className="flex gap-3">
                                        {atom.metadata?.page && <span>Pg {atom.metadata.page}</span>}
                                        <span>{Math.ceil(atom.content.length / 4)} toks</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ENRICHMENT TAB */}
                {activeTab === 'enrichment' && (
                    <div className="space-y-4">
                        {/* Placeholder for Enrichment - Assuming data might come later or we mock it */}
                        <div className="bg-purple-50 border border-purple-100 rounded-lg p-4">
                            <h4 className="text-xs font-bold text-purple-800 uppercase mb-2 flex items-center gap-2">
                                <Activity size={14} /> Extracted Concepts
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {/* Mock chips if no real data yet, or map from atoms if they have entities */}
                                {['Security Council', 'Resolution 242', 'Peacekeeping', 'Budget 2024', 'Annex A'].map(tag => (
                                    <span key={tag} className="px-2 py-1 bg-white border border-purple-200 text-purple-700 rounded text-xs shadow-sm">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Summary Block */}
                        <div className="bg-white border border-gray-200 rounded-lg p-3">
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Summary</h4>
                            <p className="text-xs text-gray-700 leading-relaxed italic">
                                "The document discusses the operational budget for the 2024 peacekeeping mission, referencing previous resolutions and outlining the allocation of resources for personnel and logistics."
                            </p>
                        </div>
                    </div>
                )}

                {/* VECTORS TAB */}
                {activeTab === 'vectors' && (
                    <div className="space-y-4">
                        <div className="bg-white border border-gray-200 rounded p-4">
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-2">
                                <Database size={14} /> Embedding Space
                            </h4>
                            {/* Mini Heatmap Visualization */}
                            <div className="grid grid-cols-12 gap-0.5 bg-gray-100 border border-gray-200 p-1 rounded">
                                {Array.from({ length: 96 }).map((_, i) => (
                                    <div
                                        key={i}
                                        className="h-2 w-2 rounded-[1px]"
                                        style={{
                                            backgroundColor: `rgba(59, 130, 246, ${Math.random() * 0.8 + 0.2})`
                                        }}
                                        title={`Dim ${i}: ${Math.random().toFixed(4)}`}
                                    />
                                ))}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-2 text-right font-mono">
                                1536 dimensions (OpenAI text-embedding-3-small)
                            </p>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export default PipelineInspector;
