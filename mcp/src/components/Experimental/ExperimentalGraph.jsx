import React, { useMemo } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { useResizeDetector } from 'react-resize-detector';

const ExperimentalGraph = () => {
    const { width, height, ref: containerRef } = useResizeDetector();

    // Mock Data: 10 randomly connected nodes
    const graphData = useMemo(() => {
        const nodes = Array.from({ length: 10 }, (_, i) => ({
            id: `exp-node-${i}`,
            name: `Experimental Node ${i}`,
            val: Math.random() * 20 + 5
        }));

        const links = [];
        nodes.forEach((node, i) => {
            if (i > 0) {
                const targetId = Math.floor(Math.random() * i);
                links.push({
                    source: node.id,
                    target: `exp-node-${targetId}`
                });
            }
        });

        return { nodes, links };
    }, []);

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100vh', background: '#000000' }}>
            <ForceGraph3D
                width={width}
                height={height}
                graphData={graphData}
                backgroundColor="#000000"
                nodeLabel="name"
                nodeRelSize={6}
                nodeAutoColorBy="id"
                linkColor={() => '#ffffff'}
                linkWidth={2}
            />
        </div>
    );
};

export default ExperimentalGraph;
