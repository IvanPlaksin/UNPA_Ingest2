import React from 'react';
import { Box, Typography, Checkbox, List, ListItem, ListItemIcon, ListItemText, Chip, TextField, MenuItem, Stack, Paper } from '@mui/material';

const NAMESPACES = ['CORE', 'PROJECT', 'FLOWDESK', 'META'];
const TYPE_ICONS = { entity: '🏢', business_rule: '📏', workflow: '🔄', calculation: '🧮', concept: '💡', policy: '📋', anomaly: '⚠️', requirement: '📌', schema: '📊', relationship: '🔗' };

export default function DraftSelectionStep({ drafts, selected, targetNamespace, onSelectionChange, onNamespaceChange }) {
  const allSelected = drafts.length > 0 && selected.length === drafts.length;

  const toggleAll = () => onSelectionChange(allSelected ? [] : [...drafts]);
  const toggle = (draft) => {
    const exists = selected.find(d => d.id === draft.id);
    onSelectionChange(exists ? selected.filter(d => d.id !== draft.id) : [...selected, draft]);
  };

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <TextField select size="small" label="Target Namespace" value={targetNamespace} onChange={e => onNamespaceChange(e.target.value)} sx={{ minWidth: 180 }}>
          {NAMESPACES.map(ns => <MenuItem key={ns} value={ns}>{ns}</MenuItem>)}
        </TextField>
        <Paper sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center' }}>
          <Typography variant="body2">{selected.length} / {drafts.length} selected</Typography>
        </Paper>
      </Stack>

      <List dense sx={{ border: 1, borderColor: 'divider', borderRadius: 1, maxHeight: 400, overflow: 'auto' }}>
        <ListItem sx={{ bgcolor: 'action.hover' }}>
          <ListItemIcon sx={{ minWidth: 40 }}><Checkbox checked={allSelected} indeterminate={selected.length > 0 && !allSelected} onChange={toggleAll} size="small" /></ListItemIcon>
          <ListItemText primary={<Typography variant="subtitle2">Select All</Typography>} />
        </ListItem>
        {drafts.map(draft => (
          <ListItem key={draft.id} sx={{ borderTop: 1, borderColor: 'divider' }}>
            <ListItemIcon sx={{ minWidth: 40 }}><Checkbox checked={!!selected.find(d => d.id === draft.id)} onChange={() => toggle(draft)} size="small" /></ListItemIcon>
            <ListItemText
              primary={<Stack direction="row" spacing={1} alignItems="center"><span>{TYPE_ICONS[draft.type] || '📄'}</span><Typography variant="body2">{draft.name}</Typography></Stack>}
              secondary={<Stack direction="row" spacing={0.5}><Chip label={draft.type} size="small" sx={{ height: 18, fontSize: '0.65rem' }} /><Chip label={draft.status} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} /></Stack>}
            />
          </ListItem>
        ))}
        {drafts.length === 0 && <ListItem><ListItemText primary={<Typography color="text.secondary">No drafts ready for promotion</Typography>} /></ListItem>}
      </List>
    </Box>
  );
}
