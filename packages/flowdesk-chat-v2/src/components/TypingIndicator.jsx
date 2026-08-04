import React from 'react';
import { useTranslation } from 'react-i18next';
import { useUI } from '../store/chat-store';

/**
 * TypingIndicator (F7) — turns SSE node-progress into a human-readable status.
 *
 * The store's currentNode is fed by the SSE onNode handler (node:start sets it,
 * node:done/turn:done clears it). We map the current node to a friendly phrase;
 * when loading but between nodes, a neutral "Thinking…" is shown.
 */

export default function TypingIndicator() {
  const { t } = useTranslation();
  const { loading, currentNode } = useUI();
  if (!loading) return null;

  // Localized node phrase (missing locales fall back to en via i18next); an
  // unrecognised node — the backend graph may add one — shows "thinking".
  const phrase = (currentNode && t(`node.${currentNode}`, { defaultValue: '' })) || t('thinking');

  return (
    <div className="fdv2-message fdv2-message-assistant fdv2-typing" aria-live="polite">
      <div className="fdv2-avatar" aria-hidden="true">◆</div>
      <div className="fdv2-bubble-col">
        <div className="fdv2-typing-row">
          <span className="fdv2-typing-dots" aria-hidden="true"><i /><i /><i /></span>
          <span className="fdv2-typing-text">{phrase}</span>
        </div>
      </div>
    </div>
  );
}
