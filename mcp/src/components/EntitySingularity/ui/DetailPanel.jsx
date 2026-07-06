import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

const POS_KEY = 'entity-singularity-detail-pos';

function loadPos() {
    try {
        const s = localStorage.getItem(POS_KEY);
        return s ? JSON.parse(s) : { x: 24, y: 80 };
    } catch {
        return { x: 24, y: 80 };
    }
}

function Row({ label, value }) {
    if (value == null || value === '') return null;
    return (
        <div style={{ display: 'flex', gap: 8, marginBottom: 5 }}>
            <span style={{
                color: '#374151', fontSize: 9, minWidth: 82, paddingTop: 1,
                textTransform: 'uppercase', letterSpacing: 0.8, flexShrink: 0,
            }}>
                {label}
            </span>
            <span style={{ color: '#94a3b8', fontSize: 11, flex: 1, wordBreak: 'break-word', lineHeight: 1.4 }}>
                {value}
            </span>
        </div>
    );
}

function NodeBody({ item }) {
    const d = item.data || {};
    return (
        <>
            <div style={{ marginBottom: 12 }}>
                <div style={{ color: '#05d9e8', fontSize: 14, fontWeight: 'bold', lineHeight: 1.3, marginBottom: 3 }}>
                    {item.name}
                </div>
                {item.mentionCount > 0 && (
                    <div style={{ color: '#4b5563', fontSize: 11 }}>
                        {item.mentionCount} mention{item.mentionCount !== 1 ? 's' : ''}
                    </div>
                )}
            </div>

            {d.description && (
                <div style={{ marginBottom: 12 }}>
                    <div style={{ color: '#374151', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 }}>
                        Description
                    </div>
                    <div style={{ color: '#cbd5e1', fontSize: 12, lineHeight: 1.65 }}>{d.description}</div>
                </div>
            )}

            <div style={{ borderTop: '1px solid rgba(5,217,232,0.08)', paddingTop: 8 }}>
                <Row label="Type"       value={item.canonicalType || item.type} />
                <Row label="Category"   value={d.category} />
                <Row label="Layer"      value={d.epistemicLayer} />
                <Row label="Namespace"  value={d.namespace} />
                <Row label="Provenance" value={d.provenanceDocTitle || d.provenanceDocSymbol} />
                <Row label="Created"    value={d.createdAt ? new Date(d.createdAt).toLocaleDateString() : null} />
                <Row label="ID"         value={item.id} />
            </div>
        </>
    );
}

function EdgeBody({ item }) {
    const srcName = item.sourceNode?.name
        || (typeof item.source === 'object' ? item.source?.id : item.source) || '?';
    const tgtName = item.targetNode?.name
        || (typeof item.target === 'object' ? item.target?.id : item.target) || '?';
    const srcType = item.sourceNode?.canonicalType || '';
    const tgtType = item.targetNode?.canonicalType || '';
    const isMerged = item.isMerged && item.mergedEdges?.length > 1;

    return (
        <>
            <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 5 }}>
                    <span style={{ color: '#05d9e8', fontSize: 13, fontWeight: 'bold' }}>{srcName}</span>
                    {srcType && <span style={{ color: '#374151', fontSize: 9 }}>[{srcType}]</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 6, marginBottom: 5 }}>
                    <span style={{ color: '#f59e0b', fontSize: 11, letterSpacing: 0.8 }}>↓ {item.type}</span>
                    {isMerged && (
                        <span style={{
                            background: 'rgba(245,158,11,0.18)', border: '1px solid rgba(245,158,11,0.35)',
                            borderRadius: 4, color: '#f59e0b', fontSize: 9, padding: '1px 6px',
                        }}>
                            ×{item.mergedEdges.length} · weight {item.weight}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ color: '#05d9e8', fontSize: 13, fontWeight: 'bold' }}>{tgtName}</span>
                    {tgtType && <span style={{ color: '#374151', fontSize: 9 }}>[{tgtType}]</span>}
                </div>
            </div>

            {isMerged && (
                <div style={{ marginBottom: 12 }}>
                    <div style={{ color: '#374151', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 }}>
                        Merged connections ({item.mergedEdges.length})
                    </div>
                    <div style={{
                        maxHeight: 180, overflowY: 'auto',
                        borderRadius: 4, border: '1px solid rgba(245,158,11,0.12)',
                    }}>
                        {item.mergedEdges.map((e, i) => (
                            <div key={i} style={{
                                padding: '4px 8px',
                                borderBottom: i < item.mergedEdges.length - 1
                                    ? '1px solid rgba(245,158,11,0.07)' : 'none',
                                fontSize: 10, color: '#94a3b8',
                            }}>
                                <span style={{ color: '#f59e0b', marginRight: 6 }}>{e.type || 'RELATED_TO'}</span>
                                {e.context
                                    ? (e.context.length > 70 ? e.context.slice(0, 70) + '…' : e.context)
                                    : <span style={{ color: '#374151' }}>—</span>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {!isMerged && item.context && (
                <div style={{ marginBottom: 12 }}>
                    <div style={{ color: '#374151', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 }}>
                        Context
                    </div>
                    <div style={{ color: '#cbd5e1', fontSize: 12, lineHeight: 1.65 }}>{item.context}</div>
                </div>
            )}

            <div style={{ borderTop: '1px solid rgba(245,158,11,0.1)', paddingTop: 8 }}>
                {isMerged && <Row label="Weight" value={String(item.weight)} />}
                {!isMerged && item.confidence != null && (
                    <Row label="Confidence" value={`${Math.round(item.confidence * 100)}%`} />
                )}
                {!isMerged && <Row label="Document" value={item.documentId} />}
            </div>
        </>
    );
}

export function DetailPanel({ item, onClose }) {
    const [pos, setPos] = useState(loadPos);
    const dragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const onMove = (e) => {
            if (!dragging.current) return;
            setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
        };
        const onUp = () => {
            if (!dragging.current) return;
            dragging.current = false;
            setPos(p => {
                try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch {}
                return p;
            });
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
    }, []);

    if (!item) return null;

    const isNode = item.itemType === 'node';
    const color  = isNode ? '#05d9e8' : '#f59e0b';
    const border = isNode ? 'rgba(5,217,232,' : 'rgba(245,158,11,';

    return ReactDOM.createPortal(
        <div style={{
            position: 'fixed', left: pos.x, top: pos.y,
            zIndex: 10000, width: 300, fontFamily: 'monospace',
            background: 'rgba(3,7,18,0.97)',
            border: `1px solid ${border}0.4)`,
            borderRadius: 10,
            boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
            userSelect: 'none',
        }}>
            {/* Drag header */}
            <div
                style={{
                    padding: '9px 12px', cursor: 'grab', borderRadius: '10px 10px 0 0',
                    background: `${border}0.06)`,
                    borderBottom: `1px solid ${border}0.15)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
                onPointerDown={(e) => {
                    dragging.current = true;
                    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
                    e.currentTarget.style.cursor = 'grabbing';
                    e.preventDefault();
                }}
                onPointerUp={(e) => { e.currentTarget.style.cursor = 'grab'; }}
            >
                <span style={{ color, fontSize: 10, fontWeight: 'bold', letterSpacing: 1.5 }}>
                    {isNode
                        ? (item.canonicalType || item.type || 'NODE')
                        : (item.type || 'RELATION')}
                </span>
                <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={onClose}
                    style={{
                        background: 'none', border: 'none', color: '#6b7280',
                        cursor: 'pointer', fontSize: 18, lineHeight: 1,
                        padding: '0 2px', fontFamily: 'monospace',
                    }}
                >×</button>
            </div>

            {/* Body */}
            <div style={{ padding: '12px 14px', maxHeight: 520, overflowY: 'auto' }}>
                {isNode ? <NodeBody item={item} /> : <EdgeBody item={item} />}
            </div>
        </div>,
        document.body
    );
}
