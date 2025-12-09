import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchWorkItems, triggerIngestion } from '../services/api';
import { Filter, Play, AlertTriangle } from 'lucide-react';

const WorkItemsPage = () => {
    const [filters, setFilters] = useState({ type: '', state: '', area: '' });
    const [items, setItems] = useState([]);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const handleSearch = async () => {
        setIsLoading(true);
        try {
            const result = await searchWorkItems(filters);
            setItems(result.items || []);
        } catch (error) {
            console.error("Search failed", error);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleSelect = (id) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === items.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(items.map(i => i.id)));
        }
    };

    const handleBatchIngest = async () => {
        const ids = Array.from(selectedIds);
        if (ids.length > 50) return;

        try {
            await triggerIngestion(ids, 'devops', 'batch');
            alert(`Successfully queued ${ids.length} items for ingestion.`);
            setSelectedIds(new Set());
        } catch (error) {
            alert(`Error: ${error.response?.data?.error || error.message}`);
        }
    };

    const isSelectionValid = selectedIds.size > 0 && selectedIds.size <= 50;
    const isSelectionTooLarge = selectedIds.size > 50;

    return (
        <div className="page-content" style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <header style={{ marginBottom: '20px' }}>
                <h1>Work Items Manager</h1>
            </header>

            {/* Filter Bar */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', padding: '15px', background: 'white', borderRadius: '8px', border: '1px solid #eee' }}>
                <input
                    placeholder="Type (e.g. Bug)"
                    value={filters.type}
                    onChange={e => setFilters({ ...filters, type: e.target.value })}
                    style={inputStyle}
                />
                <input
                    placeholder="State (e.g. Active)"
                    value={filters.state}
                    onChange={e => setFilters({ ...filters, state: e.target.value })}
                    style={inputStyle}
                />
                <input
                    placeholder="Area Path"
                    value={filters.area}
                    onChange={e => setFilters({ ...filters, area: e.target.value })}
                    style={inputStyle}
                />
                <button onClick={handleSearch} style={btnStyle}>
                    <Filter size={16} /> Search
                </button>
            </div>

            {/* Action Bar */}
            {selectedIds.size > 0 && (
                <div style={{ marginBottom: '15px', padding: '10px', background: '#e6f7ff', border: '1px solid #91d5ff', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <strong>{selectedIds.size} items selected</strong>

                    {isSelectionTooLarge ? (
                        <span style={{ color: '#cf1322', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <AlertTriangle size={16} /> Limit exceeded (Max 50)
                        </span>
                    ) : (
                        <button onClick={handleBatchIngest} style={{ ...btnStyle, background: '#1890ff', color: 'white', borderColor: '#1890ff' }}>
                            <Play size={16} /> Analyze & Ingest Selected
                        </button>
                    )}
                </div>
            )}

            {/* Results Table */}
            <div style={{ flex: 1, overflow: 'auto', background: 'white', borderRadius: '8px', border: '1px solid #eee' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#fafafa', borderBottom: '1px solid #eee' }}>
                        <tr>
                            <th style={thStyle}>
                                <input type="checkbox" checked={items.length > 0 && selectedIds.size === items.length} onChange={toggleSelectAll} />
                            </th>
                            <th style={thStyle}>ID</th>
                            <th style={thStyle}>Title</th>
                            <th style={thStyle}>Type</th>
                            <th style={thStyle}>State</th>
                            <th style={thStyle}>Assigned To</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map(item => (
                            <tr key={item.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                <td style={tdStyle}>
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(item.id)}
                                        onChange={() => toggleSelect(item.id)}
                                    />
                                </td>
                                <td style={tdStyle} onClick={() => navigate(`/workitem/${item.id}`)} className="clickable-cell">{item.id}</td>
                                <td style={tdStyle} onClick={() => navigate(`/workitem/${item.id}`)} className="clickable-cell">{item.fields['System.Title']}</td>
                                <td style={tdStyle}>{item.fields['System.WorkItemType']}</td>
                                <td style={tdStyle}>{item.fields['System.State']}</td>
                                <td style={tdStyle}>{item.fields['System.AssignedTo']}</td>
                            </tr>
                        ))}
                        {items.length === 0 && !isLoading && (
                            <tr>
                                <td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: '#999' }}>No items found. Try searching.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const inputStyle = { padding: '8px', borderRadius: '4px', border: '1px solid #ddd', flex: 1 };
const btnStyle = { padding: '8px 16px', borderRadius: '4px', border: '1px solid #ddd', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' };
const thStyle = { padding: '12px', textAlign: 'left', fontWeight: '600', color: '#555' };
const tdStyle = { padding: '12px' };

export default WorkItemsPage;
