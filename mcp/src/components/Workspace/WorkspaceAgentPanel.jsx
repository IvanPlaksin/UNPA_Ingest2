/**
 * WorkspaceAgentPanel (WS2-008)
 *
 * Persistent chat panel for the workspace agent + actions timeline.
 * Streams agent responses via SSE (POST /workspaces/:id/agent/message).
 *
 * UI: top tabs switch between Chat and Actions Log.
 * Chat persists across sessions (loaded via getAgentSession).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box, Stack, TextField, IconButton, Typography, Paper, Divider,
  CircularProgress, Tabs, Tab, Chip, Tooltip, Alert
} from '@mui/material';
import {
  Send as SendIcon,
  DeleteSweep as ClearIcon,
  Refresh as RefreshIcon,
  SmartToy as BotIcon,
  Person as UserIcon,
  Build as ToolIcon
} from '@mui/icons-material';
import {
  getAgentSession,
  clearAgentSession,
  getAgentActions,
  streamAgentMessage
} from '../../services/workspace.service';
import { ResilientSSEClient } from '../../utils/sse-client';

const ACTION_TYPE_COLORS = {
  CREATE_NODE: '#4CAF50',
  MODIFY_NODE: '#2196F3',
  DELETE_NODE: '#F44336',
  CREATE_EDGE: '#9C27B0',
  DELETE_EDGE: '#FF9800',
  ANALYZE: '#00BCD4',
  EXTRACT: '#FF5722',
  LINK_KB: '#795548',
  VALIDATE: '#3F51B5',
  OTHER: '#9E9E9E'
};

const Message = ({ msg }) => {
  const isUser = msg.role === 'user';
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{
        mb: 1.5,
        flexDirection: isUser ? 'row-reverse' : 'row',
        alignItems: 'flex-start'
      }}
    >
      <Box
        sx={{
          width: 28, height: 28, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: isUser ? 'primary.main' : 'secondary.main',
          color: 'white', flexShrink: 0
        }}
      >
        {isUser ? <UserIcon sx={{ fontSize: 16 }} /> : <BotIcon sx={{ fontSize: 16 }} />}
      </Box>
      <Paper
        sx={{
          p: 1, px: 1.25,
          maxWidth: '85%',
          bgcolor: isUser ? 'primary.main' : 'background.paper',
          color: isUser ? 'primary.contrastText' : 'text.primary',
          borderRadius: 2,
          border: isUser ? 'none' : 1,
          borderColor: 'divider'
        }}
      >
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.825rem' }}>
          {msg.content || <em>(empty)</em>}
        </Typography>
        {msg.meta?.toolCalls && msg.meta.toolCalls.length > 0 && (
          <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.25 }}>
            {msg.meta.toolCalls.slice(0, 5).map((tc, i) => (
              <Chip
                key={i}
                size="small"
                icon={<ToolIcon sx={{ fontSize: 12 }} />}
                label={tc.name}
                sx={{ height: 18, fontSize: '0.6rem' }}
              />
            ))}
          </Stack>
        )}
      </Paper>
    </Stack>
  );
};

const ActionItem = ({ action }) => {
  const color = ACTION_TYPE_COLORS[action.type] || ACTION_TYPE_COLORS.OTHER;
  return (
    <Box sx={{ display: 'flex', gap: 1, py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
      <Box sx={{ width: 4, bgcolor: color, borderRadius: 2, flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Chip
            size="small"
            label={action.type}
            sx={{ height: 16, fontSize: '0.6rem', bgcolor: color, color: 'white' }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
            {new Date(action.ts).toLocaleTimeString()}
          </Typography>
        </Stack>
        <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', fontSize: '0.7rem', wordBreak: 'break-all' }}>
          {action.description || action.toolName}
        </Typography>
      </Box>
    </Box>
  );
};

const WorkspaceAgentPanel = ({ workspaceId }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [messages, setMessages] = useState([]);
  const [actions, setActions] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Load session + actions
  const loadAll = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const [sessionResp, actionsResp] = await Promise.all([
        getAgentSession(workspaceId),
        getAgentActions(workspaceId, { limit: 50 })
      ]);
      setMessages(sessionResp?.data?.messages || []);
      setActions(actionsResp?.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load agent session');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { scrollToBottom(); }, [messages, streamingText, scrollToBottom]);

  // Cross-panel prefill: SidePanel triggers an "analyze" message
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.workspaceId === workspaceId && e.detail?.message) {
        setInput(e.detail.message);
        setActiveTab(0);
      }
    };
    window.addEventListener('workspace:agent:prefill', handler);
    return () => window.removeEventListener('workspace:agent:prefill', handler);
  }, [workspaceId]);

  const sseClientRef = useRef(null);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput('');
    setStreaming(true);
    setStreamingText('');
    setError(null);

    // Optimistic user message
    const userMsg = { id: `tmp-${Date.now()}`, role: 'user', content: text, meta: {}, ts: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);

    let buffer = '';

    const client = new ResilientSSEClient({
      maxRetries: 2,
      timeout: 120000,
      onEvent: (eventName, data) => {
        if (eventName === 'text' && data?.content) {
          buffer += data.content;
          setStreamingText(buffer);
        }
        if (eventName === 'error' && data?.error) {
          setError(data.error);
        }
      },
      onReconnect: (attempt) => {
        setIsReconnecting(true);
        setError(`Reconnecting... (attempt ${attempt})`);
      },
      onTimeout: () => {
        setError('Request timed out. Please try a simpler query.');
      },
      onError: (err) => {
        setError(err.message || 'Connection failed');
      }
    });

    sseClientRef.current = client;

    await client.connect(
      `/api/v1/workspaces/${workspaceId}/agent/message`,
      { message: text }
    );

    setStreaming(false);
    setStreamingText('');
    setIsReconnecting(false);
    // Reload to get the final persisted assistant message + new actions
    await loadAll();
  }, [workspaceId, input, streaming, loadAll]);

  // Cleanup on unmount
  useEffect(() => {
    return () => sseClientRef.current?.abort();
  }, []);

  const handleClear = useCallback(async () => {
    if (!confirm('Clear chat history?')) return;
    try {
      await clearAgentSession(workspaceId);
      setMessages([]);
    } catch (err) {
      setError(err.message || 'Clear failed');
    }
  }, [workspaceId]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header / Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Stack direction="row" alignItems="center" sx={{ px: 1, pt: 0.5 }}>
          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ minHeight: 32, flex: 1 }}>
            <Tab label="Chat" sx={{ minHeight: 32, py: 0, fontSize: '0.75rem' }} />
            <Tab label={`Actions (${actions.length})`} sx={{ minHeight: 32, py: 0, fontSize: '0.75rem' }} />
          </Tabs>
          <Tooltip title="Reload">
            <IconButton size="small" onClick={loadAll}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {activeTab === 0 && (
            <Tooltip title="Clear history">
              <IconButton size="small" onClick={handleClear}>
                <ClearIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Box>

      {isReconnecting && (
        <Alert severity="warning" sx={{ borderRadius: 0, py: 0.25 }} icon={false}>
          <Typography variant="caption">Reconnecting...</Typography>
        </Alert>
      )}
      {error && !isReconnecting && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ borderRadius: 0 }}>
          {error}
        </Alert>
      )}

      {/* Content */}
      {activeTab === 0 ? (
        <>
          <Box sx={{ flex: 1, overflowY: 'auto', p: 1.25, minHeight: 0 }}>
            {loading && messages.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <CircularProgress size={20} />
              </Box>
            ) : messages.length === 0 ? (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', py: 4 }}>
                No messages yet. Start chatting with the agent.
              </Typography>
            ) : (
              messages.map(m => <Message key={m.id} msg={m} />)
            )}
            {streaming && streamingText && (
              <Message msg={{ id: 'streaming', role: 'assistant', content: streamingText, meta: {} }} />
            )}
            {streaming && !streamingText && (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ pl: 5, py: 1 }}>
                <CircularProgress size={12} />
                <Typography variant="caption" color="text.secondary">thinking…</Typography>
              </Stack>
            )}
            <div ref={messagesEndRef} />
          </Box>

          <Divider />

          <Box sx={{ p: 1, flexShrink: 0 }}>
            <Stack direction="row" spacing={0.5} alignItems="flex-end">
              <TextField
                fullWidth
                size="small"
                placeholder="Ask the workspace agent…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={streaming}
                multiline
                maxRows={4}
                sx={{ '& .MuiInputBase-root': { fontSize: '0.825rem' } }}
              />
              <IconButton
                color="primary"
                onClick={handleSend}
                disabled={streaming || !input.trim()}
              >
                {streaming ? <CircularProgress size={18} /> : <SendIcon fontSize="small" />}
              </IconButton>
            </Stack>
          </Box>
        </>
      ) : (
        <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {actions.length === 0 ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', py: 4 }}>
              No actions logged yet.
            </Typography>
          ) : (
            <Box>
              {actions.map(a => <ActionItem key={a.id} action={a} />)}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};

export default WorkspaceAgentPanel;
