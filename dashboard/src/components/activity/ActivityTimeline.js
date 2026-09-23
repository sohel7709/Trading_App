import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Chip, Skeleton, Alert, IconButton, Tooltip
} from '@mui/material';
import {
  AccountBalanceWallet as CapitalIcon,
  SwapHoriz as TradeIcon,
  WarningAmber as RiskIcon,
  Refresh as RefreshIcon,
  CheckCircle as SuccessIcon,
  History as HistoryIcon
} from '@mui/icons-material';
import axios from 'axios';
import { API_URL } from '../../context/AuthContext';

const getAuthHeaders = () => {
  const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
};

export const ActivityTimeline = ({ studentId, activities: directActivities }) => {
  const [activities, setActivities] = useState(directActivities || []);
  const [loading, setLoading] = useState(!directActivities);
  const [error, setError] = useState('');

  const fetchActivities = () => {
    if (directActivities) {
      setActivities(directActivities);
      setLoading(false);
      return;
    }
    if (!studentId) return;

    setLoading(true);
    setError('');
    axios.get(`${API_URL}/student/${studentId}/activity`, getAuthHeaders())
      .then(res => {
        setActivities(Array.isArray(res.data) ? res.data : []);
      })
      .catch(err => {
        console.error('Failed to load student activity:', err);
        setError(err.response?.data?.message || 'Failed to load activity log');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchActivities();
  }, [studentId, directActivities]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2 }}>
        <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 2 }} />
        <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 2 }} />
        <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>;
  }

  if (!activities || activities.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: 'center', bgcolor: '#f8fafc', borderRadius: 2.5, border: '1px dashed #cbd5e1' }}>
        <HistoryIcon sx={{ fontSize: 36, color: '#94a3b8', mb: 1 }} />
        <Typography sx={{ color: '#64748b', fontSize: 13, fontWeight: 500 }}>
          No audit activity recorded yet.
        </Typography>
        <Typography sx={{ color: '#94a3b8', fontSize: 12, mt: 0.5 }}>
          Capital allocations, orders, and risk alerts will appear here in chronological order.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
          Audit Trail ({activities.length} Events)
        </Typography>
        <Tooltip title="Refresh log">
          <IconButton size="small" onClick={fetchActivities} sx={{ color: '#64748b' }}>
            <RefreshIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: 380, overflowY: 'auto', pr: 0.5 }}>
        {activities.map((item, idx) => {
          const isCapital = item.type === 'CAPITAL';
          const isTrade = item.type === 'TRADE';
          const isRisk = item.type === 'RISK';

          let iconBg = '#f1f5f9';
          let iconColor = '#64748b';
          let iconNode = <HistoryIcon sx={{ fontSize: 18 }} />;

          if (isCapital) {
            iconBg = '#ecfdf5';
            iconColor = '#10b981';
            iconNode = <CapitalIcon sx={{ fontSize: 18 }} />;
          } else if (isTrade) {
            iconBg = '#eff6ff';
            iconColor = '#3b82f6';
            iconNode = <TradeIcon sx={{ fontSize: 18 }} />;
          } else if (isRisk) {
            iconBg = '#fef2f2';
            iconColor = '#ef4444';
            iconNode = <RiskIcon sx={{ fontSize: 18 }} />;
          }

          const formattedTime = item.timestamp
            ? new Date(item.timestamp).toLocaleString('en-IN', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })
            : item.time || '';

          return (
            <Box
              key={item.id || item._id || idx}
              sx={{
                p: 1.5,
                borderRadius: 2,
                bgcolor: '#ffffff',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1.5,
                transition: 'all 0.15s ease',
                '&:hover': {
                  bgcolor: '#f8fafc',
                  borderColor: '#cbd5e1',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                }
              }}
            >
              {/* Event Icon Badge */}
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 2,
                  bgcolor: iconBg,
                  color: iconColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  mt: 0.2
                }}
              >
                {iconNode}
              </Box>

              {/* Event Details */}
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.3 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                    {item.title}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
                    {formattedTime}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: 12, color: '#475569', lineHeight: 1.4 }}>
                  {item.message}
                </Typography>
                {item.amount && (
                  <Typography sx={{ fontSize: 12, fontWeight: 600, color: isCapital ? '#10b981' : '#0f172a', mt: 0.5 }}>
                    Value: ₹{Number(item.amount).toLocaleString('en-IN')}
                  </Typography>
                )}
              </Box>

              {/* Status Chip */}
              <Chip
                label={item.status || (isRisk ? 'ALERT' : 'DONE')}
                size="small"
                sx={{
                  fontSize: 10,
                  fontWeight: 700,
                  height: 20,
                  borderRadius: 1,
                  bgcolor: isRisk ? '#fef2f2' : (isCapital ? '#ecfdf5' : '#f8fafc'),
                  color: isRisk ? '#dc2626' : (isCapital ? '#059669' : '#64748b'),
                  border: `1px solid ${isRisk ? '#fecaca' : (isCapital ? '#a7f3d0' : '#e2e8f0')}`
                }}
              />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default ActivityTimeline;
