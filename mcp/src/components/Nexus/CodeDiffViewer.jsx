import React, { useState } from 'react';
import { FileCode, ArrowLeftRight, ChevronRight, ChevronDown } from 'lucide-react';

const CodeDiffViewer = ({ files }) => {
    const [selectedFileIndex, setSelectedFileIndex] = useState(0);

    if (!files || files.length === 0) return null;

    const selectedFile = files[selectedFileIndex];
    const diff = selectedFile.diff || { old: "", new: "" };

    const oldLines = diff.old.split('\n');
    const newLines = diff.new.split('\n');
    const maxLines = Math.max(oldLines.length, newLines.length);

    return (
        <div className="card mt-4 overflow-hidden border border-gray-200 shadow-sm">
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <ArrowLeftRight size={16} className="text-blue-600" />
                    Code Changes
                </h3>
                <span className="text-xs text-gray-500">{files.length} file(s) modified</span>
            </div>

            <div className="flex h-[400px]">
                {/* File List */}
                <div className="w-1/4 border-r border-gray-200 bg-white overflow-y-auto">
                    {files.map((file, index) => (
                        <div
                            key={index}
                            onClick={() => setSelectedFileIndex(index)}
                            className={`px-4 py-3 cursor-pointer text-sm border-b border-gray-100 hover:bg-gray-50 transition-colors flex items-center gap-2 ${selectedFileIndex === index ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'}`}
                        >
                            <FileCode size={14} className={selectedFileIndex === index ? 'text-blue-600' : 'text-gray-400'} />
                            <div className="truncate">
                                <div className={`font-medium truncate ${selectedFileIndex === index ? 'text-blue-700' : 'text-gray-700'}`}>
                                    {file.path.split('/').pop()}
                                </div>
                                <div className="text-xs text-gray-400 truncate" title={file.path}>
                                    {file.path}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Diff View */}
                <div className="w-3/4 bg-white overflow-auto font-mono text-xs">
                    <div className="flex border-b border-gray-200 sticky top-0 bg-white z-10">
                        <div className="w-1/2 px-4 py-2 bg-red-50 text-red-800 font-medium border-r border-gray-200">Original</div>
                        <div className="w-1/2 px-4 py-2 bg-green-50 text-green-800 font-medium">Modified</div>
                    </div>

                    <div className="divide-y divide-gray-100">
                        {Array.from({ length: maxLines }).map((_, i) => {
                            const oldLine = oldLines[i] || "";
                            const newLine = newLines[i] || "";
                            const isDiff = oldLine !== newLine;

                            return (
                                <div key={i} className={`flex hover:bg-gray-50 ${isDiff ? 'bg-yellow-50/30' : ''}`}>
                                    {/* Old Line */}
                                    <div className={`w-1/2 flex ${isDiff && oldLine ? 'bg-red-50' : ''}`}>
                                        <div className="w-8 text-right pr-2 text-gray-300 select-none bg-gray-50 border-r border-gray-100 py-1">
                                            {oldLine ? i + 1 : ""}
                                        </div>
                                        <div className="flex-1 px-2 py-1 whitespace-pre-wrap break-all text-gray-600">
                                            {oldLine}
                                        </div>
                                    </div>

                                    {/* New Line */}
                                    <div className={`w-1/2 flex ${isDiff && newLine ? 'bg-green-50' : ''}`}>
                                        <div className="w-8 text-right pr-2 text-gray-300 select-none bg-gray-50 border-r border-gray-100 border-l border-gray-200 py-1">
                                            {newLine ? i + 1 : ""}
                                        </div>
                                        <div className="flex-1 px-2 py-1 whitespace-pre-wrap break-all text-gray-800">
                                            {newLine}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CodeDiffViewer;
