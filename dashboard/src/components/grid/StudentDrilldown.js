/**
 * StudentDrilldown.js  (NEW — Critical)
 * ───────────────────────────────────────
 * Instructor view of a single student's activity.
 *
 * Tabs:
 *   1. Positions  — live open positions
 *   2. Orders     — full order book with rejection reasons
 *   3. Journal    — read-only journal entries
 *   4. Risk Logs  — risk rule trigger history
 *
 * API:
 *   GET /batches/:batchId/students/:studentId
 *
 * Props:
 *   batchId    {string}
 *   studentId  {string}
 *   studentName {string}
 *   onBack     {() => void}
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (paise) => '₹' + Number(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtRaw = (n) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pnlColor = (n) => (n >= 0 ? '#10b981' : '#ef4444');

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, valueColor, sub }) {
  return (
    <div style={SC.card}>
      <div style={SC.label}>{label}</div>
      <div style={{ ...SC.value, color: valueColor || '#0f172a' }}>{value}</div>
      {sub && <div style={SC.sub}>{sub}</div>}
    </div>
  );
}

const SC = {
  card: {
    background: '#fff', borderRadius: 12, padding: '14px 18px',
    border: '1px solid #e2e8f0', flex: 1,
  },
  label: { fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  value: { fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' },
  sub:   { fontSize: 11, color: '#64748b', marginTop: 4 },
};

function PositionsTab({ positions }) {
  if (!positions?.length) return <EmptyState icon="📊" text="No open positions" />;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={T.table}>
        <thead>
          <tr>
            {['Instrument','Side','Qty','Avg Price','LTP','P&L'].map((h) => (
              <th key={h} style={T.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map((p, i) => {
            const pnl = (p.ltp - p.avgPrice) * p.quantity * (p.side === 'BUY' ? 1 : -1);
            return (
              <tr key={p._id || i} style={T.tr}>
                <td style={T.td}>
                  <span style={T.symbol}>{p.underlyingSymbol} {p.strikePrice} {p.optionType}</span>
                  <span style={T.expiry}>{p.expiry}</span>
                </td>
                <td style={T.td}>
                  <span style={{
                    ...T.badge,
                    background: p.side === 'BUY' ? '#eff6ff' : '#fef2f2',
                    color: p.side === 'BUY' ? '#1A73E8' : '#ef4444',
                  }}>{p.side}</span>
                </td>
                <td style={T.td}>{p.quantity}</td>
                <td style={T.td}>{fmtRaw(p.avgPrice)}</td>
                <td style={T.td}>{fmtRaw(p.ltp)}</td>
                <td style={{ ...T.td, color: pnlColor(pnl), fontWeight: 700 }}>
                  {pnl >= 0 ? '+' : ''}{fmtRaw(pnl)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OrdersTab({ orders }) {
  if (!orders?.length) return <EmptyState icon="📋" text="No orders placed" />;
  const STATUS_COLOR = {
    EXECUTED:  { bg: '#ecfdf5', color: '#10b981' },
    PENDING:   { bg: '#fffbeb', color: '#d97706' },
    CANCELLED: { bg: '#f8fafc', color: '#94a3b8' },
    REJECTED:  { bg: '#fef2f2', color: '#ef4444' },
  };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={T.table}>
        <thead>
          <tr>
            {['Instrument','Side','Qty','Price','Type','Status','Rejection Reason'].map((h) => (
              <th key={h} style={T.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map((o, i) => {
            const sc = STATUS_COLOR[o.status] || STATUS_COLOR.PENDING;
            return (
              <tr key={o._id || i} style={T.tr}>
                <td style={T.td}><span style={T.symbol}>{o.stockSymbol}</span></td>
                <td style={T.td}>
                  <span style={{
                    ...T.badge,
                    background: o.side === 'BUY' ? '#eff6ff' : '#fef2f2',
                    color: o.side === 'BUY' ? '#1A73E8' : '#ef4444',
                  }}>{o.side}</span>
                </td>
                <td style={T.td}>{o.quantity}</td>
                <td style={T.td}>{fmtRaw(o.price)}</td>
                <td style={T.td}>
                  <span style={{ ...T.badge, background: '#f1f5f9', color: '#64748b' }}>{o.type}</span>
                </td>
                <td style={T.td}>
                  <span style={{ ...T.badge, background: sc.bg, color: sc.color }}>{o.status}</span>
                </td>
                <td style={{ ...T.td, maxWidth: 200 }}>
                  {o.rejectionReason ? (
                    <span style={{ color: '#ef4444', fontSize: 12, fontStyle: 'italic' }}>
                      {o.rejectionReason}
                    </span>
                  ) : <span style={{ color: '#94a3b8' }}>—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function JournalTab({ journals }) {
  if (!journals?.length) return <EmptyState icon="📔" text="No journal entries yet" />;
  const EMOTION_COLOR = {
    CALM: '#10b981', CONFIDENT: '#1A73E8', FEAR: '#f59e0b',
    GREED: '#ef4444', FOMO: '#f97316', ANXIOUS: '#8b5cf6',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {journals.map((j, i) => (
        <div key={j._id || i} style={J.card}>
          <div style={J.header}>
            <span style={J.symbol}>{j.symbol || j.stockSymbol}</span>
            {j.emotion && (
              <span style={{ ...J.emotionBadge, background: (EMOTION_COLOR[j.emotion] || '#94a3b8') + '1A', color: EMOTION_COLOR[j.emotion] || '#94a3b8' }}>
                {j.emotion}
              </span>
            )}
          </div>
          {j.notes && <p style={J.notes}>{j.notes}</p>}
          {j.mistakes?.length > 0 && (
            <div style={J.mistakeList}>
              {j.mistakes.map((m) => (
                <span key={m} style={J.mistake}>{m.replace(/_/g, ' ')}</span>
              ))}
            </div>
          )}
          <div style={J.date}>
            {new Date(j.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        </div>
      ))}
    </div>
  );
}

function RiskLogsTab({ riskLogs }) {
  if (!riskLogs?.length) return <EmptyState icon="🛡️" text="No risk rule triggers" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {riskLogs.map((log, i) => (
        <div key={log._id || i} style={RL.card}>
          <div style={RL.iconWrap}>⚠️</div>
          <div style={{ flex: 1 }}>
            <div style={RL.rule}>{log.rule || log.ruleType}</div>
            <div style={RL.detail}>{log.detail || log.message}</div>
          </div>
          <div style={RL.time}>
            {new Date(log.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ icon, text }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 600 }}>{text}</div>
    </div>
  );
}

// ── Table shared styles ────────────────────────────────────────────────────────
const T = {
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8',
    padding: '10px 12px', borderBottom: '1px solid #e2e8f0',
    textTransform: 'uppercase', letterSpacing: '0.5px',
  },
  tr: { borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' },
  td: { padding: '12px', fontSize: 13, color: '#334155', verticalAlign: 'middle' },
  symbol: { display: 'block', fontWeight: 700, color: '#0f172a', fontSize: 14 },
  expiry: { display: 'block', fontSize: 11, color: '#94a3b8', marginTop: 2 },
  badge: {
    display: 'inline-block', padding: '3px 8px', borderRadius: 6,
    fontSize: 11, fontWeight: 700,
  },
};

const J = {
  card: { background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  symbol: { fontWeight: 700, fontSize: 15, color: '#0f172a' },
  emotionBadge: { padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700 },
  notes: { fontSize: 13, color: '#334155', lineHeight: '1.6', marginBottom: 10 },
  mistakeList: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  mistake: { background: '#fef2f2', color: '#ef4444', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 },
  date: { fontSize: 11, color: '#94a3b8' },
};

const RL = {
  card: { display: 'flex', alignItems: 'flex-start', gap: 12, background: '#fffbeb', borderRadius: 12, padding: 14, border: '1px solid #fde68a' },
  iconWrap: { fontSize: 20 },
  rule: { fontWeight: 700, fontSize: 14, color: '#92400e', marginBottom: 3 },
  detail: { fontSize: 12, color: '#78350f', lineHeight: '1.5' },
  time: { fontSize: 11, color: '#b45309', whiteSpace: 'nowrap' },
};

// ── Main Component ────────────────────────────────────────────────────────────
const TABS = ['Positions', 'Orders', 'Journal', 'Risk Logs'];

export default function StudentDrilldown({ batchId, studentId, studentName, onBack }) {
  const [activeTab, setActiveTab] = useState(0);
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  const fetchData = useCallback(async () => {
    if (!batchId || !studentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_URL}/batches/${batchId}/students/${studentId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || localStorage.getItem('accessToken')}` }
      });
      setData(res.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [batchId, studentId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const netPnl = data?.plRecord?.netPnl || 0;
  const balance = data?.wallet?.balancePaise || 0;
  const blocked = data?.wallet?.blockedMarginPaise || 0;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onBack}>
          ← Back to Grid
        </button>
        <div>
          <h2 style={styles.studentName}>{studentName || 'Student'}</h2>
          <span style={styles.studentId}>ID: {studentId}</span>
        </div>
        <div style={styles.headerActions}>
          <button style={styles.refreshBtn} onClick={fetchData} disabled={loading}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div style={styles.loading}>Loading student data...</div>
      ) : error ? (
        <div style={styles.error}>Error: {error} <button onClick={fetchData}>Retry</button></div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={styles.statsGrid}>
            <StatCard
              label="Available Balance"
              value={fmt(balance)}
              sub={`Blocked: ${fmt(blocked)}`}
            />
            <StatCard
              label="Today's Net P&L"
              value={(netPnl >= 0 ? '+' : '') + fmt(netPnl)}
              valueColor={pnlColor(netPnl)}
              sub="Realised + Unrealised"
            />
            <StatCard
              label="Open Positions"
              value={data?.positions?.length || 0}
              sub={`Total trades: ${data?.orders?.filter(o => o.status === 'EXECUTED')?.length || 0}`}
            />
            <StatCard
              label="Margin Used"
              value={balance + blocked > 0 ? `${((blocked / (balance + blocked)) * 100).toFixed(0)}%` : '0%'}
              sub={fmt(blocked) + ' blocked'}
            />
          </div>

          {/* Tab bar */}
          <div style={styles.tabs}>
            {TABS.map((t, i) => (
              <button
                key={t}
                style={{
                  ...styles.tab,
                  ...(activeTab === i ? styles.tabActive : {}),
                }}
                onClick={() => setActiveTab(i)}
              >
                {t}
                {t === 'Orders' && data?.orders?.some(o => o.status === 'REJECTED') && (
                  <span style={styles.tabBadge}>!</span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={styles.tabContent}>
            {activeTab === 0 && <PositionsTab positions={data?.positions} />}
            {activeTab === 1 && <OrdersTab orders={data?.orders} />}
            {activeTab === 2 && <JournalTab journals={data?.journals} />}
            {activeTab === 3 && <RiskLogsTab riskLogs={data?.riskLogs} />}
          </div>
        </>
      )}
    </div>
  );
}

// ── Component styles (inline for portability) ─────────────────────────────────
const styles = {
  container: { background: '#f8fafc', minHeight: '100%' },
  header: {
    display: 'flex', alignItems: 'center', gap: 16,
    padding: '20px 24px', background: '#fff',
    borderBottom: '1px solid #e2e8f0', marginBottom: 20,
  },
  backBtn: {
    background: 'none', border: '1px solid #e2e8f0', borderRadius: 8,
    padding: '8px 14px', cursor: 'pointer', fontSize: 13,
    color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap',
  },
  studentName: { margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' },
  studentId: { fontSize: 12, color: '#94a3b8', fontWeight: 500 },
  headerActions: { marginLeft: 'auto' },
  refreshBtn: {
    background: '#f1f5f9', border: 'none', borderRadius: 8,
    padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
  },
  statsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 12, padding: '0 24px', marginBottom: 20,
  },
  loading: { padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 15 },
  error:   { padding: 24, color: '#ef4444', textAlign: 'center' },
  tabs: {
    display: 'flex', borderBottom: '2px solid #e2e8f0',
    padding: '0 24px', marginBottom: 20, gap: 4,
  },
  tab: {
    position: 'relative', background: 'none', border: 'none',
    padding: '12px 20px', fontSize: 14, fontWeight: 600,
    color: '#64748b', cursor: 'pointer', borderBottom: '2px solid transparent',
    marginBottom: -2, transition: 'all 0.15s',
  },
  tabActive: { color: '#1A73E8', borderBottomColor: '#1A73E8' },
  tabBadge: {
    display: 'inline-block', background: '#ef4444', color: '#fff',
    borderRadius: '50%', width: 16, height: 16, fontSize: 10,
    fontWeight: 800, textAlign: 'center', lineHeight: '16px', marginLeft: 6,
  },
  tabContent: { padding: '0 24px 24px' },
};
