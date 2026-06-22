import React, { useState, useEffect } from "react";
import axios from "axios";

const Summary = () => {
  const [wallet, setWallet] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      axios.get('http://localhost:8080/wallet'),
      axios.get('http://localhost:8080/allHoldings'),
    ])
      .then(([walletRes, holdingsRes]) => {
        setWallet(walletRes.data);
        setHoldings(holdingsRes.data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching summary:', err);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="username"><h6>Loading...</h6></div>;

  const totalInvestment = holdings.reduce((sum, s) => sum + (s.avgPrice * s.quantity), 0);
  const currentValue = holdings.reduce((sum, s) => sum + (s.ltp * s.quantity), 0);
  const totalPL = currentValue - totalInvestment;
  const plPercent = totalInvestment > 0 ? ((totalPL / totalInvestment) * 100).toFixed(2) : 0;

  const formatCurrency = (val) => {
    if (val >= 1000) return (val / 1000).toFixed(2) + 'k';
    return val.toFixed(2);
  };

  return (
    <>
      <div className="username">
        <h6>Hi, User!</h6>
        <hr className="divider" />
      </div>

      <div className="section">
        <span>
          <p>Equity</p>
        </span>

        <div className="data">
          <div className="first">
            <h3>{wallet ? formatCurrency(wallet.availableMargin) : '0'}</h3>
            <p>Margin available</p>
          </div>
          <hr />

          <div className="second">
            <p>
              Margins used <span>{wallet ? formatCurrency(wallet.usedMargin) : '0'}</span>
            </p>
            <p>
              Opening balance <span>{wallet ? formatCurrency(wallet.balance) : '0'}</span>
            </p>
          </div>
        </div>
        <hr className="divider" />
      </div>

      <div className="section">
        <span>
          <p>Holdings ({holdings.length})</p>
        </span>

        <div className="data">
          <div className="first">
            <h3 className={totalPL >= 0 ? "profit" : "loss"}>
              {formatCurrency(totalPL)} <small>{totalPL >= 0 ? '+' : ''}{plPercent}%</small>
            </h3>
            <p>P&L</p>
          </div>
          <hr />

          <div className="second">
            <p>
              Current Value <span>{formatCurrency(currentValue)}</span>
            </p>
            <p>
              Investment <span>{formatCurrency(totalInvestment)}</span>
            </p>
          </div>
        </div>
        <hr className="divider" />
      </div>
    </>
  );
};

export default Summary;