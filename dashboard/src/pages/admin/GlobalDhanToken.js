import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext, API_URL } from '../../context/AuthContext';
import { 
  Box, Typography, Paper, TextField, Button, Alert, Divider, Link
} from '@mui/material';
import { Api as ApiIcon, CheckCircle as CheckCircleIcon } from '@mui/icons-material';

const GlobalDhanToken = () => {
  const { user } = useContext(AuthContext);
  const [credentials, setCredentials] = useState({
    provider: 'DHAN',
    apiKey: '',
    accessToken: '',
    expiresAt: null,
  });
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  useEffect(() => {
    fetchCredentials();
  }, []);

  const fetchCredentials = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await axios.get(`${API_URL}/brokers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data && res.data.length > 0) {
        const dhanCred = res.data.find((c) => c.provider === 'DHAN') || res.data[0];
        setCredentials({
          provider: dhanCred.provider,
          apiKey: dhanCred.apiKey,
          accessToken: '********', // Masked from backend
          expiresAt: dhanCred.expiresAt || null,
        });
      }
    } catch (err) {
      console.error('Failed to fetch credentials', err);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg(null);
    try {
      const token = localStorage.getItem('accessToken');
      
      // Assume token is valid for 24 hours from now
      const newExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      
      await axios.post(`${API_URL}/brokers`, { ...credentials, expiresAt: newExpiresAt }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCredentials(prev => ({ ...prev, expiresAt: newExpiresAt }));
      setStatusMsg({ type: 'success', text: 'Credentials saved successfully!' });
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.response?.data?.message || 'Failed to save credentials' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: { xs: 2, md: 4 } }}>
      <Paper sx={{ p: 4, borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}>
        
        {statusMsg && (
          <Alert severity={statusMsg.type} sx={{ mb: 4, borderRadius: 2 }}>
            {statusMsg.text}
          </Alert>
        )}

        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a', mb: 1, display: 'flex', alignItems: 'center' }}>
            <ApiIcon sx={{ mr: 1.5, color: '#3b82f6', fontSize: 32 }} />
            Global Dhan Token
          </Typography>
          <Typography variant="body1" sx={{ color: '#64748b' }}>
            Update the Super Admin API access token for Dhan. This acts as a global fallback for all institutes during live mode.
          </Typography>
        </Box>

        {credentials.accessToken && credentials.accessToken !== '' && (
          <Box sx={{ mb: 4, p: 2, bgcolor: '#ecfdf5', borderRadius: 2, border: '1px solid #10b981', display: 'flex', alignItems: 'flex-start' }}>
            <CheckCircleIcon sx={{ color: '#10b981', mr: 2, mt: 0.5 }} />
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                <Typography variant="subtitle2" sx={{ color: '#065f46', fontWeight: 600, mr: 1 }}>
                  Token is Active
                </Typography>
                {credentials.expiresAt && (
                  <Box sx={{ bgcolor: '#d1fae5', color: '#065f46', px: 1, py: 0.25, borderRadius: 1, fontSize: '0.75rem', fontWeight: 600 }}>
                    Valid — {Math.max(0, Math.round((new Date(credentials.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60)))}h left
                  </Box>
                )}
              </Box>
              <Typography variant="body2" sx={{ color: '#047857' }}>
                {credentials.expiresAt 
                  ? `Expires: ${new Date(credentials.expiresAt).toLocaleString('en-IN')}`
                  : 'Valid for the current session. Expires at end of day.'}
              </Typography>
            </Box>
          </Box>
        )}

        <Box sx={{ mb: 4, bgcolor: '#f8fafc', p: 3, borderRadius: 2, border: '1px solid #e2e8f0' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#334155', mb: 2 }}>
            Instructions:
          </Typography>
          <Box component="ol" sx={{ m: 0, pl: 2, '& li': { mb: 1, color: '#475569', fontSize: '0.875rem' } }}>
            <li>
              Go to <Link href="https://dhanhq.co/developers" target="_blank" rel="noreferrer" sx={{ color: '#2563eb', fontWeight: 500 }}>dhanhq.co/developers</Link>
            </li>
            <li>
              Click your app &rarr; <strong>Generate Token</strong> (enter OTP)
            </li>
            <li>Copy the access token and paste it below.</li>
          </Box>
        </Box>

        <Box component="form" onSubmit={handleSave}>
          <TextField
            label="Client ID"
            variant="outlined"
            fullWidth
            required
            value={credentials.apiKey}
            onChange={(e) => setCredentials({ ...credentials, apiKey: e.target.value })}
            sx={{ mb: 3 }}
            InputLabelProps={{ shrink: true }}
            placeholder="e.g. 1112426535"
          />

          <TextField
            label="New Access Token"
            variant="outlined"
            fullWidth
            required
            multiline
            rows={4}
            value={credentials.accessToken}
            onChange={(e) => setCredentials({ ...credentials, accessToken: e.target.value })}
            sx={{ mb: 4 }}
            InputLabelProps={{ shrink: true }}
            placeholder="Paste eyJ... token here"
            InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.875rem' } }}
          />

          <Button 
            type="submit" 
            variant="contained" 
            fullWidth
            size="large"
            disabled={loading}
            sx={{ 
              py: 1.5, 
              fontWeight: 600, 
              bgcolor: '#2563eb', 
              '&:hover': { bgcolor: '#1d4ed8' },
              boxShadow: 'none',
              borderRadius: 2
            }}
          >
            {loading ? 'Saving...' : 'Save Token'}
          </Button>
        </Box>

        <Divider sx={{ my: 4 }} />

        <Box sx={{ p: 3, bgcolor: '#eff6ff', borderRadius: 2, border: '1px solid #bfdbfe' }}>
          <Typography variant="subtitle2" sx={{ color: '#1e40af', fontWeight: 700, mb: 1 }}>
            Tip — skip copy-paste entirely:
          </Typography>
          <Typography variant="body2" sx={{ color: '#1e3a8a', mb: 1 }}>
            Set Postback URL in your Dhan app to:
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', bgcolor: '#dbeafe', p: 1, borderRadius: 1, color: '#1d4ed8', mb: 2, display: 'inline-block' }}>
            https://your-server.com/dhan/token-postback
          </Typography>
          <Typography variant="body2" sx={{ color: '#1e3a8a' }}>
            Then just click "Generate Token" — Dhan sends it here automatically.
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
};

export default GlobalDhanToken;
