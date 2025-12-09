import React from 'react';
import { Clock, User, Layers } from 'lucide-react';

const WorkItemDetails = ({ core, fields }) => {
    const getStatusColor = (state) => {
        const s = (state || '').toLowerCase();
        if (s === 'active' || s === 'committed') return 'active';
        if (s === 'resolved' || s === 'closed' || s === 'done') return 'closed';
        if (s === 'new' || s === 'to do') return 'new';
        if (s === 'removed') return 'bug';
        return 'new';
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

    return (
        <div className="card p-6 bg-white border-l-4 border-l-blue-500 shadow-sm">
            <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-3 text-sm text-gray-500">
                    <span className="font-mono font-bold text-gray-700">#{core.id}</span>
                    <span>{fields['System.WorkItemType']}</span>
                    <span className="text-gray-300">|</span>
                    <span className="flex items-center gap-1">
                        <Clock size={14} /> {new Date(fields['System.ChangedDate']).toLocaleDateString()}
                    </span>
                </div>
                <span className={`status-badge ${getStatusColor(fields['System.State'])}`}>
                    {fields['System.State']}
                </span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4 leading-tight">
                {fields['System.Title']}
            </h1>
            <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                    <User size={16} className="text-gray-400" />
                    <span className="text-gray-500">Assigned To:</span>
                    {renderUser(fields['System.AssignedTo'])}
                </div>
                <div className="flex items-center gap-2">
                    <Layers size={16} className="text-gray-400" />
                    <span className="text-gray-500">Area:</span>
                    <span className="font-medium text-gray-700">{fields['System.AreaPath']}</span>
                </div>
            </div>
        </div>
    );
};

export default WorkItemDetails;
