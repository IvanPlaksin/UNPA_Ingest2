import React from 'react';

/**
 * Formats message content with basic markdown-like styling.
 */
const formatContent = (text) => {
  if (!text) return null;

  const lines = text.split('\n');
  const elements = [];

  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) elements.push(<br key={`br-${lineIndex}`} />);

    // Process inline formatting
    const parts = line.split(/(\*\*[^*]+\*\*)/g);

    parts.forEach((part, partIndex) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        elements.push(
          <strong key={`${lineIndex}-${partIndex}`}>
            {part.slice(2, -2)}
          </strong>
        );
      } else if (part.startsWith('- ')) {
        elements.push(
          <span key={`${lineIndex}-${partIndex}`} className="chat-message__list-item">
            {part}
          </span>
        );
      } else {
        elements.push(part);
      }
    });
  });

  return elements;
};

/**
 * Chat message bubble with formatting and action buttons.
 */
const ChatMessage = ({ message, onAction }) => {
  const isUser = message.role === 'user';

  const timeStr = (() => {
    try {
      const d = new Date(message.timestamp);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  })();

  return (
    <div className={`chat-message ${isUser ? 'chat-message--user' : 'chat-message--assistant'} ${message.isError ? 'chat-message--error' : ''}`}>
      {!isUser && (
        <div className="chat-message__avatar">
          {message.isError ? '⚠' : '🤖'}
        </div>
      )}

      <div className="chat-message__bubble">
        <div className="chat-message__content">
          {formatContent(message.content)}
        </div>

        {message.actions?.length > 0 && (
          <div className="chat-message__actions">
            {message.actions.map((action, idx) => (
              <button
                key={idx}
                className="chat-message__action-btn"
                onClick={() => onAction?.(action)}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}

        <div className="chat-message__time">{timeStr}</div>
      </div>
    </div>
  );
};

export default ChatMessage;
