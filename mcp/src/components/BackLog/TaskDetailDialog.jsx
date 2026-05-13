/**
 * TaskDetailDialog — Enhanced task detail view with tabs
 * Tabs: Overview | Cycles | Sources | Execution | Resolution | Subtasks | History
 */
import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Chip, Stack, Button, IconButton,
  Tab, Tabs, TextField
} from '@mui/material';
import {
  CheckCircle, PlayArrow, RateReview, Block,
  Cancel, Close, LockOpen, Undo
} from '@mui/icons-material';

import OverviewTab from './tabs/OverviewTab';
import SourcesTab from './tabs/SourcesTab';
import ExecutionTab from './tabs/ExecutionTab';
import SubtasksTab from './tabs/SubtasksTab';
import HistoryTab from './tabs/HistoryTab';
import CyclesTab from './tabs/CyclesTab';
import ResolutionTab from './tabs/ResolutionTab';
import DialoguesTab from './tabs/DialoguesTab';

const PRIORITY_COLORS = {
  P0_CRITICAL: '#d32f2f', P1_HIGH: '#f57c00', P2_MEDIUM: '#1976d2', P3_LOW: '#757575'
};

const PRIORITY_LABELS = {
  P0_CRITICAL: 'P0', P1_HIGH: 'P1', P2_MEDIUM: 'P2', P3_LOW: 'P3'
};

const STATUS_ACTIONS = {
  PROPOSED: [
    { label: 'Approve', action: 'approve', color: 'success', icon: <CheckCircle fontSize="small" /> },
    { label: 'Reject', action: 'reject', color: 'error', icon: <Cancel fontSize="small" />, needsReason: true }
  ],
  APPROVED: [
    { label: 'Start Work', action: 'start', color: 'primary', icon: <PlayArrow fontSize="small" /> },
    { label: 'Cancel', action: 'cancel', color: 'error', icon: <Cancel fontSize="small" /> }
  ],
  IN_PROGRESS: [
    { label: 'Submit for Review', action: 'review', color: 'warning', icon: <RateReview fontSize="small" /> },
    { label: 'Block', action: 'block', color: 'error', icon: <Block fontSize="small" /> },
    { label: 'Return to Proposed', action: 'return-to-proposed', color: 'info', icon: <Undo fontSize="small" />, needsReason: true }
  ],
  BLOCKED: [
    { label: 'Unblock', action: 'unblock', color: 'success', icon: <LockOpen fontSize="small" /> }
  ],
  REVIEW: [
    { label: 'Complete', action: 'complete', color: 'success', icon: <CheckCircle fontSize="small" /> },
    { label: 'Back to Work', action: 'unblock', color: 'warning', icon: <PlayArrow fontSize="small" /> }
  ]
};

function TabPanel({ children, value, index }) {
  return value === index ? <Box>{children}</Box> : null;
}

export default function TaskDetailDialog({ item, open, onClose, onTransition }) {
  const [tab, setTab] = useState(0);
  const [reason, setReason] = useState('');
  const [showReason, setShowReason] = useState(null);

  const actions = STATUS_ACTIONS[item.status] || [];

  const handleAction = (a) => {
    if (a.needsReason) {
      setShowReason(a.action);
    } else {
      onTransition(item.backlogId, a.action, {});
    }
  };

  const submitWithReason = () => {
    if (reason.trim()) {
      onTransition(item.backlogId, showReason, { reason: reason.trim() });
      setShowReason(null);
      setReason('');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip label={item.backlogId} size="small" variant="outlined" />
          <Chip
            label={`${PRIORITY_LABELS[item.priority] || item.priority} | ${item.effort}`}
            size="small"
            sx={{
              bgcolor: (PRIORITY_COLORS[item.priority] || '#555') + '33',
              color: PRIORITY_COLORS[item.priority]
            }}
          />
          <Chip label={item.status} size="small" color="primary" variant="outlined" />
        </Stack>
        <IconButton size="small" onClick={onClose}><Close /></IconButton>
      </DialogTitle>

      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ px: 3, borderBottom: 1, borderColor: 'divider' }}
        variant="scrollable"
        scrollButtons="auto"
      >
        <Tab label="Overview" />
        <Tab label="Cycles" />
        <Tab label="Sources" />
        <Tab label="Execution" />
        <Tab label="Resolution" />
        <Tab label="Subtasks" />
        <Tab label="History" />
        <Tab label="Dialogues" />
      </Tabs>

      <DialogContent dividers sx={{ p: 0, minHeight: 350 }}>
        <TabPanel value={tab} index={0}>
          <OverviewTab task={item} />
        </TabPanel>
        <TabPanel value={tab} index={1}>
          <CyclesTab backlogId={item.backlogId} onRefresh={onTransition ? () => onTransition(item.backlogId, null) : null} />
        </TabPanel>
        <TabPanel value={tab} index={2}>
          <SourcesTab backlogId={item.backlogId} />
        </TabPanel>
        <TabPanel value={tab} index={3}>
          <ExecutionTab backlogId={item.backlogId} />
        </TabPanel>
        <TabPanel value={tab} index={4}>
          <ResolutionTab backlogId={item.backlogId} />
        </TabPanel>
        <TabPanel value={tab} index={5}>
          <SubtasksTab backlogId={item.backlogId} />
        </TabPanel>
        <TabPanel value={tab} index={6}>
          <HistoryTab task={item} />
        </TabPanel>
        <TabPanel value={tab} index={7}>
          <DialoguesTab backlogId={item.backlogId} />
        </TabPanel>

        {showReason && (
          <Box sx={{ px: 2, pb: 2 }}>
            <TextField
              label="Reason"
              size="small"
              fullWidth
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
            <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 1 }}>
              <Button size="small" onClick={() => setShowReason(null)}>Cancel</Button>
              <Button size="small" variant="contained" color="error" onClick={submitWithReason}>Submit</Button>
            </Stack>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        {actions.map((a) => (
          <Button
            key={a.action}
            variant="contained"
            color={a.color}
            size="small"
            startIcon={a.icon}
            onClick={() => handleAction(a)}
          >
            {a.label}
          </Button>
        ))}
        <Button onClick={onClose} color="inherit" size="small">Close</Button>
      </DialogActions>
    </Dialog>
  );
}
