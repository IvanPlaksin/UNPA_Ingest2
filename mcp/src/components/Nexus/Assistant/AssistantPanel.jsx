import React, { useRef, useEffect, useCallback } from 'react';
import { useNexusStore } from '../../../stores/nexusStore';
import { useAssistant } from './useAssistant';
import ContextBar from './ContextBar';
import ChatMessage from './ChatMessage';
import QuickActions from './QuickActions';
import ChatInput from './ChatInput';
import './AssistantPanel.css';

/**
 * AI Assistant Panel - floating chat panel for graph analysis help.
 */
const AssistantPanel = ({ nodes = [], edges = [], onAction }) => {
  const isOpen = useNexusStore(state => state.aiAssistant.isOpen);
  const toggleAIAssistant = useNexusStore(state => state.toggleAIAssistant);

  const {
    messages,
    isLoading,
    sendMessage,
    clearChat,
    suggestions,
    graphStats,
    selectedNodes,
  } = useAssistant({ nodes, edges });

  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  const handleAction = useCallback((action) => {
    onAction?.(action.action, action);
  }, [onAction]);

  const handleSuggestionClick = useCallback((question) => {
    sendMessage(question);
  }, [sendMessage]);

  if (!isOpen) {
    return (
      <button
        className="assistant-fab"
        onClick={toggleAIAssistant}
        title="Open AI Assistant"
      >
        🤖
      </button>
    );
  }

  return (
    <div className="assistant-panel">
      <div className="assistant-panel__header">
        <div className="assistant-panel__title">
          <span className="assistant-panel__title-icon">🤖</span>
          <span className="assistant-panel__title-text">Graph Assistant</span>
        </div>
        <div className="assistant-panel__header-actions">
          <button
            className="assistant-panel__header-btn"
            onClick={clearChat}
            title="Clear chat"
          >
            🗑
          </button>
          <button
            className="assistant-panel__header-btn"
            onClick={toggleAIAssistant}
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      <ContextBar
        selectedNodes={selectedNodes}
        graphStats={graphStats}
      />

      <div className="assistant-panel__messages">
        {messages.map(msg => (
          <ChatMessage
            key={msg.id}
            message={msg}
            onAction={handleAction}
          />
        ))}

        {isLoading && (
          <div className="assistant-panel__typing">
            <div className="assistant-panel__typing-dots">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <QuickActions
        suggestions={suggestions}
        onSelect={handleSuggestionClick}
        disabled={isLoading}
      />

      <ChatInput
        onSend={sendMessage}
        disabled={isLoading}
      />
    </div>
  );
};

export default AssistantPanel;
