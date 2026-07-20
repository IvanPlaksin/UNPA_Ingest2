import { useState, useEffect, useCallback, useRef } from 'react';
import { getEntityGraph, listNamespaces, getEntitySubgraph } from '../../../services/entityStore.service';
import { convertEntityStoreToGraph } from './entityStoreConverter';

const EMPTY_GRAPH = { nodes: [], links: [], meta: null };

/**
 * Hook for loading Entity Store data into EntitySingularity format.
 * Supports namespace filtering, subgraph expansion, and incremental loading.
 */
export function useEntityStoreGraph(initialNamespace = null) {
    const [graphData, setGraphData] = useState(EMPTY_GRAPH);
    const [namespaces, setNamespaces] = useState([]);
    const [namespace, setNamespace] = useState(initialNamespace);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Keep stable node positions across re-fetches
    const nodePositionsRef = useRef(new Map());

    // Load available namespaces on mount
    useEffect(() => {
        listNamespaces()
            .then(data => setNamespaces(data.map(item => item.namespace).filter(Boolean)))
            .catch(err => console.warn('Failed to load namespaces:', err));
    }, []);

    // Load full graph when namespace changes
    const loadGraph = useCallback(async (ns) => {
        setLoading(true);
        setError(null);
        try {
            const raw = await getEntityGraph(ns || null);
            const converted = convertEntityStoreToGraph(raw, ns);

            // Restore saved positions for existing nodes
            const nodesWithPositions = converted.nodes.map(n => {
                const saved = nodePositionsRef.current.get(n.id);
                return saved ? { ...n, x: saved.x, y: saved.y, z: saved.z } : n;
            });

            setGraphData({ ...converted, nodes: nodesWithPositions });
        } catch (err) {
            console.error('Failed to load entity graph:', err);
            setError(err.message || 'Failed to load graph');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadGraph(namespace);
    }, [namespace, loadGraph]);

    // Save node positions after physics stabilization
    const savePositions = useCallback((nodes) => {
        nodes.forEach(n => {
            if (n.x != null) {
                nodePositionsRef.current.set(n.id, { x: n.x, y: n.y, z: n.z });
            }
        });
    }, []);

    // Expand a single node by loading its subgraph
    const expandNode = useCallback(async (nodeId, depth = 2) => {
        try {
            const raw = await getEntitySubgraph(nodeId, depth);
            const subgraph = convertEntityStoreToGraph(raw, namespace);

            setGraphData(prev => {
                const existingIds = new Set(prev.nodes.map(n => n.id));
                const newNodes = subgraph.nodes.filter(n => !existingIds.has(n.id));
                const existingLinkKeys = new Set(
                    prev.links.map(l => `${l.source}__${l.target}`)
                );
                const newLinks = subgraph.links.filter(
                    l => !existingLinkKeys.has(`${l.source}__${l.target}`)
                );
                return {
                    ...prev,
                    nodes: [...prev.nodes, ...newNodes],
                    links: [...prev.links, ...newLinks],
                };
            });
        } catch (err) {
            console.error('Failed to expand node:', err);
        }
    }, [namespace]);

    const refresh = useCallback(() => loadGraph(namespace), [namespace, loadGraph]);

    return {
        graphData,
        namespaces,
        namespace,
        setNamespace,
        loading,
        error,
        refresh,
        expandNode,
        savePositions,
    };
}
