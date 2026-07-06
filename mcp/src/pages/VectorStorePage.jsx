import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, IconButton, Chip, TextField, InputAdornment,
  FormControl, InputLabel, Select, MenuItem, CircularProgress, Alert,
  Divider, Tooltip, Tab, Tabs,
} from '@mui/material';
import {
  Database, Search, RefreshCw, X, CheckSquare, Square,
  Layers, Activity, GitMerge, Boxes, BarChart2,
} from 'lucide-react';
import {
  listCollections, getCollectionInfo, browsePoints, semanticSearch, countPoints,
} from '../services/vectorStore.service';
import VectorProjection  from '../components/VectorStore/VectorProjection';
import SimilarityHeatmap from '../components/VectorStore/SimilarityHeatmap';
import KnnGraph          from '../components/VectorStore/KnnGraph';
import HelpPanel         from '../components/VectorStore/HelpPanel';
import CollectionStats   from '../components/VectorStore/CollectionStats';

// ── Palettes ──────────────────────────────────────────────────────────
const TYPE_COLORS = {
  ACTOR: '#3b82f6', ORGANIZATION: '#3b82f6', CONCEPT: '#06b6d4',
  DOCUMENT: '#8b5cf6', DOCUMENTREF: '#8b5cf6', EVENT: '#eab308',
  PROCESS: '#eab308', PERSON: '#22c55e', TECHNOLOGY: '#a855f7',
  POLICY: '#ef4444', SYSTEM: '#0891b2', WORK_ITEM: '#6b7280', UNKNOWN: '#6b7280',
};
const LAYER_COLORS = { L0: '#ef4444', L1: '#f97316', L2: '#eab308', L3: '#22c55e' };

function typeColor(t) { return TYPE_COLORS[(t ?? '').toUpperCase()] ?? '#6b7280'; }
function layerColor(l) { return LAYER_COLORS[l] ?? '#64748b'; }

// ── Point list item ──────────────────────────────────────────────────
function PointItem({ point, selected, checked, onClick, onCheck }) {
  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1,
        cursor: 'pointer', borderRadius: 1, mx: 1, mb: 0.5,
        bgcolor: selected ? 'rgba(59,130,246,0.15)' : 'transparent',
        border: selected ? '1px solid rgba(59,130,246,0.35)' : '1px solid transparent',
        '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
      }}
    >
      <Box onClick={e => { e.stopPropagation(); onCheck(); }}
           sx={{ color: checked ? 'primary.main' : '#475569', flexShrink: 0, cursor: 'pointer' }}>
        {checked ? <CheckSquare size={14} /> : <Square size={14} />}
      </Box>

      <Box sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: typeColor(point.entityType) }} />

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap variant="caption" fontWeight={500} display="block"
          sx={{ color: '#e2e8f0', fontSize: 13 }}>
          {point.name}
        </Typography>
        <Typography noWrap variant="caption" sx={{ color: '#64748b', fontSize: 13 }}>
          {point.entityType}
          {point.epistemicLayer && ` · ${point.epistemicLayer}`}
          {point.score != null && ` · ${point.score.toFixed(3)}`}
        </Typography>
      </Box>

      {point.epistemicLayer && (
        <Chip label={point.epistemicLayer} size="small"
          sx={{ height: 16, fontSize: 13, bgcolor: layerColor(point.epistemicLayer) + '22',
                color: layerColor(point.epistemicLayer), border: `1px solid ${layerColor(point.epistemicLayer)}44` }} />
      )}
    </Box>
  );
}

// ── Selected point detail card ───────────────────────────────────────
function PointDetail({ point, onClose }) {
  if (!point) return null;
  const fields = [
    ['ID',          String(point.id).slice(0, 16) + '…'],
    ['Type',        point.entityType],
    ['Layer',       point.epistemicLayer],
    ['Score',       point.score?.toFixed(4)],
    ['Model',       point.embeddingModel],
    ['Document',    point.sourceDocumentId?.slice(0, 16)],
    ['Methodology', point.methodologyId?.slice(0, 16)],
    ['Indexed',     point.indexedAt ? new Date(point.indexedAt).toLocaleString() : null],
  ].filter(([, v]) => v);

  return (
    <Box sx={{ mx: 1, mb: 1, p: 1.5, bgcolor: '#0f172a', borderRadius: 1, border: '1px solid #1e293b' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
        <Typography variant="caption" fontWeight="bold" color="primary.main" sx={{ wordBreak: 'break-all' }}>
          {point.name}
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ ml: 0.5, p: 0.25 }}>
          <X size={12} />
        </IconButton>
      </Box>
      {fields.map(([k, v]) => (
        <Box key={k} sx={{ display: 'flex', gap: 1, mb: 0.25 }}>
          <Typography variant="caption" color="text.secondary" sx={{ width: 72, flexShrink: 0, fontSize: 13 }}>
            {k}
          </Typography>
          <Typography variant="caption" sx={{ color: '#cbd5e1', fontSize: 13, wordBreak: 'break-all' }}>
            {v}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

// ── Language toggle button ────────────────────────────────────────────
function LangToggle({ lang, onToggle }) {
  return (
    <Box
      sx={{
        display: 'flex', border: '1px solid #1e293b', borderRadius: 1,
        overflow: 'hidden', flexShrink: 0,
      }}
    >
      {['en', 'ru'].map(l => (
        <Box
          key={l}
          onClick={() => onToggle(l)}
          sx={{
            px: 1.25, py: 0.4, cursor: 'pointer', fontSize: 13, fontWeight: 600,
            bgcolor: lang === l ? '#1e40af' : 'transparent',
            color:   lang === l ? '#e2e8f0' : '#64748b',
            transition: 'all 0.15s',
            '&:hover': { bgcolor: lang === l ? '#1e40af' : '#1e293b' },
          }}
        >
          {l.toUpperCase()}
        </Box>
      ))}
    </Box>
  );
}

// ── Main page ────────────────────────────────────────────────────────
export default function VectorStorePage() {
  // Collections
  const [collections, setCollections]   = useState([]);
  const [activeCol, setActiveCol]       = useState('documents_entities');
  const [colInfo, setColInfo]           = useState(null);
  const [colLoading, setColLoading]     = useState(false);

  // Points list
  const [points, setPoints]             = useState([]);
  const [listLoading, setListLoading]   = useState(false);
  const [listError, setListError]       = useState(null);
  const [nextOffset, setNextOffset]     = useState(null);
  const [totalCount, setTotalCount]     = useState(0);

  // Selection
  const [selectedId, setSelectedId]     = useState(null);
  const [checkedIds, setCheckedIds]     = useState(new Set());

  // Filters
  const [searchText, setSearchText]     = useState('');
  const [filterType, setFilterType]     = useState('');
  const [filterLayer, setFilterLayer]   = useState('');
  const [isSearchMode, setIsSearchMode] = useState(false);

  // UI state
  const [vizTab, setVizTab]   = useState(0);
  const [lang, setLang]       = useState('en');

  const selectedPoint = points.find(p => String(p.id) === String(selectedId));

  // Load collections on mount
  useEffect(() => {
    listCollections().then(cols => {
      setCollections(cols);
      if (cols.length > 0 && !cols.find(c => c.name === 'documents_entities')) {
        setActiveCol(cols[0].name);
      }
    }).catch(() => {});
  }, []);

  // Load collection info when activeCol changes
  useEffect(() => {
    if (!activeCol) return;
    setColLoading(true);
    Promise.all([
      getCollectionInfo(activeCol),
      countPoints(activeCol, null),
    ])
      .then(([info, count]) => { setColInfo(info); setTotalCount(count); })
      .catch(() => {})
      .finally(() => setColLoading(false));
  }, [activeCol]);

  function buildFilters() {
    const f = {};
    if (filterType)  f.entityType = filterType;
    if (filterLayer) f.epistemicLayer = filterLayer;
    return f;
  }

  const loadPoints = useCallback(async (append = false) => {
    setListLoading(true);
    setListError(null);
    try {
      let result;
      if (isSearchMode && searchText.trim()) {
        const pts = await semanticSearch(activeCol, searchText.trim(), {
          limit: 50, ...buildFilters(),
        });
        result = { points: pts, nextOffset: null };
      } else {
        result = await browsePoints(activeCol, {
          limit: 50,
          offset: append ? nextOffset : null,
          ...buildFilters(),
        });
      }
      setPoints(prev => append ? [...prev, ...result.points] : result.points);
      setNextOffset(result.nextOffset);
      if (!append) {
        const c = await countPoints(activeCol, buildFilters());
        setTotalCount(c);
        setSelectedId(null);
        setCheckedIds(new Set());
      }
    } catch (e) {
      setListError(e.message);
    } finally {
      setListLoading(false);
    }
  }, [activeCol, searchText, isSearchMode, filterType, filterLayer, nextOffset]);

  useEffect(() => { if (activeCol) loadPoints(false); }, [activeCol, filterType, filterLayer]);

  const handleSearch = () => {
    setIsSearchMode(!!searchText.trim());
    loadPoints(false);
  };
  const clearSearch = () => {
    setSearchText('');
    setIsSearchMode(false);
    loadPoints(false);
  };

  const toggleCheck = (id) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(String(id))) next.delete(String(id));
      else next.add(String(id));
      return next;
    });
  };

  const vizFilters = buildFilters();
  const checkedArr = Array.from(checkedIds);

  // Tab definitions
  const VIZ_TABS = [
    { label: 'Manifold',   icon: <Activity size={14} />,  helpKey: 'manifold'  },
    { label: 'Similarity', icon: <Layers size={14} />,    helpKey: 'similarity'},
    { label: 'k-NN Graph', icon: <GitMerge size={14} />,  helpKey: 'knn'       },
    { label: lang === 'en' ? 'Analytics' : 'Аналитика',
      icon: <BarChart2 size={14} />,                       helpKey: 'analytics' },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>

      {/* ── HEADER ── */}
      <Box sx={{
        px: 3, py: 1.5, borderBottom: '1px solid #1e293b',
        display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Boxes size={20} color="#3b82f6" />
          <Typography variant="h6" fontWeight="bold" sx={{ fontSize: '1rem' }}>
            Vector Store
          </Typography>
        </Box>

        {/* Collection selector */}
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Collection</InputLabel>
          <Select value={activeCol} label="Collection" onChange={e => setActiveCol(e.target.value)}>
            {collections.map(c => (
              <MenuItem key={c.name} value={c.name}>{c.name}</MenuItem>
            ))}
            {collections.length === 0 && (
              <MenuItem value="documents_entities">documents_entities</MenuItem>
            )}
          </Select>
        </FormControl>

        {/* Collection stats chips */}
        {colInfo && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip size="small" label={`${totalCount.toLocaleString()} pts`}
              sx={{ fontSize: 13, bgcolor: '#1e293b', color: '#94a3b8' }} />
            <Chip size="small" label={`${colInfo.vectorSize ?? '?'}-dim`}
              sx={{ fontSize: 13, bgcolor: '#1e293b', color: '#94a3b8' }} />
            {colInfo.distance && (
              <Chip size="small" label={colInfo.distance}
                sx={{ fontSize: 13, bgcolor: '#1e293b', color: '#94a3b8' }} />
            )}
          </Box>
        )}

        <Box sx={{ flex: 1 }} />

        {/* Language toggle */}
        <LangToggle lang={lang} onToggle={setLang} />

        <Tooltip title={lang === 'en' ? 'Refresh' : 'Обновить'}>
          <IconButton size="small" onClick={() => loadPoints(false)} disabled={listLoading}>
            <RefreshCw size={16} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* ── BODY ── */}
      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* ── LEFT PANEL ── */}
        <Box sx={{
          width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column',
          borderRight: '1px solid #1e293b', bgcolor: '#0d1117',
        }}>
          {/* Search */}
          <Box sx={{ p: 1.5, display: 'flex', gap: 1 }}>
            <TextField
              size="small" fullWidth
              placeholder={lang === 'en' ? 'Semantic search…' : 'Семантический поиск…'}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={14} color="#64748b" />
                  </InputAdornment>
                ),
                endAdornment: searchText && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={clearSearch}><X size={12} /></IconButton>
                  </InputAdornment>
                ),
              }}
              sx={{ '& .MuiOutlinedInput-root': { fontSize: 13 } }}
            />
            <Button size="small" variant="contained" onClick={handleSearch}
              sx={{ minWidth: 'auto', px: 1.5 }}>
              {lang === 'en' ? 'Go' : 'Найти'}
            </Button>
          </Box>

          {/* Filters */}
          <Box sx={{ px: 1.5, display: 'flex', flexDirection: 'column', gap: 1, pb: 1.5 }}>
            <FormControl size="small">
              <InputLabel>{lang === 'en' ? 'Entity Type' : 'Тип сущности'}</InputLabel>
              <Select value={filterType} label={lang === 'en' ? 'Entity Type' : 'Тип сущности'}
                onChange={e => setFilterType(e.target.value)}>
                <MenuItem value="">{lang === 'en' ? 'All' : 'Все'}</MenuItem>
                {['ACTOR','CONCEPT','DOCUMENT','DOCUMENTREF','EVENT','PERSON','POLICY',
                  'PROCESS','SYSTEM','TECHNOLOGY','WORK_ITEM'].map(t => (
                  <MenuItem key={t} value={t}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: typeColor(t) }} />
                      {t}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small">
              <InputLabel>{lang === 'en' ? 'Epistemic Layer' : 'Эпистемический слой'}</InputLabel>
              <Select value={filterLayer} label={lang === 'en' ? 'Epistemic Layer' : 'Эпистемический слой'}
                onChange={e => setFilterLayer(e.target.value)}>
                <MenuItem value="">{lang === 'en' ? 'All' : 'Все'}</MenuItem>
                {['L0','L1','L2','L3'].map(l => (
                  <MenuItem key={l} value={l}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: layerColor(l) }} />
                      {l}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Divider />

          {/* Points count + Select All */}
          <Box sx={{ px: 1.5, py: 0.75, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
              {isSearchMode
                ? `${lang === 'en' ? 'Results' : 'Результатов'}: ${points.length}`
                : `${points.length} / ${totalCount.toLocaleString()}`}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
              {points.length > 0 && (
                <Button
                  size="small" variant="outlined"
                  sx={{ fontSize: 13, px: 1, py: 0.25, minWidth: 'auto', height: 22, lineHeight: 1 }}
                  onClick={() => {
                    const allVisible = points.every(p => checkedIds.has(String(p.id)));
                    if (allVisible) {
                      setCheckedIds(new Set());
                    } else {
                      setCheckedIds(new Set(points.map(p => String(p.id))));
                    }
                  }}
                >
                  {points.every(p => checkedIds.has(String(p.id)))
                    ? (lang === 'en' ? 'Deselect all' : 'Снять все')
                    : (lang === 'en' ? 'Select all' : 'Выбрать все')}
                </Button>
              )}
              {checkedArr.length > 0 && (
                <Chip size="small"
                  label={`${checkedArr.length} ${lang === 'en' ? 'sel.' : 'выбр.'}`}
                  onDelete={() => setCheckedIds(new Set())}
                  sx={{ fontSize: 13, height: 18 }} color="primary" />
              )}
            </Box>
          </Box>

          {listError && (
            <Alert severity="error" sx={{ mx: 1.5, py: 0, fontSize: 13 }}>{listError}</Alert>
          )}

          {/* Points list */}
          <Box sx={{ flex: 1, overflowY: 'auto', py: 0.5 }}>
            {listLoading && points.length === 0 ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={24} />
              </Box>
            ) : (
              <>
                {points.map(pt => (
                  <PointItem
                    key={pt.id}
                    point={pt}
                    selected={String(pt.id) === String(selectedId)}
                    checked={checkedIds.has(String(pt.id))}
                    onClick={() => setSelectedId(prev => String(prev) === String(pt.id) ? null : pt.id)}
                    onCheck={() => toggleCheck(pt.id)}
                  />
                ))}

                {nextOffset && !isSearchMode && (
                  <Box sx={{ px: 1.5, py: 1 }}>
                    <Button fullWidth size="small" variant="outlined"
                      onClick={() => loadPoints(true)} disabled={listLoading}>
                      {listLoading ? <CircularProgress size={14} /> : (lang === 'en' ? 'Load more' : 'Загрузить ещё')}
                    </Button>
                  </Box>
                )}

                {points.length === 0 && !listLoading && (
                  <Box sx={{ px: 2, py: 4, textAlign: 'center', color: 'text.secondary' }}>
                    <Database size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
                    <Typography variant="body2">
                      {lang === 'en' ? 'No vectors found' : 'Векторы не найдены'}
                    </Typography>
                  </Box>
                )}
              </>
            )}
          </Box>

          {/* Selected point detail */}
          {selectedPoint && (
            <>
              <Divider />
              <PointDetail point={selectedPoint} onClose={() => setSelectedId(null)} />
            </>
          )}
        </Box>

        {/* ── RIGHT PANEL ── */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* Viz tab bar */}
          <Box sx={{ borderBottom: '1px solid #1e293b', px: 2 }}>
            <Tabs value={vizTab} onChange={(_, v) => setVizTab(v)} sx={{ minHeight: 40 }}>
              {VIZ_TABS.map(({ label, icon }, i) => (
                <Tab key={i} icon={icon} iconPosition="start" label={label}
                  sx={{ minHeight: 40, fontSize: 13, py: 0.5, gap: 0.5 }} />
              ))}
            </Tabs>
          </Box>

          {/* Viz content */}
          <Box sx={{ flex: 1, minHeight: 0, p: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 1 }}>

            {/* ── Tab 0: Manifold ── */}
            {vizTab === 0 && (
              <>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    {lang === 'en'
                      ? 'Embedding Manifold — PCA / UMAP projection of vector space'
                      : 'Многообразие эмбеддингов — проекция PCA / UMAP векторного пространства'}
                  </Typography>
                  <Chip size="small"
                    label={lang === 'en' ? 'Dimensionality Reduction' : 'Снижение размерности'}
                    sx={{ fontSize: 13, bgcolor: '#1e293b', color: '#64748b' }} />
                </Box>
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  <VectorProjection
                    collection={activeCol}
                    filters={vizFilters}
                    onPointClick={pt => setSelectedId(pt.id)}
                    lang={lang}
                  />
                </Box>
              </>
            )}

            {/* ── Tab 1: Similarity Heatmap ── */}
            {vizTab === 1 && (
              <>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    {lang === 'en'
                      ? 'Cosine Similarity Matrix — pairwise distances between selected vectors'
                      : 'Матрица косинусного сходства — попарные расстояния между выбранными векторами'}
                  </Typography>
                  <Chip size="small"
                    label={`${checkedArr.length} ${lang === 'en' ? 'checked' : 'отмечено'}`}
                    color={checkedArr.length >= 2 ? 'primary' : 'default'}
                    sx={{ fontSize: 13 }} />
                </Box>
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  <SimilarityHeatmap collection={activeCol} selectedIds={checkedArr} />
                </Box>
              </>
            )}

            {/* ── Tab 2: k-NN Graph ── */}
            {vizTab === 2 && (
              <>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    {lang === 'en'
                      ? 'k-NN Graph — 3D force-directed neighborhood topology'
                      : 'Граф k-NN — 3D топология соседства с принудительным расположением'}
                  </Typography>
                  <Chip size="small" label="Force Graph 3D"
                    sx={{ fontSize: 13, bgcolor: '#1e293b', color: '#64748b' }} />
                </Box>
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  <KnnGraph
                    collection={activeCol}
                    filters={vizFilters}
                    onNodeClick={node => setSelectedId(node.id)}
                  />
                </Box>
              </>
            )}

            {/* ── Tab 3: Analytics ── */}
            {vizTab === 3 && (
              <>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    {lang === 'en'
                      ? 'Collection Analytics — distribution analysis and quality indicators'
                      : 'Аналитика коллекции — анализ распределений и показатели качества'}
                  </Typography>
                  <Chip size="small"
                    label={lang === 'en' ? 'Vector Store Insights' : 'Инсайты векторного хранилища'}
                    sx={{ fontSize: 13, bgcolor: '#1e293b', color: '#64748b' }} />
                </Box>
                <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                  <CollectionStats
                    collection={activeCol}
                    totalCount={totalCount}
                    lang={lang}
                  />
                </Box>
              </>
            )}
          </Box>
          <HelpPanel tab={['manifold', 'similarity', 'knn', 'analytics'][vizTab] ?? 'manifold'} lang={lang} />
        </Box>
      </Box>
    </Box>
  );
}
