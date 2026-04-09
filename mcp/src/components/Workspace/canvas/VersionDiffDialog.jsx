/**
 * VersionDiffDialog (WS3-001)
 *
 * Compare two graph versions side by side.
 * Backed by GET /workspaces/:id/versions/diff?v1=...&v2=...
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Stack, Typography,
  FormControl, InputLabel, Select, MenuItem, Button, Chip, Divider,
  List, ListItem, ListItemText, CircularProgress, Alert, Accordion,
  AccordionSummary, AccordionDetails
} from '@mui/material';
import {
  ExpandMore as ExpandIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  Edit as EditIcon
} from '@mui/icons-material';
import { diffGraphVersions } from '../../../services/workspace.service';

const SectionHeader = ({ title, count, color, icon: Icon }) => (
  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
    <Icon fontSize="small" sx={{ color }} />
    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{title}</Typography>
    <Chip label={count} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
  </Stack>
);

const NodeRow = ({ node, color }) => (
  <ListItem dense sx={{ py: 0.25, borderLeft: 3, borderColor: color, pl: 1 }}>
    <ListItemText
      primary={node.name || node.id}
      secondary={node.type}
      primaryTypographyProps={{ fontSize: '0.75rem', fontWeight: 500 }}
      secondaryTypographyProps={{ fontSize: '0.65rem' }}
    />
  </ListItem>
);

const EdgeRow = ({ edge, color }) => (
  <ListItem dense sx={{ py: 0.25, borderLeft: 3, borderColor: color, pl: 1 }}>
    <ListItemText
      primary={`${edge.source?.slice(0, 8)} → ${edge.target?.slice(0, 8)}`}
      secondary={edge.type}
      primaryTypographyProps={{ fontSize: '0.7rem', fontFamily: 'monospace' }}
      secondaryTypographyProps={{ fontSize: '0.65rem' }}
    />
  </ListItem>
);

const ModifiedNodeRow = ({ mod }) => (
  <Accordion sx={{ boxShadow: 'none', borderLeft: 3, borderColor: 'warning.main', pl: 0, '&:before': { display: 'none' } }}>
    <AccordionSummary expandIcon={<ExpandIcon fontSize="small" />} sx={{ minHeight: 32, '& .MuiAccordionSummary-content': { my: 0.25 } }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1 }}>
        <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 500 }}>
          {mod.before?.name || mod.id}
        </Typography>
        <Stack direction="row" spacing={0.5}>
          {mod.changedFields.map(f => (
            <Chip key={f} label={f} size="small" sx={{ height: 16, fontSize: '0.6rem' }} />
          ))}
        </Stack>
      </Stack>
    </AccordionSummary>
    <AccordionDetails sx={{ py: 0.5 }}>
      {mod.changedFields.map(field => (
        <Box key={field} sx={{ mb: 0.5, fontSize: '0.7rem', fontFamily: 'monospace' }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.65rem' }}>
            {field}:
          </Typography>
          <Box sx={{ pl: 1 }}>
            <Typography variant="caption" sx={{ display: 'block', color: 'error.main', fontSize: '0.7rem' }}>
              − {JSON.stringify(mod.before?.[field])}
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', color: 'success.main', fontSize: '0.7rem' }}>
              + {JSON.stringify(mod.after?.[field])}
            </Typography>
          </Box>
        </Box>
      ))}
    </AccordionDetails>
  </Accordion>
);

const VersionDiffDialog = ({ open, onClose, workspaceId, versions = [] }) => {
  const [v1Id, setV1Id] = useState('');
  const [v2Id, setV2Id] = useState('');
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Initialize defaults: oldest vs newest
  useEffect(() => {
    if (open && versions.length >= 2) {
      const sorted = [...versions].sort((a, b) => a.versionNumber - b.versionNumber);
      setV1Id(sorted[sorted.length - 2].id); // previous
      setV2Id(sorted[sorted.length - 1].id); // latest
      setDiff(null);
      setError(null);
    }
  }, [open, versions]);

  const handleCompare = useCallback(async () => {
    if (!v1Id || !v2Id) return;
    if (v1Id === v2Id) {
      setError('Pick two different versions to compare.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const resp = await diffGraphVersions(workspaceId, v1Id, v2Id);
      setDiff(resp?.data || null);
    } catch (err) {
      setError(err.message || 'Diff failed');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, v1Id, v2Id]);

  // Auto-compute on open if both selected
  useEffect(() => {
    if (open && v1Id && v2Id) handleCompare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, v1Id, v2Id]);

  const versionLabel = (v) => `v${v.versionNumber} — ${v.note?.slice(0, 30) || '(no note)'}`;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Compare Graph Versions</DialogTitle>
      <DialogContent dividers>
        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <FormControl size="small" sx={{ flex: 1 }}>
            <InputLabel>From (older)</InputLabel>
            <Select value={v1Id} label="From (older)" onChange={(e) => setV1Id(e.target.value)}>
              {versions.map(v => (
                <MenuItem key={v.id} value={v.id}>{versionLabel(v)}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ flex: 1 }}>
            <InputLabel>To (newer)</InputLabel>
            <Select value={v2Id} label="To (newer)" onChange={(e) => setV2Id(e.target.value)}>
              {versions.map(v => (
                <MenuItem key={v.id} value={v.id}>{versionLabel(v)}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        )}

        {!loading && diff && (
          <>
            {/* Summary */}
            <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
              <Chip
                size="small"
                icon={<AddIcon />}
                label={`${diff.summary.addedNodes} nodes added`}
                color="success"
                variant="outlined"
              />
              <Chip
                size="small"
                icon={<RemoveIcon />}
                label={`${diff.summary.removedNodes} nodes removed`}
                color="error"
                variant="outlined"
              />
              <Chip
                size="small"
                icon={<EditIcon />}
                label={`${diff.summary.modifiedNodes} nodes modified`}
                color="warning"
                variant="outlined"
              />
              <Chip
                size="small"
                label={`${diff.summary.addedEdges} edges added / ${diff.summary.removedEdges} removed`}
                variant="outlined"
              />
            </Stack>

            <Divider sx={{ mb: 2 }} />

            {/* Added nodes */}
            {diff.added.nodes.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <SectionHeader title="Added nodes" count={diff.added.nodes.length} color="success.main" icon={AddIcon} />
                <List dense disablePadding>
                  {diff.added.nodes.map(n => (
                    <NodeRow key={n.id} node={n} color="success.main" />
                  ))}
                </List>
              </Box>
            )}

            {/* Removed nodes */}
            {diff.removed.nodes.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <SectionHeader title="Removed nodes" count={diff.removed.nodes.length} color="error.main" icon={RemoveIcon} />
                <List dense disablePadding>
                  {diff.removed.nodes.map(n => (
                    <NodeRow key={n.id} node={n} color="error.main" />
                  ))}
                </List>
              </Box>
            )}

            {/* Modified nodes */}
            {diff.modified.nodes.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <SectionHeader title="Modified nodes" count={diff.modified.nodes.length} color="warning.main" icon={EditIcon} />
                {diff.modified.nodes.map(m => (
                  <ModifiedNodeRow key={m.id} mod={m} />
                ))}
              </Box>
            )}

            {/* Added edges */}
            {diff.added.edges.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <SectionHeader title="Added edges" count={diff.added.edges.length} color="success.main" icon={AddIcon} />
                <List dense disablePadding>
                  {diff.added.edges.map((e, i) => (
                    <EdgeRow key={`add-${i}`} edge={e} color="success.main" />
                  ))}
                </List>
              </Box>
            )}

            {/* Removed edges */}
            {diff.removed.edges.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <SectionHeader title="Removed edges" count={diff.removed.edges.length} color="error.main" icon={RemoveIcon} />
                <List dense disablePadding>
                  {diff.removed.edges.map((e, i) => (
                    <EdgeRow key={`rem-${i}`} edge={e} color="error.main" />
                  ))}
                </List>
              </Box>
            )}

            {diff.summary.addedNodes + diff.summary.removedNodes + diff.summary.modifiedNodes +
             diff.summary.addedEdges + diff.summary.removedEdges === 0 && (
              <Alert severity="info">Versions are identical.</Alert>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCompare} disabled={loading || !v1Id || !v2Id}>Re-compute</Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default VersionDiffDialog;
