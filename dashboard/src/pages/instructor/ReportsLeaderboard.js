import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Box, Typography, Button, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Avatar, Chip, IconButton,
  CircularProgress, Grid, Card, CardContent, FormControl,
  InputLabel, Select, MenuItem, Tooltip, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Alert, Snackbar,
  Tabs, Tab, Skeleton, Collapse
} from '@mui/material';
import {
  AccountBalanceWallet as WalletIcon,
  Assessment as AnalyticsIcon,
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  FiberManualRecord as LiveDotIcon,
  Search as SearchIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  ShowChart as ChartIcon,
  Timeline as TimelineIcon,
  EmojiEvents as TrophyIcon,
  Insights as InsightsIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import { API_URL } from '../../context/AuthContext';
import PnLChart from '../../components/analytics/PnLChart';
import ActivityTimeline from '../../components/activity/ActivityTimeline';

const SOCKET_URL = API_URL || 'http://localhost:8080';

const getAuthHeaders = () => {
  const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
};

const getBalance = (entry) => {
  if (!entry) return 0;
  if (entry.balance !== undefined && entry.balance !== null) return Number(entry.balance);
  if (entry.balancePaise !== undefined && entry.balancePaise !== null) return Number(entry.balancePaise) / 100;
  return 0;
};

const getPnl = (entry) => {
  if (!entry) return 0;
  if (entry.pnl !== undefined && entry.pnl !== null) return Number(entry.pnl);
  if (entry.netPnlPaise !== undefined && entry.netPnlPaise !== null) return Number(entry.netPnlPaise) / 100;
  return 0;
};

const fmtRupees = (rupees) => `₹${Math.round(rupees || 0).toLocaleString('en-IN')}`;

// ── Assign Capital Modal ───────────────────────────────────────────────────
const AssignCapitalModal = ({ open, onClose, student, onUpdated }) => {
  const [amount, setAmount] = useState('100000');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const quickAmounts = [25000, 50000, 100000, 200000, 500000];

  const handleSubmit = async () => {
    if (!amount || Number(amount) <= 0) {
      setError('Please enter a valid amount.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const studentId = student._id || student.studentId;
      const res = await axios.post(`${API_URL}/wallet/assign`, {
        studentId,
        amount: Number(amount),
      }, getAuthHeaders());

      const newBal = res.data.balance !== undefined ? res.data.balance : (res.data.balancePaise / 100);
      onUpdated(studentId, newBal);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to assign capital.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: 18, pb: 1 }}>
        Assign Virtual Trading Capital
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        {student && (
          <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
            <Typography sx={{ fontSize: 12, color: '#64748b' }}>Student</Typography>
            <Typography sx={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{student.name || student.studentName}</Typography>
            <Typography sx={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
              Current Balance: {fmtRupees(getBalance(student))}
            </Typography>
          </Box>
        )}
        {error && <Alert severity="error" sx={{ borderRadius: 2, fontSize: 13 }}>{error}</Alert>}

        <TextField
          label="Trading Capital Amount (₹) *"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          fullWidth
          size="small"
          InputProps={{ sx: { borderRadius: 2 } }}
        />

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {quickAmounts.map((amt) => (
            <Chip
              key={amt}
              label={fmtRupees(amt)}
              onClick={() => setAmount(String(amt))}
              size="small"
              sx={{
                borderRadius: 1.5,
                bgcolor: Number(amount) === amt ? '#e0f2fe' : '#f1f5f9',
                color: Number(amount) === amt ? '#0284c7' : '#475569',
                fontWeight: 600,
                border: Number(amount) === amt ? '1px solid #7dd3fc' : 'none',
                cursor: 'pointer',
              }}
            />
          ))}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={onClose} variant="outlined" sx={{ borderRadius: 2, color: '#64748b', borderColor: '#cbd5e1' }}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={loading}
          sx={{ bgcolor: '#0ea5e9', '&:hover': { bgcolor: '#0284c7' }, borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
        >
          {loading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Assign Capital'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Multi-Tab Student Analytics Modal ───────────────────────────────────────
const StudentAnalyticsModal = ({ open, onClose, studentId, studentName, onOpenAssignCapital }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState(0); // 0: Overview, 1: PnL Charts, 2: Activity Log

  useEffect(() => {
    if (open && studentId) {
      setActiveTab(0);
      setLoading(true);
      setError('');
      axios.get(`${API_URL}/student/${studentId}/analytics`, getAuthHeaders())
        .then(res => setData(res.data))
        .catch(err => setError(err.response?.data?.message || 'Failed to load analytics'))
        .finally(() => setLoading(false));
    } else {
      setData(null);
    }
  }, [open, studentId]);

  const summary = data?.summary;
  const netPnl = summary ? (summary.netPnlPaise / 100) : 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{ sx: { borderRadius: 3, maxHeight: '90vh' } }}
    >
      <DialogTitle sx={{ pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar sx={{ bgcolor: '#0ea5e9', width: 40, height: 40, fontWeight: 700 }}>
            {studentName?.charAt(0) || 'S'}
          </Avatar>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 18, lineHeight: 1.2 }}>
              {studentName}
            </Typography>
            <Typography sx={{ fontSize: 12, color: '#64748b' }}>
              Student ID: {studentId} • Trading Insights & Analytics
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: '#94a3b8' }}>
          ✕
        </IconButton>
      </DialogTitle>

      {/* Tab Navigation */}
      <Box sx={{ px: 3, borderBottom: '1px solid #e2e8f0', bgcolor: '#f8fafc' }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{
            minHeight: 44,
            '& .MuiTab-root': { minHeight: 44, py: 1, textTransform: 'none', fontWeight: 600, fontSize: 13 },
            '& .Mui-selected': { color: '#0ea5e9' },
            '& .MuiTabs-indicator': { bgcolor: '#0ea5e9', height: 3, borderRadius: 1.5 }
          }}
        >
          <Tab icon={<AnalyticsIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Overview" />
          <Tab icon={<ChartIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="PnL & Growth Charts" />
          <Tab icon={<TimelineIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Activity Log & Audit Trail" />
        </Tabs>
      </Box>

      <DialogContent dividers sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Skeleton variant="rectangular" height={60} sx={{ borderRadius: 2 }} />
            <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
            <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 2 }} />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>
        ) : (
          <>
            {/* Tab 0: Overview */}
            {activeTab === 0 && (
              <>
                <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2.5, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography sx={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                      Wallet Balance
                    </Typography>
                    <Typography sx={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
                      {fmtRupees(data?.balance ?? (data?.balancePaise ? data.balancePaise / 100 : ((data?.student?.wallet?.balancePaise || 0) / 100)))}
                    </Typography>
                  </Box>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => {
                      onClose();
                      onOpenAssignCapital({ _id: studentId, name: studentName, balance: data?.balance ?? ((data?.student?.wallet?.balancePaise || 0) / 100) });
                    }}
                    sx={{ bgcolor: '#0ea5e9', '&:hover': { bgcolor: '#0284c7' }, borderRadius: 2, textTransform: 'none', fontWeight: 600, fontSize: 13 }}
                  >
                    Assign Capital
                  </Button>
                </Box>

                <Grid container spacing={1.5}>
                  <Grid item xs={6} sm={3}>
                    <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                      <Typography sx={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>WIN RATE</Typography>
                      <Typography sx={{ fontSize: 20, fontWeight: 800, color: (data?.winRate || summary?.winRate || 0) >= 50 ? '#16a34a' : '#ef4444', mt: 0.5 }}>
                        {data?.winRate !== undefined ? `${data.winRate.toFixed(1)}%` : (summary ? `${summary.winRate.toFixed(1)}%` : '0%')}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                      <Typography sx={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>TOTAL TRADES</Typography>
                      <Typography sx={{ fontSize: 20, fontWeight: 800, color: '#0f172a', mt: 0.5 }}>
                        {data?.totalTrades ?? summary?.totalTrades ?? 0}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                      <Typography sx={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>OPEN POSITIONS</Typography>
                      <Typography sx={{ fontSize: 20, fontWeight: 800, color: '#0ea5e9', mt: 0.5 }}>
                        {data?.openPositions ?? summary?.openPositions ?? 0}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                      <Typography sx={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>NET P&L</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mt: 0.5 }}>
                        {(data?.pnl ?? netPnl) >= 0 ? (
                          <TrendingUpIcon sx={{ fontSize: 18, color: '#16a34a' }} />
                        ) : (
                          <TrendingDownIcon sx={{ fontSize: 18, color: '#ef4444' }} />
                        )}
                        <Typography sx={{ fontSize: 20, fontWeight: 800, color: (data?.pnl ?? netPnl) >= 0 ? '#16a34a' : '#ef4444' }}>
                          {(data?.pnl ?? netPnl) >= 0 ? '+' : ''}₹{(data?.pnl ?? netPnl).toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                </Grid>

                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <Box sx={{ flex: 1, minWidth: 200, p: 2, bgcolor: '#f0fdf4', borderRadius: 2, border: '1px solid #bbf7d0' }}>
                    <Typography sx={{ fontSize: 11, color: '#166534', fontWeight: 700 }}>🏆 BEST TRADE</Typography>
                    <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#16a34a', mt: 0.5 }}>
                      {summary?.bestTrade ? `+₹${summary.bestTrade.pnl.toLocaleString('en-IN')}` : '—'}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 200, p: 2, bgcolor: '#fef2f2', borderRadius: 2, border: '1px solid #fecaca' }}>
                    <Typography sx={{ fontSize: 11, color: '#991b1b', fontWeight: 700 }}>⚠️ WORST TRADE</Typography>
                    <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#ef4444', mt: 0.5 }}>
                      {summary?.worstTrade ? `₹${summary.worstTrade.pnl.toLocaleString('en-IN')}` : '—'}
                    </Typography>
                  </Box>
                </Box>
              </>
            )}

            {/* Tab 1: PnL & Growth Charts */}
            {activeTab === 1 && (
              <Box sx={{ width: '100%' }}>
                <PnLChart studentId={studentId} height={260} />
              </Box>
            )}

            {/* Tab 2: Activity Logs & Audit Trail */}
            {activeTab === 2 && (
              <Box sx={{ width: '100%' }}>
                <ActivityTimeline studentId={studentId} />
              </Box>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} variant="outlined" sx={{ borderRadius: 2, color: '#64748b', borderColor: '#cbd5e1' }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Main Reports & Leaderboard Component ───────────────────────────────────
const ReportsLeaderboard = () => {
  const { id: routeBatchId } = useParams();
  const navigate = useNavigate();

  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState(routeBatchId || '');
  const [period, setPeriod] = useState('today'); // 'today' | 'weekly' | 'monthly'
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [liveConnected, setLiveConnected] = useState(false);
  const [lastTickTime, setLastTickTime] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showBatchAnalytics, setShowBatchAnalytics] = useState(false);
  const [batchPerformance, setBatchPerformance] = useState(null);
  const [perfLoading, setPerfLoading] = useState(false);

  const fetchBatchPerformance = useCallback(async () => {
    if (!selectedBatchId) return;
    setPerfLoading(true);
    try {
      const res = await axios.get(`${API_URL}/batch/${selectedBatchId}/performance`, getAuthHeaders());
      setBatchPerformance(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setPerfLoading(false);
    }
  }, [selectedBatchId]);

  useEffect(() => {
    if (showBatchAnalytics && selectedBatchId) {
      fetchBatchPerformance();
    }
  }, [showBatchAnalytics, selectedBatchId, fetchBatchPerformance]);

  // Modals

  const [capitalModal, setCapitalModal] = useState({ open: false, student: null });
  const [analyticsModal, setAnalyticsModal] = useState({ open: false, studentId: null, studentName: '' });
  const [toast, setToast] = useState({ open: false, msg: '', severity: 'success' });

  const socketRef = useRef(null);

  const showToast = (msg, severity = 'success') => setToast({ open: true, msg, severity });

  // ── Fetch Batches ────────────────────────────────────────────────────────
  useEffect(() => {
    axios.get(`${API_URL}/batches`, getAuthHeaders())
      .then(res => {
        const batchList = res.data || [];
        setBatches(batchList);
        if (routeBatchId) {
          setSelectedBatchId(routeBatchId);
        } else if (batchList.length > 0 && !selectedBatchId) {
          setSelectedBatchId(batchList[0]._id);
        }
      })
      .catch(() => showToast('Failed to load batches', 'error'));
  }, [routeBatchId]);

  // ── Fetch Leaderboard Data ───────────────────────────────────────────────
  const fetchLeaderboard = useCallback(async () => {
    if (!selectedBatchId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/batch/${selectedBatchId}/leaderboard?period=${period}`, getAuthHeaders());
      setLeaderboard(res.data || []);
      setLastTickTime(new Date());
    } catch (err) {
      console.error(err);
      showToast('Failed to load leaderboard', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedBatchId, period]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // ── Real-time Socket Listener ────────────────────────────────────────────
  useEffect(() => {
    if (!selectedBatchId) return;

    const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
    const sock = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = sock;

    sock.on('connect', () => {
      setLiveConnected(true);
      sock.emit('joinBatch', selectedBatchId);
    });

    sock.on('disconnect', () => {
      setLiveConnected(false);
    });

    // 1. Listen for individual student pnl_update event
    sock.on('pnl_update', (update) => {
      if (update.batchId && update.batchId !== selectedBatchId) return;
      setLastTickTime(new Date());

      setLeaderboard(prev => {
        const index = prev.findIndex(item => item.studentId === update.studentId);
        let updatedList;
        if (index >= 0) {
          updatedList = [...prev];
          updatedList[index] = {
            ...updatedList[index],
            ...update,
            pnl: getPnl(update),
            balance: getBalance(update),
          };
        } else {
          updatedList = [...prev, {
            ...update,
            pnl: getPnl(update),
            balance: getBalance(update),
          }];
        }
        return updatedList.sort((a, b) => getPnl(b) - getPnl(a));
      });
    });

    // 2. Listen for batch instructorFeed array broadcast every 2s
    sock.on('instructorFeed', (batchUpdates) => {
      if (!Array.isArray(batchUpdates) || batchUpdates.length === 0) return;
      setLastTickTime(new Date());

      setLeaderboard(prev => {
        const map = new Map(prev.map(item => [item.studentId, item]));
        batchUpdates.forEach(update => {
          const sId = update.studentId;
          const existing = map.get(sId);
          if (existing) {
            map.set(sId, {
              ...existing,
              ...update,
              pnl: getPnl(update),
              balance: getBalance(update),
            });
          } else {
            map.set(sId, {
              ...update,
              pnl: getPnl(update),
              balance: getBalance(update),
            });
          }
        });
        const updatedList = Array.from(map.values());
        return updatedList.sort((a, b) => getPnl(b) - getPnl(a));
      });
    });

    // 3. Listen for student trade executions
    sock.on('instructorFeed:order', () => {
      setLastTickTime(new Date());
      fetchLeaderboard();
    });

    return () => {
      sock.disconnect();
    };
  }, [selectedBatchId, fetchLeaderboard]);

  // ── Capital Updated Handler ──────────────────────────────────────────────
  const handleCapitalUpdated = (studentId, newBalance) => {
    setLeaderboard(prev => prev.map(s => s.studentId === studentId ? { ...s, balance: newBalance } : s));
    showToast('Trading capital assigned successfully!');
  };

  // ── Filtered and Ranked List ─────────────────────────────────────────────
  const filteredLeaderboard = useMemo(() => {
    if (!searchQuery.trim()) return leaderboard;
    const q = searchQuery.toLowerCase();
    return leaderboard.filter(s =>
      (s.studentName || '').toLowerCase().includes(q) ||
      (s.studentUserId || '').toLowerCase().includes(q)
    );
  }, [leaderboard, searchQuery]);

  // ── Metrics Summary ──────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const totalPnl = leaderboard.reduce((acc, s) => acc + getPnl(s), 0);
    const totalBalance = leaderboard.reduce((acc, s) => acc + getBalance(s), 0);
    const topPerformer = leaderboard.length > 0 ? leaderboard[0] : null;
    return {
      totalPnl,
      totalBalance,
      topPerformer,
      studentCount: leaderboard.length,
    };
  }, [leaderboard]);

  const selectedBatch = batches.find(b => b._id === selectedBatchId);
  const top3 = leaderboard.slice(0, 3);

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['Rank', 'Student Name', 'User ID', 'Wallet Balance (₹)', 'Net P&L (₹)', 'ROI (%)'];
    const rows = leaderboard.map((s, idx) => [
      idx + 1,
      `"${s.studentName}"`,
      `"${s.studentUserId || ''}"`,
      getBalance(s).toFixed(2),
      getPnl(s).toFixed(2),
      `${(s.roi || 0).toFixed(2)}%`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Leaderboard_${selectedBatch?.name || 'Batch'}_${period}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Box sx={{ pb: 6 }}>
      {/* ── Top Header ────────────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a' }}>
              Batch Dashboard & Leaderboard
            </Typography>
            {liveConnected && (
              <Chip
                icon={<LiveDotIcon sx={{ fontSize: '10px !important', color: '#16a34a !important' }} />}
                label="LIVE SYNC ACTIVE"
                size="small"
                sx={{ bgcolor: '#dcfce7', color: '#16a34a', fontWeight: 700, fontSize: 11 }}
              />
            )}
          </Box>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            Real-time trading performance, virtual capital allocation, and cohort leaderboards
            {lastTickTime && ` • Last tick: ${lastTickTime.toLocaleTimeString()}`}
          </Typography>
        </Box>

        {/* Batch Selector & Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 220, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}>
            <InputLabel>Select Batch</InputLabel>
            <Select
              value={selectedBatchId}
              onChange={(e) => {
                setSelectedBatchId(e.target.value);
                navigate(`/batch/${e.target.value}/dashboard`);
              }}
              label="Select Batch"
            >
              {batches.map(b => (
                <MenuItem key={b._id} value={b._id}>
                  {b.name} ({b.code})
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Tooltip title="Refresh Realtime Data">
            <IconButton onClick={fetchLeaderboard} sx={{ border: '1px solid #e2e8f0', borderRadius: 2, bgcolor: 'white' }}>
              <RefreshIcon fontSize="small" sx={{ color: '#64748b' }} />
            </IconButton>
          </Tooltip>

          <Button
            variant={showBatchAnalytics ? "contained" : "outlined"}
            startIcon={<InsightsIcon />}
            onClick={() => setShowBatchAnalytics(prev => !prev)}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              bgcolor: showBatchAnalytics ? '#0ea5e9' : 'white',
              borderColor: '#cbd5e1',
              color: showBatchAnalytics ? 'white' : '#475569',
              '&:hover': { bgcolor: showBatchAnalytics ? '#0284c7' : '#f8fafc' }
            }}
          >
            {showBatchAnalytics ? "Hide Cohort Analytics" : "Cohort Analytics"}
          </Button>

          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExportCSV}
            sx={{ borderColor: '#cbd5e1', color: '#475569', borderRadius: 2, textTransform: 'none', fontWeight: 600, bgcolor: 'white' }}
          >
            Export CSV
          </Button>
        </Box>
      </Box>

      {/* ── Collapsible Cohort Analytics Card (Module 1) ────────────────────── */}
      <Collapse in={showBatchAnalytics}>
        <Card sx={{ mb: 3, borderRadius: 3, border: '1px solid #bae6fd', bgcolor: '#f0f9ff', boxShadow: 'none' }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <InsightsIcon sx={{ color: '#0284c7', fontSize: 24 }} />
                <Typography variant="h6" sx={{ fontWeight: 800, fontSize: 16, color: '#0369a1' }}>
                  Cohort Analytics: {batchPerformance?.batchName || selectedBatch?.name}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Chip
                  label={`Cohort Avg P&L: ${fmtRupees(batchPerformance?.batchAverage?.avgPnl || 0)}`}
                  sx={{ bgcolor: '#e0f2fe', color: '#0369a1', fontWeight: 700, fontSize: 12 }}
                />
                <Chip
                  label={`Cohort Win Rate: ${batchPerformance?.batchAverage?.avgWinRate || 0}%`}
                  sx={{ bgcolor: '#dcfce7', color: '#15803d', fontWeight: 700, fontSize: 12 }}
                />
              </Box>
            </Box>

            {perfLoading ? (
              <Skeleton variant="rectangular" height={220} sx={{ borderRadius: 2 }} />
            ) : batchPerformance?.timeline && batchPerformance.timeline.length > 0 ? (
              <Box sx={{ height: 220, bgcolor: 'white', p: 2, borderRadius: 2, border: '1px solid #e0f2fe' }}>
                <Line
                  data={{
                    labels: batchPerformance.timeline.map(t => {
                      const d = new Date(t.date);
                      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    }),
                    datasets: [
                      {
                        label: 'Top Performer P&L',
                        data: batchPerformance.timeline.map(t => t.topPnl),
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.35,
                        fill: true,
                        borderWidth: 2,
                      },
                      {
                        label: 'Cohort Average P&L',
                        data: batchPerformance.timeline.map(t => t.avgPnl),
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.05)',
                        tension: 0.35,
                        fill: true,
                        borderWidth: 2,
                        borderDash: [5, 5],
                      }
                    ]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
                      tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtRupees(ctx.parsed.y)}` } }
                    },
                    scales: {
                      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                      y: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 }, callback: (v) => fmtRupees(v) } }
                    }
                  }}
                />
              </Box>
            ) : (
              <Typography sx={{ color: '#64748b', fontSize: 13 }}>No cohort performance timeline recorded yet.</Typography>
            )}
          </CardContent>
        </Card>
      </Collapse>

      {/* ── Time Period Tabs ───────────────────────────────────────────────── */}
      <Box sx={{ mb: 3, borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Tabs
          value={period}
          onChange={(_, val) => setPeriod(val)}
          sx={{
            '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, fontSize: 14, minWidth: 100 },
            '& .Mui-selected': { color: '#0ea5e9' },
            '& .MuiTabs-indicator': { bgcolor: '#0ea5e9', height: 3, borderRadius: 1.5 }
          }}
        >
          <Tab value="today" label="Today (Intraday)" />
          <Tab value="weekly" label="This Week" />
          <Tab value="monthly" label="This Month" />
        </Tabs>

        <TextField
          size="small"
          placeholder="Search student or ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ width: 240, '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'white' } }}
          InputProps={{
            startAdornment: <SearchIcon sx={{ color: '#94a3b8', fontSize: 18, mr: 1 }} />,
            endAdornment: searchQuery ? (
              <IconButton size="small" onClick={() => setSearchQuery('')} sx={{ p: 0.5 }}>
                <ClearIcon sx={{ fontSize: 16 }} />
              </IconButton>
            ) : null
          }}
        />
      </Box>

      {/* ── Metric Cards ──────────────────────────────────────────────────── */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* Top Performer */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none', bgcolor: '#fffdf5' }}>
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Typography sx={{ color: '#b45309', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', mb: 1 }}>
                🏆 Top Performer
              </Typography>
              {metrics.topPerformer ? (
                <>
                  <Typography sx={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }} noWrap>
                    {metrics.topPerformer.studentName}
                  </Typography>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: getPnl(metrics.topPerformer) >= 0 ? '#16a34a' : '#ef4444', mt: 0.5 }}>
                    {getPnl(metrics.topPerformer) >= 0 ? '+' : ''}{fmtRupees(getPnl(metrics.topPerformer))} ({metrics.topPerformer.roi ? `${metrics.topPerformer.roi.toFixed(1)}%` : '0%'})
                  </Typography>
                </>
              ) : (
                <Typography sx={{ color: '#94a3b8', fontSize: 14 }}>No trades yet</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Batch Total PnL */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Typography sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', mb: 1 }}>
                📈 Batch Net P&L ({period.toUpperCase()})
              </Typography>
              <Typography sx={{ fontSize: 22, fontWeight: 800, color: metrics.totalPnl >= 0 ? '#16a34a' : '#ef4444' }}>
                {metrics.totalPnl >= 0 ? '+' : ''}{fmtRupees(metrics.totalPnl)}
              </Typography>
              <Typography sx={{ color: '#64748b', fontSize: 12, mt: 0.5 }}>
                Cumulative cohort return
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Total Capital Allocated */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Typography sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', mb: 1 }}>
                💰 Total Capital Allocated
              </Typography>
              <Typography sx={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
                {fmtRupees(metrics.totalBalance)}
              </Typography>
              <Typography sx={{ color: '#64748b', fontSize: 12, mt: 0.5 }}>
                Virtual pool across students
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Active Students */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Typography sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', mb: 1 }}>
                👥 Students Enrolled
              </Typography>
              <Typography sx={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
                {metrics.studentCount}
              </Typography>
              <Typography sx={{ color: '#64748b', fontSize: 12, mt: 0.5 }}>
                {selectedBatch?.name || 'Selected Batch'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Podium Top 3 Cards ────────────────────────────────────────────── */}
      {top3.length >= 2 && (
        <Box sx={{ mb: 3 }}>
          <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: 15, mb: 1.5 }}>
            Top Cohort Performers
          </Typography>
          <Grid container spacing={2}>
            {top3.map((student, idx) => {
              const medals = ['🥇 1st Place', '🥈 2nd Place', '🥉 3rd Place'];
              const bgColors = ['#fffbeb', '#f8fafc', '#fff7ed'];
              const borderColors = ['#fde68a', '#e2e8f0', '#ffedd5'];
              const studentPnl = getPnl(student);
              return (
                <Grid item xs={12} sm={4} key={student.studentId || idx}>
                  <Box sx={{
                    p: 2,
                    borderRadius: 2.5,
                    bgcolor: bgColors[idx] || '#ffffff',
                    border: `1px solid ${borderColors[idx] || '#e2e8f0'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar sx={{
                        width: 42,
                        height: 42,
                        fontWeight: 800,
                        bgcolor: idx === 0 ? '#f59e0b' : idx === 1 ? '#94a3b8' : '#d97706',
                        color: 'white',
                      }}>
                        {student.studentName?.charAt(0) || 'S'}
                      </Avatar>
                      <Box>
                        <Typography sx={{ fontSize: 11, fontWeight: 700, color: idx === 0 ? '#b45309' : '#64748b' }}>
                          {medals[idx]}
                        </Typography>
                        <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                          {student.studentName}
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 800, color: studentPnl >= 0 ? '#16a34a' : '#ef4444' }}>
                        {studentPnl >= 0 ? '+' : ''}{fmtRupees(studentPnl)}
                      </Typography>
                      <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                        ROI: {student.roi ? `${student.roi.toFixed(1)}%` : '0%'}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      )}

      {/* ── Leaderboard Table ──────────────────────────────────────────────── */}
      <TableContainer component={Paper} elevation={0} sx={{ maxHeight: 620, border: '1px solid #e2e8f0', borderRadius: 3, overflow: 'auto' }}>
        <Table stickyHeader sx={{ minWidth: 650 }} aria-label="leaderboard table">
          <TableHead sx={{ bgcolor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, color: '#64748b', width: 90 }}>RANK</TableCell>
              <TableCell sx={{ fontWeight: 700, color: '#64748b' }}>STUDENT</TableCell>
              <TableCell sx={{ fontWeight: 700, color: '#64748b' }}>WALLET CAPITAL</TableCell>
              <TableCell sx={{ fontWeight: 700, color: '#64748b', textAlign: 'center' }}>OPEN POSITIONS</TableCell>
              <TableCell sx={{ fontWeight: 700, color: '#64748b', textAlign: 'right' }}>NET P&L ({period.toUpperCase()})</TableCell>
              <TableCell sx={{ fontWeight: 700, color: '#64748b', textAlign: 'right' }}>ROI %</TableCell>
              <TableCell sx={{ fontWeight: 700, color: '#64748b', textAlign: 'right', pr: 3 }}>ACTIONS</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton variant="rounded" width={45} height={24} /></TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Skeleton variant="circular" width={34} height={34} />
                      <Box sx={{ width: 120 }}>
                        <Skeleton variant="text" width="100%" height={18} />
                        <Skeleton variant="text" width="60%" height={14} />
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell><Skeleton variant="text" width={80} /></TableCell>
                  <TableCell align="center"><Skeleton variant="rounded" width={55} height={22} sx={{ mx: 'auto' }} /></TableCell>
                  <TableCell align="right"><Skeleton variant="text" width={70} sx={{ ml: 'auto' }} /></TableCell>
                  <TableCell align="right"><Skeleton variant="rounded" width={50} height={22} sx={{ ml: 'auto' }} /></TableCell>
                  <TableCell align="right"><Skeleton variant="circular" width={28} height={28} sx={{ ml: 'auto' }} /></TableCell>
                </TableRow>
              ))
            ) : filteredLeaderboard.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} sx={{ textAlign: 'center', py: 8 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                      {searchQuery ? 'No matching students found' : 'No student records found in this batch'}
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: '#64748b' }}>
                      {searchQuery ? `No records matching "${searchQuery}"` : 'Enrolled students will appear here with live P&L and positions.'}
                    </Typography>
                    {searchQuery && (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setSearchQuery('')}
                        startIcon={<ClearIcon />}
                        sx={{ mt: 1, borderRadius: 2, textTransform: 'none' }}
                      >
                        Clear Filter
                      </Button>
                    )}
                  </Box>
                </TableCell>
              </TableRow>
            ) : (
              filteredLeaderboard.map((entry, index) => {
                const isTop1 = index === 0;
                const isTop2 = index === 1;
                const isTop3 = index === 2;
                const pnl = getPnl(entry);
                const isProfit = pnl >= 0;
                const balance = getBalance(entry);

                return (
                  <TableRow key={entry.studentId || index} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                    {/* Rank */}
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {isTop1 ? (
                          <Chip label="🥇 1st" size="small" sx={{ bgcolor: '#fef3c7', color: '#b45309', fontWeight: 800 }} />
                        ) : isTop2 ? (
                          <Chip label="🥈 2nd" size="small" sx={{ bgcolor: '#f1f5f9', color: '#475569', fontWeight: 800 }} />
                        ) : isTop3 ? (
                          <Chip label="🥉 3rd" size="small" sx={{ bgcolor: '#ffedd5', color: '#c2410c', fontWeight: 800 }} />
                        ) : (
                          <Typography variant="body2" sx={{ fontWeight: 700, color: '#94a3b8', pl: 1 }}>
                            #{index + 1}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>

                    {/* Student */}
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar sx={{
                          width: 34,
                          height: 34,
                          bgcolor: isTop1 ? '#f59e0b' : '#0ea5e9',
                          color: 'white',
                          fontSize: 13,
                          fontWeight: 700
                        }}>
                          {entry.studentName?.charAt(0) || 'S'}
                        </Avatar>
                        <Box>
                          <Typography sx={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>
                            {entry.studentName}
                          </Typography>
                          {entry.studentUserId && (
                            <Typography sx={{ color: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}>
                              {entry.studentUserId}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </TableCell>

                    {/* Capital */}
                    <TableCell>
                      <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>
                        {fmtRupees(balance)}
                      </Typography>
                    </TableCell>

                    {/* Open Positions */}
                    <TableCell sx={{ textAlign: 'center' }}>
                      <Chip
                        label={`${entry.openPositions || entry.openPositionsCount || 0} Open`}
                        size="small"
                        sx={{
                          bgcolor: (entry.openPositions || entry.openPositionsCount || 0) > 0 ? '#eff6ff' : '#f8fafc',
                          color: (entry.openPositions || entry.openPositionsCount || 0) > 0 ? '#2563eb' : '#94a3b8',
                          fontWeight: 600,
                          fontSize: 11
                        }}
                      />
                    </TableCell>

                    {/* Net P&L */}
                    <TableCell sx={{ textAlign: 'right' }}>
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                        {isProfit ? (
                          <TrendingUpIcon sx={{ fontSize: 16, color: '#16a34a' }} />
                        ) : (
                          <TrendingDownIcon sx={{ fontSize: 16, color: '#ef4444' }} />
                        )}
                        <Typography sx={{ fontWeight: 800, color: isProfit ? '#16a34a' : '#ef4444', fontSize: 14 }}>
                          {isProfit ? '+' : ''}{fmtRupees(pnl)}
                        </Typography>
                      </Box>
                    </TableCell>


                    {/* ROI */}
                    <TableCell sx={{ textAlign: 'right' }}>
                      <Chip
                        label={`${entry.roi !== undefined ? (entry.roi >= 0 ? '+' : '') + entry.roi.toFixed(1) : '0.0'}%`}
                        size="small"
                        sx={{
                          bgcolor: (entry.roi || 0) >= 0 ? '#dcfce7' : '#fee2e2',
                          color: (entry.roi || 0) >= 0 ? '#16a34a' : '#ef4444',
                          fontWeight: 700,
                          fontSize: 11
                        }}
                      />
                    </TableCell>

                    {/* Actions */}
                    <TableCell sx={{ textAlign: 'right', pr: 3 }}>
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                        <Tooltip title="View Trading Analytics">
                          <IconButton
                            size="small"
                            onClick={() => setAnalyticsModal({ open: true, studentId: entry.studentId, studentName: entry.studentName })}
                            sx={{ color: '#059669', '&:hover': { bgcolor: '#ecfdf5' } }}
                          >
                            <AnalyticsIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>

                        <Tooltip title="Assign Virtual Capital">
                          <IconButton
                            size="small"
                            onClick={() => setCapitalModal({
                              open: true,
                              student: { _id: entry.studentId, name: entry.studentName, balance }
                            })}
                            sx={{ color: '#0ea5e9', '&:hover': { bgcolor: '#e0f2fe' } }}
                          >
                            <WalletIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      <AssignCapitalModal
        open={capitalModal.open}
        onClose={() => setCapitalModal({ open: false, student: null })}
        student={capitalModal.student}
        onUpdated={handleCapitalUpdated}
      />

      <StudentAnalyticsModal
        open={analyticsModal.open}
        onClose={() => setAnalyticsModal({ open: false, studentId: null, studentName: '' })}
        studentId={analyticsModal.studentId}
        studentName={analyticsModal.studentName}
        onOpenAssignCapital={(student) => setCapitalModal({ open: true, student })}
      />

      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast(t => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={toast.severity} sx={{ borderRadius: 2, fontWeight: 500 }}>
          {toast.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ReportsLeaderboard;
