/**
 * EnrichProgressModal
 * Shows real-time progress of background metadata enrichment.
 * Subscribes to SSE stream from /api/v1/source-catalog/:id/enrich/:jobId/progress
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Stack, Chip, LinearProgress,
  Box, Divider, Alert
} from '@mui/material';
import { CheckCircle, AlertCircle, Clock, Download, X } from 'lucide-react';
import { getEnrichProgressUrl } from '../../../services/sourceCatalog.service';

function ItemRow({ item }) {
  const icon = item.status === 'done'
    ? <CheckCircle size={14} color="#22c55e" />
    : item.status === 'error'
    ? <AlertCircle size={14} color="#ef4444" />
    : item.status === 'fetching'
    ? <Download size={14} style={{ opacity: 0.6 }} />
    : <Clock size={14} style={{ opacity: 0.35 }} />;

  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 0.4 }}>
      {icon}
      <Typography variant="caption" noWrap flex={1} title={item.title}
        sx={{ color: item.status === 'error' ? 'error.main' : 'text.primary' }}>
        {item.title}
      </Typography>
      {item.status === 'done' && item.fields?.length > 0 && (
        <Stack direction="row" spacing={0.5}>
          {item.fields.slice(0, 3).map(f => (
            <Chip key={f} label={f} size="small"
              sx={{ fontSize: '0.58rem', height: 16, bgcolor: 'success.dark', color: '#fff' }} />
          ))}
          {item.fields.length > 3 && (
            <Chip label={`+${item.fields.length - 3}`} size="small"
              sx={{ fontSize: '0.58rem', height: 16 }} />
          )}
        </Stack>
      )}
      {item.status === 'error' && (
        <Typography variant="caption" color="error.main" sx={{ fontSize: '0.62rem', maxWidth: 180 }} noWrap title={item.error}>
          {item.error}
        </Typography>
      )}
    </Stack>
  );
}

export default function EnrichProgressModal({ open, onClose, sourceId, jobId, initialItems = [] }) {
  const [items,    setItems]    = useState(() =>
    initialItems.map(it => ({ id: it.id, title: it.title || it.id, status: 'pending', fields: [], error: null }))
  );
  const [done,     setDone]     = useState(0);
  const [total,    setTotal]    = useState(initialItems.length);
  const [errors,   setErrors]   = useState(0);
  const [finished, setFinished] = useState(false);
  const [connErr,  setConnErr]  = useState(null);
  const esRef      = useRef(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    if (!open || !sourceId || !jobId) return;

    // Reset state
    setItems(initialItems.map(it => ({ id: it.id, title: it.title || it.id, status: 'pending', fields: [], error: null })));
    setDone(0);
    setTotal(initialItems.length);
    setErrors(0);
    setFinished(false);
    setConnErr(null);
    finishedRef.current = false;

    const url = getEnrichProgressUrl(sourceId, jobId);
    const es  = new EventSource(url);
    esRef.current = es;

    const handle = (event) => {
      let payload;
      try { payload = JSON.parse(event.data); } catch { return; }

      if (payload.type === 'status') {
        // Initial snapshot
        setTotal(payload.total || initialItems.length);
        setDone(payload.done || 0);
        setErrors(payload.errors || 0);
        if (payload.items) {
          setItems(payload.items.map(it => ({ ...it, fields: [], error: null })));
        }
        return;
      }

      if (payload.type === 'item-start') {
        setItems(prev => prev.map(it => it.id === payload.id ? { ...it, status: 'fetching' } : it));
        return;
      }

      if (payload.type === 'item-done') {
        setDone(payload.done);
        setItems(prev => prev.map(it =>
          it.id === payload.id ? { ...it, status: 'done', fields: payload.fields || [], enriched: payload.enriched } : it
        ));
        return;
      }

      if (payload.type === 'item-error') {
        setDone(payload.done);
        setErrors(e => e + 1);
        setItems(prev => prev.map(it =>
          it.id === payload.id ? { ...it, status: 'error', error: payload.error } : it
        ));
        return;
      }

      if (payload.type === 'complete') {
        setDone(payload.done);
        setErrors(payload.errors || 0);
        setFinished(true);
        finishedRef.current = true;
        es.close();
      }

      if (payload.type === 'error') {
        setConnErr(payload.error || 'Unknown error');
        es.close();
      }
    };

    es.addEventListener('progress', handle);
    es.addEventListener('done', handle);
    es.onerror = () => {
      if (!finishedRef.current) setConnErr('Connection lost. Processing continues in background.');
      es.close();
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourceId, jobId]);

  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <Dialog open={open} onClose={finished || connErr ? onClose : undefined}
      maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>

      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Typography variant="subtitle1" fontWeight={700}>Fetching Metadata</Typography>
        {(finished || connErr) && (
          <Button size="small" onClick={onClose} sx={{ minWidth: 32 }}><X size={15} /></Button>
        )}
      </DialogTitle>

      <DialogContent sx={{ pt: 0 }}>
        {/* Progress bar */}
        <Box sx={{ mb: 1.5 }}>
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {finished ? 'Complete' : `Processing… ${done} / ${total}`}
            </Typography>
            {errors > 0 && (
              <Typography variant="caption" color="error.main">{errors} errors</Typography>
            )}
          </Stack>
          <LinearProgress
            variant="determinate"
            value={progress}
            color={finished ? (errors > 0 ? 'warning' : 'success') : 'primary'}
            sx={{ borderRadius: 1, height: 6 }}
          />
        </Box>

        {connErr && (
          <Alert severity="warning" sx={{ mb: 1.5, fontSize: '0.75rem' }}>{connErr}</Alert>
        )}

        {finished && (
          <Alert severity={errors > 0 ? 'warning' : 'success'} sx={{ mb: 1.5, fontSize: '0.75rem' }}>
            {errors > 0
              ? `Done — ${done - errors} enriched, ${errors} failed`
              : `All ${done} documents enriched successfully`}
          </Alert>
        )}

        {/* Item list */}
        <Divider sx={{ mb: 1 }} />
        <Box sx={{ maxHeight: 320, overflow: 'auto' }}>
          {items.map(item => (
            <ItemRow key={item.id} item={item} />
          ))}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2.5, pb: 2 }}>
        {finished || connErr ? (
          <Button variant="contained" size="small" onClick={onClose}>Done</Button>
        ) : (
          <Typography variant="caption" color="text.disabled">
            Running in background — you can close this dialog safely
          </Typography>
        )}
        {!finished && !connErr && (
          <Button size="small" onClick={onClose}>Close</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
