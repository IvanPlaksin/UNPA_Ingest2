/**
 * CatalogTreeSelector — tree picker for GXE catalog graphs (Graph Transfer,
 * CATALOG_GRAPHS mode). Loads /catalog-tree lazily: root CatalogEntries →
 * expand to GraphDefinitions. Selection is at GraphDefinition (graphId) level;
 * an entry checkbox selects/deselects all its graphs (tri-state). Root level is
 * paginated; each entry's children paginate via "Load more".
 */

import { useState, useEffect, useCallback } from 'react';
import {
    Paper, Box, Typography, TextField, List, ListItem, ListItemButton, ListItemText,
    Checkbox, IconButton, Button, CircularProgress, Chip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';

import { getCatalogTree } from '../../services/graphTransfer.service';

function CatalogEntryItem({ entry, expanded, onToggleExpand, children, selectedGraphIds, onToggleGraph, onToggleEntry, onLoadMore, disabled }) {
    const childGraphs = (children?.items || []).filter((i) => i.type === 'definition');
    const nestedEntries = (children?.items || []).filter((i) => i.type === 'entry');
    const selectedCount = childGraphs.filter((g) => selectedGraphIds.includes(g.id)).length;
    const allSelected = childGraphs.length > 0 && selectedCount === childGraphs.length;
    const someSelected = selectedCount > 0 && selectedCount < childGraphs.length;

    return (
        <>
            <ListItem disablePadding secondaryAction={<Chip size="small" variant="outlined" label={`${entry.childrenCount}`} />}>
                <Checkbox edge="start" size="small" checked={allSelected} indeterminate={someSelected}
                    disabled={disabled || !children || childGraphs.length === 0}
                    onClick={(e) => { e.stopPropagation(); onToggleEntry(childGraphs.map((g) => g.id), allSelected); }} />
                <ListItemButton dense onClick={onToggleExpand}>
                    {expanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                    <ListItemText primary={entry.name} secondary={`${entry.childrenCount} item(s)`} />
                </ListItemButton>
            </ListItem>

            {expanded && (
                <List dense sx={{ pl: 5 }}>
                    {!children && <ListItem><CircularProgress size={16} /></ListItem>}
                    {childGraphs.map((g) => (
                        <ListItem key={g.id} disablePadding>
                            <ListItemButton dense onClick={() => onToggleGraph(g.id)} disabled={disabled}>
                                <Checkbox edge="start" size="small" checked={selectedGraphIds.includes(g.id)} disabled={disabled} />
                                <ListItemText primary={g.name} secondary={g.namespace} />
                            </ListItemButton>
                        </ListItem>
                    ))}
                    {nestedEntries.map((n) => (
                        <ListItem key={n.id}>
                            <ListItemText primary={`📁 ${n.name}`} secondary={`${n.childrenCount} item(s) — nested`}
                                primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }} />
                        </ListItem>
                    ))}
                    {children?.pagination?.hasMore && (
                        <ListItem><Button size="small" onClick={onLoadMore}>Load more…</Button></ListItem>
                    )}
                </List>
            )}
        </>
    );
}

export default function CatalogTreeSelector({ selectedGraphIds = [], onChange, disabled }) {
    const [treeData, setTreeData] = useState({ items: [], pagination: null });
    const [childrenData, setChildrenData] = useState({}); // entryId -> { items, pagination, loadedPages }
    const [expanded, setExpanded] = useState(new Set());
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);

    const loadEntries = useCallback(async (p, s) => {
        setLoading(true);
        try {
            const r = await getCatalogTree({ page: p, pageSize: 20, search: s || undefined, includeVectorInfo: false });
            setTreeData({ items: r.items || [], pagination: r.pagination });
        } catch { setTreeData({ items: [], pagination: null }); }
        setLoading(false);
    }, []);

    // Debounced (re)load on page/search change.
    useEffect(() => {
        const t = setTimeout(() => loadEntries(page, search), search ? 300 : 0);
        return () => clearTimeout(t);
    }, [page, search, loadEntries]);

    const loadChildren = async (entryId, nextPage = 1) => {
        const r = await getCatalogTree({ parentId: entryId, parentType: 'entry', page: nextPage, pageSize: 50, includeVectorInfo: false });
        setChildrenData((prev) => {
            const existing = prev[entryId];
            const items = nextPage > 1 && existing ? [...existing.items, ...(r.items || [])] : (r.items || []);
            return { ...prev, [entryId]: { items, pagination: r.pagination } };
        });
    };

    const toggleExpand = async (entryId) => {
        setExpanded((prev) => {
            const n = new Set(prev);
            if (n.has(entryId)) n.delete(entryId); else n.add(entryId);
            return n;
        });
        if (!childrenData[entryId]) await loadChildren(entryId, 1);
    };

    const toggleGraph = (graphId) => {
        onChange(selectedGraphIds.includes(graphId)
            ? selectedGraphIds.filter((id) => id !== graphId)
            : [...selectedGraphIds, graphId]);
    };

    const toggleEntry = (entryGraphIds, allSelected) => {
        if (allSelected) onChange(selectedGraphIds.filter((id) => !entryGraphIds.includes(id)));
        else onChange([...new Set([...selectedGraphIds, ...entryGraphIds])]);
    };

    const selectAllOnPage = () => {
        const ids = [];
        for (const entry of treeData.items) {
            for (const child of childrenData[entry.id]?.items || []) {
                if (child.type === 'definition') ids.push(child.id);
            }
        }
        onChange([...new Set([...selectedGraphIds, ...ids])]);
    };

    return (
        <Paper variant="outlined" sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle1">Catalog graphs</Typography>
                <TextField size="small" placeholder="Search…" value={search} disabled={disabled}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 0.5 }} /> }} sx={{ width: 220 }} />
            </Box>

            {loading ? <CircularProgress size={22} /> : (
                <List dense sx={{ maxHeight: 360, overflow: 'auto' }}>
                    {treeData.items.length === 0 && <ListItem><ListItemText secondary="No catalog entries." /></ListItem>}
                    {treeData.items.map((entry) => (
                        <CatalogEntryItem key={entry.id} entry={entry}
                            expanded={expanded.has(entry.id)} onToggleExpand={() => toggleExpand(entry.id)}
                            children={childrenData[entry.id]} selectedGraphIds={selectedGraphIds}
                            onToggleGraph={toggleGraph} onToggleEntry={toggleEntry}
                            onLoadMore={() => loadChildren(entry.id, (childrenData[entry.id]?.pagination?.page || 1) + 1)}
                            disabled={disabled} />
                    ))}
                </List>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                <Typography variant="caption">
                    Page {treeData.pagination?.page || 1} of {treeData.pagination?.totalPages || 1}
                </Typography>
                <Box>
                    <IconButton size="small" disabled={disabled || page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeftIcon /></IconButton>
                    <IconButton size="small" disabled={disabled || !treeData.pagination?.hasMore} onClick={() => setPage((p) => p + 1)}><ChevronRightIcon /></IconButton>
                </Box>
                <Typography variant="caption" color="primary">Selected: {selectedGraphIds.length} graph(s)</Typography>
            </Box>

            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Button size="small" onClick={selectAllOnPage} disabled={disabled}>Select all (expanded on page)</Button>
                <Button size="small" color="inherit" onClick={() => onChange([])} disabled={disabled || selectedGraphIds.length === 0}>Clear selection</Button>
            </Box>
        </Paper>
    );
}

export { CatalogTreeSelector };
