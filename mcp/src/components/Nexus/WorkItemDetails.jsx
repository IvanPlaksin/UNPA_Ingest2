import React from 'react';
import { Clock, Layers, ChevronDown, Database, Play, Users } from 'lucide-react';
import {
    Box,
    Paper,
    Typography,
    Chip,
    Grid,
    Avatar,
    Stack,
    Divider,
    Accordion,
    AccordionSummary,
    AccordionDetails
} from '@mui/material';

const WorkItemDetails = ({ core, fields: rawFields, relations }) => {

    // --- Utils & Formatting ---
    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = String(date.getFullYear()).slice(-2);
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${day}/${month}/${year} ${hours}:${minutes}`;
        } catch (e) { return dateStr; }
    };

    const formatIdentity = (val) => {
        if (!val) return 'Unknown';
        if (typeof val === 'object' && val.displayName) return val.displayName;
        if (typeof val === 'string' && val.includes('[object')) return 'Unknown';
        return val; // Fallback string
    };

    const formatBoolean = (val) => val ? 'Yes' : 'No';

    // --- Classification Logic ---
    const GROUPS = {
        CONTEXT: {
            title: 'Knowledge Context & Connectivity',
            icon: <Layers size={16} />,
            keys: [
                'System.Parent', 'System.Tags', 'System.NodeName', 'System.IterationPath',
                'UnitedNations.Service', 'UnitedNations.Client', 'Common.Discipline',
                'CMMI.TaskType', 'CMMI.Blocked', 'System.TeamProject', 'System.Rev', 'System.CommentCount'
            ]
        },
        STATUS: {
            title: 'Status & Planning',
            icon: <Play size={16} />, // Visual placeholder
            keys: [
                'System.Reason', 'Common.Priority', 'Common.Triage', 'Microsoft.VSTS.Scheduling.OriginalEstimate',
                'Microsoft.VSTS.Scheduling.CompletedWork', 'Microsoft.VSTS.Common.ResolvedReason'
            ]
        },
        TIMELINE: {
            title: 'Timeline',
            icon: <Clock size={16} />,
            keys: [
                'System.CreatedDate', 'Microsoft.VSTS.Common.ActivatedDate', 'Microsoft.VSTS.Common.ResolvedDate',
                'Microsoft.VSTS.Common.ClosedDate', 'System.AuthorizedDate', 'Microsoft.VSTS.Common.StateChangeDate'
            ],
            formatter: formatDate
        },
        PEOPLE: {
            title: 'People (Social Graph)',
            icon: <Users size={16} />,
            keys: [
                'System.CreatedBy', 'System.ChangedBy', 'Microsoft.VSTS.Common.ActivatedBy',
                'Microsoft.VSTS.Common.ResolvedBy', 'Microsoft.VSTS.Common.ClosedBy', 'System.AssignedTo'
            ],
            formatter: formatIdentity
        },
        METADATA: {
            title: 'System Metadata',
            icon: <Database size={16} />,
            keys: [
                'System.AreaId', 'System.IterationId', 'System.PersonId', 'System.Watermark',
                'Microsoft.VSTS.CMMI.RequiresReview', 'Microsoft.VSTS.CMMI.RequiresTest',
                'UnitedNations.Areas', 'UnitedNations.AccountingTreatment', 'System.AreaPath'
            ]
        }
    };

    // --- Grouping Data ---
    const fieldGroups = {
        CONTEXT: {},
        STATUS: {},
        TIMELINE: {},
        PEOPLE: {},
        METADATA: {},
        OTHER: {} // Catch-all
    };

    const allDefinedKeys = new Set(Object.values(GROUPS).flatMap(g => g.keys));

    Object.entries(rawFields || {}).forEach(([key, value]) => {
        // Find group
        let found = false;
        for (const [groupKey, config] of Object.entries(GROUPS)) {
            if (config.keys.includes(key)) {
                fieldGroups[groupKey][key] = value;
                found = true;
                break;
            }
        }

        if (!found) {
            // Check manual ignored list from previous logic to avoid duplication in header
            const headerFields = ['System.Id', 'System.WorkItemType', 'System.Title', 'System.State', 'System.Description'];
            if (!headerFields.includes(key)) {
                fieldGroups.OTHER[key] = value;
            }
        }
    });

    // Helper to get value
    const getRenderValue = (groupKey, key, value) => {
        const config = GROUPS[groupKey];
        if (config?.formatter) return config.formatter(value);
        if (typeof value === 'boolean') return formatBoolean(value);

        // Specific field overrides
        if (key === 'System.Tags') return String(value || '').split(';').map(t => t.trim()).join(', ');

        return String(value);
    };


    // --- Relation Logic ---
    // Keep existing relation logic for "Actual Links" not just fields
    const hierarchyRelations = (relations || []).filter(r =>
        r.rel.includes('Hierarchy') || r.rel.includes('Related')
    );
    const artifactRelations = (relations || []).filter(r =>
        r.rel.includes('ArtifactLink') || r.rel.includes('Hyperlink') ||
        (!hierarchyRelations.includes(r))
    );


    // --- Styles ---
    const AccordionStyle = {
        boxShadow: 'none',
        '&:before': { display: 'none' },
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        mb: 1,
        bgcolor: 'background.paper'
    };

    const AccordionSummaryStyle = {
        minHeight: 40,
        px: 2,
        '& .MuiAccordionSummary-content': { my: 1 }
    };

    const renderRelation = (rel, idx) => (
        <Paper key={idx} variant="outlined" sx={{ p: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ overflow: 'hidden' }}>
                <Layers size={14} className="text-gray-400" />
                <Typography variant="caption" fontWeight="bold" sx={{ textTransform: 'uppercase' }}>
                    {rel.rel.split('.').pop().replace('Hierarchy-', '')}
                </Typography>
            </Stack>
            <a href={rel.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                <Typography variant="caption" color="primary" sx={{ '&:hover': { textDecoration: 'underline' } }}>
                    {rel.url.split('/').pop()}
                </Typography>
            </a>
        </Paper>
    );


    const getStatusColor = (state) => {
        const s = (state || '').toLowerCase();
        if (s === 'active' || s === 'committed') return 'success';
        if (s === 'resolved' || s === 'closed' || s === 'done') return 'default';
        if (s === 'new' || s === 'to do') return 'info';
        if (s === 'removed') return 'error';
        return 'default';
    };


    return (
        <Box sx={{ height: '100%', overflowY: 'auto', p: 1 }}>
            {/* HEADER: Always Visible High-Level Info */}
            <Paper elevation={0} sx={{ p: 2, mb: 1, bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}>
                <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                    <Chip label={`#${core.id}`} size="small" variant="outlined" sx={{ borderRadius: 1, fontFamily: 'monospace', fontWeight: 'bold' }} />
                    <Typography variant="caption" fontWeight="bold" color="text.secondary">{rawFields['System.WorkItemType']}</Typography>
                    <Chip
                        label={rawFields['System.State']}
                        color={getStatusColor(rawFields['System.State'])}
                        size="small"
                        sx={{ ml: 'auto', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '0.65rem' }}
                    />
                </Stack>
                <Typography variant="subtitle1" fontWeight="bold" lineHeight={1.2}>
                    {rawFields['System.Title']}
                </Typography>
            </Paper>

            {/* DESCRIPTION (If present, separate block) */}
            {rawFields['System.Description'] && (
                <Accordion defaultExpanded sx={AccordionStyle}>
                    <AccordionSummary expandIcon={<ChevronDown size={16} />} sx={AccordionSummaryStyle}>
                        <Typography variant="subtitle2" fontWeight="bold">DESCRIPTION</Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ pt: 0 }}>
                        <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default', '& .prose': { fontSize: '0.875rem' } }}>
                            <div
                                className="prose prose-sm max-w-none text-gray-700 dark:text-gray-300"
                                dangerouslySetInnerHTML={{ __html: rawFields['System.Description'] }}
                            />
                        </Paper>
                    </AccordionDetails>
                </Accordion>
            )}

            {/* 5 SEMANTIC GROUPS */}
            {Object.entries(GROUPS).map(([groupKey, config]) => {
                const groupData = fieldGroups[groupKey];
                if (Object.keys(groupData).length === 0) return null;

                return (
                    <Accordion key={groupKey} defaultExpanded sx={AccordionStyle}>
                        <AccordionSummary expandIcon={<ChevronDown size={16} />} sx={AccordionSummaryStyle}>
                            <Stack direction="row" alignItems="center" spacing={1}>
                                {config.icon}
                                <Typography variant="subtitle2" fontWeight="bold">{config.title.toUpperCase()}</Typography>
                            </Stack>
                        </AccordionSummary>
                        <AccordionDetails sx={{ pt: 0 }}>
                            <Stack spacing={0.5}>
                                {Object.entries(groupData).map(([k, v]) => (
                                    <Box key={k} sx={{ py: 0.5, display: 'flex', justifyContent: 'space-between', borderBottom: 1, borderColor: 'divider' }}>
                                        <Typography variant="caption" color="text.secondary" noWrap sx={{ width: '45%' }}>
                                            {k.split('.').pop()} {/* Simplified Label */}
                                        </Typography>
                                        <Typography variant="caption" fontWeight="medium" sx={{ width: '50%', textAlign: 'right', wordBreak: 'break-word' }} title={String(v)}>
                                            {getRenderValue(groupKey, k, v)}
                                        </Typography>
                                    </Box>
                                ))}
                            </Stack>
                        </AccordionDetails>
                    </Accordion>
                );
            })}

            {/* OTHER FIELDS (Catch-all) */}
            {Object.keys(fieldGroups.OTHER).length > 0 && (
                <Accordion sx={AccordionStyle}>
                    <AccordionSummary expandIcon={<ChevronDown size={16} />} sx={AccordionSummaryStyle}>
                        <Typography variant="subtitle2" fontWeight="bold">OTHER FIELDS</Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ pt: 0 }}>
                        <Stack spacing={0.5}>
                            {Object.entries(fieldGroups.OTHER).map(([k, v]) => (
                                <Box key={k} sx={{ py: 0.5, display: 'flex', justifyContent: 'space-between', borderBottom: 1, borderColor: 'divider' }}>
                                    <Typography variant="caption" color="text.secondary" noWrap sx={{ width: '45%' }}>{k}</Typography>
                                    <Typography variant="caption" fontWeight="medium" sx={{ width: '50%', textAlign: 'right' }}>{String(v)}</Typography>
                                </Box>
                            ))}
                        </Stack>
                    </AccordionDetails>
                </Accordion>
            )}

            {/* LINKS: RELATIONS & ARTIFACTS */}
            <Accordion sx={AccordionStyle}>
                <AccordionSummary expandIcon={<ChevronDown size={16} />} sx={AccordionSummaryStyle}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <Layers size={16} />
                        <Typography variant="subtitle2" fontWeight="bold">LINKED ITEMS ({hierarchyRelations.length + artifactRelations.length})</Typography>
                    </Stack>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                    <Stack spacing={1}>
                        {hierarchyRelations.map(renderRelation)}
                        {artifactRelations.map(renderRelation)}
                        {(relations || []).length === 0 && <Typography variant="caption" color="text.disabled">No links.</Typography>}
                    </Stack>
                </AccordionDetails>
            </Accordion>

        </Box>
    );
};

export default WorkItemDetails;
