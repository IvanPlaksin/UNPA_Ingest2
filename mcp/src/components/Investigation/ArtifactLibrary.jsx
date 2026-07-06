/**
 * ArtifactLibrary — right-panel view showing all artifacts in a session.
 *
 * PROPOSED (drafts) are shown at top with Commit / Discard actions.
 * COMMITTED artifacts are shown below — click to select and inspect.
 *
 * Replaces the old artifact list in the Detail tab when in Library mode.
 */
import React, { useEffect } from 'react';
import {
  Box, Stack, Typography, Chip, Button, Divider, Tooltip,
  CircularProgress, Alert, IconButton,
} from '@mui/material';
import {
  Search, Link2, Network, BookOpen, Braces, Cpu, Clock, ScanLine, FileText, Bot, StickyNote,
  CheckCircle, Trash2, Edit3, ChevronRight,
} from 'lucide-react';

// ─── Primitive icon/colour map ────────────────────────────────────────────────

const PRIMITIVE_META = {
  LOCATE:    { icon: Search,    color: '#3b82f6' },
  CONNECT:   { icon: Link2,     color: '#8b5cf6' },
  EXPAND:    { icon: Network,   color: '#06b6d4' },
  PROFILE:   { icon: BookOpen,  color: '#f59e0b' },
  MATRIX:    { icon: Braces,    color: '#10b981' },
  STRUCTURE: { icon: Cpu,       color: '#ec4899' },
  TIMELINE:  { icon: Clock,     color: '#f97316' },
  RESOLVE:   { icon: ScanLine,  color: '#84cc16' },
  SYNTHESIZE:{ icon: FileText,  color: '#a78bfa' },
  TEXT:      { icon: StickyNote, color: '#64748b' },
  FREEFORM:  { icon: Bot,       color: '#94a3b8' },
};

// ─── Single artifact card ─────────────────────────────────────────────────────

function ArtifactCard({ artifact, isDraft, isSelected, onSelect, onPreview, onCommit, onDiscard }) {
  const meta = PRIMITIVE_META[artifact.primitiveType] || PRIMITIVE_META.FREEFORM;
  const Icon = meta.icon;

  const handleClick = (e) => {
    if (e.target.closest('button')) return; // don't intercept button clicks
    onPreview?.();
  };

  return (
    <Box
      onClick={handleClick}
      sx={{
        border: 1,
        borderColor: isSelected ? meta.color : isDraft ? 'warning.light' : 'divider',
        borderRadius: 1.5,
        mb: 0.75,
        overflow: 'hidden',
        opacity: isDraft ? 0.9 : 1,
        bgcolor: isSelected ? `${meta.color}10` : isDraft ? 'action.hover' : 'transparent',
        cursor: 'pointer',
        transition: 'border-color 0.12s, background 0.12s',
        '&:hover': { borderColor: meta.color, bgcolor: `${meta.color}08` },
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, py: 0.75 }}>
        <Icon size={13} style={{ color: meta.color, flexShrink: 0 }} />
        <Typography variant="caption" sx={{ fontWeight: 700, color: meta.color, textTransform: 'uppercase', fontSize: '0.63rem', letterSpacing: 0.5 }}>
          {artifact.primitiveType}
        </Typography>
        {isDraft && <Chip label="Draft" size="small" color="warning" sx={{ height: 14, fontSize: '0.55rem' }} />}
        {artifact.producedBy === 'AI' && <Chip label="AI" size="small" color="secondary" sx={{ height: 14, fontSize: '0.55rem' }} />}
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem' }}>
          {new Date(artifact.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Typography>
        <ChevronRight size={12} style={{ opacity: 0.3 }} />
      </Stack>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', px: 1.5, pb: 0.75, fontSize: '0.68rem', lineHeight: 1.4, overflow: 'hidden', maxHeight: 36 }}
      >
        {_artifactSummary(artifact)}
      </Typography>

      {isDraft && (
        <Stack direction="row" spacing={0.75} sx={{ px: 1.5, pb: 1 }}>
          <Button
            size="small"
            variant="contained"
            color="success"
            startIcon={<CheckCircle size={11} />}
            onClick={(e) => { e.stopPropagation(); onCommit(); }}
            sx={{ fontSize: '0.68rem', height: 24, px: 1 }}
          >
            Commit
          </Button>
          <Tooltip title="Open full preview">
            <Button
              size="small"
              variant="outlined"
              onClick={(e) => { e.stopPropagation(); onPreview?.(); }}
              sx={{ fontSize: '0.65rem', height: 24, px: 0.75 }}
            >
              Preview
            </Button>
          </Tooltip>
          <Tooltip title="Discard draft">
            <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); onDiscard(); }} sx={{ width: 24, height: 24 }}>
              <Trash2 size={11} />
            </IconButton>
          </Tooltip>
        </Stack>
      )}
    </Box>
  );
}

function _artifactSummary(artifact) {
  const c = artifact.content || {};
  switch (artifact.primitiveType) {
    case 'LOCATE':    return `"${c.query || '?'}" — ${c.results?.length || 0} result(s)`;
    case 'CONNECT':   return `${c.paths?.length || 0} path(s)`;
    case 'EXPAND':    return `${c.nodeCount || 0} nodes, depth ${c.depth || '?'}`;
    case 'MATRIX':    return `${c.summary?.totalCells || 0} cells, ${c.summary?.directConnections || 0} direct`;
    case 'STRUCTURE': return `${c.summary?.nodeCount || 0} nodes — most central: ${c.summary?.mostCentral?.name || '—'}`;
    case 'TIMELINE':  return `${c.summary?.eventCount || 0} events${c.span?.earliest ? ` · ${c.span.earliest}` : ''}`;
    case 'RESOLVE':   return `${c.summary?.candidateCount || 0} candidates for "${c.anchor?.name || '?'}"`;
    case 'SYNTHESIZE':return c.narrative?.slice(0, 80) || 'Synthesis';
    case 'TEXT':      return c.title ? `${c.title} · ${c.wordCount || 0} words` : c.body?.slice(0, 80) || 'Note';
    default:          return artifact.artifactId?.slice(0, 12) + '…';
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * @param {string}   sessionId
 * @param {array}    artifacts        — all artifacts (PROPOSED + COMMITTED)
 * @param {string}   selectedArtifactId
 * @param {function} onSelectArtifact
 * @param {function} onPreviewArtifact(artifact)
 * @param {function} onCommit(sessionId, artifactId)
 * @param {function} onDiscard(artifactId)
 * @param {boolean}  loading
 */
export default function ArtifactLibrary({
  sessionId, artifacts, selectedArtifactId, onSelectArtifact, onPreviewArtifact, onCommit, onDiscard, loading,
}) {
  const proposed  = artifacts.filter(a => a.status === 'PROPOSED');
  const committed = artifacts.filter(a => a.status !== 'PROPOSED');

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', overflow: 'auto', p: 1.5 }}>
      {/* Drafts section */}
      {proposed.length > 0 && (
        <>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
            <Typography variant="overline" sx={{ fontSize: '0.62rem', color: 'warning.main' }}>
              Drafts
            </Typography>
            <Chip size="small" label={proposed.length} color="warning" sx={{ height: 14, fontSize: '0.55rem' }} />
          </Stack>
          <Alert severity="info" sx={{ mb: 1, fontSize: '0.72rem', py: 0.25, '& .MuiAlert-message': { fontSize: '0.72rem' } }}>
            Drafts are not yet part of the investigation record. Commit to finalize.
          </Alert>
          {proposed.map(a => (
            <ArtifactCard
              key={a.artifactId}
              artifact={a}
              isDraft
              onPreview={() => onPreviewArtifact?.(a)}
              onCommit={() => onCommit(sessionId, a.artifactId)}
              onDiscard={() => onDiscard(a.artifactId)}
            />
          ))}
          <Divider sx={{ my: 1.5 }} />
        </>
      )}

      {/* Committed section */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
        <Typography variant="overline" sx={{ fontSize: '0.62rem', color: 'text.disabled' }}>
          Artifacts
        </Typography>
        <Chip size="small" label={committed.length} sx={{ height: 14, fontSize: '0.55rem' }} variant="outlined" />
      </Stack>

      {committed.length === 0 && proposed.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4, opacity: 0.4 }}>
          <Typography variant="caption">No artifacts yet. Use toolbar to run a primitive.</Typography>
        </Box>
      )}

      {committed.map(a => (
        <ArtifactCard
          key={a.artifactId}
          artifact={a}
          isDraft={false}
          isSelected={selectedArtifactId === a.artifactId}
          onSelect={() => onSelectArtifact(a.artifactId)}
          onPreview={() => onPreviewArtifact?.(a)}
        />
      ))}
    </Box>
  );
}
