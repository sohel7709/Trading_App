import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Grid, Card, CardContent,
  Button, CircularProgress,
} from '@mui/material';
import {
  People as PeopleIcon,
  School as StudentIcon,
  LayersOutlined as BatchIcon,
  ArrowForward as ArrowIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../../context/AuthContext';

const StatCard = ({ label, value, icon, color, path, loading, navigate }) => (
  <Card
    elevation={0}
    onClick={() => path && navigate(path)}
    sx={{
      borderRadius: 3, border: '1px solid #e2e8f0', cursor: path ? 'pointer' : 'default',
      transition: 'box-shadow 0.2s, transform 0.2s',
      '&:hover': path ? { boxShadow: '0 8px 25px rgba(0,0,0,0.08)', transform: 'translateY(-2px)' } : {},
    }}
  >
    <CardContent sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ width: 44, height: 44, borderRadius: 2, bgcolor: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {React.cloneElement(icon, { sx: { color, fontSize: 24 } })}
        </Box>
        {path && <ArrowIcon sx={{ color: '#cbd5e1', fontSize: 18 }} />}
      </Box>
      {loading ? (
        <CircularProgress size={22} sx={{ color }} />
      ) : (
        <Typography sx={{ fontSize: 36, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
          {value ?? '—'}
        </Typography>
      )}
      <Typography sx={{ color: '#64748b', fontSize: 14, fontWeight: 500, mt: 0.5 }}>{label}</Typography>
    </CardContent>
  </Card>
);

const InstituteAdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/institutes/stats`);
      setStats(res.data);
    } catch (err) {
      console.error('[InstituteAdminDashboard] stats error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const cards = [
    { label: 'Total Students',    value: stats?.students,    icon: <StudentIcon />, color: '#0ea5e9', path: '/institute/students' },
    { label: 'Total Batches',     value: stats?.batches,     icon: <BatchIcon />,   color: '#10b981', path: '/institute/batches' },
    { label: 'Total Instructors', value: stats?.instructors, icon: <PeopleIcon />,  color: '#8b5cf6', path: '/institute/instructors' },
  ];

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a', mb: 0.5 }}>
          Institute Dashboard
        </Typography>
        <Typography sx={{ color: '#64748b', fontSize: 14 }}>
          Manage your instructors, students, and batches
        </Typography>
      </Box>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        {cards.map((card) => (
          <Grid item xs={12} md={4} key={card.label}>
            <StatCard {...card} loading={loading} navigate={navigate} />
          </Grid>
        ))}
      </Grid>

      {/* Quick Actions */}
      <Box sx={{ p: 3, borderRadius: 3, border: '1px solid #e2e8f0', bgcolor: 'white' }}>
        <Typography sx={{ fontWeight: 700, fontSize: 15, color: '#0f172a', mb: 2 }}>Quick Actions</Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Button
            id="add-instructor-btn"
            variant="outlined"
            startIcon={<PeopleIcon />}
            onClick={() => navigate('/institute/instructors')}
            sx={{ borderRadius: 2, borderColor: '#e2e8f0', color: '#475569', fontWeight: 600, '&:hover': { borderColor: '#8b5cf6', color: '#8b5cf6' } }}
          >
            Add Instructor
          </Button>
          <Button
            id="add-student-btn"
            variant="outlined"
            startIcon={<StudentIcon />}
            onClick={() => navigate('/institute/students')}
            sx={{ borderRadius: 2, borderColor: '#e2e8f0', color: '#475569', fontWeight: 600, '&:hover': { borderColor: '#0ea5e9', color: '#0ea5e9' } }}
          >
            Add Student
          </Button>
          <Button
            id="manage-batches-btn"
            variant="outlined"
            startIcon={<BatchIcon />}
            onClick={() => navigate('/institute/batches')}
            sx={{ borderRadius: 2, borderColor: '#e2e8f0', color: '#475569', fontWeight: 600, '&:hover': { borderColor: '#10b981', color: '#10b981' } }}
          >
            Manage Batches
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default InstituteAdminDashboard;
