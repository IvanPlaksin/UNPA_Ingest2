/**
 * ToolDialog — full-screen dialog for running investigation primitives.
 *
 * Flow:
 *   1. User fills in parameters
 *   2. Clicks "Run" → POST /sessions/:id/run-tool (saves PROPOSED artifact)
 *   3. Result preview is shown
 *   4a. "Add to Case" → POST /artifacts/:id/commit (PROPOSED → COMMITTED + version cut)
 *   4b. "Cancel" → DELETE /artifacts/:id (discard PROPOSED)
 *
 * Supported primitives: LOCATE, CONNECT, EXPAND, MATRIX, STRUCTURE, TIMELINE, RESOLVE, SYNTHESIZE
 */
import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Stack, Typography, Button, TextField, Divider,
  Chip, CircularProgress, Alert, Slider, FormControl,
  InputLabel, Select, MenuItem, IconButton,
} from '@mui/material';
import {
  Search, Link2, Network, BookOpen, Braces, Cpu, Clock,
  ScanLine, FileText, X, Play, CheckCircle, StickyNote, Zap,
} from 'lucide-react';
import { ArtifactRenderer } from './renderers';
import { EntityAutocomplete, EntityMultiAutocomplete } from './EntityAutocomplete';

// ─── Primitive colour / icon map ──────────────────────────────────────────────

const PRIMITIVE_META = {
  LOCATE:    { icon: Search,    color: '#3b82f6', label: 'Locate' },
  CONNECT:   { icon: Link2,     color: '#8b5cf6', label: 'Connect' },
  EXPAND:    { icon: Network,   color: '#06b6d4', label: 'Expand' },
  PROFILE:   { icon: BookOpen,  color: '#f59e0b', label: 'Profile' },
  MATRIX:    { icon: Braces,    color: '#10b981', label: 'Matrix' },
  STRUCTURE: { icon: Cpu,       color: '#ec4899', label: 'Structure' },
  TIMELINE:  { icon: Clock,     color: '#f97316', label: 'Timeline' },
  RESOLVE:   { icon: ScanLine,  color: '#84cc16', label: 'Resolve' },
  SYNTHESIZE:{ icon: FileText,  color: '#a78bfa', label: 'Synthesize' },
  TEXT:      { icon: StickyNote, color: '#64748b', label: 'Note' },
  IMPACT:    { icon: Zap,       color: '#ef4444', label: 'Impact' },
};

// ─── Parameter forms ──────────────────────────────────────────────────────────

function LocateForm({ vals, set }) {
  return (
    <>
      <TextField label="Query" size="small" fullWidth autoFocus
        value={vals.query || ''} onChange={e => set({ ...vals, query: e.target.value })}
        placeholder="Department name, concept, entity…" />
      <TextField label="Entity type (optional)" size="small" fullWidth
        value={vals.type || ''} onChange={e => set({ ...vals, type: e.target.value })}
        placeholder="ORGANIZATION, PERSON, CONCEPT…" />
      <TextField label="Namespace (optional)" size="small" fullWidth
        value={vals.namespace || ''} onChange={e => set({ ...vals, namespace: e.target.value })}
        placeholder="DEFAULT" />
    </>
  );
}
function locateValid(v) { return !!v.query?.trim(); }
function locateParams(v) { return { query: v.query, type: v.type || null, namespace: v.namespace || null, limit: 20 }; }

function ConnectForm({ vals, set }) {
  return (
    <>
      <EntityAutocomplete label="From entity" autoFocus
        value={vals.fromEntity || null}
        onChange={entity => set({ ...vals, fromEntity: entity })}
        placeholder="Search entity A…" />
      <EntityAutocomplete label="To entity"
        value={vals.toEntity || null}
        onChange={entity => set({ ...vals, toEntity: entity })}
        placeholder="Search entity B…" />
    </>
  );
}
function connectValid(v) { return !!v.fromEntity?.id && !!v.toEntity?.id; }
function connectParams(v) { return { fromEntityId: v.fromEntity.id, toEntityId: v.toEntity.id }; }

function ExpandForm({ vals, set }) {
  return (
    <>
      <EntityAutocomplete label="Entity" autoFocus
        value={vals.entity || null}
        onChange={entity => set({ ...vals, entity })}
        placeholder="Search entity…" />
      <FormControl size="small" fullWidth>
        <InputLabel>Depth</InputLabel>
        <Select label="Depth" value={vals.depth || 2} onChange={e => set({ ...vals, depth: e.target.value })}>
          {[1, 2, 3, 4].map(d => <MenuItem key={d} value={d}>{d} hop{d > 1 ? 's' : ''}</MenuItem>)}
        </Select>
      </FormControl>
    </>
  );
}
function expandValid(v) { return !!v.entity?.id; }
function expandParams(v) { return { entityId: v.entity.id, depth: v.depth || 2 }; }

function MatrixForm({ vals, set }) {
  return (
    <>
      <EntityMultiAutocomplete label="Row entities" autoFocus
        value={vals.rowEntities || []}
        onChange={entities => set({ ...vals, rowEntities: entities })}
        placeholder="Search and add entities…" />
      <EntityMultiAutocomplete label="Column entities (optional — leave empty for symmetric matrix)"
        value={vals.colEntities || []}
        onChange={entities => set({ ...vals, colEntities: entities })} />
      <TextField label="Relation types (optional, comma-separated)" size="small" fullWidth
        value={vals.relTypes || ''} onChange={e => set({ ...vals, relTypes: e.target.value })}
        placeholder="IMPLEMENTS, FUNDS, REFERENCES…" />
    </>
  );
}
function matrixValid(v) { return v.rowEntities?.length > 0; }
function matrixParams(v) {
  const split = s => (s || '').split(',').map(x => x.trim()).filter(Boolean);
  return {
    rowEntityIds: (v.rowEntities || []).map(e => e.id),
    colEntityIds: (v.colEntities || []).length > 0 ? v.colEntities.map(e => e.id) : undefined,
    relTypes: split(v.relTypes),
  };
}

function StructureForm({ vals, set }) {
  return (
    <>
      <EntityMultiAutocomplete label="Seed entities (optional — leave empty to analyze whole namespace)" autoFocus
        value={vals.entities || []}
        onChange={entities => set({ ...vals, entities })}
        placeholder="Search and add entities…" />
      <TextField label="Namespace (optional — restricts analysis)" size="small" fullWidth
        value={vals.namespace || ''} onChange={e => set({ ...vals, namespace: e.target.value })}
        placeholder="DEFAULT" />
      <FormControl size="small" fullWidth>
        <InputLabel>Depth</InputLabel>
        <Select label="Depth" value={vals.depth || 2} onChange={e => set({ ...vals, depth: e.target.value })}>
          {[1, 2, 3].map(d => <MenuItem key={d} value={d}>{d} hop{d > 1 ? 's' : ''}</MenuItem>)}
        </Select>
      </FormControl>
    </>
  );
}
function structureValid(v) { return true; }
function structureParams(v) {
  return {
    entityIds: (v.entities || []).length > 0 ? v.entities.map(e => e.id) : undefined,
    namespace: v.namespace || null,
    depth: v.depth || 2,
  };
}

function TimelineForm({ vals, set }) {
  return (
    <>
      <EntityMultiAutocomplete label="Entities (optional — leave empty for namespace)" autoFocus
        value={vals.entities || []}
        onChange={entities => set({ ...vals, entities })}
        placeholder="Search and add entities…" />
      <TextField label="Namespace (optional)" size="small" fullWidth
        value={vals.namespace || ''} onChange={e => set({ ...vals, namespace: e.target.value })}
        placeholder="DEFAULT" />
      <TextField label="Date property (optional, auto-detect if empty)" size="small" fullWidth
        value={vals.dateProperty || ''} onChange={e => set({ ...vals, dateProperty: e.target.value })}
        placeholder="effectiveDate, adoptionDate, createdAt…" />
    </>
  );
}
function timelineValid(v) { return true; }
function timelineParams(v) {
  return {
    entityIds: (v.entities || []).length > 0 ? v.entities.map(e => e.id) : undefined,
    namespace: v.namespace || null,
    dateProperty: v.dateProperty || null,
    limit: 50,
  };
}

function ResolveForm({ vals, set }) {
  return (
    <>
      <EntityAutocomplete label="Anchor entity" autoFocus
        value={vals.entity || null}
        onChange={entity => set({ ...vals, entity })}
        placeholder="Search entity to resolve duplicates for…" />
      <TextField label="Namespace (optional)" size="small" fullWidth
        value={vals.namespace || ''} onChange={e => set({ ...vals, namespace: e.target.value })}
        placeholder="DEFAULT" />
      <Box>
        <Typography variant="caption" color="text.secondary">
          Similarity threshold: {((vals.threshold ?? 0.6) * 100).toFixed(0)}%
        </Typography>
        <Slider size="small" value={vals.threshold ?? 0.6}
          onChange={(_, v) => set({ ...vals, threshold: v })}
          min={0.3} max={0.99} step={0.05} sx={{ mt: 0.5 }} />
      </Box>
    </>
  );
}
function resolveValid(v) { return !!v.entity?.id; }
function resolveParams(v) { return { entityId: v.entity.id, namespace: v.namespace || null, threshold: v.threshold ?? 0.6 }; }

function SynthesizeForm({ vals, set }) {
  return (
    <>
      <TextField label="Focus (optional)" size="small" fullWidth autoFocus
        value={vals.focus || ''} onChange={e => set({ ...vals, focus: e.target.value })}
        placeholder="Key question or theme to focus on" />
      <FormControl size="small" fullWidth>
        <InputLabel>Format</InputLabel>
        <Select label="Format" value={vals.format || 'summary'} onChange={e => set({ ...vals, format: e.target.value })}>
          <MenuItem value="summary">Summary</MenuItem>
          <MenuItem value="report">Formal report</MenuItem>
          <MenuItem value="bullets">Bullet points</MenuItem>
        </Select>
      </FormControl>
    </>
  );
}
function synthesizeValid(v) { return true; }
function synthesizeParams(v) { return { focus: v.focus || '', format: v.format || 'summary' }; }

function ProfileForm({ vals, set }) {
  return (
    <>
      <EntityAutocomplete label="Entity" autoFocus
        value={vals.entity || null}
        onChange={entity => set({ ...vals, entity })}
        placeholder="Search entity to build dossier for…" />
    </>
  );
}
function profileValid(v) { return !!v.entity?.id; }
function profileParams(v) { return { entityId: v.entity.id }; }

function ImpactForm({ vals, set }) {
  return (
    <>
      <EntityAutocomplete label="Entity" autoFocus
        value={vals.entity || null}
        onChange={entity => set({ ...vals, entity })}
        placeholder="Search entity to analyze impact for…" />
      <FormControl size="small" fullWidth>
        <InputLabel>Max Depth</InputLabel>
        <Select label="Max Depth" value={vals.maxDepth || 5} onChange={e => set({ ...vals, maxDepth: e.target.value })}>
          {[2, 3, 4, 5, 6].map(d => <MenuItem key={d} value={d}>{d} hops</MenuItem>)}
        </Select>
      </FormControl>
    </>
  );
}
function impactValid(v) { return !!v.entity?.id; }
function impactParams(v) { return { entityId: v.entity.id, maxDepth: v.maxDepth || 5, includeStructural: true }; }

function TextForm({ vals, set }) {
  return (
    <>
      <TextField label="Title" size="small" fullWidth autoFocus
        value={vals.title || ''} onChange={e => set({ ...vals, title: e.target.value })}
        placeholder="Note title" />
      <TextField label="Content" size="small" fullWidth multiline rows={8}
        value={vals.body || ''} onChange={e => set({ ...vals, body: e.target.value })}
        placeholder="Write your note here… (Markdown supported)" />
    </>
  );
}
function textValid(v) { return !!v.title?.trim() && !!v.body?.trim(); }
function textParams(v) { return { title: v.title, body: v.body, evidencedBy: [] }; }

// ─── Config table ──────────────────────────────────────────────────────────────

const FORM_CONFIG = {
  LOCATE:    { Form: LocateForm,    isValid: locateValid,    buildParams: locateParams    },
  CONNECT:   { Form: ConnectForm,   isValid: connectValid,   buildParams: connectParams   },
  EXPAND:    { Form: ExpandForm,    isValid: expandValid,    buildParams: expandParams    },
  PROFILE:   { Form: ProfileForm,   isValid: profileValid,   buildParams: profileParams   },
  IMPACT:    { Form: ImpactForm,    isValid: impactValid,    buildParams: impactParams    },
  MATRIX:    { Form: MatrixForm,    isValid: matrixValid,    buildParams: matrixParams    },
  STRUCTURE: { Form: StructureForm, isValid: structureValid, buildParams: structureParams },
  TIMELINE:  { Form: TimelineForm,  isValid: timelineValid,  buildParams: timelineParams  },
  RESOLVE:   { Form: ResolveForm,   isValid: resolveValid,   buildParams: resolveParams   },
  SYNTHESIZE:{ Form: SynthesizeForm,isValid: synthesizeValid,buildParams: synthesizeParams},
  TEXT:      { Form: TextForm,      isValid: textValid,      buildParams: textParams      },
};

// ─── Main dialog ───────────────────────────────────────────────────────────────

/**
 * @param {boolean}  open
 * @param {string}   primitiveType — LOCATE | CONNECT | EXPAND | MATRIX | STRUCTURE | TIMELINE | RESOLVE | SYNTHESIZE
 * @param {string}   sessionId
 * @param {function} onClose({ committed: bool, artifactId?: string })
 * @param {function} onRunTool(sessionId, primitiveType, params) → Promise<{ artifactId, result }>
 * @param {function} onCommit(sessionId, artifactId) → Promise
 * @param {function} onDiscard(artifactId) → Promise
 */
export default function ToolDialog({ open, primitiveType, sessionId, onClose, onRunTool, onCommit, onDiscard }) {
  const [vals, setVals] = useState({});
  const [running, setRunning] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState(null);
  const [proposedArtifactId, setProposedArtifactId] = useState(null);
  const [previewResult, setPreviewResult] = useState(null);

  const meta = PRIMITIVE_META[primitiveType] || PRIMITIVE_META.LOCATE;
  const cfg = FORM_CONFIG[primitiveType];
  const Icon = meta.icon;

  const handleClose = async (committed = false) => {
    if (proposedArtifactId && !committed) {
      // Discard the PROPOSED artifact if user closes without committing
      try { await onDiscard(proposedArtifactId); } catch {}
    }
    setVals({});
    setProposedArtifactId(null);
    setPreviewResult(null);
    setError(null);
    onClose({ committed });
  };

  const handleRun = async () => {
    if (!cfg?.isValid(vals)) return;
    setRunning(true);
    setError(null);
    setPreviewResult(null);
    // Discard previous proposed if re-running
    if (proposedArtifactId) {
      try { await onDiscard(proposedArtifactId); } catch {}
      setProposedArtifactId(null);
    }
    try {
      const params = cfg.buildParams(vals);
      const data = await onRunTool(sessionId, primitiveType, params);
      setProposedArtifactId(data.artifactId);
      setPreviewResult(data.result);
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  const handleCommit = async () => {
    if (!proposedArtifactId) return;
    setCommitting(true);
    setError(null);
    try {
      await onCommit(sessionId, proposedArtifactId);
      handleClose(true);
    } catch (e) {
      setError(e.message);
      setCommitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && cfg?.isValid(vals) && !running && !proposedArtifactId) {
      handleRun();
    }
  };

  if (!cfg) return null;
  const { Form } = cfg;

  return (
    <Dialog open={open} onClose={() => handleClose(false)} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Icon size={18} style={{ color: meta.color }} />
          <Typography variant="subtitle1" fontWeight={700} sx={{ color: meta.color, flex: 1 }}>
            {meta.label} Tool
          </Typography>
          <IconButton size="small" onClick={() => handleClose(false)}><X size={16} /></IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent dividers sx={{ pt: 2 }} onKeyDown={handleKeyDown}>
        <Stack spacing={1.5}>
          <Form vals={vals} set={setVals} />
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mt: 2, fontSize: '0.8rem' }}>{error}</Alert>
        )}

        {previewResult && (
          <Box sx={{ mt: 2 }}>
            <Divider sx={{ mb: 1.5 }}>
              <Chip label="Preview" size="small" color="success" variant="outlined" />
            </Divider>
            <Box sx={{ maxHeight: 320, overflow: 'auto' }}>
              <ArtifactRenderer
                artifact={{ primitiveType, content: previewResult }}
                compact
              />
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 1.5 }}>
        <Button onClick={() => handleClose(false)} color="inherit" size="small">
          Cancel
        </Button>

        {!proposedArtifactId ? (
          <Button
            variant="contained"
            size="small"
            startIcon={running ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : <Play size={14} />}
            onClick={handleRun}
            disabled={!cfg.isValid(vals) || running}
            sx={{ bgcolor: meta.color, '&:hover': { bgcolor: meta.color + 'cc' } }}
          >
            {running ? 'Running…' : 'Run'}
          </Button>
        ) : (
          <>
            <Button
              size="small"
              startIcon={<Play size={14} />}
              onClick={handleRun}
              disabled={running}
              variant="outlined"
            >
              {running ? 'Re-running…' : 'Re-run'}
            </Button>
            <Button
              variant="contained"
              size="small"
              color="success"
              startIcon={committing ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : <CheckCircle size={14} />}
              onClick={handleCommit}
              disabled={committing}
            >
              {committing ? 'Adding…' : 'Add to Case'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
