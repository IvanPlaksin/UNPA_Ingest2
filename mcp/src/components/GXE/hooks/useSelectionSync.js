/**
 * useSelectionSync — bidirectional selection sync for ReactFlow.
 * Migrated from Nexus/hooks/useSelectionSync (CONS-19).
 * Self-contained: no nexusStore dependency.
 */
import { useCallback, useRef } from 'react';

export const useSelectionSync = ({ nodes, setNodes, reactFlowInstance }) => {
  const lastSyncedRef = useRef([]);

  // ReactFlow → external: notify parent of selection changes
  const onSelectionChange = useCallback(({ nodes: selectedNodes }) => {
    const ids = selectedNodes?.map(n => n.id) || [];
    lastSyncedRef.current = ids;
  }, []);

  // External → ReactFlow: programmatically select nodes
  const selectNodes = useCallback((nodeIds) => {
    const set = new Set(nodeIds);
    setNodes(nds => nds.map(n => ({ ...n, selected: set.has(n.id) })));
    lastSyncedRef.current = nodeIds;
  }, [setNodes]);

  // Select + fitView
  const selectAndFocus = useCallback((nodeIds, padding = 0.2) => {
    selectNodes(nodeIds);
    if (reactFlowInstance && nodeIds.length > 0) {
      setTimeout(() => {
        try {
          reactFlowInstance.fitView({
            nodes: nodeIds.map(id => ({ id })),
            padding,
            duration: 400,
          });
        } catch { /* ignore */ }
      }, 50);
    }
  }, [selectNodes, reactFlowInstance]);

  return { onSelectionChange, selectNodes, selectAndFocus };
};

export default useSelectionSync;
