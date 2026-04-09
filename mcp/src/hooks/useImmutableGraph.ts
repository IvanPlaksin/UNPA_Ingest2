/**
 * Immutable Graph React Hooks
 * UN ProjectAdvisor - Hooks for bi-temporal versioned graph operations
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as graphApi from '../services/immutableGraph.service';
import type {
  NodeVersion,
  EdgeVersion,
  NodeLineage,
  GodModeSession,
  PendingDeletion,
  ChainVerification,
  GraphInfo,
} from '../services/immutableGraph.service';

// ════════════════════════════════════════════════════════════════════════════
// NODE OPERATIONS
// ════════════════════════════════════════════════════════════════════════════

export function useNode(entityId: string | null) {
  const [node, setNode] = useState<NodeVersion | null>(null);
  const [lineage, setLineage] = useState<NodeLineage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNode = useCallback(async (id: string, includeLineage = false) => {
    setLoading(true);
    setError(null);
    try {
      const result = await graphApi.getNode(id, includeLineage);
      if (result.success && result.data) {
        setNode(result.data.node);
        if (result.data.lineage) {
          setLineage(result.data.lineage);
        }
        return result.data.node;
      } else {
        setError(result.error || 'Failed to load node');
        return null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateNode = useCallback(async (
    id: string,
    properties: Record<string, unknown>,
    changeReason?: string
  ) => {
    setLoading(true);
    setError(null);
    try {
      const result = await graphApi.updateNode(id, { properties, changeReason });
      if (result.success && result.data) {
        setNode(result.data);
        return result.data;
      } else {
        setError(result.error || 'Failed to update node');
        return null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const deprecateNode = useCallback(async (id: string, reason?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await graphApi.deprecateNode(id, reason);
      if (result.success && result.data) {
        setNode(result.data.node);
        return result.data;
      } else {
        setError(result.error || 'Failed to deprecate node');
        return null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (entityId) {
      loadNode(entityId);
    } else {
      setNode(null);
      setLineage(null);
    }
  }, [entityId, loadNode]);

  return { node, lineage, loading, error, loadNode, updateNode, deprecateNode };
}

// ════════════════════════════════════════════════════════════════════════════
// NODE LINEAGE & VERIFICATION
// ════════════════════════════════════════════════════════════════════════════

export function useNodeLineage(entityId: string | null) {
  const [lineage, setLineage] = useState<NodeLineage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLineage = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await graphApi.getNodeLineage(id);
      if (result.success && result.data) {
        setLineage(result.data);
        return result.data;
      } else {
        setError(result.error || 'Failed to load lineage');
        return null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (entityId) {
      loadLineage(entityId);
    } else {
      setLineage(null);
    }
  }, [entityId, loadLineage]);

  return { lineage, loading, error, refetch: () => entityId && loadLineage(entityId) };
}

export function useChainVerification(entityId: string | null) {
  const [verification, setVerification] = useState<ChainVerification | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await graphApi.verifyNodeChain(id);
      if (result.success && result.data) {
        setVerification(result.data);
        return result.data;
      } else {
        setError(result.error || 'Verification failed');
        return null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (entityId) {
      verify(entityId);
    } else {
      setVerification(null);
    }
  }, [entityId, verify]);

  return { verification, loading, error, verify: () => entityId && verify(entityId) };
}

// ════════════════════════════════════════════════════════════════════════════
// GOD MODE
// ════════════════════════════════════════════════════════════════════════════

export function useGodMode() {
  const [session, setSession] = useState<GodModeSession | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const result = await graphApi.getGodModeStatus();
      if (result.success && result.data) {
        if ('active' in result.data && result.data.active === false) {
          setSession(null);
          setIsActive(false);
        } else {
          setSession(result.data as GodModeSession);
          setIsActive(true);
        }
      }
    } catch (err) {
      console.error('Failed to check God Mode status:', err);
    }
  }, []);

  const activate = useCallback(async (reason: string, durationMinutes?: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await graphApi.activateGodMode(reason, durationMinutes);
      if (result.success && result.data) {
        setSession(result.data);
        setIsActive(true);
        return result.data;
      } else {
        setError(result.error || 'Failed to activate God Mode');
        return null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const deactivate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await graphApi.deactivateGodMode();
      if (result.success) {
        setSession(null);
        setIsActive(false);
        return true;
      } else {
        setError(result.error || 'Failed to deactivate God Mode');
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Check status on mount and periodically
  useEffect(() => {
    checkStatus();
    refreshIntervalRef.current = setInterval(checkStatus, 30000); // Every 30s
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [checkStatus]);

  return { session, isActive, loading, error, activate, deactivate, checkStatus };
}

// ════════════════════════════════════════════════════════════════════════════
// DELETION WITH GOD MODE
// ════════════════════════════════════════════════════════════════════════════

export function useDeletion() {
  const [pending, setPending] = useState<PendingDeletion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canConfirm, setCanConfirm] = useState(false);

  const markForDeletion = useCallback(async (
    entityId: string,
    entityType: 'NODE' | 'EDGE',
    reason?: string
  ) => {
    setLoading(true);
    setError(null);
    try {
      const result = await graphApi.markForDeletion(entityId, entityType, reason);
      if (result.success && result.data) {
        setPending(result.data);
        setCanConfirm(false);
        // Start countdown
        const waitMs = result.data.waitSeconds * 1000;
        setTimeout(() => setCanConfirm(true), waitMs);
        return result.data;
      } else {
        setError(result.error || 'Failed to mark for deletion');
        return null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const confirmDeletion = useCallback(async (entityId: string) => {
    if (!canConfirm) {
      setError('Must wait before confirming deletion');
      return null;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await graphApi.confirmDeletion(entityId);
      if (result.success && result.data) {
        setPending(null);
        setCanConfirm(false);
        return result.data;
      } else {
        setError(result.error || 'Failed to confirm deletion');
        return null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, [canConfirm]);

  const cancelDeletion = useCallback(() => {
    setPending(null);
    setCanConfirm(false);
    setError(null);
  }, []);

  return { pending, canConfirm, loading, error, markForDeletion, confirmDeletion, cancelDeletion };
}

// ════════════════════════════════════════════════════════════════════════════
// GRAPH CATALOG
// ════════════════════════════════════════════════════════════════════════════

export function useGraphCatalog(options?: {
  namespace?: string;
  projectId?: string;
  nodeType?: string;
}) {
  const [graphs, setGraphs] = useState<GraphInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGraphs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await graphApi.getGraphCatalog({
        namespace: options?.namespace,
        projectId: options?.projectId,
        nodeType: options?.nodeType || 'ExecutionGraph',
      });
      if (result.success && result.data) {
        setGraphs(result.data);
      } else {
        setError(result.error || 'Failed to load graphs');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [options?.namespace, options?.projectId, options?.nodeType]);

  useEffect(() => {
    fetchGraphs();
  }, [fetchGraphs]);

  return { graphs, loading, error, refetch: fetchGraphs };
}

// ════════════════════════════════════════════════════════════════════════════
// GRAPH EVENT STREAM (SSE)
// ════════════════════════════════════════════════════════════════════════════

export interface GraphEvent {
  type: string;
  entityId: string;
  entityType: 'NODE' | 'EDGE' | 'SESSION';
  namespace?: string;
  data: Record<string, unknown>;
  timestamp: string;
  userId: string;
}

export function useGraphEventStream(
  options: {
    namespace?: string;
    entityId?: string;
    types?: string[];
  } | null,
  onEvent: (event: GraphEvent) => void
) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!options) return;

    const eventSource = graphApi.createGraphEventSource(options);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onEvent(data);
      } catch (err) {
        console.error('Failed to parse graph event:', err);
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
      setError('Connection lost');
    };

    return () => {
      eventSource.close();
      setConnected(false);
    };
  }, [options, onEvent]);

  const disconnect = useCallback(() => {
    eventSourceRef.current?.close();
    setConnected(false);
  }, []);

  return { connected, error, disconnect };
}

// ════════════════════════════════════════════════════════════════════════════
// AUDIT TRAIL
// ════════════════════════════════════════════════════════════════════════════

export function useAuditTrail(entityId: string | null) {
  const [trail, setTrail] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTrail = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await graphApi.getAuditTrail(id);
      if (result.success && result.data) {
        setTrail(result.data);
        return result.data;
      } else {
        setError(result.error || 'Failed to load audit trail');
        return null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (entityId) {
      loadTrail(entityId);
    } else {
      setTrail([]);
    }
  }, [entityId, loadTrail]);

  return { trail, loading, error, refetch: () => entityId && loadTrail(entityId) };
}
