import React, { useState, useEffect } from 'react';
import FilterPanel from '../components/RabbitHole/FilterPanel';
import WorkItemsTable from '../components/RabbitHole/WorkItemsTable';
import ContextualChat from '../components/RabbitHole/ContextualChat';
import ColumnSelector from '../components/RabbitHole/ColumnSelector';
import RabbitHoleCommandBar from '../components/RabbitHole/RabbitHoleCommandBar';

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
const STORAGE_KEY_FILTERS = 'rabbit_hole_filters';
const STORAGE_KEY_COLUMNS = 'rabbit_hole_columns';

const DEFAULT_FILTERS = [
    { field: 'System.AreaPath', operator: '=', value: 'ATS' },
    { field: 'System.CreatedDate', operator: '>=', value: '@today-90' }
];

const RabbitHolePage = () => {
    const [filters, setFilters] = useState(() => {
        const loaded = Storage.load(STORAGE_KEY_FILTERS, DEFAULT_FILTERS);
        return Array.isArray(loaded) ? loaded : DEFAULT_FILTERS;
    });

    const [visibleColumns, setVisibleColumns] = useState(() => {
        const loaded = Storage.load(STORAGE_KEY_COLUMNS, BASE_COLUMNS);
        return Array.isArray(loaded) ? loaded : BASE_COLUMNS;
    });

    const [page, setPage] = useState(1);
    const [pageSize] = useState(10); // Default page size
    const [workItems, setWorkItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [pendingCommand, setPendingCommand] = useState(null);

    const fetchWorkItems = async (currentFilters, currentPage = 1) => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('http://localhost:3003/api/v1/rabbithole/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filters: currentFilters,
                    page: currentPage,
                    limit: pageSize
                })
            });
            const data = await response.json();

            if (data.error) {
                setError(data.error);
                setWorkItems([]);
            } else {
                setWorkItems(data.items || []);
            }
        } catch (err) {
            console.error("Search failed:", err);
            setError("Failed to fetch data from the Rabbit Hole.");
        } finally {
            setLoading(false);
        }
    };

    // Initial load & Persistence
    useEffect(() => {
        fetchWorkItems(filters, page);
        Storage.save(STORAGE_KEY_FILTERS, filters);
    }, [filters, page]);

    useEffect(() => {
        Storage.save(STORAGE_KEY_COLUMNS, visibleColumns);
    }, [visibleColumns]);

    const handleSearch = () => {
        setPage(1);
        fetchWorkItems(filters, 1);
    };

    const handleAIAction = (action) => {
        if (!action) return;

        if (action.type === 'UPDATE_FILTERS') {
            const newFilters = action.payload;
            if (Array.isArray(newFilters)) {
                setFilters(newFilters);
            } else {
                // Handle partial updates from AI
                let updatedFilters = [...filters];
                Object.keys(newFilters).forEach(key => {
                    const value = newFilters[key];

                    // Map simple key to full field name (case-insensitive)
                    const fieldMap = {
                        'id': 'System.Id',
                        'title': 'System.Title',
                        'state': 'System.State',
                        'assignedto': 'System.AssignedTo',
                        'assigned to': 'System.AssignedTo',
                        'areapath': 'System.AreaPath',
                        'area path': 'System.AreaPath',
                        'iterationpath': 'System.IterationPath',
                        'iteration path': 'System.IterationPath',
                        'type': 'System.WorkItemType',
                        'workitemtype': 'System.WorkItemType',
                        'work item type': 'System.WorkItemType',
                        'createddate': 'System.CreatedDate',
                        'created date': 'System.CreatedDate',
                        'changeddate': 'System.ChangedDate',
                        'changed date': 'System.ChangedDate',
                        'tags': 'System.Tags'
                    };

                    const lowerKey = key.toLowerCase();
                    const actualField = fieldMap[lowerKey] || key;

                    if (value === null) {
                        // Remove filter
                        updatedFilters = updatedFilters.filter(f => f.field !== actualField);
                    } else {
                        // Update or Add
                        const idx = updatedFilters.findIndex(f => f.field === actualField);
                        if (idx !== -1) {
                            updatedFilters[idx].value = value;
                        } else {
                            updatedFilters.push({ field: actualField, operator: '=', value: value });
                        }
                    }
                });
                setFilters(updatedFilters);
            }
        } else if (action.type === 'UPDATE_COLUMNS') {
            if (action.payload && Array.isArray(action.payload.columns)) {
                setVisibleColumns(action.payload.columns);
            }
        }
    };

    const handleToggleColumn = (field) => {
        if (visibleColumns.includes(field)) {
            setVisibleColumns(visibleColumns.filter(c => c !== field));
        } else {
            setVisibleColumns([...visibleColumns, field]);
        }
    };

    const handleCommand = (text) => {
        setPendingCommand(text);
    };

    const handleCommandHandled = () => {
        setPendingCommand(null);
    };

    const handleNextPage = () => {
        const nextPage = page + 1;
        setPage(nextPage);
        fetchWorkItems(filters, nextPage);
    };

    const handlePrevPage = () => {
        if (page > 1) {
            const prevPage = page - 1;
            setPage(prevPage);
            fetchWorkItems(filters, prevPage);
        }
    };

    return (
        <div className="page-content" style={{ flexDirection: 'row', overflow: 'hidden' }}>
            {/* Main Content Area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                <header style={{
                    height: '48px',
                    padding: '0 16px',
                    background: 'var(--bg-header)',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '20px' }}>🐇</span>
                        <h1 style={{ fontSize: '16px', fontWeight: 500, margin: 0, color: 'var(--un-navy)' }}>The Rabbit Hole</h1>
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>Deep dive into your DevOps backlog with AI assistance.</p>
                </header>

                <main style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                    <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
                        {/* Natural Language Command Bar */}
                        <RabbitHoleCommandBar
                            onCommand={handleCommand}
                            loading={loading || !!pendingCommand}
                        />

                        {/* Dynamic Filter Panel */}
                        <FilterPanel
                            filters={filters}
                            onFilterChange={setFilters}
                            onSearch={handleSearch}
                            fieldDefinitions={FIELD_DEFINITIONS}
                        />

                        {/* Column Selector */}
                        <ColumnSelector
                            visibleColumns={visibleColumns}
                            onToggleColumn={handleToggleColumn}
                            fieldDefinitions={FIELD_DEFINITIONS}
                        />

                        {error && (
                            <div style={{
                                background: '#fde8e8',
                                border: '1px solid #f8b4b4',
                                color: '#9b1c1c',
                                padding: '8px 12px',
                                borderRadius: 'var(--radius)',
                                marginBottom: '16px',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <strong>Error:</strong> {error}
                            </div>
                        )}

                        {loading ? (
                            <div className="card" style={{ padding: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: '12px' }}>
                                <div className="spinner" style={{ width: '24px', height: '24px', border: '2px solid #f3f3f3', borderTop: '2px solid var(--un-blue)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Digging deeper...</span>
                            </div>
                        ) : (
                            <WorkItemsTable
                                items={workItems}
                                page={page}
                                pageSize={pageSize}
                                onNextPage={handleNextPage}
                                onPrevPage={handlePrevPage}
                                visibleColumns={visibleColumns}
                                fieldDefinitions={FIELD_DEFINITIONS}
                            />
                        )}
                    </div>
                </main>
            </div>

            {/* Right Sidebar: Chat */}
            <div style={{
                width: '320px',
                flexShrink: 0,
                background: 'white',
                borderLeft: '1px solid var(--border-color)',
                height: '100%',
                display: 'flex',
                flexDirection: 'column'
            }}>
                <ContextualChat
                    filters={filters}
                    visibleItems={workItems}
                    visibleColumns={visibleColumns}
                    fieldDefinitions={FIELD_DEFINITIONS}
                    onAIAction={handleAIAction}
                    pendingCommand={pendingCommand}
                    onCommandHandled={handleCommandHandled}
                />
            </div>
            <style>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

export default RabbitHolePage;
