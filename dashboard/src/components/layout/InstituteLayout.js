import React, { useContext, useState, useEffect } from 'react';
import { Box, Drawer, List, ListItem, ListItemIcon, ListItemText, Typography, Avatar, Chip } from '@mui/material';
import {
  Dashboard as DashIcon,
  People as PeopleIcon,
  School as StudentIcon,
  LayersOutlined as BatchIcon,
  BusinessCenter as InstIcon,
  VpnKey as KeyIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { AuthContext, API_URL } from '../../context/AuthContext';

const drawerWidth = 248;

const menuItems = [
  { text: 'Dashboard',   icon: <DashIcon />,    path: '/institute' },
  { text: 'Instructors', icon: <PeopleIcon />,   path: '/institute/instructors' },
  { text: 'Students',    icon: <StudentIcon />,  path: '/institute/students' },
  { text: 'Batches',     icon: <BatchIcon />,    path: '/institute/batches' },
  { text: 'Broker API',  icon: <KeyIcon />,      path: '/institute/settings' },
];

const InstituteLayout = ({ children }) => {
  const { user, logout, isImpersonating, exitImpersonation } = useContext(AuthContext);
  const navigate  = useNavigate();
  const location  = useLocation();
  const [instituteData, setInstituteData] = useState(null);

  useEffect(() => {
    if (!user?.instituteCode) {
      axios.get(`${API_URL}/institutes/stats`)
        .then(res => {
          if (res.data?.institute) {
            setInstituteData(res.data.institute);
          }
        })
        .catch(() => {});
    }
  }, [user?.instituteCode]);

  const displayedCode = user?.instituteCode || instituteData?.code || '—';
  const displayedName = instituteData?.name || '';

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#f8fafc' }}>
      {/* Sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            bgcolor: '#ffffff',
            borderRight: '1px solid #e2e8f0',
          },
        }}
      >
        {/* Brand */}
        <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{
            width: 36, height: 36, borderRadius: '10px',
            background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <InstIcon sx={{ color: 'white', fontSize: 20 }} />
          </Box>
          <Box>
            <Typography sx={{ color: '#0f172a', fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>
              TradeLab
            </Typography>
            <Chip
              label="Institute Admin"
              size="small"
              sx={{ bgcolor: '#dbeafe', color: '#1d4ed8', fontSize: 10, height: 18, mt: 0.3 }}
            />
          </Box>
        </Box>

        <Box sx={{ px: 2, mt: 1 }}>
          <Typography sx={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, letterSpacing: 1, mb: 1, px: 1 }}>
            MANAGEMENT
          </Typography>
          <List disablePadding>
            {menuItems.map((item) => {
              const active = location.pathname === item.path ||
                (item.path !== '/institute' && location.pathname.startsWith(item.path));
              return (
                <ListItem
                  button
                  key={item.text}
                  onClick={() => navigate(item.path)}
                  sx={{
                    borderRadius: 2,
                    mb: 0.5,
                    bgcolor: active ? '#eff6ff' : 'transparent',
                    color: active ? '#2563eb' : '#64748b',
                    '&:hover': { bgcolor: '#f1f5f9', color: '#0f172a' },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 38, color: 'inherit' }}>{item.icon}</ListItemIcon>
                  <ListItemText
                    primary={item.text}
                    primaryTypographyProps={{ fontSize: 14, fontWeight: active ? 600 : 500 }}
                  />
                </ListItem>
              );
            })}
          </List>
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        {/* Institute badge */}
        <Box sx={{ px: 2, mx: 2, mb: 1, py: 1.5, borderRadius: 2, bgcolor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <Typography sx={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
            Institute Code
          </Typography>
          <Typography sx={{ fontSize: 15, color: '#0f172a', fontWeight: 800, letterSpacing: 1.5, fontFamily: 'monospace' }}>
            {displayedCode}
          </Typography>
          {displayedName && (
            <Typography sx={{ fontSize: 11, color: '#64748b', mt: 0.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {displayedName}
            </Typography>
          )}
        </Box>

        {/* User Profile */}
        <Box sx={{ p: 2, m: 2, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar sx={{ width: 34, height: 34, bgcolor: '#2563eb', fontSize: 14 }}>
            {user?.name?.charAt(0) || 'A'}
          </Avatar>
          <Box sx={{ overflow: 'hidden' }}>
            <Typography sx={{ color: '#0f172a', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
              {user?.name || 'Admin'}
            </Typography>
            <Typography
              sx={{ color: '#64748b', fontSize: 12, cursor: 'pointer', '&:hover': { color: '#ef4444' } }}
              onClick={logout}
            >
              Log out
            </Typography>
          </Box>
        </Box>
      </Drawer>

      {/* Main Content */}
      <Box component="main" sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        {/* Support Impersonation Banner */}
        {isImpersonating && (
          <Box sx={{
            bgcolor: '#fef3c7',
            borderBottom: '2px solid #f59e0b',
            color: '#92400e',
            px: 4, py: 1.5,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            boxShadow: '0 2px 4px rgba(245, 158, 11, 0.1)',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography sx={{ fontSize: 18 }}>⚠️</Typography>
              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#b45309' }}>
                  SUPPORT MODE ACTIVE (IMPERSONATION)
                </Typography>
                <Typography sx={{ fontSize: 12, color: '#78350f' }}>
                  Logged in as {user?.name || 'Administrator'} at {displayedName || user?.instituteName || displayedCode}. Destructive actions are restricted.
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box
                component="button"
                onClick={async () => {
                  await exitImpersonation();
                  navigate('/super-admin/institutes');
                }}
                sx={{
                  bgcolor: '#d97706',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  px: 2.5, py: 0.8,
                  fontSize: 12, fontWeight: 700,
                  cursor: 'pointer',
                  '&:hover': { bgcolor: '#b45309' },
                  transition: 'background 0.2s',
                }}
              >
                Exit Support Mode
              </Box>
            </Box>
          </Box>
        )}

        {/* Top bar */}
        <Box sx={{ px: 4, py: 2, bgcolor: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ color: '#64748b', fontSize: 14, fontWeight: 500 }}>
            Institute Administration Panel
          </Typography>
          <Typography sx={{ color: '#0f172a', fontSize: 14, fontWeight: 600 }}>
            {user?.name}
          </Typography>
        </Box>

        <Box sx={{ p: 4, flexGrow: 1, overflowY: 'auto' }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
};

export default InstituteLayout;
