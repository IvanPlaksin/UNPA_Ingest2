import React from 'react';
import { VIEW_MODES } from '../Config/ViewRegistry';
import { Eye, EyeOff, Activity, Layers } from 'lucide-react';

const ViewControlPanel = ({ settings, actions }) => {
    console.log("[ViewControlPanel] Render. Settings:", settings);
    if (!settings || !settings.activeView) return <div style={{ color: 'red' }}>INVALID SETTINGS</div>;

    // --- STYLES ---
    const panelStyle = {
        position: 'relative', // Was absolute
        // top: 20, // Removed to rely on parent
        // left: 20, // Removed to rely on parent
        width: '300px',
        background: 'rgba(5, 10, 25, 0.90)',
        border: '1px solid #00FFFF',
        boxShadow: '0 0 15px rgba(0, 255, 255, 0.2)',
        borderRadius: '8px',
        padding: '15px',
        color: '#00FFFF',
        fontFamily: 'monospace',
        zIndex: 100, // Keep high z-index
        backdropFilter: 'blur(5px)'
    };

    const headerStyle = {
        margin: '0 0 15px 0',
        fontSize: '14px',
        fontWeight: 'bold',
        textTransform: 'uppercase',
        borderBottom: '1px solid rgba(0,255,255,0.3)',
        paddingBottom: '5px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
    };

    const gridStyle = {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '8px',
        marginBottom: '20px'
    };

    const btnStyle = (active) => ({
        background: active ? 'rgba(0, 255, 255, 0.2)' : 'transparent',
        border: active ? '1px solid #00FFFF' : '1px solid #333',
        color: active ? '#00FFFF' : '#666',
        borderRadius: '4px',
        padding: '8px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s ease'
    });

    const sectionLabel = {
        fontSize: '11px',
        color: '#888',
        marginBottom: '8px',
        textTransform: 'uppercase',
        letterSpacing: '1px'
    };

    const sliderContainer = {
        marginBottom: '15px'
    };

    return (
        <div style={panelStyle}>
            {/* HEADER */}
            <div style={headerStyle}>
                <span>Singularity OS // v2.0</span>
                <Activity size={14} />
            </div>

            {/* 1. VIEW MODES */}
            <div style={sectionLabel}>Projection Mode</div>
            <div style={gridStyle}>
                {VIEW_MODES.map(mode => {
                    const Icon = mode.icon;
                    const isActive = settings.activeView === mode.id;
                    return (
                        <button
                            key={mode.id}
                            style={btnStyle(isActive)}
                            onClick={() => actions.setViewMode(mode.id)}
                            title={mode.description}
                        >
                            <Icon size={18} />
                        </button>
                    );
                })}
            </div>

            {/* 2. CAMERA CONTROLS */}
            <div style={sectionLabel}>Camera Angle</div>
            <div style={gridStyle}>
                <button
                    style={btnStyle(false)}
                    onClick={() => actions.setCameraView('iso')}
                    title="Isometric View (Standard)"
                >
                    <span style={{ fontSize: '10px' }}>ISO</span>
                </button>
                <button
                    style={btnStyle(false)}
                    onClick={() => actions.setCameraView('top')}
                    title="Top View (2D Map)"
                >
                    <span style={{ fontSize: '10px' }}>TOP</span>
                </button>
                <button
                    style={btnStyle(false)}
                    onClick={() => actions.setCameraView('side')}
                    title="Side View (hierarchy)"
                >
                    <span style={{ fontSize: '10px' }}>SIDE</span>
                </button>
            </div>

            {/* 3. PHYSICS CONTROL */}
            <div style={sectionLabel}>Field Physics</div>
            <div style={sliderContainer}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '2px' }}>
                    <span>GRAVITY</span>
                    <span>{settings.physics.gravity}</span>
                </div>
                <input
                    type="range"
                    min="-500"
                    max="-10"
                    value={settings.physics.gravity}
                    onChange={(e) => actions.updatePhysics('gravity', parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: '#00FFFF' }}
                />
            </div>
            <div style={sliderContainer}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '2px' }}>
                    <span>LINK DISTANCE</span>
                    <span>{settings.physics.linkDistance}</span>
                </div>
                <input
                    type="range"
                    min="10"
                    max="200"
                    value={settings.physics.linkDistance}
                    onChange={(e) => actions.updatePhysics('linkDistance', parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: '#00FFFF' }}
                />
            </div>

            {/* 4. LAYER LEGEND (INTERACTIVE) */}
            <div style={sectionLabel}>Traceability Layers</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '15px' }}>
                {[
                    { id: 'epic', label: 'CHANGE REQUESTS', color: '#FF00FF', icon: 'M' },
                    { id: 'workitem', label: 'WORK ITEMS', color: '#00FFFF', icon: 'C' },
                    { id: 'file', label: 'ARTIFACTS', color: '#FFFF00', icon: 'P' }
                ].map(layer => (
                    <div
                        key={layer.id}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '4px', borderRadius: '4px',
                            cursor: 'pointer',
                            background: 'rgba(255,255,255,0.05)'
                        }}
                        onMouseEnter={() => actions.highlightLayer(layer.id)}
                        onMouseLeave={() => actions.highlightLayer(null)}
                    >
                        <div style={{
                            width: '12px', height: '12px', borderRadius: '2px',
                            background: layer.color, boxShadow: `0 0 5px ${layer.color}`
                        }} />
                        <span style={{ fontSize: '10px', color: '#EEE' }}>{layer.label}</span>
                    </div>
                ))}
            </div>

            {/* 5. VISIBILITY TOGGLES */}
            <div style={sectionLabel}>Global Toggles</div>
            <div style={{ display: 'flex', gap: '10px' }}>
                <button
                    onClick={() => actions.toggleVisibility('showFiles')}
                    style={{
                        ...btnStyle(settings.vis.showFiles),
                        flex: 1, flexDirection: 'row', gap: '5px'
                    }}
                >
                    {settings.vis.showFiles ? <Eye size={14} /> : <EyeOff size={14} />}
                    <span style={{ fontSize: '12px' }}>ARTIFACTS</span>
                </button>
                <button
                    onClick={() => actions.toggleVisibility('showLinks')}
                    style={{
                        ...btnStyle(settings.vis.showLinks),
                        flex: 1, flexDirection: 'row', gap: '5px'
                    }}
                >
                    {settings.vis.showLinks ? <Eye size={14} /> : <EyeOff size={14} />}
                    <span style={{ fontSize: '12px' }}>LINKS</span>
                </button>
            </div>

            <div style={{ marginTop: '20px', fontSize: '9px', color: '#555', textAlign: 'center' }}>
                UNPA // NEURAL MATRIX PROJECT
            </div>
        </div>
    );
};

export default ViewControlPanel;
