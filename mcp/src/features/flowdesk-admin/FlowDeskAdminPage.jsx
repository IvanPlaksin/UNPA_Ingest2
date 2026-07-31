/**
 * FlowDesk Chat Admin — the admin section for the Chat V2 ↔ Altiora integration.
 * Design doc: api/docs/FLOWDESK_CHAT_ADMIN_DESIGN.md.
 *
 * Shell modeled on DialoguePage: header + KPI chip bar + URL-driven tabs; the
 * Sessions tab supports a /flowdesk-admin/sessions/:sessionId permalink that
 * opens the replay drawer.
 */
import React, { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Box, Tabs, Tab, Typography, Chip, Stack, Tooltip } from '@mui/material';
import {
  LayoutDashboard, MessagesSquare, HeartPulse, BookOpenText,
  FileJson2, RefreshCcw, Ticket, Cpu, Workflow, ShieldCheck,
} from 'lucide-react';

import { getAdminHealth } from './api/adminClient';
import OverviewTab from './tabs/OverviewTab';
import SessionsTab from './tabs/SessionsTab';
import QualityTab from './tabs/QualityTab';
import CatalogTab from './tabs/CatalogTab';
import SchemasTab from './tabs/SchemasTab';
import SyncTab from './tabs/SyncTab';
import TicketsTab from './tabs/TicketsTab';
import LlmTab from './tabs/LlmTab';
import PermissionsTab from './tabs/PermissionsTab';
import PromptEditorTab from './prompt-editor/PromptEditorTab';
import TourMount, { TourLauncher } from './tour/TourMount';
import { useTourAnchor } from '@guided-ux/tour/react';

const TABS = [
  { key: '',         label: 'Overview', icon: LayoutDashboard, el: <OverviewTab /> },
  { key: 'sessions', label: 'Sessions', icon: MessagesSquare,  el: <SessionsTab /> },
  { key: 'quality',  label: 'Quality',  icon: HeartPulse,      el: <QualityTab /> },
  { key: 'prompt',   label: 'Prompt Editor', icon: Workflow,   el: <PromptEditorTab /> },
  { key: 'catalog',  label: 'Catalog',  icon: BookOpenText,    el: <CatalogTab /> },
  { key: 'schemas',  label: 'Schemas',  icon: FileJson2,       el: <SchemasTab /> },
  { key: 'sync',     label: 'Sync',     icon: RefreshCcw,      el: <SyncTab /> },
  { key: 'tickets',  label: 'Tickets',  icon: Ticket,          el: <TicketsTab /> },
  { key: 'llm',      label: 'LLM',      icon: Cpu,             el: <LlmTab /> },
  { key: 'permissions', label: 'Permissions', icon: ShieldCheck, el: <PermissionsTab /> },
];

function HealthChips() {
  const [health, setHealth] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => getAdminHealth().then((h) => alive && setHealth(h)).catch(() => alive && setHealth(null));
    load();
    const t = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (!health) return null;
  const dot = (name, probe) => (
    <Tooltip key={name} title={probe?.ok ? `${name}: ok (${probe.latencyMs}ms)` : `${name}: ${probe?.error || 'down'}`}>
      <Chip size="small" variant="outlined" color={probe?.ok ? 'success' : 'error'} label={name} />
    </Tooltip>
  );
  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
      {dot('Altiora', health.altiora)}
      {dot('Memgraph', health.memgraph)}
      {dot('Redis', health.redis)}
      {dot('Qdrant', health.qdrant)}
      <Tooltip title={health.sync?.running ? `schema-sync running, SignalR ${health.sync.signalrConnected ? 'connected' : 'off'}` : (health.sync?.reason || 'schema-sync not running')}>
        <Chip size="small" variant="outlined" color={health.sync?.running ? 'success' : 'default'} label="schema-sync" />
      </Tooltip>
      <Tooltip title={health.sweeper?.running ? `sweeper running${health.sweeper.lastRun ? `, last: ${health.sweeper.lastRun.at}` : ''}` : 'sweeper not running'}>
        <Chip size="small" variant="outlined" color={health.sweeper?.running ? 'success' : 'default'} label="sweeper" />
      </Tooltip>
    </Stack>
  );
}

function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  // /flowdesk-admin[/tab[/...]] → active tab key ('' = overview);
  // sessions/:id keeps the sessions tab active.
  const seg = location.pathname.replace(/^\/flowdesk-admin\/?/, '').split('/')[0] || '';
  const active = TABS.some((t) => t.key === seg) ? seg : '';

  // Anchors the tour may point at. Declaring them is all this component does for the
  // tour — it never learns what a tour is, only that these two tabs have names.
  const sessionsTabRef = useTourAnchor('admin.tab.sessions', {
    label: 'Sessions tab', route: '/flowdesk-admin/sessions',
  });
  const promptTabRef = useTourAnchor('admin.tab.prompt', {
    label: 'Prompt Editor tab', route: '/flowdesk-admin/prompt',
  });

  return (
    <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h6">FlowDesk Chat Admin</Typography>
          <Typography variant="caption" color="text.secondary">
            Chat V2 ↔ Altiora — sessions, quality, catalog, schemas, sync, tickets, LLM
          </Typography>
        </Box>
        <Stack direction="row" alignItems="center" spacing={1}>
          <HealthChips />
          <TourLauncher />
        </Stack>
      </Stack>

      <Tabs
        value={active}
        onChange={(_, v) => navigate(`/flowdesk-admin${v ? `/${v}` : ''}`)}
        variant="scrollable" scrollButtons="auto"
        sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 40, mb: 1.5 }}
      >
        {TABS.map((t) => (
          <Tab key={t.key} value={t.key} label={t.label} icon={<t.icon size={15} />} iconPosition="start"
            ref={t.key === 'sessions' ? sessionsTabRef : (t.key === 'prompt' ? promptTabRef : undefined)}
            sx={{ minHeight: 40, py: 0 }} />
        ))}
      </Tabs>

      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <Routes>
          <Route index element={<OverviewTab />} />
          <Route path="sessions" element={<SessionsTab />} />
          <Route path="sessions/:sessionId" element={<SessionsTab />} />
          <Route path="quality" element={<QualityTab />} />
          <Route path="prompt" element={<PromptEditorTab />} />
          <Route path="catalog" element={<CatalogTab />} />
          <Route path="schemas" element={<SchemasTab />} />
          <Route path="schemas/:ousId" element={<SchemasTab />} />
          <Route path="sync" element={<SyncTab />} />
          <Route path="tickets" element={<TicketsTab />} />
          <Route path="llm" element={<LlmTab />} />
          <Route path="permissions" element={<PermissionsTab />} />
        </Routes>
      </Box>
    </Box>
  );
}

export default function FlowDeskAdminPage() {
  // The tour wraps the whole section: an anchor declared by a component that mounted
  // outside the provider is invisible to the runner, and the tour would report it as
  // "not declared" — truthfully, and uselessly.
  return (
    <TourMount>
      <Shell />
    </TourMount>
  );
}
