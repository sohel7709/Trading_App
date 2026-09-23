import React, { useContext } from 'react';
import { Box, Drawer, List, ListItem, ListItemIcon, ListItemText, Typography, Avatar, Chip } from '@mui/material';
import {
  Dashboard as DashIcon,
  Business as InstIcon,
  HealthAndSafety as HealthIcon,
  History as AuditIcon,
  BarChart as StatsIcon,
  AdminPanelSettings as AdminIcon,
  Tune as ControlIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';

const drawerWidth = 248;

const menuItems = [
  { text: 'Dashboard',      icon: <DashIcon />,    path: '/super-admin' },
  { text: 'Market Control', icon: <ControlIcon />, path: '/super-admin/market' },
  { text: 'Institutes',     icon: <InstIcon />,    path: '/super-admin/institutes' },
  { text: 'System Health',  icon: <HealthIcon />,  path: '/super-admin/health' },
  { text: 'Audit Logs',     icon: <AuditIcon />,   path: '/super-admin/audit-logs' },
];

const SuperAdminLayout = ({ children }) => {
  const { user, logout } = useContext(AuthContext);
  const navigate  = useNavigate();
  const location  = useLocation();

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#f1f5f9' }}>
      {/* Sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            bgcolor: '#0f172a',
            borderRight: 'none',
          },
        }}
      >
        {/* Brand */}
        <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{
            width: 36, height: 36, borderRadius: '10px',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AdminIcon sx={{ color: 'white', fontSize: 20 }} />
          </Box>
          <Box>
            <Typography sx={{ color: 'white', fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>
              TradeLab
            </Typography>
            <Chip
              label="Super Admin"
              size="small"
              sx={{ bgcolor: '#6366f1', color: 'white', fontSize: 10, height: 18, mt: 0.3 }}
            />
          </Box>
        </Box>

        <Box sx={{ px: 2, mt: 1 }}>
          <Typography sx={{ color: '#475569', fontSize: 11, fontWeight: 600, letterSpacing: 1, mb: 1, px: 1 }}>
            PLATFORM
          </Typography>
          <List disablePadding>
            {menuItems.map((item) => {
              const active = location.pathname === item.path ||
                (item.path !== '/super-admin' && location.pathname.startsWith(item.path));
              return (
                <ListItem
                  button
                  key={item.text}
                  onClick={() => navigate(item.path)}
                  sx={{
                    borderRadius: 2,
                    mb: 0.5,
                    bgcolor: active ? 'rgba(99,102,241,0.15)' : 'transparent',
                    color: active ? '#818cf8' : '#94a3b8',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.05)', color: '#e2e8f0' },
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

        {/* User Profile */}
        <Box sx={{ p: 2, m: 2, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar sx={{ width: 34, height: 34, bgcolor: '#6366f1', fontSize: 14 }}>
            {user?.name?.charAt(0) || 'S'}
          </Avatar>
          <Box sx={{ overflow: 'hidden' }}>
            <Typography sx={{ color: '#e2e8f0', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
              {user?.name || 'Super Admin'}
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
        {/* Top bar */}
        <Box sx={{ px: 4, py: 2, bgcolor: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ color: '#64748b', fontSize: 14, fontWeight: 500 }}>
            Platform Control Center
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#22c55e' }} />
            <Typography sx={{ color: '#64748b', fontSize: 13 }}>System Online</Typography>
          </Box>
        </Box>

        <Box sx={{ p: 4, flexGrow: 1, overflowY: 'auto' }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
};

export default SuperAdminLayout;
