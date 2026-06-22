import React, { useState, useEffect } from "react";
import axios from "axios";

const Positions = () => {
  const [positions, setPositions] = useState([]);
  const [totalPnl, setTotalPnl] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('http://localhost:8080/positions/day')
      .then(res => {
        setPositions(res.data.positions || []);
        setTotalPnl(res.data.totalPnl || 0);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching positions:', err);
        setPositions([]);
        setLoading(false);
      });
  }, []);

  if (loading) return <><h3 className="title">Positions</h3><p>Loading...</p></>;

  const totalClass = totalPnl >= 0 ? "profit" : "loss";

  return (
    <>
      <h3 className="title">Positions ({positions.length})</h3>

      <div className="order-table">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Instrument</th>
              <th>Qty.</th>
              <th>Avg.</th>
              <th>LTP</th>
              <th>P&L</th>
              <th>P&L %</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((stock, index) => {
              const isProfit = stock.pnl >= 0;
              const profClass = isProfit ? "profit" : "loss";
              const plPercent = stock.avgPrice > 0
                ? (((stock.sellAvg - stock.avgPrice) / stock.avgPrice) * 100).toFixed(2)
                : 0;
              return (
                <tr key={index}>
                  <td>{stock.productType}{stock.isSquaredOff ? '' : ' (open)'}</td>
                  <td>{stock.stockSymbol}</td>
                  <td>{stock.quantity}</td>
                  <td>{stock.avgPrice.toFixed(2)}</td>
                  <td>{stock.ltp.toFixed(2)}</td>
                  <td className={profClass}>{stock.pnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className={profClass}>{isProfit ? '+' : ''}{plPercent}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ marginTop: '12px', fontWeight: 600 }}>
        <p>
          Total P&amp;L:{' '}
          <span className={totalClass}>
            {totalPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </p>
      </div>
    </>
  );
};

export default Positions;
