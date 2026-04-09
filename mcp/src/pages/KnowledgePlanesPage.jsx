import React, { useState, useCallback } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { FolderOpen as FolderOpenIcon } from '@mui/icons-material';
import KnowledgePlanes from '../components/KnowledgePlanes';
import FloatingGraphCatalog from '../components/KnowledgePlanes/FloatingGraphCatalog';
import { convertToKnowledgePlanesFormat } from '../components/KnowledgePlanes/utils/graphDataConverter';

/**
 * Knowledge Planes Page
 *
 * Multi-layer 3D visualization of knowledge graph with:
 * - 5 Knowledge Layers: Strategic, Business Logic, Task Management, Implementation, Infrastructure
 * - Wormholes (Einstein-Rosen Bridge geometry) connecting layers
 * - Semantic Graph Simulator with 4D vector coordinates
 * - Multiple navigation modes: Orbit, Pan, Flythrough, Archicad-style
 * - Graph Catalog integration for loading saved graphs
 *
 * Based on Knowledge Planes v6.19
 */
const KnowledgePlanesPage = () => {
    const [showCatalog, setShowCatalog] = useState(false);
    const [externalGraphData, setExternalGraphData] = useState(null);
    const [loadedGraphInfo, setLoadedGraphInfo] = useState(null);

    // Handle graph selection from catalog
    const handleSelectGraph = useCallback((graphData) => {
        console.log('Selected graph from catalog:', graphData);

        // Convert graph data to KnowledgePlanes format
        const convertedData = convertToKnowledgePlanesFormat(graphData);

        if (convertedData) {
            setExternalGraphData(convertedData);
            setLoadedGraphInfo({
                name: graphData.name || graphData.sourceGraph?.name,
                type: graphData.type || graphData.sourceGraph?.type,
                nodesCount: convertedData.nodes.length,
                edgesCount: convertedData.edges.length
            });
            // Optionally close catalog after selection
            // setShowCatalog(false);
        }
    }, []);

    // Clear loaded graph and return to default
    const handleClearGraph = useCallback(() => {
        setExternalGraphData(null);
        setLoadedGraphInfo(null);
    }, []);

    return (
        <Box sx={{
            width: '100%',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            bgcolor: '#030810',
            position: 'relative'
        }}>
            {/* Knowledge Planes visualization */}
            <KnowledgePlanes externalData={externalGraphData} />

            {/* Floating Graph Catalog panel */}
            <FloatingGraphCatalog
                isVisible={showCatalog}
                onClose={() => setShowCatalog(false)}
                onSelectGraph={handleSelectGraph}
            />

            {/* Toggle Catalog button */}
            <Box sx={{
                position: 'absolute',
                bottom: 16,
                right: 16,
                display: 'flex',
                gap: 1,
                zIndex: 10
            }}>
                {loadedGraphInfo && (
                    <Box sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        px: 2,
                        py: 1,
                        bgcolor: 'rgba(5, 217, 232, 0.15)',
                        border: '1px solid rgba(5, 217, 232, 0.3)',
                        borderRadius: 2
                    }}>
                        <Box sx={{ color: '#05d9e8', fontSize: 12 }}>
                            <strong>{loadedGraphInfo.name}</strong>
                            <Box component="span" sx={{ mx: 1, color: '#666' }}>|</Box>
                            {loadedGraphInfo.nodesCount} nodes
                            <Box component="span" sx={{ mx: 0.5, color: '#666' }}>/</Box>
                            {loadedGraphInfo.edgesCount} edges
                        </Box>
                        <IconButton
                            size="small"
                            onClick={handleClearGraph}
                            sx={{ color: '#666', '&:hover': { color: '#ff6b6b' } }}
                        >
                            <Box component="span" sx={{ fontSize: 14 }}>×</Box>
                        </IconButton>
                    </Box>
                )}

                <Tooltip title={showCatalog ? 'Hide Graph Catalog' : 'Open Graph Catalog'}>
                    <IconButton
                        onClick={() => setShowCatalog(prev => !prev)}
                        sx={{
                            bgcolor: showCatalog ? 'rgba(5, 217, 232, 0.2)' : 'rgba(5, 10, 20, 0.85)',
                            border: `1px solid ${showCatalog ? '#05d9e8' : 'rgba(5, 217, 232, 0.2)'}`,
                            color: '#05d9e8',
                            '&:hover': { bgcolor: 'rgba(5, 217, 232, 0.15)' }
                        }}
                    >
                        <FolderOpenIcon />
                    </IconButton>
                </Tooltip>
            </Box>
        </Box>
    );
};

export default KnowledgePlanesPage;
