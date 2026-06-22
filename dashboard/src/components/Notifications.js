import React, { useState, useEffect } from "react";
import axios from "axios";
import NotificationsIcon from '@mui/icons-material/Notifications';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

const API_URL = "http://localhost:8080";

const Notifications = () => {
  const [alerts, setAlerts] = useState([]);
  const [newAlert, setNewAlert] = useState({ stockSymbol: '', targetPrice: '', condition: 'ABOVE' });
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const fetchAlerts = () => {
    axios.get(`${API_URL}/alerts`)
      .then(res => { setAlerts(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchAlerts(); }, []);

  const createAlert = () => {
    if (!newAlert.stockSymbol || !newAlert.targetPrice) {
      setMsg('Please fill all fields');
      return;
    }
    axios.post(`${API_URL}/alerts`, {
      stockSymbol: newAlert.stockSymbol,
      targetPrice: Number(newAlert.targetPrice),
      condition: newAlert.condition,
    }).then(res => {
      setMsg(`Alert created for ${res.data.stockSymbol}`);
      setNewAlert({ stockSymbol: '', targetPrice: '', condition: 'ABOVE' });
      fetchAlerts();
    }).catch(err => setMsg(err.response?.data?.message || 'Error'));
  };

  const deleteAlert = (id) => {
    axios.delete(`${API_URL}/alerts/${id}`).then(() => fetchAlerts());
  };

  if (loading) return <div className="content-inner"><h3 className="title">Alerts & Notifications</h3><p>Loading...</p></div>;

  return (
    <div className="content-inner">
      <h3 className="title"><NotificationsIcon style={{ verticalAlign: 'middle', marginRight: 8 }} /> Alerts & Notifications</h3>

      <div className="section">
        <span><p>Create Price Alert</p></span>
        <div className="fund-actions" style={{ gap: 10 }}>
          <input type="text" placeholder="Symbol (e.g. INFY)" value={newAlert.stockSymbol}
            onChange={e => setNewAlert({ ...newAlert, stockSymbol: e.target.value.toUpperCase() })}
            style={{ padding: '8px 12px', border: '1px solid #e0e0e0', borderRadius: 6, width: 130 }} />
          <select value={newAlert.condition} onChange={e => setNewAlert({ ...newAlert, condition: e.target.value })}
            style={{ padding: '8px 12px', border: '1px solid #e0e0e0', borderRadius: 6 }}>
            <option value="ABOVE">Above</option>
            <option value="BELOW">Below</option>
          </select>
          <input type="number" placeholder="Target Price" value={newAlert.targetPrice}
            onChange={e => setNewAlert({ ...newAlert, targetPrice: e.target.value })}
            style={{ padding: '8px 12px', border: '1px solid #e0e0e0', borderRadius: 6, width: 130 }} />
          <button className="btn btn-blue" onClick={createAlert}>Create Alert</button>
        </div>
        {msg && <p style={{ marginTop: 8, fontSize: '0.8rem', color: '#00b386' }}>{msg}</p>}
      </div>

      {alerts.length === 0 ? (
        <div className="no-orders"><p>No alerts set</p></div>
      ) : (
        <div className="order-table" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr><th>Symbol</th><th>Condition</th><th>Target Price</th><th>Status</th><th>Created</th><th></th></tr>
            </thead>
            <tbody>
              {alerts.map(a => (
                <tr key={a._id}>
                  <td>{a.stockSymbol}</td>
                  <td>Price {a.condition} ₹{a.targetPrice}</td>
                  <td>₹{a.targetPrice}</td>
                  <td className={a.active ? 'profit' : 'loss'}>
                    <CheckCircleIcon style={{ fontSize: 14, marginRight: 4 }} />
                    {a.active ? 'Active' : 'Inactive'}
                  </td>
                  <td>{new Date(a.createdAt).toLocaleDateString('en-IN')}</td>
                  <td><button className="btn btn-grey" onClick={() => deleteAlert(a._id)} style={{ padding: '4px 10px', fontSize: '0.7rem' }}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Notifications;