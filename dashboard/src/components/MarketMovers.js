import React, { useState, useEffect } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = "http://localhost:8080";

const MarketMovers = () => {
  const [movers, setMovers] = useState({ gainers: [], losers: [], mostActive: [] });
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    const socket = io(SOCKET_URL);

    socket.on("marketData", (data) => {
      if (data.movers) {
        setMovers(data.movers);
      }
      if (data.lastUpdated) {
        setLastUpdated(new Date(data.lastUpdated));
      }
    });

    return () => socket.disconnect();
  }, []);

  const formatTime = (date) => {
    if (!date) return "";
    return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const renderStockRow = (stock, idx) => (
    <tr key={idx}>
      <td>{stock.symbol}</td>
      <td>{stock.ltp?.toFixed(2)}</td>
      <td className={stock.changePercent >= 0 ? "profit" : "loss"}>
        {stock.changePercent >= 0 ? "+" : ""}
        {stock.changePercent?.toFixed(2)}%
      </td>
      <td>{stock.volume?.toLocaleString("en-IN") || "-"}</td>
    </tr>
  );

  return (
    <div className="market-movers">
      <h3 className="title">
        Market Movers{" "}
        <small style={{ fontWeight: "normal", fontSize: "0.75rem", color: "#888" }}>
          (updated: {formatTime(lastUpdated)})
        </small>
      </h3>

      <div className="row">
        <div className="col">
          <h4 className="profit">▲ Top Gainers</h4>
          <div className="order-table">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>LTP</th>
                  <th>Change %</th>
                  <th>Volume</th>
                </tr>
              </thead>
              <tbody>
                {movers.gainers.length > 0 ? (
                  movers.gainers.map(renderStockRow)
                ) : (
                  <tr><td colSpan="4">Loading...</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col">
          <h4 className="loss">▼ Top Losers</h4>
          <div className="order-table">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>LTP</th>
                  <th>Change %</th>
                  <th>Volume</th>
                </tr>
              </thead>
              <tbody>
                {movers.losers.length > 0 ? (
                  movers.losers.map(renderStockRow)
                ) : (
                  <tr><td colSpan="4">Loading...</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: "1rem" }}>
        <div className="col">
          <h4>🔥 Most Active</h4>
          <div className="order-table">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>LTP</th>
                  <th>Change %</th>
                  <th>Volume</th>
                </tr>
              </thead>
              <tbody>
                {movers.mostActive.length > 0 ? (
                  movers.mostActive.map(renderStockRow)
                ) : (
                  <tr><td colSpan="4">Loading...</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketMovers;