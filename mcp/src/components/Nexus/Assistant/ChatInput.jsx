import React, { useState, useRef, useEffect } from 'react';

/**
 * Chat input with send button.
 */
const ChatInput = ({ onSend, disabled = false, placeholder = 'Ask about the graph...' }) => {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [disabled]);

  const handleSubmit = () => {
    if (!value.trim() || disabled) return;
    onSend?.(value.trim());
    setValue('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="assistant-chat-input">
      <input
        ref={inputRef}
        type="text"
        className="assistant-chat-input__field"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
      />
      <button
        className="assistant-chat-input__send"
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        title="Send (Enter)"
      >
        ⏎
      </button>
    </div>
  );
};

export default ChatInput;
