import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableHead, TableRow,
  TableContainer, Chip, CircularProgress, Paper,
} from '@mui/material';
import {
  Business as InstIcon,
  People as PeopleIcon,
  ShowChart as TradeIcon,
  TrendingUp as TrendIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { API_URL } from '../../context/AuthContext';

// ── Stat Card ──────────────────────────────────────────────────────────────
const StatCard = ({ label, value, icon, color, loading }) => (
  <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid #e2e8f0', height: '100%' }}>
    <CardContent sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography sx={{ color: '#64748b', fontSize: 13, fontWeight: 600 }}>{label}</Typography>
        <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {React.cloneElement(icon, { sx: { color, fontSize: 22 } })}
        </Box>
      </Box>
      {loading ? (
        <CircularProgress size={24} sx={{ color }} />
      ) : (
        <Typography sx={{ fontSize: 32, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
          {value?.toLocaleString() ?? '—'}
        </Typography>
      )}
    </CardContent>
  </Card>
);

// ── Main Page ──────────────────────────────────────────────────────────────
const SuperAdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/super-admin/stats`);
      setStats(res.data);
    } catch (err) {
      console.error('[SuperAdminDashboard] stats fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const statCards = [
    { label: 'Total Institutes', value: stats?.institutes, icon: <InstIcon />, color: '#6366f1' },
    { label: 'Total Students',   value: stats?.students,   icon: <PeopleIcon />, color: '#0ea5e9' },
    { label: 'Total Trades',     value: stats?.trades,     icon: <TradeIcon />, color: '#10b981' },
  ];

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a', mb: 0.5 }}>
          Platform Overview
        </Typography>
        <Typography sx={{ color: '#64748b', fontSize: 14 }}>
          Real-time stats across all institutes on TradeLab
        </Typography>
      </Box>

      {/* Stat Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {statCards.map((card) => (
          <Grid item xs={12} md={4} key={card.label}>
            <StatCard {...card} loading={loading} />
          </Grid>
        ))}
      </Grid>

      {/* Recent Institutes */}
      <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid #e2e8f0' }}>
        <Box sx={{ p: 3, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>
            Recent Institutes
          </Typography>
          <TrendIcon sx={{ color: '#6366f1' }} />
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                <TableCell sx={{ fontWeight: 600, color: '#64748b', fontSize: 12 }}>NAME</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#64748b', fontSize: 12 }}>CODE</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#64748b', fontSize: 12 }}>ADMIN EMAIL</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#64748b', fontSize: 12 }}>STATUS</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} sx={{ textAlign: 'center', py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : stats?.recentInstitutes?.length > 0 ? (
                stats.recentInstitutes.map((inst) => (
                  <TableRow key={inst._id} hover>
                    <TableCell sx={{ fontWeight: 600, color: '#0f172a' }}>{inst.name}</TableCell>
                    <TableCell>
                      <Chip label={inst.code} size="small" sx={{ fontFamily: 'monospace', bgcolor: '#f1f5f9', color: '#475569' }} />
                    </TableCell>
                    <TableCell sx={{ color: '#64748b' }}>{inst.ownerId?.email || '—'}</TableCell>
                    <TableCell>
                      <Chip
                        label={inst.status}
                        size="small"
                        sx={{
                          bgcolor: inst.status === 'ACTIVE' ? '#dcfce7' : '#fee2e2',
                          color: inst.status === 'ACTIVE' ? '#16a34a' : '#dc2626',
                          fontWeight: 600, fontSize: 11,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} sx={{ textAlign: 'center', py: 4, color: '#94a3b8' }}>
                    No institutes yet. Create one from the Institutes page.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Box>
  );
};

export default SuperAdminDashboard;
