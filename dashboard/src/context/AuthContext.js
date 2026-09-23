import React, { createContext, useState, useEffect } from 'react';
import axios from 'axios';

export const AuthContext = createContext(null);
export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

// ── Role → default landing page ──────────────────────────────────────────
export const ROLE_ROUTES = {
  SUPER_ADMIN:    '/super-admin',
  INSTITUTE_ADMIN: '/institute',
  ADMIN:          '/',
  INSTRUCTOR:     '/',
  STUDENT:        null, // students use mobile app
  TRADER:         '/',
};

// Synchronously initialize token header before any React component mounts
const initialToken = localStorage.getItem('accessToken') || localStorage.getItem('token');
if (initialToken) {
  axios.defaults.headers.common['Authorization'] = `Bearer ${initialToken}`;
}

// Global Axios Request Interceptor — guarantees every API call carries the Bearer token
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
  if (token && !config.headers['Authorization']) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

export const AuthProvider = ({ children }) => {
  const [user, setUser]               = useState(null);
  const [role, setRole]               = useState(null);
  const [tenantConfig, setTenantConfig] = useState(null);
  const [isLoading, setIsLoading]     = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      axios.get(`${API_URL}/auth/me`)
        .then(res => {
          setUser(res.data.user);
          setRole(res.data.user?.role);
          setTenantConfig(res.data.user?.tenantConfig);
        })
        .catch(() => logout())
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (email, password, instituteCode = '') => {
    const response = await axios.post(`${API_URL}/auth/login`, {
      email,
      password,
      instituteCode,
    });

    const { accessToken, user: userData } = response.data;
    localStorage.setItem('accessToken', accessToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

    let fullUser = userData;
    try {
      const meRes = await axios.get(`${API_URL}/auth/me`);
      if (meRes.data?.user) {
        fullUser = { ...userData, ...meRes.data.user };
      }
    } catch {
      // fallback to login response user data
    }

    setUser(fullUser);
    setRole(fullUser?.role);
    setTenantConfig(fullUser?.tenantConfig);

    return { ...response.data, user: fullUser };
  };

  const logout = async () => {
    try {
      await axios.post(`${API_URL}/auth/logout`);
    } catch {
      // Ignore network errors on logout
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('superAdminToken');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
    setRole(null);
    setTenantConfig(null);
  };

  const impersonateInstitute = (impersonationToken, impersonatedUser) => {
    const currentSuperToken = localStorage.getItem('accessToken');
    if (currentSuperToken && !localStorage.getItem('superAdminToken')) {
      localStorage.setItem('superAdminToken', currentSuperToken);
    }
    localStorage.setItem('accessToken', impersonationToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${impersonationToken}`;
    setUser(impersonatedUser);
    setRole('INSTITUTE_ADMIN');
    setTenantConfig(impersonatedUser?.tenantConfig || null);
  };

  const exitImpersonation = async () => {
    const superAdminToken = localStorage.getItem('superAdminToken');
    if (superAdminToken) {
      localStorage.setItem('accessToken', superAdminToken);
      localStorage.removeItem('superAdminToken');
      axios.defaults.headers.common['Authorization'] = `Bearer ${superAdminToken}`;
      try {
        const res = await axios.get(`${API_URL}/auth/me`);
        if (res.data?.user) {
          setUser(res.data.user);
          setRole(res.data.user.role);
          setTenantConfig(res.data.user.tenantConfig);
        }
      } catch {
        logout();
      }
    } else {
      logout();
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      role,
      tenantConfig,
      isLoading,
      login,
      logout,
      impersonateInstitute,
      exitImpersonation,
      isImpersonating: Boolean(user?.isImpersonating || localStorage.getItem('superAdminToken')),
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    return { user: null, role: null, tenantConfig: null, isLoading: false, login: () => {}, logout: () => {} };
  }
  return context;
};
