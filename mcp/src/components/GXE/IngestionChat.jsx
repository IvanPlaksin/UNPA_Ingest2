/**
 * IngestionChat
 *
 * AI chat for interacting with the extraction orchestrator.
 * Allows asking questions about the process, entities, rules, anomalies.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box, TextField, IconButton, Typography,
  CircularProgress, Chip,
} from '@mui/material';
import {
  Send, Bot, User, Sparkles,
  Database, FileCode, HelpCircle, AlertCircle,
} from 'lucide-react';
import useImportSqlStore from '../../stores/importSqlStore';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3010';

const QUICK_ACTIONS = [
  { label: 'Explain quality', icon: HelpCircle, prompt: 'Explain the quality score and how it was calculated' },
  { label: 'List anomalies',  icon: AlertCircle, prompt: 'What anomalies were found during extraction?' },
  { label: 'Summarize entities', icon: Database, prompt: 'Summarize the business entities discovered' },
  { label: 'Business rules', icon: FileCode, prompt: 'List the business rules extracted from procedures' },
];

export default function IngestionChat({ sessionId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const {
    agentSummary,
    agentPhases,
    agentGraphs,
    agentQualityScore,
  } = useImportSqlStore();

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initial greeting
  useEffect(() => {
    if (messages.length === 0 && agentSummary) {
      setMessages([{
        role: 'assistant',
        content: buildGreeting(agentSummary, agentQualityScore),
        timestamp: new Date(),
      }]);
    }
  }, [agentSummary, agentQualityScore]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = { role: 'user', content: input.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const resp = await fetch(`${API_BASE}/api/v1/mssql/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input.trim(),
          sessionId,
          context: {
            summary: agentSummary,
            phases: agentPhases?.map(p => ({ name: p.phaseName, status: p.status })),
            graphs: agentGraphs ? Object.keys(agentGraphs) : [],
            qualityScore: agentQualityScore,
          },
        }),
      });

      const data = resp.ok ? await resp.json() : { message: 'Service unavailable. Try again later.' };

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.message || data.error || 'No response.',
        timestamp: new Date(),
        isError: !resp.ok,
      }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Connection error: ${error.message}`,
        isError: true,
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, sessionId, agentSummary, agentPhases, agentGraphs, agentQualityScore]);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickAction = (prompt) => {
    setInput(prompt);
    setTimeout(() => inputRef.current?.querySelector('input')?.focus(), 100);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: '#0d1117' }}>
      {/* Quick Actions */}
      {messages.length <= 1 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, p: 2, borderBottom: '1px solid #21262d' }}>
          {QUICK_ACTIONS.map((action, i) => (
            <Chip
              key={i}
              icon={<action.icon size={14} />}
              label={action.label}
              onClick={() => handleQuickAction(action.prompt)}
              sx={{
                bgcolor: '#21262d', color: '#8b949e',
                '&:hover': { bgcolor: '#30363d', color: '#e6edf3' },
                '& .MuiChip-icon': { color: 'inherit' },
              }}
            />
          ))}
        </Box>
      )}

      {/* Messages */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {messages.map((msg, index) => (
          <MessageBubble key={index} message={msg} />
        ))}

        {isLoading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Bot size={20} color="#8b949e" />
            <CircularProgress size={16} sx={{ color: '#58a6ff' }} />
            <Typography sx={{ color: '#8b949e', fontSize: 13 }}>Thinking...</Typography>
          </Box>
        )}

        <div ref={messagesEndRef} />
      </Box>

      {/* Input */}
      <Box sx={{ p: 2, borderTop: '1px solid #30363d', display: 'flex', gap: 1 }}>
        <TextField
          ref={inputRef}
          fullWidth
          placeholder="Ask about the extraction process..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={isLoading}
          size="small"
          sx={{
            '& .MuiOutlinedInput-root': {
              bgcolor: '#161b22',
              color: '#e6edf3',
              '& fieldset': { borderColor: '#30363d' },
              '&:hover fieldset': { borderColor: '#58a6ff' },
              '&.Mui-focused fieldset': { borderColor: '#58a6ff' },
            },
          }}
        />
        <IconButton
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          sx={{
            bgcolor: '#238636', color: 'white',
            '&:hover': { bgcolor: '#2ea043' },
            '&:disabled': { bgcolor: '#21262d', color: '#484f58' },
          }}
        >
          <Send size={18} />
        </IconButton>
      </Box>
    </Box>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const isError = message.isError;

  return (
    <Box sx={{
      display: 'flex', gap: 1.5,
      alignItems: 'flex-start',
      flexDirection: isUser ? 'row-reverse' : 'row',
    }}>
      <Box sx={{
        width: 28, height: 28, borderRadius: '50%',
        bgcolor: isUser ? '#238636' : '#1f6feb',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {isUser ? <User size={14} color="white" /> : <Sparkles size={14} color="white" />}
      </Box>

      <Box sx={{
        maxWidth: '80%', p: 1.5, borderRadius: 2,
        bgcolor: isUser ? '#238636' : isError ? '#da363320' : '#161b22',
        border: isError ? '1px solid #da3633' : '1px solid #30363d',
      }}>
        <Typography sx={{
          color: isUser ? 'white' : isError ? '#f85149' : '#e6edf3',
          fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
        }}>
          {message.content}
        </Typography>
        <Typography sx={{ color: '#6e7681', fontSize: 10, mt: 0.5, textAlign: isUser ? 'right' : 'left' }}>
          {formatTime(message.timestamp)}
        </Typography>
      </Box>
    </Box>
  );
}

function buildGreeting(summary, qualityScore) {
  const quality = qualityScore >= 0.8 ? 'excellent' : qualityScore >= 0.6 ? 'good' : 'needs attention';
  return `I've completed analyzing the database. Here's a quick summary:

Tables processed: ${summary?.tablesProcessed || 0}
Entities discovered: ${summary?.entitiesDiscovered || 0}
Relationships found: ${summary?.relationshipsFound || 0}
Business rules: ${summary?.rulesExtracted || 0}

Quality score: ${Math.round((qualityScore || 0) * 100)}% (${quality})

Feel free to ask me about:
- Details on any extracted entity
- Business rules and calculations
- Anomalies or issues found
- Recommendations for next steps

Or use the quick actions above to get started!`;
}

function formatTime(date) {
  if (!date) return '';
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
