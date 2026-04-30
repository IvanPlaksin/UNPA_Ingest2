import React, { useRef } from 'react';
import { Send } from 'lucide-react';

export default function ChatInput({ value, onChange, onSend, isLoading, placeholder }) {
  const inputRef = useRef(null);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isLoading) onSend();
    }
  };

  return (
    <div className="unpa-chat-input-area">
      <input
        ref={inputRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || 'Type your message...'}
        disabled={isLoading}
        className="unpa-chat-input"
      />
      <button
        onClick={onSend}
        disabled={isLoading || !value.trim()}
        className="unpa-chat-send-btn"
      >
        <Send size={18} />
      </button>
    </div>
  );
}
