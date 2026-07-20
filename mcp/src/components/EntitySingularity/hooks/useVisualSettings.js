import { useState, useCallback } from 'react';

const STORAGE_KEY = 'entity-singularity-visual-v1';

export const VISUAL_DEFAULTS = {
    bloom:  { intensity: 1.2, threshold: 0.1, smoothing: 0.9 },
    nodes:  { opacity: 0.85, sizeMultiplier: 1.0, emissiveIntensity: 0.25, degreeScale: 1.5 },
    edges:  { opacity: 0.15, weightFade: 0 },
    fog:    { enabled: true },
    selection: { depth: 2 },
};

function load() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return VISUAL_DEFAULTS;
        const parsed = JSON.parse(saved);
        // Deep merge so new default keys are always present
        return {
            bloom:     { ...VISUAL_DEFAULTS.bloom,     ...parsed.bloom     },
            nodes:     { ...VISUAL_DEFAULTS.nodes,     ...parsed.nodes     },
            edges:     { ...VISUAL_DEFAULTS.edges,     ...parsed.edges     },
            fog:       { ...VISUAL_DEFAULTS.fog,       ...parsed.fog       },
            selection: { ...VISUAL_DEFAULTS.selection, ...parsed.selection },
        };
    } catch { return VISUAL_DEFAULTS; }
}

/**
 * Manages visual/shader settings with localStorage persistence.
 * update('bloom.intensity', 1.5) — dot-path update
 */
export function useVisualSettings() {
    const [settings, setSettings] = useState(load);

    const update = useCallback((dotPath, value) => {
        const [section, key] = dotPath.split('.');
        setSettings(prev => {
            const next = {
                ...prev,
                [section]: { ...prev[section], [key]: value },
            };
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
            return next;
        });
    }, []);

    const reset = useCallback(() => {
        setSettings(VISUAL_DEFAULTS);
        try { localStorage.removeItem(STORAGE_KEY); } catch {}
    }, []);

    return { settings, update, reset };
}
