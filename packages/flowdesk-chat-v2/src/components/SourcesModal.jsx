import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * SourcesModal (Phase 2 "Show sources") — lists the knowledge-base origins of an
 * assistant answer. Opened from the small book icon in the message-meta row.
 *
 * Phase 1 MVP fields (per PHASE0 F3 — no UN provenance yet): title, collection,
 * relevance (shown as a percentage), optional snippet. The shape is forward-
 * compatible: Phase 10 enrichment adds sourceDocumentSymbol / Admiralty /
 * inForceStatus without touching this contract.
 *
 * Self-contained modal (the feature has no dialog infra): a full-panel overlay
 * scoped inside `.fdv2-root`, closable via the × button, backdrop click, or Esc.
 */
export default function SourcesModal({ open, sources, onClose }) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const list = Array.isArray(sources) ? sources : [];

  return (
    <div className="fdv2-sources-overlay" role="presentation" onClick={onClose}>
      <div
        className="fdv2-sources-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('sources.title')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fdv2-sources-head">
          <h3 className="fdv2-sources-title">{t('sources.title')}</h3>
          <button
            type="button"
            className="fdv2-sources-close"
            aria-label={t('sources.close')}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <ul className="fdv2-sources-list">
          {list.map((s) => (
            <li key={s.id} className="fdv2-source-item">
              <div className="fdv2-source-row">
                <span className="fdv2-source-name">{s.title}</span>
                {typeof s.relevance === 'number' && (
                  <span
                    className="fdv2-source-badge"
                    title={t('sources.relevance')}
                  >
                    {Math.round(s.relevance * 100)}%
                  </span>
                )}
              </div>
              {s.collection && (
                <div className="fdv2-source-collection">
                  {t('sources.collection')}: {s.collection}
                </div>
              )}
              {s.snippet && <p className="fdv2-source-snippet">{s.snippet}</p>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
