/**
 * NotificationBell — Bell icon with badge + dropdown popover
 * Shows latest 10 notifications with category, severity, and time ago.
 * Subscribes to SSE stream for real-time updates.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  IconButton,
  Badge,
  Popover,
  Typography,
  Chip,
  Button,
  Stack,
  Divider,
  CircularProgress
} from '@mui/material';
import { Notifications, NotificationsNone, DoneAll } from '@mui/icons-material';
import api from '../../services/api';

const SEVERITY_COLORS = {
  critical: '#d32f2f',
  error: '#d32f2f',
  warning: '#f57c00',
  info: '#1976d2',
  success: '#2e7d32',
  low: '#757575'
};

const CATEGORY_COLORS = {
  session: 'primary',
  task: 'secondary',
  system: 'default',
  pipeline: 'warning',
  alert: 'error'
};

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationBell() {
  const [anchorEl, setAnchorEl] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const eventSourceRef = useRef(null);

  // Fetch unread count from metrics endpoint
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await api.get('/notifications/metrics');
      const data = res.data?.data || res.data || {};
      setUnreadCount(data.unread || data.unreadCount || 0);
    } catch (err) {
      console.debug('Notification metrics fetch failed:', err.message);
    }
  }, []);

  // Fetch notification list
  const fetchNotifications = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await api.get('/notifications?limit=10');
      const data = res.data?.data || res.data?.notifications || res.data || [];
      setNotifications(Array.isArray(data) ? data : []);
    } catch (err) {
      console.debug('Notification list fetch failed:', err.message);
    } finally {
      setLoadingList(false);
    }
  }, []);

  // SSE subscription for real-time updates
  useEffect(() => {
    fetchUnreadCount();

    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3010/api/v1';
    const evtSource = new EventSource(`${baseUrl}/notifications/stream`);
    eventSourceRef.current = evtSource;

    evtSource.addEventListener('notification', (event) => {
      try {
        const data = JSON.parse(event.data);
        setUnreadCount((prev) => prev + 1);
        // Prepend to list if popover is open
        setNotifications((prev) => {
          const updated = [data, ...prev].slice(0, 10);
          return updated;
        });
      } catch {
        // ignore parse errors
      }
    });

    // Some servers send generic message events
    evtSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'notification' || data.title) {
          setUnreadCount((prev) => prev + 1);
          setNotifications((prev) => [data, ...prev].slice(0, 10));
        }
      } catch {
        // ignore
      }
    };

    evtSource.onerror = () => {
      // silent reconnect handled by browser
    };

    // Poll badge count every 30s as fallback
    const interval = setInterval(fetchUnreadCount, 30000);

    return () => {
      evtSource.close();
      clearInterval(interval);
    };
  }, [fetchUnreadCount]);

  const handleOpen = (event) => {
    setAnchorEl(event.currentTarget);
    fetchNotifications();
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleMarkAllRead = async () => {
    setMarkingRead(true);
    try {
      await api.post('/notifications/mark-read');
      setUnreadCount(0);
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read: true }))
      );
    } catch (err) {
      console.error('Failed to mark notifications read:', err.message);
    } finally {
      setMarkingRead(false);
    }
  };

  const open = Boolean(anchorEl);

  return (
    <>
      <IconButton size="small" onClick={handleOpen} sx={{ position: 'relative' }}>
        <Badge
          badgeContent={unreadCount}
          color="error"
          max={99}
          overlap="circular"
        >
          {unreadCount > 0 ? (
            <Notifications fontSize="small" />
          ) : (
            <NotificationsNone fontSize="small" />
          )}
        </Badge>
      </IconButton>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: { width: 360, maxHeight: 440, overflow: 'hidden', display: 'flex', flexDirection: 'column' }
          }
        }}
      >
        {/* Header */}
        <Box sx={{ px: 2, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Notifications
          </Typography>
          {unreadCount > 0 && (
            <Chip
              label={`${unreadCount} unread`}
              size="small"
              color="error"
              sx={{ fontSize: 10, height: 20 }}
            />
          )}
        </Box>
        <Divider />

        {/* List */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loadingList ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : notifications.length === 0 ? (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ textAlign: 'center', py: 4 }}
            >
              No notifications
            </Typography>
          ) : (
            notifications.map((notif, idx) => (
              <Box
                key={notif.id || idx}
                sx={{
                  px: 2,
                  py: 1.25,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  bgcolor: notif.read ? 'transparent' : 'action.hover',
                  '&:hover': { bgcolor: 'action.selected' },
                  cursor: 'default'
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  {notif.category && (
                    <Chip
                      label={notif.category}
                      size="small"
                      color={CATEGORY_COLORS[notif.category] || 'default'}
                      variant="outlined"
                      sx={{ fontSize: 9, height: 18, textTransform: 'uppercase' }}
                    />
                  )}
                  {notif.severity && (
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: SEVERITY_COLORS[notif.severity] || SEVERITY_COLORS.info,
                        flexShrink: 0
                      }}
                    />
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                    {timeAgo(notif.createdAt || notif.timestamp)}
                  </Typography>
                </Stack>
                <Typography variant="body2" sx={{ fontWeight: notif.read ? 400 : 600, lineHeight: 1.3 }}>
                  {notif.title || notif.message || 'Notification'}
                </Typography>
                {notif.body && (
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
                    {notif.body}
                  </Typography>
                )}
              </Box>
            ))
          )}
        </Box>

        {/* Footer */}
        {notifications.length > 0 && (
          <>
            <Divider />
            <Box sx={{ px: 2, py: 1, display: 'flex', justifyContent: 'center' }}>
              <Button
                size="small"
                onClick={handleMarkAllRead}
                disabled={markingRead || unreadCount === 0}
                startIcon={markingRead ? <CircularProgress size={14} /> : <DoneAll />}
                sx={{ fontSize: 11, textTransform: 'none' }}
              >
                Mark All Read
              </Button>
            </Box>
          </>
        )}
      </Popover>
    </>
  );
}
