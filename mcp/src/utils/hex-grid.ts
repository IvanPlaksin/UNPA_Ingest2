/**
 * hex-grid.ts — HexGrid State Manager (Step 1.2)
 *
 * Manages hex cell states: occupied (nodes), routing tracks (edges), capacity.
 * Provides placement validation with minGap and nearest-free-cell search.
 */

import {
  HexCoord,
  HexGridConfig,
  hexKey,
  parseHexKey,
  hexDistance,
  hexNeighbors,
  hexRing,
} from './hex-coords';

// ── Types ────────────────────────────────────────────────────────────────

export interface HexCell {
  coord: HexCoord;
  state: 'empty' | 'occupied' | 'reserved';
  nodeId?: string;
  routingTracks: string[];   // edge IDs passing through
  capacity: number;          // max routing tracks
}

export interface HexGridOptions {
  config: HexGridConfig;
  defaultCapacity?: number;  // default: 3
}

// ── HexGrid Class ────────────────────────────────────────────────────────

export class HexGrid {
  private cells: Map<string, HexCell>;
  private config: HexGridConfig;
  private defaultCapacity: number;
  private nodeToHex: Map<string, string>; // nodeId → hexKey

  constructor(options: HexGridOptions) {
    this.cells = new Map();
    this.config = options.config;
    this.defaultCapacity = options.defaultCapacity ?? 3;
    this.nodeToHex = new Map();
  }

  // ── Config Access ────────────────────────────────────────────────────

  getConfig(): HexGridConfig {
    return this.config;
  }

  // ── Cell Access ──────────────────────────────────────────────────────

  /** Get cell at coord, creating an empty one if it doesn't exist */
  getCell(coord: HexCoord): HexCell {
    const key = hexKey(coord);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = {
        coord: { ...coord },
        state: 'empty',
        routingTracks: [],
        capacity: this.defaultCapacity,
      };
      this.cells.set(key, cell);
    }
    return cell;
  }

  /** Check if a cell exists (without creating it) */
  hasCell(coord: HexCoord): boolean {
    return this.cells.has(hexKey(coord));
  }

  /** Get all existing cells */
  getAllCells(): HexCell[] {
    return Array.from(this.cells.values());
  }

  // ── Node Operations ─────────────────────────────────────────────────

  /** Place a node in a cell. Returns false if already occupied. */
  placeNode(coord: HexCoord, nodeId: string): boolean {
    const cell = this.getCell(coord);
    if (cell.state === 'occupied') {
      return false;
    }

    cell.state = 'occupied';
    cell.nodeId = nodeId;
    this.nodeToHex.set(nodeId, hexKey(coord));
    return true;
  }

  /** Remove a node by its ID. Returns false if not found. */
  removeNode(nodeId: string): boolean {
    const key = this.nodeToHex.get(nodeId);
    if (!key) return false;

    const cell = this.cells.get(key);
    if (cell) {
      cell.state = 'empty';
      cell.nodeId = undefined;
    }
    this.nodeToHex.delete(nodeId);
    return true;
  }

  /** Get the hex coordinate of a placed node */
  getNodeHex(nodeId: string): HexCoord | null {
    const key = this.nodeToHex.get(nodeId);
    if (!key) return null;
    return parseHexKey(key);
  }

  /**
   * Check if a node can be placed at coord with minGap empty cells
   * between it and any other occupied cell.
   */
  canPlaceNode(coord: HexCoord, minGap: number): boolean {
    const cell = this.getCell(coord);
    if (cell.state === 'occupied') return false;

    for (const occupied of this.getOccupiedCells()) {
      if (hexDistance(coord, occupied.coord) <= minGap) {
        return false;
      }
    }
    return true;
  }

  /**
   * Find the nearest free cell to target that satisfies minGap.
   * Uses BFS in expanding hex rings. Caches occupied list for performance.
   */
  findNearestFreeCell(
    target: HexCoord,
    minGap: number,
    maxSearchRadius: number = 10,
  ): HexCoord | null {
    // Cache occupied cells once for all checks in this search
    const occupied = this.getOccupiedCells();
    for (let radius = 0; radius <= maxSearchRadius; radius++) {
      const ring = hexRing(target, radius);
      for (const coord of ring) {
        if (this._canPlaceWithCache(coord, minGap, occupied)) {
          return coord;
        }
      }
    }
    return null;
  }

  /** canPlaceNode with pre-cached occupied list (avoids repeated getAllCells filter) */
  private _canPlaceWithCache(coord: HexCoord, minGap: number, occupied: HexCell[]): boolean {
    const cell = this.getCell(coord);
    if (cell.state === 'occupied') return false;
    for (const oc of occupied) {
      if (hexDistance(coord, oc.coord) <= minGap) return false;
    }
    return true;
  }

  // ── Routing Operations ──────────────────────────────────────────────

  /** Add a routing track to a cell. Returns false if capacity exceeded. */
  addRoute(coord: HexCoord, edgeId: string): boolean {
    const cell = this.getCell(coord);
    if (cell.state === 'occupied') return false;
    if (cell.routingTracks.length >= cell.capacity) return false;

    if (!cell.routingTracks.includes(edgeId)) {
      cell.routingTracks.push(edgeId);
      if (cell.state === 'empty') {
        cell.state = 'reserved';
      }
    }
    return true;
  }

  /** Remove a specific edge route from all cells */
  removeRoute(edgeId: string): void {
    for (const cell of this.cells.values()) {
      const idx = cell.routingTracks.indexOf(edgeId);
      if (idx !== -1) {
        cell.routingTracks.splice(idx, 1);
        if (cell.routingTracks.length === 0 && cell.state === 'reserved') {
          cell.state = 'empty';
        }
      }
    }
  }

  /** Clear all routing tracks (for full recalculation) */
  clearAllRoutes(): void {
    for (const cell of this.cells.values()) {
      cell.routingTracks = [];
      if (cell.state === 'reserved') {
        cell.state = 'empty';
      }
    }
  }

  /** Check if a cell can accept another route */
  isRoutable(coord: HexCoord): boolean {
    const cell = this.getCell(coord);
    if (cell.state === 'occupied') return false;
    if (cell.routingTracks.length >= cell.capacity) return false;
    return true;
  }

  /** Get occupancy ratio 0.0 - 1.0 (for A* cost weighting) */
  getOccupancy(coord: HexCoord): number {
    const cell = this.getCell(coord);
    if (cell.state === 'occupied') return 1.0;
    if (cell.capacity === 0) return 1.0;
    return cell.routingTracks.length / cell.capacity;
  }

  /** Get the number of routes currently in a cell */
  getRouteCount(coord: HexCoord): number {
    const cell = this.getCell(coord);
    return cell.routingTracks.length;
  }

  // ── Queries ─────────────────────────────────────────────────────────

  /** Get all cells occupied by nodes */
  getOccupiedCells(): HexCell[] {
    return this.getAllCells().filter(c => c.state === 'occupied');
  }

  /** Get all cells that have routing tracks */
  getRoutingCells(): HexCell[] {
    return this.getAllCells().filter(c => c.routingTracks.length > 0);
  }

  /**
   * Quick check if a straight hex-line path is clear of occupied cells.
   * Does NOT guarantee A* routability — just a heuristic.
   */
  isPathClear(from: HexCoord, to: HexCoord): boolean {
    // Use hexLine for the path cells
    const dist = hexDistance(from, to);
    if (dist <= 1) return true;

    // Check intermediate cells (exclude from and to)
    for (let i = 1; i < dist; i++) {
      const t = i / dist;
      const q = from.q + (to.q - from.q) * t;
      const r = from.r + (to.r - from.r) * t;
      // Inline hexRound
      const s = -q - r;
      let rq = Math.round(q);
      let rr = Math.round(r);
      let rs = Math.round(s);
      const dq = Math.abs(rq - q);
      const dr = Math.abs(rr - r);
      const ds = Math.abs(rs - s);
      if (dq > dr && dq > ds) rq = -rr - rs;
      else if (dr > ds) rr = -rq - rs;
      else rs = -rq - rr;

      const cell = this.getCell({ q: rq, r: rr, s: rs });
      if (cell.state === 'occupied') return false;
    }
    return true;
  }

  // ── Utilities ───────────────────────────────────────────────────────

  /** Clear all cells, nodes, and routes */
  clear(): void {
    this.cells.clear();
    this.nodeToHex.clear();
  }

  /** Create a deep clone of this grid */
  clone(): HexGrid {
    const cloned = new HexGrid({
      config: { ...this.config },
      defaultCapacity: this.defaultCapacity,
    });

    for (const [key, cell] of this.cells) {
      cloned.cells.set(key, {
        coord: { ...cell.coord },
        state: cell.state,
        nodeId: cell.nodeId,
        routingTracks: [...cell.routingTracks],
        capacity: cell.capacity,
      });
    }

    for (const [nodeId, key] of this.nodeToHex) {
      cloned.nodeToHex.set(nodeId, key);
    }

    return cloned;
  }

  /** Serialize grid state for debug/save */
  toJSON(): object {
    const cells: Record<string, object> = {};
    for (const [key, cell] of this.cells) {
      if (cell.state !== 'empty' || cell.routingTracks.length > 0) {
        cells[key] = {
          state: cell.state,
          nodeId: cell.nodeId,
          routes: cell.routingTracks,
        };
      }
    }
    return {
      config: this.config,
      defaultCapacity: this.defaultCapacity,
      cellCount: this.cells.size,
      occupiedCount: this.getOccupiedCells().length,
      routingCount: this.getRoutingCells().length,
      cells,
    };
  }

  /** Debug string representation */
  toDebugString(): string {
    const occupied = this.getOccupiedCells();
    const routing = this.getRoutingCells();
    return [
      `HexGrid { cells: ${this.cells.size}, occupied: ${occupied.length}, routing: ${routing.length} }`,
      ...occupied.map(c => `  [${hexKey(c.coord)}] node=${c.nodeId}`),
      ...routing.map(c => `  [${hexKey(c.coord)}] routes=${c.routingTracks.join(',')}`),
    ].join('\n');
  }
}
