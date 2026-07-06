import React, { useState } from 'react';
import { NODE_VISUAL_CONFIG } from '../constants/visualConfig';

const PANEL_KEY = 'entity-singularity-filter-panel-open';

function loadOpen() {
    try { return localStorage.getItem(PANEL_KEY) !== 'false'; } catch { return true; }
}

// Color dot matching node type
function TypeDot({ canonicalType }) {
    const cfg = NODE_VISUAL_CONFIG[canonicalType] || NODE_VISUAL_CONFIG.default;
    const hex = '#' + cfg.color.toString(16).padStart(6, '0');
    return (
        <span style={{
            display: 'inline-block', width: 8, height: 8,
            borderRadius: '50%', background: hex, flexShrink: 0,
            boxShadow: `0 0 4px ${hex}`,
        }} />
    );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function NodeFilterPanel({ filter, onUpdate, onReset, availableTypes, stats }) {
    const [open, setOpen] = useState(loadOpen);

    const toggle = () => {
        const next = !open;
        setOpen(next);
        try { localStorage.setItem(PANEL_KEY, String(next)); } catch {}
    };

    const isFiltered = filter.search || filter.types.length > 0
        || filter.minMentions > 0 || filter.hideIsolated || filter.weightSum;

    const toggleType = (type) => {
        const next = filter.types.includes(type)
            ? filter.types.filter(t => t !== type)
            : [...filter.types, type];
        onUpdate('types', next);
    };

    return (
        <div style={{
            position: 'absolute', left: 12, bottom: 12,
            zIndex: 15, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
        }}>
            {/* Panel body */}
            {open && (
                <div style={{
                    background: 'rgba(3,7,18,0.93)',
                    border: '1px solid rgba(5,217,232,0.25)',
                    borderRadius: '6px 6px 6px 0',
                    padding: '12px 14px',
                    width: 230,
                    backdropFilter: 'blur(8px)',
                    boxShadow: '0 0 24px rgba(5,217,232,0.08)',
                    maxHeight: 420,
                    overflowY: 'auto',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span style={{ color: '#05d9e8', fontFamily: 'monospace', fontSize: 12, fontWeight: 'bold' }}>
                            Filters
                        </span>
                        {isFiltered && (
                            <button onClick={onReset} style={{ ...btnStyle, fontSize: 10, padding: '2px 8px' }}>
                                Clear all
                            </button>
                        )}
                    </div>

                    {/* Stats */}
                    <div style={{
                        background: 'rgba(5,217,232,0.05)', border: '1px solid rgba(5,217,232,0.15)',
                        borderRadius: 6, padding: '6px 10px', marginBottom: 10,
                        display: 'flex', gap: 12, fontFamily: 'monospace', fontSize: 11,
                    }}>
                        <span style={{ color: '#05d9e8' }}>{stats.visible}</span>
                        <span style={{ color: '#6b7280' }}>/ {stats.total}</span>
                        {stats.hidden > 0 && <span style={{ color: '#ef4444' }}>−{stats.hidden}</span>}
                    </div>

                    {/* Isolated toggle */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        marginBottom: 10, padding: '6px 0',
                        borderBottom: '1px solid rgba(5,217,232,0.1)',
                    }}>
                        <div>
                            <div style={{ color: '#e2e8f0', fontSize: 12 }}>Hide isolated nodes</div>
                            <div style={{ color: '#6b7280', fontSize: 10 }}>
                                {stats.isolated} nodes without connections
                            </div>
                        </div>
                        <button
                            onClick={() => onUpdate('hideIsolated', !filter.hideIsolated)}
                            style={{
                                ...toggleBtnStyle,
                                background: filter.hideIsolated
                                    ? 'rgba(5,217,232,0.9)'
                                    : 'rgba(255,255,255,0.1)',
                            }}
                            title="Toggle isolated nodes"
                        >
                            <span style={{
                                display: 'block', width: 14, height: 14, borderRadius: '50%', background: '#fff',
                                transform: filter.hideIsolated ? 'translateX(16px)' : 'translateX(0)',
                                transition: 'transform 0.2s ease',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                            }} />
                        </button>
                    </div>

                    {/* Weight Sum mode */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        marginBottom: 10, padding: '6px 0',
                        borderBottom: '1px solid rgba(5,217,232,0.1)',
                    }}>
                        <div>
                            <div style={{ color: '#e2e8f0', fontSize: 12 }}>Weight Sum</div>
                            <div style={{ color: '#6b7280', fontSize: 10 }}>
                                Merge parallel edges · encode weight as thickness + color
                            </div>
                        </div>
                        <button
                            onClick={() => onUpdate('weightSum', !filter.weightSum)}
                            style={{
                                ...toggleBtnStyle,
                                background: filter.weightSum
                                    ? 'rgba(245,158,11,0.9)'
                                    : 'rgba(255,255,255,0.1)',
                            }}
                            title="Toggle Weight Sum mode"
                        >
                            <span style={{
                                display: 'block', width: 14, height: 14, borderRadius: '50%', background: '#fff',
                                transform: filter.weightSum ? 'translateX(16px)' : 'translateX(0)',
                                transition: 'transform 0.2s ease',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                            }} />
                        </button>
                    </div>

                    {/* Weight legend (shown only in weightSum mode) */}
                    {filter.weightSum && (
                        <div style={{
                            marginBottom: 10, padding: '8px 10px',
                            background: 'rgba(245,158,11,0.05)',
                            border: '1px solid rgba(245,158,11,0.18)',
                            borderRadius: 5,
                        }}>
                            <div style={{ color: '#94a3b8', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                                Weight Legend
                            </div>

                            {/* Colour gradient bar: gray → gold */}
                            <div style={{
                                width: '100%', height: 7, borderRadius: 3,
                                background: 'linear-gradient(to right, #3d3d3d, #FFD700)',
                                marginBottom: 4,
                                boxShadow: '0 0 8px rgba(255,215,0,0.25)',
                            }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                                <span style={{ color: '#6b7280', fontSize: 9, fontFamily: 'monospace' }}>low weight</span>
                                <span style={{ color: '#f59e0b', fontSize: 9, fontFamily: 'monospace' }}>high weight</span>
                            </div>

                            {/* Thickness tiers */}
                            <div style={{ color: '#94a3b8', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 }}>
                                Thickness
                            </div>
                            {[
                                { label: '1',    height: 1 },
                                { label: '2–3',  height: 2 },
                                { label: '4–6',  height: 3 },
                                { label: '7–12', height: 4 },
                                { label: '13+',  height: 6 },
                            ].map(({ label, height }) => (
                                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                    <div style={{
                                        width: 30, height,
                                        background: 'linear-gradient(to right, #3d3d3d, #FFD700)',
                                        borderRadius: 1, flexShrink: 0,
                                        boxShadow: '0 0 4px rgba(255,215,0,0.3)',
                                    }} />
                                    <span style={{ color: '#6b7280', fontSize: 10, fontFamily: 'monospace' }}>
                                        {label} connections
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Text search */}
                    <div style={{ marginBottom: 10 }}>
                        <label style={labelStyle}>Name search</label>
                        <input
                            type="text"
                            placeholder="Filter by name…"
                            value={filter.search}
                            onChange={e => onUpdate('search', e.target.value)}
                            style={inputStyle}
                        />
                    </div>

                    {/* Min mentions */}
                    <div style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <label style={labelStyle}>Min mentions</label>
                            <span style={{ color: '#05d9e8', fontSize: 11, fontFamily: 'monospace' }}>
                                {filter.minMentions}+
                            </span>
                        </div>
                        <input
                            type="range" min={0} max={50} step={1}
                            value={filter.minMentions}
                            onChange={e => onUpdate('minMentions', Number(e.target.value))}
                            style={{ width: '100%', accentColor: '#05d9e8', cursor: 'pointer' }}
                        />
                    </div>

                    {/* Entity type filter */}
                    {availableTypes.length > 0 && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                <label style={labelStyle}>Entity types</label>
                                {filter.types.length > 0 && (
                                    <button
                                        onClick={() => onUpdate('types', [])}
                                        style={{ ...btnStyle, fontSize: 9, padding: '1px 6px' }}
                                    >
                                        all
                                    </button>
                                )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {availableTypes.map(type => {
                                    const active = filter.types.length === 0 || filter.types.includes(type);
                                    return (
                                        <label
                                            key={type}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 7,
                                                cursor: 'pointer', padding: '3px 6px', borderRadius: 4,
                                                background: filter.types.includes(type)
                                                    ? 'rgba(5,217,232,0.12)'
                                                    : 'transparent',
                                                opacity: active ? 1 : 0.45,
                                                transition: 'all 0.15s',
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={filter.types.includes(type)}
                                                onChange={() => toggleType(type)}
                                                style={{ accentColor: '#05d9e8', cursor: 'pointer' }}
                                            />
                                            <TypeDot canonicalType={type} />
                                            <span style={{ color: '#e2e8f0', fontSize: 11, fontFamily: 'monospace' }}>
                                                {type}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Toggle button */}
            <button
                onClick={toggle}
                title={open ? 'Hide filters' : 'Show filters'}
                style={{
                    ...btnStyle,
                    borderRadius: open ? '0 6px 6px 6px' : 6,
                    background: open ? 'rgba(5,217,232,0.15)' : 'rgba(0,10,20,0.85)',
                    position: 'relative',
                }}
            >
                ⊘ FILTER
                {isFiltered && (
                    <span style={{
                        position: 'absolute', top: -6, right: -6,
                        width: 14, height: 14, borderRadius: '50%',
                        background: '#ef4444', color: '#fff',
                        fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 'bold',
                    }}>
                        !
                    </span>
                )}
            </button>
        </div>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const btnStyle = {
    background: 'rgba(0,10,20,0.85)', border: '1px solid rgba(5,217,232,0.35)',
    borderRadius: 6, color: '#05d9e8', fontFamily: 'monospace',
    fontSize: 11, padding: '4px 10px', cursor: 'pointer',
};

const toggleBtnStyle = {
    width: 36, height: 20, borderRadius: 10, border: 'none',
    cursor: 'pointer', padding: 3, flexShrink: 0, transition: 'background 0.2s ease',
    display: 'flex', alignItems: 'center',
};

const labelStyle = {
    color: '#94a3b8', fontSize: 11, display: 'block', marginBottom: 4,
};

const inputStyle = {
    width: '100%', background: 'rgba(5,217,232,0.05)',
    border: '1px solid rgba(5,217,232,0.25)', borderRadius: 4,
    color: '#e2e8f0', fontFamily: 'monospace', fontSize: 11,
    padding: '4px 8px', outline: 'none', boxSizing: 'border-box',
};
