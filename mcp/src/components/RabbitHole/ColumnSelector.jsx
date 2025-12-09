import React, { useState } from 'react';
import { Columns, ChevronDown, ChevronUp } from 'lucide-react';

const ColumnSelector = ({ visibleColumns, onToggleColumn, fieldDefinitions }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Group fields by type or just list them? Listing for now.
    const allFields = Object.keys(fieldDefinitions);

    return (
        <div className="card" style={{ padding: '12px', marginBottom: '16px' }}>
            <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Columns size={14} color="var(--un-navy)" />
                    <h3 style={{ fontSize: '14px', fontWeight: '500', margin: 0, color: 'var(--un-navy)' }}>
                        Columns ({visibleColumns.length})
                    </h3>
                </div>
                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>

            {isExpanded && (
                <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px' }}>
                    {allFields.map(field => (
                        <label key={field} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={visibleColumns.includes(field)}
                                onChange={() => onToggleColumn(field)}
                                style={{ cursor: 'pointer' }}
                            />
                            {fieldDefinitions[field].label}
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ColumnSelector;
