/**
 * Dialogue Gym — system-prompt optimizer for FlowDesk Chat V2.
 *
 * Shell modeled on FlowDeskAdminPage: header + health chips + URL-driven tabs
 * (Personas, Scenarios, Arena, Judge). Each tab owns its own data loading.
 */
import React, { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Box, Tabs, Tab, Typography, Chip, Stack, Tooltip } from '@mui/material';
import { Users, ListChecks, Swords, Gavel } from 'lucide-react';

import { getHealth } from './api/dialogueGymClient';
import PersonasTab from './tabs/PersonasTab';
import ScenariosTab from './tabs/ScenariosTab';
import ArenaTab from './tabs/ArenaTab';
import JudgeTab from './tabs/JudgeTab';

const TABS = [
  { key: '', label: 'Personas', icon: Users },
  { key: 'scenarios', label: 'Scenarios', icon: ListChecks },
  { key: 'arena', label: 'Arena', icon: Swords },
  { key: 'judge', label: 'Judge', icon: Gavel },
];

function HealthChips() {
  const [h, setH] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => getHealth().then((x) => alive && setH(x)).catch(() => alive && setH(null));
    load();
    const t = setInterval(load, 20000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (!h) return null;
  const dirOk = h.directory?.ok;
  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
      <Tooltip title={dirOk
        ? `employee directory: available (${h.directory?.resolveUser?.count ?? '?'} results)`
        : `directory: ${h.directory?.resolveUser?.error || 'unavailable'} — runs will halt`}>
        <Chip size="small" variant="outlined" color={dirOk ? 'success' : 'error'} label="directory" />
      </Tooltip>
      <Chip size="small" variant="outlined" label={`personas ${h.counts?.personas ?? '—'}`} />
      <Chip size="small" variant="outlined" label={`scenarios ${h.counts?.scenarios ?? '—'}`} />
      <Chip size="small" variant="outlined" label={`runs ${h.counts?.runs ?? '—'}`} />
      <Chip size="small" variant="outlined" label={`judged ${h.counts?.judgeRecords ?? '—'}`} />
    </Stack>
  );
}

function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const seg = location.pathname.replace(/^\/dialogue-gym\/?/, '').split('/')[0] || '';
  const active = TABS.some((t) => t.key === seg) ? seg : '';

  return (
    <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h6">Dialogue Gym</Typography>
          <Typography variant="caption" color="text.secondary">
            System-prompt optimizer — simulated-user dialogues, ground truth, arena runs, multi-criteria judge
          </Typography>
        </Box>
        <HealthChips />
      </Stack>

      <Tabs
        value={active}
        onChange={(_, v) => navigate(`/dialogue-gym${v ? `/${v}` : ''}`)}
        variant="scrollable" scrollButtons="auto"
        sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 40, mb: 1.5 }}
      >
        {TABS.map((t) => (
          <Tab key={t.key} value={t.key} label={t.label} icon={<t.icon size={15} />} iconPosition="start"
            sx={{ minHeight: 40, py: 0 }} />
        ))}
      </Tabs>

      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <Routes>
          <Route index element={<PersonasTab />} />
          <Route path="scenarios" element={<ScenariosTab />} />
          <Route path="arena" element={<ArenaTab />} />
          <Route path="arena/:runId" element={<ArenaTab />} />
          <Route path="judge" element={<JudgeTab />} />
        </Routes>
      </Box>
    </Box>
  );
}

export default function DialogueGymPage() {
  return <Shell />;
}
