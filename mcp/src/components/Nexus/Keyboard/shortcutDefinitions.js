/**
 * Keyboard shortcut definitions for NEXUS
 */

export const SHORTCUT_CATEGORIES = {
  GLOBAL: 'global',
  CANVAS: 'canvas',
  GUIDED: 'guided',
};

export const SHORTCUTS = [
  // ═══════════════════════════════════════════════════════════════════════════
  // GLOBAL (always active)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'help',
    key: '?',
    shift: true,
    description: 'Show keyboard shortcuts',
    category: SHORTCUT_CATEGORIES.GLOBAL,
    action: 'toggleCheatsheet',
  },
  {
    id: 'escape',
    key: 'Escape',
    description: 'Close panel / Clear selection',
    category: SHORTCUT_CATEGORIES.GLOBAL,
    action: 'escape',
  },
  {
    id: 'search',
    key: 'f',
    ctrl: true,
    description: 'Focus search',
    category: SHORTCUT_CATEGORIES.GLOBAL,
    action: 'focusSearch',
    preventDefault: true,
  },
  {
    id: 'guidedMode',
    key: 'g',
    ctrl: true,
    description: 'Switch to Guided mode',
    category: SHORTCUT_CATEGORIES.GLOBAL,
    action: 'setMode',
    payload: 'guided',
    preventDefault: true,
  },
  {
    id: 'exploreMode',
    key: 'e',
    ctrl: true,
    description: 'Switch to Explore mode',
    category: SHORTCUT_CATEGORIES.GLOBAL,
    action: 'setMode',
    payload: 'explore',
    preventDefault: true,
  },
  {
    id: 'assistant',
    key: 'a',
    ctrl: true,
    shift: true,
    description: 'Toggle AI Assistant',
    category: SHORTCUT_CATEGORIES.GLOBAL,
    action: 'toggleAssistant',
    preventDefault: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CANVAS (when nodes selected)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'highlight',
    key: 'h',
    description: 'Highlight selected',
    category: SHORTCUT_CATEGORIES.CANVAS,
    action: 'highlightSelected',
    requiresSelection: true,
  },
  {
    id: 'inspector',
    key: 'i',
    description: 'Open inspector',
    category: SHORTCUT_CATEGORIES.CANVAS,
    action: 'openInspector',
    requiresSelection: true,
  },
  {
    id: 'paths',
    key: 'p',
    description: 'Find paths from selected',
    category: SHORTCUT_CATEGORIES.CANVAS,
    action: 'openPathFinder',
    requiresSelection: true,
  },
  {
    id: 'similar',
    key: 's',
    description: 'Find similar nodes',
    category: SHORTCUT_CATEGORIES.CANVAS,
    action: 'openSimilarity',
    requiresSelection: true,
  },
  {
    id: 'predict',
    key: 'l',
    description: 'Predict links',
    category: SHORTCUT_CATEGORIES.CANVAS,
    action: 'openPredictions',
    requiresSelection: true,
  },
  {
    id: 'delete',
    key: 'Delete',
    description: 'Delete selected',
    category: SHORTCUT_CATEGORIES.CANVAS,
    action: 'deleteSelected',
    requiresSelection: true,
    requiresConfirm: true,
  },
  {
    id: 'deleteAlt',
    key: 'Backspace',
    description: 'Delete selected',
    category: SHORTCUT_CATEGORIES.CANVAS,
    action: 'deleteSelected',
    requiresSelection: true,
    requiresConfirm: true,
    hidden: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GUIDED MODE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'nextPhase',
    key: 'Enter',
    description: 'Proceed to next phase',
    category: SHORTCUT_CATEGORIES.GUIDED,
    action: 'nextPhase',
    mode: 'guided',
  },
  {
    id: 'phase1',
    key: '1',
    description: 'Jump to Understand',
    category: SHORTCUT_CATEGORIES.GUIDED,
    action: 'setPhase',
    payload: 'understand',
    mode: 'guided',
  },
  {
    id: 'phase2',
    key: '2',
    description: 'Jump to Discover',
    category: SHORTCUT_CATEGORIES.GUIDED,
    action: 'setPhase',
    payload: 'discover',
    mode: 'guided',
  },
  {
    id: 'phase3',
    key: '3',
    description: 'Jump to Evaluate',
    category: SHORTCUT_CATEGORIES.GUIDED,
    action: 'setPhase',
    payload: 'evaluate',
    mode: 'guided',
  },
  {
    id: 'phase4',
    key: '4',
    description: 'Jump to Act',
    category: SHORTCUT_CATEGORIES.GUIDED,
    action: 'setPhase',
    payload: 'act',
    mode: 'guided',
  },
  {
    id: 'approveAll',
    key: 'a',
    description: 'Approve all clusters',
    category: SHORTCUT_CATEGORIES.GUIDED,
    action: 'approveAll',
    mode: 'guided',
    phase: 'evaluate',
  },
];

/**
 * Get display key for shortcut
 */
export const getDisplayKey = (shortcut) => {
  const parts = [];
  const isMac = typeof navigator !== 'undefined' &&
    navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  if (shortcut.ctrl) parts.push(isMac ? '\u2318' : 'Ctrl');
  if (shortcut.alt) parts.push(isMac ? '\u2325' : 'Alt');
  if (shortcut.shift) parts.push('\u21E7');

  let key = shortcut.key;
  if (key === ' ') key = 'Space';
  if (key === 'Escape') key = 'Esc';
  if (key === 'Delete') key = 'Del';
  if (key === 'Backspace') key = '\u232B';
  if (key.length === 1) key = key.toUpperCase();

  parts.push(key);

  return parts.join(isMac ? '' : '+');
};

/**
 * Check if shortcut matches event
 */
export const matchesEvent = (shortcut, event) => {
  if (shortcut.ctrl && !event.ctrlKey && !event.metaKey) return false;
  if (!shortcut.ctrl && (event.ctrlKey || event.metaKey)) return false;
  if (shortcut.alt && !event.altKey) return false;
  if (shortcut.shift && !event.shiftKey) return false;

  const eventKey = event.key.toLowerCase();
  const shortcutKey = shortcut.key.toLowerCase();

  return eventKey === shortcutKey;
};

/**
 * Get shortcuts by category (visible ones only)
 */
export const getShortcutsByCategory = (category) => {
  return SHORTCUTS.filter(s => s.category === category && !s.hidden);
};
