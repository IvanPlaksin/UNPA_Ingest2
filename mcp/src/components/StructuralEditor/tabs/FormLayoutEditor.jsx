import React, { useCallback, useRef, useMemo } from 'react';
import useStructuralEditorStore from '../../../stores/structuralEditorStore';

const THEMES = {
  dark: {
    bg: '#0d1117', cardBg: '#161b22', cardBgSelected: '#1c2128',
    border: '#30363d', borderHover: '#484f58',
    text: '#e2e8f0', textSecondary: '#8b949e', textMuted: '#484f58',
    inputBg: '#0d1117', inputBorder: '#30363d',
    paletteBg: '#161b22', paletteBorder: '#30363d', paletteCardBg: '#0d1117',
  },
  light: {
    bg: '#ffffff', cardBg: '#f6f8fa', cardBgSelected: '#eef2ff',
    border: '#d0d7de', borderHover: '#8b949e',
    text: '#24292f', textSecondary: '#57606a', textMuted: '#8b949e',
    inputBg: '#ffffff', inputBorder: '#d0d7de',
    paletteBg: '#f6f8fa', paletteBorder: '#d0d7de', paletteCardBg: '#ffffff',
  },
};

const WIDTH_OPTIONS = [
  { value: 'full', label: '100%', cols: 1 },
  { value: 'half', label: '50%', cols: 0.5 },
  { value: 'third', label: '33%', cols: 0.333 },
  { value: 'quarter', label: '25%', cols: 0.25 },
];

const TYPE_COLORS = {
  string: '#3b82f6', text: '#3b82f6', email: '#06b6d4', url: '#06b6d4',
  number: '#f59e0b', integer: '#f59e0b', boolean: '#10b981',
  date: '#8b5cf6', datetime: '#8b5cf6', file: '#ec4899',
};

function FieldCard({ node, index, isSelected, onSelect, onDragStart, onDragOver, onDrop, onWidthChange, t }) {
  const d = node.data;
  const color = TYPE_COLORS[d.dataType] || '#64748b';
  const width = d.uiHints?.width || 'full';
  const widthInfo = WIDTH_OPTIONS.find(w => w.value === width) || WIDTH_OPTIONS[0];

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, index)}
      onClick={() => onSelect(node.id)}
      style={{
        width: `calc(${widthInfo.cols * 100}% - 8px)`,
        minWidth: 140,
        padding: '10px 14px',
        background: isSelected ? t.cardBgSelected : t.cardBg,
        border: `1px solid ${isSelected ? color : t.border}`,
        borderRadius: 8,
        cursor: 'grab',
        transition: 'all 0.15s',
        boxShadow: isSelected ? `0 0 12px ${color}30` : 'none',
        position: 'relative',
      }}
    >
      <div style={{
        position: 'absolute', top: 6, right: 8,
        fontSize: 8, fontWeight: 700, color, textTransform: 'uppercase',
        background: `${color}15`, padding: '1px 5px', borderRadius: 3,
      }}>
        {d.nodeType === 'ENUM' ? 'enum' : d.dataType}
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 2, paddingRight: 50 }}>
        {d.label?.en || d.name}
        {d.required && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
      </div>

      <div style={{ fontSize: 12, color: t.textSecondary }}>{d.name}</div>

      {d.dataSource?.dataSourceId && (
        <div style={{
          marginTop: 4, fontSize: 11, color: '#a78bfa',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <span style={{ fontSize: 13 }}>{'\u26A1'}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
            {d.dataSource.dataSourceId}
          </span>
          <span style={{
            fontSize: 8, padding: '1px 4px', borderRadius: 3,
            background: d.dataSource.operation === 'search' ? '#6366f130' : '#8b5cf630',
            color: d.dataSource.operation === 'search' ? '#818cf8' : '#a78bfa',
          }}>
            {d.dataSource.operation === 'search' ? 'AC' : 'SEL'}
          </span>
          {d.dataSource.dependsOn && (
            <span style={{ fontSize: 8, color: '#f59e0b' }}>
              {'\u2192'} {d.dataSource.dependsOn.field}
            </span>
          )}
        </div>
      )}

      <div style={{
        marginTop: 8, padding: '6px 10px', borderRadius: 4,
        background: t.inputBg, border: `1px solid ${t.inputBorder}`,
        fontSize: 13, color: t.textMuted,
        minHeight: d.uiHints?.widget === 'textarea' ? 50 : 28,
      }}>
        {d.nodeType === 'ENUM'
          ? (d.enumValues?.slice(0, 3).join(' / ') + (d.enumValues?.length > 3 ? ' ...' : ''))
          : d.uiHints?.placeholder?.en || `Enter ${d.dataType || 'text'}...`
        }
      </div>

      <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
        {WIDTH_OPTIONS.map(w => (
          <div
            key={w.value}
            onClick={(e) => { e.stopPropagation(); onWidthChange(node.id, w.value); }}
            title={w.label}
            style={{
              width: 16, height: 8, borderRadius: 2,
              background: width === w.value ? color : t.border,
              cursor: 'pointer', transition: 'background 0.15s',
              border: `1px solid ${width === w.value ? color : t.borderHover}`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function FormLayoutEditor({ theme = 'dark' }) {
  const nodes = useStructuralEditorStore(s => s.nodes);
  const selectedNodeId = useStructuralEditorStore(s => s.selectedNodeId);
  const selectNode = useStructuralEditorStore(s => s.selectNode);
  const updateNode = useStructuralEditorStore(s => s.updateNode);
  const addNode = useStructuralEditorStore(s => s.addNode);
  const FIELD_TYPES = useStructuralEditorStore(s => s.FIELD_TYPES);
  const reorderFields = useStructuralEditorStore(s => s.reorderFields);

  const t = useMemo(() => THEMES[theme] || THEMES.dark, [theme]);
  const dragIdx = useRef(null);

  const fieldNodes = nodes
    .filter(n => n.data?.nodeType !== 'ROOT')
    .sort((a, b) => (a.data?.order ?? 0) - (b.data?.order ?? 0));

  const onDragStart = useCallback((e, index) => {
    dragIdx.current = index;
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((e, targetIndex) => {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === targetIndex) return;
    reorderFields(dragIdx.current, targetIndex);
    dragIdx.current = null;
  }, [reorderFields]);

  const onWidthChange = useCallback((nodeId, width) => {
    updateNode(nodeId, { uiHints: { ...nodes.find(n => n.id === nodeId)?.data?.uiHints, width } });
  }, [updateNode, nodes]);

  const onPaletteDrop = useCallback((e) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('application/structural-field');
    if (data) addNode(JSON.parse(data));
  }, [addNode]);

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Mini palette */}
      <div style={{
        width: 56, background: t.paletteBg, borderRight: `1px solid ${t.paletteBorder}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        padding: '8px 4px', overflow: 'auto',
      }}>
        {FIELD_TYPES.map((ft, i) => (
          <div
            key={i}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/structural-field', JSON.stringify(ft));
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => addNode(ft)}
            title={ft.label}
            style={{
              width: 40, height: 32, borderRadius: 6,
              background: t.paletteCardBg, border: `1px solid ${t.paletteBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: ft.color,
              cursor: 'pointer', transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = ft.color}
            onMouseLeave={e => e.currentTarget.style.borderColor = t.paletteBorder}
          >
            {ft.icon}
          </div>
        ))}
      </div>

      {/* Form layout canvas */}
      <div
        style={{ flex: 1, overflow: 'auto', padding: 20, background: t.bg }}
        onDragOver={onDragOver}
        onDrop={onPaletteDrop}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: t.text, marginBottom: 16 }}>
          {nodes.find(n => n.data?.nodeType === 'ROOT')?.data?.label?.en || 'Form'}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {fieldNodes.map((node, index) => (
            <FieldCard
              key={node.id}
              node={node}
              index={index}
              isSelected={node.id === selectedNodeId}
              onSelect={selectNode}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onWidthChange={onWidthChange}
              t={t}
            />
          ))}

          {fieldNodes.length === 0 && (
            <div style={{
              width: '100%', padding: 40, textAlign: 'center',
              border: `2px dashed ${t.border}`, borderRadius: 8, color: t.textMuted, fontSize: 13,
            }}>
              Drag fields from the palette or click to add
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
