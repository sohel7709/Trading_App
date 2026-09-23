/**
 * AnnouncementCenter.js  (NEW)
 * ─────────────────────────────
 * Instructor broadcast page.
 * Emits socket `announcement` event to all students in a batch.
 *
 * Features:
 * - Batch selector
 * - Message composer
 * - History of past announcements
 * - Real-time delivery confirmation
 */

import React, { useState, useEffect, useRef, useContext } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { AuthContext } from '../../context/AuthContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

// ── Quick templates ───────────────────────────────────────────────────────────
const TEMPLATES = [
  { label: '📢 Start session', text: 'Trading session is now OPEN. Good luck! Remember your risk rules.' },
  { label: '⏸ Pause session', text: 'Session is temporarily PAUSED. Please close your positions.' },
  { label: '🛑 End session', text: 'Trading session has ENDED. Please review your trades in the journal.' },
  { label: '⚠ Risk reminder', text: 'Reminder: do not exceed 1% risk per trade. Monitor your margin usage.' },
  { label: '📊 Review now', text: 'Take a moment to review your open positions and P&L before the session ends.' },
];

function AnnouncementBubble({ msg }) {
  const isAnnouncement = msg.type === 'ANNOUNCEMENT';
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'flex-end', marginBottom: 12,
    }}>
      <div style={{
        maxWidth: 480, background: isAnnouncement ? '#1A73E8' : '#f1f5f9',
        color: isAnnouncement ? '#fff' : '#0f172a',
        borderRadius: '16px 16px 4px 16px',
        padding: '12px 16px', fontSize: 14, lineHeight: 1.6,
      }}>
        {msg.message}
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
        {msg.batchLabel && <span>{msg.batchLabel} · </span>}
        {new Date(msg.timestamp || msg.createdAt).toLocaleTimeString('en-IN', {
          hour: '2-digit', minute: '2-digit',
        })}
      </div>
    </div>
  );
}

export default function AnnouncementCenter() {
  const { user } = useContext(AuthContext);
  const token = localStorage.getItem('accessToken');

  const [batches, setBatches]     = useState([]);
  const [selectedBatch, setSelectedBatch] = useState('all');
  const [message, setMessage]     = useState('');
  const [sending, setSending]     = useState(false);
  const [history, setHistory]     = useState([]);
  const [connected, setConnected] = useState(false);

  const socketRef = useRef(null);
  const historyEndRef = useRef(null);

  // ── Load batches ────────────────────────────────────────────────────
  useEffect(() => {
    axios.get(`${API_URL}/batches`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setBatches(res.data.filter(b => b.status === 'ACTIVE')))
      .catch(console.error);
  }, [token]);

  // ── Socket connection ───────────────────────────────────────────────
  useEffect(() => {
    const sock = io(API_URL, { auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = sock;
    sock.on('connect', () => setConnected(true));
    sock.on('disconnect', () => setConnected(false));
    sock.on('announcement', (data) => {
      setHistory(prev => [...prev, { ...data, timestamp: data.timestamp || new Date() }]);
    });
    return () => sock.disconnect();
  }, [token]);

  // ── Scroll to bottom on new message ────────────────────────────────
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  // ── Send announcement ───────────────────────────────────────────────
  const send = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    try {
      const payload = {
        batchId: selectedBatch === 'all' ? null : selectedBatch,
        message: message.trim(),
        type: 'ANNOUNCEMENT',
        from: user?.name || 'Instructor',
        timestamp: new Date(),
        batchLabel: selectedBatch === 'all'
          ? 'All batches'
          : batches.find(b => b._id === selectedBatch)?.name || '',
      };

      // Emit via socket (broadcast to students)
      socketRef.current?.emit('announcement', payload);

      // Also add to local history
      setHistory(prev => [...prev, payload]);
      setMessage('');
    } catch (e) {
      console.error('Send failed:', e);
    } finally {
      setSending(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
  };

  return (
    <div style={css.page}>
      {/* Header */}
      <div style={css.header}>
        <div>
          <h2 style={css.title}>Announcement Center</h2>
          <p style={css.subtitle}>Broadcast messages instantly to all students in a batch.</p>
        </div>
        <div style={{
          ...css.statusBadge,
          background: connected ? '#ecfdf5' : '#fef2f2',
          color: connected ? '#10b981' : '#ef4444',
        }}>
          <span style={{
            display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
            background: connected ? '#10b981' : '#ef4444', marginRight: 6,
          }} />
          {connected ? 'Socket Connected' : 'Reconnecting…'}
        </div>
      </div>

      <div style={css.layout}>
        {/* Left: Composer */}
        <div style={css.composerPanel}>
          <h3 style={css.panelTitle}>Send Message</h3>

          {/* Batch selector */}
          <div style={css.field}>
            <label style={css.label}>SEND TO</label>
            <select
              style={css.select}
              value={selectedBatch}
              onChange={e => setSelectedBatch(e.target.value)}
            >
              <option value="all">All Active Batches</option>
              {batches.map(b => (
                <option key={b._id} value={b._id}>{b.name} ({b.code})</option>
              ))}
            </select>
          </div>

          {/* Quick templates */}
          <div style={css.field}>
            <label style={css.label}>QUICK TEMPLATES</label>
            <div style={css.templateList}>
              {TEMPLATES.map(t => (
                <button
                  key={t.label}
                  style={css.templateBtn}
                  onClick={() => setMessage(t.text)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Message composer */}
          <div style={css.field}>
            <label style={css.label}>MESSAGE</label>
            <textarea
              style={css.textarea}
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Type your announcement here… (Ctrl+Enter to send)"
              rows={5}
            />
            <div style={css.charCount}>{message.length} chars</div>
          </div>

          <button
            style={{
              ...css.sendBtn,
              opacity: (!message.trim() || sending) ? 0.5 : 1,
              cursor: (!message.trim() || sending) ? 'not-allowed' : 'pointer',
            }}
            onClick={send}
            disabled={!message.trim() || sending}
          >
            {sending ? '⏳ Sending…' : '📢 Broadcast Announcement'}
          </button>
        </div>

        {/* Right: History */}
        <div style={css.historyPanel}>
          <h3 style={css.panelTitle}>Message History</h3>
          <div style={css.historyScroll}>
            {history.length === 0 ? (
              <div style={css.emptyHistory}>
                No announcements sent yet in this session.
              </div>
            ) : (
              history.map((msg, i) => (
                <AnnouncementBubble key={i} msg={msg} />
              ))
            )}
            <div ref={historyEndRef} />
          </div>
        </div>
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
  statusBadge: {
    display: 'flex', alignItems: 'center',
    padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
  },
  layout: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 },
  composerPanel: {
    background: '#fff', borderRadius: 16, padding: 24,
    border: '1px solid #e2e8f0',
  },
  historyPanel: {
    background: '#fff', borderRadius: 16, padding: 24,
    border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column',
  },
  panelTitle: { margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#0f172a' },
  field: { marginBottom: 20 },
  label: {
    display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8,
  },
  select: {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: '1px solid #e2e8f0', fontSize: 14, color: '#0f172a',
    background: '#f8fafc', cursor: 'pointer',
  },
  templateList: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  templateBtn: {
    background: '#f1f5f9', border: 'none', borderRadius: 8,
    padding: '7px 12px', fontSize: 12, fontWeight: 600,
    color: '#475569', cursor: 'pointer',
  },
  textarea: {
    width: '100%', borderRadius: 12, border: '1px solid #e2e8f0',
    padding: '12px 14px', fontSize: 14, color: '#0f172a',
    background: '#f8fafc', resize: 'vertical', lineHeight: 1.6,
    boxSizing: 'border-box', fontFamily: 'inherit',
  },
  charCount: { fontSize: 11, color: '#94a3b8', textAlign: 'right', marginTop: 4 },
  sendBtn: {
    width: '100%', background: '#7c3aed', color: '#fff',
    border: 'none', borderRadius: 12, padding: '14px 20px',
    fontSize: 15, fontWeight: 700, cursor: 'pointer', transition: 'opacity 0.2s',
  },
  historyScroll: {
    flex: 1, overflowY: 'auto', paddingTop: 8,
    maxHeight: 480,
  },
  emptyHistory: {
    textAlign: 'center', padding: '40px 0',
    fontSize: 14, color: '#94a3b8',
  },
};
