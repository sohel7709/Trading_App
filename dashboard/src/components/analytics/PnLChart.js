import React, { useState, useEffect } from 'react';
import {
  Box, Typography, ButtonGroup, Button, CircularProgress,
  Skeleton, Alert
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  ShowChart as LineChartIcon,
  BarChart as BarChartIcon
} from '@mui/icons-material';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import axios from 'axios';
import { API_URL } from '../../context/AuthContext';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const getAuthHeaders = () => {
  const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
};

const fmtRupees = (val) => {
  const num = Number(val || 0);
  const sign = num > 0 ? '+' : '';
  return `${sign}₹${num.toLocaleString('en-IN', { maximumFractionDigits: 1 })}`;
};

export const PnLChart = ({ studentId, data: directData, height = 240 }) => {
  const [chartMode, setChartMode] = useState('cumulative'); // 'cumulative' | 'daily'
  const [history, setHistory] = useState(directData || []);
  const [loading, setLoading] = useState(!directData);
  const [error, setError] = useState('');

  useEffect(() => {
    if (directData) {
      setHistory(directData);
      setLoading(false);
      return;
    }

    if (!studentId) return;

    setLoading(true);
    setError('');
    axios.get(`${API_URL}/student/${studentId}/pnl-history`, getAuthHeaders())
      .then(res => {
        setHistory(Array.isArray(res.data) ? res.data : []);
      })
      .catch(err => {
        console.error('Failed to load PnL history:', err);
        setError(err.response?.data?.message || 'Failed to load PnL history');
      })
      .finally(() => setLoading(false));
  }, [studentId, directData]);

  if (loading) {
    return (
      <Box sx={{ p: 2 }}>
        <Skeleton variant="rectangular" width="100%" height={40} sx={{ borderRadius: 2, mb: 2 }} />
        <Skeleton variant="rectangular" width="100%" height={height} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>;
  }

  if (!history || history.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: 'center', bgcolor: '#f8fafc', borderRadius: 2.5, border: '1px dashed #cbd5e1' }}>
        <Typography sx={{ color: '#64748b', fontSize: 13, fontWeight: 500 }}>
          No PnL history recorded yet. Trades will appear on the equity curve as orders execute.
        </Typography>
      </Box>
    );
  }

  const labels = history.map(h => {
    const parts = h.date.split('-');
    if (parts.length === 3) {
      const d = new Date(h.date);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return h.date;
  });

  const cumulativeData = history.map(h => h.cumulativePnl);
  const dailyData = history.map(h => h.pnl);

  const finalPnl = cumulativeData[cumulativeData.length - 1] || 0;
  const isOverallProfit = finalPnl >= 0;

  const bestDay = Math.max(...dailyData);
  const worstDay = Math.min(...dailyData);
  const greenDays = dailyData.filter(p => p > 0).length;
  const redDays = dailyData.filter(p => p < 0).length;

  const lineChartData = {
    labels,
    datasets: [
      {
        label: 'Cumulative P&L',
        data: cumulativeData,
        borderColor: isOverallProfit ? '#10b981' : '#ef4444',
        backgroundColor: (context) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, height);
          if (isOverallProfit) {
            gradient.addColorStop(0, 'rgba(16, 185, 129, 0.28)');
            gradient.addColorStop(1, 'rgba(16, 185, 129, 0.00)');
          } else {
            gradient.addColorStop(0, 'rgba(239, 68, 68, 0.28)');
            gradient.addColorStop(1, 'rgba(239, 68, 68, 0.00)');
          }
          return gradient;
        },
        fill: true,
        tension: 0.35,
        borderWidth: 2.5,
        pointRadius: history.length > 15 ? 0 : 3.5,
        pointHoverRadius: 6,
        pointBackgroundColor: isOverallProfit ? '#10b981' : '#ef4444',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
      }
    ]
  };

  const barChartData = {
    labels,
    datasets: [
      {
        label: 'Daily P&L',
        data: dailyData,
        backgroundColor: dailyData.map(v => (v >= 0 ? '#10b981' : '#ef4444')),
        borderRadius: 4,
        borderSkipped: false,
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f172a',
        titleFont: { size: 12, weight: 'bold' },
        bodyFont: { size: 12 },
        padding: 10,
        cornerRadius: 8,
        displayColors: false,
        callbacks: {
          label: (context) => {
            const val = context.parsed.y;
            return `P&L: ${fmtRupees(val)}`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 11 }, color: '#64748b' }
      },
      y: {
        grid: { color: '#f1f5f9' },
        ticks: {
          font: { size: 11 },
          color: '#64748b',
          callback: (val) => fmtRupees(val)
        }
      }
    }
  };

  return (
    <Box sx={{ width: '100%' }}>
      {/* Controls & Mini Summary */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            px: 1.5,
            py: 0.5,
            borderRadius: 2,
            bgcolor: isOverallProfit ? '#ecfdf5' : '#fef2f2',
            border: `1px solid ${isOverallProfit ? '#a7f3d0' : '#fecaca'}`
          }}>
            {isOverallProfit ? (
              <TrendingUpIcon sx={{ fontSize: 18, color: '#059669' }} />
            ) : (
              <TrendingDownIcon sx={{ fontSize: 18, color: '#dc2626' }} />
            )}
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: isOverallProfit ? '#059669' : '#dc2626' }}>
              {fmtRupees(finalPnl)} Net P&L
            </Typography>
          </Box>
        </Box>

        <ButtonGroup size="small" variant="outlined" sx={{ borderRadius: 2 }}>
          <Button
            onClick={() => setChartMode('cumulative')}
            startIcon={<LineChartIcon sx={{ fontSize: 16 }} />}
            sx={{
              textTransform: 'none',
              fontSize: 12,
              fontWeight: 600,
              bgcolor: chartMode === 'cumulative' ? '#2563eb' : 'transparent',
              color: chartMode === 'cumulative' ? '#fff' : '#64748b',
              '&:hover': { bgcolor: chartMode === 'cumulative' ? '#1d4ed8' : '#f1f5f9' }
            }}
          >
            Equity Curve
          </Button>
          <Button
            onClick={() => setChartMode('daily')}
            startIcon={<BarChartIcon sx={{ fontSize: 16 }} />}
            sx={{
              textTransform: 'none',
              fontSize: 12,
              fontWeight: 600,
              bgcolor: chartMode === 'daily' ? '#2563eb' : 'transparent',
              color: chartMode === 'daily' ? '#fff' : '#64748b',
              '&:hover': { bgcolor: chartMode === 'daily' ? '#1d4ed8' : '#f1f5f9' }
            }}
          >
            Daily P&L
          </Button>
        </ButtonGroup>
      </Box>

      {/* Chart Canvas */}
      <Box sx={{ height, width: '100%', position: 'relative' }}>
        {chartMode === 'cumulative' ? (
          <Line data={lineChartData} options={chartOptions} />
        ) : (
          <Bar data={barChartData} options={chartOptions} />
        )}
      </Box>

      {/* Footer Metrics Row */}
      <Box sx={{ display: 'flex', justifyContent: 'space-around', mt: 2, pt: 1.5, borderTop: '1px solid #f1f5f9' }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography sx={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>BEST DAY</Typography>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>
            {bestDay > 0 ? fmtRupees(bestDay) : '₹0'}
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'center' }}>
          <Typography sx={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>WORST DAY</Typography>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: worstDay < 0 ? '#ef4444' : '#64748b' }}>
            {worstDay < 0 ? fmtRupees(worstDay) : '₹0'}
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'center' }}>
          <Typography sx={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>WIN / LOSS DAYS</Typography>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
            <Box component="span" sx={{ color: '#10b981' }}>{greenDays}W</Box> / <Box component="span" sx={{ color: '#ef4444' }}>{redDays}L</Box>
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default PnLChart;
