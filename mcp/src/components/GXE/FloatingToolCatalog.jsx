/**
 * FloatingToolCatalog — GXE tool catalog with 4-level hierarchy.
 *
 * Hierarchy (from MCP Registry):
 *   Level 1 — Primitives (17): core data operations
 *   Level 2 — Domain (59): text, extraction, vector, graph, ai, data, catalog, control
 *   Level 3 — Patterns (18): composite (RAG, pipeline, parallel, retry)
 *   Level 4 — Meta (6): create, compose, introspect, optimize
 *
 * Features:
 * - 4-level tabs + category tree within each level
 * - Search/filter by name, description, tags, executorId
 * - Pinned + Recent sections
 * - Tool detail panel with input/output schemas
 * - Drag-to-canvas + [+ Add] button
 * - Keyboard: Ctrl+K / Cmd+K to toggle
 *
 * Style: GXE GitHub dark theme (#0d1117 / #161b22 / #30363d)
 */

import React, { useEffect, useMemo, useCallback } from 'react';
import {
  Search, Pin, PinOff, Plus, ChevronRight, ChevronDown,
  Info, GripVertical, BookOpen, X, Star, Clock, Shield, Zap,
} from 'lucide-react';
import FloatingWindow from './FloatingWindow';
import { useCatalogStore, LEVEL_META } from '../../stores/catalogStore';

// ─── Sub-components ─────────────────────────────────────────────────────────

const LevelBadge = ({ level }) => {
  const meta = LEVEL_META[level];
  if (!meta) return null;
  return (
    <span
      className="text-[9px] font-bold px-1 py-0 rounded"
      style={{ backgroundColor: meta.color + '20', color: meta.color }}
      title={`Level ${level}: ${meta.label}`}
    >
      L{level}
    </span>
  );
};

const ToolItem = ({ tool, isSelected, isPinned, onSelect, onPin, onAdd, showLevel }) => {
  const handleDragStart = useCallback((e) => {
    e.dataTransfer.setData('application/gxe-tool', JSON.stringify({
      toolId: tool.id,
      executorId: tool.executorId || tool.id,
      name: tool.name,
      category: tool.category,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
    }));
    e.dataTransfer.effectAllowed = 'copy';
  }, [tool]);

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 text-xs cursor-pointer group
        ${isSelected ? 'bg-[#1f6feb]/20 text-blue-300' : 'text-gray-300 hover:bg-[#30363d]/60'}`}
      onClick={() => onSelect(tool.id)}
    >
      <div
        className="cursor-grab opacity-30 group-hover:opacity-80 flex-shrink-0"
        draggable
        onDragStart={handleDragStart}
        title="Drag to canvas"
      >
        <GripVertical className="w-3 h-3" />
      </div>

      <span className="flex-1 truncate">{tool.name}</span>

      {showLevel && <LevelBadge level={tool.level} />}

      {tool.safetyLevel === 'REQUIRES_APPROVAL' && (
        <Shield className="w-3 h-3 text-amber-400 opacity-60 flex-shrink-0" title="Requires Approval" />
      )}

      {tool.requiresLLM && (
        <span className="text-[10px] text-purple-400 opacity-60" title="Requires LLM">AI</span>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); onSelect(tool.id); }}
        className="p-0.5 opacity-0 group-hover:opacity-70 hover:!opacity-100 hover:bg-[#30363d] rounded"
        title="Details"
      >
        <Info className="w-3 h-3" />
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); onPin(tool.id); }}
        className={`p-0.5 rounded ${isPinned ? 'text-yellow-400 opacity-80' : 'opacity-0 group-hover:opacity-70'} hover:!opacity-100 hover:bg-[#30363d]`}
        title={isPinned ? 'Unpin' : 'Pin'}
      >
        {isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); onAdd(tool); }}
        className="p-0.5 opacity-0 group-hover:opacity-70 hover:!opacity-100 hover:bg-[#30363d] rounded text-green-400"
        title="Add to graph"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
};

const CategoryRow = ({ category, tools, isExpanded, onToggle, selectedTool, pinnedTools, onSelectTool, onPinTool, onAddTool, showLevel }) => {
  const count = tools.length;
  if (count === 0) return null;

  return (
    <div>
      <div
        className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-[#30363d]/40 select-none"
        onClick={onToggle}
      >
        {isExpanded
          ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />}
        <span className="text-sm flex-shrink-0">{category.emoji}</span>
        <span className="text-xs font-medium text-gray-300 flex-1">{category.name}</span>
        <span className="text-[10px] text-gray-500 tabular-nums">{count}</span>
      </div>
      {isExpanded && (
        <div className="ml-3 border-l border-[#30363d]/50">
          {tools.map(tool => (
            <ToolItem
              key={tool.id}
              tool={tool}
              isSelected={selectedTool === tool.id}
              isPinned={pinnedTools.includes(tool.id)}
              onSelect={onSelectTool}
              onPin={onPinTool}
              onAdd={onAddTool}
              showLevel={showLevel}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const ToolDetailPanel = ({ tool, category, isPinned, onPin, onAdd, onClose }) => {
  if (!tool) return null;

  let inputFields = [];
  let outputFields = [];
  try {
    const inp = JSON.parse(tool.inputSchema || '{}');
    inputFields = Object.keys(inp.properties || {});
  } catch {}
  try {
    const out = JSON.parse(tool.outputSchema || '{}');
    outputFields = Object.keys(out.properties || {});
  } catch {}

  return (
    <div className="border-t border-[#30363d] bg-[#0d1117] p-3 flex-shrink-0">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">{category?.emoji}</span>
        <span className="text-sm font-medium text-gray-200 flex-1">{tool.name}</span>
        <LevelBadge level={tool.level} />
        <button onClick={onClose} className="p-0.5 hover:bg-[#30363d] rounded text-gray-500">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <p className="text-xs text-gray-400 mb-2 leading-relaxed">{tool.description}</p>

      <div className="flex gap-4 text-[10px] text-gray-500 mb-2">
        <div>
          <span className="text-gray-600">Input: </span>
          <span className="text-gray-400">{inputFields.join(', ') || 'none'}</span>
        </div>
        <div>
          <span className="text-gray-600">Output: </span>
          <span className="text-gray-400">{outputFields.join(', ') || 'none'}</span>
        </div>
      </div>

      {tool.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {tool.tags.map(tag => (
            <span key={tag} className="px-1.5 py-0 text-[10px] rounded bg-[#21262d] text-gray-500 border border-[#30363d]">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1 text-[10px] text-gray-500 mb-1">
        <span className="text-gray-600">Executor:</span>
        <code className="text-cyan-400/70">{tool.executorId || tool.id}</code>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-gray-500 mb-3">
        {tool.safetyLevel && (
          <span className={tool.safetyLevel === 'AUTO' ? 'text-green-400' : 'text-amber-400'}>
            {tool.safetyLevel}
          </span>
        )}
        {tool.requiresNetwork && <span className="text-amber-400">NET</span>}
        {tool.wrapsService && <span className="text-cyan-400/60">{tool.wrapsService}</span>}
        {tool.composedOf?.length > 0 && (
          <span className="text-purple-400" title={tool.composedOf.join(' → ')}>
            {tool.composedOf.length} composed
          </span>
        )}
      </div>

      <div className="flex gap-1.5">
        <button
          onClick={() => onAdd(tool)}
          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-[#238636] hover:bg-[#2ea043] text-white"
        >
          <Plus className="w-3 h-3" /> Add to Graph
        </button>
        <button
          onClick={() => onPin(tool.id)}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded border
            ${isPinned
              ? 'border-yellow-600/50 text-yellow-400 hover:bg-yellow-900/20'
              : 'border-[#30363d] text-gray-400 hover:bg-[#30363d]'}`}
        >
          {isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
          {isPinned ? 'Unpin' : 'Pin'}
        </button>
      </div>
    </div>
  );
};

// ─── Level Tab Bar ──────────────────────────────────────────────────────────

const LevelTabs = ({ selectedLevel, onSelectLevel, toolCounts }) => (
  <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[#30363d] flex-shrink-0">
    <button
      onClick={() => onSelectLevel(null)}
      className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors
        ${selectedLevel === null
          ? 'bg-[#1f6feb] text-white'
          : 'text-gray-400 hover:text-gray-200 hover:bg-[#30363d]'}`}
    >
      All ({toolCounts.total})
    </button>
    {[1, 2, 3, 4].map(level => {
      const meta = LEVEL_META[level];
      const count = toolCounts[level] || 0;
      if (count === 0) return null;
      return (
        <button
          key={level}
          onClick={() => onSelectLevel(selectedLevel === level ? null : level)}
          className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors flex items-center gap-1
            ${selectedLevel === level
              ? 'text-white'
              : 'text-gray-400 hover:text-gray-200 hover:bg-[#30363d]'}`}
          style={selectedLevel === level ? { backgroundColor: meta.color + '40' } : undefined}
          title={meta.description}
        >
          <span style={{ color: meta.color }}>L{level}</span>
          <span>{count}</span>
        </button>
      );
    })}
  </div>
);

// ─── Main Component ─────────────────────────────────────────────────────────

const FloatingToolCatalog = ({ onAddNodeToCanvas }) => {
  const {
    isOpen, position, size, isPinned,
    searchQuery, selectedLevel, selectedTool, expandedCategories,
    categories, tools, pinnedTools, recentTools,
    toggle, close,
    setSearchQuery, selectLevel, selectTool, toggleCategory,
    togglePinTool, addRecentTool, loadCatalog,
  } = useCatalogStore();

  // Load data on mount
  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  // Keyboard shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);

  // Filter tools by search + level
  const filteredTools = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return tools.filter(t => {
      if (selectedLevel && t.level !== selectedLevel) return false;
      if (!searchQuery) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.tags?.some(tag => tag.toLowerCase().includes(q)) ||
        (t.executorId || t.id)?.toLowerCase().includes(q)
      );
    });
  }, [tools, searchQuery, selectedLevel]);

  // Tool counts per level
  const toolCounts = useMemo(() => {
    const counts = { total: tools.length, 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const t of tools) counts[t.level] = (counts[t.level] || 0) + 1;
    return counts;
  }, [tools]);

  // Group filtered tools by category
  const toolsByCategory = useMemo(() => {
    const map = {};
    for (const cat of categories) {
      map[cat.id] = filteredTools.filter(t => t.category === cat.id);
    }
    return map;
  }, [categories, filteredTools]);

  const totalMatches = filteredTools.length;

  // Pinned/Recent tool objects
  const pinnedToolObjects = useMemo(() =>
    pinnedTools.map(id => tools.find(t => t.id === id)).filter(Boolean),
    [pinnedTools, tools]
  );
  const recentToolObjects = useMemo(() =>
    recentTools.map(id => tools.find(t => t.id === id)).filter(Boolean).slice(0, 5),
    [recentTools, tools]
  );

  const selectedToolObj = useMemo(() =>
    tools.find(t => t.id === selectedTool) || null,
    [tools, selectedTool]
  );
  const selectedToolCategory = useMemo(() =>
    selectedToolObj ? categories.find(c => c.id === selectedToolObj.category) : null,
    [selectedToolObj, categories]
  );

  // Add node to canvas handler
  const handleAddTool = useCallback((tool) => {
    addRecentTool(tool.id);
    if (onAddNodeToCanvas) {
      onAddNodeToCanvas({
        toolId: tool.id,
        executorId: tool.executorId || tool.id,
        name: tool.name,
        category: tool.category,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
      });
    }
  }, [addRecentTool, onAddNodeToCanvas]);

  // Sort categories: by level then name
  const sortedCategories = useMemo(() =>
    [...categories].sort((a, b) => (a.level || 2) - (b.level || 2) || a.name.localeCompare(b.name)),
    [categories]
  );

  if (!isOpen) return null;

  // Show level badges in "All" mode (no level filter)
  const showLevelBadges = !selectedLevel;

  return (
    <FloatingWindow
      storageKey="gxe-tool-catalog"
      title="Tool Catalog"
      icon={<BookOpen className="w-4 h-4" />}
      defaultPosition={position}
      defaultSize={size}
      minSize={{ width: 320, height: 400 }}
      zIndex={isPinned ? 60 : 50}
      onClose={close}
      headerExtra={
        <button
          onClick={(e) => { e.stopPropagation(); useCatalogStore.getState().togglePin(); }}
          className={`p-1 rounded ${isPinned ? 'text-yellow-400' : 'text-gray-500 hover:text-gray-300'} hover:bg-[#30363d]`}
          title={isPinned ? 'Unpin window' : 'Pin window on top'}
        >
          <Pin className="w-3.5 h-3.5" />
        </button>
      }
    >
      <div className="flex flex-col h-full">
        {/* Level tabs */}
        <LevelTabs
          selectedLevel={selectedLevel}
          onSelectLevel={selectLevel}
          toolCounts={toolCounts}
        />

        {/* Search bar */}
        <div className="px-3 py-2 border-b border-[#30363d] flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tools... (name, tags, executor)"
              className="w-full pl-7 pr-7 py-1.5 text-xs bg-[#0d1117] border border-[#30363d] rounded text-gray-300 placeholder-gray-600 focus:outline-none focus:border-[#388bfd]"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {(searchQuery || selectedLevel) && (
            <div className="text-[10px] text-gray-500 mt-1 ml-1">
              {totalMatches} {totalMatches === 1 ? 'tool' : 'tools'}
              {selectedLevel ? ` in Level ${selectedLevel}` : ''}
              {searchQuery ? ` matching "${searchQuery}"` : ''}
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Pinned section */}
          {pinnedToolObjects.length > 0 && !searchQuery && !selectedLevel && (
            <div className="border-b border-[#30363d]/50">
              <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                <Star className="w-3 h-3 text-yellow-500" />
                Pinned
              </div>
              {pinnedToolObjects.map(tool => (
                <ToolItem
                  key={tool.id}
                  tool={tool}
                  isSelected={selectedTool === tool.id}
                  isPinned={true}
                  onSelect={selectTool}
                  onPin={togglePinTool}
                  onAdd={handleAddTool}
                  showLevel={true}
                />
              ))}
            </div>
          )}

          {/* Recent section */}
          {recentToolObjects.length > 0 && !searchQuery && !selectedLevel && (
            <div className="border-b border-[#30363d]/50">
              <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                <Clock className="w-3 h-3" />
                Recent
              </div>
              {recentToolObjects.map(tool => (
                <ToolItem
                  key={tool.id}
                  tool={tool}
                  isSelected={selectedTool === tool.id}
                  isPinned={pinnedTools.includes(tool.id)}
                  onSelect={selectTool}
                  onPin={togglePinTool}
                  onAdd={handleAddTool}
                  showLevel={true}
                />
              ))}
            </div>
          )}

          {/* Categories grouped by level */}
          <div className="pb-2">
            {selectedLevel && (
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                <Zap className="w-3 h-3" style={{ color: LEVEL_META[selectedLevel]?.color }} />
                Level {selectedLevel}: {LEVEL_META[selectedLevel]?.label}
              </div>
            )}
            {!searchQuery && !selectedLevel && (
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Categories
              </div>
            )}
            {sortedCategories.map(cat => (
              <CategoryRow
                key={cat.id}
                category={cat}
                tools={toolsByCategory[cat.id] || []}
                isExpanded={expandedCategories.includes(cat.id) || !!searchQuery}
                onToggle={() => toggleCategory(cat.id)}
                selectedTool={selectedTool}
                pinnedTools={pinnedTools}
                onSelectTool={selectTool}
                onPinTool={togglePinTool}
                onAddTool={handleAddTool}
                showLevel={showLevelBadges}
              />
            ))}
          </div>
        </div>

        {/* Tool detail panel (bottom) */}
        {selectedToolObj && (
          <ToolDetailPanel
            tool={selectedToolObj}
            category={selectedToolCategory}
            isPinned={pinnedTools.includes(selectedToolObj.id)}
            onPin={togglePinTool}
            onAdd={handleAddTool}
            onClose={() => selectTool(null)}
          />
        )}
      </div>
    </FloatingWindow>
  );
};

export default FloatingToolCatalog;
