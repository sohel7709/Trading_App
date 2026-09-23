import React, { useContext } from 'react';
import { Box, Drawer, List, ListItem, ListItemIcon, ListItemText, Typography, AppBar, Toolbar, Avatar } from '@mui/material';
import { Dashboard as DashIcon, People as PeopleIcon, School as SchoolIcon, TableChart as GridIcon, Chat as ChatIcon, Assessment as ReportIcon, Settings as SettingsIcon, Assignment as AssignmentIcon, Api as ApiIcon } from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';

import NotificationBell from '../notifications/NotificationBell';

const drawerWidth = 240;


const MainLayout = ({ children }) => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { text: 'Dashboard', icon: <DashIcon />, path: '/' },
    { text: 'Live Grid', icon: <GridIcon />, path: '/grid' },
    { text: 'Batches', icon: <PeopleIcon />, path: '/batches' },
    { text: 'Students', icon: <SchoolIcon />, path: '/students' },
    { text: 'Risk Rules', icon: <SettingsIcon />, path: '/risk-rules' },
    { text: 'Assignments', icon: <AssignmentIcon />, path: '/assignments' },
    { text: 'Reports', icon: <ReportIcon />, path: '/reports' },
    { text: 'Integrations', icon: <ApiIcon />, path: '/settings' },
    { text: 'Chat', icon: <ChatIcon />, path: '/chat' },
  ];

  if (user?.role === 'ADMIN') {
    menuItems.push({ text: 'Global Settings', icon: <ApiIcon />, path: '/admin/settings' });
  }

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
        <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 32, height: 32, borderRadius: 1, bgcolor: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold', fontSize: 18 }}>T</Typography>
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px' }}>
            TradeLab
          </Typography>
        </Box>

        <List sx={{ px: 2 }}>
          {menuItems.map((item) => {
            const active = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
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
                  '&:hover': { bgcolor: '#f1f5f9', color: '#0f172a' }
                }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: 'inherit' }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText 
                  primary={item.text} 
                  primaryTypographyProps={{ fontSize: 14, fontWeight: active ? 600 : 500 }} 
                />
              </ListItem>
            );
          })}
        </List>

        <Box sx={{ flexGrow: 1 }} />
        
        {/* User Profile Area */}
        <Box sx={{ p: 2, m: 2, borderRadius: 2, bgcolor: '#f8fafc', display: 'flex', alignItems: 'center', gap: 1.5, border: '1px solid #e2e8f0' }}>
          <Avatar sx={{ width: 32, height: 32, bgcolor: '#3b82f6', fontSize: 14 }}>
            {user?.name?.charAt(0) || 'U'}
          </Avatar>
          <Box sx={{ overflow: 'hidden' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {user?.name || 'Instructor'}
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748b', display: 'block', cursor: 'pointer', '&:hover': { color: '#ef4444' } }} onClick={logout}>
              Log out
            </Typography>
          </Box>
        </Box>
      </Drawer>

      {/* Main Content Area */}
      <Box component="main" sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        {/* Top Navbar */}
        <AppBar position="sticky" elevation={0} sx={{ bgcolor: 'white', borderBottom: '1px solid #e2e8f0' }}>
          <Toolbar sx={{ minHeight: '64px !important', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2.5 }}>
             <NotificationBell />
             <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 500 }}>
               Institute: <Box component="span" sx={{ color: '#0f172a', fontWeight: 600 }}>{user?.instituteCode || 'N/A'}</Box>
             </Typography>
          </Toolbar>

        </AppBar>

        {/* Page Content */}
        <Box sx={{ p: 4, flexGrow: 1, overflowY: 'auto' }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
};

export default MainLayout;
