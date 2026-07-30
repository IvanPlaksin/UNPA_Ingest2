import React from 'react';
import { useTranslation } from 'react-i18next';

/** Right-arrow glyph for the "Go there" navigation action. */
function ArrowGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

/**
 * NavigateLink (Phase 5 SITE_NAVIGATE) — a "Go there" action rendered on an
 * assistant message that resolved a navigation target. Clicking calls the host
 * `onNavigate({ path, highlight? })`, which wires it to the app router.
 *
 * Renders nothing unless BOTH a navigate target and an onNavigate handler exist —
 * a host that cannot navigate simply shows no dead button.
 */
export default function NavigateLink({ navigate, onNavigate }) {
  const { t } = useTranslation();
  if (!navigate || !navigate.path || typeof onNavigate !== 'function') return null;
  return (
    <button
      type="button"
      className="fdv2-navigate-link"
      onClick={() => onNavigate(navigate)}
      aria-label={t('navigate.goTo', { path: navigate.path })}
    >
      <ArrowGlyph />
      {t('navigate.goThere')}
    </button>
  );
}
