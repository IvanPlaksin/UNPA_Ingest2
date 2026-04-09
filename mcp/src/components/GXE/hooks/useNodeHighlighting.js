/**
 * useNodeHighlighting — visual highlighting effects for ReactFlow nodes.
 * Migrated from Nexus/hooks/useNodeHighlighting (CONS-19).
 * Self-contained: local state, no nexusStore dependency.
 */
import { useCallback, useRef } from 'react';

const HIGHLIGHT_CLASSES = {
  glow: 'nexus-highlight nexus-highlight--glow',
  pulse: 'nexus-highlight nexus-highlight--pulse',
  outline: 'nexus-highlight nexus-highlight--outline',
};

export const useNodeHighlighting = ({ setNodes }) => {
  const stateRef = useRef({ ids: [], style: '', color: '' });

  const highlightNodes = useCallback((nodeIds, style = 'glow', color = '#6366f1') => {
    stateRef.current = { ids: nodeIds, style, color };
    const cls = HIGHLIGHT_CLASSES[style] || HIGHLIGHT_CLASSES.glow;

    setNodes(nds => nds.map(node => {
      const isHl = nodeIds.includes(node.id);
      const base = (node.className || '')
        .split(' ')
        .filter(c => !c.startsWith('nexus-highlight'))
        .join(' ')
        .trim();
      const newClass = isHl ? [base, cls].filter(Boolean).join(' ') : base || undefined;
      const newStyle = isHl
        ? { ...node.style, '--nexus-highlight-color': color }
        : node.style;

      if (node.className === newClass) return node;
      return { ...node, className: newClass, style: newStyle };
    }));
  }, [setNodes]);

  const clearHighlight = useCallback(() => {
    stateRef.current = { ids: [], style: '', color: '' };
    setNodes(nds => nds.map(node => {
      const base = (node.className || '')
        .split(' ')
        .filter(c => !c.startsWith('nexus-highlight'))
        .join(' ')
        .trim();
      if ((node.className || '') === base) return node;
      return { ...node, className: base || undefined };
    }));
  }, [setNodes]);

  return { highlightNodes, clearHighlight };
};

export default useNodeHighlighting;
