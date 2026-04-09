import React, { useState, useMemo } from 'react';
import { useNexusStore } from '../../../stores/nexusStore';
import { useKeyboardShortcuts } from '../../../hooks/useKeyboardShortcuts';
import Cheatsheet from './Cheatsheet';
import './KeyboardShortcuts.css';

/**
 * Keyboard shortcuts provider for NEXUS.
 * Wraps children and wires store actions to shortcut handlers.
 */
const KeyboardShortcuts = ({
  children,
  onToggleSearch,
  onToggleAssistant,
  onOpenInspector,
  onOpenPathFinder,
  onOpenSimilarity,
  onOpenPredictions,
  onDeleteSelected,
}) => {
  const [showCheatsheet, setShowCheatsheet] = useState(false);

  const mode = useNexusStore(state => state.mode);
  const guidedPhase = useNexusStore(state => state.guidedPhase);
  const selectedNodeIds = useNexusStore(state => state.selectedNodeIds);
  const setMode = useNexusStore(state => state.setMode);
  const setGuidedPhase = useNexusStore(state => state.setGuidedPhase);
  const clearSelection = useNexusStore(state => state.clearSelection);
  const setHighlight = useNexusStore(state => state.setHighlight);

  const hasSelection = selectedNodeIds.length > 0;

  const GUIDED_PHASES = ['understand', 'discover', 'evaluate', 'act'];

  const handlers = useMemo(() => ({
    // Global
    toggleCheatsheet: () => setShowCheatsheet(prev => !prev),
    escape: () => {
      if (showCheatsheet) {
        setShowCheatsheet(false);
      } else if (hasSelection) {
        clearSelection();
      }
    },
    focusSearch: () => onToggleSearch?.(true),
    setMode: (newMode) => setMode(newMode),
    toggleAssistant: () => onToggleAssistant?.(),

    // Canvas
    highlightSelected: () => {
      if (hasSelection) {
        setHighlight(selectedNodeIds, 'glow', '#6366f1');
      }
    },
    openInspector: () => onOpenInspector?.(),
    openPathFinder: () => onOpenPathFinder?.(),
    openSimilarity: () => onOpenSimilarity?.(),
    openPredictions: () => onOpenPredictions?.(),
    deleteSelected: () => onDeleteSelected?.(),

    // Guided
    nextPhase: () => {
      const idx = GUIDED_PHASES.indexOf(guidedPhase);
      if (idx < GUIDED_PHASES.length - 1) {
        setGuidedPhase(GUIDED_PHASES[idx + 1]);
      }
    },
    setPhase: (phase) => setGuidedPhase(phase),
    approveAll: () => {
      // Placeholder — will be wired to evaluate logic later
      console.log('[KeyboardShortcuts] Approve all clusters');
    },
  }), [
    showCheatsheet, hasSelection, selectedNodeIds,
    clearSelection, setHighlight, setMode, guidedPhase, setGuidedPhase,
    onToggleSearch, onToggleAssistant,
    onOpenInspector, onOpenPathFinder, onOpenSimilarity,
    onOpenPredictions, onDeleteSelected,
  ]);

  useKeyboardShortcuts(handlers, {
    enabled: true,
    mode,
    phase: guidedPhase,
    hasSelection,
  });

  return (
    <>
      {children}
      {showCheatsheet && (
        <Cheatsheet onClose={() => setShowCheatsheet(false)} />
      )}
    </>
  );
};

export default KeyboardShortcuts;
