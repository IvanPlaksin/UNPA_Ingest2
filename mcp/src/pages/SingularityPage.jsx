import React, { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import SingularityGraph from '../components/Singularity/SingularityGraph';
import FloatingGraphCatalog from '../components/KnowledgePlanes/FloatingGraphCatalog';
import { convertToSingularityFormat } from '../components/Singularity/utils/graphDataConverter';

/**
 * Singularity Page
 *
 * 3D Force-directed graph visualization with:
 * - Work item crawler from ADO
 * - Graph Catalog integration for loading saved graphs
 * - Multiple layout modes (Force Cluster, Stratified, Hierarchy, Radial)
 */
const SingularityPage = () => {
    const { id } = useParams();
    const [showCatalog, setShowCatalog] = useState(false);
    const [externalGraphData, setExternalGraphData] = useState(null);
    const [loadedGraphInfo, setLoadedGraphInfo] = useState(null);

    // Handle graph selection from catalog
    const handleSelectGraph = useCallback((graphData) => {
        console.log('Selected graph from catalog:', graphData);

        // Convert graph data to Singularity format
        const convertedData = convertToSingularityFormat(graphData);

        if (convertedData && convertedData.nodes.length > 0) {
            setExternalGraphData(convertedData);
            setLoadedGraphInfo({
                name: graphData.name || graphData.sourceGraph?.name,
                type: graphData.type || graphData.sourceGraph?.type,
                nodesCount: convertedData.nodes.length,
                linksCount: convertedData.links.length
            });
        }
    }, []);

    // Clear loaded graph and return to crawler mode
    const handleClearGraph = useCallback(() => {
        setExternalGraphData(null);
        setLoadedGraphInfo(null);
    }, []);

    return (
        <div style={{
            width: '100%',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative'
        }}>
            {/* Singularity 3D visualization */}
            <SingularityGraph rootId={id} externalData={externalGraphData} />

            {/* Floating Graph Catalog panel */}
            <FloatingGraphCatalog
                isVisible={showCatalog}
                onClose={() => setShowCatalog(false)}
                onSelectGraph={handleSelectGraph}
            />

            {/* Toggle Catalog button */}
            <div style={{
                position: 'absolute',
                bottom: 20,
                right: 20,
                display: 'flex',
                gap: 8,
                zIndex: 20
            }}>
                {loadedGraphInfo && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 12px',
                        background: 'rgba(5, 217, 232, 0.15)',
                        border: '1px solid rgba(5, 217, 232, 0.3)',
                        borderRadius: 8,
                        color: '#05d9e8',
                        fontSize: 12,
                        fontFamily: 'monospace'
                    }}>
                        <strong>{loadedGraphInfo.name}</strong>
                        <span style={{ color: '#666' }}>|</span>
                        {loadedGraphInfo.nodesCount} nodes / {loadedGraphInfo.linksCount} links
                        <button
                            onClick={handleClearGraph}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#666',
                                cursor: 'pointer',
                                padding: '0 4px',
                                fontSize: 16
                            }}
                            onMouseOver={(e) => e.target.style.color = '#ff6b6b'}
                            onMouseOut={(e) => e.target.style.color = '#666'}
                        >
                            ×
                        </button>
                    </div>
                )}

                <button
                    onClick={() => setShowCatalog(prev => !prev)}
                    style={{
                        width: 44,
                        height: 44,
                        borderRadius: 8,
                        border: `1px solid ${showCatalog ? '#05d9e8' : 'rgba(5, 217, 232, 0.3)'}`,
                        background: showCatalog ? 'rgba(5, 217, 232, 0.2)' : 'rgba(0, 10, 20, 0.85)',
                        color: '#05d9e8',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 20,
                        transition: 'all 0.2s ease'
                    }}
                    title={showCatalog ? 'Hide Graph Catalog' : 'Open Graph Catalog'}
                >
                    📁
                </button>
            </div>
        </div>
    );
};

export default SingularityPage;
