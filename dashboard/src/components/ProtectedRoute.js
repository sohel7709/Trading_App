import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext, ROLE_ROUTES } from '../context/AuthContext';

const ProtectedRoute = ({ children, allowedRoles = [] }) => {
  const { user, role, isLoading } = useContext(AuthContext);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#F8FAFC' }}>
        <p style={{ color: '#64748b', fontWeight: '500' }}>Loading session...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If specific roles required and user's role isn't among them,
  // redirect to their correct home page (not just /login)
  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    const correctHome = ROLE_ROUTES[role];
    if (correctHome === null) {
      // STUDENT — not allowed on web at all
      return <Navigate to="/login" replace />;
    }
    return <Navigate to={correctHome || '/login'} replace />;
  }

  return children;
};

export default ProtectedRoute;
