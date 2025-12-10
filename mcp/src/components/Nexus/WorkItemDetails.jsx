import React from 'react';
import { Clock, User, Layers } from 'lucide-react';

const WorkItemDetails = ({ core, fields, relations }) => {
    const getStatusColor = (state) => {
        const s = (state || '').toLowerCase();
        if (s === 'active' || s === 'committed') return 'bg-green-100 text-green-800 border-green-200';
        if (s === 'resolved' || s === 'closed' || s === 'done') return 'bg-gray-100 text-gray-800 border-gray-200';
        if (s === 'new' || s === 'to do') return 'bg-blue-100 text-blue-800 border-blue-200';
        if (s === 'removed') return 'bg-red-100 text-red-800 border-red-200';
        return 'bg-gray-50 text-gray-600 border-gray-100';
    };

    const renderUser = (userField) => {
        if (!userField || !userField.displayName) return <span className="text-gray-400">Unassigned</span>;
        return (
            <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">
                    {userField.displayName.charAt(0)}
                </div>
                <span className="text-sm text-gray-700">{userField.displayName}</span>
            </div>
        );
    };

    // Filter out fields shown in header
    const ignoredFields = ['System.Id', 'System.WorkItemType', 'System.Title', 'System.State', 'System.AssignedTo', 'System.AreaPath', 'System.ChangedDate', 'System.Description'];
    const otherFields = Object.entries(fields || {}).filter(([key]) => !ignoredFields.includes(key));

    return (
        <div className="p-6 bg-white min-h-full">
            {/* Header */}
            <div className="flex justify-between items-start mb-4 pb-4 border-b border-gray-100">
                <div>
                    <div className="flex items-center gap-3 text-sm text-gray-500 mb-1">
                        <span className="font-mono font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">#{core.id}</span>
                        <span className="font-medium text-gray-600">{fields['System.WorkItemType']}</span>
                        <span className="text-gray-300">|</span>
                        <span className="flex items-center gap-1 text-xs">
                            <Clock size={12} /> {new Date(fields['System.ChangedDate']).toLocaleDateString()}
                        </span>
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 leading-tight">
                        {fields['System.Title']}
                    </h1>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${getStatusColor(fields['System.State'])}`}>
                    {fields['System.State']}
                </span>
            </div>

            {/* Core Metadata Grid */}
            <div className="grid grid-cols-2 gap-4 mb-6 text-sm bg-gray-50 p-4 rounded-lg border border-gray-100">
                <div className="flex flex-col gap-1">
                    <span className="text-gray-400 text-xs uppercase font-bold tracking-wider">Assigned To</span>
                    {renderUser(fields['System.AssignedTo'])}
                </div>
                <div className="flex flex-col gap-1">
                    <span className="text-gray-400 text-xs uppercase font-bold tracking-wider">Area Path</span>
                    <span className="font-medium text-gray-700 truncate" title={fields['System.AreaPath']}>{fields['System.AreaPath']}</span>
                </div>
            </div>

            {/* Description */}
            {fields['System.Description'] && (
                <div className="mb-6">
                    <h3 className="text-sm font-bold text-gray-900 mb-2 uppercase tracking-wider flex items-center gap-2">
                        Description
                    </h3>
                    <div
                        className="prose prose-sm max-w-none text-gray-700 bg-white p-4 border rounded shadow-sm"
                        dangerouslySetInnerHTML={{ __html: fields['System.Description'] }}
                    />
                </div>
            )}

            {/* Other Fields Table */}
            {otherFields.length > 0 && (
                <div className="mb-6">
                    <h3 className="text-sm font-bold text-gray-900 mb-2 uppercase tracking-wider">Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm border-t pt-2">
                        {otherFields.map(([key, value]) => (
                            <div key={key} className="flex justify-between py-1 border-b border-gray-50">
                                <span className="text-gray-500 truncate w-1/2 overflow-hidden" title={key}>{key.replace('System.', '').replace('Microsoft.VSTS.', '')}</span>
                                <span className="font-medium text-gray-800 truncate w-1/2 text-right" title={String(value)}>{String(value)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Relations */}
            {relations && relations.length > 0 && (
                <div>
                    <h3 className="text-sm font-bold text-gray-900 mb-2 uppercase tracking-wider flex items-center gap-2">
                        Relations <span className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded text-xs">{relations.length}</span>
                    </h3>
                    <div className="space-y-2">
                        {relations.map((rel, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-100 hover:bg-blue-50 transition-colors">
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <Layers size={14} className="text-gray-400 flex-shrink-0" />
                                    <span className="text-xs font-bold text-gray-600 uppercase">{rel.rel}</span>
                                </div>
                                <a href={rel.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline truncate ml-2 max-w-[200px]">
                                    {rel.url.split('/').pop()}
                                </a>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default WorkItemDetails;
