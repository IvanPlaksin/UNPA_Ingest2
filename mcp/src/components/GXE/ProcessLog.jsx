/**
 * ProcessLog
 *
 * Visualizes the 9-phase extraction pipeline as an expandable timeline.
 * Each phase shows status, duration, metrics, steps, and errors.
 * Optional restart button per phase.
 */

import React, { useState } from 'react';
import {
  Box, Typography, Collapse, IconButton,
  Chip, Button,
} from '@mui/material';
import {
  ChevronDown, ChevronRight, CheckCircle2,
  XCircle, Clock, AlertTriangle, RefreshCw,
  Zap, Database, Users, GitBranch, FileCode,
  Shield, Boxes,
} from 'lucide-react';

const PHASE_ICONS = {
  META_CONSULTATION:      Zap,
  RECONNAISSANCE:         Database,
  MASTER_DATA:            Database,
  ENTITY_DISCOVERY:       Users,
  RELATIONSHIP_INFERENCE: GitBranch,
  TRANSACTION_ANALYSIS:   Clock,
  BUSINESS_LOGIC:         FileCode,
  CROSS_VALIDATION:       Shield,
  GRAPH_SYNTHESIS:        Boxes,
};

const STATUS_COLORS = {
  complete: '#238636',
  running:  '#1f6feb',
  failed:   '#da3633',
  skipped:  '#6e7681',
  pending:  '#30363d',
};

function formatPhaseName(name) {
  return (name || '')
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

function formatDuration(ms) {
  if (!ms) return '0s';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function StatusIcon({ status }) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.pending;
  switch (status) {
    case 'complete': return <CheckCircle2 size={16} color={color} />;
    case 'running':  return <Clock size={16} color={color} />;
    case 'failed':   return <XCircle size={16} color={color} />;
    case 'skipped':  return <AlertTriangle size={16} color={color} />;
    default:         return <Clock size={16} color={color} />;
  }
}

function PhaseItem({ phase, index, isExpanded, onToggle, onRestart, isLast }) {
  const Icon = PHASE_ICONS[phase.phaseName] || Boxes;
  const statusColor = STATUS_COLORS[phase.status] || STATUS_COLORS.pending;

  return (
    <Box>
      {/* Phase Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1.5,
          bgcolor: '#161b22',
          borderRadius: 1,
          border: `1px solid ${statusColor}40`,
          cursor: 'pointer',
          '&:hover': { bgcolor: '#1c2128' },
        }}
        onClick={onToggle}
      >
        {/* Timeline dot */}
        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          mr: 1,
        }}>
          <Box sx={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            bgcolor: statusColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Icon size={14} color="white" />
          </Box>
          {!isLast && (
            <Box sx={{ width: 2, height: 20, bgcolor: '#30363d', mt: 0.5 }} />
          )}
        </Box>

        {/* Phase info */}
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ color: '#e6edf3', fontWeight: 500 }}>
              Phase {index}: {formatPhaseName(phase.phaseName)}
            </Typography>
            <StatusIcon status={phase.status} />
          </Box>

          <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
            {phase.durationMs > 0 && (
              <Chip
                label={formatDuration(phase.durationMs)}
                size="small"
                sx={{ bgcolor: '#21262d', color: '#8b949e', height: 20, fontSize: 11 }}
              />
            )}
            {phase.itemsProcessed > 0 && (
              <Chip
                label={`${phase.itemsProcessed} items`}
                size="small"
                sx={{ bgcolor: '#21262d', color: '#8b949e', height: 20, fontSize: 11 }}
              />
            )}
            {phase.tokensUsed > 0 && (
              <Chip
                label={`${phase.tokensUsed} tokens`}
                size="small"
                sx={{ bgcolor: '#21262d', color: '#8b949e', height: 20, fontSize: 11 }}
              />
            )}
          </Box>
        </Box>

        {/* Expand/Collapse */}
        <IconButton size="small" sx={{ color: '#8b949e' }}>
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </IconButton>
      </Box>

      {/* Expanded Details */}
      <Collapse in={isExpanded}>
        <Box sx={{
          ml: 5,
          mt: 1,
          p: 2,
          bgcolor: '#0d1117',
          borderRadius: 1,
          border: '1px solid #30363d',
        }}>
          {/* Steps */}
          {phase.steps && phase.steps.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ color: '#8b949e', mb: 1 }}>
                Steps ({phase.steps.length})
              </Typography>
              {phase.steps.slice(0, 5).map((step, i) => (
                <Box key={i} sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  py: 0.5,
                  borderBottom: '1px solid #21262d',
                }}>
                  <Chip
                    label={step.stepType}
                    size="small"
                    sx={{
                      bgcolor: step.stepType === 'llm_call' ? '#1f6feb' : '#30363d',
                      color: 'white',
                      height: 18,
                      fontSize: 10,
                    }}
                  />
                  <Typography sx={{ color: '#8b949e', fontSize: 12, flex: 1 }}>
                    {step.toolName || step.outputSummary?.substring(0, 50) || '...'}
                  </Typography>
                  {step.durationMs > 0 && (
                    <Typography sx={{ color: '#6e7681', fontSize: 11 }}>
                      {step.durationMs}ms
                    </Typography>
                  )}
                </Box>
              ))}
              {phase.steps.length > 5 && (
                <Typography sx={{ color: '#6e7681', fontSize: 11, mt: 1 }}>
                  +{phase.steps.length - 5} more steps
                </Typography>
              )}
            </Box>
          )}

          {/* Metrics */}
          {phase.metrics && Object.keys(phase.metrics).length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ color: '#8b949e', mb: 1 }}>
                Metrics
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {Object.entries(phase.metrics).map(([key, value]) => (
                  <Chip
                    key={key}
                    label={`${key}: ${value}`}
                    size="small"
                    sx={{ bgcolor: '#21262d', color: '#e6edf3', height: 24 }}
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* Error */}
          {phase.errorMessage && (
            <Box sx={{
              p: 1,
              bgcolor: '#da363320',
              borderRadius: 1,
              border: '1px solid #da3633',
              mb: 2,
            }}>
              <Typography sx={{ color: '#f85149', fontSize: 12 }}>
                {phase.errorMessage}
              </Typography>
            </Box>
          )}

          {/* Restart button */}
          {phase.status === 'complete' && onRestart && (
            <Button
              size="small"
              startIcon={<RefreshCw size={14} />}
              onClick={() => onRestart(phase.phaseName)}
              sx={{ color: '#58a6ff' }}
            >
              Restart this phase
            </Button>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

export default function ProcessLog({ phases, onRestartPhase }) {
  const [expandedPhases, setExpandedPhases] = useState(new Set());

  const togglePhase = (phaseId) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(phaseId)) {
        next.delete(phaseId);
      } else {
        next.add(phaseId);
      }
      return next;
    });
  };

  if (!phases || phases.length === 0) {
    return <Typography color="#8b949e">No process data available</Typography>;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {phases.map((phase, index) => (
        <PhaseItem
          key={phase.id || index}
          phase={phase}
          index={phase.phaseNumber ?? index}
          isExpanded={expandedPhases.has(phase.id || phase.phaseName)}
          onToggle={() => togglePhase(phase.id || phase.phaseName)}
          onRestart={onRestartPhase}
          isLast={index === phases.length - 1}
        />
      ))}
    </Box>
  );
}
