/**
 * PrimitiveToolbar — quick-action buttons for the Investigation session header.
 *
 * Each button opens ToolDialog (Run → Preview → Add to Case flow).
 * Primitives: LOCATE · CONNECT · EXPAND · PROFILE · MATRIX · STRUCTURE · TIMELINE · RESOLVE · SYNTHESIZE · TEXT
 */
import React, { useState } from 'react';
import { Stack, Button, Tooltip } from '@mui/material';
import {
  Search, Link2, Network, BookOpen, Braces, Cpu, Clock, ScanLine, FileText, StickyNote, Zap,
} from 'lucide-react';
import ToolDialog from './ToolDialog';

const PRIMITIVES = [
  { id: 'LOCATE',    label: 'Locate',    icon: Search,    color: '#3b82f6', tip: 'Find entities matching a query' },
  { id: 'CONNECT',   label: 'Connect',   icon: Link2,     color: '#8b5cf6', tip: 'Find paths between two entities' },
  { id: 'EXPAND',    label: 'Expand',    icon: Network,   color: '#06b6d4', tip: 'Explore entity neighborhood' },
  { id: 'PROFILE',   label: 'Profile',   icon: BookOpen,  color: '#f59e0b', tip: 'Build full dossier for one entity' },
  { id: 'IMPACT',    label: 'Impact',    icon: Zap,       color: '#ef4444', tip: 'What depends on this entity — reverse dependency analysis' },
  { id: 'MATRIX',    label: 'Matrix',    icon: Braces,    color: '#10b981', tip: 'Cross-tabulate relationships' },
  { id: 'STRUCTURE', label: 'Structure', icon: Cpu,      color: '#ec4899', tip: 'Centrality & structural analysis' },
  { id: 'TIMELINE',  label: 'Timeline',  icon: Clock,    color: '#f97316', tip: 'Temporal projection of events' },
  { id: 'RESOLVE',   label: 'Resolve',   icon: ScanLine, color: '#84cc16', tip: 'Entity resolution / duplicates' },
  { id: 'SYNTHESIZE',label: 'Synthesize',icon: FileText,   color: '#a78bfa', tip: 'Generate narrative from evidence' },
  { id: 'TEXT',      label: 'Note',      icon: StickyNote, color: '#64748b', tip: 'Create a text note or annotation' },
];

export default function PrimitiveToolbar({ sessionId, disabled, onRunTool, onCommit, onDiscard }) {
  const [activePrimitive, setActivePrimitive] = useState(null);

  const handleOpen = (primitiveId) => {
    if (!disabled) setActivePrimitive(primitiveId);
  };

  const handleClose = ({ committed }) => {
    setActivePrimitive(null);
    // Parent page re-fetches session state on commit via store
  };

  return (
    <>
      <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" gap={0.5}>
        {PRIMITIVES.map(p => {
          const Icon = p.icon;
          const isOpen = activePrimitive === p.id;
          return (
            <Tooltip key={p.id} title={p.tip} placement="bottom" arrow>
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Icon size={13} />}
                  onClick={() => handleOpen(p.id)}
                  disabled={disabled}
                  sx={{
                    borderColor: isOpen ? p.color : `${p.color}55`,
                    color: p.color,
                    bgcolor: isOpen ? `${p.color}15` : 'transparent',
                    fontSize: '0.72rem',
                    height: 28,
                    px: 1,
                    minWidth: 0,
                    '&:hover': { borderColor: p.color, bgcolor: `${p.color}15` },
                  }}
                >
                  {p.label}
                </Button>
              </span>
            </Tooltip>
          );
        })}
      </Stack>

      {activePrimitive && (
        <ToolDialog
          open={!!activePrimitive}
          primitiveType={activePrimitive}
          sessionId={sessionId}
          onClose={handleClose}
          onRunTool={onRunTool}
          onCommit={onCommit}
          onDiscard={onDiscard}
        />
      )}
    </>
  );
}
