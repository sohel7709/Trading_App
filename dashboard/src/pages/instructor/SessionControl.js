/**
 * SessionControl.js  (NEW)
 * ──────────────────────────
 * Instructor controls for the simulated trading session.
 *
 * Controls:
 *   - Start / Pause / Resume / Stop session
 *   - Speed multiplier (1x / 2x / 5x) for replay mode
 *   - Per-batch session status
 *   - Live timer showing session duration
 *
 * API:
 *   POST /sessions/start   { batchId, speed }
 *   POST /sessions/pause   { batchId }
 *   POST /sessions/resume  { batchId }
 *   POST /sessions/stop    { batchId }
 *   GET  /sessions         → [{ batchId, status, startedAt, speed }]
 */

import React, { useState, useEffect, useRef, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../../context/AuthContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

// ── Duration formatter ────────────────────────────────────────────────────────
function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h > 0 ? h + 'h ' : ''}${m}m ${s}s`;
}

// ── Session status badge ──────────────────────────────────────────────────────
const STATUS_CFG = {
  LIVE:    { label: '● LIVE',    bg: '#ecfdf5', color: '#10b981', pulse: true },
  PAUSED:  { label: '⏸ PAUSED', bg: '#fffbeb', color: '#d97706', pulse: false },
  STOPPED: { label: '■ STOPPED', bg: '#f1f5f9', color: '#64748b', pulse: false },
  DRAFT:   { label: '○ DRAFT',   bg: '#f1f5f9', color: '#94a3b8', pulse: false },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.DRAFT;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '5px 12px', borderRadius: 8,
      background: cfg.bg, color: cfg.color,
      fontSize: 12, fontWeight: 800, letterSpacing: '0.3px',
    }}>
      {cfg.label}
    </span>
  );
}

// ── Per-batch session card ────────────────────────────────────────────────────
function SessionCard({ batch, session, onAction, actionLoading }) {
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);

  const status = session?.status || 'STOPPED';

  useEffect(() => {
    if (status === 'LIVE' && session?.startedAt) {
      timerRef.current = setInterval(() => {
        setElapsed(Date.now() - new Date(session.startedAt).getTime());
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [status, session?.startedAt]);

  const speed = session?.speed || 1;

  const buttons = [
    status === 'STOPPED' || status === 'DRAFT'
      ? { label: '▶ Start', action: 'start', color: '#10b981', disabled: false }
      : null,
    status === 'LIVE'
      ? { label: '⏸ Pause', action: 'pause', color: '#d97706', disabled: false }
      : null,
    status === 'PAUSED'
      ? { label: '▶ Resume', action: 'resume', color: '#10b981', disabled: false }
      : null,
    status === 'LIVE' || status === 'PAUSED'
      ? { label: '■ Stop', action: 'stop', color: '#ef4444', disabled: false }
      : null,
  ].filter(Boolean);

  return (
    <div style={SC.card}>
      <div style={SC.cardHeader}>
        <div>
          <div style={SC.batchName}>{batch.name}</div>
          <div style={SC.batchCode}>{batch.code}</div>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Timer */}
      {status === 'LIVE' && (
        <div style={SC.timerRow}>
          <span style={SC.timerLabel}>Session running</span>
          <span style={SC.timerValue}>{formatDuration(elapsed)}</span>
        </div>
      )}

      {/* Speed selector */}
      {(status === 'LIVE' || status === 'PAUSED') && (
        <div style={SC.speedRow}>
          <span style={SC.speedLabel}>Speed:</span>
          {[1, 2, 5].map(x => (
            <button
              key={x}
              style={{
                ...SC.speedBtn,
                ...(speed === x ? SC.speedBtnActive : {}),
              }}
              onClick={() => onAction(batch._id, 'speed', x)}
              disabled={actionLoading === batch._id}
            >
              {x}×
            </button>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div style={SC.actions}>
        {buttons.map(btn => (
          <button
            key={btn.action}
            style={{
              ...SC.actionBtn,
              background: btn.color,
              opacity: (actionLoading === batch._id) ? 0.6 : 1,
              cursor: (actionLoading === batch._id) ? 'not-allowed' : 'pointer',
            }}
            onClick={() => onAction(batch._id, btn.action)}
            disabled={actionLoading === batch._id || btn.disabled}
          >
            {actionLoading === batch._id ? '…' : btn.label}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div style={SC.statsRow}>
        <div style={SC.stat}>
          <span style={SC.statVal}>{batch.studentCount || 0}</span>
          <span style={SC.statLabel}>Students</span>
        </div>
        <div style={SC.stat}>
          <span style={SC.statVal}>{session?.activeStudents || 0}</span>
          <span style={SC.statLabel}>Active</span>
        </div>
        <div style={SC.stat}>
          <span style={SC.statVal}>{session?.totalOrders || 0}</span>
          <span style={SC.statLabel}>Orders</span>
        </div>
      </div>
    </div>
  );
}

const SC = {
  card: {
    background: '#fff', borderRadius: 16, padding: 24,
    border: '1px solid #e2e8f0',
  },
  cardHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 16,
  },
  batchName: { fontSize: 17, fontWeight: 800, color: '#0f172a', marginBottom: 2 },
  batchCode: { fontSize: 12, color: '#94a3b8', fontWeight: 600 },
  timerRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: '#ecfdf5', borderRadius: 10, padding: '10px 14px', marginBottom: 14,
  },
  timerLabel: { fontSize: 12, color: '#10b981', fontWeight: 600 },
  timerValue: { fontSize: 20, fontWeight: 800, color: '#10b981', letterSpacing: '-0.5px' },
  speedRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 },
  speedLabel: { fontSize: 12, color: '#64748b', fontWeight: 600, marginRight: 4 },
  speedBtn: {
    padding: '5px 12px', borderRadius: 8, border: '1px solid #e2e8f0',
    background: '#f8fafc', color: '#64748b', fontWeight: 700, cursor: 'pointer',
    fontSize: 12,
  },
  speedBtnActive: { background: '#1A73E8', color: '#fff', borderColor: '#1A73E8' },
  actions: { display: 'flex', gap: 10, marginBottom: 20 },
  actionBtn: {
    flex: 1, color: '#fff', border: 'none', borderRadius: 10,
    padding: '12px', fontSize: 14, fontWeight: 700, transition: 'opacity 0.2s',
  },
  statsRow: { display: 'flex', borderTop: '1px solid #f1f5f9', paddingTop: 14, gap: 0 },
  stat: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 3, borderRight: '1px solid #f1f5f9',
  },
  statVal: { fontSize: 20, fontWeight: 800, color: '#0f172a' },
  statLabel: { fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' },
};

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function SessionControl() {
  const token = localStorage.getItem('accessToken');

  const [batches, setBatches]       = useState([]);
  const [sessions, setSessions]     = useState({});   // { batchId: sessionObj }
  const [actionLoading, setActionLoading] = useState(null);

  // ── Load batches + sessions ──────────────────────────────────────────
  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      axios.get(`${API_URL}/batches`, { headers }),
      axios.get(`${API_URL}/sessions`, { headers }).catch(() => ({ data: [] })),
    ]).then(([batchRes, sessionRes]) => {
      setBatches(batchRes.data.filter(b => b.status === 'ACTIVE'));
      const sessionMap = {};
      (sessionRes.data || []).forEach(s => { sessionMap[s.batchId] = s; });
      setSessions(sessionMap);
    }).catch(console.error);
  }, [token]);

  // ── Perform session action ───────────────────────────────────────────
  const handleAction = async (batchId, action, speed) => {
    setActionLoading(batchId);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const body = { batchId, ...(speed ? { speed } : {}) };
      const res = await axios.post(`${API_URL}/sessions/${action}`, body, { headers });
      setSessions(prev => ({
        ...prev,
        [batchId]: res.data.session || { ...prev[batchId], status: action.toUpperCase(), speed: speed || prev[batchId]?.speed },
      }));
    } catch (e) {
      // Show error inline
      console.error('Session action failed:', e.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Overall stats
  const liveSessions = Object.values(sessions || {}).filter(s => s?.status === 'LIVE').length;

  return (
    <div style={css.page}>
      {/* Header */}
      <div style={css.header}>
        <div>
          <h2 style={css.title}>Session Control</h2>
          <p style={css.subtitle}>
            Start, pause, or stop simulated trading sessions for each batch.
          </p>
        </div>
        <div style={css.globalStats}>
          <div style={{ ...css.globalStat, background: liveSessions > 0 ? '#ecfdf5' : '#f8fafc' }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: liveSessions > 0 ? '#10b981' : '#94a3b8' }}>
              {liveSessions}
            </span>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
              LIVE SESSION{liveSessions !== 1 ? 'S' : ''}
            </span>
          </div>
          <div style={css.globalStat}>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{batches.length}</span>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>ACTIVE BATCHES</span>
          </div>
        </div>
      </div>

      {/* Session cards grid */}
      {batches.length === 0 ? (
        <div style={css.empty}>
          No active batches found. Create and activate a batch to manage sessions.
        </div>
      ) : (
        <div style={css.grid}>
          {batches.map(batch => (
            <SessionCard
              key={batch._id}
              batch={batch}
              session={sessions[batch._id]}
              onAction={handleAction}
              actionLoading={actionLoading}
            />
          ))}
        </div>
      )}

      {/* Info footer */}
      <div style={css.infoBox}>
        <strong>ℹ Session modes:</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.8 }}>
          <li><strong>Live (1×)</strong> — trades execute at real market prices in real-time</li>
          <li><strong>2× / 5×</strong> — accelerated replay mode (historical data)</li>
          <li><strong>Paused</strong> — new orders are blocked; open positions remain</li>
          <li><strong>Stopped</strong> — session ends; all positions are squared off automatically</li>
        </ul>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const css = {
  page: { background: '#f8fafc', minHeight: '100%' },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 24,
  },
  title: { margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px' },
  subtitle: { margin: '4px 0 0', fontSize: 13, color: '#64748b' },
  globalStats: { display: 'flex', gap: 12 },
  globalStat: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
    background: '#f8fafc', borderRadius: 12, padding: '14px 20px',
    border: '1px solid #e2e8f0',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: 20, marginBottom: 24,
  },
  empty: { textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 15 },
  infoBox: {
    background: '#eff6ff', borderRadius: 14, padding: '16px 20px',
    fontSize: 13, color: '#1e40af', border: '1px solid #bfdbfe', lineHeight: 1.6,
  },
};
