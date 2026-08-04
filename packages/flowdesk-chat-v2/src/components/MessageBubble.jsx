import React from 'react';
import { useTranslation } from 'react-i18next';
import MarkdownText from '../utils/markdown.jsx';
import ChoiceButtons from './ChoiceButtons.jsx';
import ControlRenderer from './ControlRenderer.jsx';
import CardList from './CardList.jsx';
import ReviewTable from './ReviewTable.jsx';
import SourcesModal from './SourcesModal.jsx';
import NavigateLink from './NavigateLink.jsx';

/** Small book/sources glyph for the bottom-right "Show sources" affordance. */
function SourcesGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5a2 2 0 0 1 2-2h11a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2z" />
      <path d="M4 19a2 2 0 0 1 2-2h12" />
    </svg>
  );
}

/** System-message icon for a failed voice turn — the same mic glyph as the composer's
 *  idle Live Chat button, so the error visually ties back to what the user clicked. */
function MicErrorGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19v3" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <rect x="9" y="2" width="6" height="13" rx="3" />
    </svg>
  );
}

/** System-message icon for a failed text turn — a speech bubble, for the written chat. */
function ChatErrorGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

const SYSTEM_ICON_BY_KIND = { 'voice-error': MicErrorGlyph, 'chat-error': ChatErrorGlyph };

function formatTime(iso, t, locale) {
  if (!iso) return { label: '', full: '' };
  const then = new Date(iso);
  const full = then.toLocaleString(locale);
  const diff = Date.now() - then.getTime();
  if (diff < 60000) return { label: t('time.justNow'), full };
  if (diff < 3600000) return { label: t('time.minutesAgo', { count: Math.floor(diff / 60000) }), full };
  return { label: then.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }), full };
}

/**
 * MessageBubble (F5) — renders one message by role.
 *   user      → right, accent
 *   assistant → left, neutral, markdown + optional executionLog footer
 *   system    → centered, muted
 */
export default function MessageBubble({ message, isLast, onNavigate, userAvatar, assistantAvatar }) {
  const { t, i18n } = useTranslation();
  const { role, content, timestamp, metadata } = message;
  const time = formatTime(timestamp, t, i18n.language);
  // Prefer the controls[] contract (I-3); fall back to the legacy resolveChoices
  // ChoiceButtons only when no controls were emitted (deprecation window).
  const showControls = isLast && role === 'assistant' && Array.isArray(metadata?.controls) && metadata.controls.length > 0;
  // Cards are NOT gated on `isLast`: a list of requests stays readable after the
  // conversation moves on, where a control that is no longer answerable would be a
  // button that does nothing.
  const cards = role === 'assistant' && Array.isArray(metadata?.cards) ? metadata.cards : null;
  const showChoices = !showControls && isLast && role === 'assistant' && metadata?.responseType === 'confirm_or_choose' && metadata?.resolveChoices;

  if (role === 'system') {
    const SystemIcon = SYSTEM_ICON_BY_KIND[metadata?.kind];
    // Error system lines (voice/chat failures) get the same left-hand avatar treatment
    // as a normal assistant turn — the host's assistantAvatar if given (e.g. the Help
    // window's own Sparkles glyph, so the error visually reads as "from the assistant"),
    // else the built-in mic/chat glyph. Plain system lines (e.g. "Request stopped.")
    // have no kind and keep the old centered, avatar-less look.
    const hasAvatar = Boolean(metadata?.kind);
    return (
      <div className={`fdv2-message fdv2-message-system${hasAvatar ? ' fdv2-message-system--with-avatar' : ''}`}>
        {hasAvatar && (
          <div className="fdv2-avatar fdv2-avatar-assistant" aria-hidden="true">
            {assistantAvatar || (SystemIcon && <SystemIcon />)}
          </div>
        )}
        <span className={`fdv2-system-pill${metadata?.debugDetail ? ' fdv2-system-pill--debug' : ''}`}>
          <span className="fdv2-system-text-col">
            <span className="fdv2-system-text">{content}</span>
            {metadata?.debugDetail && (
              <span className="fdv2-system-debug">[dev] {metadata.debugDetail}</span>
            )}
          </span>
        </span>
      </div>
    );
  }

  const isUser = role === 'user';
  const log = metadata?.executionLog;
  const sources = Array.isArray(metadata?.sources) ? metadata.sources : [];
  const [sourcesOpen, setSourcesOpen] = React.useState(false);

  return (
    <div className={`fdv2-message ${isUser ? 'fdv2-message-user' : 'fdv2-message-assistant'}`}>
      {!isUser && (
        <div className={`fdv2-avatar${assistantAvatar ? ' fdv2-avatar-assistant' : ''}`} aria-hidden="true">
          {assistantAvatar || '◆'}
        </div>
      )}
      <div className="fdv2-bubble-col">
        {!(isUser && userAvatar) && <span className="fdv2-sender">{isUser ? t('senderMe') : t('agentName')}</span>}
        {!isUser && metadata?.preamble && <p className="fdv2-preamble">{metadata.preamble}</p>}
        <div className="fdv2-bubble">
          {isUser ? <span className="fdv2-user-text">{content}</span> : <MarkdownText>{content}</MarkdownText>}
        </div>
        {!isUser && metadata?.review && <ReviewTable review={metadata.review} interactive={isLast} />}
        {cards && cards.length > 0 && <CardList cards={cards} />}
        {showControls && <ControlRenderer controls={metadata.controls} />}
        {showChoices && <ChoiceButtons resolveChoices={metadata.resolveChoices} />}
        {!isUser && metadata?.navigate && <NavigateLink navigate={metadata.navigate} onNavigate={onNavigate} />}
        <div className="fdv2-message-meta">
          <time dateTime={timestamp} title={time.full}>{time.label}</time>
          {metadata?.srNumber && <span className="fdv2-sr-chip">{metadata.srNumber}</span>}
          {Array.isArray(log) && log.length > 0 && (
            <details className="fdv2-exec-log">
              <summary>{t('meta.details', { count: log.length })}</summary>
              <ol>
                {log.map((step, i) => (
                  <li key={i} className={step.status === 'error' ? 'err' : ''}>{step.node}</li>
                ))}
              </ol>
            </details>
          )}
          {!isUser && sources.length > 0 && (
            <button
              type="button"
              className="fdv2-sources-btn"
              title={t('sources.view')}
              aria-label={t('sources.view')}
              onClick={() => setSourcesOpen(true)}
            >
              <SourcesGlyph />
              <span className="fdv2-sources-count">{sources.length}</span>
            </button>
          )}
        </div>
      </div>
      {isUser && userAvatar && <div className="fdv2-avatar fdv2-avatar-user" aria-hidden="true">{userAvatar}</div>}
      {!isUser && sources.length > 0 && (
        <SourcesModal open={sourcesOpen} sources={sources} onClose={() => setSourcesOpen(false)} />
      )}
    </div>
  );
}
