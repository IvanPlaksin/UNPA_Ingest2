import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * ExplainTrigger (Phase 8, V2) — the always-visible "?" badge on a KB-anchored UI
 * element. Clicking activates the VOICE assistant to explain this element: it
 * dispatches an `altioraVoiceExplain` window event that the voice launcher listens
 * for (starts voice → speaks the anchor's explanation → 15s idle window). Decoupled
 * from the chat package — no dependency on the floating text chat. `useKBAnchors`
 * is the auto-injection alternative for retrofitting existing markup.
 */
export function dispatchVoiceExplain(anchorId, anchorTitle) {
  window.dispatchEvent(new CustomEvent('altioraVoiceExplain', { detail: { anchorId, anchorTitle } }));
}

export default function ExplainTrigger({ anchorId, anchorTitle, className = '' }) {
  const { t } = useTranslation();
  if (!anchorId) return null;
  const title = anchorTitle || anchorId;
  return (
    <button
      type="button"
      className={`fdv2-explain-trigger${className ? ` ${className}` : ''}`}
      onClick={(e) => { e.stopPropagation(); dispatchVoiceExplain(anchorId, title); }}
      aria-label={t('explain.trigger', { title })}
      title={t('explain.triggerTooltip')}
    >
      ?
    </button>
  );
}
