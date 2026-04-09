/**
 * CodexTreeView - hierarchical tree: Part -> Section -> Rule
 */
import React, { useState, useMemo } from 'react';
import { Box, Typography, IconButton, Collapse, Chip, TextField, InputAdornment, CircularProgress } from '@mui/material';
import { ChevronRight, ChevronDown, Book, FileText, CheckSquare, Search } from 'lucide-react';
import { useCodexHierarchy } from '../../hooks/useCodex';

const MODALITY_COLORS = {
  MUST:        { bg: '#ffebee', color: '#c62828' },
  SHOULD:      { bg: '#fff3e0', color: '#ef6c00' },
  MAY:         { bg: '#e3f2fd', color: '#1565c0' },
  MUST_NOT:    { bg: '#fce4ec', color: '#ad1457' },
  SHOULD_NOT:  { bg: '#fff8e1', color: '#f57f17' },
  DESCRIPTIVE: { bg: '#f5f5f5', color: '#616161' },
  mandatory:   { bg: '#ffebee', color: '#c62828' },
  recommended: { bg: '#fff3e0', color: '#ef6c00' },
  optional:    { bg: '#e3f2fd', color: '#1565c0' },
  prohibited:  { bg: '#fce4ec', color: '#ad1457' },
  descriptive: { bg: '#f5f5f5', color: '#616161' },
  mapping:     { bg: '#e8f5e9', color: '#2e7d32' },
};

function prop(node, key) {
  return node?.properties?.[key] ?? node?.[key] ?? '';
}

function TreeNode({ node, level, type, onSelect, selectedId, filter }) {
  const [expanded, setExpanded] = useState(level < 1);

  const children = type === 'part'
    ? (node.sections || [])
    : type === 'section'
      ? (node.rules || [])
      : [];

  const title = prop(node, 'title') || prop(node, 'partId') || prop(node, 'sectionId') || prop(node, 'ruleId');
  const id = prop(node, 'partId') || prop(node, 'sectionId') || prop(node, 'ruleId');
  const isSelected = selectedId === id;
  const modality = prop(node, 'modality');

  // Filter
  const matchesFilter = !filter || title.toLowerCase().includes(filter.toLowerCase());
  const hasMatchingChild = !filter || children.some(c => {
    const ct = prop(c, 'title') || '';
    if (ct.toLowerCase().includes(filter.toLowerCase())) return true;
    if (type === 'part') {
      return (c.rules || []).some(r => (prop(r, 'title') || '').toLowerCase().includes(filter.toLowerCase()));
    }
    return false;
  });

  if (filter && !matchesFilter && !hasMatchingChild) return null;

  const icons = { part: <Book size={15} />, section: <FileText size={14} />, rule: <CheckSquare size={13} /> };

  return (
    <Box>
      <Box
        onClick={() => onSelect?.(node, type)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5,
          py: 0.4, px: 1, pl: level * 2 + 1,
          cursor: 'pointer', borderRadius: 1,
          bgcolor: isSelected ? 'rgba(79,209,197,0.15)' : 'transparent',
          '&:hover': { bgcolor: isSelected ? 'rgba(79,209,197,0.2)' : 'rgba(255,255,255,0.05)' },
          borderLeft: isSelected ? '2px solid #4fd1c5' : '2px solid transparent'
        }}
      >
        {children.length > 0 ? (
          <IconButton size="small" onClick={e => { e.stopPropagation(); setExpanded(!expanded); }} sx={{ p: 0.25 }}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </IconButton>
        ) : <Box sx={{ width: 22 }} />}

        <Box sx={{ color: 'text.disabled', display: 'flex' }}>{icons[type]}</Box>

        <Typography variant="body2" sx={{
          flex: 1, fontSize: type === 'rule' ? '11.5px' : '12.5px',
          fontWeight: type === 'part' ? 600 : 400,
          color: isSelected ? '#4fd1c5' : 'text.primary',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        }}>
          {type === 'part' && <span style={{ color: '#888', marginRight: 4 }}>{prop(node, 'order')}.</span>}
          {title}
        </Typography>

        {type === 'rule' && modality && (
          <Chip
            label={modality.toUpperCase()}
            size="small"
            sx={{
              height: 17, fontSize: '9px', fontWeight: 'bold',
              bgcolor: (MODALITY_COLORS[modality] || MODALITY_COLORS.DESCRIPTIVE).bg,
              color: (MODALITY_COLORS[modality] || MODALITY_COLORS.DESCRIPTIVE).color,
              '& .MuiChip-label': { px: 0.6 }
            }}
          />
        )}

        {children.length > 0 && (
          <Chip label={children.length} size="small" variant="outlined"
            sx={{ height: 17, fontSize: '9px', '& .MuiChip-label': { px: 0.4 } }} />
        )}
      </Box>

      <Collapse in={expanded}>
        {type === 'part' && children.map(s => (
          <TreeNode key={prop(s, 'sectionId')} node={s} level={level + 1} type="section"
            onSelect={onSelect} selectedId={selectedId} filter={filter} />
        ))}
        {type === 'section' && children.map(r => (
          <TreeNode key={prop(r, 'ruleId')} node={r} level={level + 1} type="rule"
            onSelect={onSelect} selectedId={selectedId} filter={filter} />
        ))}
      </Collapse>
    </Box>
  );
}

export default function CodexTreeView({ onSelect, selectedId }) {
  const { hierarchy, metadata, loading, error } = useCodexHierarchy();
  const [filter, setFilter] = useState('');

  // Build tree: Part → Section → Rule (rules come from hierarchy API)
  const tree = useMemo(() => {
    return hierarchy.map(item => {
      const part = item.part?.properties || item.part || {};
      const sections = (item.sections || []).map(s => {
        const sp = s?.properties || s;
        // Rules are included in the hierarchy response (via CONTAINS_RULE edges)
        const rules = (sp.rules || s.rules || []).map(r => r?.properties || r);
        return { ...sp, rules };
      });
      return { ...part, sections };
    });
  }, [hierarchy]);

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress size={24} /></Box>;
  }

  if (error) {
    return <Box sx={{ p: 2, color: 'error.main' }}>Error: {error}</Box>;
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Book size={16} />
          <Typography variant="subtitle2">Codex {metadata?.version || 'v0.1.3'}</Typography>
          {metadata && <Chip label={`${metadata.rulesCount || 0} rules`} size="small" sx={{ height: 20, fontSize: '10px' }} />}
        </Box>
        <TextField
          size="small" placeholder="Filter..." fullWidth
          value={filter} onChange={e => setFilter(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment>,
            sx: { fontSize: '12px', height: 30 }
          }}
        />
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto', py: 0.5 }}>
        {tree.map(part => (
          <TreeNode key={part.partId} node={part} level={0} type="part"
            onSelect={onSelect} selectedId={selectedId} filter={filter} />
        ))}
      </Box>
    </Box>
  );
}
