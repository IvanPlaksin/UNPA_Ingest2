import { useState, useCallback, useMemo } from 'react';
import { useNexusStore } from '../../../stores/nexusStore';
import { sendAssistantMessage, getSuggestedQuestions } from '../../../services/nexus.service';

/**
 * Hook for AI Assistant state and logic.
 */
export const useAssistant = ({ nodes = [], edges = [] }) => {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hello! I\'m your graph analysis assistant. Ask me about nodes, clusters, paths, or anomalies in your knowledge graph.',
      timestamp: new Date().toISOString(),
      actions: [],
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const selectedNodeIds = useNexusStore(state => state.selectedNodeIds);
  const namespace = useNexusStore(state => state.namespace);
  const mode = useNexusStore(state => state.mode);
  const insights = useNexusStore(state => state.insights);

  const graphStats = useMemo(() => ({
    nodeCount: nodes.length,
    edgeCount: edges.length,
  }), [nodes.length, edges.length]);

  const selectedNodes = useMemo(() => {
    return nodes.filter(n => selectedNodeIds.includes(n.id));
  }, [nodes, selectedNodeIds]);

  const suggestions = useMemo(() => {
    return getSuggestedQuestions({
      selectedCount: selectedNodeIds.length,
      nodeCount: nodes.length,
      hasInsights: insights.length > 0,
      mode,
    });
  }, [selectedNodeIds.length, nodes.length, insights.length, mode]);

  const sendMessage = useCallback(async (text) => {
    if (!text || text.trim().length === 0) return;

    const userMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const context = {
        selectedNodes: selectedNodes.map(n => ({
          id: n.id,
          name: n.name || n.label,
          type: n.type,
        })),
        graphStats,
        mode,
      };

      const result = await sendAssistantMessage(namespace, text.trim(), context);

      const assistantMessage = {
        id: `msg-${Date.now()}-reply`,
        role: 'assistant',
        content: result.response || 'I couldn\'t process that request. Please try again.',
        timestamp: new Date().toISOString(),
        actions: result.actions || [],
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      const errorMessage = {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date().toISOString(),
        isError: true,
        actions: [],
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [namespace, selectedNodes, graphStats, mode]);

  const clearChat = useCallback(() => {
    setMessages([
      {
        id: 'welcome-reset',
        role: 'assistant',
        content: 'Chat cleared. How can I help you analyze the graph?',
        timestamp: new Date().toISOString(),
        actions: [],
      },
    ]);
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    clearChat,
    suggestions,
    graphStats,
    selectedNodes,
  };
};
