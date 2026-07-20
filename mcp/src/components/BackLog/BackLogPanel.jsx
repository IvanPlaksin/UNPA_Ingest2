/**
 * BackLog Panel — Kanban-style board for AI-generated code modification tasks
 * Uses MUI components throughout.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  CircularProgress,
  Alert,
  Stack,
  Checkbox,
  Tooltip,
  Menu,
  ListItemIcon,
  ListItemText
} from '@mui/material';
import {
  Add, Close, ViewColumn, BarChart, ViewList, AccountTree,
  OpenInFull, DriveFileMove, Cancel as CancelIcon, Block as BlockIcon
} from '@mui/icons-material';
import api from '../../services/api';
import TaskDetailDialog from './TaskDetailDialog';
import RankingPanel from './RankingPanel';
import SessionControlBar from './SessionControlBar';
import EfficiencyModal from './EfficiencyModal';
import MonitorView from './MonitorView';
import ListView from './ListView';
import GraphView from './GraphView';

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_COLUMNS = ['PROPOSED', 'APPROVED', 'IN_PROGRESS', 'REVIEW', 'DONE'];

const PRIORITY_COLORS = {
  P0_CRITICAL: '#d32f2f',
  P1_HIGH: '#f57c00',
  P2_MEDIUM: '#1976d2',
  P3_LOW: '#757575'
};

const PRIORITY_LABELS = {
  P0_CRITICAL: 'P0',
  P1_HIGH: 'P1',
  P2_MEDIUM: 'P2',
  P3_LOW: 'P3'
};

const COLUMN_COLORS = {
  PROPOSED: '#fff3e0',
  APPROVED: '#e3f2fd',
  IN_PROGRESS: '#e8f5e9',
  REVIEW: '#f3e5f5',
  DONE: '#f5f5f5'
};

const TASK_TYPES = ['IMPLEMENT', 'REFACTOR', 'FIX', 'DOCUMENT', 'TEST'];
const TARGET_TYPES = ['EXECUTOR', 'SERVICE', 'COMPONENT', 'GRAPH', 'API', 'UI', 'CONFIG'];
const PRIORITIES = ['P0_CRITICAL', 'P1_HIGH', 'P2_MEDIUM', 'P3_LOW'];
const EFFORTS = ['XS', 'S', 'M', 'L', 'XL'];

// ── Bulk transition maps ─────────────────────────────────────────────────────
// Where a target IS a valid state-machine transition, we call its dedicated
// endpoint (so proper metadata — approvedBy, assignedTo, completedAt… — is set).
// Any other target falls back to the generic /move override, which lets an item
// be recategorised to ANY column, in any direction (not just "forward").
const TRANSITION_ACTION = {
  PROPOSED:    { APPROVED: 'approve' },
  APPROVED:    { IN_PROGRESS: 'start' },
  IN_PROGRESS: { REVIEW: 'review', BLOCKED: 'block' },
  BLOCKED:     { IN_PROGRESS: 'unblock' },
  REVIEW:      { DONE: 'complete', IN_PROGRESS: 'unblock' }
};

// Resolve how to move `from` → `to`: a dedicated action, or the generic override.
function resolveMove(from, to) {
  const action = TRANSITION_ACTION[from]?.[to];
  return action ? { action } : { action: 'move', body: { status: to } };
}

// Statuses from which CANCELLED / REJECTED are valid transitions.
const CANCELLABLE = new Set(['APPROVED', 'IN_PROGRESS', 'BLOCKED']);
const REJECTABLE  = new Set(['PROPOSED', 'APPROVED']);

// Small colour dot per status column (for the Move-to menu).
const STATUS_DOT = {
  PROPOSED: '#f57c00', APPROVED: '#1976d2', IN_PROGRESS: '#2e7d32',
  REVIEW: '#7b1fa2', DONE: '#616161'
};

// ── BackLogCard ────────────────────────────────────────────────────────────
// Selection via a checkbox (standard list-selection affordance) + a subtle
// outline — the card body is never darkened, so the open-details icon and any
// future body interactions stay fully usable.

function BackLogCard({ item, onToggleSelect, onOpen, selected }) {
  return (
    <Card
      sx={{
        mb: 1,
        borderLeft: `4px solid ${PRIORITY_COLORS[item.priority] || '#555'}`,
        transition: 'box-shadow 0.15s, transform 0.1s, outline-color 0.15s',
        bgcolor: 'background.paper',
        outline: '2px solid',
        outlineColor: selected ? 'primary.main' : 'transparent',
        '&:hover': {
          boxShadow: 4,
          transform: 'translateY(-1px)'
        }
      }}
    >
      <CardContent sx={{ p: 1, '&:last-child': { pb: 1 }, display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
        <Checkbox
          checked={selected}
          onChange={onToggleSelect}
          size="small"
          inputProps={{ 'aria-label': `Select ${item.backlogId}` }}
          sx={{ p: 0.25, mt: -0.25 }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75, lineHeight: 1.3 }}>
            {item.title}
          </Typography>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            <Chip
              label={item.backlogId}
              size="small"
              variant="outlined"
              sx={{ fontSize: 12, height: 20 }}
            />
            <Chip
              label={PRIORITY_LABELS[item.priority] || item.priority}
              size="small"
              sx={{
                fontSize: 12,
                height: 20,
                bgcolor: (PRIORITY_COLORS[item.priority] || '#555') + '22',
                color: PRIORITY_COLORS[item.priority] || '#555',
                fontWeight: 700
              }}
            />
            <Chip
              label={item.taskType}
              size="small"
              sx={{ fontSize: 12, height: 20 }}
            />
            {item.assignedTo && (
              <Chip
                label={item.assignedTo}
                size="small"
                color="success"
                variant="outlined"
                sx={{ fontSize: 12, height: 20 }}
              />
            )}
          </Stack>
        </Box>
        <Tooltip title="Open task details">
          <IconButton
            size="small"
            onClick={onOpen}
            sx={{ mt: -0.25, flexShrink: 0 }}
          >
            <OpenInFull fontSize="small" />
          </IconButton>
        </Tooltip>
      </CardContent>
    </Card>
  );
}

// ── SelectionToolbar ─────────────────────────────────────────────────────────
// Bulk actions for the currently-selected column: move to another category,
// cancel, reject. Rendered only while a selection exists.

function SelectionToolbar({
  status, count, busy,
  onMove, onCancel, onReject, onSelectAll, onClear
}) {
  const [anchorEl, setAnchorEl] = useState(null);
  // Any column except the one the selection is currently in — free up/down moves.
  const moveTargets = STATUS_COLUMNS.filter((s) => s !== status);

  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1, mb: 1, px: 1, py: 0.5,
      bgcolor: 'primary.main', borderRadius: 1, color: 'primary.contrastText',
      flexWrap: 'wrap'
    }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {count} selected
      </Typography>
      <Chip
        label={(status || '').replace(/_/g, ' ')}
        size="small"
        sx={{ bgcolor: 'rgba(255,255,255,0.18)', color: 'inherit', fontWeight: 700, height: 20 }}
      />
      <Button size="small" sx={{ color: 'inherit', textTransform: 'none' }} onClick={onSelectAll}>
        Select all
      </Button>
      <Button size="small" sx={{ color: 'inherit', textTransform: 'none' }} onClick={onClear}>
        Clear
      </Button>

      <Box sx={{ flex: 1 }} />

      {busy && <CircularProgress size={16} sx={{ color: 'inherit' }} />}

      {moveTargets.length > 0 && (
        <>
          <Button
            size="small"
            variant="outlined"
            startIcon={<DriveFileMove />}
            disabled={busy}
            sx={{ color: 'inherit', borderColor: 'rgba(255,255,255,0.5)', textTransform: 'none' }}
            onClick={(e) => setAnchorEl(e.currentTarget)}
          >
            Move to
          </Button>
          <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)}>
            {moveTargets.map((to) => (
              <MenuItem
                key={to}
                onClick={() => { setAnchorEl(null); onMove(to); }}
              >
                <ListItemIcon>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: STATUS_DOT[to] || '#888' }} />
                </ListItemIcon>
                <ListItemText>{to.replace(/_/g, ' ')}</ListItemText>
              </MenuItem>
            ))}
          </Menu>
        </>
      )}

      {REJECTABLE.has(status) && (
        <Button
          size="small"
          variant="outlined"
          startIcon={<CancelIcon />}
          disabled={busy}
          sx={{ color: 'inherit', borderColor: 'rgba(255,255,255,0.5)', textTransform: 'none' }}
          onClick={onReject}
        >
          Reject
        </Button>
      )}

      {CANCELLABLE.has(status) && (
        <Button
          size="small"
          variant="outlined"
          startIcon={<BlockIcon />}
          disabled={busy}
          sx={{ color: 'inherit', borderColor: 'rgba(255,255,255,0.5)', textTransform: 'none' }}
          onClick={onCancel}
        >
          Cancel task
        </Button>
      )}
    </Box>
  );
}

// ── CreateTaskDialog ───────────────────────────────────────────────────────

function CreateTaskDialog({ open, onClose, onCreated }) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    taskType: 'IMPLEMENT',
    targetType: 'EXECUTOR',
    targetPath: '',
    priority: 'P2_MEDIUM',
    effort: 'M',
    acceptanceCriteria: '',
    tags: '',
    relatedCodexRules: ''
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      const criteria = form.acceptanceCriteria.split('\n').filter((c) => c.trim());
      const tags = form.tags ? form.tags.split(',').map((t) => t.trim()) : [];
      const codexRules = form.relatedCodexRules
        ? form.relatedCodexRules.split(',').map((r) => r.trim())
        : [];

      await api.post('/backlog/items', {
        ...form,
        acceptanceCriteria: criteria,
        tags,
        relatedCodexRules: codexRules,
        createdBy: 'admin'
      });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        New BackLog Task
        <IconButton size="small" onClick={onClose}><Close /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Title"
            placeholder="Min 10 characters"
            fullWidth
            size="small"
            value={form.title}
            onChange={set('title')}
          />
          <TextField
            label="Description"
            placeholder="Min 20 characters"
            fullWidth
            size="small"
            multiline
            rows={3}
            value={form.description}
            onChange={set('description')}
          />
          <Stack direction="row" spacing={2}>
            <FormControl size="small" fullWidth>
              <InputLabel>Task Type</InputLabel>
              <Select value={form.taskType} label="Task Type" onChange={set('taskType')}>
                {TASK_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel>Target Type</InputLabel>
              <Select value={form.targetType} label="Target Type" onChange={set('targetType')}>
                {TARGET_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>
          <TextField
            label="Target Path"
            placeholder="File or component path"
            fullWidth
            size="small"
            value={form.targetPath}
            onChange={set('targetPath')}
          />
          <Stack direction="row" spacing={2}>
            <FormControl size="small" fullWidth>
              <InputLabel>Priority</InputLabel>
              <Select value={form.priority} label="Priority" onChange={set('priority')}>
                {PRIORITIES.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel>Effort</InputLabel>
              <Select value={form.effort} label="Effort" onChange={set('effort')}>
                {EFFORTS.map((e) => <MenuItem key={e} value={e}>{e}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>
          <TextField
            label="Acceptance Criteria"
            placeholder="One criterion per line"
            fullWidth
            size="small"
            multiline
            rows={3}
            value={form.acceptanceCriteria}
            onChange={set('acceptanceCriteria')}
          />
          <TextField
            label="Tags"
            placeholder="Comma-separated"
            fullWidth
            size="small"
            value={form.tags}
            onChange={set('tags')}
          />
          <TextField
            label="Related Codex Rules"
            placeholder="Comma-separated, e.g. CODEX-RULE-025"
            fullWidth
            size="small"
            value={form.relatedCodexRules}
            onChange={set('relatedCodexRules')}
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={submitting}
          startIcon={submitting ? <CircularProgress size={16} /> : <Add />}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// TaskDetailDialog extracted to ./TaskDetailDialog.jsx

// ── Main Panel ─────────────────────────────────────────────────────────────

export default function BackLogPanel() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null); // for detail dialog
  // Multi-select is scoped to a single status column at a time.
  const [selection, setSelection] = useState({ status: null, ids: new Set() });
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('kanban'); // 'kanban' | 'ranking' | 'monitor' | 'list' | 'graph'
  const [efficiencyItem, setEfficiencyItem] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const selectedIds = selection.ids;
  const hasSelection = selectedIds.size > 0;

  // Toggle a card. Selecting in a different column replaces the previous
  // selection so a multi-selection always lives within one status column.
  const toggleSelect = useCallback((item) => {
    setSelection(prev => {
      const sameColumn = prev.status === item.status;
      const ids = new Set(sameColumn ? prev.ids : []);
      if (ids.has(item.backlogId)) ids.delete(item.backlogId);
      else ids.add(item.backlogId);
      return { status: ids.size ? item.status : null, ids };
    });
  }, []);

  const clearSelection = useCallback(() => setSelection({ status: null, ids: new Set() }), []);

  const selectAllInColumn = useCallback((status) => {
    setSelection({
      status,
      ids: new Set(items.filter(i => i.status === status).map(i => i.backlogId))
    });
  }, [items]);

  const fetchData = useCallback(async () => {
    try {
      const [itemsRes, statsRes] = await Promise.all([
        api.get('/backlog/items?limit=100'),
        api.get('/backlog/stats')
      ]);
      setItems(itemsRes.data?.data || []);
      setStats(statsRes.data?.data || null);
    } catch (err) {
      console.error('BackLog fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // SSE real-time updates
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3010/api/v1';
    const evtSource = new EventSource(`${baseUrl}/backlog/stream`);
    evtSource.addEventListener('task_created', () => fetchData());
    evtSource.addEventListener('task_updated', () => fetchData());
    evtSource.onerror = () => {}; // silent reconnect
    return () => evtSource.close();
  }, [fetchData]);

  const handleTransition = async (backlogId, action, body = {}) => {
    // If action is null/undefined, just refresh data (used by CyclesTab onRefresh)
    if (!action) {
      fetchData();
      return;
    }
    try {
      await api.post(`/backlog/items/${backlogId}/${action}`, body);
      fetchData();
      setSelectedItem(null);
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  // Apply an action to every selected task (all share the same status column).
  const runBulk = useCallback(async (action, body = {}) => {
    const ids = Array.from(selection.ids);
    if (ids.length === 0) return;
    setBulkBusy(true);
    const failures = [];
    for (const id of ids) {
      try {
        await api.post(`/backlog/items/${id}/${action}`, body);
      } catch (err) {
        failures.push(`${id}: ${err.response?.data?.error || err.message}`);
      }
    }
    setBulkBusy(false);
    clearSelection();
    fetchData();
    if (failures.length) {
      alert(`${failures.length} task(s) failed:\n${failures.join('\n')}`);
    }
  }, [selection.ids, clearSelection, fetchData]);

  const bulkMove = useCallback((targetStatus) => {
    const { action, body } = resolveMove(selection.status, targetStatus);
    runBulk(action, body || {});
  }, [runBulk, selection.status]);

  const bulkCancel = useCallback(() => {
    const reason = window.prompt(`Cancel ${selection.ids.size} task(s)? Optional reason:`, '');
    if (reason === null) return; // user dismissed
    runBulk('cancel', reason ? { reason } : {});
  }, [runBulk, selection.ids.size]);

  const bulkReject = useCallback(() => {
    const reason = window.prompt(`Reject ${selection.ids.size} task(s). Reason (required):`, '');
    if (reason === null) return;
    if (!reason.trim()) { alert('Rejection reason required'); return; }
    runBulk('reject', { reason: reason.trim() });
  }, [runBulk, selection.ids.size]);

  const getByStatus = (status) => items.filter((i) => i.status === status);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  // Shared view toggle buttons
  const ViewToggle = () => (
    <Stack direction="row" spacing={0.5}>
      <Button size="small" variant={view === 'kanban' ? 'contained' : 'outlined'} startIcon={<ViewColumn />} onClick={() => setView('kanban')}>Kanban</Button>
      <Button size="small" variant={view === 'list' ? 'contained' : 'outlined'} startIcon={<ViewList />} onClick={() => setView('list')}>List</Button>
      <Button size="small" variant={view === 'graph' ? 'contained' : 'outlined'} startIcon={<AccountTree />} onClick={() => setView('graph')}>Graph</Button>
      <Button size="small" variant={view === 'ranking' ? 'contained' : 'outlined'} startIcon={<BarChart />} onClick={() => setView('ranking')}>Ranking</Button>
      <Button size="small" variant={view === 'monitor' ? 'contained' : 'outlined'} color="info" onClick={() => setView('monitor')}>Monitor</Button>
    </Stack>
  );

  if (view === 'monitor') {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ px: 2, pt: 2 }}>
          <SessionControlBar selectedItem={selectedItem} selectedIds={selectedIds} onAnalyze={(item) => setEfficiencyItem(item)} />
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, pt: 1, pb: 1 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="h6">BackLog</Typography>
            {stats && <Chip label={`${stats.openCount || 0} open`} size="small" color="primary" variant="outlined" />}
          </Stack>
          <ViewToggle />
        </Box>
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <MonitorView />
        </Box>
        <EfficiencyModal open={!!efficiencyItem} onClose={() => setEfficiencyItem(null)} item={efficiencyItem} />
      </Box>
    );
  }

  if (view === 'ranking') {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ px: 2, pt: 2 }}>
          <SessionControlBar selectedItem={selectedItem} selectedIds={selectedIds} onAnalyze={(item) => setEfficiencyItem(item)} />
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, pt: 1, pb: 1 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="h6">BackLog</Typography>
            {stats && <Chip label={`${stats.openCount || 0} open`} size="small" color="primary" variant="outlined" />}
          </Stack>
          <ViewToggle />
        </Box>
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <RankingPanel />
        </Box>
        <EfficiencyModal
          open={!!efficiencyItem}
          onClose={() => setEfficiencyItem(null)}
          item={efficiencyItem}
        />
      </Box>
    );
  }

  if (view === 'list') {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ px: 2, pt: 2 }}>
          <SessionControlBar selectedItem={selectedItem} selectedIds={selectedIds} onAnalyze={(item) => setEfficiencyItem(item)} />
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, pt: 1, pb: 1 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="h6">BackLog</Typography>
            {stats && <Chip label={`${stats.openCount || 0} open`} size="small" color="primary" variant="outlined" />}
            {stats && <Typography variant="caption" color="text.secondary">{stats.total} total</Typography>}
          </Stack>
          <Stack direction="row" spacing={0.5}>
            <ViewToggle />
            <Button variant="contained" startIcon={<Add />} onClick={() => setShowCreate(true)} size="small">New Task</Button>
          </Stack>
        </Box>
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <ListView tasks={items} onTaskClick={(task) => setSelectedItem(task)} />
        </Box>
        <CreateTaskDialog open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); fetchData(); }} />
        {selectedItem && <TaskDetailDialog item={selectedItem} open={!!selectedItem} onClose={() => setSelectedItem(null)} onTransition={handleTransition} />}
        <EfficiencyModal open={!!efficiencyItem} onClose={() => setEfficiencyItem(null)} item={efficiencyItem} />
      </Box>
    );
  }

  if (view === 'graph') {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ px: 2, pt: 2 }}>
          <SessionControlBar selectedItem={selectedItem} selectedIds={selectedIds} onAnalyze={(item) => setEfficiencyItem(item)} />
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, pt: 1, pb: 1 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="h6">BackLog</Typography>
            {stats && <Chip label={`${stats.openCount || 0} open`} size="small" color="primary" variant="outlined" />}
          </Stack>
          <Stack direction="row" spacing={0.5}>
            <ViewToggle />
            <Button variant="contained" startIcon={<Add />} onClick={() => setShowCreate(true)} size="small">New Task</Button>
          </Stack>
        </Box>
        <Box sx={{ flex: 1 }}>
          <GraphView tasks={items} onTaskClick={(task) => setSelectedItem(task)} />
        </Box>
        <CreateTaskDialog open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); fetchData(); }} />
        {selectedItem && <TaskDetailDialog item={selectedItem} open={!!selectedItem} onClose={() => setSelectedItem(null)} onTransition={handleTransition} />}
        <EfficiencyModal open={!!efficiencyItem} onClose={() => setEfficiencyItem(null)} item={efficiencyItem} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Session Control Bar */}
      <SessionControlBar
        selectedItem={selectedItem}
        selectedIds={selectedIds}
        onAnalyze={(item) => setEfficiencyItem(item)}
      />

      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Typography variant="h6">BackLog</Typography>
          {stats && (
            <Chip
              label={`${stats.openCount || 0} open`}
              size="small"
              color="primary"
              variant="outlined"
            />
          )}
          {stats && (
            <Typography variant="caption" color="text.secondary">
              {stats.total} total
            </Typography>
          )}
        </Stack>
        <Stack direction="row" spacing={0.5}>
          <ViewToggle />
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setShowCreate(true)}
            size="small"
          >
            New Task
          </Button>
        </Stack>
      </Box>

      {/* Selection Toolbar — bulk actions for the selected column */}
      {hasSelection && (
        <SelectionToolbar
          status={selection.status}
          count={selectedIds.size}
          busy={bulkBusy}
          onMove={bulkMove}
          onCancel={bulkCancel}
          onReject={bulkReject}
          onSelectAll={() => selectAllInColumn(selection.status)}
          onClear={clearSelection}
        />
      )}

      {/* Kanban Board */}
      <Box sx={{ display: 'flex', gap: 1.5, flex: 1, overflow: 'auto' }}>
        {STATUS_COLUMNS.map((status) => {
          const columnItems = getByStatus(status);
          return (
            <Box
              key={status}
              sx={{
                flex: 1,
                minWidth: 240,
                bgcolor: (theme) =>
                  theme.palette.mode === 'dark'
                    ? 'rgba(255,255,255,0.03)'
                    : COLUMN_COLORS[status],
                borderRadius: 2,
                p: 1,
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 1, mb: 1 }}>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'text.secondary' }}
                >
                  {status.replace(/_/g, ' ')}
                </Typography>
                <Chip label={columnItems.length} size="small" sx={{ height: 20, fontSize: 13 }} />
              </Stack>

              <Box sx={{ flex: 1, overflow: 'auto' }}>
                {columnItems.map((item) => (
                  <BackLogCard
                    key={item.backlogId}
                    item={item}
                    selected={selectedIds.has(item.backlogId)}
                    onToggleSelect={() => toggleSelect(item)}
                    onOpen={() => setSelectedItem(item)}
                  />
                ))}
                {columnItems.length === 0 && (
                  <Typography
                    variant="caption"
                    color="text.disabled"
                    sx={{ display: 'block', textAlign: 'center', mt: 2 }}
                  >
                    No items
                  </Typography>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Dialogs */}
      <CreateTaskDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          setShowCreate(false);
          fetchData();
        }}
      />

      {selectedItem && (
        <TaskDetailDialog
          item={selectedItem}
          open={!!selectedItem}
          onClose={() => setSelectedItem(null)}
          onTransition={handleTransition}
        />
      )}

      <EfficiencyModal
        open={!!efficiencyItem}
        onClose={() => setEfficiencyItem(null)}
        item={efficiencyItem}
      />
    </Box>
  );
}
