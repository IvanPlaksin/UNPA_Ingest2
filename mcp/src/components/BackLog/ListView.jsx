/**
 * ListView — Sortable, filterable table view of BackLog tasks
 */
import React, { useState, useMemo } from 'react';
import {
  Box, Typography, Chip, Stack, TextField, InputAdornment,
  FormControl, Select, MenuItem, IconButton, Tooltip,
  Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TableSortLabel, TablePagination, Paper
} from '@mui/material';
import { Search, OpenInNew } from '@mui/icons-material';

const PRIORITY_COLORS = { P0_CRITICAL: 'error', P1_HIGH: 'warning', P2_MEDIUM: 'info', P3_LOW: 'default' };
const STATUS_COLORS = {
  PROPOSED: 'default', APPROVED: 'info', IN_PROGRESS: 'primary',
  BLOCKED: 'error', REVIEW: 'warning', DONE: 'success',
  REJECTED: 'error', CANCELLED: 'default'
};

const COLUMNS = [
  { id: 'backlogId', label: 'ID', width: 130 },
  { id: 'title', label: 'Title', width: 300 },
  { id: 'status', label: 'Status', width: 120 },
  { id: 'priority', label: 'Priority', width: 110 },
  { id: 'taskType', label: 'Type', width: 100 },
  { id: 'effort', label: 'Effort', width: 70 },
  { id: 'assignedTo', label: 'Assigned', width: 120 },
  { id: 'childCount', label: 'Sub', width: 60 },
  { id: 'createdAt', label: 'Created', width: 100 },
];

export default function ListView({ tasks, onTaskClick }) {
  const [orderBy, setOrderBy] = useState('backlogId');
  const [order, setOrder] = useState('asc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');

  const filtered = useMemo(() => {
    let result = [...tasks];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.backlogId?.toLowerCase().includes(q) ||
        t.title?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'ALL') result = result.filter(t => t.status === statusFilter);
    if (priorityFilter !== 'ALL') result = result.filter(t => t.priority === priorityFilter);

    result.sort((a, b) => {
      const aVal = a[orderBy] ?? '';
      const bVal = b[orderBy] ?? '';
      if (orderBy === 'createdAt') return order === 'asc' ? new Date(aVal) - new Date(bVal) : new Date(bVal) - new Date(aVal);
      if (typeof aVal === 'number') return order === 'asc' ? aVal - bVal : bVal - aVal;
      return order === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
    return result;
  }, [tasks, searchQuery, statusFilter, priorityFilter, orderBy, order]);

  const handleSort = (col) => {
    setOrder(orderBy === col && order === 'asc' ? 'desc' : 'asc');
    setOrderBy(col);
  };

  const paginated = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Filters */}
      <Stack direction="row" spacing={2} sx={{ p: 2, bgcolor: 'background.paper' }}>
        <TextField
          size="small"
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
          sx={{ width: 250 }}
        />
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }} displayEmpty>
            <MenuItem value="ALL">All Status</MenuItem>
            {Object.keys(STATUS_COLORS).map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <Select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); setPage(0); }} displayEmpty>
            <MenuItem value="ALL">All Priority</MenuItem>
            {Object.keys(PRIORITY_COLORS).map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
          </Select>
        </FormControl>
        <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center', ml: 'auto !important' }}>
          {filtered.length} of {tasks.length}
        </Typography>
      </Stack>

      {/* Table */}
      <TableContainer component={Paper} elevation={0} sx={{ flex: 1, overflow: 'auto' }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {COLUMNS.map(col => (
                <TableCell key={col.id} sx={{ width: col.width, fontWeight: 700 }}>
                  <TableSortLabel active={orderBy === col.id} direction={orderBy === col.id ? order : 'asc'} onClick={() => handleSort(col.id)}>
                    {col.label}
                  </TableSortLabel>
                </TableCell>
              ))}
              <TableCell sx={{ width: 50 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {paginated.map(task => (
              <TableRow key={task.backlogId} hover onClick={() => onTaskClick?.(task)} sx={{ cursor: 'pointer' }}>
                <TableCell>
                  <Typography variant="body2" fontFamily="monospace">{task.backlogId}</Typography>
                </TableCell>
                <TableCell>
                  <Tooltip title={task.title} placement="top-start">
                    <Typography variant="body2" noWrap sx={{ maxWidth: 280 }}>{task.title}</Typography>
                  </Tooltip>
                </TableCell>
                <TableCell><Chip label={task.status} size="small" color={STATUS_COLORS[task.status] || 'default'} /></TableCell>
                <TableCell><Chip label={task.priority} size="small" color={PRIORITY_COLORS[task.priority] || 'default'} variant="outlined" /></TableCell>
                <TableCell>{task.taskType}</TableCell>
                <TableCell>{task.effort || '-'}</TableCell>
                <TableCell><Typography variant="body2" noWrap>{task.assignedTo || '-'}</Typography></TableCell>
                <TableCell align="center">{task.childCount > 0 ? <Chip label={task.childCount} size="small" /> : '-'}</TableCell>
                <TableCell><Typography variant="caption">{new Date(task.createdAt).toLocaleDateString()}</Typography></TableCell>
                <TableCell>
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); onTaskClick?.(task); }}>
                    <OpenInNew fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {paginated.length === 0 && (
              <TableRow><TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                <Typography variant="body2" color="text.secondary">No tasks match filters</Typography>
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={filtered.length}
        page={page}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[10, 25, 50, 100]}
      />
    </Box>
  );
}
