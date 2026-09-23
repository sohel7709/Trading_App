import React, { useState, useEffect, useContext } from 'react';
import {
  Box, Card, CardContent, Typography, Button, Chip, Grid,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  FormControlLabel, Checkbox, Alert, CircularProgress, Divider,
  Stack, Tooltip
} from '@mui/material';
import {
  PlayArrow as ResumeIcon,
  Pause as HaltIcon,
  FlashOn as LiveIcon,
  History as ReplayIcon,
  AutoGraph as SyntheticIcon,
  WarningAmber as AlertIcon,
  Security as SecurityIcon,
  Refresh as RefreshIcon,
  CheckCircle as ActiveIcon,
  ReportProblem as EmergencyIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { io } from 'socket.io-client';
import { AuthContext, API_URL } from '../../context/AuthContext';

const MarketControl = () => {
  const { user } = useContext(AuthContext);
  const [marketState, setMarketState] = useState({
    mode: 'LIVE',
    isHalted: false,
    haltReason: null,
    haltedAt: null,
    updatedAt: null,
    updatedBy: null,
  });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState(null); // { type: 'success'|'error', text: '' }

  // Emergency Halt Modal
  const [haltModalOpen, setHaltModalOpen] = useState(false);
  const [haltReason, setHaltReason] = useState('Critical system maintenance / Emergency stop');
  const [autoSquareOffMIS, setAutoSquareOffMIS] = useState(true);

  // Fetch initial market state
  const fetchState = async () => {
    try {
      const res = await axios.get(`${API_URL}/super-admin/market/state`);
      if (res.data) {
        setMarketState(res.data);
      }
    } catch (e) {
      console.warn('Failed to load market state:', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchState();

    // Connect to WebSocket for real-time market control broadcasts
    const socket = io(API_URL, { transports: ['websocket', 'polling'] });
    socket.on('market_update', (state) => {
      if (state) setMarketState(state);
    });
    socket.on('market_halted', (data) => {
      setMarketState(prev => ({
        ...prev,
        isHalted: true,
        haltReason: data?.reason || prev.haltReason,
        haltedAt: data?.haltedAt || new Date().toISOString(),
      }));
    });
    socket.on('market_resumed', () => {
      setMarketState(prev => ({
        ...prev,
        isHalted: false,
        haltReason: null,
        haltedAt: null,
      }));
    });

    return () => socket.disconnect();
  }, []);

  // Mode change handler
  const handleModeSwitch = async (newMode) => {
    if (newMode === marketState.mode) return;
    setActionLoading(true);
    setMsg(null);
    try {
      const res = await axios.post(`${API_URL}/super-admin/market/mode`, { mode: newMode });
      setMarketState(res.data);
      setMsg({ type: 'success', text: `Market mode successfully switched to ${newMode}!` });
    } catch (e) {
      setMsg({ type: 'error', text: e.response?.data?.message || 'Failed to switch market mode' });
    } finally {
      setActionLoading(false);
    }
  };

  // Emergency Halt handler
  const handleEmergencyHalt = async () => {
    setActionLoading(true);
    setMsg(null);
    try {
      const res = await axios.post(`${API_URL}/super-admin/market/emergency-halt`, {
        reason: haltReason,
        autoSquareOffMIS,
      });
      setMarketState(res.data);
      setHaltModalOpen(false);
      setMsg({
        type: 'success',
        text: `EMERGENCY HALT ACTIVE: ${res.data.cancelledOrdersCount || 0} orders cancelled, ${res.data.squaredOffCount || 0} MIS positions closed.`,
      });
    } catch (e) {
      setMsg({ type: 'error', text: e.response?.data?.message || 'Emergency halt failed' });
    } finally {
      setActionLoading(false);
    }
  };

  // Resume Market handler
  const handleResume = async () => {
    setActionLoading(true);
    setMsg(null);
    try {
      const res = await axios.post(`${API_URL}/super-admin/market/resume`);
      setMarketState(res.data);
      setMsg({ type: 'success', text: 'Market trading has been resumed for all participants!' });
    } catch (e) {
      setMsg({ type: 'error', text: e.response?.data?.message || 'Failed to resume market' });
    } finally {
      setActionLoading(false);
    }
  };

  const modeColors = {
    LIVE: { bg: '#dcfce7', text: '#15803d', border: '#86efac', icon: <LiveIcon sx={{ fontSize: 20 }} /> },
    REPLAY: { bg: '#e0e7ff', text: '#4338ca', border: '#a5b4fc', icon: <ReplayIcon sx={{ fontSize: 20 }} /> },
    SYNTHETIC: { bg: '#f3e8ff', text: '#7e22ce', border: '#d8b4fe', icon: <SyntheticIcon sx={{ fontSize: 20 }} /> },
  };

  const currentModeStyle = modeColors[marketState.mode] || modeColors.LIVE;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      {/* ── Page Header ────────────────────────────────────────── */}
      <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a' }}>
              Market Control & Exchange Engine
            </Typography>
            <Chip
              label="Phase 2 Real-Time Control"
              size="small"
              sx={{ bgcolor: '#4f46e5', color: 'white', fontWeight: 700, fontSize: 11 }}
            />
          </Box>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            Manage platform-wide market modes, circuit breakers, and global emergency trading halts.
          </Typography>
        </Box>

        <Button
          startIcon={<RefreshIcon />}
          onClick={fetchState}
          variant="outlined"
          size="small"
          sx={{ textTransform: 'none', color: '#64748b', borderColor: '#cbd5e1' }}
        >
          Sync State
        </Button>
      </Box>

      {/* ── Status Message Alert ───────────────────────────────── */}
      {msg && (
        <Alert
          severity={msg.type}
          onClose={() => setMsg(null)}
          sx={{ mb: 3, fontWeight: 600, borderRadius: 2 }}
        >
          {msg.text}
        </Alert>
      )}

      {/* ── Active Status Hero Card ────────────────────────────── */}
      <Card sx={{
        mb: 4,
        borderRadius: 3,
        border: '1px solid',
        borderColor: marketState.isHalted ? '#fecaca' : '#bbf7d0',
        bgcolor: marketState.isHalted ? '#fef2f2' : '#f0fdf4',
        boxShadow: marketState.isHalted
          ? '0 10px 25px -5px rgba(239, 68, 68, 0.15)'
          : '0 10px 25px -5px rgba(34, 197, 94, 0.15)',
      }}>
        <CardContent sx={{ p: 3.5 }}>
          <Grid container alignItems="center" spacing={3}>
            {/* Left: Circuit Status */}
            <Grid item xs={12} md={7}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{
                  width: 54, height: 54, borderRadius: 3,
                  bgcolor: marketState.isHalted ? '#ef4444' : '#22c55e',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white',
                  animation: marketState.isHalted ? 'pulse 1.5s infinite' : 'none',
                }}>
                  {marketState.isHalted ? <EmergencyIcon sx={{ fontSize: 32 }} /> : <ActiveIcon sx={{ fontSize: 32 }} />}
                </Box>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography variant="h6" sx={{
                      fontWeight: 800,
                      color: marketState.isHalted ? '#991b1b' : '#166534',
                    }}>
                      {marketState.isHalted ? 'TRADING HALTED GLOBALLY' : 'MARKET ACTIVE & OPERATIONAL'}
                    </Typography>
                    <Chip
                      label={marketState.isHalted ? 'HALTED' : 'RUNNING'}
                      size="small"
                      sx={{
                        bgcolor: marketState.isHalted ? '#dc2626' : '#16a34a',
                        color: 'white',
                        fontWeight: 800,
                        fontSize: 11,
                      }}
                    />
                  </Box>
                  <Typography variant="body2" sx={{
                    color: marketState.isHalted ? '#b91c1c' : '#15803d',
                    mt: 0.5,
                  }}>
                    {marketState.isHalted
                      ? `Reason: ${marketState.haltReason || 'Circuit breaker active'} (Orders blocked)`
                      : 'All buy/sell order routing, Dhan live tick ingestion, and socket feeds are live.'}
                  </Typography>
                </Box>
              </Box>
            </Grid>

            {/* Right: Quick Action Controls */}
            <Grid item xs={12} md={5} sx={{ display: 'flex', justifyContent: { xs: 'flex-start', md: 'flex-end' }, gap: 2 }}>
              {marketState.isHalted ? (
                <Button
                  variant="contained"
                  size="large"
                  startIcon={<ResumeIcon />}
                  onClick={handleResume}
                  disabled={actionLoading}
                  sx={{
                    bgcolor: '#16a34a',
                    '&:hover': { bgcolor: '#15803d' },
                    textTransform: 'none',
                    fontWeight: 700,
                    px: 3.5, py: 1.2,
                    boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)',
                  }}
                >
                  Resume Market Trading
                </Button>
              ) : (
                <Button
                  variant="contained"
                  size="large"
                  startIcon={<HaltIcon />}
                  onClick={() => setHaltModalOpen(true)}
                  disabled={actionLoading}
                  sx={{
                    bgcolor: '#dc2626',
                    '&:hover': { bgcolor: '#b91c1c' },
                    textTransform: 'none',
                    fontWeight: 700,
                    px: 3.5, py: 1.2,
                    boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
                  }}
                >
                  EMERGENCY HALT MARKET
                </Button>
              )}
            </Grid>
          </Grid>

          <Divider sx={{ my: 2.5, borderColor: marketState.isHalted ? '#fecaca' : '#bbf7d0' }} />

          {/* Metadata Footer */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 4, fontSize: 13, color: '#64748b' }}>
            <Box>
              <strong>Active Data Engine:</strong>{' '}
              <Chip
                label={marketState.mode}
                size="small"
                sx={{
                  bgcolor: currentModeStyle.bg,
                  color: currentModeStyle.text,
                  fontWeight: 800,
                  fontSize: 11,
                  ml: 0.5,
                }}
              />
            </Box>
            <Box>
              <strong>Last Updated:</strong>{' '}
              {marketState.updatedAt ? new Date(marketState.updatedAt).toLocaleTimeString('en-IN') : 'Just now'}
            </Box>
            <Box>
              <strong>Updated By:</strong> {marketState.updatedBy || 'Super Admin'}
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* ── STEP 1 & 3: Market Mode Switcher ───────────────────── */}
      <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#0f172a', mb: 2 }}>
        Step 3 — Market Feed Mode Selector
      </Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* LIVE Mode Card */}
        <Grid item xs={12} md={4}>
          <Card
            onClick={() => handleModeSwitch('LIVE')}
            sx={{
              p: 3,
              cursor: 'pointer',
              borderRadius: 3,
              border: marketState.mode === 'LIVE' ? '2px solid #22c55e' : '1px solid #e2e8f0',
              bgcolor: marketState.mode === 'LIVE' ? '#f0fdf4' : 'white',
              boxShadow: marketState.mode === 'LIVE' ? '0 8px 20px rgba(34, 197, 94, 0.12)' : 'none',
              transition: 'all 0.2s',
              '&:hover': { borderColor: '#22c55e', transform: 'translateY(-2px)' },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
              <Box sx={{
                width: 40, height: 40, borderRadius: 2,
                bgcolor: '#dcfce7', color: '#16a34a',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <LiveIcon />
              </Box>
              {marketState.mode === 'LIVE' && (
                <Chip label="ACTIVE" size="small" sx={{ bgcolor: '#22c55e', color: 'white', fontWeight: 800 }} />
              )}
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a', mb: 0.5 }}>
              LIVE Market Feed
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748b', fontSize: 13, minHeight: 40 }}>
              Real-time Dhan broker ticks, live NSE option chains, and real order matching.
            </Typography>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="caption" sx={{ color: '#16a34a', fontWeight: 700 }}>
              Broker API: Connected · Production Ticks
            </Typography>
          </Card>
        </Grid>

        {/* REPLAY Mode Card */}
        <Grid item xs={12} md={4}>
          <Card
            onClick={() => handleModeSwitch('REPLAY')}
            sx={{
              p: 3,
              cursor: 'pointer',
              borderRadius: 3,
              border: marketState.mode === 'REPLAY' ? '2px solid #4f46e5' : '1px solid #e2e8f0',
              bgcolor: marketState.mode === 'REPLAY' ? '#eef2ff' : 'white',
              boxShadow: marketState.mode === 'REPLAY' ? '0 8px 20px rgba(79, 70, 229, 0.12)' : 'none',
              transition: 'all 0.2s',
              '&:hover': { borderColor: '#4f46e5', transform: 'translateY(-2px)' },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
              <Box sx={{
                width: 40, height: 40, borderRadius: 2,
                bgcolor: '#e0e7ff', color: '#4f46e5',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <ReplayIcon />
              </Box>
              {marketState.mode === 'REPLAY' && (
                <Chip label="ACTIVE" size="small" sx={{ bgcolor: '#4f46e5', color: 'white', fontWeight: 800 }} />
              )}
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a', mb: 0.5 }}>
              Historical Replay Mode
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748b', fontSize: 13, minHeight: 40 }}>
              Playback historical market dates and candle streams with controlled speed (1x-10x).
            </Typography>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="caption" sx={{ color: '#4f46e5', fontWeight: 700 }}>
              Replay Engine: DB Candles · Student Backtesting
            </Typography>
          </Card>
        </Grid>

        {/* SYNTHETIC Mode Card */}
        <Grid item xs={12} md={4}>
          <Card
            onClick={() => handleModeSwitch('SYNTHETIC')}
            sx={{
              p: 3,
              cursor: 'pointer',
              borderRadius: 3,
              border: marketState.mode === 'SYNTHETIC' ? '2px solid #9333ea' : '1px solid #e2e8f0',
              bgcolor: marketState.mode === 'SYNTHETIC' ? '#faf5ff' : 'white',
              boxShadow: marketState.mode === 'SYNTHETIC' ? '0 8px 20px rgba(147, 51, 234, 0.12)' : 'none',
              transition: 'all 0.2s',
              '&:hover': { borderColor: '#9333ea', transform: 'translateY(-2px)' },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
              <Box sx={{
                width: 40, height: 40, borderRadius: 2,
                bgcolor: '#f3e8ff', color: '#9333ea',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <SyntheticIcon />
              </Box>
              {marketState.mode === 'SYNTHETIC' && (
                <Chip label="ACTIVE" size="small" sx={{ bgcolor: '#9333ea', color: 'white', fontWeight: 800 }} />
              )}
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a', mb: 0.5 }}>
              SYNTHETIC Simulation
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748b', fontSize: 13, minHeight: 40 }}>
              Brownian-motion random-walk ticks 24/7. Demo-ready when market is closed or offline.
            </Typography>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="caption" sx={{ color: '#9333ea', fontWeight: 700 }}>
              24/7 Tick Walk · Weekend & Demo Active
            </Typography>
          </Card>
        </Grid>
      </Grid>

      {/* ── Emergency Halt Modal ───────────────────────────────── */}
      <Dialog
        open={haltModalOpen}
        onClose={() => setHaltModalOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: '#dc2626', fontWeight: 800 }}>
          <AlertIcon sx={{ fontSize: 28 }} />
          Confirm Emergency Market Halt
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: '#475569', mb: 3 }}>
            Halting the market will immediately block all participant buy/sell order submissions, freeze pending limit orders, and broadcast an emergency alert to all mobile and web clients.
          </Typography>

          <TextField
            fullWidth
            label="Halt Reason / Broadcast Notice"
            value={haltReason}
            onChange={(e) => setHaltReason(e.target.value)}
            multiline
            rows={2}
            sx={{ mb: 2.5 }}
          />

          <Box sx={{ p: 2, bgcolor: '#fef2f2', borderRadius: 2, border: '1px solid #fecaca' }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={autoSquareOffMIS}
                  onChange={(e) => setAutoSquareOffMIS(e.target.checked)}
                  sx={{ color: '#dc2626', '&.Mui-checked': { color: '#dc2626' } }}
                />
              }
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#991b1b' }}>
                    Auto Square-Off All Active MIS Positions
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#b91c1c' }}>
                    Closes open intraday positions at last traded price to protect capital during failures.
                  </Typography>
                </Box>
              }
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 1 }}>
          <Button onClick={() => setHaltModalOpen(false)} sx={{ textTransform: 'none', color: '#64748b' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleEmergencyHalt}
            disabled={actionLoading}
            sx={{
              bgcolor: '#dc2626',
              '&:hover': { bgcolor: '#b91c1c' },
              textTransform: 'none',
              fontWeight: 800,
              px: 3,
            }}
          >
            {actionLoading ? <CircularProgress size={20} color="inherit" /> : 'Confirm Emergency Halt'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MarketControl;
