import React from 'react';
import { Paperclip, Activity, Microscope } from 'lucide-react';

const AttachmentsList = ({ attachments, onAnalyze, analyzingAttachmentUrl }) => {
    return (
        <div className="card p-6">
            <h3 className="flex items-center gap-2 text-gray-900 font-bold mb-4 border-b pb-2">
                <Paperclip size={18} className="text-gray-600" /> Attachments
            </h3>
            <div className="space-y-3">
                {(attachments && attachments.length > 0) ? (
                    attachments.map((att, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-100 rounded hover:bg-gray-100 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-red-100 text-red-600 rounded flex items-center justify-center font-bold text-xs">
                                    {att.name.split('.').pop().toUpperCase()}
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-gray-800 truncate max-w-[200px]" title={att.name}>{att.name}</div>
                                    <div className="text-xs text-gray-500">{att.size ? `${(att.size / 1024).toFixed(1)} KB` : 'Unknown Size'}</div>
                                </div>
                            </div>
                            <button
                                onClick={() => onAnalyze(att)}
                                disabled={analyzingAttachmentUrl === att.url}
                                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs font-bold rounded hover:bg-indigo-100 transition-colors disabled:opacity-50"
                            >
                                {analyzingAttachmentUrl === att.url ? (
                                    <Activity size={14} className="animate-spin" />
                                ) : (
                                    <Microscope size={14} />
                                )}
                                Analyze
                            </button>
                        </div>
                    ))
                ) : (
                    <div className="text-sm text-gray-400 italic p-2">No attachments found.</div>
                )}
            </div>
        </div>
    );
};

export default AttachmentsList;
