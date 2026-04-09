/**
 * UnifiedToolCatalog (UTC-003)
 *
 * Single catalog component that replaces both FloatingToolCatalog (GXE) and
 * NodePalette (Workspace). Supports two modes:
 *
 *   mode="gxe"       → Shows tool categories (text, extraction, ai, graph, etc.)
 *                       Uses useCatalogStore for data loading.
 *
 *   mode="workspace"  → Shows workspace draft type categories (entities, rules,
 *                       workflows, structures) PLUS shared templates.
 *
 * Both modes support:
 *   - Category tree navigation
 *   - Search across all items
 *   - Drag-to-canvas
 *   - Recent + Pinned sections
 *   - Detail panel for selected item
 *   - Optional AI panel placeholder (UTC-004)
 *
 * Layout:
 *   floating={true}  → wrapped in FloatingWindow (GXE mode)
 *   floating={false}  → flex sidebar (Workspace mode)
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search, Plus, ChevronRight, ChevronDown, Star, Clock, X, GripVertical,
  Box as BoxIcon, Shield, Activity, Layers, Database, FileCode, Zap, Cpu,
  Sparkles
} from 'lucide-react';
import { useCatalogStore, LEVEL_META } from '../../stores/catalogStore';
import CatalogAIPanel from './CatalogAIPanel';

/* ═══════════════════════════════════════════════════════════════════
   WORKSPACE DRAFT TYPES (static — no API call needed)
   ═══════════════════════════════════════════════════════════════════ */

const WORKSPACE_CATEGORIES = [
  { id: 'ws-entities',    name: 'Entities',     emoji: '🏢', color: '#4CAF50' },
  { id: 'ws-rules',       name: 'Rules',        emoji: '📏', color: '#2196F3' },
  { id: 'ws-workflows',   name: 'Workflows',    emoji: '🔄', color: '#9C27B0' },
  { id: 'ws-structures',  name: 'Structures',   emoji: '📊', color: '#607D8B' },
];

const WORKSPACE_DRAFT_ITEMS = [
  // Entities
  { id: 'draft:entity',       name: 'Entity',        category: 'ws-entities', color: '#4CAF50', draftType: 'entity',        description: 'Business entity (person, department, product)' },
  { id: 'draft:concept',      name: 'Concept',       category: 'ws-entities', color: '#00BCD4', draftType: 'concept',       description: 'Domain concept or glossary term' },
  { id: 'draft:schema',       name: 'Schema',        category: 'ws-structures', color: '#607D8B', draftType: 'schema',       description: 'Data schema or structure definition' },
  { id: 'draft:api_contract', name: 'API Contract',  category: 'ws-structures', color: '#795548', draftType: 'api_contract', description: 'API endpoint contract' },
  // Rules
  { id: 'draft:business_rule', name: 'Business Rule', category: 'ws-rules', color: '#2196F3', draftType: 'business_rule', description: 'Business rule or policy constraint' },
  { id: 'draft:policy',        name: 'Policy',        category: 'ws-rules', color: '#F44336', draftType: 'policy',        description: 'Organizational policy' },
  { id: 'draft:calculation',   name: 'Calculation',   category: 'ws-rules', color: '#FF9800', draftType: 'calculation',   description: 'Formula or calculation logic' },
  // Workflows
  { id: 'draft:workflow',  name: 'Workflow',  category: 'ws-workflows', color: '#9C27B0', draftType: 'workflow',  description: 'Process flow or state machine' },
  { id: 'draft:decision',  name: 'Decision',  category: 'ws-workflows', color: '#FF5722', draftType: 'decision',  description: 'Architectural or process decision' },
  // Structures
  { id: 'draft:requirement', name: 'Requirement', category: 'ws-structures', color: '#84CC16', draftType: 'requirement', description: 'Functional requirement' },
  { id: 'draft:anomaly',    name: 'Anomaly',    category: 'ws-structures', color: '#EF4444', draftType: 'anomaly',    description: 'Detected issue or inconsistency' },
];

/* ═══════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════════ */

const S = {
  root: (embedded) => ({
    display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0,
    background: '#0d1117', color: '#e2e8f0', fontSize: 12,
    ...(embedded ? {} : { width: 400, maxHeight: 600, borderRadius: 8, border: '1px solid #30363d', overflow: 'hidden' })
  }),
  header: {
    padding: '8px 10px', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', gap: 6,
    background: '#161b22', flexShrink: 0
  },
  searchInput: {
    flex: 1, background: '#0d1117', border: '1px solid #30363d', borderRadius: 6,
    padding: '4px 8px', color: '#e2e8f0', fontSize: 11, outline: 'none'
  },
  body: { display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 },
  sidebar: {
    width: 130, borderRight: '1px solid #30363d', overflowY: 'auto', flexShrink: 0,
    background: '#0d1117'
  },
  main: { flex: 1, overflowY: 'auto', padding: 0, minWidth: 0 },
  catItem: (active) => ({
    padding: '5px 8px', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 5,
    background: active ? '#161b22' : 'transparent', borderLeft: `2px solid ${active ? '#58a6ff' : 'transparent'}`,
    transition: 'background 0.12s'
  }),
  toolItem: (selected) => ({
    padding: '6px 10px', cursor: 'grab', borderBottom: '1px solid #21262d',
    background: selected ? '#1c2333' : 'transparent', transition: 'background 0.1s'
  }),
  chip: (color) => ({
    display: 'inline-block', fontSize: 9, padding: '1px 5px', borderRadius: 4,
    background: color + '22', color, fontWeight: 600, lineHeight: '14px'
  }),
  section: { padding: '6px 8px', fontSize: 10, color: '#484f58', fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid #21262d' },
  detail: { padding: 10, fontSize: 11 },
  detailLabel: { color: '#8b949e', fontWeight: 600, marginBottom: 2, fontSize: 10, display: 'block' }
};

const CategoryItem = ({ cat, active, count, onClick }) => (
  <div style={S.catItem(active)} onClick={onClick} title={cat.description || cat.name}>
    <span>{cat.emoji || '•'}</span>
    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</span>
    {count > 0 && <span style={{ color: '#484f58', fontSize: 9 }}>{count}</span>}
  </div>
);

const ToolItemRow = ({ item, selected, onSelect, onDragStart }) => {
  const handleDrag = useCallback((e) => {
    const dragData = {
      source: item.draftType ? 'workspace' : 'gxe',
      type: item.draftType ? 'draft' : 'tool',
      toolId: item.executorId || item.id,
      draftType: item.draftType || null,
      label: item.name,
      description: item.description,
      color: item.color,
      defaultProperties: item.defaultData || {}
    };
    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
    // Also set GXE-compatible format for backwards compat with existing GXE canvas
    if (!item.draftType) {
      e.dataTransfer.setData('application/gxe-tool', JSON.stringify({
        toolId: item.id, executorId: item.executorId || item.id,
        name: item.name, description: item.description
      }));
    }
    e.dataTransfer.effectAllowed = 'copy';
    onDragStart?.(item, e);
  }, [item, onDragStart]);

  return (
    <div
      style={S.toolItem(selected)}
      draggable
      onDragStart={handleDrag}
      onClick={() => onSelect?.(item)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {item.color && (
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
        )}
        <span style={{ fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
        {item.level && <span style={{ ...S.chip(LEVEL_META[item.level]?.color || '#888') }}>L{item.level}</span>}
        {item.draftType && <span style={S.chip(item.color || '#888')}>{item.draftType}</span>}
      </div>
      {item.description && (
        <div style={{ color: '#8b949e', fontSize: 10, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.description}
        </div>
      )}
    </div>
  );
};

const DetailPanel = ({ item }) => {
  if (!item) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#484f58', fontSize: 11 }}>
      Select an item to view details
    </div>
  );

  return (
    <div style={S.detail}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{item.name}</div>
      {item.description && <p style={{ color: '#8b949e', margin: '0 0 8px' }}>{item.description}</p>}
      {item.executorId && (
        <>
          <span style={S.detailLabel}>Executor</span>
          <code style={{ fontSize: 10, color: '#58a6ff', display: 'block', marginBottom: 6 }}>{item.executorId}</code>
        </>
      )}
      {item.draftType && (
        <>
          <span style={S.detailLabel}>Draft Type</span>
          <span style={{ ...S.chip(item.color || '#888'), marginBottom: 6, display: 'inline-block' }}>{item.draftType}</span>
        </>
      )}
      {item.tags && item.tags.length > 0 && (
        <>
          <span style={S.detailLabel}>Tags</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 6 }}>
            {item.tags.map(t => <span key={t} style={{ ...S.chip('#58a6ff') }}>{t}</span>)}
          </div>
        </>
      )}
      {item.inputSchema && (
        <>
          <span style={S.detailLabel}>Input Schema</span>
          <pre style={{
            fontSize: 9, background: '#161b22', padding: 6, borderRadius: 4,
            overflow: 'auto', maxHeight: 150, color: '#c9d1d9', margin: '0 0 6px'
          }}>
            {JSON.stringify(item.inputSchema, null, 2)}
          </pre>
        </>
      )}
      <div style={{
        marginTop: 8, padding: '4px 8px', background: '#21262d', borderRadius: 4,
        fontSize: 10, color: '#8b949e', textAlign: 'center'
      }}>
        Drag to canvas to add
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════ */

/**
 * @param {Object} props
 * @param {'gxe' | 'workspace'} props.mode
 * @param {string} [props.workspaceId]
 * @param {boolean} [props.floating=false]
 * @param {Function} [props.onClose]
 * @param {Function} [props.onToolDragStart]
 * @param {Array} [props.selectedNodes]     Canvas selection (for future AI panel)
 * @param {boolean} [props.showAI=false]    Show AI suggest tab (UTC-004)
 */
const UnifiedToolCatalog = ({
  mode = 'gxe',
  workspaceId,
  floating = false,
  onClose,
  onToolDragStart,
  onPatternReplace,
  selectedNodes,
  showAI = false
}) => {
  // GXE catalog store
  const gxeTools = useCatalogStore(s => s.tools);
  const gxeCategories = useCatalogStore(s => s.categories);
  const gxeLoading = useCatalogStore(s => s.loading);
  const loadCatalog = useCatalogStore(s => s.loadCatalog);
  const recentTools = useCatalogStore(s => s.recentTools);
  const pinnedTools = useCatalogStore(s => s.pinnedTools);
  const addRecentTool = useCatalogStore(s => s.addRecentTool);

  // Local UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [activeView, setActiveView] = useState('browse'); // 'browse' | 'ai'

  // Load GXE tools on mount if in gxe mode
  useEffect(() => {
    if (mode === 'gxe' && gxeTools.length === 0 && !gxeLoading) {
      loadCatalog();
    }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Unified categories
  const categories = useMemo(() => {
    if (mode === 'workspace') {
      return [
        ...WORKSPACE_CATEGORIES,
        { id: '_recent', name: 'Recent', emoji: '🕒', color: '#9CA3AF' },
        { id: '_pinned', name: 'Pinned', emoji: '⭐', color: '#FBBF24' }
      ];
    }
    return [
      ...gxeCategories,
      { id: '_recent', name: 'Recent', emoji: '🕒', color: '#9CA3AF' },
      { id: '_pinned', name: 'Pinned', emoji: '⭐', color: '#FBBF24' }
    ];
  }, [mode, gxeCategories]);

  // Unified items
  const allItems = useMemo(() => {
    return mode === 'workspace' ? WORKSPACE_DRAFT_ITEMS : gxeTools;
  }, [mode, gxeTools]);

  // Filtered items
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase();
    let items = allItems;

    if (selectedCategory === '_recent') {
      items = recentTools
        .map(id => allItems.find(t => t.id === id))
        .filter(Boolean);
    } else if (selectedCategory === '_pinned') {
      items = pinnedTools
        .map(id => allItems.find(t => t.id === id))
        .filter(Boolean);
    } else if (selectedCategory) {
      items = items.filter(t => t.category === selectedCategory);
    }

    if (q) {
      items = items.filter(t =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        (t.executorId || '').toLowerCase().includes(q) ||
        (t.draftType || '').toLowerCase().includes(q) ||
        (t.tags || []).some(tag => tag.toLowerCase().includes(q))
      );
    }

    return items;
  }, [allItems, searchQuery, selectedCategory, recentTools, pinnedTools]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts = {};
    for (const item of allItems) {
      if (item.category) counts[item.category] = (counts[item.category] || 0) + 1;
    }
    counts['_recent'] = recentTools.length;
    counts['_pinned'] = pinnedTools.length;
    return counts;
  }, [allItems, recentTools, pinnedTools]);

  const handleSelect = useCallback((item) => {
    setSelectedItem(item);
    setShowDetail(true);
    addRecentTool(item.id);
  }, [addRecentTool]);

  const handleDragStart = useCallback((item, e) => {
    addRecentTool(item.id);
    onToolDragStart?.(item, e);
  }, [addRecentTool, onToolDragStart]);

  const content = (
    <div style={S.root(!floating)}>
      {/* Header: view tabs + search */}
      <div style={S.header}>
        {showAI && (
          <div style={{ display: 'flex', gap: 2, marginRight: 4 }}>
            <button
              onClick={() => setActiveView('browse')}
              style={{
                padding: '2px 6px', fontSize: 10, border: 'none', borderRadius: 4, cursor: 'pointer',
                background: activeView === 'browse' ? '#30363d' : 'transparent',
                color: activeView === 'browse' ? '#e2e8f0' : '#8b949e'
              }}
            >Browse</button>
            <button
              onClick={() => setActiveView('ai')}
              style={{
                padding: '2px 6px', fontSize: 10, border: 'none', borderRadius: 4, cursor: 'pointer',
                background: activeView === 'ai' ? '#30363d' : 'transparent',
                color: activeView === 'ai' ? '#e2e8f0' : '#8b949e'
              }}
            >
              <Sparkles size={10} style={{ verticalAlign: 'middle', marginRight: 2 }} />AI
            </button>
          </div>
        )}
        {activeView === 'browse' && (
          <>
            <Search size={14} style={{ color: '#8b949e', flexShrink: 0 }} />
            <input
              style={S.searchInput}
              placeholder={mode === 'workspace' ? 'Search drafts...' : 'Search tools...'}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </>
        )}
        {activeView === 'ai' && (
          <span style={{ flex: 1, fontSize: 11, color: '#8b949e' }}>AI Assistant</span>
        )}
        {showDetail && activeView === 'browse' && (
          <button
            onClick={() => setShowDetail(false)}
            style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: 2 }}
            title="Back to list"
          >
            <X size={14} />
          </button>
        )}
        {onClose && (
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: 2 }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* AI Panel (full tab — replaces browse when active) */}
      {activeView === 'ai' && showAI ? (
        <CatalogAIPanel
          workspaceId={workspaceId}
          selectedNodes={selectedNodes}
          mode={mode === 'workspace' ? 'pattern_analysis' : 'tool_selection'}
          onPatternReplace={onPatternReplace}
        />
      ) : (

      /* Body: categories sidebar + items/detail */
      <div style={S.body}>
        {/* Categories sidebar */}
        {!showDetail && (
          <div style={S.sidebar}>
            <div style={S.section}>{mode === 'workspace' ? 'DRAFT TYPES' : 'TOOL CATEGORIES'}</div>
            <div
              style={S.catItem(!selectedCategory)}
              onClick={() => setSelectedCategory(null)}
            >
              <span>📋</span>
              <span style={{ flex: 1 }}>All</span>
              <span style={{ color: '#484f58', fontSize: 9 }}>{allItems.length}</span>
            </div>
            {categories.map(cat => (
              <CategoryItem
                key={cat.id}
                cat={cat}
                active={selectedCategory === cat.id}
                count={categoryCounts[cat.id] || 0}
                onClick={() => setSelectedCategory(cat.id)}
              />
            ))}
          </div>
        )}

        {/* Main: items list or detail */}
        <div style={S.main}>
          {showDetail && selectedItem ? (
            <DetailPanel item={selectedItem} />
          ) : (
            <>
              {gxeLoading && mode === 'gxe' && (
                <div style={{ padding: 16, textAlign: 'center', color: '#8b949e' }}>Loading catalog...</div>
              )}
              {filteredItems.length === 0 && !gxeLoading && (
                <div style={{ padding: 16, textAlign: 'center', color: '#484f58' }}>No items found</div>
              )}
              {filteredItems.map(item => (
                <ToolItemRow
                  key={item.id}
                  item={item}
                  selected={selectedItem?.id === item.id}
                  onSelect={handleSelect}
                  onDragStart={handleDragStart}
                />
              ))}
            </>
          )}
        </div>
      </div>
      )}

      {/* Footer */}
      <div style={{
        padding: '4px 8px', borderTop: '1px solid #30363d', background: '#161b22',
        fontSize: 9, color: '#484f58', textAlign: 'center', flexShrink: 0
      }}>
        {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''} •
        {mode === 'workspace' ? ' Workspace drafts' : ` ${gxeTools.length} tools loaded`}
      </div>
    </div>
  );

  return content;
};

export default UnifiedToolCatalog;
export { WORKSPACE_CATEGORIES, WORKSPACE_DRAFT_ITEMS };
