import React from 'react';
import useStructuralEditorStore from '../../stores/structuralEditorStore';

function PaletteItem({ ft, onDragStart, addNode }) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, ft)}
      onClick={() => addNode(ft)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px', borderRadius: 6,
        background: '#0d1117', border: '1px solid #30363d',
        cursor: 'grab', fontSize: 13, color: '#e2e8f0',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = ft.color}
      onMouseLeave={e => e.currentTarget.style.borderColor = '#30363d'}
    >
      <span style={{
        width: 20, height: 20, borderRadius: 4,
        background: `${ft.color}20`, border: `1px solid ${ft.color}60`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700, color: ft.color, flexShrink: 0,
      }}>
        {ft.icon}
      </span>
      <span>{ft.label}</span>
    </div>
  );
}

export default function FieldPalette() {
  const FIELD_TYPES = useStructuralEditorStore(s => s.FIELD_TYPES);
  const addNode = useStructuralEditorStore(s => s.addNode);

  const onDragStart = (e, fieldType) => {
    e.dataTransfer.setData('application/structural-field', JSON.stringify(fieldType));
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div style={{
      width: 180, background: '#161b22', borderRight: '1px solid #30363d',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #30363d', fontSize: 12, fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 1 }}>
        Field Types
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {FIELD_TYPES.filter(ft => !ft.dataType?.startsWith('datasource-')).map((ft, i) => (
          <PaletteItem key={i} ft={ft} onDragStart={onDragStart} addNode={addNode} />
        ))}

        <div style={{ padding: '8px 4px 4px', fontSize: 11, fontWeight: 600, color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: 1, borderTop: '1px solid #30363d', marginTop: 4 }}>
          DataSource
        </div>
        {FIELD_TYPES.filter(ft => ft.dataType?.startsWith('datasource-')).map((ft, i) => (
          <PaletteItem key={`ds-${i}`} ft={ft} onDragStart={onDragStart} addNode={addNode} />
        ))}
      </div>
    </div>
  );
}
