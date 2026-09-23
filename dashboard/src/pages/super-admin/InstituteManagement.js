import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableHead,
  TableRow, TableContainer, Chip, IconButton, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Alert, Snackbar, Tooltip, FormControlLabel, Switch, InputAdornment,
  LinearProgress, Select, MenuItem, FormControl, InputLabel, Grid
} from '@mui/material';
import {
  Add as AddIcon,
  PauseCircle as SuspendIcon,
  CheckCircle as ActivateIcon,
  Business as InstIcon,
  AutoFixHigh,
  Refresh,
  LockReset as LockResetIcon,
  Visibility,
  VisibilityOff,
  Tune as PlanIcon,
  ToggleOn as FeatureIcon,
  SupportAgent as ImpersonateIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API_URL, useAuth } from '../../context/AuthContext';

const DEFAULT_PLAN_QUOTAS = {
  STARTER: { maxStudents: 50, maxBatches: 3 },
  GROWTH: { maxStudents: 250, maxBatches: 10 },
  ENTERPRISE: { maxStudents: 1000, maxBatches: 50 },
};

const getPlanBadgeStyle = (plan) => {
  switch (plan) {
    case 'GROWTH':
      return { bgcolor: '#ede9fe', color: '#6d28d9', border: '1px solid #ddd6fe' };
    case 'ENTERPRISE':
      return { bgcolor: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' };
    default:
      return { bgcolor: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' };
  }
};

// ── Create Institute Modal ─────────────────────────────────────────────────
const CreateInstituteModal = ({ open, onClose, onCreated }) => {
  const [form, setForm] = useState({
    name: '',
    code: '',
    autoGenerateCode: true,
    adminEmail: '',
    adminName: '',
    password: '',
    plan: 'STARTER',
    maxStudents: 50,
    maxBatches: 3,
  });
  const [loading, setLoading] = useState(false);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [error, setError] = useState('');

  const handlePlanChange = (e) => {
    const p = e.target.value;
    const def = DEFAULT_PLAN_QUOTAS[p] || DEFAULT_PLAN_QUOTAS.STARTER;
    setForm(prev => ({
      ...prev,
      plan: p,
      maxStudents: def.maxStudents,
      maxBatches: def.maxBatches,
    }));
  };

  const handleNameChange = (e) => {
    const val = e.target.value;
    setForm(prev => {
      const next = { ...prev, name: val };
      if (prev.autoGenerateCode) {
        const words = val.trim().toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/);
        const derived = words.map(w => w.slice(0, 4)).join('').slice(0, 8);
        next.code = derived || '';
      }
      return next;
    });
  };

  const handleToggleAuto = (e) => {
    const isAuto = e.target.checked;
    setForm(prev => {
      if (isAuto) {
        const words = prev.name.trim().toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/);
        const derived = words.map(w => w.slice(0, 4)).join('').slice(0, 8);
        return { ...prev, autoGenerateCode: true, code: derived || 'INST01' };
      }
      return { ...prev, autoGenerateCode: false };
    });
  };

  const handleFetchUniqueCode = async () => {
    try {
      setGeneratingCode(true);
      const res = await axios.get(`${API_URL}/super-admin/generate-code`, {
        params: { name: form.name || 'INST' }
      });
      if (res.data?.code) {
        setForm(p => ({ ...p, code: res.data.code }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.name || !form.adminEmail || !form.password) {
      setError('Institute name, admin email and password are required.');
      return;
    }
    if (!form.autoGenerateCode && (!form.code || form.code.trim().length < 2)) {
      setError('Please provide a valid institute code (at least 2 characters) or enable automatic generation.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(`${API_URL}/super-admin/institute`, {
        name: form.name,
        code: form.code,
        autoGenerateCode: form.autoGenerateCode,
        adminEmail: form.adminEmail,
        adminName: form.adminName,
        password: form.password,
        plan: form.plan,
        quota: {
          maxStudents: Number(form.maxStudents),
          maxBatches: Number(form.maxBatches),
        },
      });
      onCreated(res.data);
      setForm({
        name: '',
        code: '',
        autoGenerateCode: true,
        adminEmail: '',
        adminName: '',
        password: '',
        plan: 'STARTER',
        maxStudents: 50,
        maxBatches: 3,
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create institute.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: 18, pb: 1 }}>
        Create New Institute & Assign Plan
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2 }}>
        {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

        <TextField
          label="Institute Name *"
          value={form.name}
          onChange={handleNameChange}
          fullWidth
          placeholder="e.g. Bulls Trading Academy"
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />

        {/* Plan & Quotas Selection */}
        <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2.5, border: '1px solid #e2e8f0' }}>
          <Typography sx={{ fontWeight: 700, fontSize: 13, color: '#1e293b', mb: 1.5 }}>
            Subscription Plan & Resource Limits
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <FormControl size="small" fullWidth>
                <InputLabel>Subscription Tier</InputLabel>
                <Select value={form.plan} label="Subscription Tier" onChange={handlePlanChange} sx={{ borderRadius: 2 }}>
                  <MenuItem value="STARTER">Starter Plan (50 Students, 3 Batches)</MenuItem>
                  <MenuItem value="GROWTH">Growth Plan (250 Students, 10 Batches)</MenuItem>
                  <MenuItem value="ENTERPRISE">Enterprise Plan (1000 Students, 50 Batches)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Max Students Quota"
                type="number"
                size="small"
                value={form.maxStudents}
                onChange={handleChange('maxStudents')}
                fullWidth
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Max Batches Quota"
                type="number"
                size="small"
                value={form.maxBatches}
                onChange={handleChange('maxBatches')}
                fullWidth
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
          </Grid>
        </Box>

        {/* Institute Code Option Box */}
        <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2.5, border: '1px solid #e2e8f0' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AutoFixHigh sx={{ color: form.autoGenerateCode ? '#6366f1' : '#94a3b8', fontSize: 20 }} />
              <Typography sx={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>
                Institute Code Generation
              </Typography>
            </Box>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={form.autoGenerateCode}
                  onChange={handleToggleAuto}
                  color="primary"
                />
              }
              label={
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: form.autoGenerateCode ? '#6366f1' : '#64748b' }}>
                  {form.autoGenerateCode ? 'Automatic' : 'Manual'}
                </Typography>
              }
              sx={{ mr: 0 }}
            />
          </Box>

          <TextField
            label="Institute Code *"
            value={form.code}
            onChange={(e) => setForm(p => ({ ...p, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) }))}
            fullWidth
            placeholder={form.autoGenerateCode ? 'Auto-generated code' : 'e.g. BULLS01'}
            disabled={form.autoGenerateCode && generatingCode}
            InputProps={{
              endAdornment: form.autoGenerateCode ? (
                <InputAdornment position="end">
                  <Tooltip title="Generate / Verify unique code from server">
                    <span>
                      <IconButton
                        size="small"
                        onClick={handleFetchUniqueCode}
                        disabled={generatingCode}
                        sx={{ color: '#6366f1' }}
                      >
                        {generatingCode ? <CircularProgress size={16} sx={{ color: '#6366f1' }} /> : <Refresh fontSize="small" />}
                      </IconButton>
                    </span>
                  </Tooltip>
                </InputAdornment>
              ) : null,
              sx: { fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1 },
            }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
        </Box>

        <TextField
          label="Admin Full Name"
          value={form.adminName}
          onChange={handleChange('adminName')}
          fullWidth
          placeholder="e.g. Rajesh Kumar"
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
        <TextField
          label="Admin Email *"
          type="email"
          value={form.adminEmail}
          onChange={handleChange('adminEmail')}
          fullWidth
          placeholder="admin@institute.com"
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
        <TextField
          label="Admin Password *"
          type="password"
          value={form.password}
          onChange={handleChange('password')}
          fullWidth
          placeholder="Min 8 characters"
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={onClose} sx={{ color: '#64748b' }}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading}
          sx={{ bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' }, borderRadius: 2, px: 3, fontWeight: 600 }}
        >
          {loading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Create Institute'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Edit Plan & Quota Modal ────────────────────────────────────────────────
const EditPlanModal = ({ open, onClose, institute, onUpdated }) => {
  const [plan, setPlan] = useState('STARTER');
  const [maxStudents, setMaxStudents] = useState(50);
  const [maxBatches, setMaxBatches] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (institute) {
      setPlan(institute.plan || 'STARTER');
      setMaxStudents(institute.quota?.maxStudents || 50);
      setMaxBatches(institute.quota?.maxBatches || 3);
    }
  }, [institute]);

  const handlePlanSelect = (newPlan) => {
    setPlan(newPlan);
    const def = DEFAULT_PLAN_QUOTAS[newPlan] || DEFAULT_PLAN_QUOTAS.STARTER;
    setMaxStudents(def.maxStudents);
    setMaxBatches(def.maxBatches);
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    try {
      await axios.patch(`${API_URL}/super-admin/institute/${institute._id}/plan`, {
        plan,
        quota: {
          maxStudents: Number(maxStudents),
          maxBatches: Number(maxBatches),
        },
      });
      onUpdated();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update plan');
    } finally {
      setLoading(false);
    }
  };

  if (!institute) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: 18 }}>
        Update Plan & Quotas — {institute.name}
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2 }}>
        {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

        <Typography sx={{ color: '#64748b', fontSize: 13 }}>
          Adjust the subscription tier and hard resource limits for this institute. Quota enforcement takes effect immediately.
        </Typography>

        <FormControl fullWidth size="small">
          <InputLabel>Subscription Plan</InputLabel>
          <Select
            value={plan}
            label="Subscription Plan"
            onChange={(e) => handlePlanSelect(e.target.value)}
            sx={{ borderRadius: 2 }}
          >
            <MenuItem value="STARTER">STARTER — 50 Students, 3 Batches</MenuItem>
            <MenuItem value="GROWTH">GROWTH — 250 Students, 10 Batches</MenuItem>
            <MenuItem value="ENTERPRISE">ENTERPRISE — 1,000 Students, 50 Batches</MenuItem>
          </Select>
        </FormControl>

        <Grid container spacing={2}>
          <Grid item xs={6}>
            <TextField
              label="Max Students Limit"
              type="number"
              value={maxStudents}
              onChange={(e) => setMaxStudents(e.target.value)}
              fullWidth
              size="small"
              helperText={`Currently used: ${institute.usage?.currentStudents || 0}`}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              label="Max Batches Limit"
              type="number"
              value={maxBatches}
              onChange={(e) => setMaxBatches(e.target.value)}
              fullWidth
              size="small"
              helperText={`Currently used: ${institute.usage?.currentBatches || 0}`}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={onClose} sx={{ color: '#64748b' }}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={loading}
          sx={{ bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' }, borderRadius: 2, px: 3, fontWeight: 600 }}
        >
          {loading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Save Plan'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Feature Toggles Modal ──────────────────────────────────────────────────
const FeatureTogglesModal = ({ open, onClose, institute, onUpdated }) => {
  const [features, setFeatures] = useState({
    replay: false,
    optionsTrading: true,
    analytics: true,
    customBranding: false,
    brokerIntegration: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (institute?.features) {
      setFeatures({
        replay: Boolean(institute.features.replay),
        optionsTrading: institute.features.optionsTrading !== false,
        analytics: institute.features.analytics !== false,
        customBranding: Boolean(institute.features.customBranding),
        brokerIntegration: Boolean(institute.features.brokerIntegration),
      });
    }
  }, [institute]);

  const handleToggle = (key) => {
    setFeatures(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    try {
      await axios.patch(`${API_URL}/super-admin/institute/${institute._id}/features`, features);
      onUpdated();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update features');
    } finally {
      setLoading(false);
    }
  };

  if (!institute) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: 18 }}>
        Feature Toggles — {institute.name}
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

        <Typography sx={{ color: '#64748b', fontSize: 13 }}>
          Enable or disable modular features for this institute. Disabled features are blocked via middleware and hidden from students and instructors.
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>Options Trading</Typography>
              <Typography sx={{ fontSize: 12, color: '#64748b' }}>Allow students to view Option Chain and execute Call/Put orders</Typography>
            </Box>
            <Switch checked={features.optionsTrading} onChange={() => handleToggle('optionsTrading')} color="primary" />
          </Box>

          <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>Replay Trading Engine</Typography>
              <Typography sx={{ fontSize: 12, color: '#64748b' }}>Simulate historical tick sessions for weekend student practice</Typography>
            </Box>
            <Switch checked={features.replay} onChange={() => handleToggle('replay')} color="primary" />
          </Box>

          <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>Advanced Analytics & Heatmaps</Typography>
              <Typography sx={{ fontSize: 12, color: '#64748b' }}>Comprehensive PnL risk attribution, calendar heatmaps, and Sharpe metrics</Typography>
            </Box>
            <Switch checked={features.analytics} onChange={() => handleToggle('analytics')} color="primary" />
          </Box>

          <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>Custom Institute Branding</Typography>
              <Typography sx={{ fontSize: 12, color: '#64748b' }}>Allow custom logos, portal theme colors, and white-label titles</Typography>
            </Box>
            <Switch checked={features.customBranding} onChange={() => handleToggle('customBranding')} color="primary" />
          </Box>

          <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>Direct Broker API Integration</Typography>
              <Typography sx={{ fontSize: 12, color: '#64748b' }}>Connect institute's dedicated Dhan / Kotak Neo keys directly</Typography>
            </Box>
            <Switch checked={features.brokerIntegration} onChange={() => handleToggle('brokerIntegration')} color="primary" />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={onClose} sx={{ color: '#64748b' }}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={loading}
          sx={{ bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' }, borderRadius: 2, px: 3, fontWeight: 600 }}
        >
          {loading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Apply Features'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Reset Password Modal ───────────────────────────────────────────────────
const ResetPasswordModal = ({ open, onClose, institute, onSuccess }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleClose = () => {
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await axios.patch(
        `${API_URL}/super-admin/institute/${institute._id}/reset-password`,
        { newPassword }
      );
      onSuccess(res.data);
      handleClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: 18, pb: 1 }}>
        Reset Admin Password
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
        <Typography sx={{ color: '#64748b', fontSize: 13 }}>
          Set a new login password for <strong>{institute?.name}</strong> admin ({institute?.adminEmail}).
        </Typography>

        <TextField
          label="New Password"
          type={showPassword ? 'text' : 'password'}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          fullWidth
          placeholder="Min 6 characters"
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setShowPassword(p => !p)} edge="end">
                  {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                </IconButton>
              </InputAdornment>
            ),
          }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />

        <TextField
          label="Confirm Password"
          type={showPassword ? 'text' : 'password'}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          fullWidth
          placeholder="Re-enter password"
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={handleClose} sx={{ color: '#64748b' }}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading || !newPassword || !confirmPassword}
          sx={{ bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' }, borderRadius: 2, px: 3, fontWeight: 600 }}
        >
          {loading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Reset Password'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Main Page ──────────────────────────────────────────────────────────────
const InstituteManagement = () => {
  const navigate = useNavigate();
  const { impersonateInstitute } = useAuth();
  const [institutes, setInstitutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [planState, setPlanState] = useState({ open: false, inst: null });
  const [featureState, setFeatureState] = useState({ open: false, inst: null });
  const [resetPwState, setResetPwState] = useState({ open: false, inst: null });
  const [confirmState, setConfirmState] = useState({ open: false, inst: null });
  const [impersonateState, setImpersonateState] = useState({ open: false, inst: null });
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState({ open: false, msg: '', severity: 'success' });

  const showToast = (msg, severity = 'success') => setToast({ open: true, msg, severity });

  const handleImpersonate = async (inst) => {
    if (!inst) return;
    setActionLoading(true);
    try {
      const res = await axios.post(`${API_URL}/super-admin/impersonate/${inst._id}`);
      if (res.data?.success && res.data?.accessToken) {
        impersonateInstitute(res.data.accessToken, res.data.user);
        showToast(`Support Mode Active: Viewing ${inst.name}`);
        navigate('/institute');
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to start support impersonation', 'error');
    } finally {
      setActionLoading(false);
      setImpersonateState({ open: false, inst: null });
    }
  };

  const fetchInstitutes = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/super-admin/institutes`);
      setInstitutes(res.data);
    } catch (err) {
      showToast('Failed to load institutes', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInstitutes();
  }, [fetchInstitutes]);

  const handleCreated = (data) => {
    setCreateOpen(false);
    showToast(`Institute "${data.institute.name}" created! Plan: ${data.institute.plan}`);
    fetchInstitutes();
  };

  const handleStatusToggle = async () => {
    const inst = confirmState.inst;
    if (!inst) return;
    const newStatus = inst.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setActionLoading(true);
    try {
      await axios.patch(`${API_URL}/super-admin/institute/${inst._id}/status`, { status: newStatus });
      showToast(`Institute ${newStatus === 'ACTIVE' ? 'activated' : 'suspended'} successfully`);
      fetchInstitutes();
    } catch (err) {
      showToast(err.response?.data?.message || 'Action failed', 'error');
    } finally {
      setActionLoading(false);
      setConfirmState({ open: false, inst: null });
    }
  };

  return (
    <Box sx={{ pb: 6 }}>
      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a', mb: 0.5 }}>
            Institute Governance & Quotas
          </Typography>
          <Typography sx={{ color: '#64748b', fontSize: 13 }}>
            Manage SaaS subscription tiers, student/batch quotas, and feature flags across {institutes.length} institute{institutes.length !== 1 ? 's' : ''}
          </Typography>
        </Box>
        <Button
          id="create-institute-btn"
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateOpen(true)}
          sx={{
            bgcolor: '#6366f1',
            '&:hover': { bgcolor: '#4f46e5' },
            borderRadius: 2,
            fontWeight: 600,
            px: 3,
            py: 1.2,
          }}
        >
          Create Institute
        </Button>
      </Box>

      {/* Table */}
      <Box sx={{ borderRadius: 3, border: '1px solid #e2e8f0', overflow: 'hidden', bgcolor: 'white' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>INSTITUTE</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>CODE</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>PLAN</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>STUDENT CAPACITY</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>BATCHES</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>FEATURES</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>STATUS</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>ACTIONS</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} sx={{ textAlign: 'center', py: 6 }}>
                    <CircularProgress sx={{ color: '#6366f1' }} />
                  </TableCell>
                </TableRow>
              ) : institutes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} sx={{ textAlign: 'center', py: 6 }}>
                    <InstIcon sx={{ fontSize: 48, color: '#e2e8f0', mb: 1 }} />
                    <Typography sx={{ color: '#94a3b8' }}>No institutes yet. Create your first one!</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                institutes.map((inst) => {
                  const studentUsed = inst.studentCount || inst.usage?.currentStudents || 0;
                  const maxStudents = inst.quota?.maxStudents || 50;
                  const studentPct = Math.min(100, Math.round((studentUsed / maxStudents) * 100));

                  const batchUsed = inst.batchCount || inst.usage?.currentBatches || 0;
                  const maxBatches = inst.quota?.maxBatches || 3;

                  const planStyle = getPlanBadgeStyle(inst.plan || 'STARTER');

                  return (
                    <TableRow key={inst._id} hover>
                      <TableCell>
                        <Typography sx={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>
                          {inst.name}
                        </Typography>
                        <Typography sx={{ color: '#94a3b8', fontSize: 12 }}>
                          {inst.adminEmail}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={inst.code}
                          size="small"
                          sx={{ fontFamily: 'monospace', bgcolor: '#f1f5f9', color: '#475569', fontWeight: 600 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={inst.plan || 'STARTER'}
                          size="small"
                          sx={{
                            ...planStyle,
                            fontWeight: 700,
                            fontSize: 11,
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ minWidth: 140 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                            {studentUsed} / {maxStudents}
                          </Typography>
                          <Typography sx={{ fontSize: 11, color: '#64748b' }}>
                            {studentPct}%
                          </Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={studentPct}
                          sx={{
                            height: 6,
                            borderRadius: 3,
                            bgcolor: '#f1f5f9',
                            '& .MuiLinearProgress-bar': {
                              bgcolor: studentPct >= 100 ? '#dc2626' : studentPct >= 80 ? '#f59e0b' : '#16a34a',
                            },
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>
                        {batchUsed} / {maxBatches}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', maxWidth: 160 }}>
                          {inst.features?.optionsTrading !== false && (
                            <Chip label="Options" size="small" sx={{ fontSize: 10, height: 20, bgcolor: '#eff6ff', color: '#2563eb' }} />
                          )}
                          {inst.features?.replay && (
                            <Chip label="Replay" size="small" sx={{ fontSize: 10, height: 20, bgcolor: '#faf5ff', color: '#9333ea' }} />
                          )}
                          {inst.features?.analytics !== false && (
                            <Chip label="Analytics" size="small" sx={{ fontSize: 10, height: 20, bgcolor: '#f0fdf4', color: '#16a34a' }} />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={inst.status}
                          size="small"
                          sx={{
                            bgcolor: inst.status === 'ACTIVE' ? '#dcfce7' : '#fee2e2',
                            color: inst.status === 'ACTIVE' ? '#16a34a' : '#dc2626',
                            fontWeight: 700,
                            fontSize: 11,
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Tooltip title="Upgrade Plan & Quotas">
                            <IconButton
                              size="small"
                              onClick={() => setPlanState({ open: true, inst })}
                              sx={{ color: '#6366f1' }}
                            >
                              <PlanIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Toggle Features">
                            <IconButton
                              size="small"
                              onClick={() => setFeatureState({ open: true, inst })}
                              sx={{ color: '#0891b2' }}
                            >
                              <FeatureIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Reset Admin Password">
                            <IconButton
                              size="small"
                              onClick={() => setResetPwState({ open: true, inst })}
                              sx={{ color: '#475569' }}
                            >
                              <LockResetIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Login as Institute (Support Mode)">
                            <IconButton
                              size="small"
                              onClick={() => setImpersonateState({ open: true, inst })}
                              sx={{
                                color: '#059669',
                                bgcolor: '#ecfdf5',
                                '&:hover': { bgcolor: '#d1fae5' },
                              }}
                            >
                              <ImpersonateIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={inst.status === 'ACTIVE' ? 'Suspend Institute' : 'Activate Institute'}>
                            <IconButton
                              size="small"
                              onClick={() => setConfirmState({ open: true, inst })}
                              sx={{ color: inst.status === 'ACTIVE' ? '#f59e0b' : '#10b981' }}
                            >
                              {inst.status === 'ACTIVE' ? <SuspendIcon /> : <ActivateIcon />}
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
      </Box>

      {/* Modals */}
      <CreateInstituteModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={handleCreated} />
      
      <EditPlanModal
        open={planState.open}
        onClose={() => setPlanState({ open: false, inst: null })}
        institute={planState.inst}
        onUpdated={() => {
          showToast('Institute plan and quotas updated successfully');
          fetchInstitutes();
        }}
      />

      <FeatureTogglesModal
        open={featureState.open}
        onClose={() => setFeatureState({ open: false, inst: null })}
        institute={featureState.inst}
        onUpdated={() => {
          showToast('Feature flags updated successfully');
          fetchInstitutes();
        }}
      />

      <ResetPasswordModal
        open={resetPwState.open}
        onClose={() => setResetPwState({ open: false, inst: null })}
        institute={resetPwState.inst}
        onSuccess={(data) => {
          showToast(`Password reset for ${data.admin?.email || 'admin'}`);
        }}
      />

      {/* Confirm Dialog */}
      <Dialog open={confirmState.open} onClose={() => setConfirmState({ open: false, inst: null })} PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {confirmState.inst?.status === 'ACTIVE' ? 'Suspend' : 'Activate'} Institute?
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#64748b' }}>
            This will {confirmState.inst?.status === 'ACTIVE' ? 'suspend' : 'activate'} "{confirmState.inst?.name}" and {confirmState.inst?.status === 'ACTIVE' ? 'block' : 'restore'} access for all associated users.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ pb: 2, px: 2, gap: 1 }}>
          <Button onClick={() => setConfirmState({ open: false, inst: null })} sx={{ color: '#64748b' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleStatusToggle}
            disabled={actionLoading}
            sx={{
              bgcolor: confirmState.inst?.status === 'ACTIVE' ? '#dc2626' : '#16a34a',
              '&:hover': { bgcolor: confirmState.inst?.status === 'ACTIVE' ? '#b91c1c' : '#15803d' },
              borderRadius: 2,
            }}
          >
            {actionLoading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : (confirmState.inst?.status === 'ACTIVE' ? 'Suspend' : 'Activate')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Support Mode Impersonate Dialog */}
      <Dialog
        open={impersonateState.open}
        onClose={() => setImpersonateState({ open: false, inst: null })}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#065f46', display: 'flex', alignItems: 'center', gap: 1 }}>
          <ImpersonateIcon sx={{ color: '#059669' }} /> Enter Support Mode
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: '#475569', mb: 2 }}>
            You are about to enter Support Mode for <strong>{impersonateState.inst?.name}</strong> ({impersonateState.inst?.code}).
          </Typography>
          <Box sx={{ p: 2, bgcolor: '#ecfdf5', borderRadius: 2, border: '1px solid #a7f3d0' }}>
            <Typography variant="caption" sx={{ color: '#065f46', fontWeight: 600, display: 'block', mb: 0.5 }}>
              🛡️ Support Security Policy:
            </Typography>
            <Typography variant="caption" sx={{ color: '#047857', display: 'block' }}>
              • 30-minute isolated session token<br />
              • Destructive actions (deletions, credential changes) blocked<br />
              • Every action is logged in the super admin audit trail<br />
              • Revert back to Super Admin anytime with one click
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ pb: 2.5, px: 2.5, gap: 1 }}>
          <Button
            onClick={() => setImpersonateState({ open: false, inst: null })}
            sx={{ color: '#64748b', textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => handleImpersonate(impersonateState.inst)}
            disabled={actionLoading}
            sx={{
              bgcolor: '#059669',
              '&:hover': { bgcolor: '#047857' },
              textTransform: 'none',
              fontWeight: 700,
              borderRadius: 2,
              px: 3,
            }}
          >
            {actionLoading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Confirm & Login'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toast */}
      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast(t => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={toast.severity} sx={{ borderRadius: 2, fontWeight: 500 }}>{toast.msg}</Alert>
      </Snackbar>
    </Box>
  );
};

export default InstituteManagement;
