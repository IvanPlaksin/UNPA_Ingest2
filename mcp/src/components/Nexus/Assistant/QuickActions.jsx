import React from 'react';

/**
 * Suggested question pills.
 */
const QuickActions = ({ suggestions = [], onSelect, disabled = false }) => {
  if (suggestions.length === 0) return null;

  return (
    <div className="assistant-quick-actions">
      {suggestions.map((question, idx) => (
        <button
          key={idx}
          className="assistant-quick-actions__pill"
          onClick={() => onSelect?.(question)}
          disabled={disabled}
        >
          {question}
        </button>
      ))}
    </div>
  );
};

export default QuickActions;
