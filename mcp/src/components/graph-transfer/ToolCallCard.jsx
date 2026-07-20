/**
 * ToolCallCard — renders one Export-Assistant tool invocation (name + input chips,
 * status icon, expandable input/result JSON). Keeps the agent's actions transparent.
 */

import { useState } from 'react';
import { Card, CardContent, Box, Typography, Chip, Collapse, IconButton, CircularProgress } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';

const TOOL_ICONS = { list_domains: '📋', get_domain_details: '🔍', preview_selection: '👁️', start_export: '📦', search_labels: '🏷️', get_vector_collections: '📊' };
const TOOL_LABELS = { list_domains: 'List domains', get_domain_details: 'Domain details', preview_selection: 'Preview selection', start_export: 'Start export', search_labels: 'Search labels', get_vector_collections: 'Vector collections' };

const preBox = { fontSize: '0.72rem', overflow: 'auto', maxHeight: 180, m: 0, p: 0.75, bgcolor: 'grey.900', color: 'grey.100', borderRadius: 0.5 };

export default function ToolCallCard({ tool, input, result, error, loading }) {
    const [expanded, setExpanded] = useState(false);
    const icon = TOOL_ICONS[tool] || '🔧';
    const label = TOOL_LABELS[tool] || tool;

    return (
        <Card variant="outlined" sx={{ my: 0.5, bgcolor: 'action.hover', borderColor: error ? 'error.main' : loading ? 'warning.main' : 'success.main' }}>
            <CardContent sx={{ py: 0.75, px: 1.5, '&:last-child': { pb: 0.75 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography>{icon}</Typography>
                    <Typography variant="body2" fontWeight={500} sx={{ flex: 1 }}>{label}</Typography>
                    {loading && <CircularProgress size={14} />}
                    {result && !error && <CheckCircleIcon color="success" fontSize="small" />}
                    {error && <ErrorIcon color="error" fontSize="small" />}
                    <IconButton size="small" onClick={() => setExpanded((v) => !v)} sx={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                        <ExpandMoreIcon fontSize="small" />
                    </IconButton>
                </Box>

                {input && Object.keys(input).length > 0 && (
                    <Box sx={{ mt: 0.5 }}>
                        {Object.entries(input).slice(0, 4).map(([k, v]) => (
                            <Chip key={k} label={`${k}: ${JSON.stringify(v).slice(0, 28)}`} size="small" variant="outlined" sx={{ mr: 0.5, mb: 0.5, height: 20, '& .MuiChip-label': { fontSize: '0.68rem' } }} />
                        ))}
                    </Box>
                )}

                <Collapse in={expanded}>
                    <Box sx={{ mt: 1 }}>
                        {input && (<><Typography variant="caption" color="text.secondary">Input</Typography><Box component="pre" sx={preBox}>{JSON.stringify(input, null, 2)}</Box></>)}
                        {result != null && (<><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Result</Typography><Box component="pre" sx={preBox}>{typeof result === 'string' ? result : JSON.stringify(result, null, 2)}</Box></>)}
                        {error && <Typography variant="body2" color="error" sx={{ mt: 1 }}>Error: {error}</Typography>}
                    </Box>
                </Collapse>
            </CardContent>
        </Card>
    );
}
