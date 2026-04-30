import React from 'react';
import { User, Bot } from 'lucide-react';

function renderText(text) {
  return text.split('\n').map((line, i) => (
    <p key={i} style={{ margin: '2px 0' }}>{line.replace(/\*\*(.*?)\*\*/g, (_, t) => t)}</p>
  ));
}

export default function ChatMessage({ message, onFormSubmit, onChoiceClick, dialogState, isLoading }) {
  return (
    <div className={`unpa-chat-message unpa-chat-message-${message.role}${message.isError ? ' unpa-chat-message-error' : ''}`}>
      <div className="unpa-chat-avatar">
        {message.role === 'user' ? <User size={16} /> : <Bot size={16} />}
      </div>
      <div className="unpa-chat-message-content">
        {renderText(message.text)}
        {message.waitingNode && !message.formSubmitted && onFormSubmit && (
          <div className="unpa-chat-form-slot">
            {/* FormWidget rendered by parent — see UnpaChat.jsx */}
            {onFormSubmit(message)}
          </div>
        )}
        {!message.waitingNode && message.choices && message.choices.length > 0 && (
          <div className="unpa-chat-choices">
            {message.choices.map((choice, ci) => (
              <button
                key={ci}
                className={`unpa-chat-choice-btn${choice.selected ? ' selected' : ''}${choice.disabled ? ' disabled' : ''}`}
                onClick={() => !choice.disabled && onChoiceClick && onChoiceClick(choice, message)}
                disabled={choice.disabled || isLoading}
              >
                {choice.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
