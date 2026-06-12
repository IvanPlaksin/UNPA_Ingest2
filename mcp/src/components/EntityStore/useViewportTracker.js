import { useCallback, useEffect, useRef } from 'react';
import { useReactFlow } from 'reactflow';
import { useEntityStore } from '../../stores/entityStore.store';
import { computeLodLevel, getInitialLodLevel, setMaxPyramidLevel } from './LodController';
import { debounce } from '../../utils/debounce';

/**
 * Tracks ReactFlow viewport changes and triggers LOD-aware viewport fetches.
 * Must be rendered inside a ReactFlow provider.
 */
export function useViewportTracker(namespace, enabled = true) {
  const reactFlow          = useReactFlow();
  const lodLevel           = useEntityStore(s => s.lodLevel);
  const pyramidStatus      = useEntityStore(s => s.pyramidStatus);
  const isLoadingViewport  = useEntityStore(s => s.isLoadingViewport);
  const setLodLevel        = useEntityStore(s => s.setLodLevel);
  const fetchViewport      = useEntityStore(s => s.fetchViewport);

  const lastFetchRef = useRef({ bbox: null, level: -1 });
  const lodLevelRef  = useRef(lodLevel);
  lodLevelRef.current = lodLevel;

  // Update max level when pyramid is built
  useEffect(() => {
    if (pyramidStatus?.levels?.length) {
      const maxLevel = pyramidStatus.levels[pyramidStatus.levels.length - 1]?.level ?? 1;
      setMaxPyramidLevel(maxLevel);
    }
  }, [pyramidStatus]);

  // Convert ReactFlow screen bbox → world coordinates
  const getWorldBbox = useCallback(() => {
    const vp  = reactFlow.getViewport();
    const el  = reactFlow.getViewportElement();
    const w   = el?.clientWidth  || window.innerWidth;
    const h   = el?.clientHeight || window.innerHeight;
    // screen(0,0) → world: x = (0 - vp.x) / vp.zoom
    return {
      minX: (0    - vp.x) / vp.zoom,
      minY: (0    - vp.y) / vp.zoom,
      maxX: (w    - vp.x) / vp.zoom,
      maxY: (h    - vp.y) / vp.zoom,
    };
  }, [reactFlow]);

  // Check if viewport moved enough to warrant a new fetch (>30% of visible area)
  const shouldRefetch = useCallback((newBbox, newLevel) => {
    const last = lastFetchRef.current;
    if (last.level !== newLevel) return true;
    if (!last.bbox) return true;
    const w = last.bbox.maxX - last.bbox.minX;
    const h = last.bbox.maxY - last.bbox.minY;
    return (
      Math.abs(newBbox.minX - last.bbox.minX) > w * 0.3 ||
      Math.abs(newBbox.minY - last.bbox.minY) > h * 0.3
    );
  }, []);

  const doFetch = useCallback(async () => {
    if (!enabled || !namespace || isLoadingViewport) return;

    const vp       = reactFlow.getViewport();
    const newLevel = computeLodLevel(vp.zoom, lodLevelRef.current);
    const rawBbox  = getWorldBbox();

    // 20% prefetch padding
    const padX = (rawBbox.maxX - rawBbox.minX) * 0.2;
    const padY = (rawBbox.maxY - rawBbox.minY) * 0.2;
    const bbox = {
      minX: rawBbox.minX - padX,
      minY: rawBbox.minY - padY,
      maxX: rawBbox.maxX + padX,
      maxY: rawBbox.maxY + padY,
    };

    if (!shouldRefetch(bbox, newLevel)) return;

    lastFetchRef.current = { bbox, level: newLevel };

    if (newLevel !== lodLevelRef.current) setLodLevel(newLevel);

    await fetchViewport(namespace, bbox, newLevel, 400);
  }, [enabled, namespace, isLoadingViewport, reactFlow, getWorldBbox, shouldRefetch, setLodLevel, fetchViewport]);

  // Debounced handler for pan/zoom events
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedFetch = useCallback(debounce(doFetch, 150), [doFetch]);

  // Initial load when namespace or enabled changes
  useEffect(() => {
    if (!enabled || !namespace) return;
    const vp    = reactFlow.getViewport();
    const level = getInitialLodLevel(vp.zoom);
    setLodLevel(level);
    // Slight delay so ReactFlow has finished mounting
    const t = setTimeout(() => doFetch(), 100);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, namespace]);

  return {
    onMoveEnd:    debouncedFetch,
    onZoomChange: debouncedFetch,
    currentLevel: lodLevel,
    isLoading:    isLoadingViewport,
    refresh:      doFetch,
  };
}
