/**
 * ResolutionTab — Displays structured resolution data for completed tasks.
 * Machine-readable format optimized for AI analysis (CODEX-RULE-BA-061).
 */
import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Chip, Stack,
  CircularProgress, Alert, Divider, LinearProgress
} from '@mui/material';
import {
  CheckCircle, Cancel, Description, BugReport,
  FolderOpen, Lightbulb, Warning, Recommend
} from '@mui/icons-material';
import api from '../../../services/api';

function Section({ icon, title, children }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        {icon}
        <Typography variant="subtitle2">{title}</Typography>
      </Stack>
      {children}
    </Box>
  );
}

function CriteriaProgress({ criteria }) {
  if (!criteria?.length) return null;
  const met = criteria.filter(c => c.met).length;
  const pct = (met / criteria.length) * 100;

  return (
    <Section icon={<CheckCircle fontSize="small" color="success" />} title={`Acceptance Criteria (${met}/${criteria.length})`}>
      <LinearProgress variant="determinate" value={pct} color={pct === 100 ? 'success' : 'primary'} sx={{ mb: 1, height: 6, borderRadius: 1 }} />
      {criteria.map((c, i) => (
        <Stack key={i} direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 0.5 }}>
          {c.met ? <CheckCircle fontSize="small" color="success" /> : <Cancel fontSize="small" color="disabled" />}
          <Box>
            <Typography variant="body2">{c.criterion}</Typography>
            {c.evidence && <Typography variant="caption" color="text.secondary">{c.evidence}</Typography>}
          </Box>
        </Stack>
      ))}
    </Section>
  );
}

export default function ResolutionTab({ backlogId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!backlogId) return;
    setLoading(true);
    setError(null);
    api.get(`/backlog/items/${backlogId}/resolution`)
      .then(res => setData(res.data?.data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [backlogId]);

  if (loading) return <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress size={24} /></Box>;
  if (error) return <Alert severity="error" sx={{ m: 2 }}>Failed to load resolution: {error}</Alert>;

  if (!data) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Description sx={{ fontSize: 48, opacity: 0.3 }} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No resolution yet</Typography>
        <Typography variant="caption" color="text.disabled">
          Resolution is written by the executor agent before submitting for review
        </Typography>
      </Box>
    );
  }

  const testResults = data.testResults || {};

  return (
    <Box sx={{ p: 2 }}>
      {/* Summary */}
      <Section icon={<Description fontSize="small" color="primary" />} title="Summary">
        <Card variant="outlined">
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="body2">{data.summary}</Typography>
          </CardContent>
        </Card>
      </Section>

      {/* Approach */}
      {data.approach && (
        <Section icon={<Lightbulb fontSize="small" sx={{ color: '#f59e0b' }} />} title="Approach">
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>{data.approach}</Typography>
        </Section>
      )}

      <Divider sx={{ my: 1.5 }} />

      {/* Test Results */}
      {(testResults.passed != null || testResults.failed != null) && (
        <Section icon={<BugReport fontSize="small" color="info" />} title="Test Results">
          <Stack direction="row" spacing={1} sx={{ mb: 0.5 }}>
            <Chip label={`Passed: ${testResults.passed ?? 0}`} size="small" color="success" variant="outlined" />
            <Chip label={`Failed: ${testResults.failed ?? 0}`} size="small" color={testResults.failed > 0 ? 'error' : 'default'} variant="outlined" />
            {testResults.skipped > 0 && <Chip label={`Skipped: ${testResults.skipped}`} size="small" variant="outlined" />}
          </Stack>
          {testResults.details && <Typography variant="caption" color="text.secondary">{testResults.details}</Typography>}
        </Section>
      )}

      {/* Acceptance Criteria */}
      <CriteriaProgress criteria={data.acceptanceCriteriaStatus} />

      {/* Files Changed */}
      {(data.filesChanged?.length > 0 || data.filesCreated?.length > 0) && (
        <Section icon={<FolderOpen fontSize="small" />} title="File Changes">
          {data.filesCreated?.length > 0 && (
            <Box sx={{ mb: 0.5 }}>
              <Typography variant="caption" color="success.main">Created ({data.filesCreated.length}):</Typography>
              {data.filesCreated.map((f, i) => (
                <Typography key={i} variant="caption" component="code" display="block" sx={{ pl: 1, fontFamily: 'monospace', color: 'success.dark' }}>+ {f}</Typography>
              ))}
            </Box>
          )}
          {data.filesChanged?.length > 0 && (
            <Box>
              <Typography variant="caption" color="info.main">Modified ({data.filesChanged.length}):</Typography>
              {data.filesChanged.map((f, i) => (
                <Typography key={i} variant="caption" component="code" display="block" sx={{ pl: 1, fontFamily: 'monospace', color: 'info.dark' }}>~ {f}</Typography>
              ))}
            </Box>
          )}
        </Section>
      )}

      {/* Decisions */}
      {data.decisions?.length > 0 && (
        <Section icon={<Lightbulb fontSize="small" sx={{ color: '#f59e0b' }} />} title={`Decisions (${data.decisions.length})`}>
          {data.decisions.map((d, i) => (
            <Card key={i} variant="outlined" sx={{ mb: 0.5 }}>
              <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                <Typography variant="body2" fontWeight={600}>{d.decision}</Typography>
                <Typography variant="caption" color="text.secondary">{d.rationale}</Typography>
              </CardContent>
            </Card>
          ))}
        </Section>
      )}

      {/* Risks */}
      {data.risksIdentified?.length > 0 && (
        <Section icon={<Warning fontSize="small" color="warning" />} title="Risks Identified">
          {data.risksIdentified.map((r, i) => (
            <Card key={i} variant="outlined" sx={{ mb: 0.5, borderLeft: `3px solid ${r.severity === 'HIGH' ? '#d32f2f' : r.severity === 'MEDIUM' ? '#f57c00' : '#4caf50'}` }}>
              <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                <Typography variant="body2" fontWeight={600}>{r.risk}</Typography>
                <Typography variant="caption" color="text.secondary">Mitigation: {r.mitigation}</Typography>
              </CardContent>
            </Card>
          ))}
        </Section>
      )}

      {/* Recommendations */}
      {data.recommendations?.length > 0 && (
        <Section icon={<Recommend fontSize="small" color="info" />} title="Recommendations">
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {data.recommendations.map((r, i) => (
              <Typography component="li" variant="body2" key={i} sx={{ mb: 0.25 }}>{r}</Typography>
            ))}
          </Box>
        </Section>
      )}

      <Divider sx={{ my: 1.5 }} />
      <Typography variant="caption" color="text.disabled">
        Resolved by {data.resolvedBy} at {new Date(data.updatedAt || data.createdAt).toLocaleString()}
      </Typography>
    </Box>
  );
}
