import { useState, useMemo, useCallback } from 'react';

const STORAGE_KEY = 'entity-singularity-filter-v1';

const DEFAULTS = {
    search:      '',
    types:       [],   // empty = all types shown
    minMentions: 0,
    hideIsolated: false,
    weightSum:   false, // merge parallel edges and encode weight visually
};

function load() {
    try {
        const s = localStorage.getItem(STORAGE_KEY);
        return s ? { ...DEFAULTS, ...JSON.parse(s) } : DEFAULTS;
    } catch { return DEFAULTS; }
}

function save(filter) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(filter)); } catch {}
}

/**
 * Manages node filter state and computes filtered nodes/links.
 *
 * Returns:
 *   filter           — current filter state
 *   update(key, val) — update a single filter key
 *   resetFilter()    — restore defaults
 *   filteredNodes    — nodes passing all filters
 *   filteredLinks    — links where both endpoints pass
 *   availableTypes   — sorted unique canonicalTypes in the current data
 *   stats            — { total, visible, hidden, isolated }
 */
export function useNodeFilter(nodes, links) {
    const [filter, setFilter] = useState(load);

    const update = useCallback((key, value) => {
        setFilter(prev => {
            const next = { ...prev, [key]: value };
            save(next);
            return next;
        });
    }, []);

    const resetFilter = useCallback(() => {
        setFilter(DEFAULTS);
        save(DEFAULTS);
    }, []);

    // Set of node IDs that have at least one connection
    const connectedIds = useMemo(() => {
        const ids = new Set();
        links.forEach(l => {
            ids.add(typeof l.source === 'object' ? l.source.id : l.source);
            ids.add(typeof l.target === 'object' ? l.target.id : l.target);
        });
        return ids;
    }, [links]);

    // Unique types available in current dataset
    const availableTypes = useMemo(() => {
        const types = new Set();
        nodes.forEach(n => { if (n.canonicalType) types.add(n.canonicalType); });
        return [...types].sort();
    }, [nodes]);

    // Apply all filters
    const filteredNodes = useMemo(() => {
        const searchLower = filter.search.trim().toLowerCase();
        const hasTypeFilter = filter.types.length > 0;

        return nodes.filter(n => {
            if (filter.hideIsolated && !connectedIds.has(n.id)) return false;
            if (hasTypeFilter && !filter.types.includes(n.canonicalType)) return false;
            if (filter.minMentions > 0 && (n.mentionCount || 0) < filter.minMentions) return false;
            if (searchLower && !n.name?.toLowerCase().includes(searchLower)) return false;
            return true;
        });
    }, [nodes, filter, connectedIds]);

    // Remove links whose endpoints were filtered out
    const filteredNodeIds = useMemo(() => new Set(filteredNodes.map(n => n.id)), [filteredNodes]);

    const filteredLinks = useMemo(() => links.filter(l => {
        const s = typeof l.source === 'object' ? l.source.id : l.source;
        const t = typeof l.target === 'object' ? l.target.id : l.target;
        return filteredNodeIds.has(s) && filteredNodeIds.has(t);
    }), [links, filteredNodeIds]);

    const stats = useMemo(() => ({
        total:    nodes.length,
        visible:  filteredNodes.length,
        hidden:   nodes.length - filteredNodes.length,
        isolated: nodes.length - connectedIds.size,
    }), [nodes.length, filteredNodes.length, connectedIds.size]);

    return {
        filter, update, resetFilter,
        filteredNodes, filteredLinks,
        availableTypes, stats,
    };
}
