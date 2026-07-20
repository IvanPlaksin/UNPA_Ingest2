import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Stack, Chip, Paper,
  Accordion, AccordionSummary, AccordionDetails,
  List, ListItem, Divider,
} from '@mui/material';
import { ChevronDown, ArrowRight, ArrowLeft, Building2, FileText, Users, Link2, Layers, Zap } from 'lucide-react';
import SupersessionChain from '../SupersessionChain';
import { fromEnvelope } from './envelope-compat';

// ── Category config ────────────────────────────────────────────────────────────

const CATEGORY_META = {
  governance:   { label: 'Governance',    color: '#f59e0b', icon: Building2 },
  dependencies: { label: 'Dependencies',  color: '#3b82f6', icon: Link2     },
  associations: { label: 'Associations',  color: '#10b981', icon: Users     },
  authorship:   { label: 'Authorship',    color: '#8b5cf6', icon: FileText  },
  hierarchy:    { label: 'Hierarchy',     color: '#ec4899', icon: Layers    },
  other:        { label: 'Other',         color: '#94a3b8', icon: Link2     },
};

const LAYER_COLORS = {
  L0: '#ef4444', L1: '#f97316', L2: '#eab308',
  L3: '#22c55e', L4: '#3b82f6', L5: '#8b5cf6',
};

function EntityHeader({ entity }) {
  const layerColor = LAYER_COLORS[entity.epistemicLayer] || '#94a3b8';

  return (
    <Paper elevation={0} sx={{ p: 1.5, mb: 1.5, bgcolor: '#f59e0b10', border: '1px solid #f59e0b33', borderRadius: 1.5 }}>
      <Stack direction="row" alignItems="flex-start" spacing={1.5}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, lineHeight: 1.3 }}>
            {entity.name}
          </Typography>
          <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.4 }}>
            {entity.type && (
              <Chip label={entity.type} size="small" sx={{ fontSize: '0.6rem', height: 18, bgcolor: '#f59e0b22', color: '#f59e0b' }} />
            )}
            {entity.namespace && (
              <Chip label={entity.namespace} size="small" variant="outlined" sx={{ fontSize: '0.6rem', height: 18 }} />
            )}
            {entity.epistemicLayer && (
              <Chip label={entity.epistemicLayer} size="small" sx={{ fontSize: '0.6rem', height: 18, bgcolor: layerColor + '22', color: layerColor }} />
            )}
          </Stack>
        </Box>
      </Stack>
      {entity.description && (
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.75, lineHeight: 1.5 }}>
          {entity.description}
        </Typography>
      )}
      {entity.provenanceDocTitle && (
        <Typography sx={{ fontSize: '0.68rem', color: 'text.disabled', mt: 0.5 }}>
          Source: {entity.provenanceDocTitle}
        </Typography>
      )}
    </Paper>
  );
}

const IMPACT_RISK_COLOR = { low: '#22c55e', medium: '#f59e0b', high: '#f97316', critical: '#ef4444' };

function ImpactBadge({ entityId }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!entityId) return;
    fetch(`/api/v1/entity-store/${entityId}/impact-summary`)
      .then(r => r.ok ? r.json() : null)
      .then(r => { if (r?.success) setData(r.data); })
      .catch(() => {});
  }, [entityId]);

  if (!data || (data.total === 0 && data.riskLevel === 'low')) return null;
  const col = IMPACT_RISK_COLOR[data.riskLevel] || '#94a3b8';
  return (
    <Box sx={{ mb: 1 }}>
      <Chip
        icon={<Zap size={11} style={{ color: col }} />}
        label={`Impact: ${data.riskLevel.toUpperCase()} · ${data.total} dependent${data.total !== 1 ? 's' : ''}`}
        size="small"
        sx={{ fontSize: '0.62rem', height: 20, bgcolor: col + '18', color: col, border: `1px solid ${col}40` }}
      />
    </Box>
  );
}

function RelationshipList({ relationships, compact }) {
  const categories = Object.entries(relationships).filter(([, rels]) => rels.length > 0);
  if (categories.length === 0) return null;

  const limit = compact ? 3 : 8;

  return (
    <Box>
      {categories.map(([cat, rels]) => {
        const meta = CATEGORY_META[cat] || CATEGORY_META.other;
        const Icon = meta.icon;
        const shown = rels.slice(0, limit);

        return (
          <Accordion key={cat} disableGutters defaultExpanded={cat === 'governance' && !compact}
            sx={{ mb: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: '6px !important', '&:before': { display: 'none' } }}
          >
            <AccordionSummary
              expandIcon={<ChevronDown size={14} />}
              sx={{ px: 1.25, py: 0.25, minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}
            >
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <Icon size={12} style={{ color: meta.color, flexShrink: 0 }} />
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: meta.color }}>
                  {meta.label}
                </Typography>
                <Chip label={rels.length} size="small" sx={{ fontSize: '0.58rem', height: 16, bgcolor: meta.color + '22', color: meta.color }} />
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 1.25, pt: 0, pb: 0.75 }}>
              <List dense disablePadding>
                {shown.map((rel, i) => (
                  <ListItem key={i} disablePadding sx={{ py: 0.15 }}>
                    <Stack direction="row" alignItems="flex-start" spacing={0.75} sx={{ width: '100%', minWidth: 0 }}>
                      {rel.direction === 'outgoing'
                        ? <ArrowRight size={10} style={{ color: meta.color, flexShrink: 0, marginTop: 3 }} />
                        : <ArrowLeft  size={10} style={{ color: '#94a3b8',  flexShrink: 0, marginTop: 3 }} />
                      }
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
                          <Typography sx={{ fontSize: '0.73rem', fontWeight: 500 }}>
                            {rel.peerName}
                          </Typography>
                          {rel.peerType && (
                            <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled' }}>
                              [{rel.peerType}]
                            </Typography>
                          )}
                          <Chip
                            label={rel.relType}
                            size="small"
                            sx={{ fontSize: '0.55rem', height: 14, bgcolor: 'action.hover' }}
                          />
                          {rel.confidence != null && (
                            <Typography sx={{ fontSize: '0.58rem', color: 'text.disabled' }}>
                              {(rel.confidence * 100).toFixed(0)}%
                            </Typography>
                          )}
                        </Stack>
                        {!compact && rel.context && (
                          <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', lineHeight: 1.4, mt: 0.15 }}>
                            {rel.context.slice(0, 120)}{rel.context.length > 120 ? '…' : ''}
                          </Typography>
                        )}
                      </Box>
                    </Stack>
                  </ListItem>
                ))}
              </List>
              {rels.length > limit && (
                <Typography sx={{ fontSize: '0.62rem', color: 'text.disabled', pt: 0.5 }}>
                  +{rels.length - limit} more
                </Typography>
              )}
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
}

function ProvenanceSection({ provenance, compact }) {
  if (!provenance || (!provenance.totalSources && !provenance.totalMentions)) return null;

  return (
    <Box sx={{ mt: 1 }}>
      <Divider sx={{ mb: 0.75 }} />
      <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
        {provenance.totalMentions > 0 && (
          <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
            {provenance.totalMentions} mention{provenance.totalMentions !== 1 ? 's' : ''}
          </Typography>
        )}
        {provenance.totalSources > 0 && (
          <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
            {provenance.totalSources} source document{provenance.totalSources !== 1 ? 's' : ''}
          </Typography>
        )}
        {!compact && provenance.sources?.slice(0, 3).map((s, i) => (
          <Chip key={i} label={s.documentTitle || s.documentId} size="small"
            sx={{ fontSize: '0.6rem', height: 18, maxWidth: 200, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
          />
        ))}
      </Stack>
    </Box>
  );
}

function SummaryFooter({ summary }) {
  if (!summary) return null;
  return (
    <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.4 }}>
      <Chip label={`${summary.relationshipCount} relationships`} size="small" sx={{ fontSize: '0.62rem', height: 18 }} />
      {summary.isWellConnected && (
        <Chip label="Well Connected" size="small" color="success" sx={{ fontSize: '0.62rem', height: 18 }} />
      )}
      {summary.hasGovernance && (
        <Chip label="Governance" size="small" sx={{ fontSize: '0.62rem', height: 18, bgcolor: '#f59e0b22', color: '#f59e0b' }} />
      )}
      {summary.hasHierarchy && (
        <Chip label="Hierarchy" size="small" sx={{ fontSize: '0.62rem', height: 18, bgcolor: '#ec4899' + '22', color: '#ec4899' }} />
      )}
    </Stack>
  );
}

export default function ProfileRenderer({ content, compact }) {
  if (!content) return null;
  const { entity, relationships = {}, provenance, summary } = fromEnvelope(content, 'PROFILE');

  return (
    <Box>
      {entity && <EntityHeader entity={entity} />}

      {entity && !compact && <ImpactBadge entityId={entity.id} />}

      {entity && !compact && (
        <SupersessionChain entityId={entity.id} entityName={entity.name} entityType={entity.type} />
      )}

      <RelationshipList relationships={relationships} compact={compact} />

      <ProvenanceSection provenance={provenance} compact={compact} />

      <SummaryFooter summary={summary} />
    </Box>
  );
}
