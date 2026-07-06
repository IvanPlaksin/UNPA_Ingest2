import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Box, Typography, Button, CircularProgress, Alert, Tooltip } from '@mui/material';
import { BarChart2 } from 'lucide-react';
import { computeSimilarity } from '../../services/vectorStore.service';

// Color: cold (#1e293b) → mid (#3b82f6) → hot (#ef4444)
function simToColor(v) {
  const t = Math.max(0, Math.min(1, v));
  if (t < 0.5) {
    const f = t * 2;
    return `rgb(${Math.round(30 + f * (59 - 30))},${Math.round(41 + f * (130 - 41))},${Math.round(59 + f * (246 - 59))})`;
  }
  const f = (t - 0.5) * 2;
  return `rgb(${Math.round(59 + f * (239 - 59))},${Math.round(130 + f * (68 - 130))},${Math.round(246 + f * (68 - 246))})`;
}

export default function SimilarityHeatmap({ collection, selectedIds = [] }) {
  const canvasRef  = useRef(null);
  const [loading, setLoading]  = useState(false);
  const [error, setError]      = useState(null);
  const [matrixData, setMatrix] = useState(null);
  const [hovered, setHovered]  = useState(null);

  const compute = useCallback(async () => {
    if (selectedIds.length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const result = await computeSimilarity(collection, selectedIds.slice(0, 50));
      setMatrix(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [collection, selectedIds]);

  // Draw on canvas whenever matrixData changes
  useEffect(() => {
    if (!matrixData || !canvasRef.current) return;
    const { matrix, labels } = matrixData;
    const N = matrix.length;
    if (N === 0) return;

    const canvas = canvasRef.current;
    const LABEL_W = 90;
    const CELL    = Math.max(12, Math.min(40, Math.floor((canvas.width - LABEL_W) / N)));
    const GRID_W  = CELL * N;
    const GRID_H  = CELL * N;

    canvas.height = GRID_H + LABEL_W;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw cells
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const v = matrix[r][c];
        ctx.fillStyle = simToColor(v);
        ctx.fillRect(LABEL_W + c * CELL, r * CELL, CELL, CELL);

        if (CELL >= 20) {
          ctx.fillStyle = v > 0.6 ? '#0f172a' : '#e2e8f0';
          ctx.font = `${Math.max(8, CELL * 0.35)}px Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(v.toFixed(2), LABEL_W + c * CELL + CELL / 2, r * CELL + CELL / 2);
        }
      }
    }

    // Row labels
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let r = 0; r < N; r++) {
      const name = labels[r]?.name?.slice(0, 14) ?? String(r);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(name, LABEL_W - 4, r * CELL + CELL / 2);
    }

    // Column labels (rotated)
    ctx.save();
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'left';
    for (let c = 0; c < N; c++) {
      const name = labels[c]?.name?.slice(0, 10) ?? String(c);
      ctx.save();
      ctx.translate(LABEL_W + c * CELL + CELL / 2, GRID_H + 4);
      ctx.rotate(-Math.PI / 3);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(name, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }, [matrixData]);

  const handleMouseMove = useCallback((e) => {
    if (!matrixData || !canvasRef.current) return;
    const { matrix, labels } = matrixData;
    const N    = matrix.length;
    const rect = canvasRef.current.getBoundingClientRect();
    const LABEL_W = 90;
    const CELL    = Math.max(12, Math.min(40, Math.floor((canvasRef.current.width - LABEL_W) / N)));
    const mx = (e.clientX - rect.left) * (canvasRef.current.width / rect.width);
    const my = (e.clientY - rect.top)  * (canvasRef.current.height / rect.height);
    const col = Math.floor((mx - LABEL_W) / CELL);
    const row = Math.floor(my / CELL);
    if (col >= 0 && col < N && row >= 0 && row < N) {
      setHovered({ row, col, value: matrix[row][col], rowName: labels[row]?.name, colName: labels[col]?.name });
    } else {
      setHovered(null);
    }
  }, [matrixData]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 1.5 }}>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Select points in the list ({selectedIds.length} selected, max 50)
        </Typography>
        <Button
          variant="contained" size="small"
          startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <BarChart2 size={14} />}
          onClick={compute}
          disabled={loading || selectedIds.length < 2}
        >
          {loading ? 'Computing…' : 'Compute Matrix'}
        </Button>
      </Box>

      {/* Color scale legend */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>0.0</Typography>
        <Box sx={{
          width: 180, height: 10, borderRadius: 1,
          background: 'linear-gradient(to right, #1e293b, #3b82f6, #ef4444)',
          border: '1px solid #334155',
        }} />
        <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>1.0</Typography>
        <Typography variant="caption" sx={{ color: '#64748b', fontSize: 13, ml: 1 }}>
          cosine similarity
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}

      {/* Hover tooltip */}
      {hovered && (
        <Box sx={{ bgcolor: '#1e293b', border: '1px solid #334155', p: 1, borderRadius: 1, fontSize: 13 }}>
          <span style={{ color: '#94a3b8' }}>{hovered.rowName}</span>
          {' ↔ '}
          <span style={{ color: '#94a3b8' }}>{hovered.colName}</span>
          {' = '}
          <span style={{ color: '#e2e8f0', fontWeight: 'bold' }}>{hovered.value?.toFixed(4)}</span>
        </Box>
      )}

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative' }}>
        {!matrixData && !loading ? (
          <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                     color: 'text.secondary', flexDirection: 'column', gap: 1 }}>
            <BarChart2 size={32} />
            <Typography variant="body2">
              Select ≥ 2 points and click "Compute Matrix"
            </Typography>
          </Box>
        ) : (
          <Box sx={{ overflow: 'auto', height: '100%' }}>
            <canvas
              ref={canvasRef}
              width={600}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHovered(null)}
              style={{ display: 'block', cursor: 'crosshair' }}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}
