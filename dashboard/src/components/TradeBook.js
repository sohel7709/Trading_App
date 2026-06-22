import React, { useState, useEffect } from "react";
import axios from "axios";
import jsPDF from "jspdf";
import "jspdf-autotable";

const API_URL = "http://localhost:8080";

const TradeBook = () => {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTrades = () => {
    setLoading(true);
    axios.get(`${API_URL}/trades`)
      .then(res => { setTrades(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchTrades(); }, []);

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Trade Book", 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 14, 28);
    doc.text(`Total Trades: ${trades.length}`, 14, 35);

    const tableData = trades.map((t, i) => [
      i + 1,
      t.stockSymbol,
      t.side,
      t.quantity,
      t.price.toFixed(2),
      t.totalValue.toFixed(2),
      t.charges,
      new Date(t.createdAt).toLocaleDateString('en-IN'),
    ]);

    doc.autoTable({
      startY: 42,
      head: [['#', 'Symbol', 'Side', 'Qty', 'Price', 'Value', 'Charges', 'Date']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [65, 132, 243], textColor: 255 },
      styles: { fontSize: 8 },
    });

    doc.save(`trade-book-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const exportCSV = () => {
    const headers = ['#', 'Symbol', 'Side', 'Qty', 'Price', 'Total Value', 'Charges', 'Date'];
    const rows = trades.map((t, i) => [
      i + 1, t.stockSymbol, t.side, t.quantity, t.price.toFixed(2),
      t.totalValue.toFixed(2), t.charges, new Date(t.createdAt).toLocaleDateString('en-IN')
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `trade-book-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  const totalBuy = trades.filter(t => t.side === 'BUY').reduce((s, t) => s + t.totalValue, 0);
  const totalSell = trades.filter(t => t.side === 'SELL').reduce((s, t) => s + t.totalValue, 0);
  const totalCharges = trades.reduce((s, t) => s + (t.charges || 0), 0);

  if (loading) return <div className="content-inner"><h3 className="title">Trade Book</h3><p>Loading...</p></div>;

  return (
    <div className="content-inner">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 className="title" style={{ marginBottom: 0 }}>Trade Book ({trades.length})</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-blue" onClick={exportPDF}>Export PDF</button>
          <button className="btn btn-green" onClick={exportCSV}>Export CSV</button>
        </div>
      </div>

      <div className="row">
        <div className="col"><div className="table"><div className="data"><p>Total Buy Value</p><p className="imp">₹{totalBuy.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div></div></div>
        <div className="col"><div className="table"><div className="data"><p>Total Sell Value</p><p className="imp">₹{totalSell.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div></div></div>
        <div className="col"><div className="table"><div className="data"><p>Total Charges</p><p className="imp">₹{totalCharges.toFixed(2)}</p></div></div></div>
      </div>

      {trades.length === 0 ? (
        <div className="no-orders"><p>No trades yet</p></div>
      ) : (
        <div className="order-table">
          <table>
            <thead>
              <tr><th>Symbol</th><th>Side</th><th>Qty</th><th>Price</th><th>Total</th><th>Charges</th><th>Date</th></tr>
            </thead>
            <tbody>
              {trades.map((t, i) => (
                <tr key={i}>
                  <td>{t.stockSymbol}</td>
                  <td className={t.side === 'BUY' ? 'profit' : 'loss'}>{t.side}</td>
                  <td>{t.quantity}</td>
                  <td>{t.price?.toFixed(2)}</td>
                  <td>{t.totalValue?.toFixed(2)}</td>
                  <td>{t.charges?.toFixed(2)}</td>
                  <td>{new Date(t.createdAt).toLocaleDateString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TradeBook;