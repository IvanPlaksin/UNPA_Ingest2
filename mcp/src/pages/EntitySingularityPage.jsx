import React from 'react';
import EntitySingularityGraph from '../components/EntitySingularity/EntitySingularityGraph';

/**
 * EntitySingularityPage — Phase 1
 *
 * 3D visualization of the Entity Store knowledge graph.
 * Optimized version of /singularity with Entity Store as the sole data source.
 * Target: 50K+ nodes via InstancedMesh (Phase 2) and Viewport LOD (Phase 3).
 */
export default function EntitySingularityPage() {
    return (
        <div style={{ width: '100%', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <EntitySingularityGraph />
        </div>
    );
}
