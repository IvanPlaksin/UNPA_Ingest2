import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useUI, useChatActions } from '../store/chat-store';
import { LiveChatButton } from './VoiceControls.jsx';
import AISettingsDialog from './AISettingsDialog.jsx';

const MAX_ROWS = 8;

/**
 * Composer (F6) — message input with send/stop, auto-growing textarea,
 * keyboard shortcuts, and a right-hand toolbar (language switcher + Live Chat).
 *
 * Enter = send · Shift+Enter = newline · Cmd/Ctrl+Enter = send.
 * While a turn is in flight, Send is replaced by Stop (aborts the request).
 */
export default function Composer({ userId, showVoiceControls = true, showSettings = true, onVoiceActiveChange, showAttachments = true,
}) {
  const { t } = useTranslation();
  const { loading, composerDisabled, uploading } = useUI();
  const actions = useChatActions();
  const [value, setValue] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const textareaRef = useRef(null);
  const abortRef = useRef(null);
  const fileInputRef = useRef(null);

  /**
   * DOC-3 — hand the chosen file to the store and let go of it.
   *
   * The input is cleared FIRST. A file input fires `change` only when the value
   * changes, so leaving the previous selection in place makes re-choosing the
   * same file silent — the commonest way a user retries after a failed upload.
   */
  const onFileChosen = useCallback(async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    await actions.uploadAttachment(file);
  }, [actions]);

  // Auto-grow up to MAX_ROWS.
  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineH = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const maxH = lineH * MAX_ROWS;
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
    el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
  }, []);

  useEffect(() => { resize(); }, [value, resize]);
  useEffect(() => { if (!loading && !composerDisabled) textareaRef.current?.focus(); }, [loading, composerDisabled]);

  const canSend = value.trim().length > 0 && !loading && !composerDisabled;

  const doSend = useCallback(async () => {
    const text = value.trim();
    if (!text || loading || composerDisabled) return;
    setValue('');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await actions.sendMessage(text, userId, controller.signal);
    } finally {
      abortRef.current = null;
      textareaRef.current?.focus();
    }
  }, [value, loading, composerDisabled, actions, userId]);

  const doStop = useCallback(() => { abortRef.current?.abort(); }, []);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // Enter or Cmd/Ctrl+Enter → send
      e.preventDefault();
      doSend();
    }
  };

  return (
    <div className="fdv2-composer-wrap">
      <div className={`fdv2-composer ${composerDisabled ? 'is-disabled' : ''}`}>
        {showAttachments && (
        <>
        {/* DOC-3 — attach a document.
            The input is reset before the upload starts, not after: without that,
            choosing the SAME file twice fires no change event and the second
            attempt does nothing, which reads as the button being broken. */}
        <input
          ref={fileInputRef}
          type="file"
          className="fdv2-file-input"
          onChange={onFileChosen}
          accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx"
        />
        <button
          type="button"
          className="fdv2-icon-btn fdv2-attach"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || composerDisabled}
          title={t('upload.attach')}
          aria-label={t('upload.attach')}
          aria-busy={uploading || undefined}
        >
          {uploading ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="fdv2-spin" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-6.2-8.6" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21.4 11.05 12.25 20.2a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.67 3.67 0 1 1 5.18 5.18l-9.2 9.2a1.83 1.83 0 1 1-2.59-2.6l8.49-8.48" />
            </svg>
          )}
        </button>
        </>
        )}

        <textarea
          ref={textareaRef}
          className="fdv2-textarea"
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          // The opening message arrives when the user turns TOWARDS the chat, not
          // when the page loads. Seeded on mount it put a conversation on screen
          // before anyone had asked for one, which collapsed the host's own empty
          // state the moment the page rendered. `seedGreeting` is idempotent — it
          // returns immediately once the thread has anything in it — so this can fire
          // on every focus without a guard of its own.
          onFocus={() => actions.seedGreeting()}
          placeholder={composerDisabled ? t('composerDisabled') : t('composerPlaceholder')}
          disabled={composerDisabled}
          aria-label={t('composerPlaceholder')}
        />

        {loading ? (
          <button type="button" className="fdv2-icon-btn fdv2-stop" onClick={doStop} title={t('stop')} aria-label={t('stop')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
          </button>
        ) : (
          <button type="button" className="fdv2-icon-btn fdv2-send" onClick={doSend} disabled={!canSend} title={t('send')} aria-label={t('send')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
              <path d="m21.854 2.147-10.94 10.939" />
            </svg>
          </button>
        )}

        {(showSettings || showVoiceControls) && (
          <div className="fdv2-composer-tools">
            {showVoiceControls && <LiveChatButton userId={userId} onActiveChange={onVoiceActiveChange} />}
            {/* CS-1: settings gear AFTER Live Chat — opens the AI Settings dialog
                (language + voice); the language switcher moved in there. */}
            {showSettings && (
              <button
                type="button"
                className="fdv2-icon-btn fdv2-settings-btn"
                onClick={() => setSettingsOpen(true)}
                title={t('settings.open', 'AI Settings')}
                aria-label={t('settings.open', 'AI Settings')}
                aria-haspopup="dialog"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
      <div className="fdv2-composer-hint">{t('composerHint')}</div>
      <AISettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
