import React, { useState, useCallback, useMemo } from 'react';
import { useNexusStore } from '../../../../stores/nexusStore';
import { INFRASTRUCTURE_LABELS, INFRASTRUCTURE_EDGE_TYPES } from '../../../../services/nexus.service';
import ExploreToolbar from './ExploreToolbar';
import FilterBar from './FilterBar';
import NodeList from './NodeList';
import NodeInspector from '../../Inspector/NodeInspector';
import PathFinderPanel from '../../PathFinder/PathFinderPanel';
import SearchPanel from '../../Search/SearchPanel';
import GNNPredictionsPanel from '../../GNN/GNNPredictionsPanel';
import './ExploreMode.css';

/**
 * Explore Mode - Free navigation and graph exploration
 */
const ExploreMode = ({ nodes = [], edges = [], embeddingsAvailable = false }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    type: 'all',
    layer: 'all',
    degree: 'any',
  });
  const [selectedNode, setSelectedNode] = useState(null);
  const [showPathFinder, setShowPathFinder] = useState(false);
  const [pathFinderSource, setPathFinderSource] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showGNNPanel, setShowGNNPanel] = useState(false);

  const selectAndFocus = useNexusStore(state => state.selectAndFocus);
  const setHighlight = useNexusStore(state => state.setHighlight);
  const clearHighlight = useNexusStore(state => state.clearHighlight);

  // Filter out infrastructure nodes (SubGraph, SubGraphPort, etc.)
  const domainNodes = useMemo(() => {
    return nodes.filter(node => {
      const nodeType = node.data?.kind || node.type || '';
      return !INFRASTRUCTURE_LABELS.includes(nodeType);
    });
  }, [nodes]);

  // Filter out infrastructure edges
  const domainEdges = useMemo(() => {
    return edges.filter(edge => {
      const edgeType = edge.type || edge.label || edge.data?.type || '';
      return !INFRASTRUCTURE_EDGE_TYPES.includes(edgeType);
    });
  }, [edges]);

  // Extract available filter options from domain nodes only
  const filterOptions = useMemo(() => {
    const types = new Set();
    const layers = new Set();

    domainNodes.forEach(node => {
      if (node.type) types.add(node.type);
      if (node.data?.layer) layers.add(node.data.layer);
      if (node.layer) layers.add(node.layer);
    });

    return {
      types: Array.from(types).sort(),
      layers: Array.from(layers).sort(),
    };
  }, [domainNodes]);

  // Normalize ReactFlow nodes to flat format for the list
  const normalizedNodes = useMemo(() => {
    return domainNodes.map(node => ({
      id: node.id,
      name: node.data?.label || node.data?.name || node.id,
      label: node.data?.label || node.id,
      type: node.data?.kind || node.type || 'Unknown',
      layer: node.data?.layer || null,
      degree: node.data?.degree ?? null,
      isBridge: node.data?.isBridge || false,
    }));
  }, [domainNodes]);

  const handleNodeClick = useCallback((node) => {
    setSelectedNode(node);
    setHighlight([node.id], 'glow', '#6366f1');
  }, [setHighlight]);

  const handleInspectorClose = useCallback(() => {
    setSelectedNode(null);
    clearHighlight();
  }, [clearHighlight]);

  const handleInspectorNodeClick = useCallback((nodeId) => {
    const target = normalizedNodes.find(n => n.id === nodeId);
    if (target) {
      setSelectedNode(target);
      setHighlight([nodeId], 'glow', '#6366f1');
    }
  }, [normalizedNodes, setHighlight]);

  const handleAction = useCallback((action, node) => {
    switch (action) {
      case 'explore-neighbors':
        selectAndFocus([node.id]);
        break;
      case 'highlight':
        setHighlight([node.id], 'pulse', '#6366f1');
        break;
      case 'paths':
        setPathFinderSource(node);
        setShowPathFinder(true);
        break;
      case 'predict':
        setShowGNNPanel(true);
        break;
      default:
        console.log('[ExploreMode] Action:', action, node);
    }
  }, [selectAndFocus, setHighlight]);

  const handleNodeDoubleClick = useCallback((node) => {
    selectAndFocus([node.id]);
  }, [selectAndFocus]);

  const handleClearFilters = useCallback(() => {
    setFilters({ type: 'all', layer: 'all', degree: 'any' });
  }, []);

  return (
    <div className="explore-mode">
      <ExploreToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters(!showFilters)}
        onSearchFocus={() => setShowSearch(true)}
        onSettingsClick={() => {}}
      />

      {showFilters && (
        <FilterBar
          filters={filters}
          onFilterChange={setFilters}
          onClearFilters={handleClearFilters}
          availableTypes={filterOptions.types}
          availableLayers={filterOptions.layers}
        />
      )}

      <div className="explore-mode__content">
        <div className="explore-mode__list">
          <NodeList
            nodes={normalizedNodes}
            searchQuery={searchQuery}
            filters={filters}
            selectedNodeId={selectedNode?.id}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            sortBy="degree"
            sortOrder="desc"
          />
        </div>

        {selectedNode && (
          <div className="explore-mode__inspector">
            <NodeInspector
              node={selectedNode}
              edges={domainEdges}
              allNodes={normalizedNodes}
              onClose={handleInspectorClose}
              onNodeClick={handleInspectorNodeClick}
              onAction={handleAction}
            />
          </div>
        )}
      </div>

      {showSearch && (
        <div className="explore-mode__search-overlay">
          <SearchPanel
            nodes={normalizedNodes}
            embeddingsAvailable={embeddingsAvailable}
            onResultClick={(node) => {
              setSelectedNode(node);
              setShowSearch(false);
            }}
            onResultNavigate={(node) => {
              selectAndFocus([node.id]);
            }}
            onClose={() => setShowSearch(false)}
          />
        </div>
      )}

      {showPathFinder && (
        <div className="explore-mode__path-finder">
          <PathFinderPanel
            nodes={normalizedNodes}
            edges={domainEdges}
            initialSource={pathFinderSource}
            onClose={() => {
              setShowPathFinder(false);
              setPathFinderSource(null);
            }}
            onNodeClick={(node) => {
              setSelectedNode(node);
              setHighlight([node.id], 'glow', '#6366f1');
            }}
          />
        </div>
      )}

      {showGNNPanel && (
        <div className="explore-mode__gnn-panel">
          <GNNPredictionsPanel
            nodes={normalizedNodes}
            onClose={() => setShowGNNPanel(false)}
          />
        </div>
      )}
    </div>
  );
};

export default ExploreMode;
