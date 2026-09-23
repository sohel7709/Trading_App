import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  Box, Typography, Button, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  Select, FormControl, InputLabel, CircularProgress, Alert, Snackbar,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  RestartAlt as ResetIcon,
  ToggleOn,
  ToggleOff,
  Edit as EditIcon,
  TableChart as GridIcon,
  Group as GroupIcon,
  Delete as DeleteIcon,
  PersonAdd as PersonAddIcon,
  Tune as TuneIcon,
  PauseCircle as HaltIcon,
  PlayCircle as ResumeIcon,
  Warning as WarningIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext, API_URL } from '../../context/AuthContext';

const fmtCapital = (paise) => `₹${((paise || 10000000) / 100).toLocaleString('en-IN')}`;


// ── Create Batch Modal ─────────────────────────────────────────────────────
const CreateBatchModal = ({ open, onClose, onCreated }) => {
  const [form, setForm] = useState({
    name: '',
    code: '',
    startingCapitalPaise: 10000000, // ₹1,00,000 in paise
    marketMode: 'LIVE',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleChange = (f) => (e) => setForm(p => ({ ...p, [f]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.name) {
      setError('Batch name is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload = {
        ...form,
        startingCapitalPaise: Number(form.startingCapitalPaise),
      };
      const res = await axios.post(`${API_URL}/batches`, payload);
      onCreated(res.data.batch);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create batch');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: 18 }}>Create New Batch</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2 }}>
        {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
        <TextField
          label="Batch Name *"
          value={form.name}
          onChange={handleChange('name')}
          fullWidth
          placeholder="e.g., September Options Mastery"
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
        <TextField
          label="Batch Code (optional)"
          value={form.code}
          onChange={handleChange('code')}
          fullWidth
          placeholder="e.g., SOM2024"
          helperText="Leave empty to auto-generate from name"
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
        <FormControl fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}>
          <InputLabel>Starting Capital Per Student</InputLabel>
          <Select
            value={form.startingCapitalPaise}
            onChange={handleChange('startingCapitalPaise')}
            label="Starting Capital Per Student"
          >
            <MenuItem value={2500000}>₹25,000</MenuItem>
            <MenuItem value={5000000}>₹50,000</MenuItem>
            <MenuItem value={10000000}>₹1,00,000 (Standard)</MenuItem>
            <MenuItem value={20000000}>₹2,00,000</MenuItem>
            <MenuItem value={50000000}>₹5,00,000</MenuItem>
            <MenuItem value={100000000}>₹10,00,000</MenuItem>
          </Select>
        </FormControl>
        <FormControl fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}>
          <InputLabel>Market Mode</InputLabel>
          <Select
            value={form.marketMode}
            onChange={handleChange('marketMode')}
            label="Market Mode"
          >
            <MenuItem value="LIVE">LIVE (Real-time live prices)</MenuItem>
            <MenuItem value="DELAYED">DELAYED (15-min delayed feed)</MenuItem>
            <MenuItem value="REPLAY">REPLAY (Historical bar simulation)</MenuItem>
          </Select>
        </FormControl>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            label="Start Date"
            type="date"
            value={form.startDate}
            onChange={handleChange('startDate')}
            fullWidth
            InputLabelProps={{ shrink: true }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <TextField
            label="End Date"
            type="date"
            value={form.endDate}
            onChange={handleChange('endDate')}
            fullWidth
            InputLabelProps={{ shrink: true }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={onClose} sx={{ color: '#64748b' }}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading}
          sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' }, borderRadius: 2, px: 3, fontWeight: 600 }}
        >
          {loading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Create Batch'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Edit Batch Modal ───────────────────────────────────────────────────────
const EditBatchModal = ({ open, onClose, batch, onUpdated }) => {
  const [form, setForm] = useState({
    name: '',
    startingCapitalPaise: 10000000,
    marketMode: 'LIVE',
    startDate: '',
    endDate: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (batch) {
      setForm({
        name: batch.name || '',
        startingCapitalPaise: batch.startingCapitalPaise || 10000000,
        marketMode: batch.marketMode || 'LIVE',
        startDate: batch.startDate ? new Date(batch.startDate).toISOString().slice(0, 10) : '',
        endDate: batch.endDate ? new Date(batch.endDate).toISOString().slice(0, 10) : '',
      });
    }
  }, [batch]);

  const handleChange = (f) => (e) => setForm(p => ({ ...p, [f]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.name) {
      setError('Batch name is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await axios.put(`${API_URL}/batches/${batch._id}`, {
        ...form,
        startingCapitalPaise: Number(form.startingCapitalPaise),
      });
      onUpdated(res.data.batch);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update batch');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: 18 }}>Edit Batch Details</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2 }}>
        {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
        <TextField
          label="Batch Name *"
          value={form.name}
          onChange={handleChange('name')}
          fullWidth
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
        <FormControl fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}>
          <InputLabel>Starting Capital Per Student</InputLabel>
          <Select
            value={form.startingCapitalPaise}
            onChange={handleChange('startingCapitalPaise')}
            label="Starting Capital Per Student"
          >
            <MenuItem value={2500000}>₹25,000</MenuItem>
            <MenuItem value={5000000}>₹50,000</MenuItem>
            <MenuItem value={10000000}>₹1,00,000 (Standard)</MenuItem>
            <MenuItem value={20000000}>₹2,00,000</MenuItem>
            <MenuItem value={50000000}>₹5,00,000</MenuItem>
            <MenuItem value={100000000}>₹10,00,000</MenuItem>
          </Select>
        </FormControl>
        <FormControl fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}>
          <InputLabel>Market Mode</InputLabel>
          <Select
            value={form.marketMode}
            onChange={handleChange('marketMode')}
            label="Market Mode"
          >
            <MenuItem value="LIVE">LIVE (Real-time live prices)</MenuItem>
            <MenuItem value="DELAYED">DELAYED (15-min delayed feed)</MenuItem>
            <MenuItem value="REPLAY">REPLAY (Historical bar simulation)</MenuItem>
          </Select>
        </FormControl>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            label="Start Date"
            type="date"
            value={form.startDate}
            onChange={handleChange('startDate')}
            fullWidth
            InputLabelProps={{ shrink: true }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <TextField
            label="End Date"
            type="date"
            value={form.endDate}
            onChange={handleChange('endDate')}
            fullWidth
            InputLabelProps={{ shrink: true }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={onClose} sx={{ color: '#64748b' }}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading}
          sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' }, borderRadius: 2, px: 3, fontWeight: 600 }}
        >
          {loading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Reset Capital Confirmation Dialog ──────────────────────────────────────
const ResetConfirmModal = ({ open, onClose, batch, onConfirmed }) => {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await axios.post(`${API_URL}/batches/${batch._id}/reset`, {});
      onConfirmed(batch);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: 18 }}>Reset Batch Capital</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Typography sx={{ color: '#475569', fontSize: 14, mb: 1 }}>
          Are you sure you want to reset capital for all students in batch <strong>{batch?.name}</strong>?
        </Typography>
        <Alert severity="warning" sx={{ borderRadius: 2, fontSize: 12 }}>
          This will reset student wallets back to {fmtCapital(batch?.startingCapitalPaise)} and clear all open positions and trade orders for this batch.
        </Alert>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={onClose} sx={{ color: '#64748b' }}>Cancel</Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleConfirm}
          disabled={loading}
          sx={{ borderRadius: 2, px: 3, fontWeight: 600 }}
        >
          {loading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Reset All'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Manage Batch Students Modal ───────────────────────────────────────────
const BatchStudentsModal = ({ open, onClose, batch, onStudentCountChanged }) => {
  const [enrolled, setEnrolled] = useState([]);
  const [availableStudents, setAvailableStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    if (!batch?._id) return;
    setLoading(true);
    setError('');
    try {
      const [enrRes, instStudentsRes] = await Promise.all([
        axios.get(`${API_URL}/batches/${batch._id}/students`),
        axios.get(`${API_URL}/institute/students`).catch(() => ({ data: [] })),
      ]);
      setEnrolled(enrRes.data || []);
      
      const enrolledUserIds = new Set((enrRes.data || []).map(e => (e.userId?._id || e.userId).toString()));
      const available = (instStudentsRes.data || []).filter(s => !enrolledUserIds.has(s._id.toString()));
      setAvailableStudents(available);
      if (available.length > 0) {
        setSelectedStudentId(available[0]._id);
      } else {
        setSelectedStudentId('');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load batch students');
    } finally {
      setLoading(false);
    }
  }, [batch]);

  useEffect(() => {
    if (open) loadData();
  }, [open, loadData]);

  const handleEnroll = async () => {
    if (!selectedStudentId) return;
    setEnrolling(true);
    setError('');
    try {
      await axios.post(`${API_URL}/batches/${batch._id}/enroll`, { studentId: selectedStudentId });
      const nextCount = enrolled.length + 1;
      await loadData();
      if (onStudentCountChanged) onStudentCountChanged(batch._id, nextCount);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to enroll student');
    } finally {
      setEnrolling(false);
    }
  };

  const handleRemove = async (studentId) => {
    try {
      await axios.delete(`${API_URL}/batches/${batch._id}/students/${studentId}`);
      const nextCount = Math.max(0, enrolled.length - 1);
      await loadData();
      if (onStudentCountChanged) onStudentCountChanged(batch._id, nextCount);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to remove student');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Manage Students — {batch?.name}</span>
        <Chip label={`${enrolled.length} Enrolled`} size="small" sx={{ bgcolor: '#eff6ff', color: '#1d4ed8', fontWeight: 700 }} />
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
        {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
        
        {/* Enroll student section */}
        <Paper elevation={0} sx={{ p: 2, bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: '#1e293b' }}>
            Enroll Student into Batch
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
            <FormControl fullWidth size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'white' } }}>
              <InputLabel>Select Student to Enroll</InputLabel>
              <Select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                label="Select Student to Enroll"
                disabled={availableStudents.length === 0}
              >
                {availableStudents.length === 0 ? (
                  <MenuItem value="" disabled>No unenrolled students available</MenuItem>
                ) : (
                  availableStudents.map(s => (
                    <MenuItem key={s._id} value={s._id}>
                      {s.name} ({s.email})
                    </MenuItem>
                  ))
                )}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              startIcon={<PersonAddIcon />}
              onClick={handleEnroll}
              disabled={enrolling || !selectedStudentId}
              sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' }, borderRadius: 2, px: 2.5, py: 1, whiteSpace: 'nowrap', textTransform: 'none', fontWeight: 600 }}
            >
              {enrolling ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Enroll'}
            </Button>
          </Box>
        </Paper>

        {/* Enrolled students table */}
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 2 }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: '#f8fafc' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>STUDENT NAME</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>EMAIL</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>WALLET BALANCE</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>ENROLLED ON</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }} align="right">ACTION</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} sx={{ textAlign: 'center', py: 4 }}>
                    <CircularProgress size={28} sx={{ color: '#2563eb' }} />
                  </TableCell>
                </TableRow>
              ) : enrolled.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} sx={{ textAlign: 'center', py: 4, color: '#94a3b8' }}>
                    No students currently enrolled in this batch. Select a student above to enroll.
                  </TableCell>
                </TableRow>
              ) : (
                enrolled.map(item => {
                  const student = item.userId;
                  const balPaise = item.wallet?.balancePaise || (item.wallet?.balance ? item.wallet.balance * 100 : 0);
                  return (
                    <TableRow key={item._id} hover>
                      <TableCell sx={{ fontWeight: 600, color: '#0f172a' }}>{student?.name || '—'}</TableCell>
                      <TableCell sx={{ color: '#64748b', fontSize: 13 }}>{student?.email || '—'}</TableCell>
                      <TableCell sx={{ fontWeight: 600, color: '#16a34a', fontSize: 13 }}>{fmtCapital(balPaise)}</TableCell>
                      <TableCell sx={{ color: '#64748b', fontSize: 12 }}>
                        {item.createdAt || item.enrolledAt ? new Date(item.createdAt || item.enrolledAt).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Remove student from this batch">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleRemove(student?._id || student)}
                          >
                            <DeleteIcon fontSize="small" />
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
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} sx={{ color: '#64748b' }}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Batch Market Control & Circuit Breaker Modal ───────────────────────────
const BatchMarketControlModal = ({ open, batch, onClose, onUpdated }) => {
  const [loading, setLoading] = useState(false);
  const [marketState, setMarketState] = useState(null);
  const [haltReason, setHaltReason] = useState('Trading paused by instructor');
  const [autoSquareOffMIS, setAutoSquareOffMIS] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fetchState = useCallback(async () => {
    if (!batch?._id) return;
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/batches/${batch._id}/market-state`);
      setMarketState(res.data);
      if (res.data?.haltReason) setHaltReason(res.data.haltReason);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load batch market state');
    } finally {
      setLoading(false);
    }
  }, [batch?._id]);

  useEffect(() => {
    if (open && batch?._id) {
      setError('');
      setSuccessMsg('');
      fetchState();
    }
  }, [open, batch?._id, fetchState]);

  const handleModeChange = async (mode) => {
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await axios.post(`${API_URL}/batches/${batch._id}/market-mode`, { mode });
      setSuccessMsg(`Market mode switched to ${mode}`);
      const updated = { ...batch, marketMode: mode };
      setMarketState(prev => ({ ...prev, mode }));
      onUpdated?.(updated);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to change market mode');
    } finally {
      setLoading(false);
    }
  };

  const handleHalt = async () => {
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await axios.post(`${API_URL}/batches/${batch._id}/market-halt`, { reason: haltReason });
      setSuccessMsg(`Trading halted for batch ${batch.code}`);
      const updated = { ...batch, isHalted: true, haltReason };
      setMarketState(prev => ({ ...prev, isHalted: true, haltReason }));
      onUpdated?.(updated);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to halt trading');
    } finally {
      setLoading(false);
    }
  };

  const handleResume = async () => {
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await axios.post(`${API_URL}/batches/${batch._id}/market-resume`);
      setSuccessMsg(`Trading resumed for batch ${batch.code}`);
      const updated = { ...batch, isHalted: false, haltReason: null };
      setMarketState(prev => ({ ...prev, isHalted: false, haltReason: null }));
      onUpdated?.(updated);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resume trading');
    } finally {
      setLoading(false);
    }
  };

  const handleEmergencyHalt = async () => {
    if (!window.confirm(`Are you sure you want to trigger EMERGENCY HALT for batch ${batch.code}? This will immediately cancel all pending orders${autoSquareOffMIS ? ' and square off active MIS positions' : ''}.`)) {
      return;
    }
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await axios.post(`${API_URL}/batches/${batch._id}/emergency-halt`, {
        reason: haltReason || 'Emergency circuit breaker triggered by instructor',
        autoSquareOffMIS,
      });
      setSuccessMsg(`Emergency halt executed! Cancelled orders: ${res.data.cancelledOrdersCount || 0}, Squared off: ${res.data.squaredOffCount || 0}`);
      const updated = { ...batch, isHalted: true, haltReason };
      setMarketState(prev => ({ ...prev, isHalted: true, haltReason }));
      onUpdated?.(updated);
    } catch (err) {
      setError(err.response?.data?.message || 'Emergency halt failed');
    } finally {
      setLoading(false);
    }
  };

  const isHalted = Boolean(marketState?.isHalted);
  const currentMode = marketState?.mode || batch?.marketMode || 'LIVE';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: 18, color: '#0f172a' }}>
            Batch Market Control
          </Typography>
          <Typography sx={{ fontSize: 13, color: '#64748b' }}>
            {batch?.name} • Code: <Chip label={batch?.code} size="small" sx={{ fontWeight: 700, height: 20 }} />
          </Typography>
        </Box>
        <Chip
          label={isHalted ? 'HALTED' : 'ACTIVE'}
          color={isHalted ? 'error' : 'success'}
          sx={{ fontWeight: 800, fontSize: 12 }}
        />
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2 }}>
        {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
        {successMsg && <Alert severity="success" sx={{ borderRadius: 2 }}>{successMsg}</Alert>}

        {/* Global Halt Notice if active */}
        {marketState?.globalHalted && (
          <Alert severity="warning" sx={{ borderRadius: 2 }}>
            <strong>Global Exchange Halt Active:</strong> Platform-wide circuit breaker is currently active. All trading is paused globally by the Super Administrator.
          </Alert>
        )}

        {/* Circuit Breaker Status Banner */}
        <Paper
          elevation={0}
          sx={{
            p: 2.5,
            borderRadius: 2.5,
            border: '1.5px solid',
            borderColor: isHalted ? '#fca5a5' : '#86efac',
            bgcolor: isHalted ? '#fef2f2' : '#f0fdf4',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
            {isHalted ? <WarningIcon sx={{ color: '#dc2626' }} /> : <ResumeIcon sx={{ color: '#16a34a' }} />}
            <Typography sx={{ fontWeight: 800, fontSize: 15, color: isHalted ? '#991b1b' : '#166534' }}>
              {isHalted ? 'Trading is Temporarily Halted for this Batch' : 'Batch Trading is Live and Active'}
            </Typography>
          </Box>
          {isHalted ? (
            <Box sx={{ mt: 1 }}>
              <Typography sx={{ fontSize: 13, color: '#b91c1c' }}>
                Reason: <strong>{marketState?.haltReason || 'Halted by Instructor'}</strong>
              </Typography>
              {marketState?.haltedAt && (
                <Typography sx={{ fontSize: 11, color: '#991b1b', mt: 0.5 }}>
                  Triggered at: {new Date(marketState.haltedAt).toLocaleString()}
                </Typography>
              )}
              <Button
                variant="contained"
                color="success"
                startIcon={<ResumeIcon />}
                onClick={handleResume}
                disabled={loading}
                sx={{ mt: 2, fontWeight: 700, borderRadius: 2, textTransform: 'none' }}
                fullWidth
              >
                {loading ? <CircularProgress size={20} color="inherit" /> : 'Resume Batch Trading'}
              </Button>
            </Box>
          ) : (
            <Box sx={{ mt: 1 }}>
              <TextField
                label="Halt Reason (Optional)"
                value={haltReason}
                onChange={(e) => setHaltReason(e.target.value)}
                size="small"
                fullWidth
                placeholder="e.g. Lecture discussion in progress, orders paused"
                sx={{ mb: 1.5, bgcolor: '#fff', '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
              <Button
                variant="contained"
                color="error"
                startIcon={<HaltIcon />}
                onClick={handleHalt}
                disabled={loading}
                sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none' }}
                fullWidth
              >
                {loading ? <CircularProgress size={20} color="inherit" /> : 'Halt Batch Trading'}
              </Button>
            </Box>
          )}
        </Paper>

        {/* Market Mode Switcher */}
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: 14, color: '#0f172a', mb: 1 }}>
            Market Feed Mode for this Cohort
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5 }}>
            {[
              { id: 'LIVE', label: 'LIVE', desc: 'Real broker feed', color: '#16a34a' },
              { id: 'REPLAY', label: 'REPLAY', desc: 'Historical bar replay', color: '#d97706' },
              { id: 'SYNTHETIC', label: 'SYNTHETIC', desc: '24/7 price walk generator', color: '#7c3aed' },
            ].map(m => {
              const active = currentMode === m.id;
              return (
                <Paper
                  key={m.id}
                  onClick={() => !loading && handleModeChange(m.id)}
                  elevation={0}
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    border: '2px solid',
                    borderColor: active ? m.color : '#e2e8f0',
                    bgcolor: active ? `${m.color}0D` : '#f8fafc',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.15s ease',
                    '&:hover': { borderColor: m.color, bgcolor: `${m.color}08` },
                  }}
                >
                  <Typography sx={{ fontWeight: 800, fontSize: 13, color: active ? m.color : '#334155' }}>
                    {m.label}
                  </Typography>
                  <Typography sx={{ fontSize: 10, color: '#64748b', mt: 0.5 }}>
                    {m.desc}
                  </Typography>
                  {active && (
                    <Chip label="ACTIVE" size="small" sx={{ mt: 1, height: 18, fontSize: 9, fontWeight: 800, bgcolor: m.color, color: '#fff' }} />
                  )}
                </Paper>
              );
            })}
          </Box>
        </Box>

        {/* Emergency Halt Action */}
        <Paper elevation={0} sx={{ p: 2, bgcolor: '#fef2f2', borderRadius: 2.5, border: '1px dashed #ef4444' }}>
          <Typography sx={{ fontWeight: 700, fontSize: 13, color: '#991b1b', mb: 0.5 }}>
            🚨 Emergency Liquidation & Stop
          </Typography>
          <Typography sx={{ fontSize: 11, color: '#7f1d1d', mb: 1.5 }}>
            Cancels all open PENDING orders for students in this batch. Optionally auto square-off active MIS intraday positions.
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
            <input
              type="checkbox"
              id="batchAutoMIS"
              checked={autoSquareOffMIS}
              onChange={(e) => setAutoSquareOffMIS(e.target.checked)}
              style={{ marginRight: 8, transform: 'scale(1.2)' }}
            />
            <label htmlFor="batchAutoMIS" style={{ fontSize: 12, fontWeight: 600, color: '#991b1b', cursor: 'pointer' }}>
              Auto square-off all open MIS positions at current market price
            </label>
          </Box>
          <Button
            variant="outlined"
            color="error"
            onClick={handleEmergencyHalt}
            disabled={loading}
            fullWidth
            sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none' }}
          >
            Execute Emergency Batch Halt
          </Button>
        </Paper>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} sx={{ color: '#64748b' }}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Main Page ──────────────────────────────────────────────────────────────
const BatchManagement = () => {
  const navigate = useNavigate();


  const [batches, setBatches]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editModal, setEditModal]   = useState({ open: false, batch: null });
  const [studentsModal, setStudentsModal] = useState({ open: false, batch: null });
  const [resetModal, setResetModal] = useState({ open: false, batch: null });
  const [marketControlModal, setMarketControlModal] = useState({ open: false, batch: null });
  const [toast, setToast]           = useState({ open: false, msg: '', severity: 'success' });

  const showToast = (msg, severity = 'success') => setToast({ open: true, msg, severity });

  const handleStudentCountChanged = (batchId, newCount) => {
    setBatches(prev => prev.map(b => b._id === batchId ? { ...b, studentCount: newCount } : b));
  };


  const fetchBatches = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/batches`);
      setBatches(res.data);
    } catch {
      showToast('Failed to load batches', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  const handleCreated = (newBatch) => {
    setBatches(prev => [newBatch, ...prev]);
    showToast(`Batch "${newBatch.name}" created successfully`);
  };

  const handleUpdated = (updatedBatch) => {
    setBatches(prev => prev.map(b => b._id === updatedBatch._id ? updatedBatch : b));
    showToast(`Batch "${updatedBatch.name}" updated successfully`);
  };

  const handleResetConfirmed = (b) => {
    showToast(`Capital reset for all students in "${b.name}"`);
  };

  const toggleStatus = async (batch) => {
    const nextStatus = batch.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE';
    try {
      await axios.patch(`${API_URL}/batches/${batch._id}/status`, { status: nextStatus });
      setBatches(prev =>
        prev.map(b => b._id === batch._id ? { ...b, status: nextStatus } : b)
      );
      showToast(`Batch status changed to ${nextStatus}`);
    } catch {
      showToast('Failed to update status', 'error');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a', mb: 0.5 }}>
            Batch Management
          </Typography>
          <Typography sx={{ color: '#64748b', fontSize: 14 }}>
            Create and oversee trading cohorts, allocate capital, and monitor student performance.
          </Typography>
        </Box>
        <Button
          id="create-batch-btn"
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateOpen(true)}
          sx={{
            bgcolor: '#2563eb',
            '&:hover': { bgcolor: '#1d4ed8' },
            boxShadow: 'none',
            borderRadius: 2,
            px: 2.5,
            py: 1,
            fontWeight: 600,
            textTransform: 'none',
          }}
        >
          Create Batch
        </Button>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
        <Table sx={{ minWidth: 650 }} aria-label="batch table">
          <TableHead sx={{ bgcolor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>BATCH NAME</TableCell>
              <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>CODE</TableCell>
              <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>STUDENTS</TableCell>
              <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>CAPITAL</TableCell>
              <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>MODE</TableCell>
              <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>STATUS</TableCell>
              <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>TIMELINE</TableCell>
              <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }} align="right">ACTIONS</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} sx={{ textAlign: 'center', py: 6 }}>
                  <CircularProgress sx={{ color: '#2563eb' }} />
                </TableCell>
              </TableRow>
            ) : batches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} sx={{ textAlign: 'center', py: 6, color: '#94a3b8' }}>
                  No batches found. Create your first cohort above.
                </TableCell>
              </TableRow>
            ) : (
              batches.map((batch) => (
                <TableRow key={batch._id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                  <TableCell component="th" scope="row">
                    <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{batch.name}</Typography>
                    {batch.instructors?.length > 0 && (
                      <Typography sx={{ color: '#64748b', fontSize: 12 }}>
                        Instructors: {batch.instructors.map(i => i.name).join(', ')}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip label={batch.code} size="small" sx={{ fontFamily: 'monospace', bgcolor: '#eff6ff', color: '#1d4ed8', fontWeight: 600 }} />
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Click to view & enroll students">
                      <Chip
                        label={`${batch.studentCount || 0} Students`}
                        size="small"
                        onClick={() => setStudentsModal({ open: true, batch })}
                        sx={{
                          cursor: 'pointer',
                          bgcolor: (batch.studentCount || 0) > 0 ? '#eff6ff' : '#f1f5f9',
                          color: (batch.studentCount || 0) > 0 ? '#1d4ed8' : '#64748b',
                          fontWeight: 600,
                          fontSize: 11,
                          '&:hover': { bgcolor: '#dbeafe' },
                        }}
                      />
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600, color: '#16a34a', fontSize: 13 }}>
                      {fmtCapital(batch.startingCapitalPaise)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                      <Chip
                        label={batch.marketMode || 'LIVE'}
                        size="small"
                        sx={{
                          bgcolor: batch.marketMode === 'LIVE' ? '#dcfce7' : batch.marketMode === 'SYNTHETIC' ? '#f3e8ff' : '#fef9c3',
                          color: batch.marketMode === 'LIVE' ? '#166534' : batch.marketMode === 'SYNTHETIC' ? '#7e22ce' : '#854d0e',
                          fontWeight: 600, fontSize: 11,
                        }}
                      />
                      {batch.isHalted && (
                        <Tooltip title={`Trading Halted: ${batch.haltReason || 'Circuit breaker active'}`}>
                          <Chip
                            label="HALTED"
                            size="small"
                            sx={{ bgcolor: '#fee2e2', color: '#991b1b', fontWeight: 800, fontSize: 10, height: 20 }}
                          />
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={batch.status} 
                      size="small" 
                      sx={{ 
                        bgcolor: batch.status === 'ACTIVE' ? '#dcfce7' : '#f1f5f9', 
                        color: batch.status === 'ACTIVE' ? '#166534' : '#475569',
                        fontWeight: 600, fontSize: 11,
                      }} 
                    />
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: 12, color: '#334155' }}>
                      {batch.startDate ? new Date(batch.startDate).toLocaleDateString() : '—'}
                    </Typography>
                    {batch.endDate && (
                      <Typography sx={{ color: '#94a3b8', fontSize: 11 }}>
                        to {new Date(batch.endDate).toLocaleDateString()}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                      <Tooltip title="Cohort Market Control & Circuit Breaker">
                        <IconButton
                          size="small"
                          onClick={() => setMarketControlModal({ open: true, batch })}
                          sx={{
                            color: batch.isHalted ? '#dc2626' : '#7c3aed',
                            bgcolor: batch.isHalted ? '#fee2e2' : 'transparent',
                            '&:hover': { bgcolor: batch.isHalted ? '#fecaca' : '#ede9fe' },
                          }}
                        >
                          <TuneIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Manage Batch Students">
                        <IconButton
                          size="small"
                          onClick={() => setStudentsModal({ open: true, batch })}
                          sx={{ color: '#059669', '&:hover': { bgcolor: '#ecfdf5' } }}
                        >
                          <GroupIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Monitor Live Grid for this Batch">
                        <IconButton
                          size="small"
                          onClick={() => navigate(`/grid/${batch._id}`)}
                          sx={{ color: '#0284c7', '&:hover': { bgcolor: '#e0f2fe' } }}
                        >
                          <GridIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit Batch Details">
                        <IconButton
                          size="small"
                          onClick={() => setEditModal({ open: true, batch })}
                          sx={{ color: '#6366f1', '&:hover': { bgcolor: '#ede9fe' } }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Reset Student Capital & Positions">
                        <IconButton
                          size="small"
                          color="warning"
                          onClick={() => setResetModal({ open: true, batch })}
                        >
                          <ResetIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={batch.status === 'ACTIVE' ? 'Archive Batch' : 'Activate Batch'}>
                        <IconButton
                          size="small"
                          onClick={() => toggleStatus(batch)}
                          sx={{ color: batch.status === 'ACTIVE' ? '#16a34a' : '#94a3b8' }}
                        >
                          {batch.status === 'ACTIVE' ? <ToggleOn /> : <ToggleOff />}
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

      <CreateBatchModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={handleCreated} />
      <EditBatchModal
        open={editModal.open}
        onClose={() => setEditModal({ open: false, batch: null })}
        batch={editModal.batch}
        onUpdated={handleUpdated}
      />
      <BatchStudentsModal
        open={studentsModal.open}
        onClose={() => setStudentsModal({ open: false, batch: null })}
        batch={studentsModal.batch}
        onStudentCountChanged={handleStudentCountChanged}
      />
      <ResetConfirmModal
        open={resetModal.open}
        onClose={() => setResetModal({ open: false, batch: null })}
        batch={resetModal.batch}
        onConfirmed={handleResetConfirmed}
      />
      <BatchMarketControlModal
        open={marketControlModal.open}
        batch={marketControlModal.batch}
        onClose={() => setMarketControlModal({ open: false, batch: null })}
        onUpdated={(updatedBatch) => {
          handleUpdated(updatedBatch);
        }}
      />
      <Snackbar open={toast.open} autoHideDuration={4000} onClose={() => setToast(t => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={toast.severity} sx={{ borderRadius: 2, fontWeight: 500 }}>{toast.msg}</Alert>
      </Snackbar>
    </Box>
  );
};

export default BatchManagement;
