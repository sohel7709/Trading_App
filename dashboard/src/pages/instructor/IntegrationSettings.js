import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext, API_URL } from '../../context/AuthContext';
import { 
  Box, Typography, Paper, Grid, Tabs, Tab, TextField, Button, Alert, 
  Card, CardActionArea, CardContent, Divider, Chip, FormControlLabel, Switch,
  Link, Tooltip, IconButton, Accordion, AccordionSummary, AccordionDetails, CircularProgress
} from '@mui/material';
import { 
  Security as SecurityIcon, 
  PlayCircleOutline as PlayIcon, 
  Sensors as LiveIcon,
  Api as ApiIcon,
  CheckCircle as CheckIcon,
  CheckCircle as CheckCircleIcon,
  Refresh as RefreshIcon,
  ContentCopy as CopyIcon,
  FlashOn as FlashOnIcon,
  Schedule as ScheduleIcon,
  Lock as LockIcon,
  VpnKey as KeyIcon,
  Warning as WarningIcon,
  ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';

const IntegrationSettings = () => {
  const { user } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState(0); // 0: DHAN, 1: KOTAK, 2: ZERODHA
  const providers = ['DHAN', 'KOTAK', 'ZERODHA'];
  
  const [savedCredsMap, setSavedCredsMap] = useState({});
  const [dhanForm, setDhanForm] = useState({ 
    apiKey: '', 
    accessToken: '', 
    pin: '',
    totpSecret: '',
    autoRenew: true,
    expiresAt: null,
    hasPin: false,
    hasTotpSecret: false,
    hasAccessToken: false,
    lastAutoRenewAt: null,
    lastAutoRenewStatus: null,
    lastAutoRenewError: null,
  });
  const [kotakForm, setKotakForm] = useState({ apiKey: '', consumerSecret: '', mobileNo: '', password: '', mpin: '' });
  const [copiedPostback, setCopiedPostback] = useState(false);
  
  const [setAsActive, setSetAsActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [marketMode, setMarketMode] = useState('LIVE_BROKER');
  const [statusMsg, setStatusMsg] = useState(null);
  const [feedStatus, setFeedStatus] = useState(null);
  const [restartingFeed, setRestartingFeed] = useState(false);

  useEffect(() => {
    fetchCredentials();
    fetchFeedStatus();
    const interval = setInterval(fetchFeedStatus, 8000);
    return () => clearInterval(interval);
  }, []);

  const fetchFeedStatus = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await axios.get(`${API_URL}/brokers/feed-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFeedStatus(res.data);
    } catch (err) {
      console.warn('Failed to fetch feed status', err);
    }
  };

  const handleRestartFeed = async () => {
    setRestartingFeed(true);
    setStatusMsg(null);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await axios.post(`${API_URL}/brokers/restart-feed`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStatusMsg({ type: 'success', text: res.data.message || 'Feed restarted successfully' });
      await fetchFeedStatus();
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.response?.data?.message || 'Failed to restart feed' });
    } finally {
      setRestartingFeed(false);
    }
  };

  const fetchCredentials = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await axios.get(`${API_URL}/brokers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data && Array.isArray(res.data)) {
        const map = {};
        res.data.forEach(c => {
          map[c.provider] = c;
        });
        setSavedCredsMap(map);

        if (map['DHAN']) {
          const d = map['DHAN'];
          setDhanForm({ 
            apiKey: d.apiKey || '', 
            accessToken: d.hasAccessToken ? '••••••••••••••••' : '',
            pin: d.hasPin ? '••••••' : '',
            totpSecret: d.hasTotpSecret ? '••••••••••••••••' : '',
            autoRenew: d.autoRenew !== false,
            expiresAt: d.expiresAt || null,
            hasPin: Boolean(d.hasPin),
            hasTotpSecret: Boolean(d.hasTotpSecret),
            hasAccessToken: Boolean(d.hasAccessToken),
            lastAutoRenewAt: d.lastAutoRenewAt || null,
            lastAutoRenewStatus: d.lastAutoRenewStatus || null,
            lastAutoRenewError: d.lastAutoRenewError || null,
          });
        }
        if (map['KOTAK']) {
          setKotakForm({
            apiKey: map['KOTAK'].apiKey || '',
            consumerSecret: map['KOTAK'].consumerSecret ? '********' : '',
            mobileNo: map['KOTAK'].mobileNo || '',
            password: map['KOTAK'].password ? '********' : '',
            mpin: map['KOTAK'].mpin ? '****' : '',
          });
        }

        // Set active tab to active provider if available
        const activeCred = res.data.find(c => c.isActiveProvider);
        if (activeCred) {
          const idx = providers.indexOf(activeCred.provider);
          if (idx !== -1) setActiveTab(idx);
        }
      }
    } catch (err) {
      console.error('Failed to fetch broker credentials', err);
    }
  };

  const handleGenerateDhanToken = async () => {
    if (!dhanForm.apiKey) {
      setStatusMsg({ type: 'error', text: 'Dhan Client ID is required to generate a token.' });
      return;
    }
    setGeneratingToken(true);
    setStatusMsg(null);
    try {
      const token = localStorage.getItem('accessToken');
      const payload = {
        clientId: dhanForm.apiKey.trim(),
        pin: dhanForm.pin && !dhanForm.pin.includes('•') ? dhanForm.pin.trim() : undefined,
        totpSecret: dhanForm.totpSecret && !dhanForm.totpSecret.includes('•') ? dhanForm.totpSecret.trim() : undefined,
      };
      const res = await axios.post(`${API_URL}/brokers/generate-token`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStatusMsg({ type: 'success', text: res.data.message || 'Dhan 24-hour access token successfully generated and cached!' });
      await fetchCredentials();
      await fetchFeedStatus();
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err.response?.data?.message || 'Failed to generate Dhan token. Check Client ID, PIN, and TOTP Secret.',
      });
    } finally {
      setGeneratingToken(false);
    }
  };

  const getDhanExpiryInfo = () => {
    const cred = savedCredsMap['DHAN'];
    const expiry = cred?.expiresAt || dhanForm.expiresAt;
    if (expiry) {
      const diffMs = new Date(expiry).getTime() - Date.now();
      const hoursLeft = Math.max(0, diffMs / (1000 * 60 * 60)).toFixed(1);
      const formatted = new Date(expiry).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: true,
      }) + ' IST';
      return {
        valid: diffMs > 0,
        hoursLeft,
        formatted,
      };
    }
    return null;
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    setStatusMsg(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg(null);

    const provider = providers[activeTab];
    let payload = { provider, setAsActive };

    if (provider === 'DHAN') {
      payload = { 
        ...payload, 
        apiKey: dhanForm.apiKey.trim(), 
        ...(dhanForm.accessToken && !dhanForm.accessToken.includes('•') ? { accessToken: dhanForm.accessToken.trim() } : {}),
        ...(dhanForm.pin && !dhanForm.pin.includes('•') ? { pin: dhanForm.pin.trim() } : {}),
        ...(dhanForm.totpSecret && !dhanForm.totpSecret.includes('•') ? { totpSecret: dhanForm.totpSecret.trim() } : {}),
        autoRenew: dhanForm.autoRenew,
      };
    } else if (provider === 'KOTAK') {
      payload = {
        ...payload,
        apiKey: kotakForm.apiKey,
        consumerSecret: kotakForm.consumerSecret,
        mobileNo: kotakForm.mobileNo,
        password: kotakForm.password,
        mpin: kotakForm.mpin,
      };
    }

    try {
      const token = localStorage.getItem('accessToken');
      const res = await axios.post(`${API_URL}/brokers`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStatusMsg({ type: 'success', text: res.data.message || 'Credentials saved successfully!' });
      if (res.data?.expiresAt) {
        setDhanForm(prev => ({ ...prev, expiresAt: res.data.expiresAt }));
      }
      fetchCredentials();
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.response?.data?.message || 'Failed to save credentials' });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectActiveProvider = async (provider) => {
    setLoading(true);
    setStatusMsg(null);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await axios.post(`${API_URL}/brokers/select-provider`, { provider }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStatusMsg({ type: 'success', text: res.data.message });
      fetchCredentials();
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.response?.data?.message || 'Failed to select provider' });
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setLoading(true);
    setStatusMsg(null);
    const provider = providers[activeTab];
    try {
      const token = localStorage.getItem('accessToken');
      const res = await axios.post(`${API_URL}/brokers/${provider}/test`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStatusMsg({ type: 'success', text: res.data.message || 'Connection successful!' });
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.response?.data?.message || 'Connection failed' });
    } finally {
      setLoading(false);
    }
  };

  const switchMode = async (mode) => {
    try {
      const token = localStorage.getItem('accessToken');
      await axios.post(`${API_URL}/brokers/mode`, { marketDataMode: mode }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMarketMode(mode);
      setStatusMsg({ type: 'success', text: `Switched to ${mode} mode` });
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Failed to switch mode' });
    }
  };

  const currentProvider = providers[activeTab];
  const currentCred = savedCredsMap[currentProvider];

  return (
    <Box sx={{ maxWidth: 1050, mx: 'auto', p: { xs: 2, md: 4 } }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a', mb: 1 }}>
          Market Data Integrations
        </Typography>
        <Typography variant="body1" sx={{ color: '#64748b' }}>
          Select and configure your live market data provider (Dhan API or Kotak Neo API). Credentials are saved permanently for your institute.
        </Typography>
      </Box>

      {statusMsg && (
        <Alert severity={statusMsg.type} sx={{ mb: 4, borderRadius: 2 }}>
          {statusMsg.text}
        </Alert>
      )}

      <Grid container spacing={4}>
        {/* Left Column: Provider Selection & Data Mode */}
        <Grid item xs={12} md={5}>
          {/* Live Feed Health & Multi-Tenant Status */}
          <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none', mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <LiveIcon sx={{ color: feedStatus?.status === 'ACTIVE' ? '#10b981' : feedStatus?.status === 'FALLBACK_GLOBAL' ? '#f59e0b' : '#ef4444', mr: 1 }} />
                <Typography variant="h6" sx={{ fontWeight: 600, color: '#0f172a' }}>
                  Live Data Engine
                </Typography>
              </Box>
              <Chip
                size="small"
                label={
                  feedStatus?.status === 'ACTIVE'
                    ? 'Active (Institute Key)'
                    : feedStatus?.status === 'FALLBACK_GLOBAL'
                    ? 'Global Fallback'
                    : feedStatus?.status === 'STOPPED'
                    ? 'Market Data Stopped'
                    : feedStatus?.status || 'Connecting'
                }
                color={
                  feedStatus?.status === 'ACTIVE'
                    ? 'success'
                    : feedStatus?.status === 'FALLBACK_GLOBAL'
                    ? 'warning'
                    : 'error'
                }
                sx={{ fontWeight: 700 }}
              />
            </Box>

            <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>
              {feedStatus?.status === 'ACTIVE'
                ? 'Your institute is running its own dedicated broker data loop. Real-time quotes are streamed directly to your students.'
                : feedStatus?.status === 'FALLBACK_GLOBAL'
                ? 'Institute API key unavailable or failed. System has automatically fallen back to the Global Admin API key.'
                : feedStatus?.status === 'STOPPED'
                ? 'Market data is stopped because both your institute API key and global fallback key failed or are expired.'
                : 'Market data feed initializing...'}
            </Typography>

            <Box sx={{ bgcolor: '#f8fafc', p: 1.5, borderRadius: 2, mb: 2, border: '1px solid #e2e8f0' }}>
              <Typography variant="caption" sx={{ color: '#475569', display: 'block', fontWeight: 600, mb: 0.5 }}>
                • Universes: NIFTY 50 + Full MCX Commodities Universe + Indices
              </Typography>
              <Typography variant="caption" sx={{ color: '#475569', display: 'block' }}>
                • Active Symbols: {feedStatus?.symbolCount || 'All Equities & MCX'}
              </Typography>
              {feedStatus?.lastUpdated && (
                <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mt: 0.5 }}>
                  • Last Tick: {new Date(feedStatus.lastUpdated).toLocaleTimeString()}
                </Typography>
              )}
              {feedStatus?.lastError && feedStatus?.status !== 'ACTIVE' && (
                <Typography variant="caption" sx={{ color: '#dc2626', display: 'block', mt: 0.5, fontWeight: 500 }}>
                  • Notice: {feedStatus.lastError}
                </Typography>
              )}
            </Box>

            <Button
              fullWidth
              variant="outlined"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={handleRestartFeed}
              disabled={restartingFeed}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              {restartingFeed ? 'Restarting Feed...' : 'Restart Data Feed'}
            </Button>
          </Paper>

          {/* Active Provider Selector */}
          <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none', mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <ApiIcon sx={{ color: '#3b82f6', mr: 1.5 }} />
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#0f172a' }}>
                Active Market Provider
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: '#64748b', mb: 3 }}>
              Select which broker API supplies real-time market quotes and option chains:
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {['DHAN', 'KOTAK'].map(prov => {
                const isActive = savedCredsMap[prov]?.isActiveProvider;
                const isConfigured = Boolean(savedCredsMap[prov]);
                return (
                  <Card 
                    key={prov}
                    variant="outlined" 
                    sx={{ 
                      borderRadius: 2, 
                      borderColor: isActive ? '#3b82f6' : '#e2e8f0',
                      bgcolor: isActive ? '#eff6ff' : 'transparent',
                      transition: 'all 0.2s'
                    }}
                  >
                    <CardActionArea 
                      onClick={() => isConfigured && handleSelectActiveProvider(prov)}
                      sx={{ p: 2 }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: isActive ? '#1e40af' : '#334155' }}>
                            {prov === 'DHAN' ? 'Dhan API' : 'Kotak Neo API'}
                          </Typography>
                        </Box>
                        {isActive ? (
                          <Chip size="small" icon={<CheckIcon fontSize="small" />} label="Active" color="primary" sx={{ fontWeight: 700 }} />
                        ) : isConfigured ? (
                          <Chip size="small" label="Saved" color="default" variant="outlined" />
                        ) : (
                          <Chip size="small" label="Not Configured" color="default" sx={{ bgcolor: '#f1f5f9' }} />
                        )}
                      </Box>
                    </CardActionArea>
                  </Card>
                );
              })}
            </Box>
          </Paper>

          {/* Active Data Mode */}
          <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <SecurityIcon sx={{ color: '#10b981', mr: 1.5 }} />
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#0f172a' }}>
                Trading Environment Mode
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Card 
                variant="outlined" 
                sx={{ 
                  borderRadius: 2, 
                  borderColor: marketMode === 'LIVE_BROKER' ? '#10b981' : '#e2e8f0',
                  bgcolor: marketMode === 'LIVE_BROKER' ? '#ecfdf5' : 'transparent',
                }}
              >
                <CardActionArea onClick={() => switchMode('LIVE_BROKER')} sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, color: marketMode === 'LIVE_BROKER' ? '#065f46' : '#334155' }}>
                      Live Broker Feed
                    </Typography>
                    {marketMode === 'LIVE_BROKER' && <Chip size="small" label="Active" color="success" />}
                  </Box>
                  <Typography variant="body2" sx={{ color: '#64748b' }}>
                    Pushes real-time stock and option prices from your active broker.
                  </Typography>
                </CardActionArea>
              </Card>
            </Box>
          </Paper>
        </Grid>

        {/* Right Column: Credentials Form */}
        <Grid item xs={12} md={7}>
          <Paper sx={{ borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none', overflow: 'hidden' }}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: '#f8fafc' }}>
              <Tabs 
                value={activeTab} 
                onChange={handleTabChange} 
                variant="fullWidth"
                sx={{
                  '& .MuiTab-root': { py: 2, fontWeight: 700, color: '#64748b' },
                  '& .Mui-selected': { color: '#2563eb' }
                }}
              >
                {providers.map((p) => (
                  <Tab key={p} label={`${p} API`} />
                ))}
              </Tabs>
            </Box>

            <Box component="form" onSubmit={handleSave} sx={{ p: { xs: 2.5, md: 4 } }}>
              {currentProvider === 'DHAN' ? (
                <Box>
                  {/* Header */}
                  <Box sx={{ mb: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5, flexWrap: 'wrap', gap: 1 }}>
                      <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center' }}>
                        <ApiIcon sx={{ mr: 1.5, color: '#2563eb', fontSize: 30 }} />
                        DhanHQ Market Data
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Chip size="small" label="Market Data Only (No Trading)" sx={{ bgcolor: '#e0f2fe', color: '#0369a1', fontWeight: 700 }} />
                        {currentCred?.isActiveProvider && (
                          <Chip size="small" label="Active Provider" color="primary" sx={{ fontWeight: 700 }} />
                        )}
                      </Box>
                    </Box>
                    <Typography variant="body2" sx={{ color: '#64748b' }}>
                      Automated 24-hour token generation & high-frequency market data streaming
                    </Typography>
                  </Box>

                  {/* Active Status & Lifecycle Health Box */}
                  {(() => {
                    const expiryInfo = getDhanExpiryInfo();
                    const hasActive = expiryInfo && expiryInfo.valid;
                    return (
                      <Paper
                        variant="outlined"
                        sx={{
                          mb: 3,
                          p: 2.5,
                          borderRadius: 2.5,
                          borderColor: hasActive ? '#10b981' : '#f59e0b',
                          bgcolor: hasActive ? '#f0fdf4' : '#fffbeb',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                          {hasActive ? (
                            <CheckCircleIcon sx={{ color: '#10b981', mt: 0.2, fontSize: 26 }} />
                          ) : (
                            <WarningIcon sx={{ color: '#f59e0b', mt: 0.2, fontSize: 26 }} />
                          )}
                          <Box sx={{ flexGrow: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                              <Typography variant="subtitle1" sx={{ color: hasActive ? '#065f46' : '#92400e', fontWeight: 700 }}>
                                {hasActive ? 'Dhan Market Data Token is Active' : 'Token Expired or Not Generated'}
                              </Typography>
                              {hasActive && (
                                <Chip
                                  size="small"
                                  label={`Valid — ${expiryInfo.hoursLeft}h left`}
                                  sx={{ bgcolor: '#d1fae5', color: '#065f46', fontWeight: 700, fontSize: '0.75rem' }}
                                />
                              )}
                            </Box>

                            {hasActive && (
                              <Typography variant="body2" sx={{ color: '#047857', fontSize: '0.85rem', mb: 0.5 }}>
                                • Expiry: <strong>{expiryInfo.formatted}</strong>
                              </Typography>
                            )}

                            <Typography variant="body2" sx={{ color: hasActive ? '#047857' : '#b45309', fontSize: '0.85rem' }}>
                              • Auto-Renew Engine: <strong>{dhanForm.autoRenew ? 'Active (Cron: 07:00 AM IST daily)' : 'Disabled'}</strong>
                            </Typography>

                            {dhanForm.lastAutoRenewAt && (
                              <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mt: 0.5 }}>
                                Last Token Update: {new Date(dhanForm.lastAutoRenewAt).toLocaleString('en-IN')} — Status: {dhanForm.lastAutoRenewStatus || 'OK'}
                              </Typography>
                            )}
                            {dhanForm.lastAutoRenewError && !hasActive && (
                              <Typography variant="caption" sx={{ color: '#dc2626', display: 'block', mt: 0.5, fontWeight: 600 }}>
                                Warning: {dhanForm.lastAutoRenewError}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      </Paper>
                    );
                  })()}

                  {/* Automated TOTP Setup Card */}
                  <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2.5, mb: 3, bgcolor: '#f8fafc', borderColor: '#e2e8f0' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
                      <FlashOnIcon sx={{ color: '#2563eb', mr: 1 }} />
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#0f172a' }}>
                        Automated Token Setup (TOTP RFC 6238)
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ color: '#64748b', mb: 2.5 }}>
                      DhanHQ tokens expire in 24 hours. Enter your Dhan Client ID, Account PIN, and Authenticator TOTP Secret key below. Our background cron regenerates and caches a fresh 24h token every morning at 7:00 AM IST automatically.
                    </Typography>

                    <Grid container spacing={2} sx={{ mb: 2 }}>
                      <Grid item xs={12} sm={4}>
                        <TextField
                          label="Dhan Client ID"
                          variant="outlined"
                          fullWidth
                          required
                          value={dhanForm.apiKey}
                          onChange={(e) => setDhanForm({ ...dhanForm, apiKey: e.target.value })}
                          placeholder="e.g. 1100345678"
                          InputLabelProps={{ shrink: true }}
                        />
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <TextField
                          label="Account PIN (6 Digits)"
                          type="password"
                          variant="outlined"
                          fullWidth
                          value={dhanForm.pin}
                          onChange={(e) => setDhanForm({ ...dhanForm, pin: e.target.value })}
                          placeholder={dhanForm.hasPin ? '•••••• (Saved)' : 'Enter 6-digit PIN'}
                          InputLabelProps={{ shrink: true }}
                          helperText={dhanForm.hasPin ? 'Saved encrypted in DB' : 'Numeric login PIN'}
                        />
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <TextField
                          label="TOTP Secret Key"
                          type="password"
                          variant="outlined"
                          fullWidth
                          value={dhanForm.totpSecret}
                          onChange={(e) => setDhanForm({ ...dhanForm, totpSecret: e.target.value })}
                          placeholder={dhanForm.hasTotpSecret ? '•••••••••••••••• (Saved)' : 'Base32 secret'}
                          InputLabelProps={{ shrink: true }}
                          helperText={dhanForm.hasTotpSecret ? 'Saved encrypted in DB' : 'From Dhan 2FA Authenticator'}
                        />
                      </Grid>
                    </Grid>

                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, pt: 1 }}>
                      <FormControlLabel
                        control={
                          <Switch 
                            checked={Boolean(dhanForm.autoRenew)} 
                            onChange={(e) => setDhanForm({ ...dhanForm, autoRenew: e.target.checked })} 
                            color="primary"
                          />
                        }
                        label={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <ScheduleIcon sx={{ fontSize: 18, color: '#2563eb' }} />
                            <Typography variant="body2" sx={{ fontWeight: 600, color: '#334155' }}>
                              Auto-Renew Daily at 7:00 AM IST
                            </Typography>
                          </Box>
                        }
                      />

                      <Button
                        variant="contained"
                        color="secondary"
                        onClick={handleGenerateDhanToken}
                        disabled={generatingToken || !dhanForm.apiKey}
                        startIcon={generatingToken ? <CircularProgress size={16} color="inherit" /> : <FlashOnIcon />}
                        sx={{
                          textTransform: 'none',
                          fontWeight: 700,
                          bgcolor: '#8b5cf6',
                          '&:hover': { bgcolor: '#7c3aed' },
                          px: 2.5,
                          borderRadius: 2,
                        }}
                      >
                        {generatingToken ? 'Generating Token...' : 'Generate Token with TOTP Now'}
                      </Button>
                    </Box>
                  </Paper>

                  {/* Manual Access Token Override (Optional) */}
                  <Accordion variant="outlined" sx={{ mb: 3, borderRadius: '10px !important', '&:before': { display: 'none' } }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <KeyIcon sx={{ fontSize: 20, color: '#64748b' }} />
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#475569' }}>
                          Manual Access Token (Optional Direct Override)
                        </Typography>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Typography variant="body2" sx={{ color: '#64748b', mb: 1.5 }}>
                        If you prefer to manually paste a 24-hour web token from DhanHQ Developers portal:
                      </Typography>
                      <TextField
                        label="Manual Access Token"
                        variant="outlined"
                        fullWidth
                        multiline
                        rows={3}
                        value={dhanForm.accessToken}
                        onChange={(e) => {
                          const val = e.target.value;
                          let autoClientId = dhanForm.apiKey;
                          try {
                            const parts = val.split('.');
                            if (parts.length >= 2) {
                              const decoded = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                              if (decoded.dhanClientId) {
                                autoClientId = String(decoded.dhanClientId);
                              }
                            }
                          } catch (err) {}
                          setDhanForm({ ...dhanForm, accessToken: val, apiKey: autoClientId });
                        }}
                        placeholder="Paste eyJ... token here"
                        InputLabelProps={{ shrink: true }}
                        InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.85rem' } }}
                      />
                    </AccordionDetails>
                  </Accordion>

                  <FormControlLabel
                    control={
                      <Switch 
                        checked={setAsActive} 
                        onChange={(e) => setSetAsActive(e.target.checked)} 
                        color="primary"
                      />
                    }
                    label="Set Dhan as active market data provider for this institute"
                    sx={{ mb: 3, display: 'block' }}
                  />

                  <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                    <Button 
                      type="submit" 
                      variant="contained" 
                      fullWidth
                      size="large"
                      disabled={loading || generatingToken}
                      sx={{ 
                        py: 1.5, 
                        fontWeight: 700, 
                        bgcolor: '#2563eb', 
                        '&:hover': { bgcolor: '#1d4ed8' },
                        boxShadow: 'none',
                        borderRadius: 2,
                        textTransform: 'none',
                        fontSize: '1rem',
                      }}
                    >
                      {loading ? 'Saving...' : 'Save Credentials'}
                    </Button>
                    <Button 
                      variant="outlined" 
                      color="inherit" 
                      onClick={handleTestConnection}
                      disabled={loading || generatingToken}
                      sx={{ color: '#475569', borderColor: '#cbd5e1', textTransform: 'none', fontWeight: 600, px: 3, borderRadius: 2 }}
                    >
                      Test Connection
                    </Button>
                  </Box>

                  <Divider sx={{ my: 3 }} />

                  {/* Tip Box */}
                  <Box sx={{ p: 2.5, bgcolor: '#eff6ff', borderRadius: 2, border: '1px solid #bfdbfe' }}>
                    <Typography variant="subtitle2" sx={{ color: '#1e40af', fontWeight: 700, mb: 1 }}>
                      Tip — skip copy-paste entirely:
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#1e3a8a', mb: 1 }}>
                      Set Postback URL in your Dhan app to:
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: '#dbeafe', p: 1, borderRadius: 1.5, mb: 1.5, border: '1px solid #bfdbfe' }}>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#1d4ed8', fontWeight: 600, flexGrow: 1, wordBreak: 'break-all', fontSize: '0.825rem' }}>
                        https://your-server.com/dhan/token-postback
                      </Typography>
                      <Tooltip title={copiedPostback ? "Copied!" : "Copy Postback URL"}>
                        <IconButton 
                          size="small" 
                          onClick={() => {
                            navigator.clipboard.writeText('https://your-server.com/dhan/token-postback');
                            setCopiedPostback(true);
                            setTimeout(() => setCopiedPostback(false), 2000);
                          }}
                          sx={{ color: '#1d4ed8' }}
                        >
                          {copiedPostback ? <CheckCircleIcon fontSize="small" color="success" /> : <CopyIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </Box>
                    <Typography variant="body2" sx={{ color: '#1e3a8a', fontSize: '0.85rem' }}>
                      Then just click "Generate Token" — Dhan sends it here automatically.
                    </Typography>
                  </Box>
                </Box>
              ) : (
                /* Kotak Neo Form */
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#0f172a' }}>
                      Kotak Neo API Credentials
                    </Typography>
                    {currentCred?.isActiveProvider && (
                      <Chip size="small" label="Active Provider" color="primary" sx={{ fontWeight: 700 }} />
                    )}
                  </Box>

                  <TextField
                    label="Consumer Key (API Key)"
                    variant="outlined"
                    fullWidth
                    required
                    value={kotakForm.apiKey}
                    onChange={(e) => setKotakForm({ ...kotakForm, apiKey: e.target.value })}
                    sx={{ mb: 2.5 }}
                    placeholder="Kotak Neo Consumer Key"
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    label="Consumer Secret"
                    variant="outlined"
                    fullWidth
                    required
                    type="password"
                    value={kotakForm.consumerSecret}
                    onChange={(e) => setKotakForm({ ...kotakForm, consumerSecret: e.target.value })}
                    sx={{ mb: 2.5 }}
                    placeholder="Kotak Neo Consumer Secret"
                    InputLabelProps={{ shrink: true }}
                  />
                  <Grid container spacing={2} sx={{ mb: 2.5 }}>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        label="Registered Mobile No"
                        variant="outlined"
                        fullWidth
                        required
                        value={kotakForm.mobileNo}
                        onChange={(e) => setKotakForm({ ...kotakForm, mobileNo: e.target.value })}
                        placeholder="e.g. 9876543210"
                        InputLabelProps={{ shrink: true }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        label="MPIN"
                        variant="outlined"
                        fullWidth
                        type="password"
                        value={kotakForm.mpin}
                        onChange={(e) => setKotakForm({ ...kotakForm, mpin: e.target.value })}
                        placeholder="4-digit MPIN"
                        InputLabelProps={{ shrink: true }}
                      />
                    </Grid>
                  </Grid>
                  <TextField
                    label="Password"
                    variant="outlined"
                    fullWidth
                    required
                    type="password"
                    value={kotakForm.password}
                    onChange={(e) => setKotakForm({ ...kotakForm, password: e.target.value })}
                    sx={{ mb: 2 }}
                    placeholder="Kotak Account Password"
                    InputLabelProps={{ shrink: true }}
                  />

                  <FormControlLabel
                    control={
                      <Switch 
                        checked={setAsActive} 
                        onChange={(e) => setSetAsActive(e.target.checked)} 
                        color="primary"
                      />
                    }
                    label="Set as active market data provider for my institute"
                    sx={{ mb: 3, display: 'block' }}
                  />

                  <Divider sx={{ mb: 3 }} />

                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                    <Button 
                      variant="outlined" 
                      color="inherit" 
                      onClick={handleTestConnection}
                      disabled={loading}
                      sx={{ color: '#475569', borderColor: '#cbd5e1', textTransform: 'none', fontWeight: 600 }}
                    >
                      Test Connection
                    </Button>
                    <Button 
                      type="submit" 
                      variant="contained" 
                      disabled={loading}
                      sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' }, textTransform: 'none', fontWeight: 700, px: 3 }}
                    >
                      {loading ? 'Saving...' : 'Save & Activate'}
                    </Button>
                  </Box>
                </Box>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default IntegrationSettings;
