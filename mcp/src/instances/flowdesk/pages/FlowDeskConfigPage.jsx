/**
 * FlowDesk Configuration Admin — CRUD for business rules stored in KB.
 * Tabs: SLA | Queues | Keywords | Categories | Domains | Thresholds | Scopes
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useFlowDeskConfigStore } from '../stores/flowdeskConfigStore.js';
import {
  Timer, Users, TextSearch, FolderTree, Tag, Gauge, Globe,
  Plus, Trash2, Save, RefreshCw, X, Check, Edit2,
} from 'lucide-react';

const TABS = [
  { key: 'sla', label: 'SLA', icon: Timer },
  { key: 'queues', label: 'Queues', icon: Users },
  { key: 'keywords', label: 'Keywords', icon: TextSearch },
  { key: 'categories', label: 'Categories', icon: FolderTree },
  { key: 'domains', label: 'Domains', icon: Tag },
  { key: 'thresholds', label: 'Thresholds', icon: Gauge },
  { key: 'scopes', label: 'Scopes', icon: Globe },
];

// ── Generic Config Table ──

const ConfigTable = ({ columns, data, type, onSave, onDelete, onAdd, addTemplate }) => {
  const [editingId, setEditingId] = useState(null);
  const [editRow, setEditRow] = useState({});
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState({});

  const startEdit = (row) => {
    setEditingId(row.id || row.priority || row.code || row.classifierLevel || row.scopeType);
    setEditRow({ ...row });
  };

  const cancelEdit = () => { setEditingId(null); setEditRow({}); };

  const saveEdit = async () => {
    const id = editingId;
    await onSave(id, editRow);
    setEditingId(null);
    setEditRow({});
  };

  const startAdd = () => { setAdding(true); setNewRow(addTemplate || {}); };
  const cancelAdd = () => { setAdding(false); setNewRow({}); };
  const saveAdd = async () => {
    await onAdd(newRow);
    setAdding(false);
    setNewRow({});
  };

  const rows = Array.isArray(data) ? data : Object.entries(data || {}).map(([k, v]) => ({ _key: k, ...v }));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400">{rows.length} items</span>
        <button onClick={startAdd} className="flex items-center gap-1 px-2 py-1 text-xs bg-[#238636] hover:bg-[#2ea043] text-white rounded">
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#30363d]">
              {columns.map(c => (
                <th key={c.key} className="text-left px-2 py-1.5 text-gray-400 font-medium">{c.label}</th>
              ))}
              <th className="w-20 px-2 py-1.5 text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody>
            {adding && (
              <tr className="border-b border-[#1f6feb]/30 bg-[#1f6feb]/10">
                {columns.map(c => (
                  <td key={c.key} className="px-2 py-1">
                    {c.editable !== false ? (
                      <input
                        value={newRow[c.key] ?? ''}
                        onChange={e => setNewRow(r => ({ ...r, [c.key]: c.type === 'number' ? Number(e.target.value) : e.target.value }))}
                        className="w-full bg-[#0d1117] border border-[#30363d] rounded px-1.5 py-0.5 text-gray-200 text-xs"
                        placeholder={c.placeholder || c.label}
                        type={c.type === 'number' ? 'number' : 'text'}
                      />
                    ) : <span className="text-gray-500">—</span>}
                  </td>
                ))}
                <td className="px-2 py-1 flex gap-1">
                  <button onClick={saveAdd} className="p-0.5 text-green-400 hover:bg-[#30363d] rounded"><Check className="w-3.5 h-3.5" /></button>
                  <button onClick={cancelAdd} className="p-0.5 text-red-400 hover:bg-[#30363d] rounded"><X className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            )}
            {rows.map((row, i) => {
              const rowId = row.id || row._key || row.priority || row.code || row.classifierLevel || row.scopeType || i;
              const isEditing = editingId === rowId;
              return (
                <tr key={rowId} className="border-b border-[#21262d] hover:bg-[#161b22]">
                  {columns.map(c => (
                    <td key={c.key} className="px-2 py-1">
                      {isEditing && c.editable !== false ? (
                        <input
                          value={editRow[c.key] ?? ''}
                          onChange={e => setEditRow(r => ({ ...r, [c.key]: c.type === 'number' ? Number(e.target.value) : e.target.value }))}
                          className="w-full bg-[#0d1117] border border-[#30363d] rounded px-1.5 py-0.5 text-gray-200 text-xs"
                          type={c.type === 'number' ? 'number' : 'text'}
                        />
                      ) : (
                        <span className={`text-gray-300 ${c.mono ? 'font-mono' : ''}`}>
                          {row[c.key] !== undefined && row[c.key] !== null ? String(row[c.key]) : '—'}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-1 flex gap-1">
                    {isEditing ? (
                      <>
                        <button onClick={saveEdit} className="p-0.5 text-green-400 hover:bg-[#30363d] rounded"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={cancelEdit} className="p-0.5 text-gray-400 hover:bg-[#30363d] rounded"><X className="w-3.5 h-3.5" /></button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(row)} className="p-0.5 text-blue-400 hover:bg-[#30363d] rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => onDelete(rowId)} className="p-0.5 text-red-400 hover:bg-[#30363d] rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── Tab Content Definitions ──

const TAB_CONFIGS = {
  sla: {
    columns: [
      { key: 'priority', label: 'Priority', editable: false, mono: true },
      { key: 'responseHours', label: 'Response (h)', type: 'number' },
      { key: 'resolutionHours', label: 'Resolution (h)', type: 'number' },
      { key: 'escalationHours', label: 'Escalation (h)', type: 'number' },
      { key: 'businessHoursOnly', label: 'Biz Hours' },
    ],
    addTemplate: { priority: '', responseHours: 8, resolutionHours: 48, escalationHours: 24, businessHoursOnly: false },
    transform: (data) => {
      if (!data || typeof data !== 'object') return [];
      if (Array.isArray(data)) return data;
      return Object.entries(data).map(([k, v]) => ({ id: `sla-${k}`, priority: k, ...v }));
    },
  },
  queues: {
    columns: [
      { key: 'queueCode', label: 'Queue Code', mono: true },
      { key: 'teamName', label: 'Team Name' },
      { key: 'description', label: 'Description' },
    ],
    addTemplate: { queueCode: '', teamName: '', description: '' },
    transform: (data) => {
      if (Array.isArray(data)) return data;
      return Object.entries(data || {}).map(([k, v]) => ({ id: `queue-${k.toLowerCase().replace(/[^a-z0-9]/g, '-')}`, queueCode: k, teamName: v }));
    },
  },
  keywords: {
    columns: [
      { key: 'pattern', label: 'Pattern (regex)', mono: true },
      { key: 'category', label: 'Category', mono: true },
      { key: 'priority', label: 'Priority', type: 'number' },
    ],
    addTemplate: { pattern: '', category: '', priority: 5 },
    transform: (data) => Array.isArray(data) ? data : [],
  },
  categories: {
    columns: [
      { key: 'code', label: 'Code', mono: true },
      { key: 'name', label: 'Name' },
      { key: 'parentCode', label: 'Parent', mono: true },
      { key: 'level', label: 'Level', type: 'number' },
    ],
    addTemplate: { code: '', name: '', parentCode: '', level: 3 },
    transform: (data) => Array.isArray(data) ? data : [],
  },
  domains: {
    columns: [
      { key: 'code', label: 'Code', mono: true },
      { key: 'name', label: 'Name' },
      { key: 'color', label: 'Color' },
    ],
    addTemplate: { code: '', name: '', color: '#64748b' },
    transform: (data) => Array.isArray(data) ? data : [],
  },
  thresholds: {
    columns: [
      { key: 'classifierLevel', label: 'Level', editable: false, mono: true },
      { key: 'highThreshold', label: 'High', type: 'number' },
      { key: 'mediumThreshold', label: 'Medium', type: 'number' },
      { key: 'lowThreshold', label: 'Low', type: 'number' },
    ],
    addTemplate: { classifierLevel: '', highThreshold: 0.5, mediumThreshold: null, lowThreshold: null },
    transform: (data) => {
      if (Array.isArray(data)) return data;
      return Object.entries(data || {}).map(([k, v]) => ({ id: `threshold-${k.toLowerCase()}`, classifierLevel: k, ...v }));
    },
  },
  scopes: {
    columns: [
      { key: 'scopeType', label: 'Scope', mono: true },
      { key: 'priority', label: 'Priority', type: 'number' },
      { key: 'matchField', label: 'Match Field', mono: true },
      { key: 'description', label: 'Description' },
    ],
    addTemplate: { scopeType: '', priority: 1, matchField: '', description: '' },
    transform: (data) => Array.isArray(data) ? data : [],
  },
};

// ── Main Page ──

export default function FlowDeskConfigPage() {
  const { configs, activeTab, setActiveTab, loadConfig, createItem, updateItem, deleteItem, invalidateCache } = useFlowDeskConfigStore();

  useEffect(() => {
    loadConfig(activeTab);
  }, [activeTab, loadConfig]);

  const handleRefresh = useCallback(async () => {
    await invalidateCache(activeTab);
    await loadConfig(activeTab);
  }, [activeTab, invalidateCache, loadConfig]);

  const cfg = configs[activeTab];
  const tabConfig = TAB_CONFIGS[activeTab];
  const displayData = tabConfig.transform(cfg?.data);

  return (
    <div className="h-full flex flex-col bg-[#0d1117] text-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d]">
        <h1 className="text-lg font-semibold">FlowDesk Configuration</h1>
        <button onClick={handleRefresh} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#21262d] hover:bg-[#30363d] rounded border border-[#30363d]">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#30363d] px-2 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap border-b-2 transition-colors
                ${activeTab === t.key ? 'border-[#f97316] text-[#f97316]' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
            >
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {cfg?.loading && <div className="text-center text-gray-500 py-8">Loading...</div>}
        {cfg?.error && <div className="text-center text-red-400 py-4 text-xs">Error: {cfg.error}</div>}
        {!cfg?.loading && (
          <ConfigTable
            columns={tabConfig.columns}
            data={displayData}
            type={activeTab}
            onSave={(id, data) => updateItem(activeTab, id, data)}
            onDelete={(id) => deleteItem(activeTab, id)}
            onAdd={(data) => createItem(activeTab, data)}
            addTemplate={tabConfig.addTemplate}
          />
        )}
      </div>
    </div>
  );
}
