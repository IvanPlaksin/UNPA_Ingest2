import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import {
  Box, Typography, Button, CircularProgress, Select, MenuItem,
  FormControl, InputLabel, Slider, Chip, Alert, LinearProgress,
  Tooltip as MuiTooltip, Divider, IconButton,
} from '@mui/material';
import { Cpu, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { UMAP } from 'umap-js';
import { computeProjection } from '../../services/vectorStore.service';
import SemanticLensPanel from './SemanticLensPanel';

// ── Colour palettes ───────────────────────────────────────────────────────────

const TYPE_COLORS = {
  ACTOR:        '#3b82f6',
  ORGANIZATION: '#3b82f6',
  CONCEPT:      '#06b6d4',
  DOCUMENT:     '#8b5cf6',
  DOCUMENTREF:  '#8b5cf6',
  EVENT:        '#eab308',
  PROCESS:      '#eab308',
  PERSON:       '#22c55e',
  TECHNOLOGY:   '#a855f7',
  POLICY:       '#ef4444',
  SYSTEM:       '#0891b2',
  WORK_ITEM:    '#6b7280',
  UNKNOWN:      '#6b7280',
};

const LAYER_COLORS = { L0: '#ef4444', L1: '#f97316', L2: '#eab308', L3: '#22c55e' };

const LAYER_DESC = {
  en: { L0: 'Observable Facts', L1: 'Concepts & Definitions', L2: 'Principles & Norms', L3: 'Meta-knowledge' },
  ru: { L0: 'Наблюдаемые факты', L1: 'Концепции и определения', L2: 'Принципы и нормы', L3: 'Метазнания' },
};

function getColor(point, colorBy) {
  if (colorBy === 'type')  return TYPE_COLORS[point.entityType?.toUpperCase()] ?? '#6b7280';
  if (colorBy === 'layer') return LAYER_COLORS[point.epistemicLayer] ?? '#6b7280';
  if (colorBy === 'doc')   return point.sourceDocumentId ? '#3b82f6' : '#6b7280';
  return '#3b82f6';
}

// ── Seeded LCG PRNG for deterministic UMAP ────────────────────────────────────

function makeLCG(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;
  return (
    <Box sx={{ bgcolor: '#1e293b', border: '1px solid #334155', borderRadius: 1, p: 1.5, fontSize: 13, maxWidth: 240 }}>
      <Typography variant="caption" fontWeight="bold" color="primary.main"
        sx={{ display: 'block', mb: 0.5, wordBreak: 'break-word' }}>
        {pt.name}
      </Typography>
      <Box sx={{ color: '#94a3b8', lineHeight: 1.7 }}>
        <div>Type:&nbsp;<span style={{ color: '#e2e8f0' }}>{pt.entityType ?? '—'}</span></div>
        {pt.epistemicLayer && (
          <div>Layer:&nbsp;<span style={{ color: '#e2e8f0' }}>{pt.epistemicLayer}</span></div>
        )}
        <div>x:&nbsp;<span style={{ color: '#64748b', fontFamily: 'monospace' }}>{pt.x?.toFixed(4)}</span></div>
        <div>y:&nbsp;<span style={{ color: '#64748b', fontFamily: 'monospace' }}>{pt.y?.toFixed(4)}</span></div>
        {pt.score != null && <div>Score:&nbsp;<span style={{ color: '#e2e8f0' }}>{pt.score?.toFixed(3)}</span></div>}
      </Box>
    </Box>
  );
}

// ── Legend panel (overlay) ────────────────────────────────────────────────────

function LegendPanel({ legendData, colorBy, lang }) {
  if (!legendData.length) return null;
  const title = lang === 'en' ? 'Legend' : 'Легенда';
  return (
    <Box sx={{
      position: 'absolute', top: 8, right: 8,
      bgcolor: 'rgba(13,17,23,0.92)', border: '1px solid #2d3f55',
      borderRadius: 1.5, p: 1.25, minWidth: 160, maxHeight: 240, overflowY: 'auto',
    }}>
      <Typography variant="caption" fontWeight={700}
        sx={{ color: '#94a3b8', fontSize: 13, display: 'block', mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {title}
      </Typography>

      {legendData.map(({ label, sub, color, count }, i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.6 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color, flexShrink: 0, boxShadow: `0 0 4px ${color}88` }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" sx={{ color: '#f1f5f9', fontSize: 13, display: 'block', lineHeight: 1.3, fontWeight: 500 }}>
              {label}
            </Typography>
            {sub && (
              <Typography variant="caption" sx={{ color: '#64748b', fontSize: 12, display: 'block', lineHeight: 1.2 }}>
                {sub}
              </Typography>
            )}
          </Box>
          <Box sx={{
            ml: 'auto', flexShrink: 0,
            bgcolor: color + '30', border: `1px solid ${color}66`,
            borderRadius: 0.5, px: 0.6, py: 0,
            fontSize: 12, color, fontWeight: 700, lineHeight: '17px',
          }}>
            {count}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

// ── Indicators bar ────────────────────────────────────────────────────────────

const INDICATOR_TIPS = {
  en: {
    method_pca:  'PCA — Principal Component Analysis: linear projection preserving maximum variance',
    method_umap: 'UMAP — Uniform Manifold Approximation: non-linear topology-preserving embedding (deterministic seed=42)',
    pc1:   'PC1 (horizontal axis) — direction of maximum variance in the 1024-dim embedding space.',
    pc2:   'PC2 (vertical axis) — direction of second-largest variance, orthogonal to PC1.',
    total: 'Total % of the original 1024-dimensional variance captured in this 2D view.',
    low_var: 'Low total variance (<10%) is normal for high-dimensional embeddings — 1024 dims compress to 2.',
    pts:   'Number of vectors shown. Increase the slider to reveal more structure.',
    umap_nonlinear: 'UMAP preserves local neighborhoods: nearby points are semantically related.',
    lens: 'Semantic Lens active — click any point to set as anchor and explore its neighborhood.',
    zoom: 'Current zoom level. Scroll wheel to zoom (centered on cursor), drag to pan, click ⊡ to reset.',
  },
  ru: {
    method_pca:  'PCA — Метод главных компонент: линейная проекция с сохранением максимальной дисперсии',
    method_umap: 'UMAP — Равномерная аппроксимация многообразия: нелинейное встраивание (детерминированный seed=42)',
    pc1:   'PC1 (горизонтальная ось) — направление максимальной дисперсии в 1024-мерном пространстве.',
    pc2:   'PC2 (вертикальная ось) — ортогональна PC1, захватывает вторичную вариацию.',
    total: 'Итоговый % 1024-мерной дисперсии, захваченный в 2D-виде.',
    low_var: 'Низкая суммарная дисперсия (<10%) нормальна для высокомерных эмбеддингов.',
    pts:   'Количество отображаемых векторов.',
    umap_nonlinear: 'UMAP сохраняет локальные соседства: близкие точки семантически связаны.',
    lens: 'Семантическая линза активна — кликните на точку для исследования её окрестности.',
    zoom: 'Текущий масштаб. Колесо мыши — зум к курсору, перетаскивание — панорамирование, ⊡ — сброс.',
  },
};

function IndicatorChip({ label, tooltip, color = '#1e293b', textColor = '#94a3b8' }) {
  return (
    <MuiTooltip title={tooltip} arrow placement="top">
      <Box sx={{
        display: 'inline-flex', alignItems: 'center',
        border: `1px solid ${color === '#1e293b' ? '#1e293b' : color + '44'}`,
        bgcolor: color === '#1e293b' ? '#0f172a' : color + '18',
        borderRadius: 1, px: 1, py: 0.25,
        fontSize: 13, color: textColor, cursor: 'help', lineHeight: '20px',
        '&:hover': { borderColor: '#334155' },
      }}>
        {label}
      </Box>
    </MuiTooltip>
  );
}

function IndicatorsBar({ method, explained, points, lensActive, lang, zoomLevel = 1, onResetZoom }) {
  if (!points.length) return null;
  const T = INDICATOR_TIPS[lang] ?? INDICATOR_TIPS.en;

  const totalVar = explained.reduce((s, x) => s + x, 0) || 0;
  const pc1Pct   = totalVar > 0 && explained[0] != null ? (explained[0] / totalVar * 100) : null;
  const pc2Pct   = totalVar > 0 && explained[1] != null ? (explained[1] / totalVar * 100) : null;
  const sumPct   = pc1Pct != null && pc2Pct != null ? (pc1Pct + pc2Pct) : null;
  const isLowVar = sumPct != null && sumPct < 10;
  const isZoomed = zoomLevel > 1.05;

  return (
    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center', pt: 0.5 }}>
      <IndicatorChip
        label={method.toUpperCase()}
        tooltip={method === 'pca' ? T.method_pca : T.method_umap}
        color={method === 'pca' ? '#3b82f6' : '#8b5cf6'}
        textColor={method === 'pca' ? '#3b82f6' : '#8b5cf6'}
      />
      {method === 'pca' && pc1Pct != null && (
        <>
          <IndicatorChip label={`PC1 = ${pc1Pct.toFixed(1)}%`} tooltip={T.pc1} color="#06b6d4" textColor="#06b6d4" />
          {pc2Pct != null && (
            <IndicatorChip label={`PC2 = ${pc2Pct.toFixed(1)}%`} tooltip={T.pc2} color="#a855f7" textColor="#a855f7" />
          )}
          {sumPct != null && (
            <IndicatorChip
              label={`${lang === 'en' ? 'Total' : 'Итого'} = ${sumPct.toFixed(1)}%`}
              tooltip={isLowVar ? T.low_var : T.total}
              color={isLowVar ? '#eab308' : '#22c55e'}
              textColor={isLowVar ? '#eab308' : '#22c55e'}
            />
          )}
        </>
      )}
      {method === 'umap' && (
        <IndicatorChip
          label={lang === 'en' ? 'Non-linear topology' : 'Нелинейная топология'}
          tooltip={T.umap_nonlinear} color="#8b5cf6" textColor="#8b5cf6"
        />
      )}
      <IndicatorChip label={`${points.length} ${lang === 'en' ? 'pts' : 'точек'}`} tooltip={T.pts} />
      {lensActive && (
        <IndicatorChip
          label={lang === 'en' ? '🔍 Lens' : '🔍 Линза'}
          tooltip={T.lens} color="#3b82f6" textColor="#3b82f6"
        />
      )}
      {isZoomed && (
        <MuiTooltip title={T.zoom} arrow placement="top">
          <Box
            onClick={onResetZoom}
            sx={{
              display: 'inline-flex', alignItems: 'center', gap: 0.5,
              border: '1px solid #0891b244', bgcolor: '#0891b218',
              borderRadius: 1, px: 1, py: 0.25,
              fontSize: 13, color: '#0891b2', cursor: 'pointer', lineHeight: '20px',
              '&:hover': { bgcolor: '#0891b230' },
            }}>
            <ZoomIn size={10} />
            {zoomLevel.toFixed(1)}×
          </Box>
        </MuiTooltip>
      )}
      {method === 'pca' && (
        <>
          <Divider orientation="vertical" flexItem sx={{ borderColor: '#1e293b', my: 0.25 }} />
          <Typography variant="caption" sx={{ color: '#64748b', fontSize: 12, lineHeight: '20px' }}>
            {lang === 'en'
              ? 'X = PC1 (max variance) · Y = PC2 (2nd variance)'
              : 'X = PC1 (макс. дисперсия) · Y = PC2 (2-я дисперсия)'}
          </Typography>
        </>
      )}
    </Box>
  );
}

// ── Approximate chart plot area margins (Recharts internal + explicit margins) ─
// ScatterChart margin={top:12, right:16, bottom:24, left:16} + axis widths
const PLOT_INSET = { l: 72, r: 20, t: 12, b: 46 };

// ── Main component ────────────────────────────────────────────────────────────

export default function VectorProjection({ collection, filters = {}, onPointClick, lang = 'en' }) {
  const [points, setPoints]             = useState([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const [colorBy, setColorBy]           = useState('type');
  const [nPoints, setNPoints]           = useState(300);
  const [explained, setExplained]       = useState([]);
  const [method, setMethod]             = useState('pca');
  const [umapProgress, setUmapProgress] = useState(null);

  // Semantic Lens state
  const [lensAnchor, setLensAnchor]       = useState(null);
  const [lensNeighbors, setLensNeighbors] = useState(null);

  // Zoom / pan state
  const [viewDomain, setViewDomain] = useState(null); // null = auto-fit
  const [isPanning, setIsPanning]   = useState(false);
  const chartBoxRef  = useRef(null);
  const isPanRef     = useRef(false);
  const panStartRef  = useRef(null);
  const didPanRef    = useRef(false);

  // ── Data bounds (auto-fit when viewDomain is null) ──────────────────────────

  const dataBounds = useMemo(() => {
    if (!points.length) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    points.forEach(p => {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    });
    const padX = Math.max((maxX - minX) * 0.06, 0.1);
    const padY = Math.max((maxY - minY) * 0.06, 0.1);
    return { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY };
  }, [points]);

  const activeDomain = viewDomain ?? dataBounds;

  const zoomLevel = useMemo(() => {
    if (!viewDomain || !dataBounds) return 1;
    const fullRange = dataBounds.maxX - dataBounds.minX;
    const viewRange = viewDomain.maxX - viewDomain.minX;
    return viewRange > 0 ? fullRange / viewRange : 1;
  }, [viewDomain, dataBounds]);

  // ── Fetch projection ────────────────────────────────────────────────────────

  const fetchProjection = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUmapProgress(null);
    setLensAnchor(null);
    setLensNeighbors(null);
    setViewDomain(null); // reset zoom on new computation
    try {
      const result = await computeProjection(collection, {
        limit: nPoints, dims: method === 'pca' ? 2 : 3, ...filters,
      });
      if (method === 'pca' || result.points.length === 0) {
        setPoints(result.points ?? []);
        setExplained(result.explained ?? []);
        setLoading(false);
      } else {
        setLoading(false);
        await runUMAP(result.points);
      }
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }, [collection, nPoints, method, filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const runUMAP = useCallback(async (rawPoints) => {
    setUmapProgress(0);

    // Deterministic UMAP: use seeded LCG PRNG.
    // (1) Pass as `random` param for umap-js ≥1.3.0.
    // (2) Also override Math.random as belt-and-suspenders for older versions.
    const seededRandom = makeLCG(42);
    const _origRandom = Math.random;
    Math.random = seededRandom;

    try {
      const inputVectors = rawPoints.map(p => [p.x ?? 0, p.y ?? 0, p.z ?? 0]);
      const nNeighbors   = Math.min(15, Math.floor(rawPoints.length / 3));
      const umap = new UMAP({
        nNeighbors, minDist: 0.1, nComponents: 2, nEpochs: 200,
        random: seededRandom,
      });
      umap.initializeFit(inputVectors);
      for (let epoch = 0; epoch < 200; epoch++) {
        umap.step();
        if (epoch % 20 === 0) {
          setUmapProgress(Math.round((epoch / 200) * 100));
          await new Promise(r => setTimeout(r, 0));
        }
      }
      const result = umap.getEmbedding();
      setPoints(rawPoints.map((pt, i) => ({ ...pt, x: result[i]?.[0] ?? 0, y: result[i]?.[1] ?? 0 })));
      setExplained([]);
    } catch (e) {
      setError(`UMAP failed: ${e.message}`);
      setPoints(rawPoints);
    } finally {
      Math.random = _origRandom; // always restore
      setUmapProgress(null);
    }
  }, []);

  // ── Zoom / pan event handlers ───────────────────────────────────────────────

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const d = activeDomain;
    if (!d) return;

    const factor = e.deltaY > 0 ? 1.25 : 0.8; // zoom out / in
    const rect = chartBoxRef.current?.getBoundingClientRect();

    if (rect) {
      // Cursor-centred zoom: keep the data point under cursor fixed
      const chartW = rect.width  - PLOT_INSET.l - PLOT_INSET.r;
      const chartH = rect.height - PLOT_INSET.t - PLOT_INSET.b;
      const cx = e.clientX - rect.left - PLOT_INSET.l;
      const cy = e.clientY - rect.top  - PLOT_INSET.t;
      const fx = Math.max(0, Math.min(1, cx / Math.max(chartW, 1)));
      const fy = Math.max(0, Math.min(1, cy / Math.max(chartH, 1)));
      const curDataX = d.minX + fx * (d.maxX - d.minX);
      const curDataY = d.maxY - fy * (d.maxY - d.minY); // screen Y is inverted
      const newRangeX = (d.maxX - d.minX) * factor;
      const newRangeY = (d.maxY - d.minY) * factor;
      setViewDomain({
        minX: curDataX - fx * newRangeX,
        maxX: curDataX + (1 - fx) * newRangeX,
        minY: curDataY - (1 - fy) * newRangeY,
        maxY: curDataY + fy * newRangeY,
      });
    } else {
      // Fallback: centre zoom
      const cx = (d.minX + d.maxX) / 2;
      const cy = (d.minY + d.maxY) / 2;
      const rx = (d.maxX - d.minX) / 2 * factor;
      const ry = (d.maxY - d.minY) / 2 * factor;
      setViewDomain({ minX: cx - rx, maxX: cx + rx, minY: cy - ry, maxY: cy + ry });
    }
  }, [activeDomain]);

  // Attach wheel with passive:false (cannot be done via React synthetic events)
  useEffect(() => {
    const el = chartBoxRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleZoomBtn = useCallback((factor) => {
    const d = activeDomain;
    if (!d) return;
    const cx = (d.minX + d.maxX) / 2;
    const cy = (d.minY + d.maxY) / 2;
    const rx = (d.maxX - d.minX) / 2 * factor;
    const ry = (d.maxY - d.minY) / 2 * factor;
    setViewDomain({ minX: cx - rx, maxX: cx + rx, minY: cy - ry, maxY: cy + ry });
  }, [activeDomain]);

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0 || !activeDomain) return;
    isPanRef.current    = true;
    didPanRef.current   = false;
    setIsPanning(true);
    panStartRef.current = {
      clientX: e.clientX, clientY: e.clientY,
      domain: { ...activeDomain },
    };
  }, [activeDomain]);

  const handleMouseMove = useCallback((e) => {
    if (!isPanRef.current || !panStartRef.current) return;
    const dx = e.clientX - panStartRef.current.clientX;
    const dy = e.clientY - panStartRef.current.clientY;
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    didPanRef.current = true;

    const d    = panStartRef.current.domain;
    const rect = chartBoxRef.current?.getBoundingClientRect();
    if (!rect) return;

    const chartW = rect.width  - PLOT_INSET.l - PLOT_INSET.r;
    const chartH = rect.height - PLOT_INSET.t - PLOT_INSET.b;
    const deltaX = -(dx / Math.max(chartW, 1)) * (d.maxX - d.minX);
    const deltaY =  (dy / Math.max(chartH, 1)) * (d.maxY - d.minY); // screen Y inverted

    setViewDomain({
      minX: d.minX + deltaX, maxX: d.maxX + deltaX,
      minY: d.minY + deltaY, maxY: d.maxY + deltaY,
    });
  }, []);

  const stopPan = useCallback(() => {
    isPanRef.current = false;
    setIsPanning(false);
  }, []);

  // ── Point click (skip if was a pan drag) ───────────────────────────────────

  const handlePointClick = useCallback((pt) => {
    if (didPanRef.current) return;
    setLensAnchor(pt);
    onPointClick?.(pt);
  }, [onPointClick]);

  // ── Legend data ─────────────────────────────────────────────────────────────

  const legendData = useMemo(() => {
    if (!points.length) return [];
    if (colorBy === 'type') {
      const counts = {};
      points.forEach(p => { const t = p.entityType?.toUpperCase() ?? 'UNKNOWN'; counts[t] = (counts[t] || 0) + 1; });
      return Object.entries(counts).sort((a, b) => b[1] - a[1])
        .map(([type, count]) => ({ label: type, color: TYPE_COLORS[type] ?? '#6b7280', count }));
    }
    if (colorBy === 'layer') {
      const counts = {};
      points.forEach(p => { const l = p.epistemicLayer ?? 'N/A'; counts[l] = (counts[l] || 0) + 1; });
      const descs = LAYER_DESC[lang] ?? LAYER_DESC.en;
      return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]))
        .map(([layer, count]) => ({
          label: layer, sub: descs[layer] ?? (lang === 'en' ? 'No layer' : 'Нет слоя'),
          color: LAYER_COLORS[layer] ?? '#6b7280', count,
        }));
    }
    if (colorBy === 'doc') {
      const withDoc = points.filter(p => p.sourceDocumentId).length;
      return [
        { label: lang === 'en' ? 'Has source doc' : 'Есть документ', color: '#3b82f6', count: withDoc },
        { label: lang === 'en' ? 'No source doc'  : 'Нет документа', color: '#94a3b8', count: points.length - withDoc },
      ].filter(d => d.count > 0);
    }
    return [];
  }, [points, colorBy, lang]);

  const L = {
    method:    lang === 'en' ? 'Method' : 'Метод',
    colorBy:   lang === 'en' ? 'Color by' : 'Цвет по',
    points:    lang === 'en' ? 'Points' : 'Точки',
    compute:   lang === 'en' ? 'Compute' : 'Вычислить',
    computing: lang === 'en' ? 'Computing…' : 'Вычисление…',
    type:      lang === 'en' ? 'Entity Type' : 'Тип сущности',
    layerLbl:  lang === 'en' ? 'Epistemic Layer' : 'Эпистем. слой',
    doc:       lang === 'en' ? 'Document' : 'Документ',
    empty:     lang === 'en' ? 'Click "Compute" to generate the projection' : 'Нажмите "Вычислить" для генерации проекции',
    lensHint:  lang === 'en' ? 'Click a point to activate Semantic Lens' : 'Кликните на точку для Семантической линзы',
    umapMsg:   lang === 'en' ? 'UMAP manifold learning…' : 'UMAP — обучение на многообразии…',
    zoomIn:    lang === 'en' ? 'Zoom in' : 'Приближение',
    zoomOut:   lang === 'en' ? 'Zoom out' : 'Отдаление',
    resetZoom: lang === 'en' ? 'Reset zoom' : 'Сбросить масштаб',
    panHint:   lang === 'en' ? 'Drag to pan · Scroll to zoom' : 'Перетащите для панорамирования · Прокрутка — масштаб',
  };

  const lensActive = lensAnchor !== null;
  const anchorId   = lensAnchor ? String(lensAnchor.id) : null;

  const xDomain = activeDomain ? [activeDomain.minX, activeDomain.maxX] : ['auto', 'auto'];
  const yDomain = activeDomain ? [activeDomain.minY, activeDomain.maxY] : ['auto', 'auto'];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 1 }}>

      {/* ── Controls ── */}
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <InputLabel>{L.method}</InputLabel>
          <Select value={method} label={L.method} onChange={e => setMethod(e.target.value)}>
            <MenuItem value="pca">PCA</MenuItem>
            <MenuItem value="umap">UMAP</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>{L.colorBy}</InputLabel>
          <Select value={colorBy} label={L.colorBy} onChange={e => setColorBy(e.target.value)}>
            <MenuItem value="type">{L.type}</MenuItem>
            <MenuItem value="layer">{L.layerLbl}</MenuItem>
            <MenuItem value="doc">{L.doc}</MenuItem>
          </Select>
        </FormControl>

        <Box sx={{ flex: 1, minWidth: 140 }}>
          <Typography variant="caption" color="text.secondary">{L.points}: {nPoints}</Typography>
          <Slider size="small" value={nPoints} onChange={(_, v) => setNPoints(v)} min={50} max={2000} step={50} />
        </Box>

        <Button
          variant="contained" size="small"
          startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <Cpu size={14} />}
          onClick={fetchProjection} disabled={loading}
        >
          {loading ? L.computing : L.compute}
        </Button>
      </Box>

      {/* ── Errors / UMAP progress ── */}
      {error && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}
      {umapProgress !== null && (
        <Box>
          <Typography variant="caption" color="text.secondary">{L.umapMsg} {umapProgress}%</Typography>
          <LinearProgress variant="determinate" value={umapProgress} sx={{ mt: 0.5, borderRadius: 1 }} />
        </Box>
      )}

      {/* ── Chart row (chart + lens panel) ── */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', gap: 1 }}>

        {/* Chart */}
        <Box sx={{ flex: 1, minWidth: 0, position: 'relative' }}>
          {points.length === 0 && !loading ? (
            <Box sx={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'text.secondary', flexDirection: 'column', gap: 1,
            }}>
              <ZoomIn size={32} opacity={0.4} />
              <Typography variant="body2">{L.empty}</Typography>
            </Box>
          ) : (
            <>
              {/* Chart box — handles pan & wheel */}
              <Box
                ref={chartBoxRef}
                sx={{
                  position: 'absolute', inset: 0,
                  cursor: isPanning ? 'grabbing' : 'grab',
                  userSelect: 'none',
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={stopPan}
                onMouseLeave={stopPan}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 12, right: 16, bottom: 24, left: 16 }}>
                    <XAxis
                      type="number" dataKey="x"
                      domain={xDomain}
                      name={method === 'pca' ? 'PC1' : 'UMAP-1'}
                      tick={{ fontSize: 13, fill: '#64748b' }} tickLine={false}
                      axisLine={{ stroke: '#2d3748' }} tickFormatter={v => v.toFixed(2)}
                      label={{ value: method === 'pca' ? 'PC1' : 'UMAP-1', position: 'insideBottom', offset: -12, fontSize: 13, fill: '#94a3b8' }}
                      allowDataOverflow
                    />
                    <YAxis
                      type="number" dataKey="y"
                      domain={yDomain}
                      name={method === 'pca' ? 'PC2' : 'UMAP-2'}
                      tick={{ fontSize: 13, fill: '#64748b' }} tickLine={false}
                      axisLine={{ stroke: '#2d3748' }} tickFormatter={v => v.toFixed(2)}
                      label={{ value: method === 'pca' ? 'PC2' : 'UMAP-2', angle: -90, position: 'insideLeft', offset: 12, fontSize: 13, fill: '#94a3b8' }}
                      allowDataOverflow
                    />
                    <ZAxis range={[28, 28]} />
                    <Tooltip content={<ChartTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#475569' }} isAnimationActive={false} />
                    <Scatter
                      data={points}
                      onClick={handlePointClick}
                      isAnimationActive={false}
                      style={{ cursor: 'pointer' }}
                    >
                      {points.map((pt, i) => {
                        const id = String(pt.id ?? i);
                        const isAnchor = lensActive && id === anchorId;
                        const inLens   = lensActive && lensNeighbors?.has(id);
                        const dimmed   = lensActive && !isAnchor && !inLens;
                        return (
                          <Cell
                            key={id}
                            fill={isAnchor ? '#ffffff' : getColor(pt, colorBy)}
                            fillOpacity={dimmed ? 0.08 : 0.85}
                            stroke={isAnchor ? getColor(pt, colorBy) : 'none'}
                            strokeWidth={isAnchor ? 2 : 0}
                          />
                        );
                      })}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </Box>

              {/* Legend overlay — hide when lens active */}
              {!lensActive && <LegendPanel legendData={legendData} colorBy={colorBy} lang={lang} />}

              {/* Zoom controls */}
              <Box sx={{
                position: 'absolute', bottom: 34, right: 12,
                display: 'flex', flexDirection: 'column', gap: 0.25, zIndex: 5,
              }}>
                <MuiTooltip title={L.zoomIn} placement="left">
                  <IconButton size="small" onClick={() => handleZoomBtn(0.8)}
                    sx={{ bgcolor: '#0d1117', border: '1px solid #1e293b', color: '#64748b',
                          borderRadius: 1, p: 0.5, '&:hover': { color: '#e2e8f0', borderColor: '#334155' } }}>
                    <ZoomIn size={13} />
                  </IconButton>
                </MuiTooltip>
                <MuiTooltip title={L.zoomOut} placement="left">
                  <IconButton size="small" onClick={() => handleZoomBtn(1.25)}
                    sx={{ bgcolor: '#0d1117', border: '1px solid #1e293b', color: '#64748b',
                          borderRadius: 1, p: 0.5, '&:hover': { color: '#e2e8f0', borderColor: '#334155' } }}>
                    <ZoomOut size={13} />
                  </IconButton>
                </MuiTooltip>
                <MuiTooltip title={L.resetZoom} placement="left">
                  <span> {/* span wrapper needed when disabled */}
                    <IconButton size="small" onClick={() => setViewDomain(null)}
                      disabled={!viewDomain}
                      sx={{ bgcolor: '#0d1117', border: '1px solid #1e293b',
                            color: viewDomain ? '#3b82f6' : '#1e293b',
                            borderRadius: 1, p: 0.5, '&:hover': { color: '#e2e8f0', borderColor: '#334155' } }}>
                      <Maximize2 size={13} />
                    </IconButton>
                  </span>
                </MuiTooltip>
              </Box>

              {/* Pan / zoom hint (shown when no lens, bottom-center) */}
              {!lensActive && points.length > 0 && !viewDomain && (
                <Box sx={{
                  position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)',
                  bgcolor: 'rgba(13,17,23,0.75)', border: '1px solid #1e293b',
                  borderRadius: 1, px: 1, py: 0.25,
                  fontSize: 12, color: '#64748b', pointerEvents: 'none',
                }}>
                  {L.panHint}
                </Box>
              )}
            </>
          )}
        </Box>

        {/* Semantic Lens Panel */}
        {lensActive && (
          <SemanticLensPanel
            collection={collection}
            anchor={lensAnchor}
            onClose={() => { setLensAnchor(null); setLensNeighbors(null); }}
            onNeighborsChange={setLensNeighbors}
            lang={lang}
          />
        )}
      </Box>

      {/* ── Indicators bar ── */}
      <IndicatorsBar
        method={method}
        explained={explained}
        points={points}
        lensActive={lensActive}
        lang={lang}
        zoomLevel={zoomLevel}
        onResetZoom={() => setViewDomain(null)}
      />

    </Box>
  );
}
