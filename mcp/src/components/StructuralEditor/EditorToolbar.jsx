import React, { useState } from 'react';
import useStructuralEditorStore from '../../stores/structuralEditorStore';
import { listStructuralGraphs } from '../../services/api';

export default function EditorToolbar() {
  const { graphId, graphName, namespace, isDirty, isSaving, saveGraph, newGraph, loadGraph, toJSON } = useStructuralEditorStore();
  const [showGraphList, setShowGraphList] = useState(false);
  const [graphs, setGraphs] = useState([]);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const canUndo = useStructuralEditorStore(s => s.historyIndex > 0);
  const canRedo = useStructuralEditorStore(s => s.historyIndex < s.history.length - 1);
  const undo = useStructuralEditorStore(s => s.undo);
  const redo = useStructuralEditorStore(s => s.redo);

  const openGraphList = async () => {
    try {
      const data = await listStructuralGraphs();
      setGraphs(data || []);
      setShowGraphList(true);
    } catch { setGraphs([]); setShowGraphList(true); }
  };

  const selectGraph = (gid) => {
    loadGraph(gid);
    setShowGraphList(false);
  };

  const createNew = () => {
    if (newName.trim()) {
      newGraph(newName.trim());
      setShowNewDialog(false);
      setNewName('');
    }
  };

  const exportJSON = () => {
    const json = toJSON();
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${graphName || 'structural'}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const btnStyle = (active) => ({
    padding: '4px 10px', fontSize: 12, fontWeight: 500, border: 'none', borderRadius: 4,
    cursor: 'pointer', transition: 'background 0.15s',
    background: active ? '#30363d' : 'transparent', color: active ? '#e2e8f0' : '#8b949e',
  });

  const accentBtn = (color = '#238636') => ({
    ...btnStyle(true), background: color, color: '#fff',
  });

  return (
    <div style={{
      height: 40, background: '#161b22', borderBottom: '1px solid #30363d',
      display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6,
    }}>
      {/* Graph selector */}
      <button style={btnStyle(false)} onClick={openGraphList}>Open</button>
      <button style={btnStyle(false)} onClick={() => setShowNewDialog(true)}>New</button>

      <div style={{ width: 1, height: 20, background: '#30363d', margin: '0 4px' }} />

      {/* Graph name */}
      <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {graphName || 'No form loaded'}
      </span>
      {namespace && (
        <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 3, background: '#21262d', color: '#8b949e', fontWeight: 600 }}>
          {namespace}
        </span>
      )}
      {isDirty && <span style={{ fontSize: 12, color: '#d29922', fontWeight: 600 }}>Unsaved</span>}

      <div style={{ flex: 1 }} />

      {/* Undo/Redo */}
      <button style={{ ...btnStyle(false), opacity: canUndo ? 1 : 0.3 }} onClick={undo} disabled={!canUndo} title="Undo">↶</button>
      <button style={{ ...btnStyle(false), opacity: canRedo ? 1 : 0.3 }} onClick={redo} disabled={!canRedo} title="Redo">↷</button>

      <div style={{ width: 1, height: 20, background: '#30363d', margin: '0 4px' }} />

      <button style={btnStyle(false)} onClick={exportJSON}>Export</button>
      <button
        style={accentBtn(isDirty ? '#238636' : '#30363d')}
        onClick={saveGraph}
        disabled={isSaving || !graphName}
      >
        {isSaving ? 'Saving...' : 'Save'}
      </button>

      {/* Graph list dropdown */}
      {showGraphList && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowGraphList(false)}>
          <div style={{
            background: '#161b22', border: '1px solid #30363d', borderRadius: 8,
            width: 400, maxHeight: 500, overflow: 'auto', padding: 16,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 12 }}>
              Open STRUCTURAL Graph
            </div>
            {graphs.length === 0 && (
              <div style={{ color: '#484f58', fontSize: 13, padding: 20, textAlign: 'center' }}>No graphs found</div>
            )}
            {graphs.map(g => (
              <div key={g.graphId}
                onClick={() => selectGraph(g.graphId)}
                style={{
                  padding: '10px 12px', borderRadius: 6, cursor: 'pointer', marginBottom: 4,
                  background: g.graphId === graphId ? '#21262d' : 'transparent',
                  border: '1px solid transparent',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#30363d'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
              >
                <div style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0' }}>{g.name}</div>
                <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>
                  {g.namespace} &middot; {g.nodeCount} fields
                  {g.constraintRuleCount && ` &middot; ${g.constraintRuleCount} rules`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New dialog */}
      {showNewDialog && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowNewDialog(false)}>
          <div style={{
            background: '#161b22', border: '1px solid #30363d', borderRadius: 8,
            width: 350, padding: 20,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 12 }}>New STRUCTURAL Form</div>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createNew()}
              placeholder="Form name..."
              style={{
                width: '100%', padding: '8px 12px', fontSize: 13,
                background: '#0d1117', border: '1px solid #30363d', borderRadius: 6, color: '#e2e8f0', outline: 'none',
                marginBottom: 12,
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={btnStyle(true)} onClick={() => setShowNewDialog(false)}>Cancel</button>
              <button style={accentBtn()} onClick={createNew}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
