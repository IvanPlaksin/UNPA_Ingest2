// mcp/src/components/EnhancedPipelineLab/AnalysisPanel.jsx
// AI Analysis Chat Panel для Enhanced Pipeline Lab

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  IconButton,
  CircularProgress,
  Chip
} from '@mui/material';
import { Send, Sparkles, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const QUICK_ACTIONS = [
  { label: 'Quality Report', prompt: 'Give me a detailed quality score breakdown' },
  { label: 'Missed Entities', prompt: 'What entities were likely missed and why?' },
  { label: 'Relationships', prompt: 'Analyze the relationship extraction quality' },
  { label: 'Improvements', prompt: 'What are the top 3 things to improve?' }
];

export default function AnalysisPanel({ sessionId, isReady, onAnalysisComplete }) {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [error, setError] = useState(null);

  const messagesEndRef = useRef(null);
  const eventSourceRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
    // Debug: log messages state updates
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      console.log('[AnalysisPanel] Messages updated, last msg content length:', lastMsg.content?.length || 0);
    }
  }, [messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Auto-start analysis when pipeline completes
  useEffect(() => {
    if (isReady && sessionId && messages.length === 0) {
      startAnalysis();
    }
  }, [isReady, sessionId]);

  const startAnalysis = useCallback(async () => {
    if (!sessionId || isAnalyzing) return;

    setIsAnalyzing(true);
    setError(null);

    // Add placeholder for AI message
    const aiMessageId = Date.now();
    setMessages([{
      id: aiMessageId,
      role: 'assistant',
      content: '',
      isStreaming: true
    }]);

    try {
      // Start analysis
      await fetch(`/api/v1/pipeline-lab/analysis/${sessionId}/start`, {
        method: 'POST'
      });

      // Connect to stream
      console.log('[AnalysisPanel] Connecting to SSE stream...');
      const eventSource = new EventSource(
        `/api/v1/pipeline-lab/analysis/${sessionId}/stream`
      );
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('[AnalysisPanel] SSE connection opened');
      };

      eventSource.addEventListener('analysis_start', (e) => {
        console.log('[AnalysisPanel] Analysis started:', e.data);
      });

      eventSource.addEventListener('analysis_chunk', (e) => {
        try {
          const data = JSON.parse(e.data);
          const content = data.content || '';
          console.log('[AnalysisPanel] Received chunk:', content.substring(0, 50));
          if (content) {
            setMessages(prev => prev.map(msg =>
              msg.id === aiMessageId
                ? { ...msg, content: msg.content + content }
                : msg
            ));
          }
        } catch (parseErr) {
          console.error('[AnalysisPanel] Parse error:', parseErr, e.data);
        }
      });

      eventSource.addEventListener('analysis_complete', () => {
        setMessages(prev => prev.map(msg =>
          msg.id === aiMessageId
            ? { ...msg, isStreaming: false }
            : msg
        ));
        setIsAnalyzing(false);
        eventSource.close();
        onAnalysisComplete?.();
      });

      eventSource.addEventListener('error', (e) => {
        try {
          const { message } = JSON.parse(e.data);
          setError(message);
        } catch {
          setError('Connection lost');
        }
        setIsAnalyzing(false);
        eventSource.close();
      });

      eventSource.onerror = () => {
        if (eventSource.readyState === EventSource.CLOSED) {
          setIsAnalyzing(false);
        }
      };

    } catch (err) {
      setError(err.message);
      setIsAnalyzing(false);
    }
  }, [sessionId, isAnalyzing, onAnalysisComplete]);

  const sendMessage = useCallback(async (message) => {
    if (!message.trim() || !sessionId || isAnalyzing) return;

    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: message
    };

    const aiMessageId = Date.now() + 1;
    const aiMessage = {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      isStreaming: true
    };

    setMessages(prev => [...prev, userMessage, aiMessage]);
    setInputValue('');
    setIsAnalyzing(true);

    try {
      const response = await fetch(
        `/api/v1/pipeline-lab/analysis/${sessionId}/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message })
        }
      );

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                setMessages(prev => prev.map(msg =>
                  msg.id === aiMessageId
                    ? { ...msg, content: msg.content + data.content }
                    : msg
                ));
              }
            } catch (e) {
              // Skip
            }
          }
          if (line.includes('chat_complete')) {
            setMessages(prev => prev.map(msg =>
              msg.id === aiMessageId
                ? { ...msg, isStreaming: false }
                : msg
            ));
          }
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  }, [sessionId, isAnalyzing]);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };

  const handleQuickAction = (prompt) => {
    sendMessage(prompt);
  };

  if (!isReady) {
    return (
      <Paper sx={{
        height: '100%',
        bgcolor: '#12121c',
        border: '1px solid #2a2a3e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 2
      }}>
        <Sparkles size={32} style={{ opacity: 0.3, color: '#0891b2' }} />
        <Typography color="text.secondary">
          AI Analysis will start after pipeline completes
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{
      height: '100%',
      bgcolor: '#12121c',
      border: '1px solid #2a2a3e',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <Box sx={{
        p: 1.5,
        borderBottom: '1px solid #2a2a3e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Sparkles size={18} style={{ color: '#0891b2' }} />
          <Typography variant="subtitle2">AI Analysis</Typography>
          {isAnalyzing && (
            <CircularProgress size={14} sx={{ color: '#0891b2' }} />
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton
            size="small"
            onClick={() => {
              setMessages([]);
              startAnalysis();
            }}
            disabled={isAnalyzing}
            sx={{ color: '#888' }}
          >
            <RotateCcw size={16} />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => setIsCollapsed(!isCollapsed)}
            sx={{ color: '#888' }}
          >
            {isCollapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </IconButton>
        </Box>
      </Box>

      {!isCollapsed && (
        <>
          {/* Messages */}
          <Box sx={{
            flex: 1,
            overflow: 'auto',
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 2
          }}>
            {messages.map((msg) => (
              <Box
                key={msg.id}
                sx={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '90%'
                }}
              >
                <Paper sx={{
                  p: 1.5,
                  bgcolor: msg.role === 'user' ? '#1e3a5f' : '#0a0a14',
                  border: '1px solid',
                  borderColor: msg.role === 'user' ? '#2563eb' : '#2a2a3e'
                }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mb: 0.5 }}
                  >
                    {msg.role === 'user' ? 'You' : 'AI Analyst'}
                  </Typography>

                  <Box sx={{
                    fontSize: '0.85rem',
                    color: '#e0e0e0',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    '& p': { margin: 0, mb: 1 },
                    '& ul, & ol': { pl: 2, my: 1 },
                    '& li': { mb: 0.5 },
                    '& code': {
                      bgcolor: '#1e1e2e',
                      px: 0.5,
                      borderRadius: 0.5,
                      fontSize: '0.8rem'
                    },
                    '& pre': {
                      bgcolor: '#1e1e2e',
                      p: 1,
                      borderRadius: 1,
                      overflow: 'auto'
                    },
                    '& h1, & h2, & h3': {
                      fontSize: '1rem',
                      fontWeight: 600,
                      mt: 1.5,
                      mb: 0.5
                    },
                    '& strong': {
                      color: '#fff'
                    }
                  }}>
                    {msg.content ? (
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    ) : msg.isStreaming ? (
                      <Typography variant="body2" color="text.secondary">
                        Analyzing...
                      </Typography>
                    ) : null}
                    {msg.isStreaming && msg.content && (
                      <Box
                        component="span"
                        sx={{
                          display: 'inline-block',
                          width: 8,
                          height: 16,
                          bgcolor: '#0891b2',
                          ml: 0.5,
                          verticalAlign: 'middle',
                          animation: 'blink 1s infinite',
                          '@keyframes blink': {
                            '0%, 50%': { opacity: 1 },
                            '51%, 100%': { opacity: 0 }
                          }
                        }}
                      />
                    )}
                  </Box>
                </Paper>
              </Box>
            ))}

            {error && (
              <Typography color="error" variant="caption">
                Error: {error}
              </Typography>
            )}

            <div ref={messagesEndRef} />
          </Box>

          {/* Quick Actions */}
          <Box sx={{ px: 2, pb: 1 }}>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {QUICK_ACTIONS.map((action) => (
                <Chip
                  key={action.label}
                  label={action.label}
                  size="small"
                  onClick={() => handleQuickAction(action.prompt)}
                  disabled={isAnalyzing}
                  sx={{
                    bgcolor: '#1e1e2e',
                    fontSize: '0.7rem',
                    color: '#aaa',
                    '&:hover': { bgcolor: '#2a2a3e', color: '#fff' }
                  }}
                />
              ))}
            </Box>
          </Box>

          {/* Input */}
          <Box sx={{
            p: 1.5,
            borderTop: '1px solid #2a2a3e',
            display: 'flex',
            gap: 1
          }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Ask about the analysis..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isAnalyzing}
              sx={{
                '& .MuiOutlinedInput-root': {
                  bgcolor: '#0a0a14',
                  '& fieldset': {
                    borderColor: '#2a2a3e'
                  },
                  '&:hover fieldset': {
                    borderColor: '#3a3a4e'
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: '#0891b2'
                  }
                },
                '& .MuiInputBase-input': {
                  color: '#e0e0e0',
                  fontSize: '0.85rem'
                }
              }}
            />
            <IconButton
              onClick={() => sendMessage(inputValue)}
              disabled={!inputValue.trim() || isAnalyzing}
              sx={{ color: '#0891b2' }}
            >
              <Send size={18} />
            </IconButton>
          </Box>
        </>
      )}
    </Paper>
  );
}
