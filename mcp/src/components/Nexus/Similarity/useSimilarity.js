import { useState, useCallback } from 'react';
import { useNexusStore } from '../../../stores/nexusStore';
import { findSimilarNodes, calculateSimilarityClientSide } from '../../../services/nexus.service';

/**
 * Hook for similarity search state and logic.
 */
export const useSimilarity = (nodes = [], edges = []) => {
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [comparedNode, setComparedNode] = useState(null);

  const namespace = useNexusStore(state => state.namespace);

  const findSimilar = useCallback(async (referenceNode, options = {}) => {
    if (!referenceNode) {
      setError('No reference node selected');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResults([]);
    setComparedNode(null);

    try {
      const apiResult = await findSimilarNodes(namespace, referenceNode.id, options);

      if (apiResult && apiResult.results) {
        setResults(apiResult.results);
      } else {
        const clientResults = calculateSimilarityClientSide(referenceNode, nodes, edges, options);
        setResults(clientResults);

        if (clientResults.length === 0) {
          setError('No similar nodes found with current settings');
        }
      }
    } catch (err) {
      console.error('Similarity search failed:', err);
      setError(err.message || 'Search failed');
    } finally {
      setIsLoading(false);
    }
  }, [namespace, nodes, edges]);

  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
    setComparedNode(null);
  }, []);

  const setComparison = useCallback((node) => {
    setComparedNode(node);
  }, []);

  return {
    results,
    isLoading,
    error,
    comparedNode,
    findSimilar,
    clearResults,
    setComparison,
  };
};

export default useSimilarity;
