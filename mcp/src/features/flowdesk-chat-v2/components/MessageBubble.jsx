import React from 'react';
import { useTranslation } from 'react-i18next';
import MarkdownText from '../utils/markdown.jsx';
import ChoiceButtons from './ChoiceButtons.jsx';
import ControlRenderer from './ControlRenderer.jsx';

function formatTime(iso) {
  if (!iso) return { label: '', full: '' };
  const then = new Date(iso);
  const full = then.toLocaleString();
  const diff = Date.now() - then.getTime();
  if (diff < 60000) return { label: 'только что', full };
  if (diff < 3600000) return { label: `${Math.floor(diff / 60000)} мин назад`, full };
  return { label: then.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), full };
}

/**
 * MessageBubble (F5) — renders one message by role.
 *   user      → right, accent
 *   assistant → left, neutral, markdown + optional executionLog footer
 *   system    → centered, muted
 */
export default function MessageBubble({ message, isLast }) {
  const { t } = useTranslation();
  const { role, content, timestamp, metadata } = message;
  const time = formatTime(timestamp);
  // Prefer the controls[] contract (I-3); fall back to the legacy resolveChoices
  // ChoiceButtons only when no controls were emitted (deprecation window).
  const showControls = isLast && role === 'assistant' && Array.isArray(metadata?.controls) && metadata.controls.length > 0;
  const showChoices = !showControls && isLast && role === 'assistant' && metadata?.responseType === 'confirm_or_choose' && metadata?.resolveChoices;

  if (role === 'system') {
    return (
      <div className="fdv2-message fdv2-message-system">
        <span className="fdv2-system-text">{content}</span>
      </div>
    );
  }

  const isUser = role === 'user';
  const log = metadata?.executionLog;

  return (
    <div className={`fdv2-message ${isUser ? 'fdv2-message-user' : 'fdv2-message-assistant'}`}>
      {!isUser && <div className="fdv2-avatar" aria-hidden="true">◆</div>}
      <div className="fdv2-bubble-col">
        <span className="fdv2-sender">{isUser ? t('senderMe') : t('agentName')}</span>
        {!isUser && metadata?.preamble && <p className="fdv2-preamble">{metadata.preamble}</p>}
        <div className="fdv2-bubble">
          {isUser ? <span className="fdv2-user-text">{content}</span> : <MarkdownText>{content}</MarkdownText>}
        </div>
        {showControls && <ControlRenderer controls={metadata.controls} />}
        {showChoices && <ChoiceButtons resolveChoices={metadata.resolveChoices} />}
        <div className="fdv2-message-meta">
          <time dateTime={timestamp} title={time.full}>{time.label}</time>
          {metadata?.srNumber && <span className="fdv2-sr-chip">{metadata.srNumber}</span>}
          {Array.isArray(log) && log.length > 0 && (
            <details className="fdv2-exec-log">
              <summary>детали ({log.length})</summary>
              <ol>
                {log.map((step, i) => (
                  <li key={i} className={step.status === 'error' ? 'err' : ''}>{step.node}</li>
                ))}
              </ol>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
