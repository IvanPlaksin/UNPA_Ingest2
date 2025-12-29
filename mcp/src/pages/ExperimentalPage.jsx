import React from 'react';
import ExperimentalGraph from '../components/Experimental/ExperimentalGraph';

const ExperimentalPage = () => {
    return (
        <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px', background: '#111', color: '#fff', borderBottom: '1px solid #333' }}>
                <h2>Experimental Graph Lab</h2>
                <p>Isolated environment for ForceGraph3D testing.</p>
            </div>
            <div style={{ flex: 1, position: 'relative' }}>
                <ExperimentalGraph />
            </div>
        </div>
    );
};

export default ExperimentalPage;
