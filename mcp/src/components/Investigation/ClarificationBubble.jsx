/**
 * ClarificationBubble — renders inside the chat when the AI returns type='CLARIFICATION'.
 *
 * Handles two issue types:
 *   AMBIGUOUS  — multiple KB candidates; user picks one
 *   NOT_FOUND  — entity not in KB; user can search manually with EntityAutocomplete
 *   MISSING    — required param not extracted; shows info only
 *
 * Each issue has a unique `paramKey` (= param for single entityId, param_N for array entries).
 * Selections are keyed by paramKey so multiple entities within the same array param don't conflict.
 *
 * After all required entities are resolved → "Run" button → calls onRunTool(sessionId, primitiveType, params)
 */
import React, { useState } from 'react';
import {
  Box, Stack, Typography, Button, Chip, CircularProgress,
  Divider, Paper, Alert,
} from '@mui/material';
import { CheckCircle, AlertTriangle, Search, ExternalLink } from 'lucide-react';
import { EntityAutocomplete } from './EntityAutocomplete';

// ─── Single-issue selectors ───────────────────────────────────────────────────

function AmbiguousIssue({ issue, selection, onSelect }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" sx={{ fontSize: '0.7rem', color: 'warning.main', fontWeight: 700, display: 'block', mb: 0.75 }}>
        <AlertTriangle size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
        "{issue.name}" — multiple matches:
      </Typography>
      <Stack spacing={0.5}>
        {(issue.candidates || []).map(c => {
          const selected = selection?.id === c.entityId;
          return (
            <Paper
              key={c.entityId}
              elevation={0}
              onClick={() => onSelect({ id: c.entityId, label: c.name, type: c.type, namespace: c.namespace })}
              sx={{
                px: 1.25, py: 0.6,
                border: 1,
                borderColor: selected ? 'primary.main' : 'divider',
                borderRadius: 1,
                cursor: 'pointer',
                bgcolor: selected ? 'primary.50' : 'background.paper',
                transition: 'all 0.1s',
                '&:hover': { borderColor: 'primary.light', bgcolor: 'action.hover' },
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <Box>
                <Typography variant="body2" sx={{ fontSize: '0.78rem', fontWeight: 500 }}>{c.name}</Typography>
                {(c.type || c.namespace) && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.63rem' }}>
                    {[c.type, c.namespace].filter(Boolean).join(' · ')}
                  </Typography>
                )}
              </Box>
              {selected && <CheckCircle size={14} style={{ color: '#3b82f6', flexShrink: 0 }} />}
            </Paper>
          );
        })}
      </Stack>
    </Box>
  );
}

function NotFoundIssue({ issue, selection, onSelect }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" sx={{ fontSize: '0.7rem', color: 'error.main', fontWeight: 700, display: 'block', mb: 0.75 }}>
        <Search size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
        "{issue.name}" — not found. Search manually:
      </Typography>
      <EntityAutocomplete
        label={`Replace "${issue.name}"`}
        value={selection || null}
        onChange={onSelect}
        placeholder="Search the Knowledge Base…"
        size="small"
      />
      {selection && (
        <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'success.main', mt: 0.25, display: 'block' }}>
          ✓ Resolved to: {selection.label}
        </Typography>
      )}
    </Box>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * @param {object}   msg           — assistant message with type='CLARIFICATION'
 * @param {string}   sessionId
 * @param {function} onRunTool     — (sessionId, primitiveType, params) → Promise<data>
 * @param {function} onAddArtifact — called after successful run to add artifact to store
 * @param {function} [onViewResult] — (artifact) → void — opens artifact preview dialog
 */
export default function ClarificationBubble({ msg, sessionId, onRunTool, onAddArtifact, onViewResult }) {
  const { primitiveType, clarificationIssues = [], clarificationOptions = [], pendingParams = {} } = msg;

  // selections keyed by issue.paramKey (unique per entity, even within array params)
  const [selections, setSelections] = useState({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [doneArtifact, setDoneArtifact] = useState(null);

  // ─── Intent clarification (no primitiveType yet) ────────────────────────
  if (!primitiveType && clarificationOptions.length > 0) {
    return (
      <Box sx={{ mt: 0.5, p: 1, bgcolor: 'action.hover', borderRadius: 1.5, maxWidth: 320 }}>
        <Typography variant="caption" sx={{ fontSize: '0.7rem', color: 'text.secondary', fontWeight: 700, display: 'block', mb: 0.75 }}>
          What would you like to do?
        </Typography>
        <Stack spacing={0.5}>
          {clarificationOptions.map(opt => (
            <Chip
              key={opt}
              label={opt}
              size="small"
              variant="outlined"
              sx={{ fontSize: '0.68rem', cursor: 'default' }}
            />
          ))}
        </Stack>
        <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary', mt: 0.75, display: 'block' }}>
          Rephrase your request to specify.
        </Typography>
      </Box>
    );
  }

  // ─── Entity clarification ───────────────────────────────────────────────
  const entityIssues = clarificationIssues.filter(i => i.error === 'AMBIGUOUS' || i.error === 'NOT_FOUND');
  const missingIssues = clarificationIssues.filter(i => i.error === 'MISSING');

  // Each entity issue must be resolved; use paramKey (or param as fallback) as the state key
  const getKey = (issue) => issue.paramKey || issue.param;
  const allResolved = entityIssues.every(i => !!selections[getKey(i)]);

  const handleSelect = (issue, entity) => {
    setSelections(s => ({ ...s, [getKey(issue)]: entity }));
  };

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    try {
      // Group resolved entities back by param name.
      // Array params (paramKey = 'rowEntityIds_0', 'rowEntityIds_1') → collect into array
      // Scalar params (paramKey = param) → single value
      const paramAccumulator = {};

      entityIssues.forEach(issue => {
        const entity = selections[getKey(issue)];
        if (!entity) return;

        const isArrayEntry = issue.paramIndex !== undefined;
        if (isArrayEntry) {
          if (!paramAccumulator[issue.param]) paramAccumulator[issue.param] = [];
          // Insert at correct index to preserve order
          paramAccumulator[issue.param][issue.paramIndex] = entity.id;
        } else {
          paramAccumulator[issue.param] = entity.id;
        }
      });

      // Clean up sparse arrays (filter undefined slots)
      Object.keys(paramAccumulator).forEach(k => {
        if (Array.isArray(paramAccumulator[k])) {
          paramAccumulator[k] = paramAccumulator[k].filter(Boolean);
        }
      });

      // Merge: pendingParams already has fully-resolved IDs from Phase 2,
      // merge user-resolved IDs on top (array params need concatenation)
      const finalParams = { ...pendingParams };
      Object.entries(paramAccumulator).forEach(([k, v]) => {
        if (Array.isArray(v) && Array.isArray(finalParams[k])) {
          finalParams[k] = [...finalParams[k], ...v];
        } else {
          finalParams[k] = v;
        }
      });

      const data = await onRunTool(sessionId, primitiveType, finalParams);
      if (onAddArtifact && data?.artifact) onAddArtifact(data.artifact);
      setDoneArtifact(data?.artifact || null);
      setDone(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  if (done) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, py: 0.5 }}>
        <CheckCircle size={14} style={{ color: '#22c55e', flexShrink: 0 }} />
        <Typography variant="caption" sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'success.main', flex: 1 }}>
          {primitiveType} executed successfully
        </Typography>
        {doneArtifact && onViewResult && (
          <Button
            size="small"
            variant="outlined"
            endIcon={<ExternalLink size={11} />}
            onClick={() => onViewResult(doneArtifact)}
            sx={{
              fontSize: '0.63rem', py: 0.15, px: 0.8, height: 20, flexShrink: 0,
              borderColor: '#8b5cf666', color: '#8b5cf6',
              '&:hover': { borderColor: '#8b5cf6', bgcolor: '#8b5cf610' },
            }}
          >
            View Result
          </Button>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 0.5, p: 1.25, bgcolor: 'action.hover', borderRadius: 1.5, maxWidth: 400 }}>
      {missingIssues.length > 0 && (
        <Alert severity="info" sx={{ mb: 1, py: 0.25, fontSize: '0.72rem' }}>
          {missingIssues.map(i => i.message).join('; ')}
        </Alert>
      )}

      {entityIssues.map(issue => (
        issue.error === 'AMBIGUOUS'
          ? (
            <AmbiguousIssue
              key={getKey(issue)}
              issue={issue}
              selection={selections[getKey(issue)]}
              onSelect={e => handleSelect(issue, e)}
            />
          ) : (
            <NotFoundIssue
              key={getKey(issue)}
              issue={issue}
              selection={selections[getKey(issue)]}
              onSelect={e => handleSelect(issue, e)}
            />
          )
      ))}

      {error && (
        <Alert severity="error" sx={{ mb: 1, py: 0.25, fontSize: '0.72rem' }}>{error}</Alert>
      )}

      {primitiveType && (
        <>
          <Divider sx={{ my: 1 }} />
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip label={primitiveType} size="small" sx={{ fontSize: '0.65rem' }} />
            {!allResolved && (
              <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary', flex: 1 }}>
                {entityIssues.filter(i => !selections[getKey(i)]).length} entity(ies) pending
              </Typography>
            )}
            <Box sx={{ flex: 1 }} />
            <Button
              size="small"
              variant="contained"
              disabled={!allResolved || running}
              onClick={handleRun}
              startIcon={running ? <CircularProgress size={12} sx={{ color: 'inherit' }} /> : null}
              sx={{ fontSize: '0.72rem', py: 0.25, px: 1.5, minWidth: 80 }}
            >
              {running ? 'Running…' : 'Run'}
            </Button>
          </Stack>
        </>
      )}
    </Box>
  );
}
