import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { dispatchVoiceExplain } from './ExplainTrigger.jsx';

/**
 * useKBAnchors (Phase 8, V2) — auto-inject an always-visible "?" trigger into
 * every `[data-kb-anchor]` element inside `containerRef` (or the document). Lets
 * an existing app light up KB anchors without editing each component: just add
 * `data-kb-anchor="<id>"` (+ optional `data-kb-title`) to the element.
 *
 * Clicking a "?" activates the VOICE assistant for that anchor (dispatches
 * `altioraVoiceExplain`; the voice launcher speaks the explanation). A
 * MutationObserver re-scans on DOM changes (SPA route transitions) and injection
 * is idempotent. Triggers are removed on unmount.
 */
export function useKBAnchors(containerRef) {
  const { t } = useTranslation();

  useEffect(() => {
    const root = (containerRef && containerRef.current) || document.body;

    const inject = (el) => {
      const anchorId = el.getAttribute('data-kb-anchor');
      if (!anchorId) return;
      if (el.querySelector(':scope > .fdv2-explain-trigger')) return; // idempotent
      const title = el.getAttribute('data-kb-title') || anchorId;
      if (window.getComputedStyle(el).position === 'static') el.style.position = 'relative';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fdv2-explain-trigger';
      btn.textContent = '?';
      btn.setAttribute('aria-label', t('explain.trigger', { title }));
      btn.title = t('explain.triggerTooltip');
      btn.addEventListener('click', (e) => { e.stopPropagation(); dispatchVoiceExplain(anchorId, title); });
      el.appendChild(btn);
    };

    const scan = () => {
      if (root.matches && root.matches('[data-kb-anchor]')) inject(root);
      root.querySelectorAll('[data-kb-anchor]').forEach(inject);
    };

    scan();
    const obs = new MutationObserver(scan);
    obs.observe(root, { childList: true, subtree: true });

    return () => {
      obs.disconnect();
      root.querySelectorAll('.fdv2-explain-trigger').forEach((b) => b.remove());
    };
  }, [containerRef, t]);
}

export default useKBAnchors;
