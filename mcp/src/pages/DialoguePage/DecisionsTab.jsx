import React, { useState } from 'react';
import {
  Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Chip, Drawer, Typography, FormControl, InputLabel, Select,
  MenuItem, Stack, CircularProgress, IconButton, Slider, Divider,
  LinearProgress, Tooltip, Link,
} from '@mui/material';
import {
  Close, OpenInNew, AccountTree, Code, LinkOutlined,
  CheckCircleOutline, HelpOutline, Cancel, FolderOpen,
} from '@mui/icons-material';
import { useDialogueDecisions, useDecisionDetail } from '../../hooks/useDialogue';
import { useNavigate } from 'react-router-dom';
import ProvenanceChain from '../../components/Dialogue/ProvenanceChain';
import { parseEntitiesFromText, ENTITY_TYPE_COLOR } from '../../components/Dialogue/session-meta';

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_COLORS = {
  architecture: 'primary',
  technology: 'info',
  pattern: 'secondary',
  convention: 'default',
  rejection: 'error',
};

const CONFIDENCE_COLOR = (conf) => {
  if (conf >= 0.8) return 'success';
  if (conf >= 0.5) return 'warning';
  return 'error';
};

const STATUS_ICON = {
  accepted: <CheckCircleOutline fontSize="small" color="success" />,
  proposed: <HelpOutline fontSize="small" color="warning" />,
  rejected: <Cancel fontSize="small" color="error" />,
};

// ── Detail Drawer ─────────────────────────────────────────────────────────────

function DecisionDetailDrawer({ decisionId, onClose }) {
  const { detail, loading } = useDecisionDetail(decisionId);
  const navigate = useNavigate();

  if (!decisionId) return null;

  const d = detail?.decision;
  const provenance = detail?.provenance;
  const crossRefs = detail?.crossRefs;
  const techTags = detail?.techTags || [];

  const parseAlternatives = (alts) => {
    if (!alts) return [];
    try {
      const parsed = typeof alts === 'string' ? JSON.parse(alts) : alts;
      return Array.isArray(parsed) ? parsed : [String(alts)];
    } catch {
      return [String(alts)];
    }
  };

  return (
    <Drawer anchor="right" open={!!decisionId} onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100vw', sm: 520 } } }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* Header */}
        <Box sx={{ p: 2.5, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Typography variant="h6" sx={{ pr: 1, lineHeight: 1.3 }}>
              {d?.title || '…'}
            </Typography>
            <IconButton size="small" onClick={onClose} sx={{ flexShrink: 0 }}>
              <Close fontSize="small" />
            </IconButton>
          </Box>

          {/* Status chips */}
          {d && (
            <Stack direction="row" spacing={0.75} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 0.5 }}>
              <Chip
                label={d.category}
                size="small"
                color={CATEGORY_COLORS[d.category] || 'default'}
              />
              <Chip
                icon={STATUS_ICON[d.status] || STATUS_ICON.proposed}
                label={d.status || 'proposed'}
                size="small"
                variant="outlined"
              />
              <Chip
                label={`${Math.round((d.confidence || 0) * 100)}% confidence`}
                size="small"
                color={CONFIDENCE_COLOR(d.confidence || 0)}
                variant="outlined"
              />
              {d.namespace && (
                <Chip label={d.namespace} size="small" variant="outlined" color="default" />
              )}
            </Stack>
          )}

          {/* Technology tags */}
          {techTags.length > 0 && (
            <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
              {techTags.map(tag => (
                <Chip
                  key={tag}
                  icon={<Code sx={{ fontSize: '0.85rem !important' }} />}
                  label={tag}
                  size="small"
                  variant="outlined"
                  color="info"
                  sx={{ fontSize: '0.7rem' }}
                />
              ))}
            </Stack>
          )}
        </Box>

        {/* Loading */}
        {loading && <LinearProgress sx={{ flexShrink: 0 }} />}

        {/* Body */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 2.5 }}>
          {!d && !loading && (
            <Typography color="text.secondary" variant="body2">Loading…</Typography>
          )}

          {d && (
            <Stack spacing={2.5}>
              {/* Decision */}
              {d.decision && (
                <Section title="Decision">
                  <Typography variant="body2">{d.decision}</Typography>
                </Section>
              )}

              {/* Context */}
              {d.context && (
                <Section title="Context">
                  <Typography variant="body2" color="text.secondary">{d.context}</Typography>
                </Section>
              )}

              {/* Rationale */}
              {d.rationale && (
                <Section title="Rationale">
                  <Typography variant="body2">{d.rationale}</Typography>
                </Section>
              )}

              {/* Alternatives */}
              {d.alternatives && parseAlternatives(d.alternatives).length > 0 && (
                <Section title="Alternatives considered">
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {parseAlternatives(d.alternatives).map((a, i) => (
                      <li key={i}><Typography variant="body2">{a}</Typography></li>
                    ))}
                  </ul>
                </Section>
              )}

              {/* Consequences */}
              {d.consequences && (
                <Section title="Consequences">
                  <Typography variant="body2">{d.consequences}</Typography>
                </Section>
              )}

              <Divider />

              {/* Provenance */}
              <Section title="Provenance" icon={<AccountTree fontSize="small" />}>
                {provenance?.session ? (
                  <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1.5 }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                      <Chip
                        label={provenance.session.platform || 'claude_code'}
                        size="small"
                        color="primary"
                        variant="outlined"
                        sx={{ fontSize: '0.7rem' }}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {provenance.session.startedAt
                          ? new Date(provenance.session.startedAt).toLocaleDateString()
                          : '—'}
                      </Typography>
                      {provenance.session.gitBranch && (
                        <Typography variant="caption" color="text.disabled">
                          {provenance.session.gitBranch}
                        </Typography>
                      )}
                    </Stack>
                    <Typography variant="body2" fontWeight={500} sx={{ mb: 0.5 }}>
                      {provenance.session.title?.slice(0, 80) || 'Untitled session'}
                    </Typography>
                    {provenance.session.projectPath && (
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <FolderOpen sx={{ fontSize: '0.8rem', color: 'text.disabled' }} />
                        <Typography variant="caption" color="text.disabled" sx={{ wordBreak: 'break-all' }}>
                          {provenance.session.projectPath.split(/[\\/]/).slice(-2).join('/')}
                        </Typography>
                      </Stack>
                    )}
                    {provenance.segment && (
                      <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
                        <Typography variant="caption" color="text.secondary">
                          Segment #{(provenance.segment.idx ?? 0) + 1}
                          {provenance.segment.contributionType
                            ? ` · ${provenance.segment.contributionType}`
                            : ''}
                        </Typography>
                        {provenance.segment.summary && (
                          <Typography variant="caption" display="block" color="text.secondary"
                            sx={{ mt: 0.25, fontStyle: 'italic' }}>
                            "{provenance.segment.summary.slice(0, 120)}…"
                          </Typography>
                        )}
                      </Box>
                    )}
                    <Box sx={{ mt: 1 }}>
                      <Link
                        component="button"
                        variant="caption"
                        onClick={() => {
                          onClose();
                          navigate('/dialogue', { state: { openSession: provenance.session.sessionId } });
                        }}
                        sx={{ display: 'flex', alignItems: 'center', gap: 0.4, cursor: 'pointer' }}
                      >
                        <OpenInNew sx={{ fontSize: '0.8rem' }} />
                        Open session in Timeline
                      </Link>
                    </Box>
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    {d.sessionId ? `Session: ${d.sessionId.slice(0, 8)}…` : 'No provenance data'}
                  </Typography>
                )}
              </Section>

              {/* Cross-references */}
              {crossRefs && (crossRefs.backlog.length > 0 || crossRefs.codex.length > 0 || crossRefs.tasks.length > 0) && (
                <Section title="References" icon={<LinkOutlined fontSize="small" />}>
                  <Stack spacing={0.75}>
                    {crossRefs.backlog.map(ref => (
                      <Chip key={ref} label={ref} size="small" color="warning" variant="outlined"
                        icon={<AccountTree sx={{ fontSize: '0.8rem !important' }} />}
                      />
                    ))}
                    {crossRefs.codex.map(ref => (
                      <Chip key={ref} label={ref} size="small" color="secondary" variant="outlined" />
                    ))}
                    {crossRefs.tasks.map(ref => (
                      <Chip key={ref} label={ref} size="small" variant="outlined" />
                    ))}
                  </Stack>
                </Section>
              )}

              {/* Provenance Chain */}
              {decisionId && (
                <>
                  <Divider />
                  <Section title="Evolution chain" icon={<AccountTree fontSize="small" />}>
                    <ProvenanceChain
                      type="decision"
                      nodeId={decisionId}
                      onDecisionClick={(id) => {
                        if (id !== decisionId) {
                          onClose();
                          setTimeout(() => onClose(), 0);
                        }
                      }}
                    />
                  </Section>
                </>
              )}
            </Stack>
          )}
        </Box>
      </Box>
    </Drawer>
  );
}

function Section({ title, icon, children }) {
  return (
    <Box>
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.75 }}>
        {icon}
        <Typography variant="subtitle2" color="text.secondary">{title}</Typography>
      </Stack>
      {children}
    </Box>
  );
}

// ── Main Tab ──────────────────────────────────────────────────────────────────

export default function DecisionsTab() {
  const [filters, setFilters] = useState({ category: '', minConfidence: 0, limit: 100 });
  const [selectedId, setSelectedId] = useState(null);
  const { decisions, loading } = useDialogueDecisions(filters);

  return (
    <Box>
      {/* Filter row */}
      <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Category</InputLabel>
          <Select
            value={filters.category}
            label="Category"
            onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}
          >
            <MenuItem value="">All categories</MenuItem>
            <MenuItem value="architecture">Architecture</MenuItem>
            <MenuItem value="technology">Technology</MenuItem>
            <MenuItem value="pattern">Pattern</MenuItem>
            <MenuItem value="convention">Convention</MenuItem>
            <MenuItem value="rejection">Rejection</MenuItem>
          </Select>
        </FormControl>

        <Box sx={{ width: 200 }}>
          <Typography variant="caption" color="text.secondary">
            Min confidence: {Math.round(filters.minConfidence * 100)}%
          </Typography>
          <Slider
            size="small"
            value={filters.minConfidence}
            min={0} max={1} step={0.05}
            onChange={(_e, v) => setFilters(f => ({ ...f, minConfidence: v }))}
          />
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
          {decisions.length} decisions
        </Typography>
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 600, bgcolor: 'background.default' } }}>
                <TableCell>Decision</TableCell>
                <TableCell width={120}>Category</TableCell>
                <TableCell width={80}>Status</TableCell>
                <TableCell width={80}>Confidence</TableCell>
                <TableCell width={100}>Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {decisions.map(d => (
                <TableRow
                  key={d.decisionId}
                  hover
                  selected={d.decisionId === selectedId}
                  onClick={() => setSelectedId(d.decisionId)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>{d.title}</Typography>
                    {d.decision && (
                      <Typography
                        variant="caption" color="text.secondary" display="block"
                        sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 480 }}
                      >
                        {d.decision}
                      </Typography>
                    )}
                    {/* Entity tags extracted from decision text */}
                    {(() => {
                      const ents = parseEntitiesFromText([d.title, d.decision, d.rationale, d.context].filter(Boolean).join(' '));
                      return ents.length > 0 ? (
                        <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" gap={0.5}>
                          {ents.slice(0, 4).map(e => (
                            <Chip key={e.name}
                              label={`${e.name} ${Math.round(e.confidence * 100)}%`}
                              size="small" color={ENTITY_TYPE_COLOR[e.type] || 'default'}
                              variant="outlined" sx={{ height: 16, fontSize: 11 }} />
                          ))}
                        </Stack>
                      ) : null;
                    })()}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={d.category || '—'}
                      size="small"
                      color={CATEGORY_COLORS[d.category] || 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Tooltip title={d.status || 'proposed'}>
                      <span>{STATUS_ICON[d.status] || STATUS_ICON.proposed}</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={`${Math.round((d.confidence || 0) * 100)}%`}
                      size="small"
                      color={CONFIDENCE_COLOR(d.confidence || 0)}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">
                      {d.createdAt ? new Date(d.createdAt).toLocaleDateString() : '—'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <DecisionDetailDrawer
        decisionId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </Box>
  );
}
