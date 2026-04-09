/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI Chat Panel for AOPEG Editor
 * Provides conversational interface for building workflow graphs
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Send,
  Bot,
  User,
  ChevronRight,
  Trash2,
  Download,
  StopCircle,
  RefreshCw,
  MessageSquare,
  Sparkles,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { useGraphBuilderAgent, ChatMessage, ToolCall, AgentGraph } from '../../hooks/useGraphBuilderAgent';
import { ModelSelector } from './ModelSelector';

// ────────────────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────────────────

interface AIChatPanelProps {
  width?: number;
  isOpen?: boolean;
  onToggle?: () => void;
  onGraphUpdate?: (graph: AgentGraph) => void;
  initialGraph?: AgentGraph | null;
}

interface ToolCallChipProps {
  tool: string;
  result: ToolCall['result'];
}

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming: boolean;
}

interface QuickActionsProps {
  onAction: (prompt: string) => void;
  disabled: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// TOOL CALL CHIP
// ────────────────────────────────────────────────────────────────────────────

const ToolCallChip: React.FC<ToolCallChipProps> = ({ tool, result }) => {
  const isSuccess = result?.success !== false;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border ${
        isSuccess
          ? 'text-green-400 bg-green-500/10 border-green-500/30'
          : 'text-red-400 bg-red-500/10 border-red-500/30'
      }`}
    >
      {isSuccess ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {tool}
    </span>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// MESSAGE BUBBLE
// ────────────────────────────────────────────────────────────────────────────

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isStreaming }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="px-3 py-1 text-xs text-[#8b949e] bg-[#21262d] rounded-full italic">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`flex ${isUser ? 'flex-row-reverse' : 'flex-row'} gap-2 max-w-[90%]`}>
        {/* Avatar */}
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
            isUser ? 'bg-blue-600' : 'bg-purple-600'
          }`}
        >
          {isUser ? <User className="w-4 h-4 text-white" /> : <Sparkles className="w-4 h-4 text-white" />}
        </div>

        {/* Message Content */}
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
          {/* Tool Calls */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1">
              {message.toolCalls.map((tc, idx) => (
                <ToolCallChip key={idx} tool={tc.tool} result={tc.result} />
              ))}
            </div>
          )}

          {/* Message Bubble */}
          <div
            className={`px-3 py-2 rounded-lg ${
              isUser
                ? 'bg-blue-600 text-white rounded-tr-none'
                : 'bg-[#21262d] text-[#f0f6fc] border border-[#30363d] rounded-tl-none'
            }`}
          >
            <div className="text-sm prose prose-invert prose-sm max-w-none [&_p]:m-0 [&_p]:mb-1 [&_p:last-child]:mb-0 [&_pre]:bg-black/20 [&_pre]:p-2 [&_pre]:rounded [&_pre]:text-xs [&_code]:font-mono [&_code]:text-xs [&_code]:bg-black/20 [&_code]:px-1 [&_code]:rounded [&_ul]:pl-4 [&_ul]:my-1 [&_ol]:pl-4 [&_ol]:my-1 [&_li]:mb-0.5">
              <ReactMarkdown>{message.content || ''}</ReactMarkdown>
              {isStreaming && message.streaming && (
                <span className="inline-block w-1.5 h-4 bg-blue-500 ml-0.5 animate-pulse" />
              )}
            </div>
          </div>

          {/* Error indicator */}
          {message.error && (
            <span className="flex items-center gap-1 mt-1 px-2 py-0.5 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded">
              <XCircle className="w-3 h-3" />
              Error
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// QUICK ACTIONS
// ────────────────────────────────────────────────────────────────────────────

const QuickActions: React.FC<QuickActionsProps> = ({ onAction, disabled }) => {
  const actions = [
    { label: 'Ingestion pipeline', prompt: 'Create a basic text ingestion pipeline' },
    { label: 'RAG pipeline', prompt: 'Create a RAG pipeline for question answering' },
    { label: 'Validate graph', prompt: 'Validate the current graph' },
    { label: 'Explain flow', prompt: 'Explain how the current graph works' },
  ];

  return (
    <div className="flex flex-wrap gap-1 mb-2">
      {actions.map((action, idx) => (
        <button
          key={idx}
          onClick={() => onAction(action.prompt)}
          disabled={disabled}
          className="px-2 py-1 text-xs text-[#8b949e] bg-[#21262d] border border-[#30363d] rounded
                     hover:bg-[#30363d] hover:text-[#f0f6fc] disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ────────────────────────────────────────────────────────────────────────────

export const AIChatPanel: React.FC<AIChatPanelProps> = ({
  width = 360,
  isOpen = true,
  onToggle,
  onGraphUpdate,
  initialGraph = null,
}) => {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    sessionId,
    messages,
    graph,
    loading,
    streaming,
    error,
    isConnected,
    // Model state
    availableModels,
    currentModelId,
    currentModelInfo,
    modelsLoading,
    // Methods
    startSession,
    endSession,
    fetchAvailableModels,
    setModel,
    sendMessageStream,
    cancelStream,
    exportGraph,
    clearHistory,
    clearError,
  } = useGraphBuilderAgent({
    onGraphUpdate,
    autoStart: false,
  });

  // Fetch available models on mount
  useEffect(() => {
    fetchAvailableModels();
  }, [fetchAvailableModels]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Start session on mount if panel is open
  useEffect(() => {
    if (isOpen && !sessionId) {
      startSession(initialGraph);
    }
  }, [isOpen, sessionId, startSession, initialGraph]);

  // Handle send message
  const handleSend = async () => {
    if (!inputValue.trim() || loading || streaming) return;

    const message = inputValue;
    setInputValue('');

    await sendMessageStream(message);
  };

  // Handle quick action
  const handleQuickAction = (prompt: string) => {
    setInputValue(prompt);
    inputRef.current?.focus();
  };

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle export
  const handleExport = async () => {
    try {
      const graphData = await exportGraph();
      const blob = new Blob([JSON.stringify(graphData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aopeg-graph-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  // Handle restart
  const handleRestart = async () => {
    await endSession();
    await startSession();
  };

  // Collapsed state
  if (!isOpen) {
    return (
      <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10">
        <button
          onClick={onToggle}
          className="flex items-center gap-1 px-2 py-3 bg-purple-600 text-white rounded-l-lg
                     hover:bg-purple-700 transition-colors shadow-lg"
          title="Open AI Assistant"
        >
          <MessageSquare className="w-5 h-5" />
          {isConnected && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full" />
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full bg-[#161b22] border-l border-[#30363d]"
      style={{ width }}
    >
      {/* Header */}
      <div className="flex flex-col border-b border-[#30363d] bg-[#0d1117]">
        {/* Title Row */}
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-semibold text-[#f0f6fc]">AI Graph Builder</span>
            {isConnected && (
              <span className="w-2 h-2 bg-green-500 rounded-full" />
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleExport}
              disabled={!graph}
              className="p-1.5 text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d] rounded
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Export Graph"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={clearHistory}
              disabled={loading}
              className="p-1.5 text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d] rounded
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Clear History"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleRestart}
              disabled={loading}
              className="p-1.5 text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d] rounded
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Restart Session"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onToggle}
              className="p-1.5 text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d] rounded
                         transition-colors"
              title="Close Panel"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Model Selector Row */}
        <div className="px-3 pb-2">
          <ModelSelector
            models={availableModels}
            currentModelId={currentModelId}
            currentModelInfo={currentModelInfo}
            onModelSelect={setModel}
            loading={modelsLoading}
            disabled={loading || streaming}
            compact
          />
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-3">
        {messages.map((msg, idx) => (
          <MessageBubble key={msg.id || idx} message={msg} isStreaming={streaming} />
        ))}

        {/* Loading indicator */}
        {loading && !streaming && (
          <div className="flex items-center gap-2 ml-9 text-[#8b949e]">
            <div className="w-4 h-4 border-2 border-[#30363d] border-t-blue-500 rounded-full animate-spin" />
            <span className="text-xs">Processing...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      {messages.length <= 2 && (
        <div className="px-3 pb-2">
          <QuickActions onAction={handleQuickAction} disabled={loading || streaming} />
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="mx-3 mb-2 p-2 flex items-center justify-between bg-red-500/10 border border-red-500/30 rounded">
          <span className="text-xs text-red-400">{error}</span>
          <button onClick={clearError} className="p-1 hover:bg-red-500/20 rounded">
            <XCircle className="w-3 h-3 text-red-400" />
          </button>
        </div>
      )}

      {/* Input Area */}
      <div className="p-3 border-t border-[#30363d] bg-[#0d1117]">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!isConnected || loading}
            placeholder="Describe what you want to build..."
            rows={1}
            className="flex-1 px-3 py-2 text-sm text-[#f0f6fc] bg-[#21262d] border border-[#30363d] rounded-lg
                       placeholder-[#6e7681] resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50
                       focus:border-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ maxHeight: '80px' }}
          />

          {streaming ? (
            <button
              onClick={cancelStream}
              className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              title="Stop"
            >
              <StopCircle className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || loading || !isConnected}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700
                         disabled:bg-[#21262d] disabled:text-[#6e7681] disabled:cursor-not-allowed
                         transition-colors"
              title="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIChatPanel;
