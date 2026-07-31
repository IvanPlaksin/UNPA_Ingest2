/**
 * React bindings — public surface.
 *
 * Split from `context.js` so the assistant can use the same hooks without the two
 * files requiring each other in a circle. No JSX and no CSS anywhere in this module:
 * the package ships as plain ESM, so a host adopting it changes nothing about
 * their build.
 *
 * @module @guided-ux/tour/react
 */

import React from 'react';
import {
  TourContext, TourProvider, useTour, useTourOptional, useTourAnchor, THEME, Z, h,
} from './context.js';
import { TourAssistant } from './TourAssistant.js';

const { useEffect, useLayoutEffect, useState } = React;

// ── chrome ────────────────────────────────────────────────────────────────────

/** Track an element's box across scroll, resize and layout changes. */
function useRect(element) {
  const [rect, setRect] = useState(null);

  useLayoutEffect(() => {
    if (!element || typeof element.getBoundingClientRect !== 'function') { setRect(null); return undefined; }
    const read = () => {
      const r = element.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    read();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(read) : null;
    if (ro) ro.observe(element);
    // Capture phase: a scroll inside a pane does not bubble, and the interface this
    // was built for is full of scrolling panes.
    window.addEventListener('scroll', read, true);
    window.addEventListener('resize', read);
    const mo = typeof MutationObserver !== 'undefined'
      ? new MutationObserver(read) : null;
    if (mo && element.ownerDocument) mo.observe(element.ownerDocument.body, { attributes: true, childList: true, subtree: true });
    return () => {
      if (ro) ro.disconnect();
      if (mo) mo.disconnect();
      window.removeEventListener('scroll', read, true);
      window.removeEventListener('resize', read);
    };
  }, [element]);

  return rect;
}

/**
 * The spotlight: four panels around the target rather than one box with a hole.
 *
 * A single overlay with a cut-out has to swallow pointer events to draw the cut-out,
 * which means the highlighted control cannot be CLICKED — and a tour where you may
 * look but not touch is a tour you cannot follow along with. Four rectangles leave the
 * middle genuinely untouched.
 */
function TourSpotlight() {
  const { state, theme } = useTour();
  const element = state && state.anchor && state.anchor.ok ? state.anchor.element : null;
  const rect = useRect(element);

  useEffect(() => {
    if (!element || typeof element.scrollIntoView !== 'function') return;
    element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  }, [element]);

  if (!rect) return null;
  const pad = 6;
  const box = {
    top: Math.max(0, rect.top - pad),
    left: Math.max(0, rect.left - pad),
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
  const panel = (style) => h('div', { style: { position: 'fixed', background: theme.backdrop, zIndex: Z, pointerEvents: 'none', ...style } });

  return h(React.Fragment, null,
    panel({ top: 0, left: 0, right: 0, height: box.top }),
    panel({ top: box.top + box.height, left: 0, right: 0, bottom: 0 }),
    panel({ top: box.top, left: 0, width: box.left, height: box.height }),
    panel({ top: box.top, left: box.left + box.width, right: 0, height: box.height }),
    h('div', {
      style: {
        position: 'fixed', top: box.top, left: box.left, width: box.width, height: box.height,
        border: `2px solid ${theme.ring}`, borderRadius: 8, boxShadow: `0 0 0 3px ${theme.ring}33`,
        zIndex: Z + 1, pointerEvents: 'none', transition: 'all 160ms ease',
      },
    }),
  );
}

const btn = (theme, kind) => ({
  border: `1px solid ${kind === 'primary' ? theme.accent : '#334155'}`,
  background: kind === 'primary' ? theme.accent : 'transparent',
  color: kind === 'primary' ? '#06283d' : theme.panelFg,
  borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: 'pointer', fontWeight: kind === 'primary' ? 600 : 400,
});

/** The panel: what this step says, where you are, and the way out. */
function TourPanel() {
  const t = useTour();
  const { state, theme, scenario } = t;
  if (t.error) {
    return h('div', { style: panelStyle(theme) },
      h('div', { style: { color: theme.warn, fontSize: 13, marginBottom: 8 } }, t.error),
      h('button', { style: btn(theme), onClick: t.dismissError }, 'Close'));
  }
  if (!state || state.status === 'finished' || !state.step) return null;

  const step = state.step;
  const blocked = state.status === 'blocked';
  const title = t.text(step, 'title');
  const total = (scenario && scenario.steps ? scenario.steps.length : state.total) || 0;

  return h('div', { style: panelStyle(theme) },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 } },
      h('span', { style: { fontSize: 11, color: theme.muted, letterSpacing: 0.4 } },
        `STEP ${state.index}${total ? ` OF ${total}` : ''}`),
      h('span', { style: { flex: 1 } }),
      h('button', { style: { ...btn(theme), padding: '2px 8px', fontSize: 12 }, onClick: t.stop, title: 'End the tour' }, '×'),
    ),
    title ? h('div', { style: { fontWeight: 600, marginBottom: 4 } }, title) : null,
    h('div', { style: { fontSize: 13, lineHeight: 1.5, color: theme.panelFg } }, t.text(step)),

    // A skipped or unreachable step is stated, never silently swallowed.
    state.notice ? h('div', {
      style: {
        marginTop: 8, padding: '6px 8px', borderRadius: 6, fontSize: 12,
        background: blocked ? '#7c2d12' : '#1e293b', color: blocked ? '#fed7aa' : theme.muted,
      },
    }, state.notice) : null,

    h('div', { style: { display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' } },
      h('button', { style: btn(theme), onClick: t.back, disabled: state.visited.length < 2 }, 'Back'),
      h('button', { style: btn(theme, 'primary'), onClick: t.next }, blocked ? 'Skip this step' : 'Next'),
      h('span', { style: { flex: 1 } }),
      // Reads `t.narrating` — React state — not the narrator object. Reading the
      // object left this button frozen on its first icon while clicks did nothing
      // visible, which is exactly how a working feature looks broken.
      t.narrator ? h('button', {
        style: { ...btn(theme), padding: '4px 8px' },
        onClick: () => t.setNarrating(!t.narrating),
        title: t.narrating ? 'Mute narration' : 'Narrate this tour',
      }, t.narrating ? '🔊' : '🔇') : null,
      h('button', { style: btn(theme), onClick: t.openAssistant, title: 'Ask about this step' }, '🤖 Ask'),
    ),
  );
}

function panelStyle(theme) {
  return {
    position: 'fixed', right: 24, bottom: 24, width: 340, maxWidth: 'calc(100vw - 48px)',
    background: theme.panelBg, color: theme.panelFg, borderRadius: 12, padding: 14,
    boxShadow: '0 12px 40px rgba(0,0,0,0.45)', zIndex: Z + 2,
    fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
  };
}

export {
  // registration + state
  TourProvider, TourContext, useTour, useTourOptional, useTourAnchor,
  // chrome
  TourSpotlight, TourPanel, TourAssistant,
  // helpers a host may want
  useRect, THEME, Z,
};
