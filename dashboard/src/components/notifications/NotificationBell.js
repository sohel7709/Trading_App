import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, IconButton, Badge, Menu, MenuItem, Typography,
  Divider, Button, Snackbar, Alert, Tooltip, CircularProgress
} from '@mui/material';
import {
  Notifications as BellIcon,
  WarningAmber as RiskIcon,
  SwapHoriz as TradeIcon,
  AccountBalanceWallet as CapitalIcon,
  InfoOutlined as InfoIcon,
  DoneAll as MarkReadIcon
} from '@mui/icons-material';
import { io } from 'socket.io-client';
import axios from 'axios';
import { API_URL, useAuth } from '../../context/AuthContext';

const SOCKET_URL = API_URL || 'http://localhost:8080';

const getAuthHeaders = () => {
  const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
};

export const NotificationBell = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [anchorEl, setAnchorEl] = useState(null);
  const [toast, setToast] = useState({ open: false, title: '', message: '', type: 'info' });
  const socketRef = useRef(null);

  // Play subtle web audio notification chime
  const playChime = useCallback(() => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) { /* audio policy non-fatal */ }
  }, []);

  const fetchNotifications = useCallback(() => {
    axios.get(`${API_URL}/notifications`, getAuthHeaders())
      .then(res => {
        if (Array.isArray(res.data)) {
          setNotifications(res.data);
          const unread = res.data.filter(n => !n.read).length;
          setUnreadCount(unread);
        }
      })
      .catch(err => console.error('Failed to fetch notifications:', err.message));
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
    if (!token) return;

    fetchNotifications();

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['polling', 'websocket'],
    });
    socketRef.current = socket;

    socket.on('notification', (notif) => {
      setNotifications(prev => [notif, ...prev]);
      setUnreadCount(prev => prev + 1);

      // Trigger floating toast
      const toastType = notif.type === 'RISK' ? 'error' : (notif.type === 'CAPITAL' ? 'success' : 'info');
      setToast({
        open: true,
        title: notif.title || 'Notification',
        message: notif.message || '',
        type: toastType,
      });

      playChime();
    });

    return () => {
      socket.off('notification');
      socket.disconnect();
    };
  }, [fetchNotifications, playChime]);

  const handleOpenMenu = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleCloseMenu = () => {
    setAnchorEl(null);
  };

  const handleMarkAllRead = async () => {
    try {
      await axios.patch(`${API_URL}/notifications/mark-read`, {}, getAuthHeaders());
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark notifications read:', err);
    }
  };

  const getNotifIcon = (type) => {
    switch (type) {
      case 'RISK':
        return <RiskIcon sx={{ fontSize: 18, color: '#ef4444' }} />;
      case 'CAPITAL':
        return <CapitalIcon sx={{ fontSize: 18, color: '#10b981' }} />;
      case 'TRADE':
        return <TradeIcon sx={{ fontSize: 18, color: '#3b82f6' }} />;
      default:
        return <InfoIcon sx={{ fontSize: 18, color: '#64748b' }} />;
    }
  };

  return (
    <>
      <Tooltip title="Notifications & Real-time Alerts">
        <IconButton
          onClick={handleOpenMenu}
          sx={{
            color: unreadCount > 0 ? '#0f172a' : '#64748b',
            bgcolor: unreadCount > 0 ? '#f1f5f9' : 'transparent',
            '&:hover': { bgcolor: '#e2e8f0' },
            width: 40,
            height: 40,
          }}
        >
          <Badge
            badgeContent={unreadCount}
            color="error"
            max={99}
            sx={{
              '& .MuiBadge-badge': {
                fontSize: 10,
                height: 18,
                minWidth: 18,
                fontWeight: 700,
                boxShadow: '0 0 0 2px #ffffff',
              }
            }}
          >
            <BellIcon sx={{ fontSize: 20 }} />
          </Badge>
        </IconButton>
      </Tooltip>

      {/* Notifications Popover Dropdown */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleCloseMenu}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        PaperProps={{
          sx: {
            width: 360,
            maxHeight: 460,
            borderRadius: 3,
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e2e8f0',
            mt: 1.5,
            p: 0,
            overflow: 'hidden'
          }
        }}
      >
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>
              Notifications
            </Typography>
            {unreadCount > 0 && (
              <Box sx={{ bgcolor: '#fee2e2', color: '#dc2626', fontSize: 11, fontWeight: 700, px: 1, py: 0.2, borderRadius: 1 }}>
                {unreadCount} new
              </Box>
            )}
          </Box>
          {notifications.length > 0 && (
            <Button
              size="small"
              onClick={handleMarkAllRead}
              startIcon={<MarkReadIcon sx={{ fontSize: 14 }} />}
              sx={{ textTransform: 'none', fontSize: 12, fontWeight: 600, color: '#64748b' }}
            >
              Mark read
            </Button>
          )}
        </Box>

        <Box sx={{ maxHeight: 360, overflowY: 'auto' }}>
          {notifications.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <BellIcon sx={{ fontSize: 32, color: '#cbd5e1', mb: 1 }} />
              <Typography sx={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>
                No notifications yet
              </Typography>
              <Typography sx={{ fontSize: 11, color: '#94a3b8', mt: 0.5 }}>
                Real-time trade fills, capital adjustments, and risk alerts will appear here.
              </Typography>
            </Box>
          ) : (
            notifications.map((n, idx) => (
              <Box
                key={n._id || n.id || idx}
                sx={{
                  p: 1.5,
                  display: 'flex',
                  gap: 1.5,
                  alignItems: 'flex-start',
                  bgcolor: n.read ? '#ffffff' : '#f8fafc',
                  borderBottom: '1px solid #f1f5f9',
                  transition: 'background-color 0.15s',
                  '&:hover': { bgcolor: '#f1f5f9' },
                  position: 'relative'
                }}
              >
                {!n.read && (
                  <Box sx={{ position: 'absolute', left: 4, top: 18, width: 5, height: 5, borderRadius: '50%', bgcolor: '#2563eb' }} />
                )}
                <Box sx={{ width: 32, height: 32, borderRadius: 1.5, bgcolor: '#ffffff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, mt: 0.2 }}>
                  {getNotifIcon(n.type)}
                </Box>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.2 }}>
                    <Typography sx={{ fontSize: 12.5, fontWeight: n.read ? 600 : 700, color: '#0f172a' }}>
                      {n.title}
                    </Typography>
                    <Typography sx={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>
                      {n.createdAt ? new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: 12, color: '#475569', lineHeight: 1.35 }}>
                    {n.message}
                  </Typography>
                </Box>
              </Box>
            ))
          )}
        </Box>
      </Menu>

      {/* Floating Snackbar Toast */}
      <Snackbar
        open={toast.open}
        autoHideDuration={5000}
        onClose={() => setToast(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{ mt: 7 }}
      >
        <Alert
          onClose={() => setToast(prev => ({ ...prev, open: false }))}
          severity={toast.type}
          variant="filled"
          sx={{
            width: '100%',
            maxWidth: 380,
            borderRadius: 2.5,
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            fontWeight: 500,
            fontSize: 13,
            '& .MuiAlert-icon': { fontSize: 20 }
          }}
        >
          <Typography sx={{ fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>
            {toast.title}
          </Typography>
          <Typography sx={{ fontSize: 12, mt: 0.3, opacity: 0.95 }}>
            {toast.message}
          </Typography>
        </Alert>
      </Snackbar>
    </>
  );
};

export default NotificationBell;
