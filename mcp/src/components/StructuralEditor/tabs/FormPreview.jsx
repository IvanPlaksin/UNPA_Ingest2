import React, { useState, useMemo } from 'react';
import useStructuralEditorStore from '../../../stores/structuralEditorStore';
import FormRenderer from '../../Forms/FormRenderer';

const THEMES = {
  dark: {
    bg: '#0d1117', cardBg: '#161b22', border: '#30363d',
    text: '#e2e8f0', textSecondary: '#8b949e', textMuted: '#484f58',
    btnBg: '#30363d', btnText: '#e2e8f0',
    successBg: '#23863620', successBorder: '#238636', successText: '#3fb950',
  },
  light: {
    bg: '#ffffff', cardBg: '#f6f8fa', border: '#d0d7de',
    text: '#24292f', textSecondary: '#57606a', textMuted: '#8b949e',
    btnBg: '#e1e4e8', btnText: '#24292f',
    successBg: '#dafbe1', successBorder: '#34d058', successText: '#116329',
  },
};

/**
 * Build a FormDefinition directly from editor store state (no API call).
 * This ensures Preview always reflects current unsaved edits.
 */
function buildFormDefinitionFromStore(nodes, locale) {
  const rootNode = nodes.find(n => n.data?.nodeType === 'ROOT');
  const fieldNodes = nodes
    .filter(n => n.data?.nodeType && n.data.nodeType !== 'ROOT')
    .sort((a, b) => (a.data?.order ?? 0) - (b.data?.order ?? 0));

  const fields = fieldNodes.map((n, idx) => {
    const d = n.data;
    return {
      id: n.id,
      name: d.name,
      type: mapType(d),
      label: d.label?.[locale] || d.label?.en || d.name,
      description: d.description?.[locale] || d.description?.en,
      required: d.required || false,
      defaultValue: d.defaultValue,
      placeholder: d.uiHints?.placeholder?.[locale] || d.uiHints?.placeholder?.en,
      disabled: d.uiHints?.readonly || false,
      readOnly: d.uiHints?.readonly || false,
      order: idx,
      width: d.uiHints?.width || 'full',
      options: d.nodeType === 'ENUM' && d.enumValues
        ? d.enumValues.map(v => ({
            value: v,
            label: d.enumLabels?.[v]?.[locale] || d.enumLabels?.[v]?.en || v,
          }))
        : undefined,
      rows: d.uiHints?.rows,
    };
  });

  return {
    id: 'preview-form',
    name: rootNode?.data?.label?.[locale] || rootNode?.data?.label?.en || rootNode?.data?.name || 'Form',
    description: rootNode?.data?.description?.[locale] || rootNode?.data?.description?.en,
    status: 'ACTIVE',
    sections: [{
      id: 'section_main',
      title: null,
      order: 0,
      fields,
    }],
  };
}

function mapType(d) {
  if (d.nodeType === 'ENUM') return 'select';
  if (d.uiHints?.widget === 'textarea') return 'textarea';
  if (d.uiHints?.widget === 'radio') return 'select';
  const m = {
    email: 'email', url: 'url', date: 'date', datetime: 'datetime',
    number: 'number', integer: 'number', boolean: 'boolean',
    text: 'textarea', file: 'file',
  };
  return m[d.dataType] || 'text';
}

export default function FormPreview({ theme = 'dark' }) {
  const nodes = useStructuralEditorStore(s => s.nodes);
  const [locale, setLocale] = useState('en');
  const [submittedData, setSubmittedData] = useState(null);

  const t = THEMES[theme] || THEMES.dark;

  // Build FormDefinition from current store state (live preview)
  const formDefinition = useMemo(
    () => buildFormDefinitionFromStore(nodes, locale),
    [nodes, locale]
  );

  const hasFields = nodes.some(n => n.data?.nodeType && n.data.nodeType !== 'ROOT');

  return (
    <div style={{ flex: 1, overflow: 'auto', background: t.bg }}>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: 24 }}>
        {/* Locale selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: t.textSecondary, textTransform: 'uppercase' }}>
            Live Preview
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 9, color: t.textMuted }}>Locale:</span>
          {['en', 'fr', 'ru'].map(l => (
            <button
              key={l}
              onClick={() => { setLocale(l); setSubmittedData(null); }}
              style={{
                padding: '2px 8px', fontSize: 10, fontWeight: 600, borderRadius: 4,
                border: 'none', cursor: 'pointer',
                background: locale === l ? t.btnBg : 'transparent',
                color: locale === l ? t.btnText : t.textSecondary,
              }}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>

        {!hasFields ? (
          <div style={{
            padding: 40, textAlign: 'center', color: t.textMuted, fontSize: 12,
            border: `1px dashed ${t.border}`, borderRadius: 8,
          }}>
            Add fields in the Form Editor tab to see the preview.
          </div>
        ) : (
          <div style={{
            background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, padding: 20,
          }}>
            <FormRenderer
              key={`preview-${locale}-${theme}-${nodes.length}`}
              formDefinition={formDefinition}
              mode="EMBEDDED"
              onSubmit={(data) => setSubmittedData(data)}
              submitLabel="Submit"
              showCancel
              onCancel={() => setSubmittedData(null)}
              cancelLabel="Clear"
              locale={locale}
              layout="vertical"
              spacing={2}
            />
          </div>
        )}

        {submittedData && (
          <div style={{
            marginTop: 16, padding: 12,
            background: t.successBg, border: `1px solid ${t.successBorder}`, borderRadius: 8,
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: t.successText, marginBottom: 6 }}>Submitted data:</div>
            <pre style={{ fontSize: 10, color: t.textSecondary, margin: 0, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
              {JSON.stringify(submittedData, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
