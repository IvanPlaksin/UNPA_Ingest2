/**
 * RuleNode (P6) — one rule = one node. Modeled on the Structural Editor's
 * FieldNode. Category-colored, shows title/text preview + appliesTo + enabled.
 */
import React from 'react';
import { Handle, Position } from 'reactflow';
import { CATEGORY_COLOR } from './rulesStore';

function RuleNode({ data, selected }) {
  const color = CATEGORY_COLOR[data.category] || CATEGORY_COLOR.custom;
  const disabled = data.enabled === false;
  return (
    <div style={{
      minWidth: 190, maxWidth: 240, borderRadius: 8,
      border: `2px solid ${selected ? '#fff' : color}`,
      background: '#1e293b', color: '#e2e8f0',
      opacity: disabled ? 0.5 : 1, boxShadow: selected ? `0 0 0 2px ${color}` : 'none',
      fontFamily: 'Inter, sans-serif',
    }}>
      <Handle type="target" position={Position.Top} style={{ background: color }} />
      <div style={{ background: color, padding: '3px 8px', borderRadius: '5px 5px 0 0', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#0f172a', display: 'flex', justifyContent: 'space-between' }}>
        <span>{data.category}</span>
        {disabled && <span>off</span>}
      </div>
      <div style={{ padding: '6px 8px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{data.title || data.key}</div>
        <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.3, maxHeight: 46, overflow: 'hidden' }}>
          {data.text || <em>empty — click to edit</em>}
        </div>
        {Array.isArray(data.appliesTo) && data.appliesTo.length > 0 && (
          <div style={{ marginTop: 4, fontSize: 9, color: '#64748b' }}>
            → {data.appliesTo.join(', ')}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: color }} />
    </div>
  );
}

export default React.memo(RuleNode);
