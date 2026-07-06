import React, { useState } from 'react';
import { VISUAL_DEFAULTS } from '../hooks/useVisualSettings';

const PANEL_KEY = 'entity-singularity-visual-panel-open';

function loadOpen() {
    try { return localStorage.getItem(PANEL_KEY) !== 'false'; } catch { return true; }
}

// ── Slider row ────────────────────────────────────────────────────────────────

function SliderRow({ label, value, min, max, step, onChange }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ width: 110, color: '#94a3b8', fontSize: 11, flexShrink: 0 }}>{label}</span>
            <input
                type="range" min={min} max={max} step={step}
                value={value}
                onChange={e => onChange(Number(e.target.value))}
                style={{ flex: 1, accentColor: '#05d9e8', cursor: 'pointer' }}
            />
            <span style={{ width: 38, color: '#05d9e8', fontSize: 11, textAlign: 'right', fontFamily: 'monospace' }}>
                {Number(value).toFixed(step < 0.1 ? 2 : 1)}
            </span>
        </div>
    );
}

// ── Section header ────────────────────────────────────────────────────────────

function Section({ title, children }) {
    return (
        <div style={{ marginBottom: 10 }}>
            <div style={{
                color: '#05d9e8', fontSize: 10, fontFamily: 'monospace',
                letterSpacing: 2, textTransform: 'uppercase',
                borderBottom: '1px solid rgba(5,217,232,0.2)',
                paddingBottom: 3, marginBottom: 8,
            }}>
                {title}
            </div>
            {children}
        </div>
    );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function VisualSettingsPanel({ settings, onUpdate, onReset, weightSumActive }) {
    const [open, setOpen] = useState(loadOpen);

    const toggle = () => {
        const next = !open;
        setOpen(next);
        try { localStorage.setItem(PANEL_KEY, String(next)); } catch {}
    };

    const isDefault = JSON.stringify(settings) === JSON.stringify(VISUAL_DEFAULTS);

    return (
        <div style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            zIndex: 15, display: 'flex', alignItems: 'flex-start', gap: 4,
        }}>
            {/* Toggle button */}
            <button
                onClick={toggle}
                title={open ? 'Hide visual settings' : 'Visual settings'}
                style={{
                    ...btnStyle,
                    writingMode: 'vertical-lr',
                    textOrientation: 'mixed',
                    padding: '10px 6px',
                    fontSize: 10,
                    letterSpacing: 1,
                    borderRadius: open ? '6px 0 0 6px' : 6,
                    background: open ? 'rgba(5,217,232,0.15)' : 'rgba(0,10,20,0.85)',
                }}
            >
                ⚙ SHADER
            </button>

            {/* Panel body */}
            {open && (
                <div style={{
                    background: 'rgba(3,7,18,0.93)',
                    border: '1px solid rgba(5,217,232,0.25)',
                    borderRadius: '6px 0 6px 6px',
                    padding: '12px 14px',
                    width: 240,
                    backdropFilter: 'blur(8px)',
                    boxShadow: '0 0 24px rgba(5,217,232,0.08)',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <span style={{ color: '#05d9e8', fontFamily: 'monospace', fontSize: 12, fontWeight: 'bold' }}>
                            Visual Settings
                        </span>
                        {!isDefault && (
                            <button onClick={onReset} style={{ ...btnStyle, fontSize: 10, padding: '2px 8px' }}>
                                Reset
                            </button>
                        )}
                    </div>

                    <Section title="Bloom">
                        <SliderRow label="Intensity"    value={settings.bloom.intensity}  min={0} max={3}   step={0.1} onChange={v => onUpdate('bloom.intensity',  v)} />
                        <SliderRow label="Threshold"    value={settings.bloom.threshold}  min={0} max={1}   step={0.05} onChange={v => onUpdate('bloom.threshold',  v)} />
                        <SliderRow label="Smoothing"    value={settings.bloom.smoothing}  min={0} max={1}   step={0.05} onChange={v => onUpdate('bloom.smoothing',  v)} />
                    </Section>

                    <Section title="Nodes">
                        <SliderRow label="Opacity"      value={settings.nodes.opacity}        min={0.1} max={1}   step={0.05} onChange={v => onUpdate('nodes.opacity',        v)} />
                        <SliderRow label="Size ×"       value={settings.nodes.sizeMultiplier} min={0.3} max={3}   step={0.1}  onChange={v => onUpdate('nodes.sizeMultiplier', v)} />
                        <SliderRow label="Hub Scale"    value={settings.nodes.degreeScale}    min={0}   max={4}   step={0.1}  onChange={v => onUpdate('nodes.degreeScale',    v)} />
                        <SliderRow label="Glow"         value={settings.nodes.emissiveIntensity} min={0} max={1}  step={0.05} onChange={v => onUpdate('nodes.emissiveIntensity', v)} />
                    </Section>

                    <Section title="Edges">
                        <SliderRow label="Opacity"      value={settings.edges.opacity}    min={0} max={1} step={0.01} onChange={v => onUpdate('edges.opacity',  v)} />
                        {weightSumActive && (
                            <SliderRow label="Weight Fade"  value={settings.edges.weightFade} min={0} max={1} step={0.01} onChange={v => onUpdate('edges.weightFade', v)} />
                        )}
                    </Section>

                    <Section title="Environment">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: '#94a3b8', fontSize: 11, flex: 1 }}>Depth Fog</span>
                            <button
                                onClick={() => onUpdate('fog.enabled', !settings.fog.enabled)}
                                style={{
                                    ...btnStyle,
                                    background: settings.fog.enabled ? 'rgba(5,217,232,0.25)' : 'rgba(0,0,0,0.5)',
                                    padding: '2px 10px', fontSize: 10,
                                }}
                            >
                                {settings.fog.enabled ? 'ON' : 'OFF'}
                            </button>
                        </div>
                    </Section>
                </div>
            )}
        </div>
    );
}

const btnStyle = {
    background: 'rgba(0,10,20,0.85)', border: '1px solid rgba(5,217,232,0.35)',
    borderRadius: 6, color: '#05d9e8', fontFamily: 'monospace',
    fontSize: 11, padding: '4px 10px', cursor: 'pointer',
};
