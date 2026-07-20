/**
 * DomainMap — the map-first entry point of Graph Transfer: a grid of data-domain
 * cards (from GET /domains) the user picks from, with a live selection summary and
 * a "Preview selection" action. Selecting domains → onSelectionChange(domainIds).
 */

import { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Paper, Button, CircularProgress, Alert, Chip, Divider, Stack,
} from '@mui/material';
import SelectAllIcon from '@mui/icons-material/SelectAll';
import ClearIcon from '@mui/icons-material/Clear';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DomainCard from './DomainCard';
import { getDomains, getDomainDetails } from '../../services/graphTransfer.service';

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString() : (n ?? '0'));

export default function DomainMap({ selectedDomains = [], onSelectionChange, onPreview, disabled }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try { setData(await getDomains()); }
        catch (e) { setError(e.response?.data?.error || e.message); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const toggleDomain = (id) => {
        onSelectionChange(selectedDomains.includes(id) ? selectedDomains.filter((x) => x !== id) : [...selectedDomains, id]);
    };
    const selectAll = () => onSelectionChange((data?.domains || []).map((d) => d.id));
    const clear = () => onSelectionChange([]);

    // Lazy drill-down enrichment on expand (adds distinct count, namespaces).
    const enrich = async (id) => {
        try {
            const details = await getDomainDetails(id);
            setData((prev) => prev && ({ ...prev, domains: prev.domains.map((d) => (d.id === id ? { ...d, ...details } : d)) }));
        } catch { /* non-fatal */ }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;
    if (error) return <Alert severity="error" action={<Button size="small" onClick={load}>Retry</Button>}>Failed to load domains: {error}</Alert>;

    const selected = (data?.domains || []).filter((d) => selectedDomains.includes(d.id));
    const selectedNodes = selected.reduce((s, d) => s + (d.nodeCount || 0), 0);
    const selectedVectors = new Set(selected.flatMap((d) => d.vectorCollections || []));

    return (
        <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                <Box>
                    <Typography variant="h6">Knowledge domains</Typography>
                    <Typography variant="caption" color="text.secondary">
                        {fmt(data.totalNodes)} nodes across {data.totalDomains} domains — pick what to export
                    </Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                    <Button size="small" startIcon={<SelectAllIcon />} onClick={selectAll} disabled={disabled}>Select all</Button>
                    <Button size="small" startIcon={<ClearIcon />} onClick={clear} disabled={disabled || selectedDomains.length === 0}>Clear</Button>
                </Stack>
            </Stack>

            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 2, mb: 2 }}>
                {(data.domains || []).map((domain) => (
                    <DomainCard key={domain.id} domain={domain} selected={selectedDomains.includes(domain.id)}
                        onToggle={toggleDomain} onExpand={enrich} disabled={disabled} />
                ))}
            </Box>

            {data.uncategorizedCount > 0 && (
                <Alert severity="info" sx={{ mb: 2 }}>
                    {fmt(data.uncategorizedCount)} nodes across {data.uncategorizedLabels.length} label(s) aren’t categorized into a domain
                    (use Advanced mode to export them by label/namespace/Cypher).
                </Alert>
            )}

            <Divider sx={{ my: 2 }} />

            <Paper variant="outlined" sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: selectedDomains.length ? 'action.selected' : 'transparent' }}>
                <Box>
                    <Typography variant="subtitle2">
                        {selectedDomains.length ? `Selected: ${selectedDomains.length} domain(s)` : 'No domains selected'}
                    </Typography>
                    {selectedDomains.length > 0 && (
                        <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                            <Chip size="small" color="primary" label={`~${fmt(selectedNodes)} nodes`} />
                            {selectedVectors.size > 0 && <Chip size="small" color="secondary" variant="outlined" label={`${selectedVectors.size} vector collection(s)`} />}
                        </Stack>
                    )}
                </Box>
                <Button variant="contained" startIcon={<VisibilityIcon />} onClick={() => onPreview(selectedDomains)} disabled={disabled || selectedDomains.length === 0}>
                    Preview selection
                </Button>
            </Paper>
        </Box>
    );
}
