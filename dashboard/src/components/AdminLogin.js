import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const data = await login(email, password, '');
      const userRole = data.user?.role;
      if (userRole === 'SUPER_ADMIN') {
        navigate('/super-admin', { replace: true });
        return;
      }
      if (userRole === 'ADMIN' || userRole === 'INSTRUCTOR') {
        navigate('/', { replace: true });
        return;
      }
      if (userRole === 'INSTITUTE_ADMIN') {
        navigate('/institute', { replace: true });
        return;
      }
      setError('Unauthorized access. Admin privileges required.');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid admin credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.loginCard}>
        <div style={styles.cardHeader}>
          <div style={styles.logoCircle}>
            <span style={styles.logoIcon}>BS</span>
          </div>
          <h2 style={styles.cardTitle}>Admin Portal</h2>
          <p style={styles.cardSubtitle}>Sign in to manage the platform</p>
        </div>

        {error && (
          <div style={styles.errorBox}>
            <span style={{ marginRight: '8px' }}>❌</span> {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Admin Email</label>
            <input
              type="email"
              placeholder="admin@buildsoft.com"
              style={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>
          <div style={styles.inputGroup}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <label style={styles.label}>Password</label>
            </div>
            <input
              type="password"
              placeholder="••••••••"
              style={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? 'Authenticating...' : 'Sign In as Admin'}
          </button>
        </form>
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    minHeight: '100vh',
    fontFamily: 'Inter, system-ui, sans-serif',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  loginCard: {
    width: '100%',
    maxWidth: '400px',
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '40px',
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)',
    border: '1px solid #e2e8f0',
  },
  cardHeader: {
    marginBottom: '32px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  logoCircle: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    backgroundColor: '#1A73E8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px',
  },
  logoIcon: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: '20px',
  },
  cardTitle: {
    margin: '0 0 8px 0',
    fontSize: '24px',
    fontWeight: '700',
    color: '#0f172a',
  },
  cardSubtitle: {
    margin: 0,
    color: '#64748b',
    fontSize: '14px',
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    color: '#ef4444',
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '24px',
    display: 'flex',
    alignItems: 'center',
    border: '1px solid #fecaca',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#334155',
  },
  input: {
    height: '48px',
    padding: '0 16px',
    fontSize: '15px',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    outline: 'none',
    transition: 'border-color 0.2s',
    color: '#0f172a',
  },
  button: {
    height: '50px',
    backgroundColor: '#0f172a', // Darker for admin
    color: '#ffffff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    marginTop: '8px',
  },
};

export default AdminLogin;
