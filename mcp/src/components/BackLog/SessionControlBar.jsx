/**
 * SessionControlBar — Top control bar for BackLog page
 * Shows session control (max parallel slider, running/queued count, stop all)
 * and houses the NotificationBell on the right side.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Slider,
  Button,
  Chip,
  Stack,
  Tooltip,
  CircularProgress,
  IconButton
} from '@mui/material';
import {
  StopCircle,
  PlayArrow,
  Pause,
  Stop,
  RocketLaunch
} from '@mui/icons-material';
import api from '../../services/api';
import NotificationBell from './NotificationBell';

export default function SessionControlBar({ selectedItem, onAnalyze }) {
  const [maxParallel, setMaxParallel] = useState(3);
  const [sessionStatus, setSessionStatus] = useState({ running: 0, queued: 0 });
  const [runningSessions, setRunningSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [enqueuing, setEnqueuing] = useState(false);
  const [pausingAll, setPausingAll] = useState(false);
  const [pausingId, setPausingId] = useState(null);
  const [stoppingId, setStoppingId] = useState(null);
  const sliderCommitRef = useRef(null);

  const fetchSessionStatus = useCallback(async () => {
    try {
      const res = await api.get('/sessions/status');
      const data = res.data?.data || res.data || {};
      setSessionStatus({
        running: data.running || 0,
        queued: data.queued || 0
      });
      if (data.maxParallel) {
        setMaxParallel(data.maxParallel);
      }
      // Populate running session chips if the API returns them
      if (Array.isArray(data.sessions)) {
        setRunningSessions(data.sessions.filter(
          (s) => s.status === 'RUNNING' || s.status === 'PAUSED'
        ));
      }
    } catch (err) {
      // Silently handle — session endpoint may not be available yet
      console.debug('Session status fetch failed:', err.message);
    }
  }, []);

  useEffect(() => {
    fetchSessionStatus();
    const interval = setInterval(fetchSessionStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchSessionStatus]);

  // Slider: local state for smooth drag, commit on release
  const handleSliderChange = (_event, newValue) => {
    setMaxParallel(newValue);
  };

  const handleSliderCommit = async (_event, newValue) => {
    if (sliderCommitRef.current) clearTimeout(sliderCommitRef.current);
    setLoading(true);
    try {
      await api.post('/sessions/max-parallel', { maxParallel: newValue });
    } catch (err) {
      console.error('Failed to set max parallel:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartSelected = async () => {
    if (!selectedItem?.backlogId) return;
    setEnqueuing(true);
    try {
      await api.post('/sessions/enqueue', {
        backlogId: selectedItem.backlogId,
        mode: 'PLANNING'
      });
      await fetchSessionStatus();
    } catch (err) {
      console.error('Failed to enqueue task:', err.message);
    } finally {
      setEnqueuing(false);
    }
  };

  const handlePauseAll = async () => {
    setPausingAll(true);
    try {
      // Pause each running session
      const running = runningSessions.filter((s) => s.status === 'RUNNING');
      await Promise.allSettled(
        running.map((s) => api.post(`/sessions/${s.id}/pause`))
      );
      // If no individual sessions known, try bulk endpoint
      if (running.length === 0 && sessionStatus.running > 0) {
        await api.post('/sessions/pause-all');
      }
      await fetchSessionStatus();
    } catch (err) {
      console.error('Failed to pause sessions:', err.message);
    } finally {
      setPausingAll(false);
    }
  };

  const handlePauseSession = async (sessionId) => {
    setPausingId(sessionId);
    try {
      await api.post(`/sessions/${sessionId}/pause`);
      await fetchSessionStatus();
    } catch (err) {
      console.error('Failed to pause session:', err.message);
    } finally {
      setPausingId(null);
    }
  };

  const handleResumeSession = async (sessionId) => {
    setPausingId(sessionId);
    try {
      await api.post(`/sessions/${sessionId}/resume`);
      await fetchSessionStatus();
    } catch (err) {
      console.error('Failed to resume session:', err.message);
    } finally {
      setPausingId(null);
    }
  };

  const handleStopSession = async (sessionId) => {
    setStoppingId(sessionId);
    try {
      await api.post(`/sessions/${sessionId}/stop`);
      await fetchSessionStatus();
    } catch (err) {
      console.error('Failed to stop session:', err.message);
    } finally {
      setStoppingId(null);
    }
  };

  const handleStopAll = async () => {
    setStopping(true);
    try {
      await api.post('/sessions/stop-all');
      await fetchSessionStatus();
    } catch (err) {
      console.error('Failed to stop sessions:', err.message);
    } finally {
      setStopping(false);
    }
  };

  const hasActiveSessions = sessionStatus.running > 0 || sessionStatus.queued > 0;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 2,
        py: 1,
        mb: 1,
        bgcolor: (theme) =>
          theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : '#fafafa',
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider'
      }}
    >
      {/* Left: Session Controls */}
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: 1, flexWrap: 'wrap' }}>
        {/* Start Selected */}
        <Tooltip title={selectedItem?.backlogId
          ? `Enqueue "${selectedItem.title || selectedItem.backlogId}" for execution`
          : 'Select a backlog item first'}>
          <span>
            <Button
              size="small"
              color="success"
              variant="contained"
              onClick={handleStartSelected}
              disabled={!selectedItem?.backlogId || enqueuing}
              startIcon={enqueuing ? <CircularProgress size={14} /> : <RocketLaunch />}
              sx={{ fontSize: 11, textTransform: 'none', minWidth: 'auto' }}
            >
              Start Selected
            </Button>
          </span>
        </Tooltip>

        {/* Pause All */}
        <Tooltip title="Pause all running sessions">
          <span>
            <Button
              size="small"
              color="warning"
              variant="outlined"
              onClick={handlePauseAll}
              disabled={pausingAll || sessionStatus.running === 0}
              startIcon={pausingAll ? <CircularProgress size={14} /> : <Pause />}
              sx={{ fontSize: 11, textTransform: 'none', minWidth: 'auto' }}
            >
              Pause All
            </Button>
          </span>
        </Tooltip>

        {/* Stop All */}
        <Tooltip title="Stop all running and queued sessions">
          <span>
            <Button
              size="small"
              color="error"
              variant="outlined"
              onClick={handleStopAll}
              disabled={stopping || !hasActiveSessions}
              startIcon={stopping ? <CircularProgress size={14} /> : <StopCircle />}
              sx={{ fontSize: 11, textTransform: 'none', minWidth: 'auto' }}
            >
              Stop All
            </Button>
          </span>
        </Tooltip>

        <Box sx={{ mx: 0.5, height: 20, borderLeft: '1px solid', borderColor: 'divider' }} />

        {/* Max Parallel Slider */}
        <Typography variant="caption" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
          Parallel
        </Typography>
        <Box sx={{ width: 100 }}>
          <Slider
            value={maxParallel}
            onChange={handleSliderChange}
            onChangeCommitted={handleSliderCommit}
            min={1}
            max={10}
            step={1}
            marks
            size="small"
            valueLabelDisplay="auto"
            disabled={loading}
          />
        </Box>
        <Chip
          label={`${maxParallel}`}
          size="small"
          color="primary"
          variant="outlined"
          sx={{ fontWeight: 700, minWidth: 28 }}
        />

        <Box sx={{ mx: 0.5, height: 20, borderLeft: '1px solid', borderColor: 'divider' }} />

        {/* Status Chips */}
        <Tooltip title="Currently running sessions">
          <Chip
            label={`${sessionStatus.running} running`}
            size="small"
            color={sessionStatus.running > 0 ? 'success' : 'default'}
            variant="outlined"
            sx={{ fontSize: 11 }}
          />
        </Tooltip>
        <Tooltip title="Queued sessions waiting to start">
          <Chip
            label={`${sessionStatus.queued} queued`}
            size="small"
            color={sessionStatus.queued > 0 ? 'warning' : 'default'}
            variant="outlined"
            sx={{ fontSize: 11 }}
          />
        </Tooltip>

        {/* Running Session Chips with individual Pause/Stop */}
        {runningSessions.length > 0 && (
          <>
            <Box sx={{ mx: 0.5, height: 20, borderLeft: '1px solid', borderColor: 'divider' }} />
            {runningSessions.map((session) => (
              <Chip
                key={session.id}
                size="small"
                label={session.label || session.backlogId || session.id.slice(0, 8)}
                color={session.status === 'PAUSED' ? 'warning' : 'success'}
                variant="filled"
                sx={{ fontSize: 10, maxWidth: 160 }}
                onDelete={() => handleStopSession(session.id)}
                deleteIcon={
                  stoppingId === session.id
                    ? <CircularProgress size={12} />
                    : <Tooltip title="Stop session"><Stop sx={{ fontSize: 14 }} /></Tooltip>
                }
                icon={
                  pausingId === session.id
                    ? <CircularProgress size={12} />
                    : session.status === 'PAUSED'
                      ? (
                        <Tooltip title="Resume session">
                          <IconButton
                            size="small"
                            onClick={(e) => { e.stopPropagation(); handleResumeSession(session.id); }}
                            sx={{ p: 0, color: 'inherit' }}
                          >
                            <PlayArrow sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      )
                      : (
                        <Tooltip title="Pause session">
                          <IconButton
                            size="small"
                            onClick={(e) => { e.stopPropagation(); handlePauseSession(session.id); }}
                            sx={{ p: 0, color: 'inherit' }}
                          >
                            <Pause sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      )
                }
              />
            ))}
          </>
        )}
      </Stack>

      {/* Right: Notification Bell + optional Analyze button */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ ml: 1, flexShrink: 0 }}>
        {selectedItem && onAnalyze && (
          <Button
            size="small"
            variant="outlined"
            color="secondary"
            onClick={() => onAnalyze(selectedItem)}
            sx={{ fontSize: 11, textTransform: 'none' }}
          >
            Analyze Efficiency
          </Button>
        )}
        <NotificationBell />
      </Stack>
    </Box>
  );
}
