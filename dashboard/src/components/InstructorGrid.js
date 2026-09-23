import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { List } from 'react-window';
import axios from 'axios';

const SOCKET_URL = process.env.REACT_APP_API_URL || "http://localhost:8080";
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080";

const InstructorGrid = ({ batchId, onRowClick }) => {
  const [studentsData, setStudentsData] = useState({});
  const [studentKeys, setStudentKeys] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const socketRef = useRef(null);

  useEffect(() => {
    // 1. Fetch initial snapshot
    axios.get(`${API_URL}/batches/${batchId}/students`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }
    })
    .then(res => {
      // res.data is array of enrollments
      const initial = {};
      res.data.forEach(enroll => {
        initial[enroll._id] = {
          enrollmentId: enroll._id,
          studentName: enroll.userId.name,
          netPnlPaise: 0,
          openPositions: 0,
          marginUsedPaise: 0,
          lastOrderAt: null,
          riskFlags: []
        };
      });
      setStudentsData(initial);
      setStudentKeys(Object.keys(initial));
      setIsLoading(false);
    })
    .catch(err => {
      console.error('Failed to load students:', err);
      setIsLoading(false);
    });

    // 2. Setup Socket for Live Grid Delta Updates
    socketRef.current = io(SOCKET_URL);
    socketRef.current.on('connect', () => {
      socketRef.current.emit('joinBatch', batchId);
    });

    socketRef.current.on('instructorFeed', (deltaPayload) => {
      setStudentsData(prev => {
        const nextState = { ...prev };
        let changed = false;
        
        deltaPayload.forEach(student => {
          // Only update if it actually changed to prevent useless renders
          if (JSON.stringify(nextState[student.enrollmentId]) !== JSON.stringify(student)) {
            nextState[student.enrollmentId] = student;
            changed = true;
          }
        });

        return changed ? nextState : prev;
      });
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, [batchId]);

  const Row = ({ index, style }) => {
    const key = studentKeys[index];
    const data = studentsData[key];

    if (!data) return null;

    const netPnl = data.netPnlPaise / 100;
    const isLoss = netPnl < 0;

    return (
      <div 
        style={{ ...style, ...rowStyles, cursor: onRowClick ? 'pointer' : 'default' }} 
        onClick={() => onRowClick && onRowClick(data.studentId, data.studentName)}
      >
        <div style={cellStyles}>{data.studentName}</div>
        <div style={{ ...cellStyles, color: isLoss ? '#ef4444' : '#10b981', fontWeight: 'bold' }}>
          {isLoss ? '-' : '+'}₹{Math.abs(netPnl).toFixed(2)}
        </div>
        <div style={cellStyles}>{data.openPositions}</div>
        <div style={cellStyles}>₹{(data.marginUsedPaise / 100).toFixed(2)}</div>
        <div style={cellStyles}>
          {data.riskFlags.map(f => (
            <span key={f} style={badgeStyles}>{f}</span>
          ))}
        </div>
      </div>
    );
  };

  if (isLoading) return <div style={{ padding: 20, color: '#64748b' }}>Loading grid...</div>;

  return (
    <div style={{ width: '100%' }}>
      <div style={headerRowStyles}>
        <div style={cellStyles}>Student Name</div>
        <div style={cellStyles}>Net P&L</div>
        <div style={cellStyles}>Open Pos</div>
        <div style={cellStyles}>Margin Used</div>
        <div style={cellStyles}>Risk Flags</div>
      </div>
      <List
        height={500}
        itemCount={studentKeys.length}
        itemSize={56}
        width={'100%'}
      >
        {Row}
      </List>
    </div>
  );
};

// Styles
const headerRowStyles = { display: 'flex', padding: '12px 16px', fontWeight: '600', color: '#475569', fontSize: '13px', borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase' };
const rowStyles = { display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid #f1f5f9', fontSize: '14px', color: '#0f172a' };
const cellStyles = { flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const badgeStyles = { background: '#fef2f2', color: '#ef4444', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '600', marginRight: '6px' };

export default InstructorGrid;
