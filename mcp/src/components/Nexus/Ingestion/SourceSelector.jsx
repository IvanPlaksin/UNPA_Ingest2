import React, { useState, useEffect } from 'react';
import { Database, GitBranch, FolderOpen, ToggleLeft, ToggleRight, Check, Loader2, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import WorkItemDetails from '../WorkItemDetails';

const SourceSelector = ({ activeSources = [], lockedSources = [], sourceStatus = {}, entityData = {}, onToggleSource, onConfigChange }) => {
    // Local state for configuration inputs
    // We lift 'entityData' from parent now, so less local state for "inputs" if the parent provides context.
    // If no context, we still need inputs.

    const [workItemId, setWorkItemId] = useState('');
    const [expandedSources, setExpandedSources] = useState([]);

    // Auto-expand active sources once
    useEffect(() => {
        setExpandedSources(prev => {
            const newActive = activeSources.filter(s => !prev.includes(s));
            return [...prev, ...newActive];
        });
    }, [activeSources]);


    const toggleExpand = (id) => {
        setExpandedSources(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
    };

    const SourceItem = ({ id, label, icon: Icon, description, children }) => {
        const isLocked = lockedSources.includes(id);
        const isActive = activeSources.includes(id) || isLocked;
        const isExpanded = expandedSources.includes(id);
        const status = sourceStatus[id];

        return (
            <div className={`border-b border-gray-100 transition-all duration-200 ${isActive ? 'bg-white' : 'bg-gray-50'}`}>
                {/* Header */}
                <div
                    className={`p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 ${isActive ? 'bg-blue-50/20' : ''}`}
                    onClick={() => isActive && toggleExpand(id)}
                >
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg transition-colors ${isActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-500'}`}>
                            <Icon size={20} />
                        </div>
                        <div>
                            <h3 className="font-medium text-gray-800 flex items-center gap-2">
                                {label}
                                {isLocked && <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded flex items-center gap-1">Locked</span>}
                            </h3>
                            <p className="text-xs text-gray-500">{description}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {isActive && (
                            <button className="text-gray-400 hover:text-gray-600">
                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                        )}

                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!isLocked) onToggleSource(id);
                            }}
                            disabled={isLocked}
                            className={`transition-colors ${isActive ? 'text-blue-600' : 'text-gray-300 hover:text-gray-400'} ${isLocked ? 'cursor-not-allowed opacity-50' : ''}`}
                        >
                            {isActive ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                        </button>
                    </div>
                </div>

                {/* Body (Accordion) */}
                {isActive && isExpanded && (
                    <div className="px-4 pb-4 animate-in slide-in-from-top-2 fade-in duration-200">
                        {/* Input Area (if needed) */}
                        {!entityData[id] && id === 'ado' && (
                            <div className="mb-3">
                                <input
                                    type="text"
                                    placeholder="Enter Work Item ID..."
                                    className="w-full text-sm border-gray-200 rounded-md focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-3 py-2"
                                    value={workItemId}
                                    onChange={(e) => {
                                        setWorkItemId(e.target.value);
                                        if (onConfigChange) onConfigChange({ workItemId: e.target.value });
                                    }}
                                />
                            </div>
                        )}

                        {/* Status Message */}
                        {status && (
                            <div className="mb-3 p-2 bg-gray-50 rounded border border-gray-100 text-xs font-mono text-gray-600 flex items-start gap-2">
                                {status.message !== 'Done.' ? (
                                    <Loader2 size={14} className="animate-spin mt-0.5 text-blue-500 shrink-0" />
                                ) : (
                                    <Check size={14} className="mt-0.5 text-green-500 shrink-0" />
                                )}
                                <span>{status.message}</span>
                            </div>
                        )}

                        {/* Content Children */}
                        <div className="text-sm text-gray-600">
                            {children}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-white border-r border-gray-200">
            <div className="p-4 border-b border-gray-200 bg-gray-50/50">
                <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wider">
                    Dimensions
                </h2>
            </div>

            <div className="flex-1 overflow-y-auto">
                <SourceItem
                    id="ado"
                    label="Azure DevOps"
                    icon={Database}
                    description="Work Items, Tasks, Bugs"
                >
                    {/* Embedded Work Item Details */}
                    {entityData.workItem ? (
                        <div className="mt-2 text-[0.7rem]">
                            <WorkItemDetails
                                core={entityData.workItem.core}
                                fields={entityData.workItem.fields}
                            />
                        </div>
                    ) : entityData.ado ? (
                        <div className="bg-blue-50 p-3 rounded text-xs border border-blue-100">
                            <strong>{entityData.ado.type || 'Work Item'} {entityData.ado.id}</strong>
                            <p className="mt-1 opacity-80 line-clamp-2">{entityData.ado.title || 'Loading details...'}</p>
                        </div>
                    ) : (
                        <p className="text-xs text-gray-400 italic">No Work Item loaded.</p>
                    )}
                </SourceItem>

                <SourceItem
                    id="git"
                    label="Git Repositories"
                    icon={GitBranch}
                    description="Commits, PRs, File Changes"
                >
                    {entityData.git ? (
                        <div className="bg-orange-50 p-3 rounded text-xs border border-orange-100">
                            <strong>Commit {entityData.git.id?.substring(0, 8)}</strong>
                            <p className="mt-1 opacity-80">{entityData.git.message || 'Loading commit...'}</p>
                        </div>
                    ) : (
                        <p className="text-xs text-gray-400 italic">No Git data loaded.</p>
                    )}
                </SourceItem>

                <SourceItem
                    id="kb"
                    label="Knowledge Base"
                    icon={FolderOpen}
                    description="Vectors, Documentation, Context"
                >
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-xs p-2 bg-gray-50 rounded hover:bg-gray-100 cursor-pointer">
                            <FileText size={14} className="text-gray-400" />
                            <span>index.ts</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs p-2 bg-gray-50 rounded hover:bg-gray-100 cursor-pointer">
                            <FileText size={14} className="text-gray-400" />
                            <span>readme.md</span>
                        </div>
                    </div>
                </SourceItem>
            </div>
        </div>
    );
};

export default SourceSelector;
