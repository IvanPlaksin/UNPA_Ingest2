import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

/**
 * FloatingChatProvider (Phase 3) — open/close state + anchor context for the
 * floating "Explain this" chat window. Same chat component, a new mount point.
 *
 * @typedef {Object} AnchorContext
 * @property {string}  anchorId      stable id matching a UIAnchor graph node, e.g. "altiora.leave.request.form"
 * @property {string} [anchorTitle]  human-readable label for the anchored UI element (shown in the window header)
 * @property {string} [initialQuery] pre-filled query to auto-send on open (consumed in Phase 4 zero-query explain)
 *
 * Phase 3 scope is plumbing only: the context carries the anchor through to the
 * chat; Phase 4 will use `initialQuery` to auto-send a zero-query explain.
 *
 * Also bridges non-React callers via window CustomEvents so a plain DOM anchor
 * badge (Phase 8) can open the chat without importing the hook:
 *   window.dispatchEvent(new CustomEvent('openAltioraChat', { detail: anchorContext }))
 *   window.dispatchEvent(new CustomEvent('closeAltioraChat'))
 */

const FloatingChatContext = createContext({
  isOpen: false,
  anchorContext: null,
  openChat: () => {},
  closeChat: () => {},
});

export function FloatingChatProvider({ children, storeId = 'default' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [anchorContext, setAnchorContext] = useState(null);

  const openChat = useCallback((ctx = null) => {
    setAnchorContext(ctx || null);
    setIsOpen(true);
  }, []);

  const closeChat = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Non-React trigger bridge (P3-007): anchors rendered outside React (or in a
  // different bundle) can open/close the window via window CustomEvents.
  useEffect(() => {
    const onOpen = (e) => openChat(e && e.detail ? e.detail : null);
    const onClose = () => closeChat();
    window.addEventListener('openAltioraChat', onOpen);
    window.addEventListener('closeAltioraChat', onClose);
    return () => {
      window.removeEventListener('openAltioraChat', onOpen);
      window.removeEventListener('closeAltioraChat', onClose);
    };
  }, [openChat, closeChat]);

  return (
    <FloatingChatContext.Provider value={{ isOpen, anchorContext, openChat, closeChat, storeId }}>
      {children}
    </FloatingChatContext.Provider>
  );
}

export const useFloatingChat = () => useContext(FloatingChatContext);

export default FloatingChatProvider;
