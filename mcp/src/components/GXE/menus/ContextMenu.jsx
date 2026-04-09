/**
 * GXE ContextMenu — self-contained right-click context menu.
 * Migrated from Nexus/ContextMenu (CONS-16).
 * No nexusStore dependency. Tailwind + lucide-react.
 */
import React, { memo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Clipboard, Copy, Trash2, Edit, Link, Eye, Search,
  BarChart3, CheckSquare, Maximize, Plus, RotateCcw,
  Focus, Network, Layers, ChevronDown,
} from 'lucide-react';

/* ── Action definitions ──────────────────────────────────── */

const CANVAS_ACTIONS = [
  { id: 'selectAll', label: 'Select All', icon: CheckSquare, shortcut: 'Ctrl+A' },
  { id: 'fitView', label: 'Fit View', icon: Maximize },
  { separator: true },
  { id: 'addNode', label: 'Add Node...', icon: Plus },
  { id: 'runAnalysis', label: 'Run Analysis', icon: BarChart3 },
];

const NODE_ACTIONS = [
  { id: 'editProperties', label: 'Edit Properties', icon: Edit },
  { id: 'copy', label: 'Copy', icon: Copy, shortcut: 'Ctrl+C' },
  { id: 'duplicate', label: 'Duplicate', icon: Clipboard },
  { separator: true },
  { id: 'connectTo', label: 'Connect to...', icon: Link },
  { id: 'drillDown', label: 'Drill Down', icon: ChevronDown },
  { id: 'focus', label: 'Focus', icon: Focus },
  { separator: true },
  { id: 'findSimilar', label: 'Find Similar', icon: Search },
  { id: 'exploreNeighbors', label: 'Explore Neighbors', icon: Network },
  { separator: true },
  { id: 'delete', label: 'Delete', icon: Trash2, danger: true, shortcut: 'Del' },
];

const EDGE_ACTIONS = [
  { id: 'editProperties', label: 'Edit Properties', icon: Edit },
  { id: 'reverseDirection', label: 'Reverse Direction', icon: RotateCcw },
  { separator: true },
  { id: 'delete', label: 'Delete', icon: Trash2, danger: true },
];

const MULTI_ACTIONS = (count) => [
  { id: 'copy', label: `Copy (${count})`, icon: Copy },
  { id: 'duplicate', label: `Duplicate (${count})`, icon: Clipboard },
  { separator: true },
  { id: 'connectAll', label: 'Connect All', icon: Link },
  { id: 'groupCluster', label: 'Group into Cluster', icon: Layers },
  { id: 'extractSubgraph', label: 'Extract SubGraph', icon: Network },
  { separator: true },
  { id: 'delete', label: `Delete (${count})`, icon: Trash2, danger: true },
];

function getActionsForTarget(target) {
  if (!target) return [];
  switch (target.type) {
    case 'canvas': return CANVAS_ACTIONS;
    case 'node':   return NODE_ACTIONS;
    case 'edge':   return EDGE_ACTIONS;
    case 'nodes':  return MULTI_ACTIONS(target.ids?.length || 0);
    default:       return [];
  }
}

/* ── Menu Item ───────────────────────────────────────────── */

const MenuItem = memo(({ item, onClick }) => {
  if (item.separator) {
    return <div className="border-t border-[#30363d] my-1" />;
  }
  const Icon = item.icon;
  return (
    <button
      onClick={() => onClick(item.id)}
      disabled={item.disabled}
      className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 transition-colors
        ${item.danger
          ? 'text-red-400 hover:bg-red-500/15'
          : 'text-gray-300 hover:bg-[#21262d]'}
        ${item.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {Icon && <Icon size={13} className="flex-shrink-0" />}
      <span className="flex-1">{item.label}</span>
      {item.shortcut && (
        <span className="text-[10px] text-gray-600 ml-2">{item.shortcut}</span>
      )}
    </button>
  );
});

/* ── ContextMenu ─────────────────────────────────────────── */

const ContextMenu = memo(({ position, target, onAction, onClose }) => {
  const ref = useRef(null);

  // Close on click outside
  useEffect(() => {
    if (!position) return;
    const handle = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handle, true);
    return () => document.removeEventListener('mousedown', handle, true);
  }, [position, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!position) return;
    const handle = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [position, onClose]);

  if (!position) return null;

  const actions = getActionsForTarget(target);
  if (actions.length === 0) return null;

  // Keep menu within viewport
  const style = { left: position.x, top: position.y };

  const handleClick = (actionId) => {
    onAction?.(actionId, target);
    onClose();
  };

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[100] bg-[#161b22] border border-[#30363d] rounded-md shadow-xl py-1 min-w-[180px]"
      style={style}
    >
      {/* Header */}
      {target?.type && target.type !== 'canvas' && (
        <div className="px-3 py-1 text-[10px] text-gray-500 border-b border-[#21262d] mb-1">
          {target.type === 'node' && `Node: ${target.nodeData?.label || target.ids?.[0] || ''}`}
          {target.type === 'nodes' && `${target.ids?.length || 0} nodes selected`}
          {target.type === 'edge' && `Edge: ${target.edgeData?.data?.label || target.ids?.[0] || ''}`}
        </div>
      )}

      {actions.map((item, i) => (
        <MenuItem key={item.id || `sep-${i}`} item={item} onClick={handleClick} />
      ))}
    </div>,
    document.body
  );
});

ContextMenu.displayName = 'ContextMenu';
export default ContextMenu;
