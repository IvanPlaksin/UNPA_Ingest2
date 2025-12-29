import React, { useState, useEffect } from 'react';
import FilterPanel from '../components/RabbitHole/FilterPanel';
import WorkItemsTable from '../components/RabbitHole/WorkItemsTable';
import ContextualChat from '../components/RabbitHole/ContextualChat';
import ColumnSelector from '../components/RabbitHole/ColumnSelector';
import RabbitHoleCommandBar from '../components/RabbitHole/RabbitHoleCommandBar';
import { Storage } from '../utils/storage';
import { Box, Paper, AppBar, Toolbar, Typography, Stack, Alert, CircularProgress } from '@mui/material';

const FIELD_DEFINITIONS = {
    // 'HasLinks' is a virtual field for UI, mapped to System.RelatedLinkCount in fetchWorkItems
    'HasLinks': { label: 'Links', type: 'boolean' },
    'System.RelatedLinkCount': { label: 'Links Count', type: 'integer' },
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

const BASE_COLUMNS = ['HasLinks', 'System.Id', 'System.WorkItemType', 'System.Title', 'System.State', 'System.CreatedDate', 'System.ChangedDate'];
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
            // Transform filters for backend (Handle 'HasLinks' mapping here)
            const apiFilters = currentFilters.map(f => {
                if (f.field === 'HasLinks') {
                    const isTrue = String(f.value).toLowerCase() === 'true';
                    return {
                        field: 'System.RelatedLinkCount',
                        operator: isTrue ? '>' : '=',
                        value: 0
                    };
                }
                return f;
            });

            const response = await fetch('http://localhost:3000/api/v1/rabbithole/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filters: apiFilters,
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
        <Box sx={{ display: 'flex', height: '100%', flexDirection: 'row', overflow: 'hidden', bgcolor: 'background.default' }}>
            {/* Main Content Area */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                <AppBar position="static" color="default" elevation={1} sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
                    <Toolbar variant="dense" sx={{ minHeight: 48, justifyContent: 'space-between' }}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                            <Typography variant="h6" fontSize="1.25rem">🐇</Typography>
                            <Typography variant="subtitle1" fontWeight={600} color="text.primary">The Rabbit Hole</Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                            Deep dive into your DevOps backlog with AI assistance.
                        </Typography>
                    </Toolbar>
                </AppBar>

                <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
                    <Box sx={{ maxWidth: 1200, mx: 'auto', width: '100%' }}>
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
                            <Alert severity="error" sx={{ mb: 2 }}>
                                {error}
                            </Alert>
                        )}

                        {loading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 2, p: 5 }}>
                                <CircularProgress />
                                <Typography variant="caption" color="text.secondary">Digging deeper...</Typography>
                            </Box>
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
                    </Box>
                </Box>
            </Box>

            {/* Right Sidebar: Chat */}
            <Box sx={{
                width: 320,
                flexShrink: 0,
                bgcolor: 'background.paper',
                borderLeft: 1,
                borderColor: 'divider',
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
            </Box>
        </Box>
    );
};

export default RabbitHolePage;
