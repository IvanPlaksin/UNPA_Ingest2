import React, { useState, useEffect } from 'react';
import { Copy, Check, FileCode, AlertTriangle } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { fetchTfvcContent } from '../../../services/api';

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
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
                <FileCode size={48} style={{ marginBottom: '16px', opacity: 0.2 }} />
                <p>Select a file to view its content</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
                <div>Loading content...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--status-error)' }}>
                <AlertTriangle size={32} style={{ marginBottom: '8px' }} />
                <p>{error}</p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px',
                background: '#f8f9fa',
                borderBottom: '1px solid var(--border-color)',
                flexShrink: 0
            }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {path}
                </div>
                <button
                    onClick={handleCopy}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        background: 'transparent', border: 'none',
                        fontSize: '11px', color: 'var(--text-secondary)',
                        cursor: 'pointer'
                    }}
                >
                    {copied ? <Check size={14} color="green" /> : <Copy size={14} />}
                    {copied ? "Copied" : "Copy"}
                </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
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
            </div>
        </div>
    );
};

export default FileViewer;
