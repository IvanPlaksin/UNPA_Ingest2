import React, { useState, useRef, useEffect } from 'react';
import { Filter, Plus, X, ChevronDown, ChevronUp } from 'lucide-react';
import {
    Paper,
    Box,
    Typography,
    Chip,
    Button,
    Collapse,
    TextField,
    MenuItem,
    IconButton,
    Stack
} from '@mui/material';

const FilterPanel = ({ filters, onFilterChange, onSearch, fieldDefinitions }) => {
    // Local state for deferred filtering
    const [localFilters, setLocalFilters] = useState(filters);
    const [isExpanded, setIsExpanded] = useState(false);
    const [focusedFilterIndex, setFocusedFilterIndex] = useState(null);
    const inputRefs = useRef([]);

    // Sync local state when parent filters change (e.g. via AI or initial load)
    useEffect(() => {
        setLocalFilters(filters);
    }, [filters]);

    useEffect(() => {
        if (isExpanded && focusedFilterIndex !== null && inputRefs.current[focusedFilterIndex]) {
            inputRefs.current[focusedFilterIndex].focus();
            setFocusedFilterIndex(null); // Reset after focus
        }
    }, [isExpanded, focusedFilterIndex]);

    // Update local state only
    const updateFilter = (index, key, value) => {
        const newFilters = [...localFilters];
        newFilters[index][key] = value;
        setLocalFilters(newFilters);
    };

    // Update local state only
    const removeFilter = (index) => {
        const newFilters = localFilters.filter((_, i) => i !== index);
        setLocalFilters(newFilters);
    };

    // Update local state only
    const addFilter = () => {
        setLocalFilters([...localFilters, { field: 'System.AssignedTo', operator: '=', value: '' }]);
        setIsExpanded(true);
        // Focus the new filter (last index) after render
        setTimeout(() => {
            // Use current length as index for the new item
            setFocusedFilterIndex(localFilters.length);
        }, 0);
    };

    // Apply changes to parent
    const handleApplySearch = () => {
        onFilterChange(localFilters);
        onSearch();
    };

    const handleHeaderClick = (e) => {
        // If clicking the "Add Filter" or "Search" buttons, don't toggle
        if (e.target.closest('button')) return;

        setIsExpanded(!isExpanded);
    };

    const handleFilterChipClick = (e, index) => {
        e.stopPropagation();
        setIsExpanded(true);
        setFocusedFilterIndex(index);
    };

    const getFilterLabel = (filter) => {
        const fieldLabel = fieldDefinitions[filter.field]?.label || filter.field;
        const valueDisplay = filter.value || '(empty)';
        return `${fieldLabel} ${filter.operator} ${valueDisplay}`;
    };

    return (
        <Paper variant="outlined" sx={{ mb: 2, overflow: 'hidden' }}>
            <Box
                onClick={handleHeaderClick}
                sx={{
                    p: 1.5,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    bgcolor: isExpanded ? 'background.default' : 'transparent'
                }}
            >
                <Stack direction="row" alignItems="center" spacing={1} sx={{ flex: 1, overflow: 'hidden' }}>
                    <Filter size={16} className="text-gray-500" />

                    {localFilters.length === 0 ? (
                        <Typography variant="body2" color="text.secondary" fontWeight={500}>
                            No active filters
                        </Typography>
                    ) : (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {localFilters.map((filter, index) => (
                                <Chip
                                    key={index}
                                    label={getFilterLabel(filter)}
                                    size="small"
                                    onClick={(e) => handleFilterChipClick(e, index)}
                                    onDelete={(e) => { e.stopPropagation(); removeFilter(index); }}
                                    variant="outlined"
                                    sx={{ fontSize: '0.75rem', height: 24, cursor: 'pointer' }}
                                />
                            ))}
                        </Box>
                    )}
                </Stack>

                <Stack direction="row" alignItems="center" spacing={1}>
                    <Button
                        size="small"
                        startIcon={<Plus size={14} />}
                        onClick={(e) => { e.stopPropagation(); addFilter(); }}
                        sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                    >
                        Add
                    </Button>
                    <Button
                        variant="contained"
                        size="small"
                        onClick={(e) => { e.stopPropagation(); handleApplySearch(); }}
                        disableElevation
                        sx={{ textTransform: 'none', fontSize: '0.75rem', px: 2, height: 28 }}
                    >
                        Search
                    </Button>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </Stack>
            </Box>

            <Collapse in={isExpanded}>
                <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, borderTop: 1, borderColor: 'divider' }}>
                    {localFilters.map((filter, index) => (
                        <Stack key={index} direction="row" spacing={1} alignItems="center">
                            <TextField
                                select
                                size="small"
                                value={filter.field}
                                onChange={(e) => updateFilter(index, 'field', e.target.value)}
                                sx={{ width: '45%' }}
                                InputProps={{ sx: { fontSize: '0.875rem' } }}
                            >
                                {Object.keys(fieldDefinitions).map(key => (
                                    <MenuItem key={key} value={key} sx={{ fontSize: '0.875rem' }}>{fieldDefinitions[key].label}</MenuItem>
                                ))}
                            </TextField>

                            <TextField
                                select
                                size="small"
                                value={filter.operator}
                                onChange={(e) => updateFilter(index, 'operator', e.target.value)}
                                sx={{ width: '15%', minWidth: 80 }}
                                InputProps={{ sx: { fontSize: '0.875rem', textAlign: 'center' } }}
                            >
                                {['=', '<>', '>', '<', '>=', '<=', 'Contains'].map(op => (
                                    <MenuItem key={op} value={op} sx={{ fontSize: '0.875rem' }}>{op}</MenuItem>
                                ))}
                            </TextField>

                            {fieldDefinitions[filter.field]?.type === 'boolean' ? (
                                <TextField
                                    select
                                    size="small"
                                    value={filter.value}
                                    onChange={(e) => updateFilter(index, 'value', e.target.value)}
                                    fullWidth
                                    InputProps={{ sx: { fontSize: '0.875rem' } }}
                                >
                                    <MenuItem value="True">Yes</MenuItem>
                                    <MenuItem value="False">No</MenuItem>
                                </TextField>
                            ) : (
                                <TextField
                                    inputRef={el => inputRefs.current[index] = el}
                                    size="small"
                                    value={filter.value}
                                    onChange={(e) => updateFilter(index, 'value', e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleApplySearch();
                                        }
                                    }}
                                    placeholder="Value"
                                    fullWidth
                                    InputProps={{ sx: { fontSize: '0.875rem' } }}
                                />
                            )}

                            <IconButton onClick={() => removeFilter(index)} size="small" sx={{ color: 'text.secondary' }}>
                                <X size={16} />
                            </IconButton>
                        </Stack>
                    ))}
                </Box>
            </Collapse>
        </Paper>
    );
};

export default FilterPanel;
