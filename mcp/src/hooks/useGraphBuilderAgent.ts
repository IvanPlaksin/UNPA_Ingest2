/**
 * ═══════════════════════════════════════════════════════════════════════════
 * useGraphBuilderAgent Hook
 * React hook for interacting with the AI Graph Builder Agent
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { API_BASE_URL } from '../config/api.config';
import { useStreamThrottle } from './useStreamThrottle';

const API_BASE = `${API_BASE_URL}/ai-agent`;

// ────────────────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  toolCalls?: ToolCall[];
  streaming?: boolean;
  error?: boolean;
}

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  result: ToolResult;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface AgentGraph {
  id: string;
  name: string;
  description?: string;
  domain?: string;
  nodes: AgentGraphNode[];
  edges: AgentGraphEdge[];
  entryNodeId?: string;
  exitNodeIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface AgentGraphNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    executorType: string;
    displayName: string;
    description?: string;
    parameters?: Record<string, unknown>;
    timeout?: number;
    retryPolicy?: {
      maxAttempts: number;
      delayMs: number;
      backoffMultiplier: number;
    };
    enabled?: boolean;
  };
}

export interface AgentGraphEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  data?: {
    label?: string;
    condition?: {
      type: string;
      config?: Record<string, unknown>;
    };
    dataMapping?: Record<string, unknown>;
    priority?: number;
  };
}

export interface AIModel {
  id: string;
  provider: string;
  displayName: string;
  description?: string;
  maxTokens?: number;
  supportsTools?: boolean;
  supportsStreaming?: boolean;
  isDefault?: boolean;
  tier?: string;
  available?: boolean;
  providerInfo?: {
    name: string;
    baseUrl: string;
  };
}

export interface ModelInfo {
  id: string;
  displayName: string;
  provider: string;
}

export interface UseGraphBuilderAgentOptions {
  onGraphUpdate?: (graph: AgentGraph) => void;
  onToolCall?: (toolCalls: ToolCall[]) => void;
  onModelChange?: (modelId: string, modelInfo: ModelInfo) => void;
  autoStart?: boolean;
  defaultModelId?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// HOOK
// ────────────────────────────────────────────────────────────────────────────

export function useGraphBuilderAgent(options: UseGraphBuilderAgentOptions = {}) {
  const { onGraphUpdate, onToolCall, onModelChange, autoStart = false, defaultModelId } = options;

  // State
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [graph, setGraph] = useState<AgentGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Model state
  const [availableModels, setAvailableModels] = useState<AIModel[]>([]);
  const [currentModelId, setCurrentModelId] = useState<string | null>(defaultModelId || null);
  const [currentModelInfo, setCurrentModelInfo] = useState<ModelInfo | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);

  // Coalesce per-token stream updates into ≤1 render per ~80ms.
  const { schedule: scheduleStreamFlush, flushNow: flushStream } = useStreamThrottle(80);

  // ══════════════════════════════════════════════════════════════════════════
  // API HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  const fetchApi = useCallback(async (endpoint: string, options: RequestInit = {}) => {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `API Error: ${res.status}`);
    }

    return data;
  }, []);

  // ══════════════════════════════════════════════════════════════════════════
  // SESSION MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  const startSession = useCallback(async (
    initialGraph: AgentGraph | null = null,
    userName = 'User',
    modelId?: string
  ) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetchApi('/sessions', {
        method: 'POST',
        body: JSON.stringify({
          userName,
          initialGraph,
          modelId: modelId || currentModelId,
        }),
      });

      if (response.success) {
        setSessionId(response.data.sessionId);
        setIsConnected(true);

        // Update model info from response
        if (response.data.modelId) {
          setCurrentModelId(response.data.modelId);
        }
        if (response.data.modelInfo) {
          setCurrentModelInfo(response.data.modelInfo);
        }

        const modelName = response.data.modelInfo?.displayName || 'AI';
        setMessages([{
          id: Date.now(),
          role: 'assistant',
          content: `Hello! I'm your AI Graph Builder assistant powered by ${modelName}. I can help you create AOPEG workflow graphs through conversation. What would you like to build?`,
          timestamp: new Date().toISOString(),
        }]);

        return response.data;
      }

      throw new Error(response.error || 'Failed to start session');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setIsConnected(false);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchApi, currentModelId]);

  const endSession = useCallback(async () => {
    if (!sessionId) return;

    setLoading(true);

    try {
      const response = await fetchApi(`/sessions/${sessionId}`, {
        method: 'DELETE',
      });

      setSessionId(null);
      setIsConnected(false);

      return response.data?.graph;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [sessionId, fetchApi]);

  const getSessionState = useCallback(async () => {
    if (!sessionId) return null;

    try {
      const response = await fetchApi(`/sessions/${sessionId}`);
      return response.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    }
  }, [sessionId, fetchApi]);

  // ══════════════════════════════════════════════════════════════════════════
  // MODEL MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  const fetchAvailableModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const response = await fetchApi('/models');
      if (response.success) {
        setAvailableModels(response.data);
        return response.data;
      }
      throw new Error(response.error || 'Failed to fetch models');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[useGraphBuilderAgent] Error fetching models:', message);
      return [];
    } finally {
      setModelsLoading(false);
    }
  }, [fetchApi]);

  const setModel = useCallback(async (modelId: string) => {
    if (!sessionId) {
      // No active session, just update local state
      setCurrentModelId(modelId);
      const model = availableModels.find(m => m.id === modelId);
      if (model) {
        const info: ModelInfo = {
          id: model.id,
          displayName: model.displayName,
          provider: model.provider,
        };
        setCurrentModelInfo(info);
        onModelChange?.(modelId, info);
      }
      return { success: true, modelId };
    }

    setLoading(true);
    try {
      const response = await fetchApi(`/sessions/${sessionId}/model`, {
        method: 'PUT',
        body: JSON.stringify({ modelId }),
      });

      if (response.success) {
        setCurrentModelId(response.data.modelId);
        if (response.data.modelInfo) {
          setCurrentModelInfo(response.data.modelInfo);
          onModelChange?.(response.data.modelId, response.data.modelInfo);
        }

        // Add system message about model change
        setMessages(prev => [...prev, {
          id: Date.now(),
          role: 'system',
          content: `Switched to ${response.data.modelInfo?.displayName || modelId}`,
          timestamp: new Date().toISOString(),
        }]);

        return response.data;
      }

      throw new Error(response.error || 'Failed to set model');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [sessionId, fetchApi, availableModels, onModelChange]);

  // ══════════════════════════════════════════════════════════════════════════
  // CHAT METHODS
  // ══════════════════════════════════════════════════════════════════════════

  const sendMessage = useCallback(async (message: string) => {
    if (!sessionId || !message.trim()) return;

    setLoading(true);
    setError(null);

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      const response = await fetchApi(`/sessions/${sessionId}/chat`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      });

      if (response.success) {
        const assistantMessage: ChatMessage = {
          id: Date.now() + 1,
          role: 'assistant',
          content: response.data.content,
          toolCalls: response.data.toolCalls,
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, assistantMessage]);

        if (response.data.graph) {
          setGraph(response.data.graph);
          onGraphUpdate?.(response.data.graph);
        }

        if (response.data.toolCalls?.length > 0) {
          onToolCall?.(response.data.toolCalls);
        }

        return response.data;
      }

      throw new Error(response.error || 'Chat failed');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);

      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'assistant',
        content: `Sorry, I encountered an error: ${message}`,
        error: true,
        timestamp: new Date().toISOString(),
      }]);

      throw err;
    } finally {
      setLoading(false);
    }
  }, [sessionId, fetchApi, onGraphUpdate, onToolCall]);

  const sendMessageStream = useCallback(async (message: string) => {
    if (!sessionId || !message.trim()) return;

    setStreaming(true);
    setError(null);

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);

    const assistantId = Date.now() + 1;
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '',
      streaming: true,
      timestamp: new Date().toISOString(),
    }]);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`${API_BASE}/sessions/${sessionId}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
        signal: abortControllerRef.current.signal,
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullContent = '';
      let toolCalls: ToolCall[] = [];
      let finalGraph: AgentGraph | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n').filter(line => line.startsWith('data: '));

        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));

            switch (data.type) {
              case 'chunk':
                fullContent += data.content;
                scheduleStreamFlush(() => setMessages(prev => prev.map(msg =>
                  msg.id === assistantId
                    ? { ...msg, content: fullContent }
                    : msg
                )));
                break;

              case 'complete':
                console.log('[useGraphBuilderAgent] Received complete event:', {
                  hasContent: !!data.content,
                  toolCallsCount: data.toolCalls?.length || 0,
                  hasGraph: !!data.graph,
                  graphNodes: data.graph?.nodes?.length || 0,
                  graphEdges: data.graph?.edges?.length || 0,
                });
                fullContent = data.content || fullContent;
                toolCalls = data.toolCalls || [];
                finalGraph = data.graph;
                break;

              case 'error':
                throw new Error(data.error);
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }

      flushStream();
      setMessages(prev => prev.map(msg =>
        msg.id === assistantId
          ? { ...msg, content: fullContent, toolCalls, streaming: false }
          : msg
      ));

      if (finalGraph) {
        console.log('[useGraphBuilderAgent] Calling onGraphUpdate with graph:', {
          nodes: finalGraph.nodes?.length || 0,
          edges: finalGraph.edges?.length || 0,
        });
        setGraph(finalGraph);
        onGraphUpdate?.(finalGraph);
      } else {
        console.log('[useGraphBuilderAgent] No finalGraph to update');
      }

      if (toolCalls.length > 0) {
        onToolCall?.(toolCalls);
      }

      return { content: fullContent, toolCalls, graph: finalGraph };

    } catch (err) {
      flushStream();
      if (err instanceof Error && err.name === 'AbortError') {
        setMessages(prev => prev.map(msg =>
          msg.id === assistantId
            ? { ...msg, content: msg.content + '\n[Cancelled]', streaming: false }
            : msg
        ));
      } else {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        setMessages(prev => prev.map(msg =>
          msg.id === assistantId
            ? { ...msg, content: `Error: ${message}`, error: true, streaming: false }
            : msg
        ));
      }
      throw err;
    } finally {
      setStreaming(false);
      abortControllerRef.current = null;
    }
  }, [sessionId, onGraphUpdate, onToolCall]);

  const cancelStream = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // ══════════════════════════════════════════════════════════════════════════
  // GRAPH OPERATIONS
  // ══════════════════════════════════════════════════════════════════════════

  const importGraph = useCallback(async (graphData: AgentGraph) => {
    if (!sessionId) throw new Error('No active session');

    setLoading(true);

    try {
      const response = await fetchApi(`/sessions/${sessionId}/graph/import`, {
        method: 'POST',
        body: JSON.stringify({ graph: graphData }),
      });

      if (response.success) {
        setGraph(response.data.graph);
        onGraphUpdate?.(response.data.graph);

        setMessages(prev => [...prev, {
          id: Date.now(),
          role: 'system',
          content: 'Graph imported successfully. You can now modify it through conversation.',
          timestamp: new Date().toISOString(),
        }]);

        return response.data.graph;
      }

      throw new Error(response.error || 'Import failed');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [sessionId, fetchApi, onGraphUpdate]);

  const exportGraph = useCallback(async () => {
    if (!sessionId) throw new Error('No active session');

    try {
      const response = await fetchApi(`/sessions/${sessionId}/graph`);
      return response.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    }
  }, [sessionId, fetchApi]);

  // ══════════════════════════════════════════════════════════════════════════
  // TOOL OPERATIONS
  // ══════════════════════════════════════════════════════════════════════════

  const executeTool = useCallback(async (toolName: string, args: Record<string, unknown> = {}) => {
    if (!sessionId) throw new Error('No active session');

    setLoading(true);

    try {
      const response = await fetchApi(`/sessions/${sessionId}/tools/${toolName}`, {
        method: 'POST',
        body: JSON.stringify(args),
      });

      const stateResponse = await fetchApi(`/sessions/${sessionId}/graph`);
      if (stateResponse.success) {
        setGraph(stateResponse.data);
        onGraphUpdate?.(stateResponse.data);
      }

      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [sessionId, fetchApi, onGraphUpdate]);

  const getTools = useCallback(async () => {
    try {
      const response = await fetchApi('/tools');
      return response.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    }
  }, [fetchApi]);

  // ══════════════════════════════════════════════════════════════════════════
  // HISTORY OPERATIONS
  // ══════════════════════════════════════════════════════════════════════════

  const clearHistory = useCallback(async () => {
    if (!sessionId) return;

    try {
      await fetchApi(`/sessions/${sessionId}/history`, {
        method: 'DELETE',
      });

      setMessages([{
        id: Date.now(),
        role: 'assistant',
        content: 'Conversation cleared. How can I help you with your graph?',
        timestamp: new Date().toISOString(),
      }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    }
  }, [sessionId, fetchApi]);

  // ══════════════════════════════════════════════════════════════════════════
  // EFFECTS
  // ══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (autoStart && !sessionId) {
      startSession();
    }
  }, [autoStart, sessionId, startSession]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // ══════════════════════════════════════════════════════════════════════════
  // RETURN
  // ══════════════════════════════════════════════════════════════════════════

  return {
    // Session state
    sessionId,
    messages,
    graph,
    loading,
    streaming,
    error,
    isConnected,

    // Model state
    availableModels,
    currentModelId,
    currentModelInfo,
    modelsLoading,

    // Session methods
    startSession,
    endSession,
    getSessionState,

    // Model methods
    fetchAvailableModels,
    setModel,

    // Chat methods
    sendMessage,
    sendMessageStream,
    cancelStream,

    // Graph methods
    importGraph,
    exportGraph,

    // Tool methods
    executeTool,
    getTools,

    // History methods
    clearHistory,
    clearError: () => setError(null),
  };
}

export default useGraphBuilderAgent;
