/**
 * PhaseRestartDialog
 *
 * Dialog for restarting extraction phases.
 * Shows dependency graph, warns about downstream invalidation.
 */

import React, { useState, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Box, Checkbox, FormControlLabel,
  Alert, Chip, Divider, CircularProgress,
} from '@mui/material';
import {
  AlertTriangle, RefreshCw, ArrowRight,
  XCircle, Info,
} from 'lucide-react';

// Phase dependency graph (matches backend phase-graph.js)
const PHASE_DEPENDENCIES = {
  META_CONSULTATION:      [],
  RECONNAISSANCE:         ['META_CONSULTATION'],
  MASTER_DATA:            ['RECONNAISSANCE'],
  ENTITY_DISCOVERY:       ['MASTER_DATA'],
  RELATIONSHIP_INFERENCE: ['ENTITY_DISCOVERY'],
  TRANSACTION_ANALYSIS:   ['MASTER_DATA'],
  BUSINESS_LOGIC:         ['RECONNAISSANCE'],
  CROSS_VALIDATION:       ['ENTITY_DISCOVERY', 'RELATIONSHIP_INFERENCE', 'TRANSACTION_ANALYSIS', 'BUSINESS_LOGIC'],
  GRAPH_SYNTHESIS:        ['CROSS_VALIDATION'],
};

const PHASE_LABELS = {
  META_CONSULTATION:      'Meta Consultation',
  RECONNAISSANCE:         'Structure Discovery',
  MASTER_DATA:            'Master Data',
  ENTITY_DISCOVERY:       'Entity Discovery',
  RELATIONSHIP_INFERENCE: 'Relationships',
  TRANSACTION_ANALYSIS:   'Transactions',
  BUSINESS_LOGIC:         'Business Logic',
  CROSS_VALIDATION:       'Validation',
  GRAPH_SYNTHESIS:        'Graph Generation',
};

const PHASE_ORDER = Object.keys(PHASE_DEPENDENCIES);

function getInvalidatedPhases(phaseName) {
  const invalidated = [];
  const checkDependents = (phase) => {
    for (const [name, deps] of Object.entries(PHASE_DEPENDENCIES)) {
      if (deps.includes(phase) && !invalidated.includes(name)) {
        invalidated.push(name);
        checkDependents(name);
      }
    }
  };
  checkDependents(phaseName);
  return invalidated.sort((a, b) => PHASE_ORDER.indexOf(a) - PHASE_ORDER.indexOf(b));
}

function estimateMinutes(phases) {
  const estimates = {
    META_CONSULTATION: 0.5, RECONNAISSANCE: 1, MASTER_DATA: 2,
    ENTITY_DISCOVERY: 3, RELATIONSHIP_INFERENCE: 1, TRANSACTION_ANALYSIS: 2,
    BUSINESS_LOGIC: 3, CROSS_VALIDATION: 1, GRAPH_SYNTHESIS: 0.5,
  };
  return phases.reduce((sum, p) => sum + (estimates[p] || 1), 0);
}

export default function PhaseRestartDialog({
  open,
  onClose,
  phaseName,
  completedPhases,
  onConfirm,
}) {
  const [includeDownstream, setIncludeDownstream] = useState(true);
  const [isRestarting, setIsRestarting] = useState(false);

  const invalidatedPhases = useMemo(() => {
    return phaseName ? getInvalidatedPhases(phaseName) : [];
  }, [phaseName]);

  const phasesToRerun = useMemo(() => {
    if (!phaseName) return [];
    const toRerun = [phaseName];
    if (includeDownstream) {
      for (const phase of invalidatedPhases) {
        if (completedPhases?.includes(phase)) {
          toRerun.push(phase);
        }
      }
    }
    return toRerun.sort((a, b) => PHASE_ORDER.indexOf(a) - PHASE_ORDER.indexOf(b));
  }, [phaseName, includeDownstream, invalidatedPhases, completedPhases]);

  const canRestart = useMemo(() => {
    if (!phaseName) return false;
    const deps = PHASE_DEPENDENCIES[phaseName] || [];
    return deps.every(dep => completedPhases?.includes(dep));
  }, [phaseName, completedPhases]);

  const handleConfirm = async () => {
    setIsRestarting(true);
    try {
      await onConfirm(phasesToRerun);
      onClose();
    } catch (error) {
      console.error('Restart failed:', error);
    } finally {
      setIsRestarting(false);
    }
  };

  if (!phaseName) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { bgcolor: '#161b22', border: '1px solid #30363d', color: '#e6edf3' },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid #30363d' }}>
        <RefreshCw size={20} color="#f0883e" />
        Restart Phase: {PHASE_LABELS[phaseName] || phaseName}
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        {/* Cannot restart warning */}
        {!canRestart && (
          <Alert
            severity="error"
            icon={<XCircle size={20} />}
            sx={{ mb: 2, bgcolor: '#da363320', color: '#f85149', '& .MuiAlert-icon': { color: '#f85149' } }}
          >
            Cannot restart — required upstream phases not complete:
            <Box sx={{ mt: 1 }}>
              {(PHASE_DEPENDENCIES[phaseName] || [])
                .filter(dep => !completedPhases?.includes(dep))
                .map(dep => (
                  <Chip key={dep} label={PHASE_LABELS[dep] || dep} size="small" sx={{ mr: 0.5, bgcolor: '#da3633', color: 'white' }} />
                ))}
            </Box>
          </Alert>
        )}

        {canRestart && (
          <>
            <Alert
              severity="info"
              icon={<Info size={20} />}
              sx={{ mb: 2, bgcolor: '#1f6feb20', color: '#58a6ff', '& .MuiAlert-icon': { color: '#58a6ff' } }}
            >
              Previous results for this phase will be replaced.
            </Alert>

            {/* Downstream warning */}
            {invalidatedPhases.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ color: '#f0883e', mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <AlertTriangle size={16} />
                  Downstream phases will be invalidated:
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {invalidatedPhases.map(phase => (
                    <Chip
                      key={phase}
                      label={PHASE_LABELS[phase] || phase}
                      size="small"
                      sx={{
                        bgcolor: completedPhases?.includes(phase) ? '#9e6a0320' : '#21262d',
                        color: completedPhases?.includes(phase) ? '#f0883e' : '#8b949e',
                        border: '1px solid',
                        borderColor: completedPhases?.includes(phase) ? '#9e6a03' : '#30363d',
                      }}
                    />
                  ))}
                </Box>

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={includeDownstream}
                      onChange={(e) => setIncludeDownstream(e.target.checked)}
                      sx={{ color: '#8b949e', '&.Mui-checked': { color: '#58a6ff' } }}
                    />
                  }
                  label={<Typography sx={{ color: '#8b949e', fontSize: 13 }}>Also re-run downstream phases</Typography>}
                  sx={{ mt: 1 }}
                />
              </Box>
            )}

            <Divider sx={{ borderColor: '#30363d', my: 2 }} />

            {/* Summary */}
            <Typography variant="subtitle2" sx={{ color: '#e6edf3', mb: 1 }}>
              Phases to re-run:
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
              {phasesToRerun.map((phase, index) => (
                <React.Fragment key={phase}>
                  <Chip
                    label={PHASE_LABELS[phase] || phase}
                    size="small"
                    icon={<RefreshCw size={12} />}
                    sx={{ bgcolor: '#238636', color: 'white', '& .MuiChip-icon': { color: 'white' } }}
                  />
                  {index < phasesToRerun.length - 1 && <ArrowRight size={14} color="#8b949e" />}
                </React.Fragment>
              ))}
            </Box>

            <Typography sx={{ color: '#8b949e', fontSize: 13, mt: 2 }}>
              Estimated time: ~{estimateMinutes(phasesToRerun)} minutes
            </Typography>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ borderTop: '1px solid #30363d', px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ color: '#8b949e' }}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={!canRestart || isRestarting}
          startIcon={isRestarting ? <CircularProgress size={16} /> : <RefreshCw size={16} />}
          sx={{ bgcolor: '#f0883e', '&:hover': { bgcolor: '#d47616' }, '&:disabled': { bgcolor: '#21262d' } }}
        >
          {isRestarting ? 'Restarting...' : `Restart ${phasesToRerun.length} phase${phasesToRerun.length > 1 ? 's' : ''}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
