import React, { useEffect, useRef } from 'react';
import { Bot, Loader2 } from 'lucide-react';
import ChatMessage from './ChatMessage';

export default function MessageList({ messages, isLoading, onFormSubmit, onChoiceClick, dialogState }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="unpa-chat-messages">
      {messages.map((msg, i) => (
        <ChatMessage
          key={i}
          message={msg}
          onFormSubmit={onFormSubmit}
          onChoiceClick={onChoiceClick}
          dialogState={dialogState}
          isLoading={isLoading}
        />
      ))}
      {isLoading && (
        <div className="unpa-chat-message unpa-chat-message-bot">
          <div className="unpa-chat-avatar"><Bot size={16} /></div>
          <div className="unpa-chat-message-content unpa-chat-typing">
            <Loader2 size={16} className="unpa-chat-spin" />
            <span>Processing...</span>
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
