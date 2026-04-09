import React, { useState, useCallback } from 'react';
import { Box, Tabs, Tab, Typography, ToggleButtonGroup, ToggleButton } from '@mui/material';
import { Activity, AlertTriangle, FileCheck, BookOpen, TreePine, Search, GitBranch, Shield, ShieldCheck } from 'lucide-react';

import KBHealthDashboard from './KBHealthDashboard';
import IssuesPanel from './IssuesPanel';
import ProposalsPanel from './ProposalsPanel';
import CodexTreeView from './CodexTreeView';
import CodexSearchPanel from './CodexSearchPanel';
import RuleDetailPanel from './RuleDetailPanel';
import CodexGraphView from './CodexGraphView';
import ADRPanel from './ADRPanel';
import ValidationPanel from './ValidationPanel';

export default function CodexViewerPanel() {
  const [tab, setTab] = useState(0);
  const [browseMode, setBrowseMode] = useState('tree');
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedType, setSelectedType] = useState(null);

  const handleSelect = (node, type) => {
    const n = node?.properties || node;
    setSelectedNode(n);
    setSelectedType(type);
  };

  const handleCloseDetail = () => {
    setSelectedNode(null);
    setSelectedType(null);
  };

  // Navigate from Graph or ADR to Browse tab with a specific Part selected
  const handleNavigatePart = useCallback((partId) => {
    setTab(0); // Switch to Browse
    setBrowseMode('tree');
    setSelectedNode({ partId });
    setSelectedType('part');
  }, []);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.default', color: 'text.primary' }}>
      {/* Header */}
      <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 2 }}>
        <BookOpen size={22} />
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Codex Viewer</Typography>
        <Typography variant="caption" color="text.disabled">v0.1.3 · 602 rules</Typography>
      </Box>

      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 40, '& .MuiTab-root': { minHeight: 40, py: 0.5, textTransform: 'none', fontSize: '13px' } }}
      >
        <Tab icon={<BookOpen size={14} />} iconPosition="start" label="Browse" />
        <Tab icon={<GitBranch size={14} />} iconPosition="start" label="Graph" />
        <Tab icon={<Shield size={14} />} iconPosition="start" label="ADRs" />
        <Tab icon={<ShieldCheck size={14} />} iconPosition="start" label="Validation" />
        <Tab icon={<Activity size={14} />} iconPosition="start" label="Health" />
        <Tab icon={<AlertTriangle size={14} />} iconPosition="start" label="Issues" />
        <Tab icon={<FileCheck size={14} />} iconPosition="start" label="Proposals" />
      </Tabs>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {/* Tab 0: Browse — split view */}
        {tab === 0 && (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <Box sx={{ width: 320, borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              <Box sx={{ p: 0.75, borderBottom: 1, borderColor: 'divider' }}>
                <ToggleButtonGroup value={browseMode} exclusive onChange={(_, v) => v && setBrowseMode(v)} size="small" fullWidth>
                  <ToggleButton value="tree" sx={{ fontSize: '12px', py: 0.5 }}>
                    <TreePine size={14} style={{ marginRight: 4 }} /> Tree
                  </ToggleButton>
                  <ToggleButton value="search" sx={{ fontSize: '12px', py: 0.5 }}>
                    <Search size={14} style={{ marginRight: 4 }} /> Search
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>
              <Box sx={{ flex: 1, overflow: 'hidden' }}>
                {browseMode === 'tree' ? (
                  <CodexTreeView
                    onSelect={handleSelect}
                    selectedId={selectedNode?.ruleId || selectedNode?.sectionId || selectedNode?.partId}
                  />
                ) : (
                  <CodexSearchPanel onSelect={handleSelect} />
                )}
              </Box>
            </Box>
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
              <RuleDetailPanel node={selectedNode} type={selectedType} onClose={handleCloseDetail} />
            </Box>
          </Box>
        )}

        {/* Tab 1: Graph */}
        {tab === 1 && (
          <Box sx={{ height: '100%' }}>
            <CodexGraphView onSelectPart={handleNavigatePart} onSelect={handleSelect} />
          </Box>
        )}

        {/* Tab 2: ADRs */}
        {tab === 2 && (
          <Box sx={{ height: '100%' }}>
            <ADRPanel onNavigatePart={handleNavigatePart} />
          </Box>
        )}

        {/* Tab 3: Validation */}
        {tab === 3 && (
          <Box sx={{ height: '100%' }}>
            <ValidationPanel />
          </Box>
        )}

        {/* Tab 4-6: Existing */}
        {tab === 4 && <Box sx={{ height: '100%', overflow: 'auto' }}><KBHealthDashboard /></Box>}
        {tab === 5 && <Box sx={{ height: '100%', overflow: 'auto' }}><IssuesPanel /></Box>}
        {tab === 6 && <Box sx={{ height: '100%', overflow: 'auto' }}><ProposalsPanel /></Box>}
      </Box>
    </Box>
  );
}
