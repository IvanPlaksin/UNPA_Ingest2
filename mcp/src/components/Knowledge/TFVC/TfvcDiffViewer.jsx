import React from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { FileText, FileDiff } from 'lucide-react';

const getLanguageFromPath = (path) => {
    if (!path) return 'plaintext';
    const ext = path.split('.').pop().toLowerCase();
    const map = {
        'js': 'javascript',
        'jsx': 'javascript',
        'ts': 'typescript',
        'tsx': 'typescript',
        'json': 'json',
        'html': 'html',
        'css': 'css',
        'scss': 'scss',
        'xml': 'xml',
        'sql': 'sql',
        'cs': 'csharp',
        'py': 'python',
        'java': 'java',
        'md': 'markdown',
        'yml': 'yaml',
        'yaml': 'yaml',
        'sh': 'shell',
        'bat': 'bat',
        'ps1': 'powershell'
    };
    return map[ext] || 'plaintext';
};

const TfvcDiffViewer = ({ original, modified, path }) => {
    const editorRef = React.useRef(null);
    const [showChangesOnly, setShowChangesOnly] = React.useState(false);

    const handleEditorDidMount = (editor, monaco) => {
        editorRef.current = editor;
    };

    React.useEffect(() => {
        return () => {
            if (editorRef.current) {
                // Detach models before disposal to prevent "TextModel disposed" error
                editorRef.current.setModel(null);
            }
        };
    }, []);

    React.useEffect(() => {
        if (editorRef.current) {
            editorRef.current.updateOptions({
                hideUnchangedRegions: {
                    enabled: showChangesOnly,
                    revealLineCount: 3,
                    minimumLineCount: 3
                }
            });
        }
    }, [showChangesOnly]);

    return (
        <div style={{ height: '100%', width: '100%' }} className="h-full flex flex-col border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {path ? path.split('/').pop() : 'Diff Viewer'}
                </div>
                <button
                    onClick={() => setShowChangesOnly(!showChangesOnly)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${showChangesOnly
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700'
                        }`}
                    title={showChangesOnly ? "Show Full File" : "Show Changes Only"}
                >
                    {showChangesOnly ? (
                        <>
                            <FileText className="w-3.5 h-3.5" />
                            <span>Full File</span>
                        </>
                    ) : (
                        <div style={{ width: '100%' }}>
                            <FileDiff className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>Changes Only</span>
                        </div>
                    )}
                </button>
            </div>

            {/* Editor */}
            <div className="flex-1 min-h-0" style={{ width: '100%' }}>
                <DiffEditor
                    height="100%"
                    width="100%"
                    language={getLanguageFromPath(path)}
                    original={original || ''}
                    modified={modified || ''}
                    theme="light"
                    onMount={handleEditorDidMount}
                    options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        fontSize: 12,
                        renderSideBySide: true,
                        keepCurrentOriginalModel: false,
                        hideUnchangedRegions: {
                            enabled: showChangesOnly,
                            revealLineCount: 3, // Show 3 lines of context around changes
                            minimumLineCount: 3 // Hide regions smaller than 3 lines
                        }
                    }}
                />
            </div>
        </div>
    );
};

export default TfvcDiffViewer;
