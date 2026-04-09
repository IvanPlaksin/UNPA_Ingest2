/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AOPEG React Hooks
 * API hooks for AOPEG graph management and execution
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ExecutorCatalog,
  ExecutorInfo,
  ExecutionEvent,
  GraphResponse,
  ExecutionResponse,
  ValidationResult,
} from '../types/aopeg.types';

const API_BASE = '/api/v1/aopeg';

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR CATALOG
// ────────────────────────────────────────────────────────────────────────────

export function useExecutorCatalog() {
  const [catalog, setCatalog] = useState<ExecutorCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCatalog() {
      try {
        const response = await fetch(`${API_BASE}/registry/executors`);
        if (!response.ok) throw new Error('Failed to fetch executors');

        const data = await response.json();

        // Group by domain
        const byDomain: Record<string, ExecutorInfo[]> = {};
        const domains = new Set<string>();

        for (const executor of data.data || []) {
          domains.add(executor.domain);
          if (!byDomain[executor.domain]) {
            byDomain[executor.domain] = [];
          }
          byDomain[executor.domain].push(executor);
        }

        setCatalog({
          executors: data.data || [],
          byDomain,
          domains: Array.from(domains).sort(),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchCatalog();
  }, []);

  return { catalog, loading, error };
}

// ────────────────────────────────────────────────────────────────────────────
// GRAPH CRUD
// ────────────────────────────────────────────────────────────────────────────

export function useGraph(graphId: string | null) {
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load graph
  const loadGraph = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/graphs/${id}`);
      if (!response.ok) throw new Error('Failed to load graph');
      const data = await response.json();
      setGraph(data.data);
      return data.data as GraphResponse;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Save graph
  const saveGraph = useCallback(async (graphData: Partial<GraphResponse>) => {
    setLoading(true);
    setError(null);
    try {
      const isNew = !graphData.id;
      const url = isNew ? `${API_BASE}/graphs` : `${API_BASE}/graphs/${graphData.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(graphData),
      });

      if (!response.ok) throw new Error('Failed to save graph');
      const data = await response.json();
      setGraph(data.data);
      return data.data as GraphResponse;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Delete graph
  const deleteGraph = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/graphs/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete graph');
      setGraph(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Validate graph
  const validateGraph = useCallback(async (id: string): Promise<ValidationResult> => {
    try {
      const response = await fetch(`${API_BASE}/graphs/${id}/validate`, { method: 'POST' });
      if (!response.ok) throw new Error('Validation failed');
      return await response.json();
    } catch (err) {
      return { valid: false, errors: [err instanceof Error ? err.message : 'Unknown error'], warnings: [] };
    }
  }, []);

  // Activate graph
  const activateGraph = useCallback(async (id: string) => {
    try {
      const response = await fetch(`${API_BASE}/graphs/${id}/activate`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to activate graph');
      const data = await response.json();
      setGraph(data.data);
      return data.data as GraphResponse;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    }
  }, []);

  // Load on mount if ID provided
  useEffect(() => {
    if (graphId) {
      loadGraph(graphId);
    }
  }, [graphId, loadGraph]);

  return { graph, loading, error, loadGraph, saveGraph, deleteGraph, validateGraph, activateGraph };
}

// ────────────────────────────────────────────────────────────────────────────
// GRAPH LIST
// ────────────────────────────────────────────────────────────────────────────

export function useGraphList(options?: { domain?: string; status?: string }) {
  const [graphs, setGraphs] = useState<GraphResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGraphs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (options?.domain) params.set('domain', options.domain);
      if (options?.status) params.set('status', options.status);

      const response = await fetch(`${API_BASE}/graphs?${params}`);
      if (!response.ok) throw new Error('Failed to fetch graphs');
      const data = await response.json();
      setGraphs(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [options?.domain, options?.status]);

  useEffect(() => {
    fetchGraphs();
  }, [fetchGraphs]);

  return { graphs, loading, error, refetch: fetchGraphs };
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTION
// ────────────────────────────────────────────────────────────────────────────

export function useExecution() {
  const [execution, setExecution] = useState<ExecutionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start execution
  const startExecution = useCallback(async (
    graphId: string,
    input: unknown,
    variables?: Record<string, unknown>
  ) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/execute/${graphId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, variables }),
      });

      if (!response.ok) throw new Error('Failed to start execution');
      const data = await response.json();
      setExecution(data.data);
      return data.data as ExecutionResponse;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Cancel execution
  const cancelExecution = useCallback(async (executionId: string) => {
    try {
      const response = await fetch(`${API_BASE}/executions/${executionId}/cancel`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to cancel execution');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    }
  }, []);

  // Get execution status
  const getExecution = useCallback(async (executionId: string) => {
    try {
      const response = await fetch(`${API_BASE}/executions/${executionId}`);
      if (!response.ok) throw new Error('Failed to get execution');
      const data = await response.json();
      setExecution(data.data);
      return data.data as ExecutionResponse;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    }
  }, []);

  return { execution, loading, error, startExecution, cancelExecution, getExecution };
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTION LIST
// ────────────────────────────────────────────────────────────────────────────

export function useExecutionList(options?: { graphId?: string; status?: string; limit?: number }) {
  const [executions, setExecutions] = useState<ExecutionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExecutions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (options?.graphId) params.set('graphId', options.graphId);
      if (options?.status) params.set('status', options.status);
      if (options?.limit) params.set('limit', String(options.limit));

      const response = await fetch(`${API_BASE}/executions?${params}`);
      if (!response.ok) throw new Error('Failed to fetch executions');
      const data = await response.json();
      setExecutions(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [options?.graphId, options?.status, options?.limit]);

  useEffect(() => {
    fetchExecutions();
  }, [fetchExecutions]);

  return { executions, loading, error, refetch: fetchExecutions };
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTION STREAM (SSE)
// ────────────────────────────────────────────────────────────────────────────

export function useExecutionStream(
  executionId: string | null,
  onEvent: (event: ExecutionEvent) => void
) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!executionId) return;

    const eventSource = new EventSource(`${API_BASE}/stream/${executionId}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected(true);
      setError(null);
    };

    // Handle specific event types
    const eventTypes = [
      'connected',
      'node:started',
      'node:completed',
      'node:failed',
      'node:retry',
      'execution:completed',
      'execution:failed',
      'execution:cancelled',
    ];

    eventTypes.forEach((eventType) => {
      eventSource.addEventListener(eventType, (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          onEvent({
            type: eventType as ExecutionEvent['type'],
            executionId,
            nodeId: data.nodeId,
            data,
            timestamp: new Date().toISOString(),
          });
        } catch (err) {
          console.error('Failed to parse SSE event:', err);
        }
      });
    });

    eventSource.onerror = () => {
      setConnected(false);
      setError('Connection lost');
      eventSource.close();
    };

    return () => {
      eventSource.close();
      setConnected(false);
    };
  }, [executionId, onEvent]);

  const disconnect = useCallback(() => {
    eventSourceRef.current?.close();
    setConnected(false);
  }, []);

  return { connected, error, disconnect };
}

// ────────────────────────────────────────────────────────────────────────────
// EXAMPLE GRAPHS
// ────────────────────────────────────────────────────────────────────────────

export function useExampleGraphs() {
  const [examples, setExamples] = useState<GraphResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchExamples() {
      try {
        const response = await fetch(`${API_BASE}/examples`);
        if (!response.ok) throw new Error('Failed to fetch examples');
        const data = await response.json();
        setExamples(data.data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetchExamples();
  }, []);

  const importExample = useCallback(async (exampleId: string, name?: string) => {
    const response = await fetch(`${API_BASE}/examples/${exampleId}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error('Failed to import example');
    return (await response.json()).data as GraphResponse;
  }, []);

  return { examples, loading, error, importExample };
}

// ────────────────────────────────────────────────────────────────────────────
// AOPEG STATS
// ────────────────────────────────────────────────────────────────────────────

export interface AOPEGStats {
  graphs: {
    graphCount: number;
    nodeCount: number;
    edgeCount: number;
    executionCount: number;
  };
  registry: {
    executors: number;
    conditions: number;
    transformers: number;
    domains: string[];
  };
  domains: Array<{ domain: string; graphCount: number }>;
  topExecutors: Array<{ executorType: string; usageCount: number }>;
}

export function useAOPEGStats() {
  const [stats, setStats] = useState<AOPEGStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/stats`);
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      setStats(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
}

// ────────────────────────────────────────────────────────────────────────────
// CONDITIONS & TRANSFORMERS
// ────────────────────────────────────────────────────────────────────────────

export function useConditionTypes() {
  const [conditions, setConditions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        const response = await globalThis.fetch(`${API_BASE}/registry/conditions`);
        if (response.ok) {
          const data = await response.json();
          setConditions(data.data || []);
        }
      } catch {
        // Ignore errors, use defaults
        setConditions(['always', 'success', 'failure', 'quality', 'expression']);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);

  return { conditions, loading };
}

export function useTransformerTypes() {
  const [transformers, setTransformers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        const response = await globalThis.fetch(`${API_BASE}/registry/transformers`);
        if (response.ok) {
          const data = await response.json();
          setTransformers(data.data || []);
        }
      } catch {
        // Ignore errors, use defaults
        setTransformers(['identity', 'json_path', 'map', 'filter', 'template']);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);

  return { transformers, loading };
}

// ────────────────────────────────────────────────────────────────────────────
// NODE TYPE CATALOG (Core KB)
// ────────────────────────────────────────────────────────────────────────────

export interface NodeTypeInfo {
  fullName: string;
  domain: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  parameters?: Array<{
    name: string;
    type: string;
    required: boolean;
    description?: string;
    default?: unknown;
  }>;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface DomainInfo {
  name: string;
  displayName: string;
  description: string;
  color: string;
  icon: string;
  nodeCount?: number;
}

export interface EdgeTypeInfo {
  name: string;
  displayName: string;
  description: string;
  color: string;
  style: string;
  animated: boolean;
}

export interface NodeTypeCatalog {
  domains: DomainInfo[];
  nodeTypes: NodeTypeInfo[];
  edgeTypes: EdgeTypeInfo[];
  byDomain: Record<string, NodeTypeInfo[]>;
  stats: {
    domainCount: number;
    nodeTypeCount: number;
    edgeTypeCount: number;
  };
}

const GRAPH_TYPES_API = '/api/v1/graph-types';

export function useNodeTypeCatalog() {
  const [catalog, setCatalog] = useState<NodeTypeCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${GRAPH_TYPES_API}/catalog`);
      if (!response.ok) throw new Error('Failed to fetch node type catalog');

      const data = await response.json();
      setCatalog(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  return { catalog, loading, error, refetch: fetchCatalog };
}

export function useNodeTypesByDomain(domain?: string) {
  const [types, setTypes] = useState<NodeTypeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      try {
        const params = domain ? `?domain=${domain}` : '';
        const response = await globalThis.fetch(`${GRAPH_TYPES_API}/node-types${params}`);
        if (!response.ok) throw new Error('Failed to fetch node types');

        const data = await response.json();
        setTypes(data.data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [domain]);

  return { types, loading, error };
}

export function useNodeTypeSchema(fullName: string | null) {
  const [schema, setSchema] = useState<NodeTypeInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fullName) {
      setSchema(null);
      return;
    }

    async function fetch() {
      setLoading(true);
      try {
        const response = await globalThis.fetch(`${GRAPH_TYPES_API}/node-types/${fullName}`);
        if (!response.ok) throw new Error('Failed to fetch node type schema');

        const data = await response.json();
        setSchema(data.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [fullName]);

  return { schema, loading, error };
}
