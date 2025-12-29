import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_SETTINGS } from '../components/Singularity/Config/ViewRegistry';

const STORAGE_KEY = 'SINGULARITY_GRAPH_SETTINGS_V1';

export const useGraphSettings = () => {
    // 1. Initialize State from LocalStorage or Default
    const [settings, setSettings] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
        } catch (e) {
            console.error('Failed to load graph settings:', e);
            return DEFAULT_SETTINGS;
        }
    });

    // 2. Persist on Change
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (e) {
            console.error('Failed to save graph settings:', e);
        }
    }, [settings]);

    // 3. Update Helpers
    const setViewMode = useCallback((modeId) => {
        setSettings(prev => ({ ...prev, activeView: modeId }));
    }, []);

    const toggleVisibility = useCallback((layerKey) => {
        setSettings(prev => ({
            ...prev,
            vis: { ...prev.vis, [layerKey]: !prev.vis[layerKey] }
        }));
    }, []);

    const updatePhysics = useCallback((param, value) => {
        setSettings(prev => ({
            ...prev,
            physics: { ...prev.physics, [param]: value }
        }));
    }, []);

    return {
        settings,
        actions: {
            setViewMode,
            toggleVisibility,
            updatePhysics
        }
    };
};
