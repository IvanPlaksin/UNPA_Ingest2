/**
 * ResolveRenderer — candidate list with similarity bars for RESOLVE primitive results.
 *
 * Content shape:
 *   anchor:          { entityId, name, type, namespace }
 *   candidates:      [{entityId, name, type, namespace, similarity, matchReasons[]}]
 *   suggestedMerges: [{keepId, keepName, mergeId, mergeName, confidence}]
 *   summary:         { candidateCount, highConfidenceMerges }
 */
import React from 'react';
import {
  Box, Typography, Chip, Stack, LinearProgress, Tooltip,
} from '@mui/material';

function SimilarityBar({ value }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.85 ? 'success' : value >= 0.7 ? 'warning' : 'error';
  return (
    <Box sx={{ minWidth: 80 }}>
      <LinearProgress
        variant="determinate"
        value={pct}
        color={color}
        sx={{ height: 6, borderRadius: 3, mb: 0.25 }}
      />
      <Typography variant="caption" sx={{ fontSize: '0.62rem', color: `${color}.main` }}>
        {pct}%
      </Typography>
    </Box>
  );
}

export default function ResolveRenderer({ content, compact }) {
  if (!content?.anchor) {
    return <Typography color="text.secondary" variant="body2">No resolution data.</Typography>;
  }

  const { anchor, candidates, suggestedMerges, summary } = content;
  const suggestedIds = new Set((suggestedMerges || []).map(m => m.mergeId));
  const displayCandidates = compact ? candidates.slice(0, 5) : candidates;

  return (
    <Box>
      {/* Anchor entity */}
      <Box sx={{ p: 1, mb: 1.5, bgcolor: 'primary.50', borderRadius: 1, border: '1px solid', borderColor: 'primary.200' }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Box>
            <Typography variant="body2" fontWeight={700}>{anchor.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {anchor.type} · {anchor.namespace}
            </Typography>
          </Box>
          <Chip size="small" label="Anchor" color="primary" sx={{ ml: 'auto', height: 18, fontSize: '0.62rem' }} />
        </Stack>
      </Box>

      {/* Summary chips */}
      <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 0.5 }}>
        <Chip size="small" label={`${summary?.candidateCount || 0} candidate(s)`} variant="outlined" />
        {summary?.highConfidenceMerges > 0 && (
          <Chip
            size="small"
            label={`${summary.highConfidenceMerges} suggested merge(s)`}
            color="success"
            variant="outlined"
          />
        )}
      </Stack>

      {candidates.length === 0 && (
        <Typography color="text.secondary" variant="body2">No duplicate candidates found above the similarity threshold.</Typography>
      )}

      {/* Candidate list */}
      {displayCandidates.map(c => (
        <Box
          key={c.entityId}
          sx={{
            mb: 0.75, p: 1, borderRadius: 1, border: '1px solid',
            borderColor: suggestedIds.has(c.entityId) ? 'success.light' : 'divider',
            bgcolor: suggestedIds.has(c.entityId) ? 'success.50' : 'transparent',
          }}
        >
          <Stack direction="row" alignItems="flex-start" spacing={1}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap">
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}
                  title={c.name}
                >
                  {c.name}
                </Typography>
                {suggestedIds.has(c.entityId) && (
                  <Chip label="Suggested merge" size="small" color="success" sx={{ height: 16, fontSize: '0.58rem' }} />
                )}
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {c.type} · {c.namespace}
              </Typography>
              {c.matchReasons?.length > 0 && (
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', fontSize: '0.65rem', mt: 0.25 }}>
                  {c.matchReasons.join(' · ')}
                </Typography>
              )}
            </Box>
            <SimilarityBar value={c.similarity} />
          </Stack>
        </Box>
      ))}

      {compact && candidates.length > 5 && (
        <Typography variant="caption" color="text.secondary">
          +{candidates.length - 5} more candidates
        </Typography>
      )}
    </Box>
  );
}
