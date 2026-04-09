import { useEffect, useCallback, useRef } from 'react';
import { SHORTCUTS, matchesEvent } from '../components/Nexus/Keyboard/shortcutDefinitions';

/**
 * Hook for handling NEXUS keyboard shortcuts.
 *
 * @param {Object} handlers - Map of action name → handler function
 * @param {Object} options  - { enabled, mode, phase, hasSelection }
 */
export const useKeyboardShortcuts = (handlers, options = {}) => {
  const {
    enabled = true,
    mode = null,
    phase = null,
    hasSelection = false,
  } = options;

  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const handleKeyDown = useCallback((event) => {
    if (!enabled) return;

    // Skip if typing in an input / textarea / contentEditable
    const tag = event.target.tagName;
    const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || event.target.isContentEditable;

    // Allow Escape even in inputs
    if (isInput && event.key !== 'Escape') return;

    for (const shortcut of SHORTCUTS) {
      if (!matchesEvent(shortcut, event)) continue;

      // Check mode constraint
      if (shortcut.mode && shortcut.mode !== mode) continue;

      // Check phase constraint
      if (shortcut.phase && shortcut.phase !== phase) continue;

      // Check selection constraint
      if (shortcut.requiresSelection && !hasSelection) continue;

      // Get handler
      const handler = handlersRef.current[shortcut.action];
      if (!handler) continue;

      if (shortcut.preventDefault) {
        event.preventDefault();
      }

      if (shortcut.requiresConfirm) {
        if (window.confirm(`Are you sure you want to ${shortcut.description.toLowerCase()}?`)) {
          handler(shortcut.payload);
        }
      } else {
        handler(shortcut.payload);
      }

      return;
    }
  }, [enabled, mode, phase, hasSelection]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
};

export default useKeyboardShortcuts;
