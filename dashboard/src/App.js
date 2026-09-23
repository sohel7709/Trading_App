import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// ── Auth & Layout ──────────────────────────────────────────────────────────
import Login from './components/Login';
import AdminLogin from './components/AdminLogin';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './components/layout/MainLayout';
import SuperAdminLayout from './components/layout/SuperAdminLayout';
import InstituteLayout from './components/layout/InstituteLayout';

// ── Instructor Pages (existing) ────────────────────────────────────────────
import InstructorDashboard from './pages/instructor/InstructorDashboard';
import InstructorLiveGrid from './pages/instructor/InstructorLiveGrid';
import BatchManagement from './pages/instructor/BatchManagement';
import RiskRulesPanel from './pages/instructor/RiskRulesPanel';
import AssignmentsDashboard from './pages/instructor/AssignmentsDashboard';
import ReportsLeaderboard from './pages/instructor/ReportsLeaderboard';
import IntegrationSettings from './pages/instructor/IntegrationSettings';

// ── Super Admin Pages ──────────────────────────────────────────────────────
import SuperAdminDashboard from './pages/super-admin/SuperAdminDashboard';
import InstituteManagement from './pages/super-admin/InstituteManagement';
import SystemHealth from './pages/super-admin/SystemHealth';
import AuditLogs from './pages/super-admin/AuditLogs';
import MarketControl from './pages/super-admin/MarketControl';

// ── Institute Admin Pages ──────────────────────────────────────────────────
import InstituteAdminDashboard from './pages/institute/InstituteAdminDashboard';
import InstructorManagement from './pages/institute/InstructorManagement';
import StudentManagement from './pages/institute/StudentManagement';

// ── Lazy-loaded pages ──────────────────────────────────────────────────────
const AnnouncementCenter = lazy(() => import('./pages/instructor/AnnouncementCenter'));
const SessionControl     = lazy(() => import('./pages/instructor/SessionControl'));
const GlobalDhanToken    = lazy(() => import('./pages/admin/GlobalDhanToken'));

const PageLoader = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: '#94a3b8', fontSize: 14 }}>
    Loading…
  </div>
);

function App() {
  return (
    <Routes>
      {/* ── Public routes ─────────────────────────────────────────────── */}
      <Route path="/login"       element={<Login />} />
      <Route path="/admin/login" element={<AdminLogin />} />

      {/* ── Super Admin routes ────────────────────────────────────────── */}
      <Route path="/super-admin/*" element={
        <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
          <SuperAdminLayout>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/"           element={<SuperAdminDashboard />} />
                <Route path="/market"     element={<MarketControl />} />
                <Route path="/institutes" element={<InstituteManagement />} />
                <Route path="/health"     element={<SystemHealth />} />
                <Route path="/audit-logs" element={<AuditLogs />} />
                <Route path="*"           element={<Navigate to="/super-admin" replace />} />
              </Routes>
            </Suspense>
          </SuperAdminLayout>
        </ProtectedRoute>
      } />

      {/* ── Institute Admin routes ────────────────────────────────────── */}
      <Route path="/institute/*" element={
        <ProtectedRoute allowedRoles={['INSTITUTE_ADMIN']}>
          <InstituteLayout>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/"            element={<InstituteAdminDashboard />} />
                <Route path="/instructors" element={<InstructorManagement />} />
                <Route path="/students"    element={<StudentManagement />} />
                <Route path="/batches"     element={<BatchManagement />} />
                <Route path="/settings"    element={<IntegrationSettings />} />
                <Route path="*"            element={<Navigate to="/institute" replace />} />
              </Routes>
            </Suspense>
          </InstituteLayout>
        </ProtectedRoute>
      } />

      {/* ── Instructor / Admin routes (existing) ─────────────────────── */}
      <Route path="/*" element={
        <ProtectedRoute allowedRoles={['INSTRUCTOR', 'ADMIN']}>
          <MainLayout>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/"               element={<InstructorDashboard />} />
                <Route path="/grid"           element={<InstructorLiveGrid />} />
                <Route path="/grid/:id"       element={<InstructorLiveGrid />} />
                <Route path="/batches"        element={<BatchManagement />} />
                <Route path="/batches/:id"    element={<BatchManagement />} />
                <Route path="/students"       element={<StudentManagement />} />
                <Route path="/risk-rules"     element={<RiskRulesPanel />} />
                <Route path="/assignments"    element={<AssignmentsDashboard />} />
                <Route path="/reports"        element={<ReportsLeaderboard />} />
                <Route path="/batch/:id/dashboard" element={<ReportsLeaderboard />} />
                <Route path="/batches/:id/leaderboard" element={<ReportsLeaderboard />} />
                <Route path="/settings"       element={<IntegrationSettings />} />
                <Route path="/chat"           element={<AnnouncementCenter />} />
                <Route path="/session"        element={<SessionControl />} />
                <Route path="/admin/settings" element={<GlobalDhanToken />} />
                <Route path="*"              element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </MainLayout>
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export default App;
