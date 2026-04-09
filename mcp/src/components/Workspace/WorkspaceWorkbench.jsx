/**
 * WorkspaceWorkbench (WS2-008)
 *
 * Integrated 3-panel layout that combines:
 *   - Left: WorkspaceSidePanel (sources + drafts + contradictions)
 *   - Center: WorkspaceCanvas (visual draft graph editor)
 *   - Right: WorkspaceAgentPanel (chat + actions log)
 *
 * Both side panels are resizable and collapsible.
 */

import React, { useCallback, useRef, useState } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import {
  ChevronLeft as CollapseLeftIcon,
  ChevronRight as ExpandRightIcon
} from '@mui/icons-material';
import WorkspaceCanvas from './WorkspaceCanvas';
import WorkspaceSidePanel from './WorkspaceSidePanel';
import WorkspaceAgentPanel from './WorkspaceAgentPanel';
import PromotionWizard from './PromotionWizard';
import * as wsApi from '../../services/workspace.service';

const DEFAULT_LEFT = 240;
const DEFAULT_RIGHT = 380;
const MIN_LEFT = 160;
const MIN_RIGHT = 280;
const MAX_LEFT = 420;
const MAX_RIGHT = 560;
const COLLAPSED_W = 28;

/* ───────── Resizer handle ───────── */

const Resizer = ({ side, onResize, disabled }) => {
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const onMouseDown = (e) => {
    if (disabled) return;
    dragging.current = true;
    startX.current = e.clientX;
    onResize.current?.(true);
  };

  React.useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return;
      const delta = side === 'left' ? (e.clientX - startX.current) : (startX.current - e.clientX);
      onResize.delta?.(delta);
    };
    const onUp = () => {
      if (dragging.current) {
        dragging.current = false;
        onResize.current?.(false);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [side, onResize]);

  return (
    <Box
      onMouseDown={onMouseDown}
      sx={{
        width: 4,
        cursor: disabled ? 'default' : 'col-resize',
        bgcolor: 'transparent',
        '&:hover': { bgcolor: disabled ? 'transparent' : 'primary.light' },
        flexShrink: 0
      }}
    />
  );
};

const WorkspaceWorkbench = ({ workspaceId }) => {
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardDrafts, setWizardDrafts] = useState([]);

  const leftStartW = useRef(DEFAULT_LEFT);
  const rightStartW = useRef(DEFAULT_RIGHT);

  const leftResizeApi = useRef({
    current: (active) => { if (active) leftStartW.current = leftWidth; },
    delta: (delta) => {
      const next = Math.max(MIN_LEFT, Math.min(MAX_LEFT, leftStartW.current + delta));
      setLeftWidth(next);
    }
  });

  const rightResizeApi = useRef({
    current: (active) => { if (active) rightStartW.current = rightWidth; },
    delta: (delta) => {
      const next = Math.max(MIN_RIGHT, Math.min(MAX_RIGHT, rightStartW.current + delta));
      setRightWidth(next);
    }
  });

  // Keep refs in sync with state for the next mousedown
  React.useEffect(() => { leftResizeApi.current.current = (active) => { if (active) leftStartW.current = leftWidth; }; }, [leftWidth]);
  React.useEffect(() => { rightResizeApi.current.current = (active) => { if (active) rightStartW.current = rightWidth; }; }, [rightWidth]);

  const handleAnalyze = useCallback(() => {
    // Forward analysis trigger as a chat message — easiest cross-panel comm.
    // Future: shared store / ref-based.
    const msg = 'Run a full cross-source analysis on this workspace and summarise the key findings.';
    // Setting input via DOM is brittle; instead store in window for the agent panel to pick up
    window.dispatchEvent(new CustomEvent('workspace:agent:prefill', { detail: { workspaceId, message: msg } }));
  }, [workspaceId]);

  // Open promotion wizard from SidePanel — load promotion-ready drafts first
  const handlePromote = useCallback(async () => {
    try {
      const [validated, ready] = await Promise.all([
        wsApi.listDrafts(workspaceId, { status: 'VALIDATED', limit: 200 }),
        wsApi.listDrafts(workspaceId, { status: 'READY_TO_PROMOTE', limit: 200 })
      ]);
      const all = [...(validated?.data || []), ...(ready?.data || [])];
      setWizardDrafts(all);
      setWizardOpen(true);
    } catch (err) {
      console.warn('Failed to load drafts for wizard', err);
      setWizardDrafts([]);
      setWizardOpen(true); // open anyway — validation step will handle
    }
  }, [workspaceId]);

  const handleWizardClose = useCallback(() => {
    setWizardOpen(false);
    setWizardDrafts([]);
  }, []);

  return (
    <Box sx={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      overflow: 'hidden'
    }}>
      {/* LEFT PANEL */}
      <Box sx={{
        width: leftCollapsed ? COLLAPSED_W : leftWidth,
        flexShrink: 0,
        borderRight: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {leftCollapsed ? (
          <Tooltip title="Expand sources panel" placement="right">
            <IconButton size="small" onClick={() => setLeftCollapsed(false)} sx={{ m: 0.25 }}>
              <ExpandRightIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : (
          <>
            <Box sx={{ position: 'absolute', top: 4, right: 4, zIndex: 2 }}>
              <Tooltip title="Collapse">
                <IconButton size="small" onClick={() => setLeftCollapsed(true)}>
                  <CollapseLeftIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <WorkspaceSidePanel
              workspaceId={workspaceId}
              onAnalyzeClick={handleAnalyze}
              onPromoteClick={handlePromote}
            />
          </>
        )}
      </Box>

      {!leftCollapsed && <Resizer side="left" onResize={leftResizeApi.current} />}

      {/* CENTER (Canvas) */}
      <Box sx={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <WorkspaceCanvas workspaceId={workspaceId} />
      </Box>

      {!rightCollapsed && <Resizer side="right" onResize={rightResizeApi.current} />}

      {/* RIGHT PANEL */}
      <Box sx={{
        width: rightCollapsed ? COLLAPSED_W : rightWidth,
        flexShrink: 0,
        borderLeft: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative'
      }}>
        {rightCollapsed ? (
          <Tooltip title="Expand agent panel" placement="left">
            <IconButton size="small" onClick={() => setRightCollapsed(false)} sx={{ m: 0.25 }}>
              <CollapseLeftIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : (
          <>
            <Box sx={{ position: 'absolute', top: 4, left: 4, zIndex: 2 }}>
              <Tooltip title="Collapse">
                <IconButton size="small" onClick={() => setRightCollapsed(true)}>
                  <ExpandRightIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <WorkspaceAgentPanel workspaceId={workspaceId} />
          </>
        )}
      </Box>

      <PromotionWizard
        open={wizardOpen}
        workspaceId={workspaceId}
        initialDrafts={wizardDrafts}
        onClose={handleWizardClose}
      />
    </Box>
  );
};

export default WorkspaceWorkbench;
