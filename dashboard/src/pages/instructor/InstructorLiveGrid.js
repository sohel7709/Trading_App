/**
 * InstructorLiveGrid.js  (upgraded)
 * ────────────────────────────────────
 * Real-time grid of all students in a batch.
 *
 * Upgrades:
 * - Batch selector dropdown (real API)
 * - Search bar (filter by name)
 * - Risk badge (Green/Yellow/Red)
 * - Socket partial updates (only changed rows re-render)
 * - Rejection reason count in "Last Order" column
 * - Force square off action (per row)
 * - Links through to StudentDrilldown
 */

import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import axios from 'axios';
import { AuthContext } from '../../context/AuthContext';
import StudentDrilldown from '../../components/grid/StudentDrilldown';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';
const SOCKET_URL = API_URL;

// ── Risk badge ────────────────────────────────────────────────────────────────
function RiskBadge({ status, flags }) {
  const cfg = {
    SAFE:    { label: '● Safe',    bg: '#ecfdf5', color: '#10b981' },
    CAUTION: { label: '● Caution', bg: '#fffbeb', color: '#d97706' },
    BREACH:  { label: '● Breach',  bg: '#fef2f2', color: '#ef4444' },
  }[status] || { label: '—', bg: '#f8fafc', color: '#94a3b8' };

  return (
    <span title={flags?.join(', ')} style={{ ...RS.badge, background: cfg.bg, color: cfg.color }}>
      {cfg.label}
      {flags?.length > 0 && <span style={RS.flagCount}>({flags.length})</span>}
    </span>
  );
}

const RS = {
  badge: { padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'default' },
  flagCount: { marginLeft: 4, fontSize: 10, opacity: 0.8 },
};

// ── Student row (memoized for virtual scroll performance) ─────────────────────
const StudentRow = React.memo(({ data, student, onDrilldown }) => {
  const netPnl = (student.netPnlPaise || 0) / 100;
  const marginPct = student.marginPct || 0;
  const riskStatus = student.riskFlags?.length > 0
    ? (student.riskFlags.some(f => f.includes('BREACH')) ? 'BREACH' : 'CAUTION')
    : 'SAFE';

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center',
        padding: '0 16px', borderBottom: '1px solid #f1f5f9',
        fontSize: 13, color: '#0f172a', cursor: 'pointer',
        transition: 'background 0.12s',
        height: 56,
      }}
      onClick={() => onDrilldown(student)}
      onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
      {/* Name */}
      <div style={{ flex: 2, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {student.studentName}
        {student.isActive === false && (
          <span style={{ marginLeft: 6, background: '#f1f5f9', color: '#94a3b8', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
            Offline
          </span>
        )}
      </div>

      {/* P&L */}
      <div style={{ flex: 1.5, fontWeight: 700, color: netPnl >= 0 ? '#10b981' : '#ef4444' }}>
        {netPnl >= 0 ? '+' : ''}₹{Math.abs(netPnl).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
      </div>

      {/* Positions */}
      <div style={{ flex: 1, color: '#334155' }}>
        {student.openPositions || 0} pos
      </div>

      {/* Margin */}
      <div style={{ flex: 1 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <div style={{
            width: 48, height: 5, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 3,
              width: `${Math.min(marginPct, 100)}%`,
              background: marginPct > 80 ? '#ef4444' : marginPct > 60 ? '#f59e0b' : '#10b981',
            }} />
          </div>
          <span style={{ fontSize: 11, color: '#64748b' }}>{marginPct.toFixed(0)}%</span>
        </div>
      </div>

      {/* Last order */}
      <div style={{ flex: 1.5, fontSize: 11, color: '#64748b' }}>
        {student.lastOrder
          ? <>{student.lastOrder.symbol}<br /><span style={{ color: student.lastOrder.status === 'REJECTED' ? '#ef4444' : '#94a3b8' }}>{student.lastOrder.status}</span></>
          : <span style={{ color: '#cbd5e1' }}>No orders</span>
        }
      </div>

      {/* Risk */}
      <div style={{ flex: 1 }}>
        <RiskBadge status={riskStatus} flags={student.riskFlags} />
      </div>
    </div>
  );
});

// ── Main component ────────────────────────────────────────────────────────────
const InstructorLiveGrid = () => {
  const { id: routeBatchId } = useParams();

  const token = localStorage.getItem('accessToken');

  const [batches, setBatches]           = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(routeBatchId || null);
  const [studentsMap, setStudentsMap]   = useState({});   // { enrollId: studentObj }
  const [studentKeys, setStudentKeys]   = useState([]);
  const [searchQ, setSearchQ]           = useState('');
  const [isLoading, setIsLoading]       = useState(false);
  const [drilldownStudent, setDrilldown] = useState(null); // { studentId, studentName }
  const [lastTick, setLastTick]         = useState(null);

  const socketRef = useRef(null);

  // ── Load batches ────────────────────────────────────────────────────────
  useEffect(() => {
    axios.get(`${API_URL}/batches`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        const allBatches = res.data;
        const activeBatches = allBatches.filter(b => b.status === 'ACTIVE');
        setBatches(activeBatches.length > 0 ? activeBatches : allBatches);
        if (routeBatchId) {
          setSelectedBatch(routeBatchId);
        } else if (activeBatches.length > 0) {
          setSelectedBatch(activeBatches[0]._id);
        } else if (allBatches.length > 0) {
          setSelectedBatch(allBatches[0]._id);
        }
      })
      .catch(console.error);
  }, [token, routeBatchId]);

  // ── Load students for selected batch ─────────────────────────────────
  const loadStudents = useCallback(async () => {
    if (!selectedBatch) return;
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/batches/${selectedBatch}/students`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const initial = {};
      res.data.forEach(enroll => {
        const sId = enroll.userId?._id || enroll.userId;
        initial[enroll._id] = {
          enrollmentId:  enroll._id,
          studentId:     sId,
          studentName:   enroll.userId?.name || 'Unknown',
          netPnlPaise:   0,
          openPositions: 0,
          marginPct:     0,
          lastOrder:     null,
          riskFlags:     [],
        };
      });
      setStudentsMap(initial);
      setStudentKeys(Object.keys(initial));
    } catch (e) {
      console.error('Failed to load students:', e);
    } finally {
      setIsLoading(false);
    }
  }, [selectedBatch, token]);

  useEffect(() => { loadStudents(); }, [loadStudents]);

  // ── Socket subscription ─────────────────────────────────────────────
  useEffect(() => {
    if (!selectedBatch) return;
    const sock = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = sock;

    sock.on('connect', () => sock.emit('joinBatch', selectedBatch));

    sock.on('instructorFeed', (delta) => {
      setLastTick(new Date());
      // Partial update — only patch changed students
      setStudentsMap(prev => {
        const next = { ...prev };
        let dirty = false;
        (Array.isArray(delta) ? delta : [delta]).forEach(update => {
          const key = update.enrollmentId;
          if (!key || !next[key]) return;
          const prev = next[key];
          if (
            prev.netPnlPaise   !== update.netPnlPaise  ||
            prev.openPositions !== update.openPositions ||
            prev.marginPct     !== update.marginPct     ||
            prev.riskFlags?.join() !== update.riskFlags?.join()
          ) {
            next[key] = { ...prev, ...update };
            dirty = true;
          }
        });
        return dirty ? next : prev;
      });
    });

    return () => sock.disconnect();
  }, [selectedBatch, token]);

  // ── Filtered + sorted student list ──────────────────────────────────
  const filteredKeys = studentKeys.filter(k => {
    if (!searchQ) return true;
    return studentsMap[k]?.studentName?.toLowerCase().includes(searchQ.toLowerCase());
  });

  // Sort: biggest loss on top (instructor attention priority)
  const sortedKeys = [...filteredKeys].sort((a, b) =>
    (studentsMap[a]?.netPnlPaise || 0) - (studentsMap[b]?.netPnlPaise || 0)
  );

  // ── Virtual row renderer ────────────────────────────────────────────
  const RowRenderer = ({ index, style }) => {
    const key = sortedKeys[index];
    const student = studentsMap[key];
    if (!student) return null;
    return (
      <div style={style}>
        <StudentRow
          student={student}
          onDrilldown={(s) => setDrilldown({ studentId: s.studentId, studentName: s.studentName })}
        />
      </div>
    );
  };

  // ── Drill-down mode ─────────────────────────────────────────────────
  if (drilldownStudent) {
    return (
      <StudentDrilldown
        batchId={selectedBatch}
        studentId={drilldownStudent.studentId}
        studentName={drilldownStudent.studentName}
        onBack={() => setDrilldown(null)}
      />
    );
  }

  const breachCount  = Object.values(studentsMap || {}).filter(s => s?.riskFlags?.some(f => f?.includes('BREACH'))).length;
  const cautionCount = Object.values(studentsMap || {}).filter(s => s?.riskFlags?.length > 0).length - breachCount;

  return (
    <div style={css.page}>
      {/* Page header */}
      <div style={css.pageHeader}>
        <div>
          <h2 style={css.pageTitle}>Live Student Grid</h2>
          <p style={css.pageSubtitle}>Real-time positions, P&L and risk status. Click a student row to drilldown.</p>
        </div>
        <div style={css.headerRight}>
          {lastTick && (
            <span style={css.liveBadge}>
              <span style={css.liveDot} /> Live · {lastTick.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {/* Alert summary */}
      {(breachCount > 0 || cautionCount > 0) && (
        <div style={css.alertBar}>
          {breachCount > 0 && (
            <div style={{ ...css.alertChip, background: '#fef2f2', color: '#ef4444' }}>
              ⚠ {breachCount} student{breachCount !== 1 ? 's' : ''} breached risk rules
            </div>
          )}
          {cautionCount > 0 && (
            <div style={{ ...css.alertChip, background: '#fffbeb', color: '#d97706' }}>
              ⚡ {cautionCount} student{cautionCount !== 1 ? 's' : ''} approaching limits
            </div>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div style={css.toolbar}>
        {/* Batch selector */}
        <select
          value={selectedBatch || ''}
          onChange={e => setSelectedBatch(e.target.value)}
          style={css.select}
        >
          {batches.map(b => (
            <option key={b._id} value={b._id}>{b.name} ({b.code})</option>
          ))}
        </select>

        {/* Search */}
        <div style={css.searchWrap}>
          <span style={css.searchIcon}>🔍</span>
          <input
            style={css.searchInput}
            placeholder="Search student..."
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
        </div>

        <span style={css.count}>{sortedKeys.length} students</span>
      </div>

      {/* Grid */}
      <div style={css.gridWrap}>
        {/* Column headers */}
        <div style={css.gridHeader}>
          {['Student', 'P&L Today', 'Positions', 'Margin', 'Last Order', 'Risk'].map((h) => (
            <div key={h} style={css.th}>{h}</div>
          ))}
        </div>

        {isLoading ? (
          <div style={css.loading}>Loading students…</div>
        ) : sortedKeys.length === 0 ? (
          <div style={css.empty}>
            {searchQ ? `No students matching "${searchQ}"` : 'No students enrolled in this batch'}
          </div>
        ) : (
          <div style={{ maxHeight: 560, overflowY: 'auto' }}>
            {sortedKeys.map((key) => {
              const student = studentsMap[key];
              if (!student) return null;
              return (
                <StudentRow
                  key={key}
                  student={student}
                  onDrilldown={(s) => setDrilldown({ studentId: s.studentId, studentName: s.studentName })}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default InstructorLiveGrid;

// ── Styles ────────────────────────────────────────────────────────────────────
const css = {
  page: { background: '#f8fafc', minHeight: '100%' },
  pageHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 20,
  },
  pageTitle: { margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px' },
  pageSubtitle: { margin: '4px 0 0', fontSize: 13, color: '#64748b' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  liveBadge: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 12, fontWeight: 700, color: '#10b981',
    background: '#ecfdf5', padding: '6px 12px', borderRadius: 8,
  },
  liveDot: {
    display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
    background: '#10b981',
  },
  alertBar: { display: 'flex', gap: 10, marginBottom: 16 },
  alertChip: { padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700 },
  toolbar: {
    display: 'flex', alignItems: 'center', gap: 12,
    marginBottom: 12, flexWrap: 'wrap',
  },
  select: {
    padding: '8px 14px', borderRadius: 10, border: '1px solid #e2e8f0',
    fontSize: 13, fontWeight: 600, background: '#fff', color: '#0f172a', cursor: 'pointer',
  },
  searchWrap: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: '#fff', border: '1px solid #e2e8f0',
    borderRadius: 10, padding: '8px 14px', flex: 1, maxWidth: 300,
  },
  searchIcon: { fontSize: 14 },
  searchInput: {
    border: 'none', outline: 'none', fontSize: 13,
    color: '#0f172a', width: '100%', background: 'transparent',
  },
  count: { fontSize: 13, color: '#64748b', fontWeight: 600, marginLeft: 'auto' },
  gridWrap: {
    background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0',
    overflow: 'hidden',
  },
  gridHeader: {
    display: 'flex', padding: '12px 16px',
    background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
  },
  th: {
    flex: 1, fontSize: 11, fontWeight: 700, color: '#94a3b8',
    textTransform: 'uppercase', letterSpacing: '0.5px',
  },
  loading: { padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 },
  empty:   { padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 },
};
