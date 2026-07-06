import React from 'react';
import { Handle, Position } from 'reactflow';

const TYPE_COLORS = {
  string: '#3b82f6', text: '#3b82f6', email: '#06b6d4', url: '#06b6d4',
  number: '#f59e0b', integer: '#f59e0b', boolean: '#10b981',
  date: '#8b5cf6', datetime: '#8b5cf6', time: '#8b5cf6',
  file: '#ec4899', uuid: '#64748b', any: '#64748b',
};

const TYPE_ICONS = {
  string: 'Aa', text: 'P', email: '@', url: 'U', number: '#', integer: '1',
  boolean: '?', date: 'D', datetime: 'T', file: 'F',
};

const NODE_TYPE_BADGE = {
  FIELD: null,
  ENUM: { label: 'ENUM', color: '#10b981' },
  OBJECT: { label: 'OBJECT', color: '#6366f1' },
  ARRAY: { label: 'ARRAY', color: '#a855f7' },
};

export default function FieldNode({ data, selected }) {
  const color = TYPE_COLORS[data.dataType] || '#64748b';
  const icon = TYPE_ICONS[data.dataType] || '?';
  const badge = NODE_TYPE_BADGE[data.nodeType];

  return (
    <div style={{
      background: '#1e293b',
      border: `2px solid ${selected ? color : '#30363d'}`,
      borderRadius: 8,
      padding: '8px 12px',
      minWidth: 160,
      maxWidth: 240,
      boxShadow: selected ? `0 0 16px ${color}40` : '0 1px 4px rgba(0,0,0,.3)',
      transition: 'all 0.2s ease',
      cursor: 'pointer',
    }}>
      <Handle type="target" position={Position.Top} style={{ background: color, width: 7, height: 7, border: 'none' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 24, height: 24, borderRadius: 6,
          background: `${color}20`, border: `1px solid ${color}60`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, color,
          flexShrink: 0,
        }}>
          {badge ? badge.label[0] : icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {data.name}
          </div>
          <div style={{ fontSize: 11, color: '#8b949e' }}>
            {badge ? badge.label : data.dataType}
            {data.required && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
          </div>
        </div>
      </div>

      {data.nodeType === 'ENUM' && data.enumValues?.length > 0 && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8', borderTop: '1px solid #30363d', paddingTop: 4 }}>
          {data.enumValues.slice(0, 3).join(', ')}{data.enumValues.length > 3 && '...'}
        </div>
      )}

      {data.dataSource?.dataSourceId && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#a78bfa', borderTop: '1px solid #30363d', paddingTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 12 }}>{'{'}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {data.dataSource.dataSourceId}
          </span>
          <span style={{
            fontSize: 8, padding: '1px 4px', borderRadius: 3,
            background: data.dataSource.operation === 'search' ? '#6366f130' : '#8b5cf630',
            color: data.dataSource.operation === 'search' ? '#818cf8' : '#a78bfa',
          }}>
            {data.dataSource.operation === 'search' ? 'AC' : 'SEL'}
          </span>
        </div>
      )}

      {data.dataSource?.dependsOn && (
        <div style={{ fontSize: 8, color: '#f59e0b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
          <span>&#8627;</span>
          <span>{data.dataSource.dependsOn.field}</span>
        </div>
      )}

      {(data.nodeType === 'OBJECT' || data.nodeType === 'ARRAY') && (
        <Handle type="source" position={Position.Bottom} style={{ background: color, width: 7, height: 7, border: 'none' }} />
      )}
    </div>
  );
}
