import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Slider, CircularProgress, IconButton,
  Divider, Chip, Tooltip,
} from '@mui/material';
import { X, Layers, FileText, Cpu } from 'lucide-react';
import { radiusSearch } from '../../services/vectorStore.service';

const LAYER_COLORS = { L0: '#ef4444', L1: '#f97316', L2: '#eab308', L3: '#22c55e' };
const LAYER_DESC = {
  en: { L0: 'Facts', L1: 'Concepts', L2: 'Principles', L3: 'Meta' },
  ru: { L0: 'Факты', L1: 'Концепции', L2: 'Принципы', L3: 'Мета' },
};

const LABELS = {
  en: {
    title:        'Semantic Lens',
    anchor:       'Anchor',
    radius:       'Cosine radius',
    neighbors:    'Within radius',
    layerDist:    'Layer distribution',
    similarity:   'Similarity',
    type:         'Type',
    layer:        'Layer',
    noResults:    'No entities within this radius',
    radiusTip:    'Minimum cosine similarity threshold. Higher = tighter semantic neighborhood.',
    compareGraph: 'Compare to Graph',
  },
  ru: {
    title:        'Семантическая линза',
    anchor:       'Якорь',
    radius:       'Cosine-радиус',
    neighbors:    'В радиусе',
    layerDist:    'Распределение по слоям',
    similarity:   'Схожесть',
    type:         'Тип',
    layer:        'Слой',
    noResults:    'Нет сущностей в этом радиусе',
    radiusTip:    'Минимальный порог cosine-схожести. Выше = более тесная семантическая окрестность.',
    compareGraph: 'Сравнить с графом',
  },
};

export default function SemanticLensPanel({
  collection,
  anchor,          // { id, name, entityType, epistemicLayer }
  onClose,
  onNeighborsChange, // callback({ inLens: Set<string> })
  lang = 'en',
}) {
  const L = LABELS[lang] ?? LABELS.en;

  const [radius, setRadius]       = useState(0.75);
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState(null);

  const doSearch = useCallback(async (r) => {
    if (!anchor?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await radiusSearch(collection, { vectorId: anchor.id, radius: r, limit: 200 });
      setResult(res);
      onNeighborsChange?.(new Set(res.neighbors.map(n => String(n.id))));
    } catch (e) {
      setError(e.message);
      onNeighborsChange?.(new Set());
    } finally {
      setLoading(false);
    }
  }, [collection, anchor?.id, onNeighborsChange]);

  // Debounce slider
  useEffect(() => {
    const t = setTimeout(() => doSearch(radius), 300);
    return () => clearTimeout(t);
  }, [radius, doSearch]);

  if (!anchor) return null;

  const neighbors    = result?.neighbors ?? [];
  const layerDist    = result?.layerDistribution ?? {};
  const layerEntries = Object.entries(layerDist).sort((a, b) => a[0].localeCompare(b[0]));
  const maxLayerCount = Math.max(...Object.values(layerDist), 1);
  const layerDescs    = LAYER_DESC[lang] ?? LAYER_DESC.en;

  return (
    <Box sx={{
      width: 260, flexShrink: 0,
      bgcolor: '#0d1117', border: '1px solid #1e293b',
      borderRadius: 1.5, display: 'flex', flexDirection: 'column',
      overflow: 'hidden', fontSize: 13,
    }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 1, bgcolor: '#0a0f1a', borderBottom: '1px solid #1e293b' }}>
        <Cpu size={13} style={{ color: '#3b82f6', marginRight: 6 }} />
        <Typography variant="caption" fontWeight={700} sx={{ color: '#e2e8f0', fontSize: 13, flex: 1 }}>
          {L.title}
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ p: 0.25 }}>
          <X size={13} color="#475569" />
        </IconButton>
      </Box>

      {/* Anchor */}
      <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid #0f1927' }}>
        <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {L.anchor}
        </Typography>
        <Typography sx={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, wordBreak: 'break-word', lineHeight: 1.3, mt: 0.25 }}>
          {anchor.name}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
          {anchor.entityType && (
            <Chip label={anchor.entityType} size="small"
              sx={{ height: 16, fontSize: 13, bgcolor: '#1e293b', color: '#94a3b8' }} />
          )}
          {anchor.epistemicLayer && (
            <Chip label={anchor.epistemicLayer} size="small"
              sx={{ height: 16, fontSize: 13, bgcolor: (LAYER_COLORS[anchor.epistemicLayer] ?? '#6b7280') + '22',
                color: LAYER_COLORS[anchor.epistemicLayer] ?? '#6b7280' }} />
          )}
        </Box>
      </Box>

      {/* Radius slider */}
      <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid #0f1927' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
          <Tooltip title={L.radiusTip} arrow placement="top">
            <Typography variant="caption" sx={{ color: '#64748b', fontSize: 13, cursor: 'help' }}>
              {L.radius}
            </Typography>
          </Tooltip>
          <Typography variant="caption" sx={{ color: '#3b82f6', fontSize: 13, fontWeight: 700 }}>
            {radius.toFixed(2)}
          </Typography>
        </Box>
        <Slider
          size="small" value={radius} min={0.5} max={0.99} step={0.01}
          onChange={(_, v) => setRadius(v)}
          sx={{ color: '#3b82f6', py: 0.5 }}
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="caption" sx={{ color: '#64748b', fontSize: 13 }}>0.5 (loose)</Typography>
          <Typography variant="caption" sx={{ color: '#64748b', fontSize: 13 }}>0.99 (tight)</Typography>
        </Box>
      </Box>

      {/* Layer distribution */}
      {layerEntries.length > 0 && (
        <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid #0f1927' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
            <Layers size={11} color="#475569" />
            <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {L.layerDist}
            </Typography>
            {loading && <CircularProgress size={9} sx={{ ml: 'auto', color: '#3b82f6' }} />}
          </Box>
          {layerEntries.map(([layer, count]) => (
            <Box key={layer} sx={{ mb: 0.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
                <Typography variant="caption" sx={{ color: LAYER_COLORS[layer] ?? '#6b7280', fontSize: 13, fontWeight: 600 }}>
                  {layer} <span style={{ color: '#94a3b8', fontWeight: 400 }}>{layerDescs[layer] ?? ''}</span>
                </Typography>
                <Typography variant="caption" sx={{ color: '#64748b', fontSize: 13 }}>{count}</Typography>
              </Box>
              <Box sx={{ height: 4, borderRadius: 1, bgcolor: '#0f1927', overflow: 'hidden' }}>
                <Box sx={{
                  height: '100%', borderRadius: 1,
                  bgcolor: LAYER_COLORS[layer] ?? '#6b7280',
                  width: `${(count / maxLayerCount) * 100}%`,
                  transition: 'width 0.3s ease',
                }} />
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* Neighbors list */}
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ px: 1.5, py: 0.75, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <FileText size={11} color="#475569" />
          <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {L.neighbors}
          </Typography>
          {!loading && result && (
            <Box sx={{
              ml: 'auto', bgcolor: '#1e293b', borderRadius: 0.5,
              px: 0.75, fontSize: 13, color: '#3b82f6', fontWeight: 700, lineHeight: '16px',
            }}>
              {neighbors.length}
            </Box>
          )}
          {loading && <CircularProgress size={9} sx={{ ml: 'auto', color: '#3b82f6' }} />}
        </Box>

        <Box sx={{ flex: 1, overflowY: 'auto', px: 1.5, pb: 1 }}>
          {error && (
            <Typography variant="caption" sx={{ color: '#ef4444', fontSize: 13 }}>{error}</Typography>
          )}
          {!loading && !error && neighbors.length === 0 && result && (
            <Typography variant="caption" sx={{ color: '#64748b', fontSize: 13 }}>{L.noResults}</Typography>
          )}
          {neighbors.map((n, i) => (
            <Box key={n.id ?? i} sx={{
              display: 'flex', alignItems: 'flex-start', gap: 0.75, py: 0.5,
              borderBottom: i < neighbors.length - 1 ? '1px solid #0f1927' : 'none',
            }}>
              <Box sx={{
                width: 7, height: 7, borderRadius: '50%', mt: 0.4, flexShrink: 0,
                bgcolor: LAYER_COLORS[n.epistemicLayer] ?? '#6b7280',
              }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.3, wordBreak: 'break-word' }}>
                  {n.name}
                </Typography>
                <Typography variant="caption" sx={{ color: '#64748b', fontSize: 13 }}>
                  {n.entityType} {n.epistemicLayer ? `· ${n.epistemicLayer}` : ''}
                </Typography>
              </Box>
              <Box sx={{
                flexShrink: 0, fontSize: 13, fontWeight: 700,
                color: n.score >= 0.9 ? '#22c55e' : n.score >= 0.8 ? '#eab308' : '#94a3b8',
              }}>
                {n.score?.toFixed(2) ?? '—'}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
