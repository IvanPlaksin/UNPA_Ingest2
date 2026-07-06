import React, { useState } from 'react';
import {
  Box, Typography, Chip, Stack, Paper,
  Accordion, AccordionSummary, AccordionDetails,
  List, ListItem, Divider, CircularProgress,
} from '@mui/material';
import {
  ChevronDown, AlertTriangle, AlertOctagon, CheckCircle, Info,
  ArrowDown, Bell, Eye, Pause, GitBranch,
} from 'lucide-react';

// ── Risk config ────────────────────────────────────────────────────────────────

const RISK_META = {
  low:      { color: '#22c55e', label: 'LOW',      icon: CheckCircle  },
  medium:   { color: '#f59e0b', label: 'MEDIUM',   icon: Info         },
  high:     { color: '#f97316', label: 'HIGH',     icon: AlertTriangle },
  critical: { color: '#ef4444', label: 'CRITICAL', icon: AlertOctagon  },
};

const REC_META = {
  review:  { color: '#f97316', icon: Eye  },
  notify:  { color: '#3b82f6', icon: Bell },
  update:  { color: '#8b5cf6', icon: Info },
  defer:   { color: '#ef4444', icon: Pause},
};

const CATEGORY_LABELS = {
  systems:       'Systems',
  documents:     'Documents',
  policies:      'Policies',
  organizations: 'Organizations',
  processes:     'Processes',
  other:         'Other',
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function RiskBadge({ riskLevel, compact }) {
  const meta  = RISK_META[riskLevel] || RISK_META.low;
  const Icon  = meta.icon;
  return (
    <Stack direction="row" alignItems="center" spacing={0.5}
      sx={{ px: compact ? 0.75 : 1.25, py: compact ? 0.25 : 0.5,
            bgcolor: meta.color + '15', border: '1px solid', borderColor: meta.color + '40',
            borderRadius: 1.5, display: 'inline-flex' }}>
      <Icon size={compact ? 12 : 14} style={{ color: meta.color, flexShrink: 0 }} />
      <Typography sx={{ fontSize: compact ? '0.65rem' : '0.72rem', fontWeight: 700, color: meta.color, letterSpacing: '0.04em' }}>
        {meta.label}
      </Typography>
    </Stack>
  );
}

function ImpactWeightBar({ weight }) {
  const color = weight >= 0.8 ? '#ef4444' : weight >= 0.6 ? '#f97316' : weight >= 0.4 ? '#f59e0b' : '#22c55e';
  return (
    <Box sx={{ width: 32, height: 4, bgcolor: 'action.hover', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
      <Box sx={{ width: `${weight * 100}%`, height: '100%', bgcolor: color, borderRadius: 2 }} />
    </Box>
  );
}

function DependentRow({ dep, compact }) {
  const weight = dep.impactWeight || dep.cumulativeWeight || 0.5;
  return (
    <ListItem disablePadding sx={{ py: 0.2 }}>
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ width: '100%', minWidth: 0 }}>
        <ArrowDown size={9} style={{ color: '#94a3b8', flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {dep.name}
            </Typography>
            {dep.type && (
              <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled', flexShrink: 0 }}>
                [{dep.type}]
              </Typography>
            )}
            {dep.relType && (
              <Chip label={dep.relType} size="small" sx={{ fontSize: '0.52rem', height: 14, flexShrink: 0, bgcolor: 'action.hover' }} />
            )}
          </Stack>
        </Box>
        <ImpactWeightBar weight={weight} />
        {dep.distance > 1 && (
          <Typography sx={{ fontSize: '0.58rem', color: 'text.disabled', flexShrink: 0 }}>
            {dep.distance}h
          </Typography>
        )}
      </Stack>
    </ListItem>
  );
}

function CategorySection({ categories }) {
  const nonEmpty = Object.entries(categories).filter(([, ents]) => ents.length > 0);
  if (!nonEmpty.length) return null;
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
      {nonEmpty.map(([cat, ents]) => (
        <Chip
          key={cat}
          label={`${CATEGORY_LABELS[cat] || cat}: ${ents.length}`}
          size="small"
          sx={{ fontSize: '0.6rem', height: 18 }}
        />
      ))}
    </Box>
  );
}

function RecommendationList({ recs }) {
  if (!recs?.length) return null;
  return (
    <Box sx={{ mt: 0.75 }}>
      {recs.map((rec, i) => {
        const meta = REC_META[rec.type] || REC_META.review;
        const Icon = meta.icon;
        return (
          <Stack key={i} direction="row" alignItems="flex-start" spacing={0.75} sx={{ mb: 0.5 }}>
            <Icon size={11} style={{ color: meta.color, flexShrink: 0, marginTop: 2 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.7rem', lineHeight: 1.4 }}>{rec.message}</Typography>
              <Chip label={rec.priority} size="small" sx={{ fontSize: '0.52rem', height: 14, mt: 0.25, bgcolor: meta.color + '18', color: meta.color }} />
            </Box>
          </Stack>
        );
      })}
    </Box>
  );
}

// ── Main renderer ──────────────────────────────────────────────────────────────

export default function ImpactRenderer({ content, compact }) {
  if (!content) return null;

  const {
    entity,
    directDependents   = [],
    transitiveDependents = [],
    impactByCategory   = {},
    structuralAnalysis,
    criticalPaths      = [],
    riskAssessment,
    recommendations    = [],
    summary,
  } = content;

  if (!riskAssessment) {
    return (
      <Typography color="text.secondary" variant="body2">
        Impact analysis data unavailable.
      </Typography>
    );
  }

  const { riskLevel, directImpactCount, transitiveImpactCount, totalImpactCount, maxDepth, riskFactors } = riskAssessment;
  const displayDirect = compact ? directDependents.slice(0, 5) : directDependents.slice(0, 20);
  const displayTransitive = compact ? transitiveDependents.slice(0, 5) : transitiveDependents.slice(0, 20);

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.25, flexWrap: 'wrap', gap: 0.5 }}>
        <RiskBadge riskLevel={riskLevel} compact={compact} />
        <Chip size="small" label={`${directImpactCount} direct`} sx={{ fontSize: '0.62rem', height: 20 }} />
        <Chip size="small" label={`${transitiveImpactCount} transitive`} variant="outlined" sx={{ fontSize: '0.62rem', height: 20 }} />
        {maxDepth > 0 && (
          <Chip size="small" label={`depth ${maxDepth}`} variant="outlined" sx={{ fontSize: '0.62rem', height: 20 }} />
        )}
        {structuralAnalysis?.isArticulationPoint && (
          <Chip size="small" label="Articulation Point" color="error" sx={{ fontSize: '0.62rem', height: 20 }} />
        )}
      </Stack>

      {/* Summary headline */}
      {summary?.headline && (
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 1, lineHeight: 1.4 }}>
          {summary.headline}
        </Typography>
      )}

      {/* Risk factors */}
      {riskFactors?.length > 0 && !compact && (
        <Paper elevation={0} sx={{ p: 1, mb: 1.25, bgcolor: RISK_META[riskLevel]?.color + '10', border: '1px solid', borderColor: RISK_META[riskLevel]?.color + '30', borderRadius: 1 }}>
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: RISK_META[riskLevel]?.color, mb: 0.4 }}>
            Risk factors
          </Typography>
          {riskFactors.map((f, i) => (
            <Typography key={i} sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>• {f}</Typography>
          ))}
        </Paper>
      )}

      {/* Direct dependents */}
      {directDependents.length > 0 && (
        <Accordion disableGutters defaultExpanded={!compact}
          sx={{ mb: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: '6px !important', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ChevronDown size={14} />}
            sx={{ px: 1.25, py: 0.25, minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
            <Stack direction="row" alignItems="center" spacing={0.75}>
              <GitBranch size={12} style={{ color: '#ef4444', flexShrink: 0 }} />
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#ef4444' }}>Direct Dependents</Typography>
              <Chip label={directDependents.length} size="small" sx={{ fontSize: '0.58rem', height: 16, bgcolor: '#ef444422', color: '#ef4444' }} />
            </Stack>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 1.25, pt: 0, pb: 0.75 }}>
            <List dense disablePadding>
              {displayDirect.map((dep, i) => <DependentRow key={i} dep={dep} compact={compact} />)}
            </List>
            {directDependents.length > displayDirect.length && (
              <Typography sx={{ fontSize: '0.62rem', color: 'text.disabled', pt: 0.5 }}>
                +{directDependents.length - displayDirect.length} more
              </Typography>
            )}
          </AccordionDetails>
        </Accordion>
      )}

      {/* Transitive dependents */}
      {transitiveDependents.length > 0 && (
        <Accordion disableGutters defaultExpanded={false}
          sx={{ mb: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: '6px !important', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ChevronDown size={14} />}
            sx={{ px: 1.25, py: 0.25, minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
            <Stack direction="row" alignItems="center" spacing={0.75}>
              <GitBranch size={12} style={{ color: '#94a3b8', flexShrink: 0 }} />
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8' }}>Transitive Dependents</Typography>
              <Chip label={transitiveDependents.length} size="small" sx={{ fontSize: '0.58rem', height: 16, bgcolor: 'action.hover' }} />
            </Stack>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 1.25, pt: 0, pb: 0.75 }}>
            <List dense disablePadding>
              {displayTransitive.map((dep, i) => <DependentRow key={i} dep={dep} compact={compact} />)}
            </List>
            {transitiveDependents.length > displayTransitive.length && (
              <Typography sx={{ fontSize: '0.62rem', color: 'text.disabled', pt: 0.5 }}>
                +{transitiveDependents.length - displayTransitive.length} more
              </Typography>
            )}
          </AccordionDetails>
        </Accordion>
      )}

      {totalImpactCount === 0 && (
        <Typography color="text.secondary" variant="body2" sx={{ py: 1, textAlign: 'center' }}>
          No entities currently depend on this entity.
        </Typography>
      )}

      {/* Impact by category */}
      {!compact && Object.values(impactByCategory).some(v => v.length > 0) && (
        <Box sx={{ mt: 1 }}>
          <Divider sx={{ mb: 0.75 }} />
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'text.secondary', mb: 0.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            By Category
          </Typography>
          <CategorySection categories={impactByCategory} />
        </Box>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Divider sx={{ mb: 0.75 }} />
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'text.secondary', mb: 0.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Recommendations
          </Typography>
          <RecommendationList recs={recommendations} />
        </Box>
      )}
    </Box>
  );
}
