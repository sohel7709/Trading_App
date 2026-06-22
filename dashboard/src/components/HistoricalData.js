import React, { useState, useEffect, useContext } from "react";
import axios from "axios";
import { useSearchParams, useNavigate } from "react-router-dom";
import GeneralContext from "./GeneralContext";
import jsPDF from "jspdf";
import "jspdf-autotable";

const API_URL = "http://localhost:8080";

const HistoricalData = () => {
  const [searchParams] = useSearchParams();
  const symbol = (searchParams.get("symbol") || "INFY").toUpperCase();
  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const { openBuyWindow, openSellWindow } = useContext(GeneralContext);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    axios.get(`${API_URL}/market/history/${symbol}?days=${days}`)
      .then(res => { setCandles(res.data.candles || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [symbol, days]);

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Historical Data: ${symbol}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Period: Last ${days} days | Generated: ${new Date().toLocaleString('en-IN')}`, 14, 28);
    doc.autoTable({
      startY: 35,
      head: [['Date', 'Open', 'High', 'Low', 'Close', 'Volume']],
      body: candles.map(c => [
        new Date(c.time * 1000).toLocaleDateString('en-IN'),
        c.open.toFixed(2), c.high.toFixed(2), c.low.toFixed(2), c.close.toFixed(2),
        c.volume.toLocaleString('en-IN'),
      ]),
      theme: 'grid',
      headStyles: { fillColor: [65, 132, 243], textColor: 255 },
      styles: { fontSize: 8 },
    });
    doc.save(`${symbol}-history-${days}d.pdf`);
  };

  const exportCSV = () => {
    const rows = candles.map(c => [
      new Date(c.time * 1000).toLocaleDateString('en-IN'),
      c.open.toFixed(2), c.high.toFixed(2), c.low.toFixed(2), c.close.toFixed(2), c.volume,
    ]);
    const csv = [['Date','Open','High','Low','Close','Volume'], ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${symbol}-history-${days}d.csv`;
    a.click();
  };

  const dayOptions = [7, 15, 30, 60, 90, 180, 365];

  if (loading) return <div className="content-inner"><h3 className="title">Historical Data: {symbol}</h3><p>Loading...</p></div>;

  return (
    <div className="content-inner">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <h3 className="title" style={{ marginBottom: 0 }}>Historical Data: {symbol}</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={days} onChange={e => setDays(Number(e.target.value))}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e0e0e0', fontSize: '0.82rem' }}>
            {dayOptions.map(d => <option key={d} value={d}>Last {d} days</option>)}
          </select>
          <button className="btn btn-blue" onClick={() => navigate(`/chart?symbol=${symbol}`)} style={{ fontSize: '0.8rem', padding: '6px 14px' }}>Chart</button>
          <button className="btn btn-blue" onClick={() => navigate(`/tradingview?symbol=${symbol}`)} style={{ fontSize: '0.8rem', padding: '6px 14px' }}>TV Chart</button>
          <button className="btn btn-blue" onClick={() => openBuyWindow(symbol)} style={{ fontSize: '0.8rem', padding: '6px 14px' }}>Buy</button>
          <button className="btn btn-red" onClick={() => openSellWindow(symbol)} style={{ fontSize: '0.8rem', padding: '6px 14px' }}>Sell</button>
          <button className="btn btn-green" onClick={exportPDF} style={{ fontSize: '0.8rem', padding: '6px 14px' }}>PDF</button>
          <button className="btn btn-green" onClick={exportCSV} style={{ fontSize: '0.8rem', padding: '6px 14px' }}>CSV</button>
        </div>
      </div>

      {candles.length === 0 ? (
        <div className="no-orders"><p>No historical data available</p></div>
      ) : (
        <div className="order-table">
          <table>
            <thead>
              <tr><th>Date</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Volume</th></tr>
            </thead>
            <tbody>
              {candles.map((c, i) => (
                <tr key={i} className={c.close >= c.open ? '' : ''}>
                  <td>{new Date(c.time * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td>{c.open.toFixed(2)}</td>
                  <td>{c.high.toFixed(2)}</td>
                  <td>{c.low.toFixed(2)}</td>
                  <td className={c.close >= c.open ? 'profit' : 'loss'}>{c.close.toFixed(2)}</td>
                  <td>{c.volume.toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default HistoricalData;