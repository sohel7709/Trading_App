import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";

const API_URL = "http://localhost:8080";

const TradingViewWidget = () => {
  const [searchParams] = useSearchParams();
  const symbol = (searchParams.get("symbol") || "INFY").toUpperCase();
  const containerRef = useRef(null);
  const [quote, setQuote] = useState(null);

  useEffect(() => {
    axios.get(`${API_URL}/market/quote/${symbol}`)
      .then(res => setQuote(res.data))
      .catch(() => setQuote(null));

    // Load TradingView widget script
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => {
      if (containerRef.current && window.TradingView) {
        new window.TradingView.widget({
          container_id: "tv-chart-container",
          symbol: `BSE:${symbol}`,
          interval: "D",
          theme: "light",
          style: "1",
          locale: "in",
          toolbar_bg: "#f1f3f6",
          enable_publishing: false,
          allow_symbol_change: true,
          details: true,
          hotlist: true,
          calendar: true,
          width: "100%",
          height: 550,
          studies: ["RSI@tv-basicstudies", "MACD@tv-basicstudies", "MASimple@tv-basicstudies", "MAExp@tv-basicstudies"],
        });
      }
    };
    document.head.appendChild(script);

    return () => {
      const existingScript = document.querySelector('script[src="https://s3.tradingview.com/tv.js"]');
      if (existingScript) existingScript.remove();
    };
  }, [symbol]);

  return (
    <div className="content-inner">
      <div className="chart-header" style={{ marginBottom: 12 }}>
        <div className="chart-info">
          <h2>{symbol}</h2>
          {quote && (
            <span className={quote.changePercent >= 0 ? "profit" : "loss"}>
              ₹{quote.ltp?.toFixed(2)}{" "}
              <small>({quote.changePercent >= 0 ? "+" : ""}{quote.changePercent?.toFixed(2)}%)</small>
            </span>
          )}
        </div>
      </div>
      <div id="tv-chart-container" ref={containerRef} style={{ width: "100%", minHeight: 550 }} />
    </div>
  );
};

export default TradingViewWidget;