import React, { useState, useEffect, useCallback } from 'react';
import { FileCode, Loader2, ArrowRight } from 'lucide-react';
import { fetchTfvcChangesetChanges, fetchTfvcDiff } from '../../../services/api';
import TfvcDiffViewer from './TfvcDiffViewer';

const ChangesetDetails = ({ changesetId }) => {
    const [changes, setChanges] = useState([]);
    const [loadingChanges, setLoadingChanges] = useState(true);
    const [selectedFile, setSelectedFile] = useState(null);
    const [diffData, setDiffData] = useState(null);
    const [loadingDiff, setLoadingDiff] = useState(false);

    const handleSelectFile = useCallback(async (file) => {
        // If clicking the same file, toggle it off (optional, but good for accordion)
        if (selectedFile?.path === file.path) {
            setSelectedFile(null);
            setDiffData(null);
            return;
        }

        setSelectedFile(file);
        setLoadingDiff(true);
        // Don't clear diffData immediately to prevent unmounting the viewer
        try {
            const data = await fetchTfvcDiff(file.path, changesetId);
            setDiffData(data);
        } catch (error) {
            console.error("Error loading diff:", error);
        } finally {
            setLoadingDiff(false);
        }
    }, [changesetId, selectedFile]);

    useEffect(() => {
        const loadChanges = async () => {
            setLoadingChanges(true);
            try {
                const data = await fetchTfvcChangesetChanges(changesetId);
                setChanges(data);
                // Select first file by default if available
                if (data.length > 0) {
                    // handleSelectFile(data[0]); // Don't auto-select in accordion mode to keep list compact
                }
            } catch (error) {
                console.error("Error loading changeset changes:", error);
            } finally {
                setLoadingChanges(false);
            }
        };
        loadChanges();
    }, [changesetId]);

    const [diffHeight, setDiffHeight] = useState(Math.max(300, window.innerHeight * 0.25));
    const [isResizing, setIsResizing] = useState(false);

    const startResizing = useCallback((mouseDownEvent) => {
        setIsResizing(true);
        mouseDownEvent.preventDefault();

        const startY = mouseDownEvent.clientY;
        const startHeight = diffHeight;

        const onMouseMove = (mouseMoveEvent) => {
            const newHeight = startHeight + (mouseMoveEvent.clientY - startY);
            setDiffHeight(Math.max(300, newHeight));
        };

        const onMouseUp = () => {
            setIsResizing(false);
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            document.body.style.cursor = 'default';
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
        document.body.style.cursor = 'ns-resize';
    }, [diffHeight]);

    if (loadingChanges) {
        return <div className="p-4 flex justify-center"><Loader2 className="animate-spin text-blue-500" /></div>;
    }

    if (changes.length === 0) {
        return <div className="p-4 text-gray-500">No changes found in this changeset.</div>;
    }

    return (
        <div className="flex flex-col gap-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
            {/* File List */}
            <div className="w-full bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 font-medium text-xs text-gray-500 uppercase flex justify-between items-center">
                    <span>Changed Files ({changes.length})</span>
                    <span className="text-[10px] font-normal opacity-70">Select a file to view diff</span>
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
                    {changes.map((file, index) => (
                        <div key={index} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                            <div
                                onClick={() => handleSelectFile(file)}
                                className={`p-2 text-sm cursor-pointer flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${selectedFile?.path === file.path ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300'}`}
                            >
                                <FileCode className="w-4 h-4 shrink-0" />
                                <div className="truncate flex-1" title={file.path}>
                                    {file.path.split('/').pop()}
                                    <div className="text-xs text-gray-400 truncate">{file.path}</div>
                                </div>
                                {selectedFile?.path === file.path ? <div className="w-2 h-2 rounded-full bg-blue-500" /> : <ArrowRight className="w-4 h-4 opacity-50" />}
                            </div>

                            {/* Diff Viewer (Accordion) */}
                            {selectedFile?.path === file.path && (
                                <div className="border-t border-gray-100 dark:border-gray-800 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <div
                                        className="w-full relative bg-gray-50 dark:bg-gray-900"
                                        style={{ height: diffHeight }}
                                    >
                                        {diffData ? (
                                            <TfvcDiffViewer
                                                key={selectedFile.path}
                                                original={diffData.old}
                                                modified={diffData.new}
                                                path={selectedFile.path}
                                            />
                                        ) : loadingDiff ? (
                                            <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-800/80 z-10 backdrop-blur-sm">
                                                <Loader2 className="animate-spin text-blue-500" />
                                            </div>
                                        ) : (
                                            <div className="flex-1 flex items-center justify-center h-full text-gray-400">
                                                Failed to load diff.
                                            </div>
                                        )}

                                        {/* Resize Handle */}
                                        <div
                                            className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-blue-500/50 transition-colors z-20 bg-gray-200 dark:bg-gray-700 opacity-50 hover:opacity-100"
                                            onMouseDown={startResizing}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default React.memo(ChangesetDetails);
