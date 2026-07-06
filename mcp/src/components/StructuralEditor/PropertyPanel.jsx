import React, { useState, useMemo, useCallback } from 'react';
import useStructuralEditorStore from '../../stores/structuralEditorStore';
import FormRenderer from '../Forms/FormRenderer';
import DataSourcePropertySection from './DataSourcePropertySection';

const DATA_TYPES = ['string', 'text', 'email', 'url', 'number', 'integer', 'boolean', 'date', 'datetime', 'file', 'uuid'];
const WIDGETS = ['input', 'textarea', 'select', 'radio', 'checkbox', 'date-picker', 'file-upload', 'autocomplete'];
const WIDTHS = ['full', 'half', 'third', 'quarter'];

const PANEL_WIDTHS = { collapsed: 36, normal: 280, wide: 480 };

// ── Primitive controls ────────────────────────────────────────────────────

function Input({ label, value, onChange, type = 'text', ...rest }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
        {label}
      </label>
      <input
        type={type}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '5px 8px', fontSize: 13,
          background: '#0d1117', border: '1px solid #30363d', borderRadius: 4, color: '#e2e8f0', outline: 'none',
        }}
        onFocus={e => e.target.style.borderColor = '#58a6ff'}
        onBlur={e => e.target.style.borderColor = '#30363d'}
        {...rest}
      />
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
        {label}
      </label>
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '5px 8px', fontSize: 13,
          background: '#0d1117', border: '1px solid #30363d', borderRadius: 4, color: '#e2e8f0', outline: 'none',
        }}
      >
        {options.map(o => {
          const val = typeof o === 'string' ? o : o.value;
          const lbl = typeof o === 'string' ? o : o.label;
          return <option key={val} value={val}>{lbl}</option>;
        })}
      </select>
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <div
        onClick={() => onChange(!value)}
        style={{
          width: 32, height: 18, borderRadius: 9, cursor: 'pointer',
          background: value ? '#238636' : '#30363d', position: 'relative', transition: 'background 0.2s',
        }}
      >
        <div style={{
          width: 14, height: 14, borderRadius: 7, background: '#e2e8f0', position: 'absolute', top: 2,
          left: value ? 16 : 2, transition: 'left 0.2s',
        }} />
      </div>
      <span style={{ fontSize: 13, color: '#8b949e' }}>{label}</span>
    </div>
  );
}

function EnumEditor({ values = [], onChange }) {
  const [newVal, setNewVal] = useState('');
  const add = () => {
    if (newVal.trim() && !values.includes(newVal.trim())) {
      onChange([...values, newVal.trim()]);
      setNewVal('');
    }
  };
  const remove = (idx) => onChange(values.filter((_, i) => i !== idx));

  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', marginBottom: 3 }}>Enum Values</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
        {values.map((v, i) => (
          <span key={i} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', borderRadius: 4, fontSize: 13,
            background: '#10b98120', border: '1px solid #10b98160', color: '#86efac',
          }}>
            {v}
            <span onClick={() => remove(i)} style={{ cursor: 'pointer', color: '#ef4444', fontWeight: 700 }}>x</span>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          value={newVal} onChange={e => setNewVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Add option..."
          style={{ flex: 1, padding: '3px 6px', fontSize: 13, background: '#0d1117', border: '1px solid #30363d', borderRadius: 4, color: '#e2e8f0', outline: 'none' }}
        />
        <button onClick={add} style={{ padding: '3px 8px', fontSize: 13, background: '#238636', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>+</button>
      </div>
    </div>
  );
}

function I18nEditor({ label, value = {}, onChange }) {
  const langs = ['en', 'fr', 'ru', 'es', 'ar', 'zh'];
  const usedLangs = Object.keys(value).filter(k => value[k] !== undefined);
  const availLangs = langs.filter(l => !usedLangs.includes(l));
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', marginBottom: 3 }}>{label}</label>
      {usedLangs.map(lang => (
        <div key={lang} style={{ display: 'flex', gap: 4, marginBottom: 3, alignItems: 'center' }}>
          <span style={{ width: 22, fontSize: 13, fontWeight: 600, color: '#58a6ff', textAlign: 'center' }}>{lang}</span>
          <input
            value={value[lang] || ''} onChange={e => onChange({ ...value, [lang]: e.target.value })}
            style={{ flex: 1, padding: '3px 6px', fontSize: 13, background: '#0d1117', border: '1px solid #30363d', borderRadius: 4, color: '#e2e8f0', outline: 'none' }}
          />
        </div>
      ))}
      {usedLangs.length === 0 && (
        <input placeholder="English label..." onChange={e => onChange({ en: e.target.value })}
          style={{ width: '100%', padding: '3px 6px', fontSize: 13, background: '#0d1117', border: '1px solid #30363d', borderRadius: 4, color: '#e2e8f0', outline: 'none' }}
        />
      )}
      {availLangs.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {showAdd ? (
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {availLangs.map(l => (
                <button key={l} onClick={() => { onChange({ ...value, [l]: '' }); setShowAdd(false); }}
                  style={{ padding: '1px 6px', fontSize: 13, background: '#21262d', color: '#8b949e', border: '1px solid #30363d', borderRadius: 3, cursor: 'pointer' }}>
                  +{l}
                </button>
              ))}
            </div>
          ) : (
            <button onClick={() => setShowAdd(true)} style={{ fontSize: 13, color: '#58a6ff', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>+ Add language</button>
          )}
        </div>
      )}
    </div>
  );
}

function DataSourcePropertySectionWrapper({ node }) {
  const nodes = useStructuralEditorStore(s => s.nodes);
  return (
    <DataSourcePropertySection
      node={node}
      otherFields={nodes.filter(n => n.data?.nodeType === 'FIELD' && n.id !== node?.id)}
    />
  );
}

// ── Field Properties Tab ──────────────────────────────────────────────────

function FieldPropertiesTab({ node, updateNode, removeNode }) {
  const d = node.data;
  const isRoot = d.nodeType === 'ROOT';
  const isEnum = d.nodeType === 'ENUM';
  const update = (key, val) => updateNode(node.id, { [key]: val });

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
      {!isRoot && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button onClick={() => removeNode(node.id)}
            style={{ fontSize: 13, color: '#f85149', background: 'none', border: 'none', cursor: 'pointer' }}>
            Delete Field
          </button>
        </div>
      )}

      <Input label="Field Name" value={d.name} onChange={v => update('name', v)} />
      <I18nEditor label="Label" value={d.label} onChange={v => update('label', v)} />
      <I18nEditor label="Description" value={d.description} onChange={v => update('description', v)} />

      {!isRoot && !isEnum && (
        <Select label="Data Type" value={d.dataType} onChange={v => update('dataType', v)}
          options={DATA_TYPES.map(t => ({ value: t, label: t }))} />
      )}

      {isEnum && (
        <EnumEditor values={d.enumValues} onChange={v => update('enumValues', v)} />
      )}

      {!isRoot && (
        <>
          <Toggle label="Required" value={d.required} onChange={v => update('required', v)} />

          <div style={{ marginTop: 12, padding: '8px 0', borderTop: '1px solid #30363d' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#484f58', textTransform: 'uppercase' }}>UI Hints</span>
          </div>

          <Select label="Widget" value={d.uiHints?.widget || ''} onChange={v => update('uiHints', { ...d.uiHints, widget: v || null })}
            options={[{ value: '', label: '(auto)' }, ...WIDGETS.map(w => ({ value: w, label: w }))]} />

          <Select label="Width" value={d.uiHints?.width || 'full'} onChange={v => update('uiHints', { ...d.uiHints, width: v })}
            options={WIDTHS} />

          <Toggle label="Read-only" value={d.uiHints?.readonly} onChange={v => update('uiHints', { ...d.uiHints, readonly: v })} />

          {(d.dataType === 'text' || d.uiHints?.widget === 'textarea') && (
            <Input label="Rows" value={d.uiHints?.rows} onChange={v => update('uiHints', { ...d.uiHints, rows: parseInt(v) || undefined })} type="number" />
          )}

          <Input label="Default Value" value={d.defaultValue} onChange={v => update('defaultValue', v || undefined)} />

          {/* DataSource binding */}
          <DataSourcePropertySectionWrapper node={node} />
        </>
      )}
    </div>
  );
}

// ── Mini Preview Tab ──────────────────────────────────────────────────────

function MiniPreviewTab({ theme }) {
  const nodes = useStructuralEditorStore(s => s.nodes);

  const formDefinition = useMemo(() => {
    const rootNode = nodes.find(n => n.data?.nodeType === 'ROOT');
    const fieldNodes = nodes
      .filter(n => n.data?.nodeType && n.data.nodeType !== 'ROOT')
      .sort((a, b) => (a.data?.order ?? 0) - (b.data?.order ?? 0));

    return {
      id: 'panel-preview',
      name: rootNode?.data?.label?.en || rootNode?.data?.name || 'Form',
      status: 'ACTIVE',
      sections: [{
        id: 'section_main', title: null, order: 0,
        fields: fieldNodes.map((n, idx) => {
          const d = n.data;
          return {
            id: n.id, name: d.name,
            type: d.nodeType === 'ENUM' ? 'select' : (d.uiHints?.widget === 'textarea' ? 'textarea' : mapDataType(d.dataType)),
            label: d.label?.en || d.name,
            required: d.required || false,
            defaultValue: d.defaultValue,
            order: idx,
            width: d.uiHints?.width || 'full',
            options: d.nodeType === 'ENUM' && d.enumValues ? d.enumValues.map(v => ({ value: v, label: v })) : undefined,
            rows: d.uiHints?.rows,
          };
        }),
      }],
    };
  }, [nodes]);

  const hasFields = nodes.some(n => n.data?.nodeType && n.data.nodeType !== 'ROOT');

  if (!hasFields) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#484f58', fontSize: 13, padding: 16 }}>
        Add fields to see preview
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
      <FormRenderer
        key={`panel-${nodes.length}-${JSON.stringify(nodes.map(n => n.data?.order))}`}
        formDefinition={formDefinition}
        mode="EMBEDDED"
        onSubmit={() => {}}
        submitLabel="Submit"
        layout="vertical"
        spacing={1}
      />
    </div>
  );
}

function mapDataType(dt) {
  const m = { email: 'email', url: 'url', date: 'date', datetime: 'datetime', number: 'number', integer: 'number', boolean: 'boolean', text: 'textarea', file: 'file' };
  return m[dt] || 'text';
}

// ── Main Panel ────────────────────────────────────────────────────────────

const TABS = [
  { id: 'properties', label: 'Properties' },
  { id: 'preview', label: 'Preview' },
];

export default function PropertyPanel({ theme = 'dark' }) {
  const node = useStructuralEditorStore(s => s.getSelectedNode());
  const updateNode = useStructuralEditorStore(s => s.updateNode);
  const removeNode = useStructuralEditorStore(s => s.removeNode);
  const [activeTab, setActiveTab] = useState('properties');
  const [panelWidth, setPanelWidth] = useState(PANEL_WIDTHS.normal);
  const [collapsed, setCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const toggleCollapse = () => setCollapsed(prev => !prev);

  // Drag-resize from left border
  const onResizeStart = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
    const startX = e.clientX;
    const startWidth = panelWidth;

    const onMouseMove = (ev) => {
      const delta = startX - ev.clientX;
      const newWidth = Math.max(200, Math.min(700, startWidth + delta));
      setPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [panelWidth]);

  if (collapsed) {
    return (
      <div style={{
        width: PANEL_WIDTHS.collapsed, background: '#161b22', borderLeft: '1px solid #30363d',
        display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 8,
      }}>
        <button onClick={toggleCollapse} title="Expand panel"
          style={{ padding: '4px', fontSize: 14, background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', transform: 'rotate(180deg)' }}>
          ◂
        </button>
      </div>
    );
  }

  return (
    <div style={{
      width: panelWidth, background: '#161b22',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      position: 'relative', flexShrink: 0,
    }}>
      {/* Resize handle — left border */}
      <div
        onMouseDown={onResizeStart}
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 5,
          cursor: 'col-resize', zIndex: 10,
          background: isDragging ? '#58a6ff' : 'transparent',
          borderLeft: '1px solid #30363d',
          transition: isDragging ? 'none' : 'background 0.15s',
        }}
        onMouseEnter={e => { if (!isDragging) e.currentTarget.style.background = '#58a6ff40'; }}
        onMouseLeave={e => { if (!isDragging) e.currentTarget.style.background = 'transparent'; }}
      />

      {/* Panel header with tabs */}
      <div style={{
        display: 'flex', alignItems: 'center', borderBottom: '1px solid #30363d',
        minHeight: 32, flexShrink: 0, paddingLeft: 6,
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1, padding: '6px 8px', fontSize: 13, fontWeight: 600, border: 'none',
              cursor: 'pointer', transition: 'all 0.15s',
              background: activeTab === tab.id ? '#0d1117' : 'transparent',
              color: activeTab === tab.id ? '#e2e8f0' : '#8b949e',
              borderBottom: activeTab === tab.id ? '2px solid #58a6ff' : '2px solid transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
        <button onClick={toggleCollapse} title="Collapse panel"
          style={{ padding: '4px 6px', fontSize: 14, background: 'none', border: 'none', color: '#484f58', cursor: 'pointer' }}>
          ◂
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'properties' && (
        node ? (
          <FieldPropertiesTab node={node} updateNode={updateNode} removeNode={removeNode} />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#484f58', fontSize: 13 }}>
            Select a field to edit
          </div>
        )
      )}

      {activeTab === 'preview' && (
        <MiniPreviewTab theme={theme} />
      )}
    </div>
  );
}
