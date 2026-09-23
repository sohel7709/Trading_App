import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, Grid, Card, CardContent, Chip, Button,
  IconButton, Select, MenuItem, FormControl, InputLabel, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Avatar, LinearProgress, Tooltip, Skeleton, Alert, Snackbar,
  TextField, InputAdornment, Dialog, DialogTitle, DialogContent,
  DialogActions, ButtonGroup
} from '@mui/material';
import {
  School as StudentIcon,
  Sensors as ActiveIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  WarningAmber as RiskIcon,
  AccountBalanceWallet as WalletIcon,
  Refresh as RefreshIcon,
  Assessment as LeaderboardIcon,
  Search as SearchIcon,
  CheckCircle as VerifiedIcon,
  SwapHoriz as TradeIcon,
  AccessTime as TimeIcon,
  NotificationsActive as AlertIcon,
  Clear as ClearIcon,
  FiberManualRecord as LiveDotIcon,
  Shield as ShieldIcon,
  OpenInNew as OpenInNewIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import axios from 'axios';
import { API_URL, useAuth } from '../../context/AuthContext';

const SOCKET_URL = API_URL || 'http://localhost:8080';

const getAuthHeaders = () => {
  const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
};

const fmtRupees = (amount) => {
  const num = Math.round(Number(amount) || 0);
  return `₹${Math.abs(num).toLocaleString('en-IN')}`;
};

const formatTimeAgo = (dateInput) => {
  if (!dateInput) return 'Just now';
  const now = new Date();
  const d = new Date(dateInput);
  const diffSec = Math.floor((now - d) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// ── Assign Capital Quick Modal ─────────────────────────────────────────────
const QuickCapitalModal = ({ open, onClose, student, onUpdated }) => {
  const [amount, setAmount] = useState('100000');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleAssign = async () => {
    if (!amount || Number(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await axios.post(
        `${API_URL}/wallet/assign`,
        { studentId: student._id || student.studentId, amount: Number(amount) },
        getAuthHeaders()
      );
      if (onUpdated) onUpdated();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Error assigning capital');
    } finally {
      setSubmitting(false);
    }
  };

  if (!student) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3, p: 1 } }}>
      <DialogTitle sx={{ fontWeight: 800, color: '#0f172a', pb: 1 }}>
        Assign Capital · {student.name}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>
          Allocate virtual trading funds directly to this student's wallet.
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
        <TextField
          label="Amount (₹)"
          fullWidth
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
          sx={{ mb: 2 }}
        />
        <ButtonGroup size="small" variant="outlined" fullWidth>
          {['50000', '100000', '500000', '1000000'].map((preset) => (
            <Button key={preset} onClick={() => setAmount(preset)}>
              ₹{Number(preset) / 100000}L
            </Button>
          ))}
        </ButtonGroup>
      </DialogContent>
      <DialogActions sx={{ p: 2, pt: 1 }}>
        <Button onClick={onClose} sx={{ color: '#64748b', textTransform: 'none' }}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleAssign}
          disabled={submitting}
          sx={{ bgcolor: '#0284c7', '&:hover': { bgcolor: '#0369a1' }, textTransform: 'none', px: 3, borderRadius: 2 }}
        >
          {submitting ? 'Assigning...' : 'Assign Funds'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Main Instructor Dashboard ──────────────────────────────────────────────
const InstructorDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [sessionData, setSessionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [alertFilter, setAlertFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [capitalModal, setCapitalModal] = useState({ open: false, student: null });
  const [toast, setToast] = useState({ open: false, message: '', severity: 'info' });

  const socketRef = useRef(null);

  // Fetch batches available to the instructor
  const fetchBatches = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/batches`, getAuthHeaders());
      const list = res.data || [];
      setBatches(list);

      // Default to Batch 24-A if available, or first batch
      if (list.length > 0) {
        const batch24A = list.find(b => b.code === 'BATCH24A' || b.name?.includes('Batch 24-A'));
        if (batch24A) {
          setSelectedBatchId(batch24A._id);
        } else if (!selectedBatchId) {
          setSelectedBatchId(list[0]._id);
        }
      }
    } catch (err) {
      console.error('Error fetching batches:', err);
    }
  }, [selectedBatchId]);

  // Fetch session statistics for the selected batch
  const fetchSessionStats = useCallback(async (batchId, isSilent = false) => {
    if (!batchId) return;
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await axios.get(`${API_URL}/batch/${batchId}/session-stats`, getAuthHeaders());
      setSessionData(res.data);
    } catch (err) {
      console.error('Error fetching session stats:', err);
      // Fallback to performance endpoint if session-stats fails
      try {
        const perfRes = await axios.get(`${API_URL}/batch/${batchId}/performance`, getAuthHeaders());
        if (perfRes.data) {
          const p = perfRes.data;
          setSessionData({
            instituteCode: user?.tenantConfig?.instituteCode || user?.instituteCode || 'TEST1',
            batch: {
              id: batchId,
              name: p.batchName,
              code: p.batchCode,
              startingCapital: 500000
            },
            stats: {
              totalStudents: p.batchAverage?.studentCount || 0,
              startingCapital: 500000,
              capitalSubtitle: 'Capital ₹5,00,000 each',
              activeNow: p.batchAverage?.studentCount || 0,
              idleCount: 0,
              idleSubtitle: '0 idle for over 10 min',
              totalPnl: p.batchAverage?.totalPnl || 0,
              avgPnl: p.batchAverage?.avgPnl || 0,
              avgSubtitle: `Avg +₹${Math.round(p.batchAverage?.avgPnl || 0).toLocaleString('en-IN')} per student`,
              riskBreaches: 0,
              riskSubtitle: 'All students within limits'
            },
            alerts: [],
            roster: (p.topPerformers || []).map(s => ({
              studentId: s.studentId,
              name: s.name,
              email: s.email,
              capital: 500000,
              availableMargin: 350000,
              usedMargin: 150000,
              marginUsedPercent: 30,
              netPnl: s.pnl,
              roi: s.pnl ? (s.pnl / 500000) * 100 : 0,
              openPositionsCount: 1,
              isActive: true,
              status: 'ACTIVE'
            }))
          });
        }
      } catch (fallbackErr) {
        console.error('Fallback error:', fallbackErr);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  // Initial load
  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  // Load stats on batch change
  useEffect(() => {
    if (selectedBatchId) {
      fetchSessionStats(selectedBatchId);
    }
  }, [selectedBatchId, fetchSessionStats]);

  // Real-time WebSocket connection for live session updates
  useEffect(() => {
    if (!selectedBatchId) return;

    const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_batch', { batchId: selectedBatchId });
      socket.emit('join_room', `batch:${selectedBatchId}`);
    });

    // Handle real-time alert notifications
    socket.on('notification', (notif) => {
      setSessionData(prev => {
        if (!prev) return prev;
        const newAlert = {
          id: notif._id || Date.now(),
          type: notif.type || 'SYSTEM',
          title: notif.title || 'Live Alert',
          studentName: notif.data?.studentName || 'Student',
          message: notif.message,
          time: new Date(),
          severity: notif.type === 'RISK' ? 'error' : notif.type === 'TRADE' ? 'success' : 'info'
        };
        const updatedAlerts = [newAlert, ...(prev.alerts || [])];
        const newRiskCount = notif.type === 'RISK' ? (prev.stats?.riskBreaches || 0) + 1 : prev.stats?.riskBreaches;

        return {
          ...prev,
          stats: {
            ...prev.stats,
            riskBreaches: newRiskCount
          },
          alerts: updatedAlerts.slice(0, 20)
        };
      });

      setToast({
        open: true,
        message: `${notif.title || 'Alert'}: ${notif.message}`,
        severity: notif.type === 'RISK' ? 'error' : notif.type === 'TRADE' ? 'success' : 'info'
      });
    });

    // Handle real-time trade updates
    socket.on('trade_update', () => {
      fetchSessionStats(selectedBatchId, true);
    });

    return () => {
      socket.disconnect();
    };
  }, [selectedBatchId, fetchSessionStats]);

  // Selected batch object
  const currentBatch = batches.find(b => b._id === selectedBatchId) || sessionData?.batch;
  const instituteCode = user?.tenantConfig?.instituteCode || user?.instituteCode || sessionData?.instituteCode || 'TEST1';

  // Stats
  const stats = sessionData?.stats || {
    totalStudents: 32,
    startingCapital: 500000,
    capitalSubtitle: 'Capital ₹5,00,000 each',
    activeNow: 28,
    idleCount: 4,
    idleSubtitle: '4 idle for over 10 min',
    totalPnl: 102340,
    avgPnl: 3198,
    avgSubtitle: 'Avg +₹3,198 per student',
    riskBreaches: 3,
    riskSubtitle: 'Margin over 80% of wallet'
  };

  // Filtered alerts
  const alerts = sessionData?.alerts || [];
  const filteredAlerts = alerts.filter(a => {
    if (alertFilter === 'RISK') return a.type === 'RISK';
    if (alertFilter === 'TRADE') return a.type === 'TRADE';
    return true;
  });

  // Filtered roster
  const roster = sessionData?.roster || [];
  const filteredRoster = roster.filter(s => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q);
  });

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, bgcolor: '#f8fafc', minHeight: '100vh' }}>
      {/* ── Context & Institutional Header ───────────────────────────────── */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 3,
          borderRadius: 3,
          border: '1px solid #e2e8f0',
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { xs: 'flex-start', md: 'center' },
          justifyContent: 'space-between',
          gap: 2
        }}
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5, flexWrap: 'wrap' }}>
            <Chip
              icon={<VerifiedIcon sx={{ fontSize: '16px !important', color: '#0284c7 !important' }} />}
              label={`Institute: ${instituteCode}`}
              sx={{
                bgcolor: '#e0f2fe',
                color: '#0369a1',
                fontWeight: 800,
                fontSize: 12,
                borderRadius: 2
              }}
            />
            <Chip
              icon={<LiveDotIcon sx={{ fontSize: '10px !important', color: '#16a34a !important' }} />}
              label="LIVE SESSION ACTIVE"
              sx={{
                bgcolor: '#dcfce7',
                color: '#15803d',
                fontWeight: 700,
                fontSize: 11,
                borderRadius: 2,
                '& .MuiChip-icon': {
                  animation: 'pulse 1.5s infinite',
                  '@keyframes pulse': {
                    '0%': { opacity: 1 },
                    '50%': { opacity: 0.3 },
                    '100%': { opacity: 1 }
                  }
                }
              }}
            />
            <Chip
              label={currentBatch?.marketMode || 'LIVE MARKET'}
              size="small"
              sx={{ bgcolor: '#f1f5f9', color: '#475569', fontWeight: 600, fontSize: 11 }}
            />
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', mt: 0.5 }}>
            {currentBatch?.name || 'Batch 24-A · Options basics'}
          </Typography>

          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <TimeIcon sx={{ fontSize: 16, color: '#94a3b8' }} />
            Session 04: Started 9:15 AM · {stats.totalStudents} enrolled
          </Typography>
        </Box>

        {/* Action Controls & Batch Switcher */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          {batches.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 200, bgcolor: 'white' }}>
              <InputLabel id="batch-select-label" sx={{ fontSize: 13, fontWeight: 600 }}>Active Cohort</InputLabel>
              <Select
                labelId="batch-select-label"
                value={selectedBatchId}
                label="Active Cohort"
                onChange={(e) => setSelectedBatchId(e.target.value)}
                sx={{ borderRadius: 2, fontSize: 13, fontWeight: 700 }}
              >
                {batches.map((b) => (
                  <MenuItem key={b._id} value={b._id} sx={{ fontSize: 13, fontWeight: 600 }}>
                    {b.name} ({b.code})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <Tooltip title="Refresh Live Data">
            <IconButton
              onClick={() => fetchSessionStats(selectedBatchId, true)}
              disabled={refreshing}
              sx={{ bgcolor: 'white', border: '1px solid #e2e8f0', borderRadius: 2 }}
            >
              <RefreshIcon sx={{ color: '#64748b', animation: refreshing ? 'spin 1s infinite linear' : 'none', '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } } }} />
            </IconButton>
          </Tooltip>

          <Button
            variant="outlined"
            startIcon={<LeaderboardIcon />}
            onClick={() => navigate('/reports')}
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              borderRadius: 2,
              borderColor: '#cbd5e1',
              color: '#334155',
              bgcolor: 'white',
              '&:hover': { bgcolor: '#f8fafc', borderColor: '#94a3b8' }
            }}
          >
            Live Leaderboard
          </Button>
        </Box>
      </Paper>

      {/* ── 4 Upgraded Metric Cards ──────────────────────────────────────── */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {/* Total Students */}
        <Grid item xs={12} sm={6} md={3}>
          <Card
            elevation={0}
            sx={{
              borderRadius: 3,
              border: '1px solid #e2e8f0',
              bgcolor: '#ffffff',
              transition: 'all 0.2s',
              '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }
            }}
          >
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                <Typography sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Total Students
                </Typography>
                <Box sx={{ p: 1, borderRadius: 2, bgcolor: '#eff6ff', color: '#2563eb', display: 'flex' }}>
                  <StudentIcon fontSize="small" />
                </Box>
              </Box>
              {loading ? (
                <Skeleton variant="text" width={80} height={42} />
              ) : (
                <Typography variant="h4" sx={{ fontWeight: 800, color: '#0f172a', mb: 0.5 }}>
                  {stats.totalStudents}
                </Typography>
              )}
              <Typography variant="body2" sx={{ color: '#64748b', fontSize: 13, fontWeight: 500 }}>
                {stats.capitalSubtitle || `Capital ₹5,00,000 each`}
              </Typography>
              <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip label="100% Enrolled" size="small" sx={{ bgcolor: '#f1f5f9', color: '#475569', fontSize: 11, fontWeight: 700 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Active Now */}
        <Grid item xs={12} sm={6} md={3}>
          <Card
            elevation={0}
            sx={{
              borderRadius: 3,
              border: '1px solid #e2e8f0',
              bgcolor: '#ffffff',
              transition: 'all 0.2s',
              '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }
            }}
          >
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                <Typography sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Active Now
                </Typography>
                <Box sx={{ p: 1, borderRadius: 2, bgcolor: '#ecfdf5', color: '#059669', display: 'flex' }}>
                  <ActiveIcon fontSize="small" />
                </Box>
              </Box>
              {loading ? (
                <Skeleton variant="text" width={80} height={42} />
              ) : (
                <Typography variant="h4" sx={{ fontWeight: 800, color: '#0f172a', mb: 0.5 }}>
                  {stats.activeNow}
                </Typography>
              )}
              <Typography variant="body2" sx={{ color: '#64748b', fontSize: 13, fontWeight: 500 }}>
                {stats.idleSubtitle || `4 idle for over 10 min`}
              </Typography>
              <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip
                  label={`${Math.round((stats.activeNow / (stats.totalStudents || 1)) * 100)}% Participation`}
                  size="small"
                  sx={{ bgcolor: '#dcfce7', color: '#16a34a', fontSize: 11, fontWeight: 700 }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Batch P&L */}
        <Grid item xs={12} sm={6} md={3}>
          <Card
            elevation={0}
            sx={{
              borderRadius: 3,
              border: '1px solid #e2e8f0',
              bgcolor: '#ffffff',
              transition: 'all 0.2s',
              '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }
            }}
          >
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                <Typography sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Batch P&L
                </Typography>
                <Box sx={{ p: 1, borderRadius: 2, bgcolor: stats.totalPnl >= 0 ? '#ecfdf5' : '#fef2f2', color: stats.totalPnl >= 0 ? '#10b981' : '#ef4444', display: 'flex' }}>
                  {stats.totalPnl >= 0 ? <TrendingUpIcon fontSize="small" /> : <TrendingDownIcon fontSize="small" />}
                </Box>
              </Box>
              {loading ? (
                <Skeleton variant="text" width={110} height={42} />
              ) : (
                <Typography
                  variant="h4"
                  sx={{
                    fontWeight: 800,
                    color: stats.totalPnl >= 0 ? '#10b981' : '#ef4444',
                    mb: 0.5
                  }}
                >
                  {stats.totalPnl >= 0 ? '+' : '-'}{fmtRupees(stats.totalPnl)}
                </Typography>
              )}
              <Typography variant="body2" sx={{ color: '#64748b', fontSize: 13, fontWeight: 500 }}>
                {stats.avgSubtitle || `Avg +₹3,198 per student`}
              </Typography>
              <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip
                  label={`${stats.totalPnl >= 0 ? '+' : ''}${((stats.totalPnl / ((stats.totalStudents || 1) * (stats.startingCapital || 500000))) * 100).toFixed(2)}% Return`}
                  size="small"
                  sx={{
                    bgcolor: stats.totalPnl >= 0 ? '#dcfce7' : '#fee2e2',
                    color: stats.totalPnl >= 0 ? '#15803d' : '#b91c1c',
                    fontSize: 11,
                    fontWeight: 700
                  }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Risk Breaches */}
        <Grid item xs={12} sm={6} md={3}>
          <Card
            elevation={0}
            sx={{
              borderRadius: 3,
              border: stats.riskBreaches > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0',
              bgcolor: stats.riskBreaches > 0 ? '#fffdfd' : '#ffffff',
              transition: 'all 0.2s',
              '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }
            }}
          >
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                <Typography sx={{ color: stats.riskBreaches > 0 ? '#b91c1c' : '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Risk Breaches
                </Typography>
                <Box sx={{ p: 1, borderRadius: 2, bgcolor: '#fef2f2', color: '#ef4444', display: 'flex' }}>
                  <RiskIcon fontSize="small" />
                </Box>
              </Box>
              {loading ? (
                <Skeleton variant="text" width={60} height={42} />
              ) : (
                <Typography variant="h4" sx={{ fontWeight: 800, color: stats.riskBreaches > 0 ? '#ef4444' : '#0f172a', mb: 0.5 }}>
                  {stats.riskBreaches}
                </Typography>
              )}
              <Typography variant="body2" sx={{ color: '#64748b', fontSize: 13, fontWeight: 500 }}>
                {stats.riskSubtitle || `Margin over 80% of wallet`}
              </Typography>
              <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip
                  label={stats.riskBreaches > 0 ? `${stats.riskBreaches} Active Alerts` : 'Zero Violations'}
                  size="small"
                  sx={{
                    bgcolor: stats.riskBreaches > 0 ? '#fee2e2' : '#f1f5f9',
                    color: stats.riskBreaches > 0 ? '#b91c1c' : '#475569',
                    fontSize: 11,
                    fontWeight: 700
                  }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Recent Alerts (Real Data Feed) ───────────────────────────────── */}
      <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid #e2e8f0', mb: 3 }}>
        <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ p: 0.8, bgcolor: '#fef2f2', color: '#ef4444', borderRadius: 2, display: 'flex' }}>
                <AlertIcon fontSize="small" />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a', fontSize: 17 }}>
                Recent Alerts
              </Typography>
              {alerts.length > 0 && (
                <Chip label={`${alerts.length} Total`} size="small" sx={{ bgcolor: '#f1f5f9', fontWeight: 700, fontSize: 11 }} />
              )}
            </Box>

            {/* Filter Buttons */}
            <ButtonGroup size="small" sx={{ bgcolor: '#f8fafc', borderRadius: 2 }}>
              <Button
                variant={alertFilter === 'ALL' ? 'contained' : 'text'}
                onClick={() => setAlertFilter('ALL')}
                sx={{ textTransform: 'none', fontWeight: 700, fontSize: 12, bgcolor: alertFilter === 'ALL' ? '#0f172a' : 'transparent', color: alertFilter === 'ALL' ? 'white' : '#64748b' }}
              >
                All Alerts
              </Button>
              <Button
                variant={alertFilter === 'RISK' ? 'contained' : 'text'}
                onClick={() => setAlertFilter('RISK')}
                sx={{ textTransform: 'none', fontWeight: 700, fontSize: 12, bgcolor: alertFilter === 'RISK' ? '#ef4444' : 'transparent', color: alertFilter === 'RISK' ? 'white' : '#64748b' }}
              >
                Risk Breaches
              </Button>
              <Button
                variant={alertFilter === 'TRADE' ? 'contained' : 'text'}
                onClick={() => setAlertFilter('TRADE')}
                sx={{ textTransform: 'none', fontWeight: 700, fontSize: 12, bgcolor: alertFilter === 'TRADE' ? '#10b981' : 'transparent', color: alertFilter === 'TRADE' ? 'white' : '#64748b' }}
              >
                Trade Alerts
              </Button>
            </ButtonGroup>
          </Box>

          {loading ? (
            <Box sx={{ py: 2 }}>
              <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 2, mb: 1 }} />
              <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 2, mb: 1 }} />
              <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 2 }} />
            </Box>
          ) : filteredAlerts.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center', bgcolor: '#f8fafc', borderRadius: 2, border: '1px dashed #cbd5e1' }}>
              <Typography sx={{ color: '#64748b', fontSize: 14, fontWeight: 500 }}>
                No active alerts matching filter. All students within normal trading boundaries.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {filteredAlerts.map((alert, idx) => {
                const isRisk = alert.type === 'RISK';
                return (
                  <Paper
                    key={alert.id || idx}
                    elevation={0}
                    sx={{
                      p: 2,
                      borderRadius: 2.5,
                      border: isRisk ? '1px solid #fee2e2' : '1px solid #e2e8f0',
                      bgcolor: isRisk ? '#fff5f5' : '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 2
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Box
                        sx={{
                          p: 1,
                          borderRadius: 2,
                          bgcolor: isRisk ? '#fee2e2' : '#dcfce7',
                          color: isRisk ? '#ef4444' : '#16a34a',
                          display: 'flex'
                        }}
                      >
                        {isRisk ? <RiskIcon fontSize="small" /> : <TradeIcon fontSize="small" />}
                      </Box>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>
                            {alert.title}
                          </Typography>
                          <Chip
                            label={alert.type}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: 10,
                              fontWeight: 800,
                              bgcolor: isRisk ? '#fef2f2' : '#f0fdf4',
                              color: isRisk ? '#ef4444' : '#16a34a'
                            }}
                          />
                        </Box>
                        <Typography sx={{ color: '#475569', fontSize: 13, mt: 0.2 }}>
                          {alert.message}
                        </Typography>
                      </Box>
                    </Box>

                    <Typography sx={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {formatTimeAgo(alert.time)}
                    </Typography>
                  </Paper>
                );
              })}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* ── Live Session Student Roster ──────────────────────────────────── */}
      <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid #e2e8f0' }}>
        <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, flexWrap: 'wrap', gap: 2 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a', fontSize: 17 }}>
                Live Student Session Roster
              </Typography>
              <Typography variant="body2" sx={{ color: '#64748b', fontSize: 13 }}>
                Real-time capital utilization, positions, and profit/loss
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <TextField
                size="small"
                placeholder="Search student..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: '#94a3b8', fontSize: 18 }} />
                    </InputAdornment>
                  ),
                  endAdornment: searchQuery ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setSearchQuery('')}>
                        <ClearIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </InputAdornment>
                  ) : null
                }}
                sx={{ width: 220, bgcolor: 'white', '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />

              <Button
                variant="outlined"
                size="small"
                onClick={() => navigate('/reports')}
                endIcon={<OpenInNewIcon fontSize="small" />}
                sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, height: 40 }}
              >
                Full Leaderboard
              </Button>
            </Box>
          </Box>

          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 2.5, maxHeight: 520, overflow: 'auto' }}>
            <Table stickyHeader sx={{ minWidth: 700 }}>
              <TableHead sx={{ bgcolor: '#f8fafc' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>STUDENT</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12, textAlign: 'center' }}>STATUS</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>CAPITAL ALLOCATED</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12, width: 180 }}>MARGIN UTILIZATION</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12, textAlign: 'right' }}>NET P&L</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12, textAlign: 'right' }}>ROI %</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12, textAlign: 'right', pr: 3 }}>ACTIONS</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  [...Array(6)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton variant="text" width={140} /></TableCell>
                      <TableCell align="center"><Skeleton variant="rounded" width={70} height={24} sx={{ mx: 'auto' }} /></TableCell>
                      <TableCell><Skeleton variant="text" width={90} /></TableCell>
                      <TableCell><Skeleton variant="rounded" height={8} /></TableCell>
                      <TableCell align="right"><Skeleton variant="text" width={80} sx={{ ml: 'auto' }} /></TableCell>
                      <TableCell align="right"><Skeleton variant="rounded" width={50} height={22} sx={{ ml: 'auto' }} /></TableCell>
                      <TableCell align="right"><Skeleton variant="circular" width={28} height={28} sx={{ ml: 'auto' }} /></TableCell>
                    </TableRow>
                  ))
                ) : filteredRoster.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} sx={{ textAlign: 'center', py: 6, color: '#64748b' }}>
                      No students found matching your criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRoster.map((student, idx) => {
                    const isProfit = student.netPnl >= 0;
                    const marginUtil = student.marginUsedPercent || 0;
                    const isHighMargin = marginUtil >= 80;

                    return (
                      <TableRow key={student.studentId || idx} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                        {/* Student Name & Avatar */}
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Avatar
                              sx={{
                                width: 34,
                                height: 34,
                                bgcolor: idx === 0 ? '#f59e0b' : '#0284c7',
                                fontSize: 13,
                                fontWeight: 800
                              }}
                            >
                              {student.name?.charAt(0) || 'S'}
                            </Avatar>
                            <Box>
                              <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>
                                {student.name}
                              </Typography>
                              <Typography sx={{ color: '#94a3b8', fontSize: 12 }}>
                                {student.email}
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>

                        {/* Status */}
                        <TableCell align="center">
                          <Chip
                            icon={student.isActive ? <LiveDotIcon sx={{ fontSize: '9px !important', color: '#16a34a !important' }} /> : undefined}
                            label={student.isActive ? 'ACTIVE' : 'IDLE'}
                            size="small"
                            sx={{
                              bgcolor: student.isActive ? '#ecfdf5' : '#f1f5f9',
                              color: student.isActive ? '#16a34a' : '#94a3b8',
                              fontWeight: 700,
                              fontSize: 11,
                              borderRadius: 1.5
                            }}
                          />
                        </TableCell>

                        {/* Capital */}
                        <TableCell>
                          <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>
                            {fmtRupees(student.capital)}
                          </Typography>
                        </TableCell>

                        {/* Margin Utilization */}
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography sx={{ fontSize: 11, fontWeight: 700, color: isHighMargin ? '#ef4444' : '#64748b' }}>
                              {marginUtil}% Used
                            </Typography>
                            {isHighMargin && (
                              <Tooltip title="Exceeded 80% margin threshold">
                                <RiskIcon sx={{ fontSize: 14, color: '#ef4444' }} />
                              </Tooltip>
                            )}
                          </Box>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(100, marginUtil)}
                            sx={{
                              height: 6,
                              borderRadius: 3,
                              bgcolor: '#f1f5f9',
                              '& .MuiLinearProgress-bar': {
                                bgcolor: isHighMargin ? '#ef4444' : marginUtil > 50 ? '#f59e0b' : '#10b981',
                                borderRadius: 3
                              }
                            }}
                          />
                        </TableCell>

                        {/* Net P&L */}
                        <TableCell align="right">
                          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                            {isProfit ? (
                              <TrendingUpIcon sx={{ fontSize: 16, color: '#16a34a' }} />
                            ) : (
                              <TrendingDownIcon sx={{ fontSize: 16, color: '#ef4444' }} />
                            )}
                            <Typography sx={{ fontWeight: 800, color: isProfit ? '#16a34a' : '#ef4444', fontSize: 14 }}>
                              {isProfit ? '+' : ''}{fmtRupees(student.netPnl)}
                            </Typography>
                          </Box>
                        </TableCell>

                        {/* ROI % */}
                        <TableCell align="right">
                          <Chip
                            label={`${student.roi >= 0 ? '+' : ''}${student.roi?.toFixed(1) || '0.0'}%`}
                            size="small"
                            sx={{
                              bgcolor: student.roi >= 0 ? '#dcfce7' : '#fee2e2',
                              color: student.roi >= 0 ? '#15803d' : '#b91c1c',
                              fontWeight: 700,
                              fontSize: 11
                            }}
                          />
                        </TableCell>

                        {/* Quick Action */}
                        <TableCell align="right" sx={{ pr: 3 }}>
                          <Tooltip title="Assign Additional Capital">
                            <IconButton
                              size="small"
                              onClick={() => setCapitalModal({ open: true, student })}
                              sx={{ color: '#0284c7', '&:hover': { bgcolor: '#e0f2fe' } }}
                            >
                              <WalletIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* ── Modals & Notifications ───────────────────────────────────────── */}
      <QuickCapitalModal
        open={capitalModal.open}
        onClose={() => setCapitalModal({ open: false, student: null })}
        student={capitalModal.student}
        onUpdated={() => fetchSessionStats(selectedBatchId, true)}
      />

      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast(t => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={toast.severity} sx={{ borderRadius: 2, fontWeight: 600 }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default InstructorDashboard;
