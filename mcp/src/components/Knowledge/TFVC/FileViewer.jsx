import React, { useState, useEffect } from 'react';
import { Copy, Check, FileCode, AlertTriangle, ExternalLink } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { fetchTfvcContent } from '../../../services/api';
import {
    Box,
    Typography,
    IconButton,
    Tooltip,
    Button,
    Stack,
    CircularProgress,
    Paper,
    Alert
} from '@mui/material';

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

const FileViewer = ({ path }) => {
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!path) return;

        const loadContent = async () => {
            setLoading(true);
            setError(null);
            setContent('');
            try {
                const data = await fetchTfvcContent(path);
                setContent(data);
            } catch (err) {
                console.error("Error loading file content:", err);
                setError("Failed to load file content.");
            } finally {
                setLoading(false);
            }
        };

        loadContent();
    }, [path]);

    const handleCopy = () => {
        navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!path) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'text.secondary', p: 4 }}>
                <FileCode size={48} style={{ marginBottom: 16, opacity: 0.2 }} />
                <Typography variant="body1">Select a file to view its content</Typography>
            </Box>
        );
    }

    if (loading) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'text.secondary' }}>
                <Stack direction="row" spacing={1} alignItems="center">
                    <CircularProgress size={20} color="inherit" />
                    <Typography variant="body2">Loading content...</Typography>
                </Stack>
            </Box>
        );
    }

    if (error) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', p: 4 }}>
                <Alert severity="error">
                    {error}
                </Alert>
            </Box>
        );
    }

    return (
        <Paper
            elevation={0}
            sx={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                overflow: 'hidden',
                borderRadius: 0
            }}
        >
            <Box sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 2,
                py: 1,
                bgcolor: 'background.default',
                borderBottom: 1,
                borderColor: 'divider',
                flexShrink: 0
            }}>
                <Typography variant="subtitle2" component="div" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }} title={path}>
                    {path}
                </Typography>
                <Stack direction="row" spacing={1}>
                    <Button
                        size="small"
                        startIcon={<ExternalLink size={14} />}
                        onClick={() => window.open(`/nexus/file/${encodeURIComponent(path)}`, '_self')}
                        sx={{ textTransform: 'none', fontSize: '0.75rem', color: 'primary.main' }}
                    >
                        Analyze
                    </Button>
                    <Tooltip title={copied ? "Copied!" : "Copy content"}>
                        <Button
                            size="small"
                            startIcon={copied ? <Check size={14} /> : <Copy size={14} />}
                            onClick={handleCopy}
                            color={copied ? "success" : "inherit"}
                            sx={{ textTransform: 'none', fontSize: '0.75rem', color: copied ? 'success.main' : 'text.secondary' }}
                        >
                            {copied ? "Copied" : "Copy"}
                        </Button>
                    </Tooltip>
                </Stack>
            </Box>
            <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
                <Editor
                    height="100%"
                    language={getLanguageFromPath(path)}
                    value={content}
                    theme="light"
                    options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        fontSize: 13,
                        fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                        renderWhitespace: 'selection',
                    }}
                />
            </Box>
        </Paper>
    );
};

export default FileViewer;
