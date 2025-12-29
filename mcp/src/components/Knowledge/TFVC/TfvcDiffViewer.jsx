import React from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { FileText, FileDiff } from 'lucide-react';
import { Box, Paper, Typography, Button, Stack, Tooltip } from '@mui/material';

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
        <Paper
            elevation={0}
            variant="outlined"
            sx={{
                height: '100%',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                borderRadius: 1
            }}
        >
            {/* Toolbar */}
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    px: 1.5,
                    py: 1,
                    bgcolor: 'background.default',
                    borderBottom: 1,
                    borderColor: 'divider'
                }}
            >
                <Typography variant="caption" color="text.secondary" fontWeight={500}>
                    {path ? path.split('/').pop() : 'Diff Viewer'}
                </Typography>

                <Tooltip title={showChangesOnly ? "Show Full File" : "Show Changes Only"}>
                    <Button
                        size="small"
                        onClick={() => setShowChangesOnly(!showChangesOnly)}
                        variant={showChangesOnly ? "soft" : "text"}
                        color={showChangesOnly ? "primary" : "inherit"}
                        startIcon={showChangesOnly ? <FileText size={14} /> : <FileDiff size={14} />}
                        sx={{
                            fontSize: '0.75rem',
                            textTransform: 'none',
                            py: 0.5,
                            minWidth: 'auto',
                            bgcolor: showChangesOnly ? 'primary.lighter' : 'transparent',
                            color: showChangesOnly ? 'primary.main' : 'text.secondary'
                        }}
                    >
                        {showChangesOnly ? "Full File" : "Changes Only"}
                    </Button>
                </Tooltip>
            </Box>

            {/* Editor */}
            <Box sx={{ flex: 1, minHeight: 0, width: '100%' }}>
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
            </Box>
        </Paper>
    );
};

export default TfvcDiffViewer;
