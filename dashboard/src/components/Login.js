import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext, ROLE_ROUTES } from '../context/AuthContext';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [instituteCode, setInstituteCode] = useState('');
  const [showInstituteCode, setShowInstituteCode] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email/userId and password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Institute code is optional — backend automatically resolves user from DB
      const data = await login(email.trim(), password, instituteCode ? instituteCode.trim().toUpperCase() : '');
      const userRole = data.user?.role;

      if (userRole === 'STUDENT') {
        setError('Students: Please log in using the TradeLab Mobile App.');
        return;
      }

      // Role-based automatic redirect
      const destination = ROLE_ROUTES[userRole] ?? '/';
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Left Panel - Branding */}
      <div style={styles.leftPanel}>
        <div style={styles.brandingContent}>
          <div style={styles.logoWrap}>
            <div style={styles.logoCircle}>
              <span style={styles.logoIcon}>TL</span>
            </div>
            <h1 style={styles.brandName}>TradeLab Platform</h1>
          </div>

          <h2 style={styles.tagline}>Train. Simulate. Master the Market.</h2>

          <ul style={styles.featureList}>
            <li style={styles.featureItem}>
              <span style={styles.checkIcon}>✓</span> Real-time institutional trading simulator
            </li>
            <li style={styles.featureItem}>
              <span style={styles.checkIcon}>✓</span> Multi-tenant governance & SaaS quota controls
            </li>
            <li style={styles.featureItem}>
              <span style={styles.checkIcon}>✓</span> Live NSE F&O Option Chain and Tick Telemetry
            </li>
            <li style={styles.featureItem}>
              <span style={styles.checkIcon}>✓</span> Instructor live monitoring & risk controls
            </li>
          </ul>
        </div>

        <div style={styles.decorCircle1} />
        <div style={styles.decorCircle2} />
      </div>

      {/* Right Panel - Login Card */}
      <div style={styles.rightPanel}>
        <div style={styles.loginCard}>
          <div style={styles.cardHeader}>
            <h2 style={styles.cardTitle}>Sign In</h2>
            <p style={styles.cardSubtitle}>
              Access your Super Admin, Institute, or Instructor Portal
            </p>
          </div>

          {error && (
            <div style={styles.errorBox}>
              <span style={{ marginRight: '8px' }}>❌</span> {error}
            </div>
          )}

          <form onSubmit={handleLogin} style={styles.form}>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Email or User ID</label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@institute.com or USER01"
                style={styles.input}
                autoFocus
                autoCapitalize="none"
              />
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={styles.input}
              />
            </div>

            {/* Optional Institute Code accordion */}
            <div style={{ marginTop: '4px', marginBottom: '16px' }}>
              {!showInstituteCode ? (
                <button
                  type="button"
                  onClick={() => setShowInstituteCode(true)}
                  style={styles.linkButton}
                >
                  + Have a custom Institute Code? (Optional)
                </button>
              ) : (
                <div style={styles.inputGroup}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={styles.label}>Institute Code (Optional)</label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowInstituteCode(false);
                        setInstituteCode('');
                      }}
                      style={{ ...styles.linkButton, fontSize: '11px', color: '#94a3b8' }}
                    >
                      Hide
                    </button>
                  </div>
                  <input
                    type="text"
                    value={instituteCode}
                    onChange={(e) => setInstituteCode(e.target.value.toUpperCase())}
                    placeholder="e.g. TEST1, BULLS01 (leave blank if unsure)"
                    style={{ ...styles.input, textTransform: 'uppercase', fontFamily: 'monospace' }}
                  />
                  <span style={styles.hintText}>
                    Optional. Your account automatically knows your institute.
                  </span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                ...styles.button,
                opacity: loading ? 0.7 : 1,
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>

          <div style={styles.footerWrap}>
            <p style={styles.footerText}>
              Platform Administrator?{' '}
              <a href="/admin/login" style={styles.footerLink}>
                Super Admin Login →
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    minHeight: '100vh',
    backgroundColor: '#0a0f1d',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  leftPanel: {
    flex: '1',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: '40px 60px',
    backgroundColor: '#0f172a',
    position: 'relative',
    overflow: 'hidden',
  },
  brandingContent: {
    position: 'relative',
    zIndex: 2,
    maxWidth: '500px',
  },
  logoWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '28px',
  },
  logoCircle: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 16px rgba(99, 102, 241, 0.3)',
  },
  logoIcon: {
    color: '#ffffff',
    fontSize: '20px',
    fontWeight: '800',
    letterSpacing: '1px',
  },
  brandName: {
    color: '#ffffff',
    fontSize: '26px',
    fontWeight: '700',
    letterSpacing: '-0.5px',
    margin: 0,
  },
  tagline: {
    color: '#94a3b8',
    fontSize: '20px',
    fontWeight: '400',
    lineHeight: '1.4',
    marginBottom: '36px',
  },
  featureList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  featureItem: {
    color: '#cbd5e1',
    fontSize: '15px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  checkIcon: {
    color: '#10b981',
    fontWeight: 'bold',
  },
  decorCircle1: {
    position: 'absolute',
    top: '-10%',
    left: '-10%',
    width: '400px',
    height: '400px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(0, 0, 0, 0) 70%)',
    zIndex: 1,
  },
  decorCircle2: {
    position: 'absolute',
    bottom: '-10%',
    right: '-10%',
    width: '500px',
    height: '500px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(16, 185, 129, 0.1) 0%, rgba(0, 0, 0, 0) 70%)',
    zIndex: 1,
  },
  rightPanel: {
    flex: '1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    backgroundColor: '#0a0f1d',
  },
  loginCard: {
    width: '100%',
    maxWidth: '420px',
    padding: '40px',
    backgroundColor: '#1e293b',
    borderRadius: '16px',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
  },
  cardHeader: {
    marginBottom: '28px',
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: '24px',
    fontWeight: '700',
    margin: '0 0 8px 0',
  },
  cardSubtitle: {
    color: '#94a3b8',
    fontSize: '14px',
    margin: 0,
    lineHeight: 1.5,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    color: '#f87171',
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    marginBottom: '20px',
    display: 'flex',
    alignItems: 'center',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    color: '#cbd5e1',
    fontSize: '13px',
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '12px 14px',
    color: '#ffffff',
    fontSize: '14px',
    outline: 'none',
    transition: 'all 0.2s',
  },
  hintText: {
    fontSize: '11px',
    color: '#64748b',
    marginTop: '4px',
  },
  linkButton: {
    background: 'none',
    border: 'none',
    color: '#818cf8',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    padding: 0,
    textAlign: 'left',
  },
  button: {
    backgroundColor: '#6366f1',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '14px',
    fontSize: '15px',
    fontWeight: '600',
    marginTop: '8px',
    transition: 'background-color 0.2s',
  },
  footerWrap: {
    marginTop: '24px',
    textAlign: 'center',
    borderTop: '1px solid #334155',
    paddingTop: '18px',
  },
  footerText: {
    color: '#94a3b8',
    fontSize: '13px',
    margin: 0,
  },
  footerLink: {
    color: '#818cf8',
    textDecoration: 'none',
    fontWeight: '600',
  },
};

export default Login;
