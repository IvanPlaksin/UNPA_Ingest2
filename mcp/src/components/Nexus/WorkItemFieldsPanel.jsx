import React, { useState, useEffect } from 'react';
import { Database, ChevronDown, ChevronUp, Columns } from 'lucide-react';

const WorkItemFieldsPanel = ({ workItem, visibleFields, onToggleField }) => {

    const FIELD_CATEGORIES = [
        {
            category: "Header Information",
            description: "Critical identifying information always visible at the top.",
            fields: [
                { fieldName: "System.Id", displayName: "ID", valueType: "Integer", isReadOnly: true },
                { fieldName: "System.Title", displayName: "Title", valueType: "String", isReadOnly: false },
                { fieldName: "System.WorkItemType", displayName: "Type", valueType: "String", isReadOnly: true }
            ]
        },
        {
            category: "Workflow & Status",
            description: "Fields controlling the lifecycle and assignment of the item.",
            fields: [
                { fieldName: "System.State", displayName: "State", valueType: "String", isReadOnly: false },
                { fieldName: "System.Reason", displayName: "Reason", valueType: "String", isReadOnly: false },
                { fieldName: "System.AssignedTo", displayName: "Assigned To", valueType: "Identity", isReadOnly: false }
            ]
        },
        {
            category: "Planning & Classification",
            description: "Fields used for organizing work into timeframes and functional areas.",
            fields: [
                { fieldName: "System.AreaPath", displayName: "Area", valueType: "TreePath", isReadOnly: false },
                { fieldName: "System.IterationPath", displayName: "Iteration", valueType: "TreePath", isReadOnly: false },
                { fieldName: "Microsoft.VSTS.Common.Priority", displayName: "Priority", valueType: "Integer", isReadOnly: false }
            ]
        },
        {
            category: "Detailed Description",
            description: "Rich text fields containing the core content.",
            fields: [
                { fieldName: "System.Description", displayName: "Description", valueType: "HTML", isReadOnly: false },
                { fieldName: "Microsoft.VSTS.TCM.ReproSteps", displayName: "Repro Steps", valueType: "HTML", isReadOnly: false },
                { fieldName: "System.History", displayName: "Discussion", valueType: "History", isReadOnly: false }
            ]
        },
        {
            category: "Effort & Scheduling",
            description: "Quantifiable metrics regarding the work.",
            fields: [
                { fieldName: "Microsoft.VSTS.Scheduling.StoryPoints", displayName: "Story Points", valueType: "Double", isReadOnly: false },
                { fieldName: "Microsoft.VSTS.Scheduling.Effort", displayName: "Effort", valueType: "Double", isReadOnly: false }
            ]
        },
        {
            category: "System Metadata",
            description: "Audit trails automatically maintained by the system.",
            fields: [
                { fieldName: "System.CreatedDate", displayName: "Created Date", valueType: "DateTime", isReadOnly: true },
                { fieldName: "System.CreatedBy", displayName: "Created By", valueType: "Identity", isReadOnly: true },
                { fieldName: "System.ChangedDate", displayName: "Changed Date", valueType: "DateTime", isReadOnly: true }
            ]
        }
    ];

    // Flatten default fields from categories for initial state
    const DEFAULT_FIELDS = FIELD_CATEGORIES.flatMap(cat => cat.fields.map(f => f.fieldName));

    // Internal state for visibility if not controlled externally
    const [internalVisibleFields, setInternalVisibleFields] = useState(DEFAULT_FIELDS);
    const [isSelectorExpanded, setIsSelectorExpanded] = useState(false);

    // Determine if controlled externally
    const isControlled = Array.isArray(visibleFields);
    const currentVisibleFields = isControlled ? visibleFields : internalVisibleFields;

    const handleToggle = (field) => {
        if (isControlled) {
            if (onToggleField) {
                onToggleField(field);
            }
        } else {
            if (internalVisibleFields.includes(field)) {
                setInternalVisibleFields(internalVisibleFields.filter(f => f !== field));
            } else {
                setInternalVisibleFields([...internalVisibleFields, field]);
            }
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    };

    const renderField = (fieldDef) => {
        const value = workItem.fields[fieldDef.fieldName];

        // If field is not in workItem, don't render (or render empty state if desired, but usually hidden)
        if (!currentVisibleFields.includes(fieldDef.fieldName)) return null;

        if (fieldDef.valueType === 'HTML' || fieldDef.valueType === 'History') {
            return (
                <div key={fieldDef.fieldName} style={{ width: '100%', marginBottom: '8px' }}>
                    <strong style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>
                        {fieldDef.displayName}:
                    </strong>
                    <div
                        className="p-2 bg-gray-50 rounded text-sm"
                        style={{ maxHeight: '300px', overflowY: 'auto' }}
                        dangerouslySetInnerHTML={{ __html: value || '<span class="text-gray-400">Empty</span>' }}
                    />
                </div>
            );
        }

        let displayValue = value !== undefined && value !== null ? String(value) : <span className="text-gray-400">-</span>;

        if (fieldDef.valueType === 'DateTime' && value) {
            displayValue = formatDate(value);
        }

        return (
            <div key={fieldDef.fieldName} style={{ display: 'flex', alignItems: 'baseline', gap: '6px', fontSize: '13px', marginRight: '16px', marginBottom: '4px' }}>
                <strong style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fieldDef.displayName}:</strong>
                <span style={{ color: 'var(--un-navy)' }}>{displayValue}</span>
            </div>
        );
    };

    if (!workItem || !workItem.fields) {
        return <div className="p-4 text-gray-500">No Work Item data available.</div>;
    }

    return (
        <div className="card mb-4 p-4">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                    <span className="status-badge active">CORE</span> DevOps Data
                </h3>

                {/* Field Selector Toggle */}
                <button
                    onClick={() => setIsSelectorExpanded(!isSelectorExpanded)}
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: isControlled ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: 'var(--text-secondary)',
                        fontSize: '12px',
                        opacity: isControlled ? 0.5 : 1
                    }}
                    title={isControlled ? "Field visibility is controlled by parent" : "Select fields to display"}
                    disabled={isControlled}
                >
                    <Columns size={14} />
                    {isControlled ? 'Fixed View' : 'Select Fields'}
                    {!isControlled && (isSelectorExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                </button>
            </div>

            {/* Field Selector Panel */}
            {isSelectorExpanded && !isControlled && (
                <div style={{
                    marginBottom: '16px',
                    padding: '12px',
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                }}>
                    {FIELD_CATEGORIES.map(category => (
                        <div key={category.category}>
                            <h4 style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--un-navy)', margin: '0 0 4px 0' }}>{category.category}</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
                                {category.fields.map(field => (
                                    <label key={field.fieldName} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={currentVisibleFields.includes(field.fieldName)}
                                            onChange={() => handleToggle(field.fieldName)}
                                            style={{ cursor: 'pointer' }}
                                        />
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={field.fieldName}>
                                            {field.displayName}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Categorized Fields Display */}
            <div className="flex flex-col gap-4">
                {FIELD_CATEGORIES.map(category => {
                    // Check if any fields in this category are visible
                    const hasVisibleFields = category.fields.some(f => currentVisibleFields.includes(f.fieldName));
                    if (!hasVisibleFields) return null;

                    return (
                        <div key={category.category} style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                            <h4 style={{
                                fontSize: '13px',
                                fontWeight: '600',
                                color: 'var(--un-blue)',
                                margin: '0 0 8px 0',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                {category.category}
                            </h4>
                            <div style={{ display: 'flex', flexWrap: 'wrap', rowGap: '4px' }}>
                                {category.fields.map(field => renderField(field))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default WorkItemFieldsPanel;
