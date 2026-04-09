/**
 * ExecutionTab — Execution record, decisions, and impact assessment
 */
import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Chip, Stack,
  CircularProgress, Alert, Accordion, AccordionSummary, AccordionDetails
} from '@mui/material';
import { ExpandMore, PlayArrow, CheckCircle, Error as ErrorIcon, Warning } from '@mui/icons-material';
import api from '../../../services/api';

const STATUS_CONFIG = {
  IN_PROGRESS: { color: 'info', icon: <PlayArrow fontSize="small" /> },
  COMPLETED: { color: 'success', icon: <CheckCircle fontSize="small" /> },
  PARTIAL: { color: 'warning', icon: <Warning fontSize="small" /> },
  FAILED: { color: 'error', icon: <ErrorIcon fontSize="small" /> }
};

const CONFIDENCE_COLORS = { HIGH: 'success', MEDIUM: 'warning', LOW: 'error' };

function DecisionCard({ decision }) {
  let alternatives = decision.alternativesConsidered;
  if (typeof alternatives === 'string') {
    try { alternatives = JSON.parse(alternatives); } catch { alternatives = []; }
  }

  return (
    <Card variant="outlined" sx={{ mb: 1 }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
          <Typography variant="body2" fontWeight={600}>{decision.decision}</Typography>
          <Chip
            label={decision.confidenceLevel}
            size="small"
            color={CONFIDENCE_COLORS[decision.confidenceLevel] || 'default'}
            variant="outlined"
          />
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          <b>Rationale:</b> {decision.rationale}
        </Typography>
        {alternatives?.length > 0 && (
          <Accordion disableGutters elevation={0} sx={{ bgcolor: 'transparent', '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMore />} sx={{ p: 0, minHeight: 'auto' }}>
              <Typography variant="caption" color="text.secondary">
                {alternatives.length} alternative(s) considered
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0, pt: 0.5 }}>
              {alternatives.map((alt, i) => (
                <Box key={i} sx={{ mb: 0.5, pl: 1, borderLeft: '2px solid', borderColor: 'error.light' }}>
                  <Typography variant="caption" fontWeight={600}>{alt.option || alt}</Typography>
                  {alt.rejectionReason && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      Rejected: {alt.rejectionReason}
                    </Typography>
                  )}
                </Box>
              ))}
            </AccordionDetails>
          </Accordion>
        )}
        <Typography variant="caption" color="text.disabled">
          {new Date(decision.decidedAt).toLocaleString()} by {decision.decidedBy}
        </Typography>
      </CardContent>
    </Card>
  );
}

function ImpactCard({ impact }) {
  const riskColors = { HIGH: 'error', MEDIUM: 'warning', LOW: 'success' };
  let direct = impact.directImpacts;
  let indirect = impact.indirectImpacts;
  let mitigation = impact.mitigationSteps;
  if (typeof direct === 'string') try { direct = JSON.parse(direct); } catch { direct = []; }
  if (typeof indirect === 'string') try { indirect = JSON.parse(indirect); } catch { indirect = []; }
  if (typeof mitigation === 'string') try { mitigation = JSON.parse(mitigation); } catch { mitigation = []; }

  return (
    <Card variant="outlined" sx={{ mb: 1 }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
          <Typography variant="body2" fontWeight={600}>Impact Assessment</Typography>
          <Chip label={`Risk: ${impact.overallRisk}`} size="small" color={riskColors[impact.overallRisk] || 'default'} />
        </Stack>
        {direct?.length > 0 && (
          <Box sx={{ mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">Direct impacts:</Typography>
            {direct.map((d, i) => <Typography key={i} variant="caption" display="block" sx={{ pl: 1 }}>- {typeof d === 'string' ? d : JSON.stringify(d)}</Typography>)}
          </Box>
        )}
        {mitigation?.length > 0 && (
          <Box>
            <Typography variant="caption" color="text.secondary">Mitigation:</Typography>
            {mitigation.map((m, i) => <Typography key={i} variant="caption" display="block" sx={{ pl: 1 }}>- {typeof m === 'string' ? m : JSON.stringify(m)}</Typography>)}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

export default function ExecutionTab({ backlogId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!backlogId) return;
    setLoading(true);
    setError(null);
    api.get(`/backlog/items/${backlogId}/execution`)
      .then(res => setData(res.data?.data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [backlogId]);

  if (loading) return <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress size={24} /></Box>;
  if (error) return <Alert severity="error" sx={{ m: 2 }}>Failed to load execution: {error}</Alert>;

  if (!data?.execution) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <PlayArrow sx={{ fontSize: 48, opacity: 0.3 }} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No execution record yet</Typography>
        <Typography variant="caption" color="text.disabled">Execution tracking starts when work begins on this task</Typography>
      </Box>
    );
  }

  const { execution, decisions = [], impacts = [] } = data;
  const statusCfg = STATUS_CONFIG[execution.status] || STATUS_CONFIG.IN_PROGRESS;

  return (
    <Box sx={{ p: 2 }}>
      {/* Execution header */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={1}>
            {statusCfg.icon}
            <Typography variant="subtitle1">Execution</Typography>
            <Chip label={execution.status} size="small" color={statusCfg.color} />
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block">
            Started: {new Date(execution.startedAt).toLocaleString()} by {execution.executedBy}
          </Typography>
          {execution.completedAt && (
            <Typography variant="caption" color="text.secondary" display="block">
              Completed: {new Date(execution.completedAt).toLocaleString()}
            </Typography>
          )}
          {execution.summary && (
            <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Typography variant="body2">{execution.summary}</Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Decisions */}
      {decisions.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Decisions ({decisions.length})
          </Typography>
          {decisions.map((d, i) => <DecisionCard key={d.id || i} decision={d} />)}
        </Box>
      )}

      {/* Impacts */}
      {impacts.length > 0 && (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Impact Assessments</Typography>
          {impacts.map((imp, i) => <ImpactCard key={imp.id || i} impact={imp} />)}
        </Box>
      )}
    </Box>
  );
}
