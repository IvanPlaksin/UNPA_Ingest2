/**
 * DataSourcePropertySection
 *
 * Configures DataSource binding for a field in the Structural Editor.
 * Allows selecting a DataSource, mode (select / autocomplete),
 * field mapping, cascading dependency, and live testing.
 */

import React, { useState, useEffect, useCallback } from 'react';
import useStructuralEditorStore from '../../stores/structuralEditorStore';
import api from '../../services/api';

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchDataSources() {
  try {
    const res = await api.get('/datasources');
    return res.data?.dataSources || res.data?.data || [];
  } catch {
    return [];
  }
}

async function testDataSourceLoad(dsId, operation, limit = 5) {
  const endpoint = operation === 'search'
    ? `/datasources/${dsId}/search?q=test&limit=${limit}`
    : `/datasources/${dsId}/load?limit=${limit}`;
  const res = await api.get(endpoint);
  return res.data;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DataSourcePropertySection({ node, otherFields = [] }) {
  const updateNodeDataSource = useStructuralEditorStore(s => s.updateNodeDataSource);
  const clearNodeDataSource = useStructuralEditorStore(s => s.clearNodeDataSource);
  const setNodeCascadingDependency = useStructuralEditorStore(s => s.setNodeCascadingDependency);

  const [dataSources, setDataSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(!!node.data.dataSource?.dataSourceId);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  const ds = node.data.dataSource || {};
  const hasDS = !!ds.dataSourceId;

  useEffect(() => {
    setLoading(true);
    fetchDataSources().then(setDataSources).finally(() => setLoading(false));
  }, []);

  // Reset test when node changes
  useEffect(() => { setTestResult(null); }, [node.id]);

  const handleSelectDS = useCallback((e) => {
    const dsId = e.target.value;
    if (!dsId) { clearNodeDataSource(node.id); setTestResult(null); return; }

    const found = dataSources.find(d => (d.graphId || d.id) === dsId);
    updateNodeDataSource(node.id, {
      dataSourceId: dsId,
      operation: node.data.uiHints?.widget === 'autocomplete' ? 'search' : 'loadAll',
      valueField: found?.config?.valueField || null,
      labelField: found?.config?.labelField || null,
      minSearchLength: 2,
      debounceMs: 300,
      dependsOn: null,
    });
    setTestResult(null);
  }, [node.id, dataSources, updateNodeDataSource, clearNodeDataSource]);

  const handleOperationChange = useCallback((e) => {
    updateNodeDataSource(node.id, { ...ds, operation: e.target.value });
  }, [node.id, ds, updateNodeDataSource]);

  const handleFieldMapping = useCallback((key, val) => {
    updateNodeDataSource(node.id, { ...ds, [key]: val || null });
  }, [node.id, ds, updateNodeDataSource]);

  const handleDependency = useCallback((e) => {
    const field = e.target.value;
    setNodeCascadingDependency(node.id, field ? { field, paramName: field } : null);
  }, [node.id, setNodeCascadingDependency]);

  const handleParamName = useCallback((e) => {
    setNodeCascadingDependency(node.id, { ...ds.dependsOn, paramName: e.target.value });
  }, [node.id, ds.dependsOn, setNodeCascadingDependency]);

  const handleTest = useCallback(async () => {
    if (!ds.dataSourceId) return;
    setTesting(true); setTestResult(null);
    try {
      const result = await testDataSourceLoad(ds.dataSourceId, ds.operation, 5);
      setTestResult({ ok: true, data: result });
    } catch (err) {
      setTestResult({ ok: false, error: err.message });
    } finally { setTesting(false); }
  }, [ds.dataSourceId, ds.operation]);

  const cascadingOptions = otherFields.filter(f =>
    f.id !== node.id && f.data.dataSource?.dataSourceId
  );

  // --- Styles ---
  const S = {
    section: { marginTop: 12 },
    header: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      cursor: 'pointer', padding: '6px 0', color: '#c9d1d9',
    },
    headerLeft: { display: 'flex', alignItems: 'center', gap: 6 },
    headerIcon: { fontSize: 14, color: '#8b5cf6' },
    headerLabel: { fontSize: 11, fontWeight: 600 },
    badge: {
      fontSize: 9, padding: '1px 5px', borderRadius: 3,
      background: ds.operation === 'search' ? '#6366f130' : '#8b5cf630',
      color: ds.operation === 'search' ? '#818cf8' : '#a78bfa',
    },
    body: { padding: '4px 0 8px' },
    select: {
      width: '100%', padding: '5px 8px', borderRadius: 4,
      background: '#0d1117', border: '1px solid #30363d', color: '#e2e8f0', fontSize: 11,
      marginBottom: 8,
    },
    input: {
      width: '100%', padding: '5px 8px', borderRadius: 4,
      background: '#0d1117', border: '1px solid #30363d', color: '#e2e8f0', fontSize: 11,
      marginBottom: 8, boxSizing: 'border-box',
    },
    row: { display: 'flex', gap: 6, marginBottom: 8 },
    label: { fontSize: 9, color: '#8b949e', marginBottom: 3, display: 'block' },
    divider: { borderTop: '1px solid #30363d', margin: '8px 0' },
    btn: (color = '#30363d') => ({
      padding: '4px 10px', borderRadius: 4, border: `1px solid ${color}`,
      background: 'transparent', color: '#c9d1d9', fontSize: 10, cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }),
    alert: (ok) => ({
      marginTop: 8, padding: '6px 8px', borderRadius: 4, fontSize: 10,
      background: ok ? '#10b98120' : '#ef444420',
      border: `1px solid ${ok ? '#10b98160' : '#ef444460'}`,
      color: ok ? '#6ee7b7' : '#fca5a5',
    }),
  };

  return (
    <div style={S.section}>
      <div style={S.header} onClick={() => setExpanded(!expanded)}>
        <div style={S.headerLeft}>
          <span style={S.headerIcon}>{'\u26A1'}</span>
          <span style={S.headerLabel}>DataSource</span>
          {hasDS && <span style={S.badge}>{ds.operation === 'search' ? 'Search' : 'Select'}</span>}
        </div>
        <span style={{ fontSize: 10, color: '#8b949e' }}>{expanded ? '\u25B2' : '\u25BC'}</span>
      </div>

      {expanded && (
        <div style={S.body}>
          {/* DataSource selector */}
          <select style={S.select} value={ds.dataSourceId || ''} onChange={handleSelectDS} disabled={loading}>
            <option value="">-- None --</option>
            {dataSources.map(d => (
              <option key={d.graphId || d.id} value={d.graphId || d.id}>
                {d.name || d.graphId || d.id} ({d.sourceType || d.type})
              </option>
            ))}
          </select>

          {hasDS && (
            <>
              {/* Operation mode */}
              <span style={S.label}>Mode</span>
              <select style={S.select} value={ds.operation || 'loadAll'} onChange={handleOperationChange}>
                <option value="loadAll">Select (Load All)</option>
                <option value="search">Autocomplete (Search)</option>
              </select>

              {/* Search options */}
              {ds.operation === 'search' && (
                <div style={S.row}>
                  <div style={{ flex: 1 }}>
                    <span style={S.label}>Min chars</span>
                    <input type="number" style={S.input} min={1} max={10}
                      value={ds.minSearchLength || 2}
                      onChange={e => handleFieldMapping('minSearchLength', parseInt(e.target.value))} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={S.label}>Debounce ms</span>
                    <input type="number" style={S.input} min={0} max={2000} step={100}
                      value={ds.debounceMs || 300}
                      onChange={e => handleFieldMapping('debounceMs', parseInt(e.target.value))} />
                  </div>
                </div>
              )}

              {/* Field mapping */}
              <span style={S.label}>Field Mapping (override defaults)</span>
              <div style={S.row}>
                <div style={{ flex: 1 }}>
                  <input style={S.input} placeholder="valueField (auto)"
                    value={ds.valueField || ''}
                    onChange={e => handleFieldMapping('valueField', e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <input style={S.input} placeholder="labelField (auto)"
                    value={ds.labelField || ''}
                    onChange={e => handleFieldMapping('labelField', e.target.value)} />
                </div>
              </div>

              {/* Cascading dependency */}
              {cascadingOptions.length > 0 && (
                <>
                  <span style={S.label}>Depends On</span>
                  <select style={S.select} value={ds.dependsOn?.field || ''} onChange={handleDependency}>
                    <option value="">-- Independent --</option>
                    {cascadingOptions.map(f => (
                      <option key={f.id} value={f.data.name}>{f.data.name}</option>
                    ))}
                  </select>
                </>
              )}

              {ds.dependsOn && (
                <>
                  <span style={S.label}>Param Name</span>
                  <input style={S.input}
                    value={ds.dependsOn.paramName || ''}
                    onChange={handleParamName}
                    placeholder="Query parameter name" />
                </>
              )}

              <div style={S.divider} />

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={S.btn('#8b5cf6')} onClick={handleTest} disabled={testing}>
                  {testing ? '...' : 'Test'}
                </button>
                <button style={S.btn('#ef4444')} onClick={() => { clearNodeDataSource(node.id); setTestResult(null); }}>
                  Remove
                </button>
              </div>

              {/* Test result */}
              {testResult && (
                <div style={S.alert(testResult.ok)}>
                  {testResult.ok ? (
                    <>
                      <div>Loaded {testResult.data.items?.length || 0} items (total: {testResult.data.total ?? '?'})</div>
                      {testResult.data.items?.slice(0, 3).map((item, i) => (
                        <div key={i} style={{ marginTop: 2 }}>{'\u2022'} {item.label} ({item.value})</div>
                      ))}
                    </>
                  ) : (
                    <div>Error: {testResult.error}</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
