import React, { useEffect, useState, useCallback } from 'react';
import { ReactFlowProvider } from 'reactflow';
import useStructuralEditorStore from '../../stores/structuralEditorStore';
import EditorToolbar from './EditorToolbar';
import PropertyPanel from './PropertyPanel';
import FormLayoutEditor from './tabs/FormLayoutEditor';
import GraphView from './tabs/GraphView';
import FormPreview from './tabs/FormPreview';
import DataSourceCatalog from './tabs/DataSourceCatalog';

const TABS = [
  { id: 'layout', label: 'Form Editor', icon: '⊞' },
  { id: 'graph', label: 'Graph View', icon: '⬡' },
  { id: 'preview', label: 'Preview', icon: '▶' },
  { id: 'datasources', label: 'DataSources', icon: '⚡' },
];

const STORAGE_KEY = 'structural_editor_preview_theme';

export default function StructuralFormEditor({ initialGraphId }) {
  const loadGraph = useStructuralEditorStore(s => s.loadGraph);
  const newGraph = useStructuralEditorStore(s => s.newGraph);
  const isLoading = useStructuralEditorStore(s => s.isLoading);
  const error = useStructuralEditorStore(s => s.error);
  const graphName = useStructuralEditorStore(s => s.graphName);

  const [activeTab, setActiveTab] = useState('layout');
  const [previewTheme, setPreviewTheme] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || 'dark'; } catch { return 'dark'; }
  });

  const toggleTheme = useCallback(() => {
    setPreviewTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(STORAGE_KEY, next); } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    if (initialGraphId) {
      loadGraph(initialGraphId);
    } else if (!graphName) {
      newGraph('New Form');
    }
  }, [initialGraphId]);

  const showPropertyPanel = activeTab === 'layout' || activeTab === 'graph';
  const showThemeToggle = activeTab === 'layout' || activeTab === 'preview';

  return (
    <ReactFlowProvider>
      <div style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: '#0d1117', color: '#e2e8f0',
      }}>
        <EditorToolbar />

        {/* Tab bar */}
        <div style={{
          minHeight: 36, background: '#161b22', borderBottom: '1px solid #30363d',
          display: 'flex', alignItems: 'center', paddingLeft: 12, paddingRight: 4, gap: 2,
          flexShrink: 0,
        }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '5px 14px', fontSize: 11, fontWeight: 500, border: 'none',
                borderRadius: '6px 6px 0 0', cursor: 'pointer',
                transition: 'all 0.15s',
                background: activeTab === tab.id ? '#0d1117' : 'transparent',
                color: activeTab === tab.id ? '#e2e8f0' : '#8b949e',
                borderBottom: activeTab === tab.id ? '2px solid #58a6ff' : '2px solid transparent',
              }}
            >
              <span style={{ marginRight: 5 }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}

          <div style={{ flex: 1 }} />

          {/* Theme toggle */}
          {showThemeToggle && (
            <button
              onClick={toggleTheme}
              title={previewTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              style={{
                marginRight: 8, padding: '4px 12px', fontSize: 11, fontWeight: 600,
                border: previewTheme === 'light' ? '1px solid #d0d7de' : '1px solid #484f58',
                borderRadius: 6, cursor: 'pointer',
                background: previewTheme === 'light' ? '#ffffff' : '#30363d',
                color: previewTheme === 'light' ? '#24292f' : '#e2e8f0',
                transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: 5,
                lineHeight: 1,
              }}
            >
              <span style={{ fontSize: 14 }}>{previewTheme === 'dark' ? '\u2600' : '\u263E'}</span>
              {previewTheme === 'dark' ? 'Light' : 'Dark'}
            </button>
          )}
        </div>

        {isLoading && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e' }}>
            Loading graph...
          </div>
        )}

        {error && (
          <div style={{ padding: 12, background: '#da363320', border: '1px solid #da3633', borderRadius: 6, margin: 8, fontSize: 11, color: '#f85149' }}>
            {error}
          </div>
        )}

        {!isLoading && !error && (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {activeTab === 'layout' && <FormLayoutEditor theme={previewTheme} />}
            {activeTab === 'graph' && <GraphView />}
            {activeTab === 'preview' && <FormPreview theme={previewTheme} />}
            {activeTab === 'datasources' && <DataSourceCatalog />}

            {showPropertyPanel && <PropertyPanel theme={previewTheme} />}
          </div>
        )}
      </div>
    </ReactFlowProvider>
  );
}
