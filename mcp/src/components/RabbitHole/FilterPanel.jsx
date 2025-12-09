import React, { useState, useRef, useEffect } from 'react';
import { Filter, Plus, X, ChevronDown, ChevronUp } from 'lucide-react';

const FilterPanel = ({ filters, onFilterChange, onSearch, fieldDefinitions }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [focusedFilterIndex, setFocusedFilterIndex] = useState(null);
    const inputRefs = useRef([]);

    useEffect(() => {
        if (isExpanded && focusedFilterIndex !== null && inputRefs.current[focusedFilterIndex]) {
            inputRefs.current[focusedFilterIndex].focus();
            setFocusedFilterIndex(null); // Reset after focus
        }
    }, [isExpanded, focusedFilterIndex]);

    const updateFilter = (index, key, value) => {
        const newFilters = [...filters];
        newFilters[index][key] = value;
        onFilterChange(newFilters);
    };

    const removeFilter = (index) => {
        const newFilters = filters.filter((_, i) => i !== index);
        onFilterChange(newFilters);
    };

    const addFilter = () => {
        onFilterChange([...filters, { field: 'System.AssignedTo', operator: '=', value: '' }]);
        setIsExpanded(true);
        // Focus the new filter (last index) after render
        setTimeout(() => {
            setFocusedFilterIndex(filters.length);
        }, 0);
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

    const inputStyle = {
        height: '32px',
        fontSize: '13px',
        padding: '0 8px',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border-color)',
        width: '100%'
    };

    const getFilterLabel = (filter) => {
        const fieldLabel = fieldDefinitions[filter.field]?.label || filter.field;
        const valueDisplay = filter.value || '(empty)';
        return `${fieldLabel} ${filter.operator} ${valueDisplay}`;
    };

    return (
        <div className="card" style={{ padding: '12px', marginBottom: '16px' }}>
            <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={handleHeaderClick}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, overflow: 'hidden' }}>
                    <Filter size={14} color="var(--un-navy)" />

                    {filters.length === 0 ? (
                        <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-secondary)' }}>
                            No active filters
                        </span>
                    ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {filters.map((filter, index) => (
                                <span
                                    key={index}
                                    onClick={(e) => handleFilterChipClick(e, index)}
                                    style={{
                                        fontSize: '12px',
                                        background: 'var(--bg-secondary)',
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        border: '1px solid var(--border-color)',
                                        color: 'var(--un-navy)',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                    title="Click to edit"
                                >
                                    {getFilterLabel(filter)}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={(e) => { e.stopPropagation(); addFilter(); }} style={{ background: 'none', border: 'none', color: 'var(--un-blue)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                            <Plus size={14} /> Add
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onSearch(); }}
                            className="btn-primary"
                            style={{ height: '28px', fontSize: '12px', padding: '0 12px' }}
                        >
                            Search
                        </button>
                    </div>
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
            </div>

            {isExpanded && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                    {filters.map((filter, index) => (
                        <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
                            <select
                                value={filter.field}
                                onChange={(e) => updateFilter(index, 'field', e.target.value)}
                                style={{ ...inputStyle, width: '45%' }}
                            >
                                {Object.keys(fieldDefinitions).map(key => (
                                    <option key={key} value={key}>{fieldDefinitions[key].label}</option>
                                ))}
                            </select>
                            <select
                                value={filter.operator}
                                onChange={(e) => updateFilter(index, 'operator', e.target.value)}
                                style={{ ...inputStyle, width: '10%', minWidth: '60px', textAlign: 'center' }}
                            >
                                {['=', '<>', '>', '<', '>=', '<=', 'Contains'].map(op => (
                                    <option key={op} value={op}>{op}</option>
                                ))}
                            </select>
                            <input
                                ref={el => inputRefs.current[index] = el}
                                type="text"
                                value={filter.value}
                                onChange={(e) => updateFilter(index, 'value', e.target.value)}
                                style={{ ...inputStyle, width: '45%', flex: 1 }}
                            />
                            <button onClick={() => removeFilter(index)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#999', padding: '4px' }}>
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default FilterPanel;
