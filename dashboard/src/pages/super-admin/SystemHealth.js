import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Grid, Card, CardContent, Chip,
  LinearProgress, Switch, FormControlLabel,
  CircularProgress, Alert, Divider, Table, TableBody, TableCell,
  TableHead, TableRow, TableContainer
} from '@mui/material';
import {
  CheckCircle,
  Error as ErrorIcon,
  Warning,
  Refresh,
  Memory,
  Dns,
  Hub,
  Timer,
  Cable,
  Storage,
  Radio,
  Share,
} from '@mui/icons-material';
import axios from 'axios';
import io from 'socket.io-client';
import { API_URL } from '../../context/AuthContext';

const StatusBadge = ({ status }) => {
  if (status === 'CONNECTED' || status === 'HEALTHY') {
    return (
      <Chip
        icon={<CheckCircle sx={{ fontSize: '16px !important', color: '#16a34a !important' }} />}
        label={status}
        size="small"
        sx={{ bgcolor: '#dcfce7', color: '#16a34a', fontWeight: 700, fontSize: 12 }}
      />
    );
  }
  if (status === 'DEGRADED' || status === 'IN_MEMORY_FALLBACK' || status === 'CONNECTING') {
    return (
      <Chip
        icon={<Warning sx={{ fontSize: '16px !important', color: '#d97706 !important' }} />}
        label={status}
        size="small"
        sx={{ bgcolor: '#fef3c7', color: '#d97706', fontWeight: 700, fontSize: 12 }}
      />
    );
  }
  if (status === 'NOT_CONFIGURED') {
    return (
      <Chip
        label="NOT CONFIGURED"
        size="small"
        sx={{ bgcolor: '#f1f5f9', color: '#64748b', fontWeight: 600, fontSize: 11 }}
      />
    );
  }
  return (
    <Chip
      icon={<ErrorIcon sx={{ fontSize: '16px !important', color: '#dc2626 !important' }} />}
      label={status || 'DOWN'}
      size="small"
      sx={{ bgcolor: '#fee2e2', color: '#dc2626', fontWeight: 700, fontSize: 12 }}
    />
  );
};

const getCategoryBadgeStyle = (category) => {
  switch (category) {
    case 'OPTIONS':
      return { bgcolor: '#ede9fe', color: '#6d28d9', label: 'Option Chain' };
    case 'TENANT':
      return { bgcolor: '#e0f2fe', color: '#0369a1', label: 'Tenant Isolation' };
    case 'CLASSROOM':
      return { bgcolor: '#fef3c7', color: '#b45309', label: 'Classroom Grid' };
    case 'USER':
      return { bgcolor: '#fce7f3', color: '#be185d', label: 'Private User' };
    case 'MARKET':
      return { bgcolor: '#dcfce7', color: '#15803d', label: 'Market Ticks' };
    default:
      return { bgcolor: '#f1f5f9', color: '#475569', label: 'Broadcast' };
  }
};

const formatUptime = (seconds) => {
  if (!seconds || seconds <= 0) return '0s';
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
};

const SystemHealth = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [liveSocketActive, setLiveSocketActive] = useState(false);

  const fetchHealth = useCallback(async () => {
    try {
      setError('');
      const res = await axios.get(`${API_URL}/super-admin/system-health`);
      setData(res.data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to fetch system health:', err);
      setError(err.response?.data?.error || err.message || 'Failed to connect to health monitor');
    } finally {
      setLoading(false);
    }
  }, []);

  // Connect local socket client so dashboard acts as live observer
  useEffect(() => {
    const socket = io(API_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });

    socket.on('connect', () => {
      setLiveSocketActive(true);
      fetchHealth(); // refresh telemetry to show connected socket
    });

    socket.on('disconnect', () => {
      setLiveSocketActive(false);
    });

    return () => {
      socket.disconnect();
    };
  }, [fetchHealth]);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchHealth();
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchHealth]);

  const memUsagePercent = data?.server?.heapTotalMb && data?.server?.heapUsedMb
    ? Math.round((data.server.heapUsedMb / data.server.heapTotalMb) * 100)
    : 0;

  return (
    <Box sx={{ pb: 6 }}>
      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a' }}>
              System Health & Telemetry
            </Typography>
            {data && <StatusBadge status={data.status} />}
            {liveSocketActive && (
              <Chip
                icon={<Radio sx={{ fontSize: '14px !important', color: '#16a34a !important' }} />}
                label="LIVE OBSERVER"
                size="small"
                sx={{ bgcolor: '#dcfce7', color: '#16a34a', fontWeight: 700, fontSize: 11 }}
              />
            )}
          </Box>
          <Typography sx={{ color: '#64748b', fontSize: 13 }}>
            Real-time status of broker connections, Redis cache, WebSocket traffic, and backend infrastructure
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                color="primary"
              />
            }
            label={
              <Typography sx={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>
                Auto-refresh (10s)
              </Typography>
            }
          />
          <Button
            variant="outlined"
            startIcon={loading ? <CircularProgress size={16} sx={{ color: '#6366f1' }} /> : <Refresh />}
            onClick={fetchHealth}
            disabled={loading}
            sx={{
              borderColor: '#e2e8f0',
              color: '#1e293b',
              bgcolor: 'white',
              '&:hover': { bgcolor: '#f8fafc', borderColor: '#cbd5e1' },
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
            }}
          >
            Refresh Now
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {/* Main Grid */}
      <Grid container spacing={3}>
        {/* Dhan Broker */}
        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Cable sx={{ color: '#16a34a' }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>
                      Dhan Market Feed
                    </Typography>
                    <Typography sx={{ color: '#64748b', fontSize: 12 }}>
                      Primary NSE Live Market Data Provider
                    </Typography>
                  </Box>
                </Box>
                <StatusBadge status={data?.broker?.dhan?.status} />
              </Box>

              <Divider sx={{ my: 1.5 }} />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={{ color: '#64748b', fontSize: 13 }}>Latency:</Typography>
                <Typography sx={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>
                  {data?.broker?.dhan?.latencyMs !== undefined ? `${data.broker.dhan.latencyMs} ms` : '—'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={{ color: '#64748b', fontSize: 13 }}>Client ID:</Typography>
                <Typography sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 13, color: '#475569' }}>
                  {data?.broker?.dhan?.clientId || 'N/A'}
                </Typography>
              </Box>
              {data?.broker?.dhan?.error && (
                <Typography sx={{ color: '#dc2626', fontSize: 11, mt: 1 }}>
                  Note: {data.broker.dhan.error}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Kotak Neo Broker */}
        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Dns sx={{ color: '#2563eb' }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>
                      Kotak Neo API
                    </Typography>
                    <Typography sx={{ color: '#64748b', fontSize: 12 }}>
                      Secondary Trading & Options Provider
                    </Typography>
                  </Box>
                </Box>
                <StatusBadge status={data?.broker?.kotak?.status} />
              </Box>

              <Divider sx={{ my: 1.5 }} />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={{ color: '#64748b', fontSize: 13 }}>Latency:</Typography>
                <Typography sx={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>
                  {data?.broker?.kotak?.latencyMs !== undefined ? `${data.broker.kotak.latencyMs} ms` : '—'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={{ color: '#64748b', fontSize: 13 }}>State:</Typography>
                <Typography sx={{ fontWeight: 600, fontSize: 13, color: '#475569' }}>
                  {data?.broker?.kotak?.message || (data?.broker?.kotak?.status === 'CONNECTED' ? 'Active & Ready' : 'Standby')}
                </Typography>
              </Box>
              {data?.broker?.kotak?.error && (
                <Typography sx={{ color: '#dc2626', fontSize: 11, mt: 1 }}>
                  Note: {data.broker.kotak.error}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Redis Cache */}
        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Storage sx={{ color: '#dc2626' }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>
                      Redis Cache & LTP Store
                    </Typography>
                    <Typography sx={{ color: '#64748b', fontSize: 12 }}>
                      Pub/Sub, Session Cache & High-Speed LTP
                    </Typography>
                  </Box>
                </Box>
                <StatusBadge status={data?.redis?.status} />
              </Box>

              <Divider sx={{ my: 1.5 }} />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={{ color: '#64748b', fontSize: 13 }}>Mode:</Typography>
                <Chip
                  label={data?.redis?.mode || 'IN_MEMORY_FALLBACK'}
                  size="small"
                  sx={{
                    fontWeight: 700,
                    fontSize: 11,
                    bgcolor: data?.redis?.mode === 'REDIS' ? '#ede9fe' : '#f1f5f9',
                    color: data?.redis?.mode === 'REDIS' ? '#7c3aed' : '#475569',
                  }}
                />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={{ color: '#64748b', fontSize: 13 }}>Fallback Protection:</Typography>
                <Typography sx={{ fontWeight: 600, fontSize: 13, color: '#16a34a' }}>
                  Active (Zero downtime)
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Socket.io Server Overview */}
        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Hub sx={{ color: '#9333ea' }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>
                      WebSocket Engine (Socket.IO)
                    </Typography>
                    <Typography sx={{ color: '#64748b', fontSize: 12 }}>
                      Live Market Ticks & Real-Time Broadcasts
                    </Typography>
                  </Box>
                </Box>
                <StatusBadge status={data?.socket?.status || 'CONNECTED'} />
              </Box>

              <Divider sx={{ my: 1.5 }} />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={{ color: '#64748b', fontSize: 13 }}>Connected Client Sockets:</Typography>
                <Typography sx={{ fontWeight: 800, fontSize: 16, color: '#6366f1' }}>
                  {data?.socket?.activeConnections ?? 0}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={{ color: '#64748b', fontSize: 13 }}>Functional Broadcast Rooms:</Typography>
                <Typography sx={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>
                  {data?.socket?.functionalRoomsCount ?? data?.socket?.totalRooms ?? 0} active
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* MongoDB Database */}
        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Storage sx={{ color: '#0d9488' }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>
                      MongoDB Database
                    </Typography>
                    <Typography sx={{ color: '#64748b', fontSize: 12 }}>
                      Primary Storage & Indexing Cluster
                    </Typography>
                  </Box>
                </Box>
                <StatusBadge status={data?.database?.status} />
              </Box>

              <Divider sx={{ my: 1.5 }} />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={{ color: '#64748b', fontSize: 13 }}>Ping Latency:</Typography>
                <Typography sx={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>
                  {data?.database?.pingMs !== undefined ? `${data.database.pingMs} ms` : '—'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={{ color: '#64748b', fontSize: 13 }}>Database Name:</Typography>
                <Typography sx={{ fontWeight: 600, fontSize: 13, color: '#475569' }}>
                  {data?.database?.name || 'trading_app'}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Node.js Server Resources */}
        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Memory sx={{ color: '#d97706' }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>
                      Server Process & Memory
                    </Typography>
                    <Typography sx={{ color: '#64748b', fontSize: 12 }}>
                      Node.js {data?.server?.nodeVersion || ''} (PID {data?.server?.pid || '—'})
                    </Typography>
                  </Box>
                </Box>
                <Chip
                  icon={<Timer sx={{ fontSize: '14px !important' }} />}
                  label={`Uptime: ${formatUptime(data?.server?.uptimeSeconds)}`}
                  size="small"
                  sx={{ bgcolor: '#f1f5f9', color: '#334155', fontWeight: 600, fontSize: 11 }}
                />
              </Box>

              <Divider sx={{ my: 1.5 }} />

              <Box sx={{ mb: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography sx={{ color: '#64748b', fontSize: 12 }}>
                    Heap Memory: {data?.server?.heapUsedMb || 0} MB / {data?.server?.heapTotalMb || 0} MB
                  </Typography>
                  <Typography sx={{ fontWeight: 700, fontSize: 12, color: '#0f172a' }}>
                    {memUsagePercent}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={memUsagePercent}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    bgcolor: '#f1f5f9',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: memUsagePercent > 85 ? '#dc2626' : memUsagePercent > 60 ? '#f59e0b' : '#6366f1',
                    },
                  }}
                />
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ color: '#64748b', fontSize: 12 }}>Resident Set Size (RSS):</Typography>
                <Typography sx={{ fontWeight: 600, fontSize: 12, color: '#0f172a' }}>
                  {data?.server?.rssMb || 0} MB
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── SOCKET.IO ROOMS BREAKDOWN TABLE ───────────────────────────── */}
      <Box sx={{ mt: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Share sx={{ color: '#6366f1' }} />
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#0f172a' }}>
              Active WebSocket Rooms & Real-Time Broadcast Matrix
            </Typography>
          </Box>
          <Typography sx={{ color: '#64748b', fontSize: 13 }}>
            {data?.socket?.rooms?.length || 0} active channels ({data?.socket?.activeConnections || 0} total clients connected)
          </Typography>
        </Box>

        <Box sx={{ borderRadius: 3, border: '1px solid #e2e8f0', overflow: 'hidden', bgcolor: 'white' }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>ROOM NAME / CHANNEL</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>CATEGORY</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>CLIENTS</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>TECHNICAL PURPOSE & USE CASE</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(!data?.socket?.rooms || data.socket.rooms.length === 0) ? (
                  <TableRow>
                    <TableCell colSpan={4} sx={{ textAlign: 'center', py: 5 }}>
                      <Hub sx={{ fontSize: 36, color: '#cbd5e1', mb: 1 }} />
                      <Typography sx={{ color: '#94a3b8', fontSize: 13 }}>
                        No specific broadcast rooms currently populated. As mobile students, instructors, or option chains connect, channels appear live here.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  data.socket.rooms.map((room) => {
                    const catStyle = getCategoryBadgeStyle(room.category);
                    return (
                      <TableRow key={room.name} hover>
                        <TableCell>
                          <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                            {room.name}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={catStyle.label}
                            size="small"
                            sx={{
                              bgcolor: catStyle.bgcolor,
                              color: catStyle.color,
                              fontWeight: 700,
                              fontSize: 11,
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={`${room.clientsCount} connected`}
                            size="small"
                            sx={{
                              bgcolor: room.clientsCount > 0 ? '#dcfce7' : '#f1f5f9',
                              color: room.clientsCount > 0 ? '#15803d' : '#64748b',
                              fontWeight: 700,
                              fontSize: 11,
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ color: '#475569', fontSize: 12 }}>
                          {room.purpose}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Box>

      {lastUpdated && (
        <Typography sx={{ color: '#94a3b8', fontSize: 12, mt: 3, textAlign: 'center' }}>
          Last telemetry heartbeat: {lastUpdated.toLocaleTimeString()}
        </Typography>
      )}
    </Box>
  );
};

export default SystemHealth;
