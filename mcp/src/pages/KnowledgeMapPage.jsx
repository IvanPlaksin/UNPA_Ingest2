import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Box, Typography, Button, CircularProgress, Slider, Select, MenuItem,
  FormControl, InputLabel, Chip, Tooltip, Divider, Alert,
  ToggleButton, ToggleButtonGroup, Collapse, IconButton,
} from '@mui/material';
import {
  Map, RefreshCw, ZoomIn, ZoomOut, Maximize2,
  ChevronDown, ChevronUp, AlertTriangle, Layers, Link, Cpu,
} from 'lucide-react';
import { fetchKnowledgeMap } from '../services/knowledgeMap.service';

// ── Constants ─────────────────────────────────────────────────────────────────

const LAYER_ORDER  = ['L0', 'L1', 'L2', 'L3'];
const LAYER_COLORS = { L0: '#ef4444', L1: '#f97316', L2: '#eab308', L3: '#22c55e' };
const LAYER_LABELS = {
  en: { L0: 'Observable Facts', L1: 'Concepts & Definitions', L2: 'Principles & Norms', L3: 'Meta-knowledge' },
  ru: { L0: 'Наблюдаемые факты', L1: 'Концепции и определения', L2: 'Принципы и нормы', L3: 'Метазнания' },
};
const TYPE_COLORS = {
  ACTOR: '#3b82f6', ORGANIZATION: '#3b82f6', CONCEPT: '#06b6d4',
  DOCUMENT: '#8b5cf6', DOCUMENTREF: '#8b5cf6',
  EVENT: '#eab308', PROCESS: '#eab308', PERSON: '#22c55e',
  TECHNOLOGY: '#a855f7', POLICY: '#ef4444', SYSTEM: '#0891b2',
  WORK_ITEM: '#6b7280', UNKNOWN: '#6b7280',
};

// ── Layout engine ─────────────────────────────────────────────────────────────

function computeStrataLayout(nodes, canvasW, canvasH) {
  const LAYER_Y = { L0: 0.88, L1: 0.62, L2: 0.36, L3: 0.12 };
  const layers  = { L0: [], L1: [], L2: [], L3: [], null: [] };

  nodes.forEach(n => {
    const l = n.epistemicLayer;
    if (layers[l]) layers[l].push(n);
    else layers.null.push(n);
  });

  const placed = {};
  Object.entries(layers).forEach(([layer, grp]) => {
    if (!grp.length) return;
    const yRel = LAYER_Y[layer] ?? 0.5;
    const y    = canvasH * yRel;
    const step = canvasW / (grp.length + 1);
    grp.forEach((n, i) => { placed[n.id] = { x: step * (i + 1), y }; });
  });
  return placed;
}

function computeSemanticLayout(nodes, canvasW, canvasH) {
  // Use PCA x,y positions (already computed by backend), scale to canvas
  const pts = nodes.filter(n => n.x !== null && n.y !== null);
  if (!pts.length) return computeStrataLayout(nodes, canvasW, canvasH);

  const xs = pts.map(n => n.x), ys = pts.map(n => n.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
  const pad = 60;

  const placed = {};
  nodes.forEach(n => {
    if (n.x !== null && n.y !== null) {
      placed[n.id] = {
        x: pad + ((n.x - minX) / rangeX) * (canvasW - 2 * pad),
        y: pad + ((n.y - minY) / rangeY) * (canvasH - 2 * pad),
      };
    } else {
      placed[n.id] = { x: canvasW / 2, y: canvasH / 2 };
    }
  });
  return placed;
}

function computeHybridLayout(nodes, canvasW, canvasH) {
  const LAYER_Y = { L0: 0.88, L1: 0.62, L2: 0.36, L3: 0.12 };
  const pts  = nodes.filter(n => n.x !== null);
  const xs   = pts.map(n => n.x);
  const minX = Math.min(...xs), maxX = Math.max(...xs), rangeX = maxX - minX || 1;
  const pad  = 60;

  const placed = {};
  nodes.forEach(n => {
    const yRel = LAYER_Y[n.epistemicLayer] ?? 0.5;
    placed[n.id] = {
      x: n.x !== null ? pad + ((n.x - minX) / rangeX) * (canvasW - 2 * pad) : canvasW / 2,
      y: canvasH * yRel,
    };
  });
  return placed;
}

// ── SVG edge path ─────────────────────────────────────────────────────────────

function edgePath(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const cx = mx - dy * 0.15, cy = my + dx * 0.15;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

// ── Strata bands ──────────────────────────────────────────────────────────────

function StrataBands({ canvasH, canvasW, lang }) {
  const LAYER_Y = { L3: 0.0, L2: 0.25, L1: 0.5, L0: 0.75 };
  const labels  = LAYER_LABELS[lang] ?? LAYER_LABELS.en;
  return (
    <>
      {LAYER_ORDER.slice().reverse().map((layer, i) => {
        const y    = canvasH * (LAYER_Y[layer] ?? 0);
        const h    = canvasH * 0.25;
        const col  = LAYER_COLORS[layer];
        return (
          <g key={layer}>
            <rect x={0} y={y} width={canvasW} height={h}
              fill={col} fillOpacity={0.04} />
            <line x1={0} y1={y} x2={canvasW} y2={y}
              stroke={col} strokeOpacity={0.15} strokeWidth={1} strokeDasharray="4 4" />
            <text x={8} y={y + 14} fontSize={10} fill={col} fillOpacity={0.7} fontWeight="600">
              {layer}
            </text>
            <text x={8} y={y + 26} fontSize={9} fill={col} fillOpacity={0.4}>
              {labels[layer] ?? ''}
            </text>
          </g>
        );
      })}
    </>
  );
}

// ── Node component ────────────────────────────────────────────────────────────

function MapNode({ node, x, y, selected, inLens, dimmed, colorBy, onClick }) {
  const col = colorBy === 'layer'
    ? (LAYER_COLORS[node.epistemicLayer] ?? '#6b7280')
    : (TYPE_COLORS[node.type?.toUpperCase()] ?? '#6b7280');

  const r       = selected ? 8 : 6;
  const opacity = dimmed ? 0.12 : 1;
  const label   = node.name?.slice(0, 22) + (node.name?.length > 22 ? '…' : '');

  return (
    <g transform={`translate(${x},${y})`} style={{ cursor: 'pointer', opacity }}
      onClick={() => onClick(node)}>
      {selected && (
        <circle r={r + 5} fill="none" stroke={col} strokeWidth={1.5} strokeOpacity={0.5}
          strokeDasharray="3 2" />
      )}
      {!node.hasQdrant && (
        <circle r={r + 3} fill="none" stroke={col} strokeWidth={1} strokeOpacity={0.3} />
      )}
      <circle r={r} fill={col} fillOpacity={0.9} />
      {!node.hasMemgraph && (
        <circle r={r - 2} fill="none" stroke="#ffffff" strokeWidth={0.5} strokeOpacity={0.4} />
      )}
      <text y={r + 11} textAnchor="middle" fontSize={9} fill="#94a3b8"
        style={{ pointerEvents: 'none', userSelect: 'none' }}>
        {label}
      </text>
    </g>
  );
}

// ── Edge component ────────────────────────────────────────────────────────────

function MapEdge({ x1, y1, x2, y2, edgeType, similarity, relType, dimmed }) {
  if (edgeType === 'explicit') {
    return (
      <path d={edgePath(x1, y1, x2, y2)}
        stroke="#3b82f6" strokeWidth={1.5} strokeOpacity={dimmed ? 0.05 : 0.6}
        fill="none" markerEnd="url(#arrow-explicit)" />
    );
  }
  // semantic
  const opacity = dimmed ? 0.03 : Math.max(0.08, (similarity - 0.6) * 1.5);
  return (
    <line x1={x1} y1={y1} x2={x2} y2={y2}
      stroke="#a855f7" strokeWidth={1} strokeOpacity={opacity}
      strokeDasharray="3 3" />
  );
}

// ── About panel ───────────────────────────────────────────────────────────────

const ABOUT_CONTENT = {
  en: {
    title: 'About this section',
    purpose: {
      heading: 'Purpose',
      text: 'Knowledge Map unifies two complementary knowledge representations — the vector embedding space (Qdrant) and the explicit relationship graph (Memgraph) — in a single interactive canvas. It surfaces connections that exist only implicitly in embeddings but are absent from the graph, and vice versa, enabling systematic knowledge quality analysis.',
    },
    nodes: {
      heading: 'Nodes',
      items: [
        { symbol: '●', color: '#3b82f6', label: 'Entity', desc: 'An extracted knowledge unit (concept, document, actor, principle, etc.).' },
        { symbol: '●', color: '#ef4444', label: 'L0 — Observable Fact', desc: 'A concrete issuance, resolution, or document.' },
        { symbol: '●', color: '#f97316', label: 'L1 — Concept', desc: 'An abstract idea or process defined in documents.' },
        { symbol: '●', color: '#eab308', label: 'L2 — Principle', desc: 'A governing norm, rule, or policy.' },
        { symbol: '●', color: '#22c55e', label: 'L3 — Meta-knowledge', desc: 'A framework, model, or governance structure.' },
        { symbol: '○', color: '#94a3b8', label: 'Ring = no Qdrant vector', desc: 'Node exists in graph but has no embedding — not semantically positioned.' },
        { symbol: '⊙', color: '#94a3b8', label: 'Inner ring = no graph node', desc: 'Vector exists but entity is not linked in Memgraph.' },
      ],
    },
    edges: {
      heading: 'Edges',
      items: [
        { style: 'solid', color: '#3b82f6', label: 'Explicit edge', desc: 'Formal relationship from Memgraph (RELATES_TO, IMPLEMENTS, MENTIONS, DERIVES_FROM, etc.).' },
        { style: 'dashed', color: '#a855f7', label: 'Semantic edge', desc: 'Cosine similarity ≥ threshold between embeddings. Opacity reflects similarity strength — heavier lines are more semantically aligned.' },
      ],
    },
    layouts: {
      heading: 'Layout modes',
      items: [
        { label: 'Epistemic Strata', desc: 'Y-axis fixed by epistemic layer (L0 at bottom, L3 at top). Shows the abstraction hierarchy. Best for understanding knowledge structure.' },
        { label: 'Semantic Force', desc: 'Positions from PCA of 1024-dim embeddings. Distance reflects semantic dissimilarity. Best for finding thematic clusters.' },
        { label: 'Hybrid', desc: 'Y = epistemic layer, X = first PCA component. Combines hierarchy and semantics. Reveals entities displaced from their expected layer position.' },
      ],
    },
    gaps: {
      heading: 'Gaps & coherence',
      text: 'A Gap is a pair of entities with high semantic similarity (cosine ≥ threshold) but no explicit relationship in the graph — a candidate for a missing link. Coherence score measures what fraction of explicit edges connect entities within the same or adjacent epistemic layer; low coherence may indicate cross-layer edges that bypass intermediate concepts.',
    },
  },
  ru: {
    title: 'О разделе',
    purpose: {
      heading: 'Назначение',
      text: 'Knowledge Map объединяет два взаимодополняющих представления знания — пространство векторных эмбеддингов (Qdrant) и граф явных связей (Memgraph) — в единый интерактивный холст. Раздел выявляет связи, существующие только имплицитно в эмбеддингах, но отсутствующие в графе, и наоборот, позволяя систематически анализировать качество базы знаний.',
    },
    nodes: {
      heading: 'Узлы',
      items: [
        { symbol: '●', color: '#3b82f6', label: 'Сущность', desc: 'Извлечённая единица знания (концепция, документ, актор, принцип и т.д.).' },
        { symbol: '●', color: '#ef4444', label: 'L0 — Наблюдаемый факт', desc: 'Конкретный документ, резолюция или решение.' },
        { symbol: '●', color: '#f97316', label: 'L1 — Концепция', desc: 'Абстрактная идея или процесс, определённые в документах.' },
        { symbol: '●', color: '#eab308', label: 'L2 — Принцип', desc: 'Регулирующая норма, правило или политика.' },
        { symbol: '●', color: '#22c55e', label: 'L3 — Метазнание', desc: 'Фреймворк, модель или структура управления.' },
        { symbol: '○', color: '#94a3b8', label: 'Кольцо = нет вектора', desc: 'Узел есть в графе, но эмбеддинг отсутствует — не позиционирован семантически.' },
        { symbol: '⊙', color: '#94a3b8', label: 'Внутр. кольцо = нет в графе', desc: 'Вектор существует, но сущность не связана в Memgraph.' },
      ],
    },
    edges: {
      heading: 'Рёбра',
      items: [
        { style: 'solid', color: '#3b82f6', label: 'Явная связь', desc: 'Формальная связь из Memgraph (RELATES_TO, IMPLEMENTS, MENTIONS, DERIVES_FROM и др.).' },
        { style: 'dashed', color: '#a855f7', label: 'Семантическая связь', desc: 'Cosine-схожесть ≥ порогу между эмбеддингами. Прозрачность отражает силу схожести — более тёмные линии означают большее семантическое сходство.' },
      ],
    },
    layouts: {
      heading: 'Режимы компоновки',
      items: [
        { label: 'Epistemic Strata', desc: 'Ось Y фиксирована по эпистемическому слою (L0 снизу, L3 сверху). Показывает иерархию абстракции. Лучший выбор для понимания структуры знаний.' },
        { label: 'Semantic Force', desc: 'Позиции из PCA 1024-мерных эмбеддингов. Расстояние отражает семантическое несходство. Лучший выбор для поиска тематических кластеров.' },
        { label: 'Hybrid', desc: 'Y = эпистемический слой, X = первая компонента PCA. Комбинирует иерархию и семантику. Выявляет сущности, смещённые относительно ожидаемого слоя.' },
      ],
    },
    gaps: {
      heading: 'Разрывы и когерентность',
      text: 'Разрыв (Gap) — пара сущностей с высокой семантической схожестью (cosine ≥ порогу), но без явной связи в графе — кандидат на добавление связи. Coherence score показывает, какая доля явных рёбер соединяет сущности одного или соседних эпистемических слоёв; низкая когерентность может указывать на рёбра, перескакивающие через промежуточные слои.',
    },
  },
};

function AboutPanel({ lang, open, onToggle }) {
  const C = ABOUT_CONTENT[lang] ?? ABOUT_CONTENT.en;

  const Section = ({ heading, children }) => (
    <Box sx={{ mb: 1.25 }}>
      <Typography variant="caption" sx={{
        color: '#3b82f6', fontSize: 13, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', mb: 0.5,
      }}>
        {heading}
      </Typography>
      {children}
    </Box>
  );

  return (
    <Box sx={{ borderBottom: '1px solid #1e293b' }}>
      {/* Toggle header */}
      <Box
        onClick={onToggle}
        sx={{
          display: 'flex', alignItems: 'center', px: 1.5, py: 0.9,
          cursor: 'pointer', userSelect: 'none',
          '&:hover': { bgcolor: '#0a0f1a' },
        }}
      >
        <Typography variant="caption" fontWeight={700}
          sx={{ color: '#64748b', fontSize: 13, flex: 1, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {C.title}
        </Typography>
        {open ? <ChevronUp size={12} color="#334155" /> : <ChevronDown size={12} color="#334155" />}
      </Box>

      <Collapse in={open}>
        <Box sx={{ px: 1.5, pb: 1.5, maxHeight: 420, overflowY: 'auto' }}>

          {/* Purpose */}
          <Section heading={C.purpose.heading}>
            <Typography sx={{ color: '#64748b', fontSize: 13, lineHeight: 1.6 }}>
              {C.purpose.text}
            </Typography>
          </Section>

          {/* Nodes */}
          <Section heading={C.nodes.heading}>
            {C.nodes.items.map((item, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 0.75, mb: 0.6, alignItems: 'flex-start' }}>
                <Typography sx={{ color: item.color, fontSize: 13, lineHeight: 1, mt: 0.1, flexShrink: 0, width: 12 }}>
                  {item.symbol}
                </Typography>
                <Box>
                  <Typography sx={{ color: item.color, fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>
                    {item.label}
                  </Typography>
                  <Typography sx={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.4 }}>
                    {item.desc}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Section>

          {/* Edges */}
          <Section heading={C.edges.heading}>
            {C.edges.items.map((item, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 0.75, mb: 0.75, alignItems: 'flex-start' }}>
                <Box sx={{ flexShrink: 0, mt: 0.6, width: 20 }}>
                  {item.style === 'solid'
                    ? <Box sx={{ height: 2, bgcolor: item.color, borderRadius: 1 }} />
                    : <Box sx={{ borderTop: `1.5px dashed ${item.color}`, width: '100%' }} />
                  }
                </Box>
                <Box>
                  <Typography sx={{ color: item.color, fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>
                    {item.label}
                  </Typography>
                  <Typography sx={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.4 }}>
                    {item.desc}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Section>

          {/* Layouts */}
          <Section heading={C.layouts.heading}>
            {C.layouts.items.map((item, i) => (
              <Box key={i} sx={{ mb: 0.6, p: 0.6, bgcolor: '#0a0f1a', borderRadius: 0.5, border: '1px solid #1e293b' }}>
                <Typography sx={{ color: '#94a3b8', fontSize: 13, fontWeight: 600, lineHeight: 1.2, mb: 0.2 }}>
                  {item.label}
                </Typography>
                <Typography sx={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.4 }}>
                  {item.desc}
                </Typography>
              </Box>
            ))}
          </Section>

          {/* Gaps */}
          <Section heading={C.gaps.heading}>
            <Typography sx={{ color: '#64748b', fontSize: 13, lineHeight: 1.6 }}>
              {C.gaps.text}
            </Typography>
          </Section>

        </Box>
      </Collapse>
    </Box>
  );
}

// ── Insights panel ────────────────────────────────────────────────────────────

function InsightsPanel({ metrics, gaps, lang, open, onToggle }) {
  const L = lang === 'en' ? {
    title: 'Insights', gaps: 'Semantic-Structure Gaps', coherence: 'Coherence Score',
    total: 'Nodes', explicit: 'Explicit edges', semantic: 'Semantic edges',
    gapTip: 'High semantic similarity but no explicit edge — possible missing link',
    noGaps: 'No gaps detected at current threshold',
    layers: 'Layer distribution',
  } : {
    title: 'Инсайты', gaps: 'Семантические разрывы', coherence: 'Когерентность',
    total: 'Узлы', explicit: 'Явные рёбра', semantic: 'Семант. рёбра',
    gapTip: 'Высокая cosine-схожесть, но нет явной связи — возможная пропущенная связь',
    noGaps: 'Разрывов не обнаружено при текущем пороге',
    layers: 'Распределение по слоям',
  };

  return (
    <Box sx={{ borderTop: '1px solid #1e293b' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 0.75, cursor: 'pointer' }}
        onClick={onToggle}>
        <Map size={12} style={{ color: '#94a3b8', marginRight: 6 }} />
        <Typography variant="caption" fontWeight={700} sx={{ color: '#64748b', fontSize: 13, flex: 1 }}>
          {L.title}
        </Typography>
        {open ? <ChevronUp size={12} color="#475569" /> : <ChevronDown size={12} color="#475569" />}
      </Box>

      <Collapse in={open}>
        <Box sx={{ px: 1.5, pb: 1.5 }}>
          {/* Metrics row */}
          <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
            {[
              { label: L.total, value: metrics?.totalNodes ?? 0, color: '#3b82f6' },
              { label: L.explicit, value: metrics?.totalExplicit ?? 0, color: '#22c55e' },
              { label: L.semantic, value: metrics?.totalSemantic ?? 0, color: '#a855f7' },
              { label: 'Gaps', value: metrics?.totalGaps ?? 0, color: '#eab308' },
            ].map(m => (
              <Box key={m.label} sx={{
                flex: 1, minWidth: 60, bgcolor: '#0a0f1a', border: '1px solid #1e293b',
                borderRadius: 1, p: 0.75, textAlign: 'center',
              }}>
                <Typography sx={{ fontSize: 18, fontWeight: 700, color: m.color, lineHeight: 1 }}>
                  {m.value}
                </Typography>
                <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 13 }}>{m.label}</Typography>
              </Box>
            ))}
          </Box>

          {/* Coherence */}
          {metrics?.coherenceScore != null && (
            <Box sx={{ mb: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
                <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 13 }}>{L.coherence}</Typography>
                <Typography variant="caption" sx={{ color: '#e2e8f0', fontSize: 13, fontWeight: 700 }}>
                  {(metrics.coherenceScore * 100).toFixed(0)}%
                </Typography>
              </Box>
              <Box sx={{ height: 4, borderRadius: 1, bgcolor: '#0f1927' }}>
                <Box sx={{
                  height: '100%', borderRadius: 1, bgcolor: '#22c55e',
                  width: `${metrics.coherenceScore * 100}%`, transition: 'width 0.4s',
                }} />
              </Box>
            </Box>
          )}

          {/* Layer distribution */}
          {metrics?.layerDistribution?.length > 0 && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" sx={{ color: '#64748b', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', mb: 0.5 }}>
                {L.layers}
              </Typography>
              {metrics.layerDistribution
                .filter(d => d.layer !== 'N/A')
                .sort((a, b) => a.layer.localeCompare(b.layer))
                .map(d => (
                  <Box key={d.layer} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.4 }}>
                    <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: LAYER_COLORS[d.layer] ?? '#6b7280', flexShrink: 0 }} />
                    <Typography variant="caption" sx={{ color: LAYER_COLORS[d.layer] ?? '#6b7280', fontSize: 13, width: 20 }}>{d.layer}</Typography>
                    <Box sx={{ flex: 1, height: 4, borderRadius: 1, bgcolor: '#0f1927' }}>
                      <Box sx={{
                        height: '100%', borderRadius: 1,
                        bgcolor: LAYER_COLORS[d.layer] ?? '#6b7280',
                        width: `${(d.count / (metrics.totalNodes || 1)) * 100}%`,
                      }} />
                    </Box>
                    <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 13, width: 18, textAlign: 'right' }}>{d.count}</Typography>
                  </Box>
                ))}
            </Box>
          )}

          {/* Gaps */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <AlertTriangle size={11} color="#eab308" />
              <Typography variant="caption" sx={{ color: '#eab308', fontSize: 13, fontWeight: 600 }}>
                {L.gaps} ({gaps.length})
              </Typography>
            </Box>
            {gaps.length === 0 && (
              <Typography variant="caption" sx={{ color: '#64748b', fontSize: 13 }}>{L.noGaps}</Typography>
            )}
            {gaps.slice(0, 5).map((g, i) => (
              <Box key={i} sx={{ mb: 0.5, p: 0.75, bgcolor: '#0a0f1a', borderRadius: 1, border: '1px solid #1e293b' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
                  <Typography sx={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                    {g.sourceLayer ?? '?'} ↔ {g.targetLayer ?? '?'}
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: '#eab308', fontWeight: 700 }}>
                    {g.similarity.toFixed(2)}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.3 }}>
                  {g.sourceName?.slice(0, 20)} ↔ {g.targetName?.slice(0, 20)}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}

// ── Node Inspector ────────────────────────────────────────────────────────────

function NodeInspector({ node, lang, onClose }) {
  if (!node) return null;
  const col = LAYER_COLORS[node.epistemicLayer] ?? '#6b7280';
  return (
    <Box sx={{
      position: 'absolute', bottom: 12, right: 12,
      width: 220, bgcolor: '#0d1117', border: '1px solid #1e293b',
      borderRadius: 1.5, overflow: 'hidden',
    }}>
      <Box sx={{ bgcolor: col + '22', px: 1.5, py: 0.75, borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center' }}>
        <Typography variant="caption" fontWeight={700} sx={{ color: col, fontSize: 13, flex: 1 }}>
          {node.epistemicLayer ?? '—'}
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ p: 0 }}>
          <Typography sx={{ color: '#94a3b8', fontSize: 13, lineHeight: 1 }}>×</Typography>
        </IconButton>
      </Box>
      <Box sx={{ p: 1.25 }}>
        <Typography sx={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, mb: 0.5, wordBreak: 'break-word' }}>
          {node.name}
        </Typography>
        {[
          ['Type', node.type],
          ['Layer', node.epistemicLayer],
          ['Namespace', node.namespace],
          ['In Qdrant', node.hasQdrant ? '✓' : '—'],
          ['In Graph', node.hasMemgraph ? '✓' : '—'],
          ['Confidence', node.confidence?.toFixed(2) ?? '—'],
          ['Source doc', node.sourceDocumentId?.slice(0, 16)],
        ].filter(([, v]) => v).map(([k, v]) => (
          <Box key={k} sx={{ display: 'flex', gap: 0.5, mb: 0.25 }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontSize: 13, width: 66, flexShrink: 0 }}>{k}:</Typography>
            <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 13, wordBreak: 'break-all' }}>{v}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function KnowledgeMapPage() {
  const [lang, setLang]   = useState('en');
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [layout, setLayout]           = useState('strata');
  const [colorBy, setColorBy]         = useState('layer');
  const [showExplicit, setShowExplicit] = useState(true);
  const [showSemantic, setShowSemantic] = useState(true);
  const [threshold, setThreshold]     = useState(0.7);
  const [selectedNode, setSelectedNode] = useState(null);
  const [insightsOpen, setInsightsOpen] = useState(true);
  const [aboutOpen, setAboutOpen]       = useState(false);

  // Zoom/pan
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const svgRef     = useRef(null);
  const dragging   = useRef(false);
  const lastPos    = useRef({ x: 0, y: 0 });

  const CANVAS_W = 1600, CANVAS_H = 900;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedNode(null);
    try {
      const d = await fetchKnowledgeMap({ semanticThreshold: threshold });
      setData(d);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [threshold]);

  // ── Compute positions ───────────────────────────────────────────────────────

  const positions = useMemo(() => {
    if (!data?.nodes) return {};
    if (layout === 'strata')   return computeStrataLayout(data.nodes, CANVAS_W, CANVAS_H);
    if (layout === 'semantic') return computeSemanticLayout(data.nodes, CANVAS_W, CANVAS_H);
    return computeHybridLayout(data.nodes, CANVAS_W, CANVAS_H);
  }, [data, layout]);

  // ── Pan/Zoom handlers ───────────────────────────────────────────────────────

  const onMouseDown = useCallback(e => {
    if (e.target.closest('circle') || e.target.closest('text')) return;
    dragging.current = true;
    lastPos.current  = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseMove = useCallback(e => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setTransform(t => ({ ...t, x: t.x + dx, y: t.y + dy }));
  }, []);

  const onMouseUp = useCallback(() => { dragging.current = false; }, []);

  const onWheel = useCallback(e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setTransform(t => ({ ...t, scale: Math.max(0.2, Math.min(5, t.scale * factor)) }));
  }, []);

  const resetView = () => setTransform({ x: 0, y: 0, scale: 1 });

  const L = lang === 'en' ? {
    title: 'Knowledge Map', load: 'Load Map', loading: 'Loading…',
    layout: 'Layout', colorBy: 'Color by', threshold: 'Semantic threshold',
    strata: 'Epistemic Strata', semantic: 'Semantic Force', hybrid: 'Hybrid',
    layerC: 'Layer', typeC: 'Type',
    explicit: 'Explicit (Graph)', semanticEdge: 'Semantic (Vector)',
    reset: 'Reset view', empty: 'Click "Load Map" to begin',
  } : {
    title: 'Карта знаний', load: 'Загрузить', loading: 'Загрузка…',
    layout: 'Компоновка', colorBy: 'Цвет по', threshold: 'Порог схожести',
    strata: 'Эпистем. слои', semantic: 'Семантика', hybrid: 'Гибрид',
    layerC: 'Слой', typeC: 'Тип',
    explicit: 'Явные (граф)', semanticEdge: 'Семантич. (вектор)',
    reset: 'Сбросить вид', empty: 'Нажмите "Загрузить" для начала',
  };

  const hasData = data?.nodes?.length > 0;

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: '#080d14', color: '#e2e8f0', overflow: 'hidden' }}>

      {/* ── Left sidebar ── */}
      <Box sx={{
        width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column',
        borderRight: '1px solid #1e293b', bgcolor: '#0d1117', overflowY: 'auto',
      }}>
        {/* Header */}
        <Box sx={{ px: 1.5, py: 1.25, borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Map size={16} color="#3b82f6" />
          <Typography fontWeight={700} sx={{ fontSize: 14, flex: 1 }}>{L.title}</Typography>
          <Box sx={{
            display: 'flex', border: '1px solid #1e293b', borderRadius: 1, overflow: 'hidden',
          }}>
            {['EN', 'RU'].map(l => (
              <Box key={l} onClick={() => setLang(l.toLowerCase())}
                sx={{
                  px: 1, py: 0.25, fontSize: 13, cursor: 'pointer', fontWeight: 600,
                  bgcolor: lang === l.toLowerCase() ? '#1e3a5f' : 'transparent',
                  color: lang === l.toLowerCase() ? '#3b82f6' : '#475569',
                  '&:hover': { bgcolor: '#0f1927' },
                }}>
                {l}
              </Box>
            ))}
          </Box>
        </Box>

        {/* Controls */}
        <Box sx={{ p: 1.25, display: 'flex', flexDirection: 'column', gap: 1.25, borderBottom: '1px solid #1e293b' }}>
          {/* Layout */}
          <Box>
            <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 13, display: 'block', mb: 0.5 }}>{L.layout}</Typography>
            <ToggleButtonGroup value={layout} exclusive onChange={(_, v) => v && setLayout(v)} size="small" fullWidth
              sx={{ '& .MuiToggleButton-root': { py: 0.25, fontSize: 13, borderColor: '#1e293b', color: '#64748b',
                '&.Mui-selected': { bgcolor: '#1e3a5f', color: '#3b82f6' } } }}>
              <ToggleButton value="strata">{L.strata.split(' ')[0]}</ToggleButton>
              <ToggleButton value="semantic">{L.semantic.split(' ')[0]}</ToggleButton>
              <ToggleButton value="hybrid">{L.hybrid}</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Color by */}
          <FormControl size="small" fullWidth>
            <InputLabel sx={{ fontSize: 13 }}>{L.colorBy}</InputLabel>
            <Select value={colorBy} label={L.colorBy} onChange={e => setColorBy(e.target.value)}
              sx={{ fontSize: 13 }}>
              <MenuItem value="layer" sx={{ fontSize: 13 }}>{L.layerC}</MenuItem>
              <MenuItem value="type"  sx={{ fontSize: 13 }}>{L.typeC}</MenuItem>
            </Select>
          </FormControl>

          {/* Edge toggles */}
          <Box>
            <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 13, display: 'block', mb: 0.5 }}>
              {lang === 'en' ? 'Show edges' : 'Показать рёбра'}
            </Typography>
            {[
              { key: 'explicit', label: L.explicit, color: '#3b82f6', val: showExplicit, set: setShowExplicit },
              { key: 'semantic', label: L.semanticEdge, color: '#a855f7', val: showSemantic, set: setShowSemantic },
            ].map(e => (
              <Box key={e.key} onClick={() => e.set(v => !v)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 0.75, p: 0.5,
                  borderRadius: 0.5, cursor: 'pointer', mb: 0.25,
                  bgcolor: e.val ? e.color + '18' : 'transparent',
                  border: `1px solid ${e.val ? e.color + '44' : '#1e293b'}`,
                }}>
                <Box sx={{ width: 20, height: 2, bgcolor: e.val ? e.color : '#64748b',
                  borderRadius: 1, ...(e.key === 'semantic' ? { borderTop: '2px dashed', bgcolor: 'transparent', borderColor: e.val ? e.color : '#64748b', height: 0 } : {}) }} />
                <Typography variant="caption" sx={{ fontSize: 13, color: e.val ? e.color : '#475569' }}>
                  {e.label}
                </Typography>
              </Box>
            ))}
          </Box>

          {/* Semantic threshold */}
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 13 }}>{L.threshold}</Typography>
              <Typography variant="caption" sx={{ color: '#a855f7', fontSize: 13, fontWeight: 700 }}>{threshold.toFixed(2)}</Typography>
            </Box>
            <Slider size="small" value={threshold} min={0.5} max={0.99} step={0.01}
              onChange={(_, v) => setThreshold(v)} sx={{ color: '#a855f7', py: 0.5 }} />
          </Box>

          {/* Load button */}
          <Button variant="contained" fullWidth size="small"
            startIcon={loading ? <CircularProgress size={13} color="inherit" /> : <RefreshCw size={13} />}
            onClick={load} disabled={loading}>
            {loading ? L.loading : L.load}
          </Button>
        </Box>

        {/* Legend */}
        {hasData && (
          <Box sx={{ px: 1.25, py: 1, borderBottom: '1px solid #1e293b' }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', mb: 0.75 }}>
              {lang === 'en' ? 'Legend' : 'Легенда'}
            </Typography>
            {colorBy === 'layer' ? (
              LAYER_ORDER.map(l => (
                <Box key={l} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.3 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: LAYER_COLORS[l] }} />
                  <Typography variant="caption" sx={{ color: LAYER_COLORS[l], fontSize: 13 }}>{l}</Typography>
                  <Typography variant="caption" sx={{ color: '#64748b', fontSize: 13 }}>
                    {(LAYER_LABELS[lang] ?? LAYER_LABELS.en)[l]}
                  </Typography>
                </Box>
              ))
            ) : (
              Object.entries(TYPE_COLORS).filter(([k]) => k !== 'UNKNOWN').slice(0, 8).map(([type, col]) => (
                <Box key={type} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.3 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: col }} />
                  <Typography variant="caption" sx={{ color: col, fontSize: 13 }}>{type}</Typography>
                </Box>
              ))
            )}
            <Divider sx={{ my: 0.75, borderColor: '#1e293b' }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.3 }}>
              <Box sx={{ width: 16, height: 1.5, bgcolor: '#3b82f6', borderRadius: 1 }} />
              <Typography variant="caption" sx={{ color: '#3b82f6', fontSize: 13 }}>{lang === 'en' ? 'Explicit edge' : 'Явная связь'}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{ width: 16, borderTop: '1.5px dashed #a855f7' }} />
              <Typography variant="caption" sx={{ color: '#a855f7', fontSize: 13 }}>{lang === 'en' ? 'Semantic edge' : 'Семант. связь'}</Typography>
            </Box>
          </Box>
        )}

        {/* Insights panel */}
        {hasData && (
          <InsightsPanel
            metrics={data.metrics} gaps={data.gaps ?? []}
            lang={lang} open={insightsOpen} onToggle={() => setInsightsOpen(o => !o)}
          />
        )}
      </Box>

      {/* ── Main canvas ── */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* Toolbar */}
        <Box sx={{
          position: 'absolute', top: 8, right: 8, zIndex: 10,
          display: 'flex', gap: 0.5,
        }}>
          <Tooltip title={L.reset}>
            <IconButton size="small" onClick={resetView}
              sx={{ bgcolor: '#0d1117', border: '1px solid #1e293b', color: '#64748b', '&:hover': { color: '#e2e8f0' } }}>
              <Maximize2 size={14} />
            </IconButton>
          </Tooltip>
          <IconButton size="small" onClick={() => setTransform(t => ({ ...t, scale: Math.min(5, t.scale * 1.2) }))}
            sx={{ bgcolor: '#0d1117', border: '1px solid #1e293b', color: '#64748b', '&:hover': { color: '#e2e8f0' } }}>
            <ZoomIn size={14} />
          </IconButton>
          <IconButton size="small" onClick={() => setTransform(t => ({ ...t, scale: Math.max(0.2, t.scale * 0.8) }))}
            sx={{ bgcolor: '#0d1117', border: '1px solid #1e293b', color: '#64748b', '&:hover': { color: '#e2e8f0' } }}>
            <ZoomOut size={14} />
          </IconButton>
        </Box>

        {/* Error */}
        {error && (
          <Alert severity="error" sx={{ position: 'absolute', top: 8, left: 8, right: 80, zIndex: 10, py: 0 }}>
            {error}
          </Alert>
        )}

        {/* Empty state */}
        {!hasData && !loading && (
          <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2, color: 'text.secondary' }}>
            <Map size={48} opacity={0.2} />
            <Typography variant="body2">{L.empty}</Typography>
          </Box>
        )}

        {/* SVG canvas */}
        {hasData && (
          <svg
            ref={svgRef}
            width="100%" height="100%"
            style={{ cursor: dragging.current ? 'grabbing' : 'grab' }}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove}
            onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
            onWheel={onWheel}
          >
            <defs>
              <marker id="arrow-explicit" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill="#3b82f6" fillOpacity={0.7} />
              </marker>
            </defs>
            <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
              {/* Strata bands (only in strata/hybrid layout) */}
              {(layout === 'strata' || layout === 'hybrid') && (
                <StrataBands canvasH={CANVAS_H} canvasW={CANVAS_W} lang={lang} />
              )}

              {/* Semantic edges */}
              {showSemantic && data.semanticEdges?.map((e, i) => {
                const s = positions[e.source], t = positions[e.target];
                if (!s || !t) return null;
                const dimmed = selectedNode && e.source !== selectedNode.id && e.target !== selectedNode.id;
                return <MapEdge key={`se${i}`} x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                  edgeType="semantic" similarity={e.similarity} dimmed={dimmed} />;
              })}

              {/* Explicit edges */}
              {showExplicit && data.explicitEdges?.map((e, i) => {
                const s = positions[e.source], t = positions[e.target];
                if (!s || !t) return null;
                const dimmed = selectedNode && e.source !== selectedNode.id && e.target !== selectedNode.id;
                return <MapEdge key={`ee${i}`} x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                  edgeType="explicit" relType={e.relType} dimmed={dimmed} />;
              })}

              {/* Nodes */}
              {data.nodes.map(node => {
                const pos = positions[node.id];
                if (!pos) return null;
                const dimmed = selectedNode && node.id !== selectedNode.id;
                return (
                  <MapNode key={node.id}
                    node={node} x={pos.x} y={pos.y}
                    selected={selectedNode?.id === node.id}
                    dimmed={dimmed}
                    colorBy={colorBy}
                    onClick={n => setSelectedNode(prev => prev?.id === n.id ? null : n)}
                  />
                );
              })}
            </g>
          </svg>
        )}

        {/* Node inspector */}
        <NodeInspector node={selectedNode} lang={lang} onClose={() => setSelectedNode(null)} />

        {/* Scale indicator */}
        {hasData && (
          <Box sx={{
            position: 'absolute', bottom: 8, left: 12,
            fontSize: 13, color: '#64748b',
          }}>
            {(transform.scale * 100).toFixed(0)}% · {data.nodes.length} nodes
          </Box>
        )}
        </Box>
        <AboutPanel lang={lang} open={aboutOpen} onToggle={() => setAboutOpen(o => !o)} />
      </Box>
    </Box>
  );
}
