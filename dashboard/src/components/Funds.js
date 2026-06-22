import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

const Funds = () => {
  const [wallet, setWallet] = useState(null);
  const [fundTxs, setFundTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [txnType, setTxnType] = useState("DEPOSIT");
  const [message, setMessage] = useState("");

  const fetchData = () => {
    Promise.all([
      axios.get('http://localhost:8080/wallet'),
      axios.get('http://localhost:8080/funds'),
    ])
      .then(([walletRes, txsRes]) => {
        setWallet(walletRes.data);
        setFundTxs(txsRes.data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching funds:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleTransaction = () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setMessage("Please enter a valid amount");
      return;
    }

    const endpoint = txnType === "DEPOSIT" ? "/funds/deposit" : "/funds/withdraw";
    axios.post(`http://localhost:8080${endpoint}`, { amount: amt })
      .then(res => {
        setMessage(res.data.message);
        setAmount("");
        fetchData(); // Refresh wallet and transactions
      })
      .catch(err => {
        setMessage(err.response?.data?.message || "Transaction failed");
      });
  };

  if (loading) return <><div className="funds"><p>Loading...</p></div></>;

  return (
    <>
      <div className="funds">
        <p>Instant, zero-cost fund transfers with UPI (Mock)</p>
        <div className="fund-actions">
          <select value={txnType} onChange={(e) => setTxnType(e.target.value)}>
            <option value="DEPOSIT">Deposit</option>
            <option value="WITHDRAW">Withdraw</option>
          </select>
          <input
            type="number"
            placeholder="Amount (₹)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Link className={`btn ${txnType === "DEPOSIT" ? "btn-green" : "btn-blue"}`} onClick={handleTransaction}>
            {txnType === "DEPOSIT" ? "Add funds" : "Withdraw"}
          </Link>
        </div>
        {message && <p className="txn-message">{message}</p>}
      </div>

      <div className="row">
        <div className="col">
          <span>
            <p>Equity</p>
          </span>

          <div className="table">
            <div className="data">
              <p>Available margin</p>
              <p className="imp colored">{wallet?.availableMargin?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0'}</p>
            </div>
            <div className="data">
              <p>Used margin</p>
              <p className="imp">{wallet?.usedMargin?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0'}</p>
            </div>
            <div className="data">
              <p>Available cash</p>
              <p className="imp">{wallet?.availableMargin?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0'}</p>
            </div>
            <hr />
            <div className="data">
              <p>Opening Balance</p>
              <p>{wallet?.balance?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0'}</p>
            </div>
          </div>
        </div>

        <div className="col">
          <div className="table">
            <h5 style={{ padding: '10px' }}>Transaction History</h5>
            {fundTxs.length === 0 ? (
              <div className="data"><p>No transactions yet</p></div>
            ) : (
              fundTxs.slice(0, 10).map((txn, idx) => (
                <div className="data" key={idx}>
                  <p>
                    <span className={txn.type === 'DEPOSIT' ? 'profit' : 'loss'}>
                      {txn.type === 'DEPOSIT' ? '+' : '-'}₹{txn.amount.toLocaleString('en-IN')}
                    </span>
                  </p>
                  <p style={{ fontSize: '0.75rem', color: '#888' }}>
                    {new Date(txn.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Funds;