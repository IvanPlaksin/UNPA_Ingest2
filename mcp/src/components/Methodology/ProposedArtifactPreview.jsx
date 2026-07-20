import React, { useState } from 'react';
import {
  Box, Typography, Stack, Chip, Paper, Button, Divider, Alert,
  Accordion, AccordionSummary, AccordionDetails, List, ListItem,
  ListItemText,
} from '@mui/material';
import { ChevronDown, CheckCircle, AlertCircle, Archive, FileSearch } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function EvalBadge({ evaluation }) {
  if (!evaluation) return null;
  return (
    <Chip
      size="small"
      icon={evaluation.passed ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
      label={evaluation.passed ? 'Quality OK' : `${evaluation.violations?.length} violation${evaluation.violations?.length !== 1 ? 's' : ''}`}
      color={evaluation.passed ? 'success' : 'warning'}
    />
  );
}

export default function ProposedArtifactPreview({ result, evaluation, onReset }) {
  const navigate = useNavigate();
  const [showRaw, setShowRaw] = useState(false);

  if (!result) return null;

  const { artifact, methodology, executionId, status } = result;
  const artifactContent = artifact?.content || {};
  const sessionId = artifact?.sessionId;

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <Archive size={20} />
        <Typography variant="h6">Proposed Artifact</Typography>
        <Chip size="small" label={artifact?.status || 'PROPOSED'} color="info" />
        {evaluation && <EvalBadge evaluation={evaluation} />}
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack spacing={0.5}>
          <Stack direction="row" spacing={1}>
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90 }}>Methodology</Typography>
            <Typography variant="caption" fontWeight={600}>{methodology?.name}</Typography>
          </Stack>
          <Stack direction="row" spacing={1}>
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90 }}>Artifact ID</Typography>
            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{artifact?.artifactId}</Typography>
          </Stack>
          <Stack direction="row" spacing={1}>
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90 }}>Session</Typography>
            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{sessionId}</Typography>
          </Stack>
          <Stack direction="row" spacing={1}>
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90 }}>Execution</Typography>
            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{executionId}</Typography>
          </Stack>
        </Stack>
      </Paper>

      {evaluation && (
        <Box sx={{ mb: 2 }}>
          {evaluation.violations?.length > 0 && (
            <Alert severity="warning" sx={{ mb: 1 }}>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Quality violations</Typography>
              <List dense disablePadding>
                {evaluation.violations.map((v, i) => (
                  <ListItem key={i} disablePadding>
                    <ListItemText primary={v} primaryTypographyProps={{ variant: 'caption' }} />
                  </ListItem>
                ))}
              </List>
            </Alert>
          )}
          {evaluation.scores && Object.keys(evaluation.scores).length > 0 && (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {Object.entries(evaluation.scores).map(([k, v]) => (
                <Chip key={k} size="small" label={`${k}: ${typeof v === 'number' ? v.toFixed(2) : v}`} variant="outlined" />
              ))}
            </Stack>
          )}
        </Box>
      )}

      <Accordion variant="outlined">
        <AccordionSummary expandIcon={<ChevronDown size={16} />}>
          <Typography variant="subtitle2">Execution outputs</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box component="pre" sx={{ fontSize: '0.75rem', overflowX: 'auto', m: 0, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(artifactContent.executionResult || {}, null, 2)}
          </Box>
        </AccordionDetails>
      </Accordion>

      <Divider sx={{ my: 2 }} />

      <Stack direction="row" spacing={1.5}>
        {sessionId && (
          <Button
            variant="contained"
            startIcon={<FileSearch size={16} />}
            onClick={() => navigate(`/investigation/${sessionId}`)}
          >
            View in Investigation
          </Button>
        )}
        <Button variant="outlined" onClick={onReset}>
          Run Again
        </Button>
      </Stack>
    </Box>
  );
}
