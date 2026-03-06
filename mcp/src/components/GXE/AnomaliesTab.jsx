/**
 * AnomaliesTab
 *
 * Shows extraction anomalies with option to create iNeed tasks.
 */

import React, { useState, useCallback } from 'react';
import {
  Box, Typography, Chip, Button, IconButton,
  Collapse, Alert, CircularProgress, Tooltip,
  Checkbox,
} from '@mui/material';
import {
  AlertTriangle, ChevronDown, ChevronRight,
  ClipboardList, CheckCircle2,
  AlertCircle, FileWarning, Database, Code,
} from 'lucide-react';
import { anomalyTasksService } from '../../services/anomalyTasks.service';

const ANOMALY_ICONS = {
  ORPHAN_RECORDS: Database,
  MISSING_FK: AlertCircle,
  DATA_INCONSISTENCY: FileWarning,
  UNEXPLAINED_TABLE: Database,
  COMPLEX_PROCEDURE: Code,
  LOW_COVERAGE: AlertTriangle,
};

const SEVERITY_COLORS = {
  high:   { bg: '#da363320', border: '#da3633', text: '#f85149' },
  medium: { bg: '#9e6a0320', border: '#9e6a03', text: '#f0883e' },
  low:    { bg: '#30363d',   border: '#484f58', text: '#8b949e' },
};

export default function AnomaliesTab({ anomalies, sessionId, onTaskCreated }) {
  const [expanded, setExpanded] = useState(new Set());
  const [selected, setSelected] = useState(new Set());
  const [creating, setCreating] = useState(new Set());
  const [results, setResults] = useState({});

  const toggleExpand = (id) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleSelect = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const selectAll = () => {
    const actionable = (anomalies || []).filter(a => !a.hasTask && a.severity !== 'low');
    setSelected(new Set(actionable.map(a => a.id)));
  };

  const handleCreateTask = useCallback(async (anomaly) => {
    setCreating(prev => new Set(prev).add(anomaly.id));
    try {
      const result = await anomalyTasksService.createTask(sessionId, anomaly);
      setResults(prev => ({ ...prev, [anomaly.id]: { success: true, taskId: result.taskId } }));
      onTaskCreated?.(anomaly.id, result.taskId);
    } catch (error) {
      setResults(prev => ({ ...prev, [anomaly.id]: { success: false, error: error.message } }));
    } finally {
      setCreating(prev => { const n = new Set(prev); n.delete(anomaly.id); return n; });
    }
  }, [sessionId, onTaskCreated]);

  const handleCreateBatch = useCallback(async () => {
    if (selected.size === 0) return;
    const selectedAnomalies = (anomalies || []).filter(a => selected.has(a.id));
    setCreating(new Set(selectedAnomalies.map(a => a.id)));

    try {
      const result = await anomalyTasksService.createBatchTasks(sessionId, selectedAnomalies);
      const newResults = {};
      (result.results?.created || []).forEach(c => { newResults[c.anomalyId] = { success: true }; });
      (result.results?.failed || []).forEach(f => { newResults[f.anomalyId] = { success: false, error: f.error }; });
      setResults(prev => ({ ...prev, ...newResults }));
      setSelected(new Set());
    } catch (error) {
      console.error('Batch creation failed:', error);
    } finally {
      setCreating(new Set());
    }
  }, [sessionId, anomalies, selected]);

  if (!anomalies || anomalies.length === 0) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
        <CheckCircle2 size={48} color="#238636" />
        <Typography sx={{ color: '#238636', mt: 2 }}>No anomalies detected!</Typography>
        <Typography sx={{ color: '#8b949e', fontSize: 13, mt: 1 }}>
          The extraction completed with full data consistency.
        </Typography>
      </Box>
    );
  }

  const criticalCount = anomalies.filter(a => a.severity === 'high').length;
  const actionableCount = anomalies.filter(a => !a.hasTask && a.severity !== 'low').length;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, pb: 2, borderBottom: '1px solid #30363d' }}>
        <Box>
          <Typography variant="subtitle1" sx={{ color: '#e6edf3' }}>
            {anomalies.length} Anomalies Detected
          </Typography>
          <Typography sx={{ color: '#8b949e', fontSize: 12 }}>
            {criticalCount} critical, {actionableCount} actionable
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" onClick={selectAll} sx={{ color: '#8b949e' }}>Select All</Button>
          <Button
            variant="contained"
            size="small"
            startIcon={creating.size > 0 ? <CircularProgress size={14} /> : <ClipboardList size={14} />}
            onClick={handleCreateBatch}
            disabled={selected.size === 0 || creating.size > 0}
            sx={{ bgcolor: '#238636', '&:hover': { bgcolor: '#2ea043' }, '&:disabled': { bgcolor: '#21262d' } }}
          >
            {creating.size > 0 ? `Creating ${creating.size}...` : `Create ${selected.size} Task${selected.size !== 1 ? 's' : ''}`}
          </Button>
        </Box>
      </Box>

      {/* Anomaly list */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {anomalies.map(anomaly => {
          const Icon = ANOMALY_ICONS[anomaly.type] || AlertTriangle;
          const colors = SEVERITY_COLORS[anomaly.severity] || SEVERITY_COLORS.medium;
          const hasTask = anomaly.hasTask || results[anomaly.id]?.success;
          const isExp = expanded.has(anomaly.id);

          return (
            <Box key={anomaly.id} sx={{ bgcolor: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 1, overflow: 'hidden' }}>
              <Box
                sx={{ display: 'flex', alignItems: 'center', p: 1.5, cursor: 'pointer', '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}
                onClick={() => toggleExpand(anomaly.id)}
              >
                {!hasTask && (
                  <Checkbox
                    checked={selected.has(anomaly.id)}
                    onChange={() => toggleSelect(anomaly.id)}
                    onClick={(e) => e.stopPropagation()}
                    size="small"
                    sx={{ p: 0.5, mr: 1, color: '#8b949e', '&.Mui-checked': { color: '#58a6ff' } }}
                  />
                )}
                <Box sx={{ width: 32, height: 32, borderRadius: 1, bgcolor: colors.border, display: 'flex', alignItems: 'center', justifyContent: 'center', mr: 1.5 }}>
                  <Icon size={16} color="white" />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ color: colors.text, fontWeight: 500 }}>{(anomaly.type || '').replace(/_/g, ' ')}</Typography>
                    <Chip label={anomaly.severity} size="small" sx={{ height: 18, fontSize: 10, bgcolor: colors.border, color: 'white' }} />
                    {hasTask && <Chip icon={<CheckCircle2 size={12} />} label="Task Created" size="small" sx={{ height: 18, fontSize: 10, bgcolor: '#238636', color: 'white', '& .MuiChip-icon': { color: 'white' } }} />}
                  </Box>
                  <Typography sx={{ color: '#8b949e', fontSize: 12 }}>
                    {anomaly.description?.substring(0, 100) || anomaly.table || 'No details'}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {!hasTask && (
                    <Tooltip title="Create iNeed Task">
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleCreateTask(anomaly); }} disabled={creating.has(anomaly.id)} sx={{ color: '#58a6ff' }}>
                        {creating.has(anomaly.id) ? <CircularProgress size={16} /> : <ClipboardList size={16} />}
                      </IconButton>
                    </Tooltip>
                  )}
                  <IconButton size="small" sx={{ color: '#8b949e' }}>
                    {isExp ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </IconButton>
                </Box>
              </Box>

              <Collapse in={isExp}>
                <Box sx={{ p: 2, pt: 0, borderTop: `1px solid ${colors.border}`, bgcolor: 'rgba(0,0,0,0.2)' }}>
                  {anomaly.affectedTables && (
                    <Box sx={{ mb: 1.5 }}>
                      <Typography sx={{ color: '#8b949e', fontSize: 11, mb: 0.5 }}>Affected Tables</Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {anomaly.affectedTables.map(t => <Chip key={t} label={t} size="small" sx={{ bgcolor: '#21262d', color: '#e6edf3', height: 20 }} />)}
                      </Box>
                    </Box>
                  )}
                  {anomaly.count != null && <Typography sx={{ color: '#8b949e', fontSize: 12 }}>Records affected: {anomaly.count}</Typography>}
                  {results[anomaly.id]?.error && <Alert severity="error" sx={{ mt: 1, py: 0.5 }}>{results[anomaly.id].error}</Alert>}
                  {results[anomaly.id]?.success && <Alert severity="success" sx={{ mt: 1, py: 0.5 }}>Task created successfully</Alert>}
                </Box>
              </Collapse>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
