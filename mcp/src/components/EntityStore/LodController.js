/**
 * LodController — maps zoom factor to pyramid level with hysteresis.
 *
 * Thresholds (calibrated for 10000×10000 world coords, 78–1M nodes):
 *   zoom >= 0.9 → L0 (entities)
 *   zoom 0.4-0.9 → L1 (communities)
 *   zoom 0.15-0.4 → L2 (super-communities)
 *   zoom < 0.15 → L3 (domains)
 *
 * Hysteresis: enter level when zoom > up threshold, leave when zoom < down threshold.
 */

// [down, up] — enter this level when zoom crosses up threshold from above,
//              leave when zoom drops below down threshold
const THRESHOLDS = {
  0: { down: 0.7, up: 0.9 },
  1: { down: 0.3, up: 0.5 },
  2: { down: 0.1, up: 0.2 },
  3: { down: 0,   up: 0.05 },
};

let _maxLevel = 1;

export function setMaxPyramidLevel(level) {
  _maxLevel = Math.max(0, Math.min(3, level));
}

/**
 * Compute new LOD level for given zoom with hysteresis.
 * @param {number} zoom         ReactFlow zoom (1 = 100%)
 * @param {number} currentLevel current displayed level
 * @returns {number}
 */
export function computeLodLevel(zoom, currentLevel) {
  // Can we go to a more detailed level (lower number)?
  if (currentLevel > 0) {
    const finerLevel = currentLevel - 1;
    if (zoom >= THRESHOLDS[finerLevel].up) return finerLevel;
  }
  // Should we go to a coarser level (higher number)?
  if (currentLevel < _maxLevel) {
    if (zoom < THRESHOLDS[currentLevel].down) return currentLevel + 1;
  }
  return currentLevel;
}

/**
 * Compute initial level for zoom without hysteresis (used on first render).
 */
export function getInitialLodLevel(zoom) {
  if (zoom >= THRESHOLDS[0].up) return 0;
  if (zoom >= THRESHOLDS[1].up) return Math.min(1, _maxLevel);
  if (zoom >= THRESHOLDS[2].up) return Math.min(2, _maxLevel);
  return Math.min(3, _maxLevel);
}

export const LEVEL_NAMES = ['Entities', 'Communities', 'Regions', 'Domains'];
