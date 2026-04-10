/**
 * GXEToolCatalogWrapper (Option A — GXE Full Migration)
 *
 * Wraps the UnifiedToolCatalog in the GXE's FloatingWindow so it behaves
 * exactly like the original FloatingToolCatalog: draggable, resizable,
 * pinnable, with the same storage key and keyboard shortcut.
 *
 * Replaces FloatingToolCatalog in GXEVisualizerPage.
 */

import React, { useEffect } from 'react';
import { BookOpen } from 'lucide-react';
import FloatingWindow from '../GXE/FloatingWindow';
import UnifiedToolCatalog from './UnifiedToolCatalog';
import { useCatalogStore } from '../../stores/catalogStore';

const GXEToolCatalogWrapper = ({ onAddNodeToCanvas }) => {
  const isOpen = useCatalogStore(s => s.isOpen);
  const position = useCatalogStore(s => s.position);
  const size = useCatalogStore(s => s.size);
  const isPinned = useCatalogStore(s => s.isPinned);
  const close = useCatalogStore(s => s.close);
  const toggle = useCatalogStore(s => s.toggle);
  const loadCatalog = useCatalogStore(s => s.loadCatalog);

  // Load tools on first mount so the catalog has content when opened
  useEffect(() => {
    loadCatalog();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl+K / Cmd+K keyboard shortcut (same as original)
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);

  if (!isOpen) return null;

  // Ensure sane defaults even if store has zeros
  const safePosition = (position && position.x >= 0) ? position : { x: 100, y: 80 };
  const safeSize = (size && size.width > 100 && size.height > 100) ? size : { width: 420, height: 600 };

  return (
    <FloatingWindow
      storageKey="gxe-tool-catalog"
      title="Tool Catalog"
      icon={<BookOpen className="w-4 h-4" />}
      defaultPosition={safePosition}
      defaultSize={safeSize}
      minSize={{ width: 360, height: 450 }}
      zIndex={isPinned ? 60 : 50}
      onClose={close}
      headerExtra={
        <button
          onClick={(e) => { e.stopPropagation(); useCatalogStore.getState().togglePin(); }}
          className={`p-1 rounded hover:bg-[#30363d] ${isPinned ? 'text-yellow-400' : 'text-gray-500'}`}
          title={isPinned ? 'Unpin' : 'Pin (keep on top)'}
        >
          📌
        </button>
      }
    >
      <UnifiedToolCatalog
        mode="gxe"
        floating={false}  // FloatingWindow handles the floating — catalog is embedded inside
        showAI={true}
        onToolDragStart={(item) => {
          useCatalogStore.getState().addRecentTool(item.id);
        }}
      />
    </FloatingWindow>
  );
};

export default GXEToolCatalogWrapper;
