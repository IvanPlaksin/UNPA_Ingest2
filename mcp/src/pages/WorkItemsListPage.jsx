// mcp/src/pages/WorkItemsListPage.jsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchWorkItemsList, searchWorkItems, startIngestionJob } from '../services/api';
import IngestionVisualizer from '../components/Knowledge/IngestionVisualizer';
import { RefreshCw, Database, CheckSquare, Square, Filter, Plus, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Storage } from '../utils/storage';
import {
    Box,
    Paper,
    Typography,
    Button,
    IconButton,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Checkbox,
    Chip,
    Stack,
    Toolbar,
    CircularProgress,
    Select,
    MenuItem,
    TextField,
    Collapse,
    AppBar
} from '@mui/material';

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

        const baseCondition = "[System.State] <> 'Closed'";
        const whereClause = [baseCondition, ...whereConditions].join(' AND ');

        return `SELECT ${selectClause} FROM workitems WHERE ${whereClause} ORDER BY [System.ChangedDate] DESC`;
    };

    const loadData = async () => {
        setLoading(true);
        try {
            const apiFilters = filters.map(f => ({
                field: f.field,
                operator: f.operator,
                value: f.value
            }));

            // Add implicit filter: State <> Closed
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

    const getStatusColor = (status) => {
        const s = status?.toLowerCase() || '';
        if (s === 'active' || s === 'committed') return 'primary';
        if (s === 'resolved' || s === 'done') return 'success';
        if (s === 'closed') return 'default';
        if (s === 'new') return 'info';
        return 'default';
    };

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>

            {/* Toolbar */}
            <Paper elevation={1} square sx={{ zIndex: 1 }}>
                <Toolbar variant="dense" sx={{ justifyContent: 'space-between', minHeight: 48 }}>
                    <Stack direction="row" alignItems="center" spacing={2}>
                        <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontSize: '1rem' }}>
                            Work Items
                        </Typography>

                        <Button
                            variant={showFilterPanel ? "contained" : "outlined"}
                            size="small"
                            startIcon={<Filter size={14} />}
                            endIcon={showFilterPanel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            onClick={() => setShowFilterPanel(!showFilterPanel)}
                            sx={{ minWidth: 100 }}
                        >
                            Filters ({filters.length})
                        </Button>
                    </Stack>

                    <Stack direction="row" spacing={1}>
                        <Button variant="outlined" size="small" onClick={loadData} startIcon={<RefreshCw size={14} />}>
                            Refresh
                        </Button>
                        <Button
                            variant="contained"
                            size="small"
                            onClick={handleIngest}
                            disabled={selectedIds.size === 0}
                            startIcon={<Database size={14} />}
                        >
                            Ingest ({selectedIds.size})
                        </Button>
                    </Stack>
                </Toolbar>

                {/* Filter Panel */}
                <Collapse in={showFilterPanel}>
                    <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
                        <Stack spacing={2}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                <Typography variant="subtitle2">Active Filters</Typography>
                                <Button startIcon={<Plus size={14} />} size="small" onClick={addFilter}>Add Filter</Button>
                            </Stack>

                            {filters.map((filter, index) => (
                                <Stack key={index} direction="row" spacing={1} alignItems="center">
                                    <Select
                                        value={filter.field}
                                        onChange={(e) => updateFilter(index, 'field', e.target.value)}
                                        size="small"
                                        sx={{ minWidth: 150, fontSize: '0.875rem' }}
                                    >
                                        {Object.keys(FIELD_DEFINITIONS).map(key => (
                                            <MenuItem key={key} value={key}>{FIELD_DEFINITIONS[key].label}</MenuItem>
                                        ))}
                                    </Select>
                                    <Select
                                        value={filter.operator}
                                        onChange={(e) => updateFilter(index, 'operator', e.target.value)}
                                        size="small"
                                        sx={{ minWidth: 100, fontSize: '0.875rem' }}
                                    >
                                        {['=', '<>', '>', '<', '>=', '<=', 'Contains'].map(op => (
                                            <MenuItem key={op} value={op}>{op}</MenuItem>
                                        ))}
                                    </Select>
                                    <TextField
                                        value={filter.value}
                                        onChange={(e) => updateFilter(index, 'value', e.target.value)}
                                        size="small"
                                        variant="outlined"
                                        fullWidth
                                        sx={{ '& .MuiInputBase-input': { fontSize: '0.875rem', py: 1 } }}
                                    />
                                    <IconButton size="small" color="error" onClick={() => removeFilter(index)}>
                                        <X size={16} />
                                    </IconButton>
                                </Stack>
                            ))}
                        </Stack>
                    </Box>
                </Collapse>
            </Paper>

            {/* Main Content */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', p: 2 }}>

                {/* Visualizer (if active) */}
                {activeJobId && (
                    <Paper sx={{ mb: 2, height: 300, overflow: 'hidden' }}>
                        <IngestionVisualizer
                            jobId={activeJobId}
                            onClose={() => setActiveJobId(null)}
                        />
                    </Paper>
                )}

                <TableContainer component={Paper} variant="outlined" sx={{ flex: 1 }}>
                    <Table stickyHeader size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell padding="checkbox">
                                    <Checkbox
                                        indeterminate={selectedIds.size > 0 && selectedIds.size < items.length}
                                        checked={items.length > 0 && selectedIds.size === items.length}
                                        onChange={toggleSelectAll}
                                        size="small"
                                    />
                                </TableCell>
                                {getVisibleColumns().map(col => (
                                    <TableCell key={col} sx={{ fontWeight: 600, color: 'text.secondary' }}>
                                        {FIELD_DEFINITIONS[col]?.label || col}
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={getVisibleColumns().length + 1} align="center" sx={{ py: 4 }}>
                                        <CircularProgress size={24} />
                                    </TableCell>
                                </TableRow>
                            ) : items.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={getVisibleColumns().length + 1} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                                        No items found
                                    </TableCell>
                                </TableRow>
                            ) : (
                                items.map(item => {
                                    const id = item['System.Id'];
                                    const isSelected = selectedIds.has(id);
                                    return (
                                        <TableRow
                                            key={id}
                                            hover
                                            selected={isSelected}
                                            onClick={() => toggleSelect(id)} // Allow row click to select? Or stick to checkbox to avoid conflict with title click.
                                            role="checkbox"
                                        >
                                            <TableCell padding="checkbox">
                                                <Checkbox checked={isSelected} onChange={(e) => { e.stopPropagation(); toggleSelect(id); }} size="small" />
                                            </TableCell>
                                            {getVisibleColumns().map(col => (
                                                <TableCell key={col}>
                                                    {col === 'System.Title' ? (
                                                        <Link
                                                            to={`/workitem/${id}`}
                                                            style={{ color: 'inherit', textDecoration: 'none', fontWeight: 500 }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <Typography variant="body2" color="primary" sx={{ '&:hover': { textDecoration: 'underline' } }}>
                                                                {item[col]}
                                                            </Typography>
                                                        </Link>
                                                    ) : col === 'System.State' ? (
                                                        <Chip
                                                            label={item[col]}
                                                            size="small"
                                                            color={getStatusColor(item[col])}
                                                            variant="outlined"
                                                            sx={{ height: 20, fontSize: '0.7rem' }}
                                                        />
                                                    ) : (
                                                        <Typography variant="body2" color="text.primary">
                                                            {item[col]}
                                                        </Typography>
                                                    )}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Box>
        </Box>
    );
};

export default WorkItemsListPage;
