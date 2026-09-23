import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableHead,
  TableRow, TableContainer, Chip, IconButton, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Alert, Snackbar, Tooltip, Avatar, MenuItem, Select, FormControl,
  InputLabel, Grid, Card, CardContent, InputAdornment, Tabs, Tab, Skeleton
} from '@mui/material';
import {
  Add as AddIcon,
  ToggleOn,
  ToggleOff,
  AccountBalanceWallet as WalletIcon,
  School as SchoolIcon,
  VpnKey as KeyIcon,
  TableChart as GridIcon,
  Search as SearchIcon,
  People as PeopleIcon,
  CheckCircle as ActiveIcon,
  Assessment as AnalyticsIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  ShowChart as ChartIcon,
  Timeline as TimelineIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../../context/AuthContext';
import PnLChart from '../../components/analytics/PnLChart';
import ActivityTimeline from '../../components/activity/ActivityTimeline';

const fmt = (paise) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const getAuthHeaders = () => {
  const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
};

// ── Add Student Modal ──────────────────────────────────────────────────────
const AddStudentModal = ({ open, onClose, onAdded, batches }) => {
  const [form, setForm] = useState({ name: '', email: '', password: '', batchId: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (f) => (e) => setForm(p => ({ ...p, [f]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.password) {
      setError('Name, email and password are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(`${API_URL}/institutes/student`, form);
      onAdded(res.data);
      setForm({ name: '', email: '', password: '', batchId: '' });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create student.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: 18 }}>Add Student</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2 }}>
        {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
        <TextField label="Full Name *" value={form.name} onChange={handleChange('name')} fullWidth
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
        <TextField label="Email *" type="email" value={form.email} onChange={handleChange('email')} fullWidth
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
        <TextField label="Password *" type="password" value={form.password} onChange={handleChange('password')} fullWidth
          placeholder="Min 8 characters" sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
        <FormControl fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}>
          <InputLabel>Assign to Batch (optional)</InputLabel>
          <Select
            value={form.batchId}
            onChange={handleChange('batchId')}
            label="Assign to Batch (optional)"
          >
            <MenuItem value=""><em>No batch (assign later)</em></MenuItem>
            {batches.map(b => (
              <MenuItem key={b._id} value={b._id}>{b.name} ({b.code})</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Alert severity="info" sx={{ borderRadius: 2, fontSize: 12 }}>
          If a batch is selected, the student's wallet will be provisioned with the batch's starting capital automatically.
        </Alert>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={onClose} sx={{ color: '#64748b' }}>Cancel</Button>
        <Button
          variant="contained" onClick={handleSubmit} disabled={loading}
          sx={{ bgcolor: '#0ea5e9', '&:hover': { bgcolor: '#0284c7' }, borderRadius: 2, px: 3, fontWeight: 600 }}
        >
          {loading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Add Student'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

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
      const res = await axios.post(`${API_URL}/wallet/assign`, {
        studentId: student._id,
        amount: Number(amount),
      });
      const newBalPaise = res.data.balancePaise !== undefined ? res.data.balancePaise : (res.data.balance * 100);
      onUpdated(student._id, newBalPaise);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update capital.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: 18, pb: 1 }}>
        Assign Trading Capital
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        {student && (
          <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
            <Typography sx={{ fontSize: 12, color: '#64748b' }}>Student</Typography>
            <Typography sx={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{student.name}</Typography>
            <Typography sx={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
              Current Balance: {fmt(student.balancePaise || 0)}
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
          placeholder="e.g. 100000"
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {quickAmounts.map((amt) => (
            <Chip
              key={amt}
              label={`₹${(amt).toLocaleString('en-IN')}`}
              onClick={() => setAmount(String(amt))}
              clickable
              color={Number(amount) === amt ? 'primary' : 'default'}
              variant={Number(amount) === amt ? 'filled' : 'outlined'}
              size="small"
              sx={{ fontWeight: 600 }}
            />
          ))}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={onClose} sx={{ color: '#64748b' }}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading}
          sx={{ bgcolor: '#0ea5e9', '&:hover': { bgcolor: '#0284c7' }, borderRadius: 2, px: 3, fontWeight: 600 }}
        >
          {loading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Assign Capital'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Student Analytics Drawer ────────────────────────────────────────────────
const StudentAnalyticsDrawer = ({ open, onClose, student, onOpenAssignCapital }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    if (open && student) {
      setActiveTab(0);
      fetchAnalytics();
    } else {
      setData(null);
    }
  }, [open, student]);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_URL}/student/${student._id}/analytics`);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load student analytics');
    } finally {
      setLoading(false);
    }
  };

  const summary = data?.summary;
  const netPnl = summary ? (summary.netPnlPaise / 100) : 0;
  const isProfitable = netPnl >= 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{
        sx: {
          borderRadius: { xs: 0, sm: 3 },
          m: { xs: 0, sm: 2 },
          maxHeight: '90vh'
        }
      }}
    >
      <DialogTitle sx={{ pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar sx={{ bgcolor: '#0ea5e9', width: 40, height: 40, fontWeight: 700 }}>
            {student?.name?.charAt(0) || 'S'}
          </Avatar>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 18, lineHeight: 1.2 }}>
              {student?.name}
            </Typography>
            <Typography sx={{ fontSize: 12, color: '#64748b' }}>
              {student?.email} • {student?.batch?.name || 'Unassigned'}
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

      <DialogContent dividers sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
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
            {activeTab === 0 && (
              <>
                {/* Quick Balance & Action Banner */}
                <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2.5, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography sx={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                      Current Wallet Balance
                    </Typography>
                    <Typography sx={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
                      {fmt(data?.student?.wallet?.balancePaise ?? student?.balancePaise ?? 0)}
                    </Typography>
                  </Box>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => {
                      onClose();
                      onOpenAssignCapital(student);
                    }}
                    sx={{ bgcolor: '#0ea5e9', '&:hover': { bgcolor: '#0284c7' }, borderRadius: 2, textTransform: 'none', fontWeight: 600, fontSize: 13 }}
                  >
                    Assign Capital
                  </Button>
                </Box>

                {/* Performance Grid */}
                <Grid container spacing={1.5}>
                  <Grid item xs={6} sm={3}>
                    <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                      <Typography sx={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>WIN RATE</Typography>
                      <Typography sx={{ fontSize: 18, fontWeight: 800, color: (summary?.winRate || 0) >= 50 ? '#16a34a' : '#ef4444', mt: 0.5 }}>
                        {summary ? `${summary.winRate.toFixed(1)}%` : '0%'}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                      <Typography sx={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>TOTAL TRADES</Typography>
                      <Typography sx={{ fontSize: 18, fontWeight: 800, color: '#0f172a', mt: 0.5 }}>
                        {summary?.totalTrades || 0}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                      <Typography sx={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>NET P&L</Typography>
                      <Typography sx={{ fontSize: 18, fontWeight: 800, color: isProfitable ? '#16a34a' : '#ef4444', mt: 0.5 }}>
                        {isProfitable ? '+' : ''}₹{netPnl.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                      <Typography sx={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>WIN / LOSS</Typography>
                      <Typography sx={{ fontSize: 16, fontWeight: 800, color: '#0f172a', mt: 0.5 }}>
                        <span style={{ color: '#16a34a' }}>{summary?.winningTrades || 0}W</span> / <span style={{ color: '#ef4444' }}>{summary?.losingTrades || 0}L</span>
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>

                {/* Realized vs Unrealized Breakdown */}
                <Box sx={{ display: 'flex', gap: 2, p: 2, bgcolor: '#ffffff', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>REALIZED P&L</Typography>
                    <Typography sx={{ fontSize: 15, fontWeight: 700, color: (summary?.realizedPnlPaise || 0) >= 0 ? '#16a34a' : '#ef4444' }}>
                      {(summary?.realizedPnlPaise || 0) >= 0 ? '+' : ''}₹{((summary?.realizedPnlPaise || 0) / 100).toLocaleString('en-IN')}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: 1, borderLeft: '1px solid #e2e8f0', pl: 2 }}>
                    <Typography sx={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>LIVE UNREALIZED P&L</Typography>
                    <Typography sx={{ fontSize: 15, fontWeight: 700, color: (summary?.unrealizedPnlPaise || 0) >= 0 ? '#16a34a' : '#ef4444' }}>
                      {(summary?.unrealizedPnlPaise || 0) >= 0 ? '+' : ''}₹{((summary?.unrealizedPnlPaise || 0) / 100).toLocaleString('en-IN')}
                    </Typography>
                  </Box>
                </Box>

                {/* Best & Worst Trades */}
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Box sx={{ flex: 1, p: 1.5, bgcolor: '#f0fdf4', borderRadius: 2, border: '1px solid #bbf7d0' }}>
                    <Typography sx={{ fontSize: 11, color: '#166534', fontWeight: 700 }}>🏆 BEST TRADE</Typography>
                    <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#16a34a', mt: 0.5 }}>
                      {summary?.bestTrade ? `+₹${summary.bestTrade.pnl.toLocaleString('en-IN')}` : '—'}
                    </Typography>
                    {summary?.bestTrade?.symbol && (
                      <Typography sx={{ fontSize: 11, color: '#15803d', fontFamily: 'monospace' }}>
                        {summary.bestTrade.symbol}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ flex: 1, p: 1.5, bgcolor: '#fef2f2', borderRadius: 2, border: '1px solid #fecaca' }}>
                    <Typography sx={{ fontSize: 11, color: '#991b1b', fontWeight: 700 }}>⚠️ WORST TRADE</Typography>
                    <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#ef4444', mt: 0.5 }}>
                      {summary?.worstTrade ? `₹${summary.worstTrade.pnl.toLocaleString('en-IN')}` : '—'}
                    </Typography>
                    {summary?.worstTrade?.symbol && (
                      <Typography sx={{ fontSize: 11, color: '#b91c1c', fontFamily: 'monospace' }}>
                        {summary.worstTrade.symbol}
                      </Typography>
                    )}
                  </Box>
                </Box>

                {/* Open Positions List */}
                {data?.openPositions && data.openPositions.length > 0 && (
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#0f172a', mb: 1 }}>
                      Open Positions ({data.openPositions.length})
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {data.openPositions.map((pos, idx) => (
                        <Box key={idx} sx={{ p: 1.5, bgcolor: '#ffffff', borderRadius: 2, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Box>
                            <Typography sx={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                              {pos.symbol}
                            </Typography>
                            <Typography sx={{ fontSize: 11, color: '#64748b' }}>
                              Qty: {pos.quantity} • Avg: ₹{pos.avgPrice}
                            </Typography>
                          </Box>
                          <Typography sx={{ fontSize: 13, fontWeight: 700, color: pos.unrealizedPnl >= 0 ? '#16a34a' : '#ef4444' }}>
                            {pos.unrealizedPnl >= 0 ? '+' : ''}₹{pos.unrealizedPnl.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}
              </>
            )}

            {activeTab === 1 && (
              <Box sx={{ width: '100%' }}>
                <PnLChart studentId={student?._id} height={260} />
              </Box>
            )}

            {activeTab === 2 && (
              <Box sx={{ width: '100%' }}>
                <ActivityTimeline studentId={student?._id} />
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

// ── Assign / Change Batch Modal ────────────────────────────────────────────
const ChangeBatchModal = ({ open, onClose, student, batches, onBatchChanged }) => {
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (student && open) {
      setSelectedBatchId(student.batch?._id || '');
      setError('');
    }
  }, [student, open]);

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(`${API_URL}/institutes/students/${student._id}/batch`, {
        batchId: selectedBatchId || null,
      });
      onBatchChanged(student._id, res.data.batch, res.data.wallet?.balancePaise);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update student batch');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: 18, pb: 1 }}>
        Assign / Change Batch
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        {student && (
          <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
            <Typography sx={{ fontSize: 12, color: '#64748b' }}>Student</Typography>
            <Typography sx={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{student.name}</Typography>
            <Typography sx={{ fontSize: 12, color: '#2563eb', fontWeight: 600 }}>
              Current: {student.batch?.name ? `${student.batch.name} (${student.batch.code})` : 'Unassigned'}
            </Typography>
          </Box>
        )}
        {error && <Alert severity="error" sx={{ borderRadius: 2, fontSize: 13 }}>{error}</Alert>}

        <FormControl fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}>
          <InputLabel>Select Target Batch</InputLabel>
          <Select
            value={selectedBatchId}
            onChange={(e) => setSelectedBatchId(e.target.value)}
            label="Select Target Batch"
          >
            <MenuItem value=""><em>Unassign / Remove from batch</em></MenuItem>
            {batches.map(b => (
              <MenuItem key={b._id} value={b._id}>{b.name} ({b.code})</MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={onClose} sx={{ color: '#64748b' }}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading}
          sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' }, borderRadius: 2, px: 3, fontWeight: 600 }}
        >
          {loading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Save Batch'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Reset Password Modal ───────────────────────────────────────────────────
const ResetPasswordModal = ({ open, onClose, student, onPasswordReset }) => {
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await axios.post(`${API_URL}/institutes/students/${student._id}/reset-password`, { newPassword });
      onPasswordReset(student.name);
      setNewPassword('');
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: 18, pb: 1 }}>
        Reset Student Password
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        {student && (
          <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
            <Typography sx={{ fontSize: 12, color: '#64748b' }}>Student</Typography>
            <Typography sx={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{student.name}</Typography>
            <Typography sx={{ fontSize: 12, color: '#64748b' }}>{student.email}</Typography>
          </Box>
        )}
        {error && <Alert severity="error" sx={{ borderRadius: 2, fontSize: 13 }}>{error}</Alert>}

        <TextField
          label="New Password *"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Min 6 characters"
          fullWidth
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
        <Typography sx={{ fontSize: 12, color: '#64748b' }}>
          This will revoke all active mobile sessions for the student so they must log in with this new password.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={onClose} sx={{ color: '#64748b' }}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading}
          sx={{ bgcolor: '#f59e0b', '&:hover': { bgcolor: '#d97706' }, borderRadius: 2, px: 3, fontWeight: 600, color: 'white' }}
        >
          {loading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Set Password'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Main Page ──────────────────────────────────────────────────────────────
const StudentManagement = () => {
  const navigate = useNavigate();
  const [students, setStudents]         = useState([]);
  const [batches, setBatches]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [addOpen, setAddOpen]           = useState(false);
  const [capitalModal, setCapitalModal] = useState({ open: false, student: null });
  const [analyticsModal, setAnalyticsModal] = useState({ open: false, student: null });
  const [batchModal, setBatchModal]     = useState({ open: false, student: null });
  const [pwdModal, setPwdModal]         = useState({ open: false, student: null });
  const [toast, setToast]               = useState({ open: false, msg: '', severity: 'success' });

  // Search & Filters
  const [searchQuery, setSearchQuery]   = useState('');
  const [filterBatch, setFilterBatch]   = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');

  const showToast = (msg, severity = 'success') => setToast({ open: true, msg, severity });

  const fetchStudents = useCallback(async () => {
    try {
      setLoading(true);
      const [studRes, batchRes] = await Promise.all([
        axios.get(`${API_URL}/institutes/students`, getAuthHeaders()),
        axios.get(`${API_URL}/batches`, getAuthHeaders()),
      ]);
      setStudents(studRes.data);
      setBatches(batchRes.data);
    } catch {
      showToast('Failed to load students data', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  const handleAdded = (data) => {
    setAddOpen(false);
    const s = data.student;
    const assignedBatch = batches.find(b => b._id === data.enrollment?.batchId) || null;
    setStudents(prev => [{ ...s, balancePaise: data.wallet?.balancePaise || 0, batch: assignedBatch }, ...prev]);
    showToast(`Student "${s.name}" added successfully`);
  };

  const toggleStatus = async (student) => {
    try {
      await axios.patch(`${API_URL}/institutes/students/${student._id}/status`, { isActive: !student.isActive });
      setStudents(prev =>
        prev.map(s => s._id === student._id ? { ...s, isActive: !s.isActive } : s)
      );
      showToast(`Student ${!student.isActive ? 'activated' : 'deactivated'}`);
    } catch {
      showToast('Failed to update status', 'error');
    }
  };

  const handleCapitalUpdated = (studentId, newBalancePaise) => {
    setStudents(prev => prev.map(s => s._id === studentId ? { ...s, balancePaise: newBalancePaise } : s));
    showToast('Trading capital updated successfully');
  };

  const handleBatchChanged = (studentId, newBatch, newBalancePaise) => {
    setStudents(prev => prev.map(s => {
      if (s._id !== studentId) return s;
      return {
        ...s,
        batch: newBatch,
        balancePaise: newBalancePaise !== undefined ? newBalancePaise : s.balancePaise
      };
    }));
    showToast('Batch updated successfully');
  };

  const handlePasswordReset = (studentName) => {
    showToast(`Password for ${studentName} reset successfully`);
  };

  // Filtered List
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = s.name?.toLowerCase().includes(q);
        const matchesEmail = s.email?.toLowerCase().includes(q);
        const matchesUserId = s.userId?.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesUserId) return false;
      }
      // Batch
      if (filterBatch === 'UNASSIGNED' && s.batch) return false;
      if (filterBatch !== 'ALL' && filterBatch !== 'UNASSIGNED' && s.batch?._id !== filterBatch) return false;
      // Status
      if (filterStatus === 'ACTIVE' && !s.isActive) return false;
      if (filterStatus === 'INACTIVE' && s.isActive) return false;
      return true;
    });
  }, [students, searchQuery, filterBatch, filterStatus]);

  // Metric Stats
  const totalCapitalAllocated = useMemo(() => {
    return students.reduce((acc, s) => acc + (s.balancePaise || 0), 0);
  }, [students]);

  const activeCount = useMemo(() => students.filter(s => s.isActive).length, [students]);
  const enrolledCount = useMemo(() => students.filter(s => s.batch).length, [students]);

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a', mb: 0.5 }}>Student Management</Typography>
          <Typography sx={{ color: '#64748b', fontSize: 14 }}>
            Monitor and manage student cohorts, trading capital, credentials, and live participation
          </Typography>
        </Box>
        <Button
          id="add-student-btn"
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setAddOpen(true)}
          sx={{ bgcolor: '#0ea5e9', '&:hover': { bgcolor: '#0284c7' }, borderRadius: 2, fontWeight: 600, px: 3, py: 1.2 }}
        >
          Add Student
        </Button>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>
                  Total Students
                </Typography>
                <PeopleIcon sx={{ color: '#0ea5e9', fontSize: 20 }} />
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 800, color: '#0f172a' }}>
                {students.length}
              </Typography>
              <Typography sx={{ color: '#64748b', fontSize: 12, mt: 0.5 }}>
                All registered accounts
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>
                  Active Trading
                </Typography>
                <ActiveIcon sx={{ color: '#16a34a', fontSize: 20 }} />
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 800, color: '#16a34a' }}>
                {activeCount}
              </Typography>
              <Typography sx={{ color: '#64748b', fontSize: 12, mt: 0.5 }}>
                {students.length - activeCount} inactive / suspended
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>
                  Enrolled in Batch
                </Typography>
                <SchoolIcon sx={{ color: '#2563eb', fontSize: 20 }} />
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 800, color: '#2563eb' }}>
                {enrolledCount}
              </Typography>
              <Typography sx={{ color: '#64748b', fontSize: 12, mt: 0.5 }}>
                {students.length - enrolledCount} unassigned
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>
                  Total Allocated Capital
                </Typography>
                <WalletIcon sx={{ color: '#f59e0b', fontSize: 20 }} />
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 800, color: '#0f172a' }}>
                {fmt(totalCapitalAllocated)}
              </Typography>
              <Typography sx={{ color: '#64748b', fontSize: 12, mt: 0.5 }}>
                Across all student wallets
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filter & Search Bar */}
      <Box sx={{ p: 2, mb: 3, bgcolor: 'white', borderRadius: 3, border: '1px solid #e2e8f0', display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          placeholder="Search by student name, email, or user ID…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="small"
          sx={{ flexGrow: 1, minWidth: 260, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: '#94a3b8', fontSize: 20 }} />
              </InputAdornment>
            ),
          }}
        />

        <FormControl size="small" sx={{ minWidth: 180, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}>
          <InputLabel>Filter by Batch</InputLabel>
          <Select
            value={filterBatch}
            onChange={(e) => setFilterBatch(e.target.value)}
            label="Filter by Batch"
          >
            <MenuItem value="ALL">All Batches</MenuItem>
            <MenuItem value="UNASSIGNED">Unassigned Only</MenuItem>
            {batches.map(b => (
              <MenuItem key={b._id} value={b._id}>{b.name} ({b.code})</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 140, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            label="Status"
          >
            <MenuItem value="ALL">All Status</MenuItem>
            <MenuItem value="ACTIVE">Active Only</MenuItem>
            <MenuItem value="INACTIVE">Inactive Only</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Table */}
      <Box sx={{ borderRadius: 3, border: '1px solid #e2e8f0', overflow: 'hidden', bgcolor: 'white' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>STUDENT</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>USER ID</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>EMAIL</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>BATCH</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>WALLET BALANCE</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>STATUS</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12, textAlign: 'right' }}>ACTIONS</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} sx={{ textAlign: 'center', py: 6 }}>
                    <CircularProgress sx={{ color: '#0ea5e9' }} />
                  </TableCell>
                </TableRow>
              ) : filteredStudents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} sx={{ textAlign: 'center', py: 6, color: '#94a3b8' }}>
                    {searchQuery || filterBatch !== 'ALL' || filterStatus !== 'ALL'
                      ? 'No students matching filters.'
                      : 'No students yet. Add your first student above.'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredStudents.map((student) => (
                  <TableRow key={student._id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar sx={{ width: 34, height: 34, bgcolor: '#0ea5e9', fontSize: 13, fontWeight: 700 }}>
                          {student.name?.charAt(0)}
                        </Avatar>
                        <Box>
                          <Typography sx={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>
                            {student.name}
                          </Typography>
                          <Typography sx={{ color: '#94a3b8', fontSize: 11 }}>
                            Joined {new Date(student.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip label={student.userId} size="small" sx={{ fontFamily: 'monospace', bgcolor: '#f1f5f9', color: '#475569', fontWeight: 600 }} />
                    </TableCell>
                    <TableCell sx={{ color: '#475569', fontSize: 13 }}>{student.email}</TableCell>
                    <TableCell>
                      {student.batch ? (
                        <Tooltip title="Click to change batch">
                          <Chip
                            icon={<SchoolIcon sx={{ fontSize: '14px !important' }} />}
                            label={student.batch.name || student.batch.code}
                            size="small"
                            onClick={() => setBatchModal({ open: true, student })}
                            clickable
                            sx={{ bgcolor: '#eff6ff', color: '#2563eb', fontWeight: 600, fontSize: 11 }}
                          />
                        </Tooltip>
                      ) : (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => setBatchModal({ open: true, student })}
                          sx={{ fontSize: 11, textTransform: 'none', py: 0.2, px: 1, borderRadius: 1.5, borderColor: '#cbd5e1', color: '#64748b' }}
                        >
                          + Assign Batch
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontWeight: 700, color: student.balancePaise > 0 ? '#16a34a' : '#94a3b8', fontSize: 13 }}>
                        {fmt(student.balancePaise)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={student.isActive ? 'Active' : 'Suspended'}
                        size="small"
                        sx={{
                          bgcolor: student.isActive ? '#dcfce7' : '#fee2e2',
                          color: student.isActive ? '#16a34a' : '#ef4444',
                          fontWeight: 600, fontSize: 11,
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ textAlign: 'right' }}>
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                        {student.batch?._id && (
                          <Tooltip title="Monitor in Live Grid">
                            <IconButton
                              size="small"
                              onClick={() => navigate(`/grid/${student.batch._id}`)}
                              sx={{ color: '#2563eb', '&:hover': { bgcolor: '#eff6ff' } }}
                            >
                              <GridIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="View Performance & Analytics">
                          <IconButton
                            size="small"
                            onClick={() => setAnalyticsModal({ open: true, student })}
                            sx={{ color: '#059669', '&:hover': { bgcolor: '#ecfdf5' } }}
                          >
                            <AnalyticsIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Assign / Adjust Capital">
                          <IconButton
                            size="small"
                            onClick={() => setCapitalModal({ open: true, student })}
                            sx={{ color: '#0ea5e9', '&:hover': { bgcolor: '#e0f2fe' } }}
                          >
                            <WalletIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Assign / Change Batch">
                          <IconButton
                            size="small"
                            onClick={() => setBatchModal({ open: true, student })}
                            sx={{ color: '#6366f1', '&:hover': { bgcolor: '#e0e7ff' } }}
                          >
                            <SchoolIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Reset Password">
                          <IconButton
                            size="small"
                            onClick={() => setPwdModal({ open: true, student })}
                            sx={{ color: '#f59e0b', '&:hover': { bgcolor: '#fef3c7' } }}
                          >
                            <KeyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={student.isActive ? 'Deactivate Student' : 'Activate Student'}>
                          <IconButton size="small" onClick={() => toggleStatus(student)}
                            sx={{ color: student.isActive ? '#10b981' : '#94a3b8' }}>
                            {student.isActive ? <ToggleOn fontSize="medium" /> : <ToggleOff fontSize="medium" />}
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* Modals */}
      <AddStudentModal open={addOpen} onClose={() => setAddOpen(false)} onAdded={handleAdded} batches={batches} />
      <AssignCapitalModal
        open={capitalModal.open}
        onClose={() => setCapitalModal({ open: false, student: null })}
        student={capitalModal.student}
        onUpdated={handleCapitalUpdated}
      />
      <StudentAnalyticsDrawer
        open={analyticsModal.open}
        onClose={() => setAnalyticsModal({ open: false, student: null })}
        student={analyticsModal.student}
        onOpenAssignCapital={(student) => setCapitalModal({ open: true, student })}
      />
      <ChangeBatchModal
        open={batchModal.open}
        onClose={() => setBatchModal({ open: false, student: null })}
        student={batchModal.student}
        batches={batches}
        onBatchChanged={handleBatchChanged}
      />
      <ResetPasswordModal
        open={pwdModal.open}
        onClose={() => setPwdModal({ open: false, student: null })}
        student={pwdModal.student}
        onPasswordReset={handlePasswordReset}
      />

      <Snackbar open={toast.open} autoHideDuration={4000} onClose={() => setToast(t => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={toast.severity} sx={{ borderRadius: 2, fontWeight: 500 }}>{toast.msg}</Alert>
      </Snackbar>
    </Box>
  );
};

export default StudentManagement;
