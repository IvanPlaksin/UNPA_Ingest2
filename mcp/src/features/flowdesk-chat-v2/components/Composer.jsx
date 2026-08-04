import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useUI, useChatActions } from '../store/chat-store';
import { MicButton } from './VoiceControls.jsx';

const MAX_ROWS = 8;

/**
 * Composer (F6) — message input with send/stop, auto-growing textarea,
 * keyboard shortcuts, and the (disabled) voice input control.
 *
 * Enter = send · Shift+Enter = newline · Cmd/Ctrl+Enter = send.
 * While a turn is in flight, Send is replaced by Stop (aborts the request).
 */
export default function Composer({ userId = 'fdv2-demo-user', showAttachments = true }) {
  const { t } = useTranslation();
  const { loading, composerDisabled, uploading } = useUI();
  const actions = useChatActions();
  const [value, setValue] = useState('');
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
        <MicButton />

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
              <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
            </svg>
          </button>
        )}
      </div>
      <div className="fdv2-composer-hint">{t('composerHint')}</div>
    </div>
  );
}
