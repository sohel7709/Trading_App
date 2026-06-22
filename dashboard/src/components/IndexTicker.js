import React, { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { useNavigate } from "react-router-dom";

const SOCKET_URL = "http://localhost:8080";

const IndexTicker = () => {
  const [indexes, setIndexes] = useState({});
  const [connected, setConnected] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const socket = io(SOCKET_URL);

    socket.on("connect", () => {
      setConnected(true);
      console.log("IndexTicker: Socket connected");
    });

    socket.on("marketData", (data) => {
      if (data.indexes) {
        setIndexes(data.indexes);
      }
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    return () => socket.disconnect();
  }, []);

  const formatNumber = (num) => {
    if (!num) return "0";
    return num.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  };

  const indexList = Object.values(indexes);

  if (indexList.length === 0) {
    return (
      <div className="index-ticker">
        <p style={{ color: "#888", fontSize: "0.8rem" }}>
          {connected ? "Waiting for market data..." : "Connecting..."}
        </p>
      </div>
    );
  }

  return (
    <div className="index-ticker">
      {indexList.map((idx, i) => (
        <div className="index-item" key={i} onClick={() => navigate("/index-charts")}
          style={{ cursor: "pointer" }} title="View index charts">
          <span className="index-name">{idx.name || idx.symbol}</span>
          <span className="index-value">{formatNumber(idx.ltp)}</span>
          <span
            className={`index-change ${
              (idx.changePercent || idx.change || 0) >= 0 ? "profit" : "loss"
            }`}
          >
            {(idx.changePercent || idx.change || 0) >= 0 ? "+" : ""}
            {typeof idx.changePercent === "number"
              ? idx.changePercent.toFixed(2)
              : "0.00"}
            %
          </span>
        </div>
      ))}
    </div>
  );
};

export default IndexTicker;