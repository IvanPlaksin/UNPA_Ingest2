/**
 * DomainCard — one data-domain tile in the Graph Transfer domain map. Fixed size
 * (all domains equally visible); scale shown via a % badge + mini bar, not by
 * card size. Checkbox selects the domain; expand reveals its label breakdown.
 */

import { useState } from 'react';
import {
    Card, CardContent, Box, Typography, Checkbox, Chip, LinearProgress,
    Collapse, IconButton, Tooltip,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import StorageIcon from '@mui/icons-material/Storage';

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString() : (n ?? '0'));

export default function DomainCard({ domain, selected, onToggle, onExpand, disabled }) {
    const [expanded, setExpanded] = useState(false);

    const toggleExpand = (e) => {
        e.stopPropagation();
        const next = !expanded;
        setExpanded(next);
        if (next && onExpand) onExpand(domain.id);
    };

    const labelEntries = Object.entries(domain.labelBreakdown || {}).sort((a, b) => b[1] - a[1]);

    return (
        <Card variant="outlined" sx={{
            borderColor: selected ? 'primary.main' : 'divider',
            borderWidth: selected ? 2 : 1,
            bgcolor: selected ? 'action.selected' : 'background.paper',
            transition: 'all 0.15s',
            '&:hover': { borderColor: 'primary.light', boxShadow: 1 },
        }}>
            <CardContent sx={{ p: 2, cursor: disabled ? 'default' : 'pointer' }} onClick={() => !disabled && onToggle(domain.id)}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <Typography variant="h5" sx={{ lineHeight: 1 }}>{domain.icon}</Typography>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle2" noWrap>{domain.name}</Typography>
                        <Tooltip title={domain.description || ''}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {domain.description}
                            </Typography>
                        </Tooltip>
                    </Box>
                    <Checkbox checked={selected} disabled={disabled} size="small" sx={{ p: 0.5, mt: -0.5 }}
                        onClick={(e) => { e.stopPropagation(); onToggle(domain.id); }} />
                </Box>

                <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h6" fontWeight={600}>{fmt(domain.nodeCount)}</Typography>
                    <Chip label={`${domain.percentage}%`} size="small" variant="outlined"
                        color={domain.percentage > 10 ? 'primary' : 'default'} />
                    {domain.useCatalogTree && <Chip label="tree" size="small" variant="outlined" sx={{ height: 20 }} />}
                </Box>

                <LinearProgress variant="determinate" value={Math.min(domain.percentage || 0, 100)}
                    sx={{ mt: 1, height: 5, borderRadius: 2, bgcolor: 'action.hover',
                        '& .MuiLinearProgress-bar': { bgcolor: domain.color || 'primary.main' } }} />

                <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    {domain.vectorCollections?.length > 0 ? (
                        <Tooltip title={`Linked vectors: ${domain.vectorCollections.join(', ')}`}>
                            <Chip icon={<StorageIcon />} label={`${domain.vectorCollections.length} vector${domain.vectorCollections.length > 1 ? 's' : ''}`}
                                size="small" variant="outlined" sx={{ height: 20, '& .MuiChip-label': { px: 0.5, fontSize: '0.7rem' } }} />
                        </Tooltip>
                    ) : <Box />}
                    <IconButton size="small" onClick={toggleExpand}
                        sx={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                        <ExpandMoreIcon fontSize="small" />
                    </IconButton>
                </Box>
            </CardContent>

            <Collapse in={expanded}>
                <Box sx={{ px: 2, pb: 2 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={500}>Labels ({labelEntries.length})</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                        {labelEntries.slice(0, 10).map(([label, count]) => (
                            <Chip key={label} label={`${label}: ${fmt(count)}`} size="small" variant="outlined"
                                sx={{ height: 20, '& .MuiChip-label': { fontSize: '0.65rem' } }} />
                        ))}
                        {labelEntries.length > 10 && <Chip label={`+${labelEntries.length - 10} more`} size="small" sx={{ height: 20 }} />}
                    </Box>
                    {domain.namespaceDistribution?.length > 0 && (
                        <>
                            <Typography variant="caption" color="text.secondary" fontWeight={500} sx={{ display: 'block', mt: 1 }}>Namespaces</Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                                {domain.namespaceDistribution.slice(0, 6).map((n) => (
                                    <Chip key={n.namespace} label={`${n.namespace}: ${fmt(n.count)}`} size="small"
                                        sx={{ height: 20, '& .MuiChip-label': { fontSize: '0.65rem' } }} />
                                ))}
                            </Box>
                        </>
                    )}
                </Box>
            </Collapse>
        </Card>
    );
}
