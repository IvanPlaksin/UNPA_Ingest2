// mcp/src/pages/WorkItemsListPage.jsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchWorkItemsList, searchWorkItems, startIngestionJob } from '../services/api';
import IngestionVisualizer from '../components/Knowledge/IngestionVisualizer';
import { RefreshCw, Database, CheckSquare, Square, Filter, Plus, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Storage } from '../utils/storage';

const FIELD_DEFINITIONS = {
    'System.Id': { label: 'ID', type: 'integer' },
    'System.WorkItemType': { label: 'Type', type: 'string' },
    'System.Title': { label: 'Title', type: 'string' },
    'System.State': { label: 'State', type: 'string' },
    'System.CreatedDate': { label: 'Created', type: 'date' },
    'System.ChangedDate': { label: 'Changed', type: 'date' },
    'System.AreaPath': { label: 'Area Path', type: 'string' },
    'System.IterationPath': { label: 'Iteration', type: 'string' },
    'System.AssignedTo': { label: 'Assigned To', type: 'string' },
    'System.CreatedBy': { label: 'Created By', type: 'string' },
    'System.Tags': { label: 'Tags', type: 'string' }
};

const BASE_COLUMNS = ['System.Id', 'System.WorkItemType', 'System.Title', 'System.State', 'System.CreatedDate', 'System.ChangedDate'];
const STORAGE_KEY = 'work_items_filters';

const DEFAULT_FILTERS = [
    { field: 'System.AreaPath', operator: '=', value: 'ATS' },
    { field: 'System.CreatedDate', operator: '>=', value: '@today-90' }
];

const WorkItemsListPage = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [activeJobId, setActiveJobId] = useState(null);

    // Filter State
    const [filters, setFilters] = useState(() => Storage.load(STORAGE_KEY, DEFAULT_FILTERS));
    const [showFilterPanel, setShowFilterPanel] = useState(false);

    // Derived Columns
    const getVisibleColumns = () => {
        const filterFields = filters.map(f => f.field);
        const uniqueFields = [...new Set([...BASE_COLUMNS, ...filterFields])];
        return uniqueFields;
    };

    const buildWiql = () => {
        const columns = getVisibleColumns();
        const selectClause = columns.map(c => `[${c}]`).join(', ');

        const whereConditions = filters.map(f => {
            let val = f.value;
            // Quote string values if not macros or numbers (simple heuristic)
            if (!val.startsWith('@') && isNaN(val)) {
                val = `'${val}'`;
            }
            return `[${f.field}] ${f.operator} ${val}`;
        });

        // Always exclude Closed items as per original logic, or make it a filter? 
        // User requested "Base set of columns and filters should include those fields that are shown now"
        // The original query was: WHERE [System.State] <> 'Closed'
        // We will append this to the user filters.
        const baseCondition = "[System.State] <> 'Closed'";
        const whereClause = [baseCondition, ...whereConditions].join(' AND ');

        return `SELECT ${selectClause} FROM workitems WHERE ${whereClause} ORDER BY [System.ChangedDate] DESC`;
    };

    const loadData = async () => {
        setLoading(true);
        try {
            // Convert filters to API format
            // We need to handle the "Closed" state filter which is implicit in this page
            const apiFilters = filters.map(f => ({
                field: f.field,
                operator: f.operator,
                value: f.value
            }));

            // Add implicit filter: State <> Closed
            // Check if it's already there to avoid duplicates?
            // For now, just add it.
            apiFilters.push({ field: 'System.State', operator: '<>', value: 'Closed' });

            console.log("Executing Search:", apiFilters);
            const { items: data } = await searchWorkItems(apiFilters, 1, 50);

            if (data.length > 0) setItems(data);
            else {
                setItems([]);
            }
        } catch (e) {
            console.error("Load error", e);
            setItems([]);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadData();
        Storage.save(STORAGE_KEY, filters);
    }, [filters]);

    const addFilter = () => {
        setFilters([...filters, { field: 'System.AssignedTo', operator: '=', value: '' }]);
    };

    const updateFilter = (index, key, value) => {
        const newFilters = [...filters];
        newFilters[index][key] = value;
        setFilters(newFilters);
    };

    const removeFilter = (index) => {
        const newFilters = filters.filter((_, i) => i !== index);
        setFilters(newFilters);
    };

    const toggleSelect = (id) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === items.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(items.map(i => i['System.Id'])));
    };

    const handleIngest = async () => {
        if (selectedIds.size === 0) return;
        if (selectedIds.size > 50) {
            alert("Пожалуйста, выберите не более 50 задач за раз.");
            return;
        }

        try {
            const response = await startIngestionJob(Array.from(selectedIds), 'user');
            if (response && response.jobId) {
                setActiveJobId(response.jobId);
                setSelectedIds(new Set());

                // Also dispatch event for Dashboard
                const event = new CustomEvent('open-ingestion-visualizer', { detail: { jobId: response.jobId } });
                window.dispatchEvent(event);
            } else {
                throw new Error("Invalid response from server");
            }
        } catch (error) {
            console.error("Ingestion failed:", error);
            alert("Failed to start ingestion.");
        }
    };

    return (
        <div className="page-content" style={{ padding: '0' }}> {/* No padding on page level */}

            {/* Toolbar */}
            <div style={{
                padding: '8px 16px',
                background: 'white',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h2 style={{ fontSize: '16px', margin: 0 }}>Work Items</h2>
                    <button
                        onClick={() => setShowFilterPanel(!showFilterPanel)}
                        className="btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        <Filter size={12} /> {filters.length} Filters {showFilterPanel ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={loadData} className="btn-secondary">
                        <RefreshCw size={14} /> Refresh
                    </button>
                    <button
                        onClick={handleIngest}
                        disabled={selectedIds.size === 0}
                        className="btn-primary"
                    >
                        <Database size={14} /> Ingest ({selectedIds.size})
                    </button>
                </div>
            </div>

            {/* Table Container with scroll */}
            <div style={{ flex: 1, overflow: 'auto', padding: '16px', display: 'flex', flexDirection: 'column' }}>
                {/* ⭐ ВИЗУАЛИЗАТОР (Показываем, если есть активная задача) */}
                {activeJobId && (
                    <div style={{ marginBottom: '16px' }}>
                        <IngestionVisualizer
                            jobId={activeJobId}
                            onClose={() => setActiveJobId(null)}
                        />
                    </div>
                )}

                <div className="card" style={{ overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    {loading ? <p style={{ padding: '16px' }}>Loading...</p> : (
                        <div style={{ overflow: 'auto', flex: 1 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ position: 'sticky', top: 0, background: 'white', zIndex: 1, borderBottom: '1px solid #eee' }}>
                                    <tr>
                                        <th style={{ width: '40px', padding: '8px' }}>
                                            <div onClick={toggleSelectAll} style={{ cursor: 'pointer' }}>
                                                {selectedIds.size === items.length && items.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />}
                                            </div>
                                        </th>
                                        {getVisibleColumns().map(col => (
                                            <th key={col} style={{ padding: '8px', textAlign: 'left', fontSize: '12px', color: '#666' }}>
                                                {FIELD_DEFINITIONS[col]?.label || col}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map(item => {
                                        const id = item['System.Id'];
                                        return (
                                            <tr key={id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                                <td style={{ padding: '8px' }}>
                                                    <div onClick={() => toggleSelect(id)} style={{ cursor: 'pointer' }}>
                                                        {selectedIds.has(id) ? <CheckSquare size={16} color="var(--un-blue)" /> : <Square size={16} color="var(--text-secondary)" />}
                                                    </div>
                                                </td>
                                                {getVisibleColumns().map(col => (
                                                    <td key={col} style={{ padding: '8px', fontSize: '13px' }}>
                                                        {col === 'System.Title' ? (
                                                            <Link to={`/workitem/${id}`} style={{ color: 'var(--un-blue)', textDecoration: 'none', fontWeight: '500' }}>
                                                                {item[col]}
                                                            </Link>
                                                        ) : col === 'System.State' ? (
                                                            <span className={`status-badge ${item[col]?.toLowerCase()}`}>
                                                                {item[col]}
                                                            </span>
                                                        ) : (
                                                            item[col]
                                                        )}
                                                    </td>
                                                ))}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Filter Panel at the bottom */}
                {showFilterPanel && (
                    <div style={{
                        marginTop: '16px',
                        padding: '16px',
                        background: '#f8f9fa',
                        border: '1px solid #e0e0e0',
                        borderRadius: '4px',
                        maxHeight: '300px',
                        overflowY: 'auto'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <h3 style={{ fontSize: '14px', margin: 0 }}>Active Filters</h3>
                            <button onClick={addFilter} style={{ background: 'none', border: 'none', color: 'var(--un-blue)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                                <Plus size={14} /> Add Filter
                            </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {filters.map((filter, index) => (
                                <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <select
                                        value={filter.field}
                                        onChange={(e) => updateFilter(index, 'field', e.target.value)}
                                        style={{ padding: '4px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '12px' }}
                                    >
                                        {Object.keys(FIELD_DEFINITIONS).map(key => (
                                            <option key={key} value={key}>{FIELD_DEFINITIONS[key].label}</option>
                                        ))}
                                    </select>
                                    <select
                                        value={filter.operator}
                                        onChange={(e) => updateFilter(index, 'operator', e.target.value)}
                                        style={{ padding: '4px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '12px' }}
                                    >
                                        {['=', '<>', '>', '<', '>=', '<=', 'Contains'].map(op => (
                                            <option key={op} value={op}>{op}</option>
                                        ))}
                                    </select>
                                    <input
                                        type="text"
                                        value={filter.value}
                                        onChange={(e) => updateFilter(index, 'value', e.target.value)}
                                        style={{ padding: '4px', borderRadius: '4px', border: '1px solid #ccc', flex: 1, fontSize: '12px' }}
                                    />
                                    <button onClick={() => removeFilter(index)} style={{ background: 'none', border: 'none', color: '#d9534f', cursor: 'pointer' }}>
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WorkItemsListPage;
