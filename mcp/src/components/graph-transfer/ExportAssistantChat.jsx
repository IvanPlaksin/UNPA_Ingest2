/**
 * ExportAssistantChat — natural-language chat for building/running exports. Talks
 * to POST /export-assistant/chat, renders each turn (tool cards + markdown), and
 * bubbles up a jobId via onExportStarted when the agent runs start_export.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Box, Paper, TextField, IconButton, Typography, CircularProgress, Alert, Chip, Stack } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import RefreshIcon from '@mui/icons-material/Refresh';
import ChatMessage from './ChatMessage';
import { chatWithAssistant } from '../../services/graphTransfer.service';

const WELCOME = {
    role: 'assistant',
    content: `👋 I'm your **Export Assistant**. Tell me what data you'd like to export from the knowledge graph and I'll build the selection, preview it, and run the export.

**Try:**
- "What domains are available?"
- "Export all dialogue data with embeddings"
- "Find labels related to extraction"
- "Preview exporting the FlowDesk namespace"`,
};

const SUGGESTIONS = ['What domains are available?', 'Preview exporting all dialogues', 'Find labels about extraction'];

export default function ExportAssistantChat({ onExportStarted, disabled }) {
    const [messages, setMessages] = useState([WELCOME]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const endRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);
    useEffect(() => { inputRef.current?.focus(); }, []);

    const send = useCallback(async (text) => {
        const userText = (text ?? input).trim();
        if (!userText || loading) return;
        setInput(''); setError(null);
        const userMsg = { role: 'user', content: userText };
        const nextMessages = [...messages, userMsg];
        setMessages(nextMessages);
        setLoading(true);
        try {
            // Send prior turns (skip the welcome message) + the new one.
            const apiMessages = nextMessages.slice(1)
                .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content)
                .map((m) => ({ role: m.role, content: m.content }));
            const data = await chatWithAssistant(apiMessages);
            const assistantMsg = { role: 'assistant', content: data.response, toolCalls: data.toolCalls || [], toolResults: data.toolResults || [] };
            setMessages((prev) => [...prev, assistantMsg]);
            if (data.error) setError(data.error);
            const started = (data.toolResults || []).find((tr) => tr.name === 'start_export' && tr.result?.success);
            if (started && onExportStarted) onExportStarted(started.result.jobId);
        } catch (e) {
            setError(e.response?.data?.error || e.message);
        } finally {
            setLoading(false);
        }
    }, [input, loading, messages, onExportStarted]);

    const onKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
    const reset = () => { setMessages([WELCOME]); setError(null); inputRef.current?.focus(); };

    return (
        <Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 460 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="subtitle2">🤖 Export Assistant</Typography>
                    <Chip label="AI" size="small" color="secondary" />
                </Stack>
                <IconButton size="small" onClick={reset} title="Reset chat"><RefreshIcon fontSize="small" /></IconButton>
            </Stack>

            <Box sx={{ flex: 1, overflow: 'auto', p: 2, display: 'flex', flexDirection: 'column' }}>
                {messages.map((m, i) => <ChatMessage key={i} message={m} />)}
                {loading && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 5.5 }}>
                        <CircularProgress size={16} /><Typography variant="body2" color="text.secondary">Thinking…</Typography>
                    </Box>
                )}
                {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
                <div ref={endRef} />
            </Box>

            {messages.length <= 1 && (
                <Stack direction="row" spacing={1} sx={{ px: 2, pb: 1, flexWrap: 'wrap', gap: 1 }}>
                    {SUGGESTIONS.map((s) => (
                        <Chip key={s} label={s} size="small" variant="outlined" onClick={() => send(s)} disabled={loading || disabled} />
                    ))}
                </Stack>
            )}

            <Box component="form" onSubmit={(e) => { e.preventDefault(); send(); }} sx={{ p: 1.5, borderTop: 1, borderColor: 'divider', display: 'flex', gap: 1 }}>
                <TextField inputRef={inputRef} fullWidth size="small" placeholder="Ask about domains, request an export…"
                    value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown}
                    disabled={loading || disabled} multiline maxRows={3} />
                <IconButton type="submit" color="primary" disabled={!input.trim() || loading || disabled}><SendIcon /></IconButton>
            </Box>
        </Paper>
    );
}
