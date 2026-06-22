import React, { useState, useEffect } from "react";
import axios from "axios";
import DashboardIcon from '@mui/icons-material/Dashboard';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ReceiptIcon from '@mui/icons-material/Receipt';

const API_URL = "http://localhost:8080";

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      axios.get(`${API_URL}/allOrders`),
      axios.get(`${API_URL}/trades`),
      axios.get(`${API_URL}/wallet`),
      axios.get(`${API_URL}/allHoldings`),
      axios.get(`${API_URL}/allPositions`),
      axios.get(`${API_URL}/alerts`),
      axios.get(`${API_URL}/watchlists`),
      axios.get(`${API_URL}/funds`),
    ]).then(([orders, trades, wallet, holdings, positions, alerts, watchlists, funds]) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayOrders = orders.data.filter(o => new Date(o.createdAt) >= today);
      const todayTrades = trades.data.filter(t => new Date(t.createdAt) >= today);

      const totalOrderValue = trades.data.reduce((s, t) => s + t.totalValue, 0);
      const totalCharges = trades.data.reduce((s, t) => s + (t.charges || 0), 0);

      setStats({
        totalOrders: orders.data.length,
        todayOrders: todayOrders.length,
        totalTrades: trades.data.length,
        todayTrades: todayTrades.length,
        wallet: wallet.data,
        holdingsCount: holdings.data.length,
        positionsCount: positions.data.length,
        alertsCount: alerts.data.length,
        watchlistsCount: watchlists.data.length,
        fundTxCount: funds.data.length,
        totalOrderValue,
        totalCharges,
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="content-inner"><h3 className="title">Admin Panel</h3><p>Loading...</p></div>;
  if (!stats) return <div className="content-inner"><h3 className="title">Admin Panel</h3><p>Error loading data</p></div>;

  const cards = [
    { icon: <DashboardIcon />, label: 'Total Orders', value: stats.totalOrders, sub: `${stats.todayOrders} today`, color: '#4184f3' },
    { icon: <TrendingUpIcon />, label: 'Total Trades', value: stats.totalTrades, sub: `${stats.todayTrades} today`, color: '#00b386' },
    { icon: <AccountBalanceWalletIcon />, label: 'Wallet Balance', value: `₹${stats.wallet.balance.toLocaleString('en-IN')}`, sub: `Used: ₹${stats.wallet.usedMargin.toLocaleString('en-IN')}`, color: '#6366f1' },
    { icon: <ReceiptIcon />, label: 'Total Trade Value', value: `₹${stats.totalOrderValue.toLocaleString('en-IN')}`, sub: `Charges: ₹${stats.totalCharges.toFixed(2)}`, color: '#eb5b3c' },
  ];

  return (
    <div className="content-inner">
      <h3 className="title">Admin Dashboard</h3>

      <div className="row" style={{ flexWrap: 'wrap' }}>
        {cards.map((card, i) => (
          <div className="col" key={i} style={{ minWidth: 220 }}>
            <div className="section" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', color: card.color, marginBottom: 8 }}>{card.icon}</div>
              <p style={{ fontSize: '2rem', fontWeight: 700, color: '#333' }}>{card.value}</p>
              <p style={{ color: '#888', fontSize: '0.82rem' }}>{card.label}</p>
              <p style={{ color: '#aaa', fontSize: '0.72rem', marginTop: 4 }}>{card.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="row">
        <div className="col">
          <div className="section">
            <span><p>Portfolio Overview</p></span>
            <div className="table">
              <div className="data"><p>Holdings</p><p>{stats.holdingsCount} stocks</p></div>
              <div className="data"><p>Positions</p><p>{stats.positionsCount} open</p></div>
              <div className="data"><p>Watchlists</p><p>{stats.watchlistsCount}</p></div>
              <div className="data"><p>Price Alerts</p><p>{stats.alertsCount}</p></div>
              <div className="data"><p>Fund Transactions</p><p>{stats.fundTxCount}</p></div>
            </div>
          </div>
        </div>
        <div className="col">
          <div className="section">
            <span><p>Margin Details</p></span>
            <div className="table">
              <div className="data"><p>Balance</p><p className="imp">₹{stats.wallet.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div>
              <div className="data"><p>Used Margin</p><p className="imp">₹{stats.wallet.usedMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div>
              <div className="data"><p>Available</p><p className="imp colored">₹{stats.wallet.availableMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;