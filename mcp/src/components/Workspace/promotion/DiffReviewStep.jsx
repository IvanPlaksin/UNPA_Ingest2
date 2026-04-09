import React, { useState } from 'react';
import { Box, Typography, Paper, Checkbox, Chip, IconButton, Collapse, List, ListItem, ListItemIcon, ListItemText, Divider, Tooltip } from '@mui/material';
import { Plus, RefreshCw, ArrowUpRight, AlertTriangle, SkipForward, ChevronDown, ChevronRight, Eye } from 'lucide-react';

const ACTION_CFG = {
  NEW: { icon: Plus, color: 'success', label: 'New', desc: 'Will create new KB entity' },
  ENRICH: { icon: RefreshCw, color: 'info', label: 'Enrich', desc: 'Will add to existing' },
  SUPERSEDE: { icon: ArrowUpRight, color: 'warning', label: 'Supersede', desc: 'New version' },
  CONFLICT: { icon: AlertTriangle, color: 'error', label: 'Conflict', desc: 'Needs resolution' },
  SKIP: { icon: SkipForward, color: 'default', label: 'Skip', desc: 'Will not promote' }
};

export default function DiffReviewStep({ diffResult, onItemToggle }) {
  const [expanded, setExpanded] = useState(['NEW', 'CONFLICT']);
  const [expandedItems, setExpandedItems] = useState({});
  const [selected, setSelected] = useState(new Set(diffResult?.items?.filter(i => i.action !== 'SKIP').map(i => i.draftId) || []));

  if (!diffResult) return <Typography color="text.secondary">No diff data</Typography>;
  const { grouped, summary } = diffResult;
  const actions = ['NEW', 'ENRICH', 'SUPERSEDE', 'CONFLICT', 'SKIP'];

  const toggleGroup = a => setExpanded(p => p.includes(a) ? p.filter(x => x !== a) : [...p, a]);
  const toggleItem = id => setExpandedItems(p => ({ ...p, [id]: !p[id] }));
  const toggleSelect = item => {
    const s = new Set(selected);
    if (s.has(item.draftId)) { s.delete(item.draftId); onItemToggle?.(item.draftId, false); }
    else { s.add(item.draftId); onItemToggle?.(item.draftId, true); }
    setSelected(s);
  };

  return (
    <Box>
      <Paper sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
        <Typography variant="subtitle2" gutterBottom>Summary</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {actions.map(a => { const c = (grouped[a] || []).length; if (!c) return null; const cfg = ACTION_CFG[a]; const I = cfg.icon; return <Chip key={a} icon={<I size={14} />} label={`${cfg.label}: ${c}`} size="small" color={cfg.color} variant="outlined" />; })}
        </Box>
      </Paper>

      {actions.map(a => {
        const items = grouped[a] || [];
        if (!items.length) return null;
        const cfg = ACTION_CFG[a]; const I = cfg.icon; const isExp = expanded.includes(a);
        return (
          <Paper key={a} sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', p: 1.5, cursor: 'pointer', bgcolor: `${cfg.color}.50`, borderBottom: isExp ? 1 : 0, borderColor: 'divider' }} onClick={() => toggleGroup(a)}>
              <IconButton size="small" sx={{ mr: 1 }}>{isExp ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</IconButton>
              <I size={18} style={{ marginRight: 8 }} />
              <Typography variant="subtitle2" sx={{ flex: 1 }}>{cfg.label} ({items.length})</Typography>
              <Typography variant="caption" color="text.secondary">{cfg.desc}</Typography>
            </Box>
            <Collapse in={isExp}>
              <List dense disablePadding>
                {items.map((item, i) => (
                  <React.Fragment key={item.draftId}>
                    {i > 0 && <Divider />}
                    <ListItem sx={{ py: 1, bgcolor: selected.has(item.draftId) ? 'action.selected' : 'transparent' }}>
                      {a !== 'SKIP' && <ListItemIcon sx={{ minWidth: 40 }}><Checkbox checked={selected.has(item.draftId)} onChange={() => toggleSelect(item)} size="small" /></ListItemIcon>}
                      <ListItemText
                        primary={<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Typography variant="body2" fontWeight="medium">{item.draftName}</Typography><Chip label={item.draftType} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} /></Box>}
                        secondary={item.bestMatch && <Typography variant="caption" color="text.secondary">Matches: {item.bestMatch.entity?.name} ({Math.round(item.maxSimilarity * 100)}%)</Typography>}
                      />
                      {(item.changes || item.conflicts?.length > 0) && <Tooltip title="Details"><IconButton size="small" onClick={() => toggleItem(item.draftId)}><Eye size={16} /></IconButton></Tooltip>}
                    </ListItem>
                    <Collapse in={expandedItems[item.draftId]}>
                      <Box sx={{ px: 3, py: 1.5, bgcolor: 'grey.50' }}>
                        {item.changes && (<Box sx={{ mb: 1 }}>{Object.keys(item.changes.added || {}).length > 0 && <Typography variant="caption" display="block" color="success.main">+ Adding: {Object.keys(item.changes.added).join(', ')}</Typography>}{Object.keys(item.changes.modified || {}).length > 0 && <Typography variant="caption" display="block" color="warning.main">~ Modifying: {Object.keys(item.changes.modified).join(', ')}</Typography>}</Box>)}
                        {item.conflicts?.map((c, j) => <Typography key={j} variant="caption" display="block" color="error.main">• {c.field}: {c.description}</Typography>)}
                        {item.skipReason && <Typography variant="caption" color="text.secondary">{item.skipReason}</Typography>}
                      </Box>
                    </Collapse>
                  </React.Fragment>
                ))}
              </List>
            </Collapse>
          </Paper>
        );
      })}
    </Box>
  );
}
