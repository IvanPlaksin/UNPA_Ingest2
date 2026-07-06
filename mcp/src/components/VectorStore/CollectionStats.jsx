import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Chip, CircularProgress, Alert, Divider, IconButton, Tooltip,
} from '@mui/material';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  Tooltip as RTooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { RefreshCw, Database, FileText, Cpu, Layers, Calendar } from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL } from '../../config/api.config';

const base = `${API_BASE_URL}/vectors`;

const TYPE_COLORS = {
  ACTOR: '#3b82f6', ORGANIZATION: '#3b82f6', CONCEPT: '#06b6d4',
  DOCUMENT: '#8b5cf6', DOCUMENTREF: '#8b5cf6', EVENT: '#eab308',
  PROCESS: '#eab308', PERSON: '#22c55e', TECHNOLOGY: '#a855f7',
  POLICY: '#ef4444', SYSTEM: '#0891b2', WORK_ITEM: '#6b7280', UNKNOWN: '#6b7280',
};
const LAYER_COLORS = {
  L0: '#ef4444', L1: '#f97316', L2: '#eab308', L3: '#22c55e',
};
const FALLBACK_COLORS = [
  '#3b82f6', '#06b6d4', '#8b5cf6', '#22c55e', '#eab308', '#ef4444', '#a855f7', '#0891b2',
];

function typeColor(name) {
  return TYPE_COLORS[(name ?? '').toUpperCase()] ?? FALLBACK_COLORS[0];
}
function layerColor(name) {
  return LAYER_COLORS[name] ?? FALLBACK_COLORS[1];
}

// ── Metric chip ──────────────────────────────────────────────────────────────

function MetricCard({ icon: Icon, label, value, sub, color = '#3b82f6' }) {
  return (
    <Box sx={{
      flex: '1 1 120px', minWidth: 100,
      bgcolor: '#0f172a', border: '1px solid #1e293b', borderRadius: 1.5,
      px: 1.5, py: 1, display: 'flex', flexDirection: 'column', gap: 0.25,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
        <Icon size={13} color={color} />
        <Typography variant="caption" sx={{ color: '#64748b', fontSize: 12 }}>{label}</Typography>
      </Box>
      <Typography variant="body2" fontWeight="bold" sx={{ color: '#e2e8f0', fontSize: 15 }}>
        {value ?? '—'}
      </Typography>
      {sub && (
        <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 12 }}>{sub}</Typography>
      )}
    </Box>
  );
}

// ── Custom recharts tooltip ──────────────────────────────────────────────────

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { name, count } = payload[0]?.payload ?? {};
  return (
    <Box sx={{ bgcolor: '#1e293b', border: '1px solid #334155', borderRadius: 1, p: 1, fontSize: 13 }}>
      <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{name}</span>
      <span style={{ color: '#94a3b8' }}> — </span>
      <span style={{ color: '#3b82f6', fontWeight: 600 }}>{count}</span>
    </Box>
  );
}

function PieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { name, count } = payload[0]?.payload ?? {};
  const pct = payload[0]?.value;
  return (
    <Box sx={{ bgcolor: '#1e293b', border: '1px solid #334155', borderRadius: 1, p: 1, fontSize: 13 }}>
      <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{name}</span>
      <br />
      <span style={{ color: '#94a3b8' }}>count: </span>
      <span style={{ color: '#e2e8f0' }}>{count}</span>
    </Box>
  );
}

// ── Label content for recharts custom labels ─────────────────────────────────

function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, name, percent }) {
  if (percent < 0.06) return null;
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#f1f5f9" textAnchor="middle" dominantBaseline="central"
      style={{ fontSize: 13, fontWeight: 700 }}>
      {name}
    </text>
  );
}

// ── Bilingual labels ─────────────────────────────────────────────────────────

const LABELS = {
  en: {
    title:       'Collection Analytics',
    totalVectors:'Total Vectors',
    sampleOf:    'sample of',
    documents:   'Source Documents',
    methodologies:'Methodologies',
    models:      'Embedding Models',
    indexedRange:'Indexed Range',
    noDate:      'no date metadata',
    typeDistrib: 'Entity Type Distribution',
    layerDistrib:'Epistemic Layer Distribution',
    modelDistrib:'Embedding Model',
    noData:      'No data — collection may be empty or payloads missing metadata.',
    loading:     'Computing statistics…',
  },
  ru: {
    title:       'Аналитика коллекции',
    totalVectors:'Всего векторов',
    sampleOf:    'выборка из',
    documents:   'Исходные документы',
    methodologies:'Методологии',
    models:      'Модели эмбеддингов',
    indexedRange:'Диапазон индексации',
    noDate:      'метаданных даты нет',
    typeDistrib: 'Распределение по типам сущностей',
    layerDistrib:'Распределение по эпистемическим слоям',
    modelDistrib:'Модель эмбеддинга',
    noData:      'Нет данных — коллекция может быть пустой или у полезной нагрузки отсутствуют метаданные.',
    loading:     'Вычисление статистики…',
  },
};

// ── Main Component ───────────────────────────────────────────────────────────

export default function CollectionStats({ collection, totalCount = 0, lang = 'en' }) {
  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const L = LABELS[lang] ?? LABELS.en;

  const fetchStats = useCallback(async () => {
    if (!collection) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.get(`${base}/collections/${collection}/stats`);
      setStats(data.data);
    } catch (e) {
      setError(e.response?.data?.error?.message ?? e.message);
    } finally {
      setLoading(false);
    }
  }, [collection]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 4, justifyContent: 'center' }}>
        <CircularProgress size={20} />
        <Typography variant="body2" color="text.secondary">{L.loading}</Typography>
      </Box>
    );
  }

  if (error) return <Alert severity="error" sx={{ m: 1 }}>{error}</Alert>;

  if (!stats) return null;

  const dateMin = stats.indexedRange?.min ? new Date(stats.indexedRange.min).toLocaleDateString() : null;
  const dateMax = stats.indexedRange?.max ? new Date(stats.indexedRange.max).toLocaleDateString() : null;
  const dateLabel = dateMin
    ? (dateMin === dateMax ? dateMin : `${dateMin} – ${dateMax}`)
    : L.noDate;

  // Build PieChart data for layers (fill gaps with 0)
  const allLayers = ['L0', 'L1', 'L2', 'L3'];
  const layerMap  = Object.fromEntries((stats.layerDistribution ?? []).map(d => [d.name, d.count]));
  const layerData = allLayers.map(l => ({ name: l, count: layerMap[l] ?? 0 })).filter(d => d.count > 0);

  // Bar chart for entity types (top 12)
  const typeData = (stats.typeDistribution ?? []).slice(0, 12);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pb: 2 }}>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="subtitle2" fontWeight="bold" color="text.secondary" sx={{ flex: 1 }}>
          {L.title}
        </Typography>
        <Tooltip title={lang === 'en' ? 'Refresh statistics' : 'Обновить статистику'}>
          <IconButton size="small" onClick={fetchStats} disabled={loading}>
            <RefreshCw size={13} />
          </IconButton>
        </Tooltip>
        {stats.sampleSize < totalCount && (
          <Chip size="small"
            label={`${L.sampleOf} ${totalCount.toLocaleString()}`}
            sx={{ fontSize: 12, height: 18, bgcolor: '#1e293b', color: '#64748b' }} />
        )}
      </Box>

      {/* Key metrics row */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <MetricCard icon={Database}  label={L.totalVectors}  value={totalCount.toLocaleString()}
          sub={stats.sampleSize < totalCount ? `${L.sampleOf} ${stats.sampleSize}` : undefined}
          color="#3b82f6" />
        <MetricCard icon={FileText}  label={L.documents}     value={stats.documentCount}        color="#06b6d4" />
        <MetricCard icon={Layers}    label={L.methodologies}  value={stats.methodologyCount}     color="#8b5cf6" />
        <MetricCard icon={Cpu}       label={L.models}
          value={stats.modelDistribution?.length ?? 0}
          sub={stats.modelDistribution?.[0]?.name?.replace('intfloat/', '')} color="#a855f7" />
        <MetricCard icon={Calendar}  label={L.indexedRange}   value={dateLabel}                  color="#22c55e" />
      </Box>

      {(!stats.typeDistribution?.length && !layerData.length) ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
          {L.noData}
        </Typography>
      ) : (
        <>
          {/* ── Entity Type Distribution (bar chart) ── */}
          {typeData.length > 0 && (
            <Box>
              <Typography variant="caption" fontWeight={700}
                sx={{ display: 'block', mb: 1, fontSize: 13, color: '#cbd5e1' }}>
                {L.typeDistrib}
              </Typography>
              <ResponsiveContainer width="100%" height={Math.max(160, typeData.length * 28)}>
                <BarChart data={typeData} layout="vertical"
                  margin={{ top: 0, right: 24, bottom: 0, left: 90 }}>
                  <XAxis type="number" tick={{ fontSize: 13, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={85}
                    tick={{ fontSize: 13, fill: '#cbd5e1' }} axisLine={false} tickLine={false} />
                  <RTooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} isAnimationActive={false} />
                  <Bar dataKey="count" radius={[0, 3, 3, 0]} maxBarSize={18}>
                    {typeData.map((d, i) => (
                      <Cell key={i} fill={typeColor(d.name)} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>
          )}

          <Divider sx={{ borderColor: '#1e293b' }} />

          {/* ── Bottom row: Layer pie + Model chips ── */}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>

            {/* Epistemic Layer Pie */}
            {layerData.length > 0 && (
              <Box sx={{ flex: '1 1 180px', minWidth: 150 }}>
                <Typography variant="caption" fontWeight={700}
                  sx={{ display: 'block', mb: 0.5, fontSize: 13, color: '#cbd5e1' }}>
                  {L.layerDistrib}
                </Typography>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={layerData} dataKey="count" nameKey="name" cx="50%" cy="50%"
                      innerRadius={38} outerRadius={70}
                      labelLine={false} label={<PieLabel />}>
                      {layerData.map((d, i) => (
                        <Cell key={i} fill={layerColor(d.name)} fillOpacity={0.85} />
                      ))}
                    </Pie>
                    <RTooltip content={<PieTooltip />} isAnimationActive={false} />
                    <Legend
                      formatter={(value, entry) => (
                        <span style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 500 }}>
                          {value} ({entry.payload?.count})
                        </span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            )}

            {/* Model distribution (chip list) */}
            {stats.modelDistribution?.length > 0 && (
              <Box sx={{ flex: '1 1 180px', minWidth: 150 }}>
                <Typography variant="caption" fontWeight={600} color="text.secondary"
                  sx={{ display: 'block', mb: 1, fontSize: 13 }}>
                  {L.modelDistrib}
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  {stats.modelDistribution.map((m, i) => {
                    const total = stats.modelDistribution.reduce((s, x) => s + x.count, 0);
                    const pct   = total ? Math.round((m.count / total) * 100) : 0;
                    return (
                      <Box key={i} sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="caption"
                            sx={{ color: '#94a3b8', fontSize: 12,
                                 maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {m.name}
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#64748b', fontSize: 12 }}>
                            {m.count} ({pct}%)
                          </Typography>
                        </Box>
                        <Box sx={{ height: 4, bgcolor: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                          <Box sx={{
                            width: `${pct}%`, height: '100%', borderRadius: 2,
                            bgcolor: FALLBACK_COLORS[i % FALLBACK_COLORS.length],
                          }} />
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}
