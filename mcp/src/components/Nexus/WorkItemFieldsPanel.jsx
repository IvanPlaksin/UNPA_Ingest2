import React, { useState, useEffect } from 'react';
import { Database, ChevronDown, ChevronUp, Columns } from 'lucide-react';
import {
    Paper,
    Box,
    Typography,
    Stack,
    IconButton,
    Button,
    Chip,
    Collapse,
    Checkbox,
    FormControlLabel,
    Grid,
    Divider
} from '@mui/material';

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
                <Box key={fieldDef.fieldName} sx={{ width: '100%', mb: 1.5 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.5}>
                        {fieldDef.displayName}:
                    </Typography>
                    <Paper
                        variant="outlined"
                        sx={{
                            p: 1.5,
                            bgcolor: 'background.default',
                            fontSize: '0.875rem',
                            maxHeight: 300,
                            overflowY: 'auto',
                            '& p': { mb: 1 } // Basic style for HTML content
                        }}
                    >
                        <div dangerouslySetInnerHTML={{ __html: value || '<span style="color: grey">Empty</span>' }} />
                    </Paper>
                </Box>
            );
        }

        let displayValue = value !== undefined && value !== null ? String(value) : <Typography component="span" color="text.disabled">-</Typography>;

        if (fieldDef.valueType === 'DateTime' && value) {
            displayValue = formatDate(value);
        }

        return (
            <Box key={fieldDef.fieldName} sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mr: 2, mb: 0.5 }}>
                <Typography variant="body2" color="text.secondary" fontWeight={600} noWrap sx={{ minWidth: 'fit-content' }}>
                    {fieldDef.displayName}:
                </Typography>
                <Typography variant="body2" color="text.primary">
                    {displayValue}
                </Typography>
            </Box>
        );
    };

    if (!workItem || !workItem.fields) {
        return <Paper sx={{ p: 3, color: 'text.secondary' }}>No Work Item data available.</Paper>;
    }

    return (
        <Paper variant="outlined" sx={{ mb: 2, p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                    <Chip label="CORE" color="secondary" size="small" />
                    <Typography variant="h6" fontSize="1rem" fontWeight={600}>DevOps Data</Typography>
                </Stack>

                {/* Field Selector Toggle */}
                <Button
                    onClick={() => setIsSelectorExpanded(!isSelectorExpanded)}
                    startIcon={<Columns size={14} />}
                    endIcon={!isControlled && (isSelectorExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                    size="small"
                    sx={{ textTransform: 'none', color: 'text.secondary', opacity: isControlled ? 0.5 : 1 }}
                    disabled={isControlled}
                    title={isControlled ? "Field visibility is controlled by parent" : "Select fields to display"}
                >
                    {isControlled ? 'Fixed View' : 'Select Fields'}
                </Button>
            </Box>

            {/* Field Selector Panel */}
            <Collapse in={isSelectorExpanded && !isControlled}>
                <Paper
                    variant="outlined"
                    sx={{ mb: 2, p: 2, bgcolor: 'background.default', display: 'flex', flexDirection: 'column', gap: 2 }}
                >
                    {FIELD_CATEGORIES.map(category => (
                        <Box key={category.category}>
                            <Typography variant="subtitle2" fontWeight="bold" color="primary.main" gutterBottom>
                                {category.category}
                            </Typography>
                            <Grid container spacing={1}>
                                {category.fields.map(field => (
                                    <Grid item xs={6} sm={4} md={3} lg={2} key={field.fieldName}>
                                        <FormControlLabel
                                            control={
                                                <Checkbox
                                                    checked={currentVisibleFields.includes(field.fieldName)}
                                                    onChange={() => handleToggle(field.fieldName)}
                                                    size="small"
                                                    sx={{ p: 0.5 }}
                                                />
                                            }
                                            label={
                                                <Typography variant="caption" noWrap title={field.fieldName}>
                                                    {field.displayName}
                                                </Typography>
                                            }
                                            sx={{ m: 0, width: '100%' }}
                                        />
                                    </Grid>
                                ))}
                            </Grid>
                        </Box>
                    ))}
                </Paper>
            </Collapse>

            {/* Categorized Fields Display */}
            <Stack spacing={2}>
                {FIELD_CATEGORIES.map(category => {
                    // Check if any fields in this category are visible
                    const hasVisibleFields = category.fields.some(f => currentVisibleFields.includes(f.fieldName));
                    if (!hasVisibleFields) return null;

                    return (
                        <Box key={category.category} sx={{ borderBottom: 1, borderColor: 'divider', pb: 1, '&:last-child': { borderBottom: 0 } }}>
                            <Typography variant="subtitle2" color="primary.main" fontWeight={600} gutterBottom>
                                {category.category}
                            </Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', rowGap: 0.5 }}>
                                {category.fields.map(field => renderField(field))}
                            </Box>
                        </Box>
                    );
                })}
            </Stack>
        </Paper>
    );
};

export default WorkItemFieldsPanel;
