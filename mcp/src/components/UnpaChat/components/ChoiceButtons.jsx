import React from 'react';
import { CheckCircle2 } from 'lucide-react';

export default function ChoiceButtons({ choices, onChoiceClick, isLoading, label, prompt }) {
  return (
    <div style={{ marginTop: 8 }}>
      {label && (
        <div className="unpa-chat-choice-label">{label}</div>
      )}
      {prompt && prompt !== label && (
        <div className="unpa-chat-choice-prompt">{prompt}</div>
      )}
      <div className="unpa-chat-choices">
        {choices.map((choice, ci) => (
          <button
            key={ci}
            className={`unpa-chat-choice-btn${choice.selected ? ' selected' : ''}${choice.disabled ? ' disabled' : ''}`}
            onClick={() => !choice.disabled && onChoiceClick && onChoiceClick(choice)}
            disabled={choice.disabled || isLoading}
          >
            {choice.selected && <CheckCircle2 size={13} />}
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  );
}
