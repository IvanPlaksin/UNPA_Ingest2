/**
 * FloatingWindow - Universal draggable/resizable floating panel shell.
 *
 * Extracted from FloatingControlPanel pattern.
 * Provides: drag, resize, minimize, localStorage persistence.
 * Inner content is supplied via `children` prop.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Move, Maximize2, Minimize2, X } from 'lucide-react';

const loadSavedState = (key) => {
  try {
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved);
  } catch (_) {}
  return null;
};

const persistState = (key, state) => {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch (_) {}
};

const FloatingWindow = ({
  storageKey,
  title = 'Panel',
  icon = null,
  defaultPosition = { x: 20, y: 100 },
  defaultSize = { width: 380, height: 500 },
  minSize = { width: 280, height: 180 },
  zIndex = 50,
  headerExtra = null,
  onClose = null,
  children,
}) => {
  const saved = useRef(loadSavedState(storageKey)).current;

  const [position, setPosition] = useState(saved?.position || defaultPosition);
  const [size, setSize] = useState(saved?.size || defaultSize);
  const [isMinimized, setIsMinimized] = useState(saved?.isMinimized || false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false); // false | 'e' | 's' | 'se'

  const dragStart = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ width: 0, height: 0, x: 0, y: 0 });

  // Persist state changes
  useEffect(() => {
    const t = setTimeout(() => persistState(storageKey, { position, size, isMinimized }), 100);
    return () => clearTimeout(t);
  }, [storageKey, position, size, isMinimized]);

  // ── Drag ──
  const handleDragStart = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;
    const move = (e) => setPosition({
      x: Math.max(0, e.clientX - dragStart.current.x),
      y: Math.max(0, e.clientY - dragStart.current.y),
    });
    const up = () => setIsDragging(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [isDragging]);

  // ── Resize (directional: 'e' = right edge, 's' = bottom edge, 'se' = corner) ──
  const handleResizeStart = useCallback((e, direction = 'se') => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(direction);
    resizeStart.current = { width: size.width, height: size.height, x: e.clientX, y: e.clientY };
  }, [size]);

  useEffect(() => {
    if (!isResizing) return;
    const move = (e) => {
      const dx = e.clientX - resizeStart.current.x;
      const dy = e.clientY - resizeStart.current.y;
      setSize({
        width: (isResizing === 'se' || isResizing === 'e')
          ? Math.max(minSize.width, resizeStart.current.width + dx)
          : resizeStart.current.width,
        height: (isResizing === 'se' || isResizing === 's')
          ? Math.max(minSize.height, resizeStart.current.height + dy)
          : resizeStart.current.height,
      });
    };
    const up = () => setIsResizing(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [isResizing, minSize.width, minSize.height]);

  return (
    <div
      className="fixed bg-[#161b22] border border-[#30363d] rounded-lg shadow-2xl flex flex-col overflow-hidden"
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: isMinimized ? 44 : size.height,
        zIndex,
        transition: isDragging || isResizing ? 'none' : 'height 0.2s ease',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-[#0d1117] border-b border-[#30363d] cursor-move select-none flex-shrink-0"
        onMouseDown={handleDragStart}
      >
        <Move className="w-4 h-4 text-gray-500 flex-shrink-0" />
        {icon && <span className="text-gray-400 flex-shrink-0">{icon}</span>}
        <span className="text-sm font-medium text-gray-300 flex-1 truncate">{title}</span>
        {headerExtra}
        <button onClick={() => setIsMinimized(!isMinimized)} className="p-1 hover:bg-[#30363d] rounded text-gray-400">
          {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
        </button>
        {onClose && (
          <button onClick={onClose} className="p-1 hover:bg-[#30363d] rounded text-gray-400">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Content */}
      {!isMinimized && (
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      )}

      {/* Resize handles — right edge, bottom edge, corner grip */}
      {!isMinimized && (
        <>
          <div
            className="absolute right-0 top-10 bottom-0 w-1.5 cursor-e-resize hover:bg-[#58a6ff]/10 transition-colors"
            onMouseDown={(e) => handleResizeStart(e, 'e')}
          />
          <div
            className="absolute bottom-0 left-0 right-0 h-1.5 cursor-s-resize hover:bg-[#58a6ff]/10 transition-colors"
            onMouseDown={(e) => handleResizeStart(e, 's')}
          />
          <div
            className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize z-10 opacity-40 hover:opacity-100 transition-opacity"
            onMouseDown={(e) => handleResizeStart(e, 'se')}
          >
            <svg width="20" height="20" viewBox="0 0 20 20">
              <line x1="16" y1="20" x2="20" y2="16" stroke="#6b7280" strokeWidth="1.5" />
              <line x1="11" y1="20" x2="20" y2="11" stroke="#6b7280" strokeWidth="1.5" />
              <line x1="6" y1="20" x2="20" y2="6" stroke="#6b7280" strokeWidth="1.5" />
            </svg>
          </div>
        </>
      )}
    </div>
  );
};

export default FloatingWindow;
