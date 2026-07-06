import React from 'react';
import { Handle, Position } from 'reactflow';

export default function RootNode({ data, selected }) {
  return (
    <div style={{
      background: '#1e293b',
      border: `2px solid ${selected ? '#6366f1' : '#475569'}`,
      borderRadius: 10,
      padding: '10px 16px',
      minWidth: 180,
      boxShadow: selected ? '0 0 20px rgba(99,102,241,.4)' : '0 0 8px rgba(99,102,241,.1)',
      transition: 'all 0.2s ease',
    }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 700, color: '#a5b4fc', letterSpacing: 1, marginBottom: 4 }}>
        FORM ROOT
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
        {data.label?.en || data.name || 'Untitled'}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#6366f1', width: 8, height: 8, border: 'none' }} />
    </div>
  );
}
