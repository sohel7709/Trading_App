import React, { useState, useEffect } from "react";
import axios from "axios";

const Holdings = () => {
  const [allHoldings, setAllHoldings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('http://localhost:8080/allHoldings')
      .then(res => {
        setAllHoldings(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching holdings:', err);
        setAllHoldings([]);
        setLoading(false);
      });
  }, []);

  if (loading) return <><h3 className="title">Holdings</h3><p>Loading...</p></>;

  const totalInvestment = allHoldings.reduce((sum, s) => sum + (s.avgPrice * s.quantity), 0);
  const currentValue = allHoldings.reduce((sum, s) => sum + (s.ltp * s.quantity), 0);
  const totalPL = currentValue - totalInvestment;
  const plPercent = totalInvestment > 0 ? ((totalPL / totalInvestment) * 100).toFixed(2) : 0;

  return (
    <>
      <h3 className="title">Holdings ({allHoldings.length})</h3>

      <div className="order-table">
        <table>
          <thead>
            <tr>
              <th>Instrument</th>
              <th>Qty.</th>
              <th>Avg. cost</th>
              <th>LTP</th>
              <th>Cur. val</th>
              <th>P&L</th>
              <th>P&L %</th>
            </tr>
          </thead>
          <tbody>
            {allHoldings.map((stock, index) => {
              const currValue = stock.ltp * stock.quantity;
              const pl = currValue - (stock.avgPrice * stock.quantity);
              const isProfit = pl >= 0;
              const profClass = isProfit ? "profit" : "loss";
              const plPercentVal = stock.avgPrice > 0 ? (((stock.ltp - stock.avgPrice) / stock.avgPrice) * 100).toFixed(2) : 0;
              return (
                <tr key={index}>
                  <td>{stock.stockSymbol}</td>
                  <td>{stock.quantity}</td>
                  <td>{stock.avgPrice.toFixed(2)}</td>
                  <td>{stock.ltp.toFixed(2)}</td>
                  <td>{currValue.toFixed(2)}</td>
                  <td className={profClass}>{pl.toFixed(2)}</td>
                  <td className={profClass}>{isProfit ? '+' : ''}{plPercentVal}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="row">
        <div className="col">
          <h5>{totalInvestment.toFixed(2)}</h5>
          <p>Total investment</p>
        </div>
        <div className="col">
          <h5>{currentValue.toFixed(2)}</h5>
          <p>Current value</p>
        </div>
        <div className="col">
          <h5 className={totalPL >= 0 ? "profit" : "loss"}>
            {totalPL.toFixed(2)} ({totalPL >= 0 ? '+' : ''}{plPercent}%)
          </h5>
          <p>P&L</p>
        </div>
      </div>
    </>
  );
};

export default Holdings;