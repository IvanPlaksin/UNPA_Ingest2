/**
 * QuotaAllocator — real-time pool-share allocation across active indexer sources.
 *
 * A horizontal bar split into one SEGMENT per active source; the segment WIDTH is
 * that source's share of the worker pool. The dividers between segments are
 * draggable — dragging one transfers share between its two neighbours (the bar
 * always sums to 100%). Each segment shows the source's abbreviated name (small
 * vertical text) and its current throughput + share as "docs/min · share%".
 *
 * Modes:
 *   • AUTO   — shares are computed on the API from live efficiency (guaranteed
 *              floor + efficiency surplus); the bar animates in real time and the
 *              dividers are read-only.
 *   • MANUAL — the admin drags the dividers; every change is pushed to the API
 *              immediately (throttled during drag, final on release).
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Stack, Typography, Switch, Tooltip, Box } from '@mui/material';
import { getQuota, setQuotaMode, setQuotaShares } from '../../../services/documentIndex.service';

// Distinct, theme-neutral segment colors (cycled).
const COLORS = ['#2563eb', '#16a34a', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#db2777', '#65a30d', '#ca8a04', '#4f46e5'];
const MIN_SHARE = 0.02;

function abbrev(name = '') {
  return name
    .replace(/^UN\s+ODS\s*[—–-]\s*/i, '')
    .replace(/^UN\s+/i, '')
    .replace(/\s+(Publications|Repository|Reports?|Documents?|Library|Collections?)\b/gi, '')
    .trim()
    .slice(0, 18) || name.slice(0, 18);
}

export default function QuotaAllocator() {
  const [data, setData] = useState(null);
  const [drag, setDrag] = useState(null);      // { shares:[...] } working copy while dragging
  const barRef = useRef(null);
  const dragRef = useRef(null);                // { boundary, startX, base:[...] }
  const lastPush = useRef(0);

  const load = useCallback(async () => {
    if (dragRef.current) return;               // don't clobber the bar mid-drag
    try { const r = await getQuota(); setData(r.data); } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, [load]);

  // Stable source order (by id) so segments don't jump between polls.
  const sources = React.useMemo(
    () => [...(data?.sources || [])].sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
    [data]
  );
  const mode = data?.mode || 'auto';
  const manual = mode === 'manual';

  const shares = drag ? drag.shares : sources.map(s => s.share);

  const pushShares = useCallback((sh) => {
    const body = {};
    sources.forEach((s, i) => { body[s.sourceId] = sh[i]; });
    setQuotaShares(body).then(r => { if (r?.data && !dragRef.current) setData(r.data); }).catch(() => {});
  }, [sources]);

  // ── divider drag ──
  const onDown = (boundary) => (e) => {
    if (!manual) return;
    e.preventDefault();
    const base = sources.map(s => s.share);
    dragRef.current = { boundary, startX: e.clientX, base };
    setDrag({ shares: base });
    document.body.style.userSelect = 'none';
  };
  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d || !barRef.current) return;
      const w = barRef.current.getBoundingClientRect().width || 1;
      const delta = (e.clientX - d.startX) / w;
      const i = d.boundary, j = i + 1;
      const pair = d.base[i] + d.base[j];
      let a = Math.max(MIN_SHARE, Math.min(pair - MIN_SHARE, d.base[i] + delta));
      const next = d.base.slice();
      next[i] = a; next[j] = pair - a;
      setDrag({ shares: next });
      const now = Date.now();
      if (now - lastPush.current > 150) { lastPush.current = now; pushShares(next); }  // live
    };
    const onUp = () => {
      const d = dragRef.current;
      if (!d) return;
      const final = (drag && drag.shares) || d.base;
      dragRef.current = null;
      document.body.style.userSelect = '';
      pushShares(final);
      setTimeout(() => setDrag(null), 300);   // let the server echo back before releasing local copy
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [drag, pushShares]);

  const toggleMode = async () => {
    try { const r = await setQuotaMode(manual ? 'auto' : 'manual'); setData(r.data); } catch { /* ignore */ }
  };

  // cumulative left offsets
  let acc = 0;
  const lefts = shares.map(s => { const l = acc; acc += s; return l; });

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <Typography variant="caption" fontWeight={700}
          sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.6rem' }}>
          Pool allocation
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.58rem' }}>
          {sources.length} active · pool {data?.poolSize ?? '—'}
        </Typography>
        <Box flex={1} />
        <Typography variant="caption" color={manual ? 'text.disabled' : 'success.main'} sx={{ fontSize: '0.6rem' }}>Auto</Typography>
        <Tooltip title={manual ? 'Switch to automatic (efficiency-based) allocation' : 'Switch to manual allocation (drag the dividers)'}>
          <Switch size="small" checked={manual} onChange={toggleMode} />
        </Tooltip>
        <Typography variant="caption" color={manual ? 'primary.main' : 'text.disabled'} sx={{ fontSize: '0.6rem' }}>Manual</Typography>
      </Stack>

      {sources.length === 0 ? (
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', py: 1.5, textAlign: 'center' }}>
          No active sources — nothing to allocate
        </Typography>
      ) : (
        <Box ref={barRef} sx={{ position: 'relative', height: 74, width: '100%',
          borderRadius: 1, overflow: 'hidden', border: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
          {sources.map((s, i) => {
            const color = COLORS[i % COLORS.length];
            const leftPct = lefts[i] * 100;
            const widthPct = shares[i] * 100;
            const wide = widthPct >= 9;
            return (
              <Box key={s.sourceId} sx={{
                position: 'absolute', top: 0, bottom: 0, left: `${leftPct}%`, width: `${widthPct}%`,
                bgcolor: color + '22', borderRight: i < sources.length - 1 ? '0' : 'none',
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                overflow: 'hidden', px: 0.25, py: 0.25,
              }}>
                {/* vertical abbreviated source name */}
                <Tooltip title={s.name}>
                  <Typography sx={{
                    writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                    fontSize: '0.55rem', fontWeight: 700, color, lineHeight: 1,
                    whiteSpace: 'nowrap', maxHeight: 46, overflow: 'hidden', alignSelf: 'flex-start',
                  }}>{abbrev(s.name)}</Typography>
                </Tooltip>
                {/* docs/min · share% */}
                <Typography sx={{ fontSize: '0.56rem', fontWeight: 600, color: 'text.secondary',
                  whiteSpace: 'nowrap', writingMode: wide ? 'horizontal-tb' : 'vertical-rl',
                  transform: wide ? 'none' : 'rotate(180deg)', alignSelf: wide ? 'center' : 'flex-end' }}>
                  {s.docsPerMin}/{Math.round(shares[i] * 100)}%
                </Typography>
              </Box>
            );
          })}
          {/* draggable dividers between segments */}
          {sources.slice(0, -1).map((s, i) => (
            <Box key={`d${i}`} onMouseDown={onDown(i)}
              sx={{
                position: 'absolute', top: 0, bottom: 0, left: `${(lefts[i] + shares[i]) * 100}%`,
                width: 9, ml: '-4.5px', zIndex: 2,
                cursor: manual ? 'col-resize' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                '&:hover .grip': manual ? { bgcolor: 'primary.main', width: 3 } : {},
              }}>
              <Box className="grip" sx={{ width: manual ? 2 : 1, height: '100%',
                bgcolor: manual ? 'text.secondary' : 'divider', transition: 'background-color .12s, width .12s' }} />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
