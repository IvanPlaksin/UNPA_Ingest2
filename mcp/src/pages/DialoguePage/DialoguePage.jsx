import React from 'react';
import { Box, Tabs, Tab, Typography, Chip, CircularProgress } from '@mui/material';
import { Timeline, Lightbulb, Search } from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import TimelineTab from './TimelineTab';
import DecisionsTab from './DecisionsTab';
import SearchTab from './SearchTab';
import { useDialogueStats, useDialogueMetrics } from '../../hooks/useDialogue';

const TABS = [
  { path: '/dialogue',           label: 'Timeline',  icon: <Timeline /> },
  { path: '/dialogue/decisions', label: 'Decisions', icon: <Lightbulb /> },
  { path: '/dialogue/search',    label: 'Search',    icon: <Search /> },
];

function resolveTab(pathname) {
  if (pathname.startsWith('/dialogue/decisions')) return 1;
  if (pathname.startsWith('/dialogue/search')) return 2;
  return 0;
}

export default function DialoguePage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activeTab = resolveTab(pathname);

  const { stats, loading: statsLoading } = useDialogueStats();
  const { metrics } = useDialogueMetrics();

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={600}>DevDialogue Collector</Typography>
          <Typography variant="body2" color="text.secondary">
            Semantic index of development conversations
          </Typography>
        </Box>

        {/* Stats bar */}
        {statsLoading ? (
          <CircularProgress size={20} />
        ) : stats ? (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip label={`${stats.totalSessions ?? 0} sessions`} size="small" variant="outlined" />
            <Chip
              label={`${metrics?.segments ?? '—'} segments`}
              size="small" variant="outlined" color="primary"
            />
            <Chip
              label={`${metrics?.decisions ?? '—'} decisions`}
              size="small" variant="outlined" color="success"
            />
            <Chip
              label={`${metrics?.chains ?? '—'} chains`}
              size="small" variant="outlined" color="secondary"
            />
          </Box>
        ) : null}
      </Box>

      {/* Tabs — driven by URL */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={activeTab} onChange={(_e, idx) => navigate(TABS[idx].path)}>
          {TABS.map(t => (
            <Tab key={t.path} icon={t.icon} iconPosition="start" label={t.label} />
          ))}
        </Tabs>
      </Box>

      {activeTab === 0 && <TimelineTab />}
      {activeTab === 1 && <DecisionsTab />}
      {activeTab === 2 && <SearchTab />}
    </Box>
  );
}
