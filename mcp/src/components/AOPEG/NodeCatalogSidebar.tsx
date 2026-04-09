/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Node Catalog Sidebar
 * Draggable node type list from Core KB for adding nodes to the graph
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Search,
  Wrench,
  Brain,
  Download,
  Search as SearchIcon,
  CheckCircle,
  Database,
  Box,
  Sparkles,
  Filter,
  GitBranch,
  Plug,
  AlertCircle,
  RefreshCw,
  FileText,
  Layers,
  Zap,
  Server,
  Share2,
} from 'lucide-react';
import { useNodeTypeCatalog, NodeTypeInfo, NodeTypeCatalog } from '../../hooks/useAOPEG';
import { DOMAIN_COLORS } from '../../types/aopeg.types';

// ────────────────────────────────────────────────────────────────────────────
// ICON MAP - Supports both Core KB icons and legacy executor icons
// ────────────────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  // Core KB icons
  wrench: Wrench,
  brain: Brain,
  download: Download,
  search: SearchIcon,
  'check-circle': CheckCircle,
  database: Database,
  box: Box,
  sparkles: Sparkles,
  'git-branch': GitBranch,
  plug: Plug,
  'file-text': FileText,
  layers: Layers,
  zap: Zap,
  server: Server,
  share2: Share2,
  // Legacy domain icons
  common: Wrench,
  ai: Brain,
  ingestion: Download,
  rag: SearchIcon,
  validation: CheckCircle,
  storage: Database,
  cosmos: Sparkles,
  workflow: GitBranch,
  integration: Plug,
  default: Box,
};

const DOMAIN_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  common: Wrench,
  ai: Brain,
  ingestion: Download,
  rag: SearchIcon,
  validation: CheckCircle,
  storage: Database,
  search: Sparkles,
  cosmos: Sparkles,
  workflow: GitBranch,
  integration: Plug,
  default: Box,
};

const DOMAIN_LABELS: Record<string, string> = {
  common: 'Common',
  ai: 'AI / LLM',
  ingestion: 'Ingestion',
  rag: 'RAG',
  validation: 'Validation',
  storage: 'Storage',
  search: 'Search',
  cosmos: 'Cosmos',
  workflow: 'Workflow',
  integration: 'Integration',
};

// Use DOMAIN_COLORS from types (includes workflow, integration domains)

// ────────────────────────────────────────────────────────────────────────────
// NODE TYPE ITEM
// ────────────────────────────────────────────────────────────────────────────

interface NodeTypeItemProps {
  nodeType: NodeTypeInfo;
  onDragStart: (e: React.DragEvent, nodeType: NodeTypeInfo) => void;
}

const NodeTypeItem: React.FC<NodeTypeItemProps> = ({ nodeType, onDragStart }) => {
  const colors = DOMAIN_COLORS[nodeType.domain] || DOMAIN_COLORS.default || DOMAIN_COLORS.default;
  // Use icon from nodeType if available, otherwise fall back to domain icon
  const Icon = ICON_MAP[nodeType.icon] || DOMAIN_ICONS[nodeType.domain] || DOMAIN_ICONS.default;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, nodeType)}
      className={`
        flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-grab
        bg-[#21262d] border border-transparent
        hover:border-[#30363d] hover:bg-[#2d333b]
        active:cursor-grabbing active:scale-[0.98]
        transition-all duration-150 group
      `}
    >
      <GripVertical className="w-3 h-3 text-[#6e7681] opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className={`p-1.5 rounded-md ${colors.iconBg}`}>
        <Icon className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#f0f6fc] truncate">
          {nodeType.displayName}
        </p>
        <p className="text-xs text-[#8b949e] truncate">{nodeType.name}</p>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// DOMAIN GROUP (Card Style)
// ────────────────────────────────────────────────────────────────────────────

interface DomainGroupProps {
  domain: string;
  nodeTypes: NodeTypeInfo[];
  expanded: boolean;
  onToggle: () => void;
  onDragStart: (e: React.DragEvent, nodeType: NodeTypeInfo) => void;
}

const DomainGroup: React.FC<DomainGroupProps> = ({
  domain,
  nodeTypes,
  expanded,
  onToggle,
  onDragStart,
}) => {
  const Icon = DOMAIN_ICONS[domain] || DOMAIN_ICONS.default;
  const label = DOMAIN_LABELS[domain] || domain.charAt(0).toUpperCase() + domain.slice(1);
  const colors = DOMAIN_COLORS[domain] || DOMAIN_COLORS.default || DOMAIN_COLORS.default;

  return (
    <div className="mb-2">
      {/* Domain Card Header */}
      <button
        onClick={onToggle}
        className={`
          w-full flex items-center gap-3 p-3 rounded-lg
          bg-[#21262d] border border-[#30363d]
          hover:bg-[#2d333b] hover:border-[#3d444d]
          transition-all duration-150
        `}
      >
        <div className={`p-2 rounded-lg ${colors.iconBg} shadow-md`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 text-left">
          <span className="text-sm font-semibold text-[#f0f6fc]">{label}</span>
          <p className="text-xs text-[#8b949e]">
            {nodeTypes.length} type{nodeTypes.length !== 1 ? 's' : ''}
          </p>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-[#8b949e]" />
        ) : (
          <ChevronRight className="w-4 h-4 text-[#8b949e]" />
        )}
      </button>

      {/* Expanded Node Type List */}
      {expanded && (
        <div className="mt-2 ml-2 space-y-1">
          {nodeTypes.map((nodeType) => (
            <NodeTypeItem
              key={nodeType.fullName}
              nodeType={nodeType}
              onDragStart={onDragStart}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// MAIN SIDEBAR
// ────────────────────────────────────────────────────────────────────────────

interface NodeCatalogSidebarProps {
  catalog?: NodeTypeCatalog | null;
  onNodeDragStart: (e: React.DragEvent, nodeTypeFullName: string) => void;
}

export const NodeCatalogSidebar: React.FC<NodeCatalogSidebarProps> = ({
  catalog: propCatalog,
  onNodeDragStart,
}) => {
  // Fetch from Core KB if no catalog provided via props
  const { catalog: fetchedCatalog, loading, error, refetch } = useNodeTypeCatalog();
  const catalog = propCatalog || fetchedCatalog;

  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Initialize expanded domains when catalog loads
  useEffect(() => {
    if (catalog?.domains) {
      setExpandedDomains(new Set(catalog.domains.map(d => d.name)));
    }
  }, [catalog?.domains]);

  // Filter node types by search
  const filteredByDomain = useMemo(() => {
    if (!catalog?.byDomain) return {};
    if (!searchQuery.trim()) {
      return catalog.byDomain;
    }

    const query = searchQuery.toLowerCase();
    const filtered: Record<string, NodeTypeInfo[]> = {};

    for (const [domain, nodeTypes] of Object.entries(catalog.byDomain)) {
      const matches = nodeTypes.filter(
        (t) =>
          t.displayName.toLowerCase().includes(query) ||
          t.name.toLowerCase().includes(query) ||
          t.fullName.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query)
      );
      if (matches.length > 0) {
        filtered[domain] = matches;
      }
    }

    return filtered;
  }, [catalog?.byDomain, searchQuery]);

  const toggleDomain = (domain: string) => {
    setExpandedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) {
        next.delete(domain);
      } else {
        next.add(domain);
      }
      return next;
    });
  };

  const handleDragStart = (e: React.DragEvent, nodeType: NodeTypeInfo) => {
    // Store full node type info for the drop handler
    e.dataTransfer.setData('application/aopeg-nodetype', JSON.stringify(nodeType));
    // Also set executor format for backward compatibility
    e.dataTransfer.setData('application/aopeg-executor', JSON.stringify({
      type: nodeType.fullName,
      displayName: nodeType.displayName,
      domain: nodeType.domain,
      description: nodeType.description,
      parameters: nodeType.parameters || [],
    }));
    e.dataTransfer.effectAllowed = 'move';
    onNodeDragStart(e, nodeType.fullName);
  };

  // Loading state
  if (loading && !catalog) {
    return (
      <div className="w-[220px] bg-[#161b22] border-r border-[#30363d] h-full flex items-center justify-center">
        <div className="text-center text-[#8b949e]">
          <div className="animate-spin w-8 h-8 border-2 border-[#30363d] border-t-blue-500 rounded-full mx-auto mb-2" />
          <p className="text-sm">Loading node types...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !catalog) {
    return (
      <div className="w-[220px] bg-[#161b22] border-r border-[#30363d] h-full flex flex-col items-center justify-center p-4">
        <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
        <p className="text-sm text-[#8b949e] text-center mb-3">Failed to load node types</p>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-[#21262d] border border-[#30363d] rounded-md hover:bg-[#2d333b] text-[#f0f6fc]"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className="w-[220px] bg-[#161b22] border-r border-[#30363d] h-full flex items-center justify-center">
        <div className="text-center text-[#8b949e]">
          <Box className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No node types available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[220px] bg-[#161b22] border-r border-[#30363d] h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-[#30363d]">
        <h3 className="font-semibold text-[#f0f6fc] text-sm">Node Types</h3>
        <p className="text-xs text-[#8b949e] mt-1">Drag to canvas</p>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-[#30363d]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6e7681]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-full pl-9 pr-9 py-2 text-sm bg-[#21262d] border border-[#30363d] rounded-md
                       text-[#f0f6fc] placeholder-[#6e7681]
                       focus:outline-none focus:ring-2 focus:ring-[#388bfd] focus:border-transparent"
          />
          <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-[#30363d] rounded">
            <Filter className="w-4 h-4 text-[#6e7681]" />
          </button>
        </div>
      </div>

      {/* Node Type List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {Object.entries(filteredByDomain).map(([domain, nodeTypes]) => (
          <DomainGroup
            key={domain}
            domain={domain}
            nodeTypes={nodeTypes}
            expanded={expandedDomains.has(domain)}
            onToggle={() => toggleDomain(domain)}
            onDragStart={handleDragStart}
          />
        ))}

        {Object.keys(filteredByDomain).length === 0 && (
          <div className="text-center py-8 text-[#8b949e] text-sm">
            No node types found
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="p-3 border-t border-[#30363d] text-xs text-[#6e7681]">
        {catalog.stats?.nodeTypeCount || catalog.nodeTypes?.length || 0} types • {catalog.stats?.domainCount || catalog.domains?.length || 0} domains
      </div>
    </div>
  );
};

export default NodeCatalogSidebar;
