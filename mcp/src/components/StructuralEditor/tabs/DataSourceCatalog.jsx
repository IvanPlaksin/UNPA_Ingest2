/**
 * DataSourceCatalog — tab in the Structural Editor
 *
 * Left panel:  list of DataSources with search / type filter
 * Right panel: editor form for the selected or new DataSource
 */

import React, { useEffect, useState, useCallback } from 'react';
import useDataSourceCatalogStore from '../../../stores/dataSourceCatalogStore';
import api from '../../../services/api';

// ─── Constants ───────────────────────────────────────────────────────────────

const SOURCE_TYPES = ['SQL', 'KB', 'API', 'FILE', 'COMPOSITE'];
const CACHE_STRATEGIES = ['none', 'session', 'ttl', 'static'];
const COLORS = { SQL: '#3b82f6', KB: '#8b5cf6', API: '#10b981', FILE: '#f59e0b', COMPOSITE: '#ec4899' };
const ICONS = { SQL: '\u{1F5C4}', KB: '\u{1F50D}', API: '\u{1F310}', FILE: '\u{1F4C4}', COMPOSITE: '\u{1F517}' };

// ─── Shared styles (dark theme matching editor) ──────────────────────────────

const S = {
  page: { display: 'flex', height: '100%', background: '#0d1117', color: '#e2e8f0' },
  sidebar: { width: 280, borderRight: '1px solid #30363d', display: 'flex', flexDirection: 'column' },
  main: { flex: 1, overflow: 'auto', padding: 16 },
  input: { width: '100%', padding: '6px 8px', borderRadius: 4, background: '#161b22', border: '1px solid #30363d', color: '#e2e8f0', fontSize: 13, boxSizing: 'border-box', outline: 'none' },
  select: { width: '100%', padding: '6px 8px', borderRadius: 4, background: '#161b22', border: '1px solid #30363d', color: '#e2e8f0', fontSize: 13 },
  textarea: { width: '100%', padding: '6px 8px', borderRadius: 4, background: '#161b22', border: '1px solid #30363d', color: '#e2e8f0', fontSize: 13, fontFamily: 'monospace', minHeight: 80, boxSizing: 'border-box', outline: 'none', resize: 'vertical' },
  label: { fontSize: 13, color: '#8b949e', marginBottom: 3, display: 'block' },
  row: { display: 'flex', gap: 8, marginBottom: 10 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: '#58a6ff', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  btn: (bg = '#238636', fg = '#fff') => ({ padding: '6px 14px', borderRadius: 6, border: 'none', background: bg, color: fg, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }),
  btnSm: (bg = '#21262d', fg = '#c9d1d9') => ({ padding: '4px 10px', borderRadius: 4, border: '1px solid #30363d', background: bg, color: fg, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }),
  alert: (ok) => ({ padding: '8px 10px', borderRadius: 4, fontSize: 13, marginTop: 8, background: ok ? '#10b98115' : '#ef444415', border: `1px solid ${ok ? '#10b98150' : '#ef444450'}`, color: ok ? '#86efac' : '#fca5a5' }),
  chip: (color) => ({ fontSize: 13, padding: '2px 6px', borderRadius: 4, background: `${color}25`, color, fontWeight: 600 }),
};

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function DataSourceCatalog() {
  const store = useDataSourceCatalogStore();
  const { dataSources, selectedId, loading, error, filter, editMode, draft } = store;

  useEffect(() => { store.fetchAll(); }, []);

  const filtered = dataSources.filter(ds => {
    if (filter.sourceType && ds.sourceType !== filter.sourceType) return false;
    if (filter.search) {
      const q = filter.search.toLowerCase();
      return (ds.name || '').toLowerCase().includes(q) || (ds.graphId || ds.id || '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div style={S.page}>
      {/* ── LEFT: List ─────────────────────────────────────────────────────── */}
      <div style={S.sidebar}>
        <div style={{ padding: 10, borderBottom: '1px solid #30363d' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>DataSources</span>
            <NewDataSourceDropdown onCreate={(type) => store.startCreate(type)} />
          </div>
          <input
            style={{ ...S.input, marginBottom: 6 }}
            placeholder="Search..."
            value={filter.search}
            onChange={e => store.setFilter('search', e.target.value)}
          />
          <select style={S.select} value={filter.sourceType} onChange={e => store.setFilter('sourceType', e.target.value)}>
            <option value="">All Types</option>
            {SOURCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {loading && dataSources.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: '#8b949e' }}>Loading...</div>}
          {!loading && filtered.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: '#8b949e', fontSize: 13 }}>No DataSources found</div>}
          {filtered.map(ds => {
            const id = ds.graphId || ds.id;
            const active = selectedId === id;
            const color = COLORS[ds.sourceType] || '#888';
            return (
              <div
                key={id}
                onClick={() => { store.select(id); store.cancelEdit(); }}
                style={{
                  padding: '8px 12px', cursor: 'pointer', borderLeft: `3px solid ${active ? color : 'transparent'}`,
                  background: active ? '#161b22' : 'transparent', transition: 'background 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{ICONS[ds.sourceType] || ''}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ds.name || id}</span>
                  <span style={S.chip(color)}>{ds.sourceType || ds.type}</span>
                </div>
                {ds.config?.description && (
                  <div style={{ fontSize: 13, color: '#8b949e', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ds.config.description}</div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ padding: 8, borderTop: '1px solid #30363d', fontSize: 13, color: '#484f58', textAlign: 'center' }}>
          {dataSources.length} DataSource{dataSources.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* ── RIGHT: Editor / Detail ─────────────────────────────────────────── */}
      <div style={S.main}>
        {error && <div style={S.alert(false)}>{error} <span style={{ cursor: 'pointer', marginLeft: 8 }} onClick={store.clearError}>x</span></div>}

        {editMode && draft ? (
          <DataSourceEditor />
        ) : selectedId ? (
          <DataSourceDetail ds={dataSources.find(d => (d.graphId || d.id) === selectedId)} />
        ) : (
          <EmptyState onNew={() => store.startCreate('SQL')} />
        )}
      </div>
    </div>
  );
}

// ─── EMPTY STATE ─────────────────────────────────────────────────────────────

function EmptyState({ onNew }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#484f58' }}>
      <span style={{ fontSize: 48, opacity: 0.3 }}>{'\u{1F5C4}'}</span>
      <p style={{ marginTop: 12 }}>Select a DataSource or create a new one</p>
      <NewDataSourceDropdown onCreate={onNew} />
    </div>
  );
}

// ─── NEW DATASOURCE TYPE SELECTOR ────────────────────────────────────────────

function NewDataSourceDropdown({ onCreate }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button style={S.btnSm('#238636', '#fff')} onClick={() => setOpen(!open)}>
        + New {open ? '\u25B2' : '\u25BC'}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 100,
          background: '#161b22', border: '1px solid #30363d', borderRadius: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,.4)', minWidth: 180, overflow: 'hidden',
        }}>
          {SOURCE_TYPES.map(type => (
            <div
              key={type}
              onClick={() => { onCreate(type); setOpen(false); }}
              style={{
                padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 13, color: '#e2e8f0', borderBottom: '1px solid #21262d',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#21262d'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span>{ICONS[type]}</span>
              <span style={{ flex: 1 }}>{TYPE_LABELS[type]}</span>
              <span style={S.chip(COLORS[type])}>{type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TYPE_LABELS = {
  SQL: 'SQL Database',
  KB: 'Knowledge Base',
  API: 'REST API',
  FILE: 'File (JSON/CSV)',
  COMPOSITE: 'Composite (Join)',
};

// ─── DETAIL VIEW ─────────────────────────────────────────────────────────────

function DataSourceDetail({ ds }) {
  const store = useDataSourceCatalogStore();
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!ds) return <EmptyState onNew={() => store.startCreate('SQL')} />;

  const id = ds.graphId || ds.id;
  const color = COLORS[ds.sourceType] || '#888';

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const result = await store.test(id);
      setTestResult({ ok: true, data: result });
    } catch (err) { setTestResult({ ok: false, error: err.message }); }
    finally { setTesting(false); }
  };

  const handleDelete = async () => {
    await store.remove(id);
    setConfirmDelete(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>{ICONS[ds.sourceType]}</span>
            <h3 style={{ margin: 0, fontSize: 16 }}>{ds.name || id}</h3>
            <span style={S.chip(color)}>{ds.sourceType}</span>
          </div>
          {ds.config?.description && <p style={{ fontSize: 13, color: '#8b949e', margin: '4px 0 0' }}>{ds.config.description}</p>}
          <div style={{ fontSize: 13, color: '#484f58', marginTop: 4 }}>ID: {id}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={S.btnSm()} onClick={handleTest} disabled={testing}>{testing ? '...' : 'Test'}</button>
          <button style={S.btnSm()} onClick={() => store.startEdit(ds)}>Edit</button>
          <button style={S.btnSm('#da3633', '#fff')} onClick={() => setConfirmDelete(true)}>Delete</button>
        </div>
      </div>

      {/* Config summary */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Output Mapping</div>
        <div style={S.row}>
          <InfoField label="Value Field" value={ds.config?.valueField} />
          <InfoField label="Label Field" value={ds.config?.labelField} />
        </div>
        <div style={S.row}>
          <InfoField label="Cache" value={`${ds.config?.cacheStrategy} (TTL: ${ds.config?.cacheTTL}s)`} />
          <InfoField label="Limits" value={`${ds.config?.defaultLimit} / ${ds.config?.maxLimit}`} />
        </div>
      </div>

      {/* Type-specific config */}
      {ds.sourceType === 'SQL' && ds.sqlConfig && <SqlConfigView cfg={ds.sqlConfig} />}
      {ds.sourceType === 'KB' && ds.kbConfig && <KbConfigView cfg={ds.kbConfig} />}
      {ds.sourceType === 'API' && ds.apiConfig && <ApiConfigView cfg={ds.apiConfig} />}
      {ds.sourceType === 'FILE' && ds.fileConfig && <FileConfigView cfg={ds.fileConfig} />}
      {ds.sourceType === 'COMPOSITE' && ds.compositeConfig && <CompositeConfigView cfg={ds.compositeConfig} />}

      {/* Test result */}
      {testResult && (
        <div style={S.alert(testResult.ok)}>
          {testResult.ok ? (
            <>
              <div style={{ fontWeight: 600 }}>Loaded {testResult.data.items?.length || 0} items (total: {testResult.data.total ?? '?'})</div>
              {(testResult.data.items || []).slice(0, 5).map((item, i) => (
                <div key={i} style={{ marginTop: 2, fontSize: 13 }}>{'\u2022'} {item.label || item.name} ({item.value || item.id})</div>
              ))}
            </>
          ) : <div>Error: {testResult.error}</div>}
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{ ...S.alert(false), display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
          <span>Delete "{ds.name}"? This cannot be undone.</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={S.btnSm()} onClick={() => setConfirmDelete(false)}>Cancel</button>
            <button style={S.btnSm('#da3633', '#fff')} onClick={handleDelete}>Confirm Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoField({ label, value }) {
  return (
    <div style={{ flex: 1 }}>
      <span style={S.label}>{label}</span>
      <div style={{ fontSize: 13, color: '#c9d1d9' }}>{value || '-'}</div>
    </div>
  );
}

function SqlConfigView({ cfg }) {
  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>SQL Configuration</div>
      <InfoField label="Connection" value={cfg.connectionId} />
      {cfg.query && <CodeBlock label="Query" code={cfg.query} />}
      {cfg.searchQuery && <CodeBlock label="Search Query" code={cfg.searchQuery} />}
      {cfg.countQuery && <CodeBlock label="Count Query" code={cfg.countQuery} />}
    </div>
  );
}

function KbConfigView({ cfg }) {
  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>Knowledge Base Configuration</div>
      <div style={S.row}><InfoField label="Query Type" value={cfg.queryType} /><InfoField label="Namespace" value={cfg.namespace || '-'} /></div>
      {cfg.cypherQuery && <CodeBlock label="Cypher Query" code={cfg.cypherQuery} />}
      {cfg.cypherSearchQuery && <CodeBlock label="Cypher Search" code={cfg.cypherSearchQuery} />}
      {cfg.queryType === 'vector' && <div style={S.row}><InfoField label="Collection" value={cfg.collection} /><InfoField label="Threshold" value={cfg.similarityThreshold} /></div>}
    </div>
  );
}

function ApiConfigView({ cfg }) {
  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>API Configuration</div>
      <div style={S.row}><InfoField label="Method" value={cfg.method} /><InfoField label="Auth" value={cfg.authType} /></div>
      <InfoField label="Endpoint" value={cfg.endpoint} />
      <div style={S.row}><InfoField label="Response Path" value={cfg.responsePath} /><InfoField label="Total Path" value={cfg.totalPath} /></div>
    </div>
  );
}

function FileConfigView({ cfg }) {
  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>File Configuration</div>
      <InfoField label="File Path" value={cfg.filePath} />
      <div style={S.row}><InfoField label="Format" value={cfg.format} /><InfoField label="Encoding" value={cfg.encoding} /></div>
      {cfg.format === 'csv' && <div style={S.row}><InfoField label="Delimiter" value={cfg.delimiter} /><InfoField label="Has Header" value={String(cfg.hasHeader)} /></div>}
    </div>
  );
}

function CompositeConfigView({ cfg }) {
  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>Composite Configuration</div>
      <InfoField label="Merge Strategy" value={cfg.mergeStrategy} />
      {(cfg.sources || []).map((s, i) => (
        <div key={i} style={{ fontSize: 13, color: '#c9d1d9', marginTop: 4 }}>{'\u2022'} {s.dataSourceId} ({s.role}{s.joinField ? `, join: ${s.joinField}` : ''})</div>
      ))}
    </div>
  );
}

function CodeBlock({ label, code }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <span style={S.label}>{label}</span>
      <pre style={{ ...S.textarea, minHeight: 40, maxHeight: 120, overflow: 'auto', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{code}</pre>
    </div>
  );
}

// ─── EDITOR FORM ─────────────────────────────────────────────────────────────

function DataSourceEditor() {
  const store = useDataSourceCatalogStore();
  const { draft, editMode, loading } = store;

  if (!draft) return null;

  const isNew = editMode === 'create';
  const set = (path, val) => store.setDraft(path, val);

  const handleSave = async () => {
    if (!draft.name) { store.setDraft('name', 'error'); return; }
    try { await store.save(); } catch { /* error in store */ }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{isNew ? 'New DataSource' : `Edit: ${draft.name}`}</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={S.btnSm()} onClick={store.cancelEdit}>Cancel</button>
          <button style={S.btn()} onClick={handleSave} disabled={loading || !draft.name}>{loading ? 'Saving...' : 'Save'}</button>
        </div>
      </div>

      {/* Basic info */}
      <div style={S.section}>
        <div style={S.sectionTitle}>General</div>
        <div style={S.row}>
          <div style={{ flex: 2 }}>
            <span style={S.label}>Name *</span>
            <input style={S.input} value={draft.name} onChange={e => set('name', e.target.value)} placeholder="e.g. DS_UNDutyStations" />
          </div>
          <div style={{ flex: 1 }}>
            <span style={S.label}>Source Type</span>
            <select style={S.select} value={draft.sourceType} onChange={e => store.switchSourceType(e.target.value)} disabled={!isNew}>
              {SOURCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <span style={S.label}>Namespace</span>
            <input style={S.input} value={draft.namespace} onChange={e => set('namespace', e.target.value)} />
          </div>
        </div>
        <span style={S.label}>Description</span>
        <input style={S.input} value={draft.config?.description || ''} onChange={e => set('config.description', e.target.value)} placeholder="Brief description" />
      </div>

      {/* Output mapping */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Output Mapping</div>
        <div style={S.row}>
          <div style={{ flex: 1 }}><span style={S.label}>Value Field</span><input style={S.input} value={draft.config?.valueField || ''} onChange={e => set('config.valueField', e.target.value)} /></div>
          <div style={{ flex: 1 }}><span style={S.label}>Label Field</span><input style={S.input} value={draft.config?.labelField || ''} onChange={e => set('config.labelField', e.target.value)} /></div>
        </div>
        <div style={S.row}>
          <div style={{ flex: 1 }}><span style={S.label}>Cache Strategy</span>
            <select style={S.select} value={draft.config?.cacheStrategy || 'ttl'} onChange={e => set('config.cacheStrategy', e.target.value)}>
              {CACHE_STRATEGIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}><span style={S.label}>Cache TTL (s)</span><input style={S.input} type="number" value={draft.config?.cacheTTL || 3600} onChange={e => set('config.cacheTTL', parseInt(e.target.value))} /></div>
          <div style={{ flex: 1 }}><span style={S.label}>Default Limit</span><input style={S.input} type="number" value={draft.config?.defaultLimit || 100} onChange={e => set('config.defaultLimit', parseInt(e.target.value))} /></div>
          <div style={{ flex: 1 }}><span style={S.label}>Max Limit</span><input style={S.input} type="number" value={draft.config?.maxLimit || 1000} onChange={e => set('config.maxLimit', parseInt(e.target.value))} /></div>
        </div>
      </div>

      {/* Type-specific config */}
      {draft.sourceType === 'SQL' && <SqlEditor draft={draft} set={set} />}
      {draft.sourceType === 'KB' && <KbEditor draft={draft} set={set} />}
      {draft.sourceType === 'API' && <ApiEditor draft={draft} set={set} />}
      {draft.sourceType === 'FILE' && <FileEditor draft={draft} set={set} />}
      {draft.sourceType === 'COMPOSITE' && <CompositeEditor draft={draft} set={set} />}
    </div>
  );
}

// ─── TYPE-SPECIFIC EDITORS ───────────────────────────────────────────────────

function SqlEditor({ draft, set }) {
  const c = draft.sqlConfig || {};
  const [aiOpen, setAiOpen] = useState(false);
  return (
    <div style={S.section}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={S.sectionTitle}>SQL Configuration</div>
        <button style={S.btnSm('#8b5cf6', '#e2e8f0')} onClick={() => setAiOpen(!aiOpen)}>
          {aiOpen ? 'Hide' : '\u2728'} AI Assistant
        </button>
      </div>

      {aiOpen && (
        <SqlAiAssistant
          connectionId={c.connectionId || ''}
          formFields={draft}
          onApply={(queries) => {
            if (queries.query) set('sqlConfig.query', queries.query);
            if (queries.searchQuery) set('sqlConfig.searchQuery', queries.searchQuery);
            if (queries.countQuery) set('sqlConfig.countQuery', queries.countQuery);
            if (queries.searchField) set('sqlConfig.searchField', queries.searchField);
            if (queries.valueField) set('config.valueField', queries.valueField);
            if (queries.labelField) set('config.labelField', queries.labelField);
          }}
          onConnectionSave={(connName) => set('sqlConfig.connectionId', connName)}
        />
      )}

      <SqlConnectionEditor
        connectionId={c.connectionId || ''}
        onSelect={(connName) => set('sqlConfig.connectionId', connName)}
      />
      <div style={{ height: 8 }} />
      <span style={S.label}>Query (SELECT)</span>
      <textarea style={S.textarea} value={c.query || ''} onChange={e => set('sqlConfig.query', e.target.value)} placeholder="SELECT id, name FROM table WHERE active = 1" />
      <span style={S.label}>Search Query</span>
      <textarea style={S.textarea} value={c.searchQuery || ''} onChange={e => set('sqlConfig.searchQuery', e.target.value)} placeholder="SELECT ... WHERE name LIKE @searchText" />
      <span style={S.label}>Count Query</span>
      <textarea style={{ ...S.textarea, minHeight: 40 }} value={c.countQuery || ''} onChange={e => set('sqlConfig.countQuery', e.target.value)} placeholder="SELECT COUNT(*) as total FROM ..." />
      <span style={S.label}>Search Field</span>
      <input style={S.input} value={c.searchField || ''} onChange={e => set('sqlConfig.searchField', e.target.value)} placeholder="name" />
    </div>
  );
}

function KbEditor({ draft, set }) {
  const c = draft.kbConfig || {};
  const [catalogOpen, setCatalogOpen] = useState(false);
  return (
    <div style={S.section}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={S.sectionTitle}>Knowledge Base Configuration</div>
        {c.queryType !== 'vector' && (
          <button style={S.btnSm('#8b5cf6', '#e2e8f0')} onClick={() => setCatalogOpen(!catalogOpen)}>
            {catalogOpen ? 'Hide' : '\u{1F50D}'} KB Catalog
          </button>
        )}
      </div>

      {/* AI Chat for KB */}
      <DsAiChat type="KB" formFields={draft} onApply={(cfg) => {
        Object.entries(cfg).forEach(([k, v]) => { if (v != null) set(k.includes('.') ? k : `kbConfig.${k}`, v); });
      }} />

      {catalogOpen && c.queryType !== 'vector' && (
        <KbCatalogBrowser onSelectLabel={(label, props) => {
          // Auto-generate Cypher queries for the selected label
          const valueField = props.find(p => p.includes('id') || p.includes('Id') || p.includes('code')) || props[0] || 'id';
          const labelField = props.find(p => p.includes('name') || p.includes('label') || p.includes('title') || p.includes('Name')) || props[1] || props[0] || 'name';
          const query = `MATCH (n:${label}) RETURN n.${valueField} AS value, n.${labelField} AS label ORDER BY n.${labelField}`;
          const searchQuery = `MATCH (n:${label}) WHERE n.${labelField} =~ $searchPattern RETURN n.${valueField} AS value, n.${labelField} AS label ORDER BY n.${labelField} LIMIT $limit`;
          const countQuery = `MATCH (n:${label}) RETURN count(n) AS total`;
          set('kbConfig.cypherQuery', query);
          set('kbConfig.cypherSearchQuery', searchQuery);
          set('kbConfig.cypherCountQuery', countQuery);
          set('config.valueField', 'value');
          set('config.labelField', 'label');
        }} />
      )}

      <div style={S.row}>
        <div style={{ flex: 1 }}><span style={S.label}>Query Type</span>
          <select style={S.select} value={c.queryType || 'cypher'} onChange={e => set('kbConfig.queryType', e.target.value)}>
            <option value="cypher">Cypher</option><option value="vector">Vector</option>
          </select>
        </div>
        <div style={{ flex: 1 }}><span style={S.label}>Namespace</span><input style={S.input} value={c.namespace || ''} onChange={e => set('kbConfig.namespace', e.target.value)} /></div>
      </div>
      {c.queryType !== 'vector' && (
        <>
          <span style={S.label}>Cypher Query</span>
          <textarea style={S.textarea} value={c.cypherQuery || ''} onChange={e => set('kbConfig.cypherQuery', e.target.value)} placeholder="MATCH (n:Label) RETURN n.id AS value, n.name AS label" />
          <span style={S.label}>Cypher Search Query</span>
          <textarea style={S.textarea} value={c.cypherSearchQuery || ''} onChange={e => set('kbConfig.cypherSearchQuery', e.target.value)} placeholder="...WHERE n.name =~ $searchPattern..." />
          <span style={S.label}>Cypher Count Query</span>
          <textarea style={{ ...S.textarea, minHeight: 40 }} value={c.cypherCountQuery || ''} onChange={e => set('kbConfig.cypherCountQuery', e.target.value)} />
        </>
      )}
      {c.queryType === 'vector' && (
        <>
          <span style={S.label}>Collection</span><input style={S.input} value={c.collection || ''} onChange={e => set('kbConfig.collection', e.target.value)} />
          <div style={S.row}>
            <div style={{ flex: 1 }}><span style={S.label}>Threshold</span><input style={S.input} type="number" step="0.1" value={c.similarityThreshold || 0.7} onChange={e => set('kbConfig.similarityThreshold', parseFloat(e.target.value))} /></div>
            <div style={{ flex: 1 }}><span style={S.label}>Embedding Model</span><input style={S.input} value={c.embeddingModel || ''} onChange={e => set('kbConfig.embeddingModel', e.target.value)} /></div>
          </div>
        </>
      )}
    </div>
  );
}

function ApiEditor({ draft, set }) {
  const c = draft.apiConfig || {};
  const [swaggerOpen, setSwaggerOpen] = useState(false);
  return (
    <div style={S.section}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={S.sectionTitle}>API Configuration</div>
        <button style={S.btnSm('#10b981', '#e2e8f0')} onClick={() => setSwaggerOpen(!swaggerOpen)}>
          {swaggerOpen ? 'Hide' : '\u{1F4CB}'} Import OpenAPI
        </button>
      </div>

      {swaggerOpen && (
        <SwaggerImporter onApply={(cfg) => {
          if (cfg.endpoint) set('apiConfig.endpoint', cfg.endpoint);
          if (cfg.method) set('apiConfig.method', cfg.method);
          if (cfg.responsePath) set('apiConfig.responsePath', cfg.responsePath);
          if (cfg.totalPath) set('apiConfig.totalPath', cfg.totalPath);
          if (cfg.headers) set('apiConfig.headers', cfg.headers);
        }} />
      )}

      {/* AI Chat for API */}
      <DsAiChat type="API" formFields={draft} onApply={(cfg) => {
        Object.entries(cfg).forEach(([k, v]) => { if (v != null) set(k.includes('.') ? k : `apiConfig.${k}`, v); });
      }} />
      <div style={S.row}>
        <div style={{ flex: 1 }}><span style={S.label}>Method</span>
          <select style={S.select} value={c.method || 'GET'} onChange={e => set('apiConfig.method', e.target.value)}>
            <option>GET</option><option>POST</option><option>PUT</option>
          </select>
        </div>
        <div style={{ flex: 3 }}><span style={S.label}>Endpoint URL</span><input style={S.input} value={c.endpoint || ''} onChange={e => set('apiConfig.endpoint', e.target.value)} placeholder="https://api.example.com/data" /></div>
      </div>
      <div style={S.row}>
        <div style={{ flex: 1 }}><span style={S.label}>Response Path</span><input style={S.input} value={c.responsePath || ''} onChange={e => set('apiConfig.responsePath', e.target.value)} placeholder="data" /></div>
        <div style={{ flex: 1 }}><span style={S.label}>Total Path</span><input style={S.input} value={c.totalPath || ''} onChange={e => set('apiConfig.totalPath', e.target.value)} placeholder="total" /></div>
      </div>
      <div style={S.row}>
        <div style={{ flex: 1 }}><span style={S.label}>Auth Type</span>
          <select style={S.select} value={c.authType || 'none'} onChange={e => set('apiConfig.authType', e.target.value)}>
            <option value="none">None</option><option value="bearer">Bearer</option><option value="apiKey">API Key</option><option value="basic">Basic</option>
          </select>
        </div>
        {c.authType !== 'none' && <div style={{ flex: 2 }}><span style={S.label}>Auth Config ID</span><input style={S.input} value={c.authConfigId || ''} onChange={e => set('apiConfig.authConfigId', e.target.value)} /></div>}
      </div>
    </div>
  );
}

function FileEditor({ draft, set }) {
  const c = draft.fileConfig || {};
  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>File Configuration</div>
      <DsAiChat type="FILE" formFields={draft} onApply={(cfg) => {
        Object.entries(cfg).forEach(([k, v]) => { if (v != null) set(k.includes('.') ? k : `fileConfig.${k}`, v); });
      }} />
      <span style={S.label}>File Path</span>
      <input style={S.input} value={c.filePath || ''} onChange={e => set('fileConfig.filePath', e.target.value)} placeholder="/data/options.json" />
      <div style={{ height: 8 }} />
      <div style={S.row}>
        <div style={{ flex: 1 }}><span style={S.label}>Format</span>
          <select style={S.select} value={c.format || 'json'} onChange={e => set('fileConfig.format', e.target.value)}>
            <option value="json">JSON</option><option value="csv">CSV</option>
          </select>
        </div>
        <div style={{ flex: 1 }}><span style={S.label}>Encoding</span><input style={S.input} value={c.encoding || 'utf-8'} onChange={e => set('fileConfig.encoding', e.target.value)} /></div>
      </div>
      {c.format === 'csv' && (
        <div style={S.row}>
          <div style={{ flex: 1 }}><span style={S.label}>Delimiter</span><input style={S.input} value={c.delimiter || ','} onChange={e => set('fileConfig.delimiter', e.target.value)} /></div>
          <div style={{ flex: 1 }}><span style={S.label}>Has Header</span>
            <select style={S.select} value={String(c.hasHeader !== false)} onChange={e => set('fileConfig.hasHeader', e.target.value === 'true')}>
              <option value="true">Yes</option><option value="false">No</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

function CompositeEditor({ draft, set }) {
  const c = draft.compositeConfig || {};
  const [aiOpen, setAiOpen] = useState(false);
  const [newSourceId, setNewSourceId] = useState('');
  const [newRole, setNewRole] = useState('primary');

  const addSource = () => {
    if (!newSourceId) return;
    const sources = [...(c.sources || []), { dataSourceId: newSourceId, role: newRole, joinField: null }];
    set('compositeConfig.sources', sources);
    setNewSourceId('');
  };

  const removeSource = (idx) => {
    const sources = (c.sources || []).filter((_, i) => i !== idx);
    set('compositeConfig.sources', sources);
  };

  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>Composite Configuration</div>
      <DsAiChat type="COMPOSITE" formFields={draft} onApply={(cfg) => {
        Object.entries(cfg).forEach(([k, v]) => { if (v != null) set(k.includes('.') ? k : `compositeConfig.${k}`, v); });
      }} />
      <span style={S.label}>Merge Strategy</span>
      <select style={S.select} value={c.mergeStrategy || 'union'} onChange={e => set('compositeConfig.mergeStrategy', e.target.value)}>
        <option value="union">Union (concat + dedupe)</option>
        <option value="join">Join (inner join)</option>
        <option value="enrich">Enrich (primary + extras)</option>
      </select>
      <div style={{ height: 8 }} />

      <span style={S.label}>Sources</span>
      {(c.sources || []).map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 13, flex: 1 }}>{s.dataSourceId}</span>
          <span style={S.chip(COLORS.KB)}>{s.role}</span>
          <button style={{ ...S.btnSm('#da3633', '#fff'), padding: '2px 6px' }} onClick={() => removeSource(i)}>x</button>
        </div>
      ))}

      <div style={{ ...S.row, marginTop: 6 }}>
        <input style={{ ...S.input, flex: 2 }} placeholder="DataSource ID" value={newSourceId} onChange={e => setNewSourceId(e.target.value)} />
        <select style={{ ...S.select, flex: 1 }} value={newRole} onChange={e => setNewRole(e.target.value)}>
          <option value="primary">primary</option><option value="secondary">secondary</option><option value="enrichment">enrichment</option>
        </select>
        <button style={S.btnSm('#238636', '#fff')} onClick={addSource}>+</button>
      </div>
    </div>
  );
}

// =============================================================================
// SQL CONNECTION EDITOR — Pick existing or create new SQL connection
// =============================================================================

const DOMAIN_ID = 'default'; // default domain for connections

function SqlConnectionEditor({ connectionId, onSelect }) {
  const [connections, setConnections] = useState([]);
  const [loadingConn, setLoadingConn] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState('pick'); // 'pick' | 'new' | 'edit'
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [form, setForm] = useState({
    connectionName: '',
    server: 'localhost',
    port: '1435',
    database: '',
    username: '',
    password: '',
    encrypt: false,
    trustServerCertificate: true,
  });

  const updateForm = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  // Load existing connections
  const loadConnections = useCallback(async () => {
    setLoadingConn(true);
    try {
      const res = await api.get(`/domains/${DOMAIN_ID}/datasources`);
      const conns = (res.data?.dataSources || []).filter(ds => ds.sourceType === 'MSSQL');
      setConnections(conns);
    } catch { /* ignore */ }
    finally { setLoadingConn(false); }
  }, []);

  useEffect(() => { loadConnections(); }, [loadConnections]);

  // Select existing connection
  const handleSelect = (connName) => {
    onSelect(connName);
    setExpanded(false);
    setTestResult(null);
  };

  // Start editing an existing connection
  const handleEdit = (conn) => {
    const params = conn.connectionParams || {};
    setForm({
      connectionName: conn.connectionName,
      server: params.server || 'localhost',
      port: String(params.port || 1435),
      database: params.database || '',
      username: '',
      password: '',
      encrypt: params.encryption ?? params.encrypt ?? false,
      trustServerCertificate: params.trustServerCertificate ?? true,
    });
    setMode('edit');
    setTestResult(null);
  };

  // Start creating new connection
  const handleNew = () => {
    setForm({ connectionName: '', server: 'localhost', port: '1435', database: '', username: '', password: '', encrypt: false, trustServerCertificate: true });
    setMode('new');
    setTestResult(null);
  };

  // Test connection
  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const connRes = await api.post('/mssql/connect', {
        server: form.server,
        port: form.port,
        database: form.database,
        user: form.username,
        password: form.password,
        encrypt: form.encrypt,
        trustServerCertificate: form.trustServerCertificate,
      });
      if (connRes.data?.success === false) throw new Error(connRes.data.error || 'Connection failed');
      setTestResult({ ok: true, msg: 'Connection successful' });
    } catch (err) {
      setTestResult({ ok: false, msg: err.message });
    } finally { setTesting(false); }
  };

  // Save connection (create or update)
  const handleSave = async () => {
    if (!form.connectionName.trim() || !form.server.trim() || !form.database.trim()) return;
    setSaving(true); setTestResult(null);
    try {
      const payload = {
        connectionName: form.connectionName.trim(),
        sourceType: 'MSSQL',
        connectionParams: {
          server: form.server,
          port: parseInt(form.port, 10) || 1433,
          database: form.database,
          encryption: form.encrypt,
          trustServerCertificate: form.trustServerCertificate,
          protocol: 'tcp',
        },
        credentials: form.username ? { username: form.username, password: form.password } : undefined,
      };

      if (mode === 'edit') {
        await api.put(`/domains/${DOMAIN_ID}/datasources/${form.connectionName}`, payload);
      } else {
        await api.post(`/domains/${DOMAIN_ID}/datasources`, payload);
      }

      await loadConnections();
      onSelect(form.connectionName.trim());
      setMode('pick');
      setTestResult({ ok: true, msg: 'Saved' });
    } catch (err) {
      setTestResult({ ok: false, msg: err.message });
    } finally { setSaving(false); }
  };

  // Current connection info
  const current = connections.find(c => c.connectionName === connectionId);
  const currentLabel = current
    ? `${current.connectionName} (${current.connectionParams?.server || '?'}:${current.connectionParams?.port || '?'}/${current.connectionParams?.database || '?'})`
    : connectionId || 'No connection selected';

  return (
    <div style={{ marginBottom: 8 }}>
      <span style={S.label}>SQL Connection</span>

      {/* Compact display */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <div
          onClick={() => setExpanded(!expanded)}
          style={{
            ...S.input, flex: 1, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: current ? '#161b22' : '#1c1008',
            border: current ? '1px solid #30363d' : '1px solid #f59e0b50',
          }}
        >
          <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {current && <span style={{ color: '#6ee7b7', marginRight: 4 }}>{'\u25CF'}</span>}
            {currentLabel}
          </span>
          <span style={{ fontSize: 13, color: '#8b949e' }}>{expanded ? '\u25B2' : '\u25BC'}</span>
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div style={{
          marginTop: 4, border: '1px solid #30363d', borderRadius: 6,
          background: '#0d1117', overflow: 'hidden',
        }}>
          {/* Connection list + New button */}
          {(mode === 'pick') && (
            <div style={{ padding: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#58a6ff' }}>Available Connections</span>
                <button style={S.btnSm('#238636', '#fff')} onClick={handleNew}>+ New</button>
              </div>

              {loadingConn && <div style={{ fontSize: 13, color: '#8b949e', padding: 4 }}>Loading...</div>}

              {connections.length === 0 && !loadingConn && (
                <div style={{ fontSize: 13, color: '#8b949e', padding: 8, textAlign: 'center' }}>
                  No SQL connections found. Create one with "+ New".
                </div>
              )}

              {connections.map(conn => {
                const p = conn.connectionParams || {};
                const isActive = conn.connectionName === connectionId;
                return (
                  <div
                    key={conn.connectionName}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px',
                      borderRadius: 4, marginBottom: 2, cursor: 'pointer',
                      background: isActive ? '#1c3a5e' : '#161b22',
                      border: isActive ? '1px solid #58a6ff50' : '1px solid transparent',
                    }}
                  >
                    <div style={{ flex: 1 }} onClick={() => handleSelect(conn.connectionName)}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: isActive ? '#58a6ff' : '#e2e8f0' }}>
                        {conn.connectionName}
                      </div>
                      <div style={{ fontSize: 13, color: '#8b949e' }}>
                        {p.server || '?'}:{p.port || '?'} / {p.database || '?'}
                        {conn.hasCredentials && <span style={{ color: '#6ee7b7', marginLeft: 6 }}>{'\uD83D\uDD12'} credentials</span>}
                        {!conn.hasCredentials && <span style={{ color: '#f59e0b', marginLeft: 6 }}>{'\u26A0'} no credentials</span>}
                      </div>
                    </div>
                    <button style={S.btnSm('#21262d', '#8b949e')} onClick={() => handleEdit(conn)} title="Edit">
                      {'\u270E'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* New / Edit form */}
          {(mode === 'new' || mode === 'edit') && (
            <div style={{ padding: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#58a6ff' }}>
                  {mode === 'new' ? 'New Connection' : `Edit: ${form.connectionName}`}
                </span>
                <button style={S.btnSm('#21262d', '#8b949e')} onClick={() => setMode('pick')}>Back</button>
              </div>

              {mode === 'new' && (
                <>
                  <span style={S.label}>Connection Name *</span>
                  <input style={S.input} value={form.connectionName} onChange={e => updateForm('connectionName', e.target.value)} placeholder="my-sql-server" />
                  <div style={{ height: 6 }} />
                </>
              )}

              <div style={S.row}>
                <div style={{ flex: 2 }}>
                  <span style={S.label}>Server *</span>
                  <input style={S.input} value={form.server} onChange={e => updateForm('server', e.target.value)} placeholder="localhost" />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={S.label}>Port</span>
                  <input style={S.input} value={form.port} onChange={e => updateForm('port', e.target.value)} placeholder="1433" />
                </div>
              </div>

              <span style={S.label}>Database *</span>
              <input style={S.input} value={form.database} onChange={e => updateForm('database', e.target.value)} placeholder="MyDatabase" />
              <div style={{ height: 6 }} />

              <div style={S.row}>
                <div style={{ flex: 1 }}>
                  <span style={S.label}>Username</span>
                  <input style={S.input} value={form.username} onChange={e => updateForm('username', e.target.value)} placeholder="sa" />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={S.label}>Password</span>
                  <input style={S.input} type="password" value={form.password} onChange={e => updateForm('password', e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                <label style={{ fontSize: 13, color: '#8b949e', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="checkbox" checked={form.trustServerCertificate} onChange={e => updateForm('trustServerCertificate', e.target.checked)} />
                  Trust Certificate
                </label>
                <label style={{ fontSize: 13, color: '#8b949e', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="checkbox" checked={form.encrypt} onChange={e => updateForm('encrypt', e.target.checked)} />
                  Encrypt
                </label>
              </div>

              {testResult && <div style={S.alert(testResult.ok)}>{testResult.msg}</div>}

              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button
                  style={S.btnSm('#1f6feb', '#fff')}
                  onClick={handleTest}
                  disabled={testing || !form.server || !form.database || !form.username}
                >
                  {testing ? 'Testing...' : 'Test Connection'}
                </button>
                <button
                  style={S.btn('#238636', '#fff')}
                  onClick={handleSave}
                  disabled={saving || !form.connectionName.trim() || !form.server || !form.database}
                >
                  {saving ? 'Saving...' : (mode === 'new' ? 'Create & Select' : 'Update & Select')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// SQL AI ASSISTANT — Chat-based SQL query generator
// =============================================================================

function SqlAiAssistant({ connectionId, formFields, onApply, onConnectionSave }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [schema, setSchema] = useState(null);
  const [schemaLoading, setSchemaLoading] = useState(false);

  // Connection state
  const [connected, setConnected] = useState(false);
  const [connectError, setConnectError] = useState(null);
  const [connForm, setConnForm] = useState({ server: 'localhost', port: '1435', database: '', user: '', password: '', encrypt: false, trustServerCertificate: true, connectionName: '' });
  const [connecting, setConnecting] = useState(false);

  const updateConn = (k, v) => setConnForm(prev => ({ ...prev, [k]: v }));

  // Pre-fill from existing saved connection
  useEffect(() => {
    if (!connectionId) return;
    (async () => {
      try {
        const res = await api.get(`/domains/default/datasources`);
        const conn = (res.data?.dataSources || []).find(ds => ds.connectionName === connectionId);
        if (conn?.connectionParams) {
          const p = conn.connectionParams;
          setConnForm(prev => ({
            ...prev,
            connectionName: conn.connectionName || '',
            server: p.server || prev.server,
            port: String(p.port || prev.port),
            database: p.database || prev.database,
            encrypt: p.encryption ?? p.encrypt ?? prev.encrypt,
            trustServerCertificate: p.trustServerCertificate ?? prev.trustServerCertificate,
          }));
        }
      } catch { /* ignore */ }
    })();
  }, [connectionId]);

  // Step 1: Connect to SQL Server
  const handleConnect = async () => {
    setConnecting(true); setConnectError(null);
    try {
      const connRes = await api.post('/mssql/connect', connForm);
      if (!connRes.data?.success && connRes.data?.error) throw new Error(connRes.data.error);
      setConnected(true);

      // Save connection to domain store for reuse
      const connName = connForm.connectionName || connForm.database || 'ai-connection';
      try {
        await api.post(`/domains/default/datasources`, {
          connectionName: connName,
          sourceType: 'MSSQL',
          connectionParams: {
            server: connForm.server,
            port: parseInt(connForm.port, 10) || 1433,
            database: connForm.database,
            encryption: connForm.encrypt,
            trustServerCertificate: connForm.trustServerCertificate,
            protocol: 'tcp',
          },
          credentials: connForm.user ? { username: connForm.user, password: connForm.password } : undefined,
        });
        if (onConnectionSave) onConnectionSave(connName);
      } catch { /* save failed, non-blocking */ }

      // After connecting, load schema
      loadSchema();
    } catch (err) {
      setConnectError(err.message);
    } finally {
      setConnecting(false);
    }
  };

  // Step 2: Load DB schema
  const loadSchema = async () => {
    setSchemaLoading(true);
    try {
      const schemaRes = await api.get('/mssql/tables', { params: { includeRowCounts: true, includeColumns: true } });
      const schemaData = schemaRes.data;
      setSchema(schemaData);
      const colsTotal = (schemaData.tables || []).reduce((sum, t) => sum + (t.columns?.length || 0), 0);
      setMessages([{
        role: 'assistant',
        content: `Database connected. Schema loaded: **${schemaData.tables?.length || 0} tables**, **${colsTotal} columns**.\n\nDescribe what data you need and I'll generate SQL queries.\n\nExamples:\n- "List of all active duty stations with country"\n- "Staff members searchable by name or email"\n- "Equipment categories grouped by type"`
      }]);
    } catch (err) {
      setMessages([{ role: 'assistant', content: `\u26A0\uFE0F Schema load failed: ${err.message}` }]);
    } finally {
      setSchemaLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg = { role: 'user', content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      // Build context with schema info — include ALL tables with their columns
      const schemaContext = schema?.tables
        ? `Available tables (with columns):\n${schema.tables.map(t => {
            const sname = t.schema_name || t.schema || 'dbo';
            const tname = t.table_name || t.name || '';
            const rows = t.row_count ?? t.rowCount ?? '?';
            const cols = (t.columns || []).map(c => `${c.name}:${c.type || c.data_type || '?'}`).join(', ');
            return `- ${sname}.${tname} (${rows} rows)${cols ? `\n    columns: ${cols}` : ''}`;
          }).join('\n')}`
        : 'No schema available.';

      // Build current form state for context
      const sql = formFields?.sqlConfig || {};
      const cfg = formFields?.config || {};
      const currentFormState = {
        name: formFields?.name || '',
        connectionId: sql.connectionId || '',
        query: sql.query || '',
        searchQuery: sql.searchQuery || '',
        countQuery: sql.countQuery || '',
        searchField: sql.searchField || '',
        valueField: cfg.valueField || '',
        labelField: cfg.labelField || '',
        description: cfg.description || '',
      };

      const sqlRes = await api.post('/mssql/assistant', {
        message: input,
        context: {
          purpose: 'datasource_query_generation',
          schemaContext,
          formFields: currentFormState,
          outputFormat: 'Generate SQL queries for a DataSource config. Return a JSON block with: query (main SELECT), searchQuery (with @searchText parameter for LIKE), countQuery (COUNT), valueField, labelField, searchField. Wrap JSON in ```json code block.'
        },
        history: newMessages.slice(-6)
      }, { timeout: 60000 });

      const assistantContent = sqlRes.data?.response || sqlRes.data?.message || 'No response';

      setMessages(prev => [...prev, { role: 'assistant', content: assistantContent }]);

      // Try to extract JSON from response
      const jsonMatch = assistantContent.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          // Show apply button
          setMessages(prev => [...prev, {
            role: 'system',
            content: 'apply_queries',
            data: parsed
          }]);
        } catch { /* not valid JSON, ignore */ }
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `\u274C Error: ${err.message}`
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      border: '1px solid #8b5cf650', borderRadius: 6, marginBottom: 12,
      background: '#13111c', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '6px 10px', background: '#8b5cf615', borderBottom: '1px solid #8b5cf630',
        fontSize: 13, fontWeight: 600, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span>{'\u2728'}</span> AI SQL Assistant
        {connected && !schemaLoading && schema && <span style={{ fontSize: 13, color: '#6ee7b7' }}>{'\u2713'} {schema.tables?.length || 0} tables</span>}
        {schemaLoading && <span style={{ fontSize: 13, color: '#8b949e' }}>Loading schema...</span>}
        {!connected && <span style={{ fontSize: 13, color: '#f59e0b' }}>Connect to SQL Server first</span>}
      </div>

      {/* Connection form (before connected) */}
      {!connected && (
        <div style={{ padding: 8 }}>
          <span style={S.label}>Connection Name</span>
          <input style={S.input} value={connForm.connectionName} onChange={e => updateConn('connectionName', e.target.value)} placeholder="my-sql-server (saved for reuse)" />
          <div style={{ height: 6 }} />
          <div style={S.row}>
            <div style={{ flex: 2 }}><span style={S.label}>Server</span><input style={S.input} value={connForm.server} onChange={e => updateConn('server', e.target.value)} placeholder="localhost" /></div>
            <div style={{ flex: 1 }}><span style={S.label}>Port</span><input style={S.input} value={connForm.port} onChange={e => updateConn('port', e.target.value)} placeholder="1435" /></div>
          </div>
          <div style={S.row}>
            <div style={{ flex: 1 }}><span style={S.label}>Database</span><input style={S.input} value={connForm.database} onChange={e => updateConn('database', e.target.value)} placeholder="MyDatabase" /></div>
          </div>
          <div style={S.row}>
            <div style={{ flex: 1 }}><span style={S.label}>User</span><input style={S.input} value={connForm.user} onChange={e => updateConn('user', e.target.value)} placeholder="sa" /></div>
            <div style={{ flex: 1 }}><span style={S.label}>Password</span><input style={S.input} type="password" value={connForm.password} onChange={e => updateConn('password', e.target.value)} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
            <label style={{ fontSize: 13, color: '#8b949e', display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={connForm.trustServerCertificate} onChange={e => updateConn('trustServerCertificate', e.target.checked)} />
              Trust Certificate
            </label>
            <label style={{ fontSize: 13, color: '#8b949e', display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={connForm.encrypt} onChange={e => updateConn('encrypt', e.target.checked)} />
              Encrypt
            </label>
          </div>
          {connectError && <div style={S.alert(false)}>{connectError}</div>}
          <button style={S.btn('#8b5cf6', '#fff')} onClick={handleConnect} disabled={connecting || !connForm.server || !connForm.database}>
            {connecting ? 'Connecting...' : 'Connect & Load Schema'}
          </button>
        </div>
      )}

      {/* Chat (only after connected) */}
      {connected && <><div style={{ maxHeight: 280, overflow: 'auto', padding: 8 }}>
        {messages.map((msg, i) => {
          if (msg.role === 'system' && msg.content === 'apply_queries') {
            return (
              <div key={i} style={{ padding: 6, margin: '4px 0', background: '#10b98120', borderRadius: 4, border: '1px solid #10b98140' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#6ee7b7', marginBottom: 4 }}>Generated queries ready to apply:</div>
                {msg.data.query && <div style={{ fontSize: 13, color: '#8b949e' }}>Query: <code>{msg.data.query.slice(0, 80)}...</code></div>}
                <button
                  style={{ ...S.btnSm('#10b981', '#fff'), marginTop: 6 }}
                  onClick={() => onApply(msg.data)}
                >
                  Apply to DataSource
                </button>
              </div>
            );
          }
          return (
            <div key={i} style={{
              padding: '6px 8px', margin: '3px 0', borderRadius: 4, fontSize: 13, lineHeight: 1.5,
              background: msg.role === 'user' ? '#1c1c3a' : 'transparent',
              color: msg.role === 'user' ? '#c4b5fd' : '#c9d1d9',
              borderLeft: msg.role === 'user' ? '2px solid #8b5cf6' : '2px solid #30363d',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {msg.content}
            </div>
          );
        })}
        {loading && <div style={{ fontSize: 13, color: '#8b949e', padding: 6 }}>Thinking...</div>}
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 4, padding: 6, borderTop: '1px solid #30363d' }}>
        <input
          style={{ ...S.input, flex: 1 }}
          placeholder="Describe the data you need..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          disabled={loading}
        />
        <button style={S.btnSm('#8b5cf6', '#fff')} onClick={sendMessage} disabled={loading || !input.trim()}>
          Send
        </button>
      </div>
      </>}
    </div>
  );
}

// =============================================================================
// SWAGGER / OPENAPI IMPORTER
// =============================================================================

function SwaggerImporter({ onApply }) {
  const [url, setUrl] = useState('');
  const [jsonInput, setJsonInput] = useState('');
  const [mode, setMode] = useState('url'); // 'url' | 'paste'
  const [endpoints, setEndpoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const parseSpec = async () => {
    setLoading(true); setError(null); setEndpoints([]);
    try {
      let spec;
      if (mode === 'url') {
        if (!url) throw new Error('Enter OpenAPI/Swagger URL');
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        const text = await res.text();
        spec = JSON.parse(text);
      } else {
        if (!jsonInput.trim()) throw new Error('Paste OpenAPI JSON');
        spec = JSON.parse(jsonInput);
      }

      // Extract endpoints from OpenAPI spec
      const extracted = extractEndpoints(spec);
      setEndpoints(extracted);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const applyEndpoint = (ep) => {
    onApply({
      endpoint: ep.url,
      method: ep.method.toUpperCase(),
      responsePath: ep.responsePath || 'data',
      totalPath: ep.totalPath || 'total',
    });
  };

  return (
    <div style={{
      border: '1px solid #10b98150', borderRadius: 6, marginBottom: 12,
      background: '#0d1a13', overflow: 'hidden',
    }}>
      <div style={{
        padding: '6px 10px', background: '#10b98115', borderBottom: '1px solid #10b98130',
        fontSize: 13, fontWeight: 600, color: '#6ee7b7', display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span>{'\u{1F4CB}'}</span> OpenAPI / Swagger Import
      </div>

      <div style={{ padding: 8 }}>
        {/* Mode selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button
            style={S.btnSm(mode === 'url' ? '#10b981' : '#21262d', mode === 'url' ? '#fff' : '#c9d1d9')}
            onClick={() => setMode('url')}
          >
            From URL
          </button>
          <button
            style={S.btnSm(mode === 'paste' ? '#10b981' : '#21262d', mode === 'paste' ? '#fff' : '#c9d1d9')}
            onClick={() => setMode('paste')}
          >
            Paste JSON
          </button>
        </div>

        {mode === 'url' ? (
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            <input
              style={{ ...S.input, flex: 1 }}
              placeholder="https://api.example.com/swagger.json"
              value={url}
              onChange={e => setUrl(e.target.value)}
            />
            <button style={S.btnSm('#10b981', '#fff')} onClick={parseSpec} disabled={loading}>
              {loading ? '...' : 'Parse'}
            </button>
          </div>
        ) : (
          <>
            <textarea
              style={{ ...S.textarea, minHeight: 100, marginBottom: 8 }}
              placeholder='Paste OpenAPI/Swagger JSON here...'
              value={jsonInput}
              onChange={e => setJsonInput(e.target.value)}
            />
            <button style={S.btnSm('#10b981', '#fff')} onClick={parseSpec} disabled={loading}>
              {loading ? '...' : 'Parse'}
            </button>
          </>
        )}

        {error && <div style={S.alert(false)}>{error}</div>}

        {/* Extracted endpoints */}
        {endpoints.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <span style={S.label}>Found {endpoints.length} endpoints — click to apply:</span>
            <div style={{ maxHeight: 200, overflow: 'auto' }}>
              {endpoints.map((ep, i) => (
                <div
                  key={i}
                  onClick={() => applyEndpoint(ep)}
                  style={{
                    padding: '6px 8px', margin: '3px 0', borderRadius: 4, cursor: 'pointer',
                    background: '#161b22', border: '1px solid #30363d', fontSize: 13,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#10b981'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#30363d'}
                >
                  <span style={{
                    fontSize: 13, padding: '1px 5px', borderRadius: 3, fontWeight: 700,
                    background: METHOD_COLORS[ep.method] || '#64748b',
                    color: '#fff',
                  }}>
                    {ep.method.toUpperCase()}
                  </span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.url}</span>
                  {ep.summary && <span style={{ fontSize: 13, color: '#8b949e' }}>{ep.summary}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const METHOD_COLORS = { get: '#3b82f6', post: '#10b981', put: '#f59e0b', delete: '#ef4444', patch: '#8b5cf6' };

function extractEndpoints(spec) {
  const endpoints = [];
  const basePath = spec.basePath || '';
  const host = spec.host || '';
  const schemes = spec.schemes || ['https'];
  const baseUrl = spec.servers?.[0]?.url || (host ? `${schemes[0]}://${host}${basePath}` : basePath);

  const paths = spec.paths || {};

  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
        // Try to detect response path
        let responsePath = 'data';
        let totalPath = 'total';
        const responseSchema = operation.responses?.['200']?.content?.['application/json']?.schema
          || operation.responses?.['200']?.schema;

        if (responseSchema?.properties) {
          const props = Object.keys(responseSchema.properties);
          // Guess array property as responsePath
          for (const prop of props) {
            const propSchema = responseSchema.properties[prop];
            if (propSchema.type === 'array' || propSchema.items) {
              responsePath = prop;
              break;
            }
          }
          // Guess total
          for (const prop of ['total', 'totalCount', 'count', 'total_count']) {
            if (props.includes(prop)) { totalPath = prop; break; }
          }
        }

        endpoints.push({
          method,
          url: `${baseUrl}${path}`,
          summary: operation.summary || operation.description || '',
          operationId: operation.operationId || '',
          responsePath,
          totalPath,
          parameters: operation.parameters || [],
        });
      }
    }
  }

  return endpoints;
}

// =============================================================================
// KB CATALOG BROWSER — Browse Memgraph labels, preview data, auto-generate Cypher
// =============================================================================

// =============================================================================
// REUSABLE AI CHAT for any DataSource type
// =============================================================================

const DS_TYPE_HINTS = {
  SQL: 'Describe what data you need from the database (e.g. "list of departments with manager name")',
  KB: 'Describe what graph data you need (e.g. "all CodexRule nodes with their sections")',
  API: 'Describe the API or paste documentation (e.g. "REST API at api.example.com returning countries")',
  FILE: 'Describe the file and its structure (e.g. "JSON file at /data/options.json with id and name fields")',
  COMPOSITE: 'Describe what sources to combine (e.g. "join staff from HR database with badges from badge system")',
};

const DS_TYPE_COLORS = { SQL: '#3b82f6', KB: '#8b5cf6', API: '#10b981', FILE: '#f59e0b', COMPOSITE: '#ec4899' };

function DsAiChat({ type, context, onApply, formFields }) {
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: `I'm your ${type} DataSource assistant. I can inspect your data source, generate queries, and fill in the form fields automatically.\n\n${DS_TYPE_HINTS[type] || 'Describe what you need.'}`
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: 'user', content: input };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput('');
    setLoading(true);

    try {
      const { data } = await api.post('/datasources/ai-assist', {
        type,
        message: input,
        formFields: formFields ? { sourceType: formFields.sourceType, name: formFields.name, config: formFields.config } : {},
        history: newMsgs.slice(-8).filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
      }, { timeout: 90000 });
      const text = data.response || 'Done.';

      if (text) setMessages(prev => [...prev, { role: 'assistant', content: text }]);

      // If the AI used update_form_fields tool, apply immediately
      if (data.fieldUpdates) {
        onApply(data.fieldUpdates);
        setMessages(prev => [...prev, {
          role: 'system', content: 'fields_updated',
          data: data.fieldUpdates,
        }]);
      }

      // Also check for JSON blocks (fallback)
      if (!data.fieldUpdates && text) {
        const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[1]);
            setMessages(prev => [...prev, { role: 'system', content: 'apply', data: parsed }]);
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `\u274C ${err.message}` }]);
    } finally { setLoading(false); }
  };

  const color = DS_TYPE_COLORS[type] || '#8b5cf6';

  return (
    <div style={{ border: `1px solid ${color}50`, borderRadius: 6, marginBottom: 12, background: '#13111c', overflow: 'hidden' }}>
      <div style={{ padding: '6px 10px', background: `${color}15`, borderBottom: `1px solid ${color}30`, fontSize: 13, fontWeight: 600, color, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{'\u2728'}</span> {type} AI Assistant
      </div>
      <div style={{ maxHeight: 240, overflow: 'auto', padding: 8 }}>
        {messages.map((msg, i) => {
          if (msg.role === 'system' && msg.content === 'fields_updated') {
            return (
              <div key={i} style={{ padding: 6, margin: '4px 0', background: '#10b98120', borderRadius: 4, border: '1px solid #10b98140' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#6ee7b7' }}>{'\u2705'} Form fields updated:</div>
                {Object.entries(msg.data).map(([k, v]) => (
                  <div key={k} style={{ fontSize: 13, color: '#8b949e', marginTop: 1 }}>{k}: {String(v).slice(0, 80)}</div>
                ))}
              </div>
            );
          }
          if (msg.role === 'system' && msg.content === 'apply') {
            return (
              <div key={i} style={{ padding: 6, margin: '4px 0', background: '#10b98120', borderRadius: 4, border: '1px solid #10b98140' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#6ee7b7', marginBottom: 4 }}>Configuration ready:</div>
                <pre style={{ fontSize: 13, color: '#8b949e', margin: 0, maxHeight: 60, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(msg.data, null, 2).slice(0, 300)}</pre>
                <button style={{ ...S.btnSm('#10b981', '#fff'), marginTop: 6 }} onClick={() => onApply(msg.data)}>
                  Apply to DataSource
                </button>
              </div>
            );
          }
          return (
            <div key={i} style={{
              padding: '6px 8px', margin: '3px 0', borderRadius: 4, fontSize: 13, lineHeight: 1.5,
              background: msg.role === 'user' ? '#1c1c3a' : 'transparent',
              color: msg.role === 'user' ? '#c4b5fd' : '#c9d1d9',
              borderLeft: msg.role === 'user' ? `2px solid ${color}` : '2px solid #30363d',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>{msg.content}</div>
          );
        })}
        {loading && <div style={{ fontSize: 13, color: '#8b949e', padding: 6 }}>Thinking...</div>}
      </div>
      <div style={{ display: 'flex', gap: 4, padding: 6, borderTop: '1px solid #30363d' }}>
        <input style={{ ...S.input, flex: 1 }} placeholder={DS_TYPE_HINTS[type]?.slice(0, 50) + '...'} value={input}
          onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()} disabled={loading} />
        <button style={S.btnSm(color, '#fff')} onClick={sendMessage} disabled={loading || !input.trim()}>Send</button>
      </div>
    </div>
  );
}

function KbCatalogBrowser({ onSelectLabel }) {
  const [stats, setStats] = useState(null);
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedLabel, setSelectedLabel] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [nodeProps, setNodeProps] = useState([]);

  // Load stats + labels on mount
  React.useEffect(() => {
    loadCatalog();
  }, []);

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const [statsRes, labelsRes] = await Promise.all([
        api.get('/knowledge/stats').then(r => r.data).catch(() => null),
        api.get('/knowledge/crud/labels').then(r => r.data).catch(() => null),
      ]);

      if (statsRes) setStats(statsRes);

      // Merge labels with counts
      const labelList = (labelsRes?.nodeLabels || labelsRes?.data?.nodeLabels || []).map(lbl => ({
        name: lbl,
        count: statsRes?.nodesByType?.[lbl] || 0,
      })).sort((a, b) => b.count - a.count);

      setLabels(labelList);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  // Preview data for selected label
  const loadPreview = async (label) => {
    setSelectedLabel(label);
    setPreviewLoading(true);
    setPreview(null);
    setNodeProps([]);
    try {
      const previewRes = await api.post('/knowledge/crud/execute', {
        query: `MATCH (n:${label}) RETURN n LIMIT 5`,
      });
      const data = previewRes.data;

      const nodes = (data.results || data.data || []).map(r => {
        const node = r.n || r;
        return node.properties || node;
      });

      // Extract property names from first few nodes
      const propSet = new Set();
      nodes.forEach(n => Object.keys(n).forEach(k => propSet.add(k)));
      const props = Array.from(propSet).filter(p => !p.startsWith('_'));
      setNodeProps(props);
      setPreview(nodes);
    } catch (err) {
      setPreview([]);
      setNodeProps([]);
    } finally {
      setPreviewLoading(false);
    }
  };

  const filtered = labels.filter(l =>
    !search || l.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{
      border: '1px solid #8b5cf650', borderRadius: 6, marginBottom: 12,
      background: '#13111c', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '6px 10px', background: '#8b5cf615', borderBottom: '1px solid #8b5cf630',
        fontSize: 13, fontWeight: 600, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span>{'\u{1F50D}'}</span> Knowledge Base Catalog
        {stats && <span style={{ fontSize: 13, color: '#6ee7b7' }}>
          {stats.totalNodes ?? '?'} nodes, {Object.keys(stats.nodesByType || {}).length} types
        </span>}
      </div>

      <div style={{ display: 'flex', maxHeight: 320 }}>
        {/* Left: Label list */}
        <div style={{ width: 220, borderRight: '1px solid #30363d', display: 'flex', flexDirection: 'column' }}>
          <input
            style={{ ...S.input, margin: 6, width: 'calc(100% - 12px)' }}
            placeholder="Filter labels..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div style={{ flex: 1, overflow: 'auto' }}>
            {loading && <div style={{ padding: 8, fontSize: 13, color: '#8b949e' }}>Loading...</div>}
            {filtered.map(l => (
              <div
                key={l.name}
                onClick={() => loadPreview(l.name)}
                style={{
                  padding: '5px 8px', cursor: 'pointer', fontSize: 13,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: selectedLabel === l.name ? '#1c1c3a' : 'transparent',
                  borderLeft: selectedLabel === l.name ? '2px solid #8b5cf6' : '2px solid transparent',
                }}
                onMouseEnter={e => { if (selectedLabel !== l.name) e.currentTarget.style.background = '#161b22'; }}
                onMouseLeave={e => { if (selectedLabel !== l.name) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ color: '#c9d1d9' }}>{l.name}</span>
                <span style={{ fontSize: 13, color: l.count > 0 ? '#6ee7b7' : '#484f58' }}>{l.count}</span>
              </div>
            ))}
            {!loading && filtered.length === 0 && (
              <div style={{ padding: 8, fontSize: 13, color: '#484f58' }}>No labels found</div>
            )}
          </div>
        </div>

        {/* Right: Preview */}
        <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
          {!selectedLabel && (
            <div style={{ color: '#484f58', fontSize: 13, padding: 16, textAlign: 'center' }}>
              Select a label to preview data and generate queries
            </div>
          )}

          {previewLoading && (
            <div style={{ color: '#8b949e', fontSize: 13, padding: 16, textAlign: 'center' }}>Loading preview...</div>
          )}

          {selectedLabel && !previewLoading && preview && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#c9d1d9' }}>{selectedLabel}</span>
                  <span style={{ fontSize: 13, color: '#8b949e', marginLeft: 8 }}>{nodeProps.length} properties</span>
                </div>
                <button
                  style={S.btnSm('#10b981', '#fff')}
                  onClick={() => onSelectLabel(selectedLabel, nodeProps)}
                >
                  Use this label
                </button>
              </div>

              {/* Properties list */}
              <div style={{ marginBottom: 8 }}>
                <span style={S.label}>Properties:</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {nodeProps.map(p => (
                    <span key={p} style={{
                      fontSize: 13, padding: '2px 6px', borderRadius: 3,
                      background: '#21262d', border: '1px solid #30363d', color: '#c9d1d9',
                    }}>{p}</span>
                  ))}
                </div>
              </div>

              {/* Data preview table */}
              {preview.length > 0 ? (
                <div style={{ overflow: 'auto', maxHeight: 180 }}>
                  <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {nodeProps.slice(0, 6).map(p => (
                          <th key={p} style={{
                            padding: '4px 6px', textAlign: 'left', borderBottom: '1px solid #30363d',
                            color: '#8b949e', fontWeight: 600, whiteSpace: 'nowrap',
                          }}>{p}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, i) => (
                        <tr key={i}>
                          {nodeProps.slice(0, 6).map(p => (
                            <td key={p} style={{
                              padding: '3px 6px', borderBottom: '1px solid #21262d', color: '#c9d1d9',
                              maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {row[p] != null ? String(row[p]).slice(0, 50) : '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: '#484f58' }}>No data for this label</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── REUSABLE EXPORTS ─────────────────────────────────────────────────────────
// These let other parts of the app (workspace SourcesTab) reuse the same
// editor / type-specific config panels without duplicating the UI.
// All of them are store-driven via `useDataSourceCatalogStore`.
//
// Usage from a dialog:
//   const store = useDataSourceCatalogStore();
//   useEffect(() => { store.setWorkspaceContext(workspaceId); store.startCreate('SQL'); }, []);
//   ...
//   <DataSourceEditor />     // renders General + Output Mapping + type-specific
//
export {
  DataSourceEditor,
  SqlEditor,
  KbEditor,
  ApiEditor,
  FileEditor,
  CompositeEditor,
  SOURCE_TYPES,
  TYPE_LABELS,
  COLORS as SOURCE_TYPE_COLORS,
  ICONS as SOURCE_TYPE_ICONS,
};
