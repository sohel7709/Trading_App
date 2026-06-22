import React, { useEffect, useRef, useState, useCallback } from "react";
import { createChart, AreaSeries } from "lightweight-charts";
import axios from "axios";

const API_URL = "http://localhost:8080";
const KITE_BLUE = "#387ed1";

const TIMEFRAMES = [
  { label: "1m",  value: "1m"  },
  { label: "3m",  value: "3m"  },
  { label: "5m",  value: "5m"  },
  { label: "15m", value: "15m" },
  { label: "30m", value: "30m" },
  { label: "1hr", value: "1h"  },
];

const INDICES = [
  { name: "NIFTY 50",    shortName: "NIFTY",    color: KITE_BLUE },
  { name: "BANK NIFTY",  shortName: "BANKNIFTY",color: "#e65c00" },
  { name: "SENSEX",      shortName: "SENSEX",   color: "#7b2d8b" },
  { name: "NIFTY IT",    shortName: "NIFTY IT", color: "#1a6b3e" },
  { name: "FINNIFTY",    shortName: "FINNIFTY", color: "#c00020" },
  { name: "NIFTY MIDCAP",shortName: "MIDCAP",   color: "#b86f00" },
];

/* ─── Single index chart card ──────────────────────────────────── */
function IndexChartCard({ index, timeframe }) {
  const containerRef = useRef(null);
  const chartRef     = useRef(null);
  const seriesRef    = useRef(null);
  const [quote, setQuote]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  const loadCandles = useCallback(async () => {
    if (!containerRef.current) return;
    setLoading(true); setError(null);
    try {
      const res = await axios.get(
        `${API_URL}/market/index-candles/${encodeURIComponent(index.name)}?interval=${timeframe}`
      );
      const { candles, quote: q } = res.data;
      setQuote(q);
      if (!candles || candles.length === 0) { setError("No data"); setLoading(false); return; }

      const data = candles.map(c => ({ time: c.time, value: c.close }));
      const isUp = data.length > 1 && data[data.length - 1].value >= data[0].value;
      const lineColor = isUp ? "#00b386" : "#eb5b3c";
      const fillColor = isUp ? "rgba(0,179,134,0.10)" : "rgba(235,91,60,0.10)";

      // Destroy old chart when timeframe changes (series options can't be updated in-place)
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }

      if (containerRef.current) {
        const w = containerRef.current.clientWidth || containerRef.current.offsetWidth || 300;
        chartRef.current = createChart(containerRef.current, {
          layout: { background: { color: "#ffffff" }, textColor: "#999" },
          grid:   { vertLines: { color: "#f5f5f5" }, horzLines: { color: "#f5f5f5" } },
          crosshair: { mode: 0 },
          rightPriceScale: { borderColor: "#f5f5f5" },
          timeScale: { borderColor: "#f5f5f5", timeVisible: true, secondsVisible: false },
          width:  w,
          height: 130,
        });

        seriesRef.current = chartRef.current.addSeries(AreaSeries, {
          topColor:    fillColor,
          bottomColor: "rgba(255,255,255,0)",
          lineColor,
          lineWidth: 2,
        });

        seriesRef.current.setData(data);
        chartRef.current.timeScale().fitContent();
      }

      setLoading(false);
    } catch (e) {
      console.error('[IndexChart]', index.name, timeframe, e?.message || e);
      setError(e?.message?.slice(0,40) || "Failed to load"); setLoading(false);
    }
  }, [index.name, timeframe]);

  useEffect(() => {
    loadCandles();
    return () => {
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; seriesRef.current = null; }
    };
  }, [loadCandles]);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      if (chartRef.current && entries[0]) {
        chartRef.current.applyOptions({ width: entries[0].contentRect.width });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const change    = quote?.changePercent ?? (quote?.change ?? 0);
  const ltp       = quote?.ltp ?? 0;
  const isPositive = change >= 0;

  return (
    <div style={{
      background: "#fff", borderRadius: 10, border: "1px solid #ebebeb",
      overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
    }}>
      {/* Header */}
      <div style={{ padding: "12px 14px 8px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 2 }}>
            {index.shortName}
          </div>
          {ltp > 0 && (
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", letterSpacing: "-0.5px" }}>
              {ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
          )}
        </div>
        {ltp > 0 && (
          <div style={{ textAlign: "right" }}>
            <span style={{
              fontSize: 13, fontWeight: 600, padding: "3px 8px", borderRadius: 4,
              background: isPositive ? "rgba(0,179,134,0.1)" : "rgba(235,91,60,0.1)",
              color: isPositive ? "#00b386" : "#eb5b3c",
            }}>
              {isPositive ? "+" : ""}{typeof change === "number" ? change.toFixed(2) : "0.00"}%
            </span>
          </div>
        )}
      </div>

      {/* Chart area */}
      <div style={{ padding: "0 0 4px", position: "relative", minHeight: 134 }}>
        {loading && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", zIndex: 2 }}>
            <div style={{ width: 24, height: 24, border: "3px solid #e5e7eb", borderTop: `3px solid ${KITE_BLUE}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          </div>
        )}
        {error && !loading && (
          <div style={{ textAlign: "center", padding: "40px 12px", color: "#ccc", fontSize: 12 }}>{error}</div>
        )}
        <div ref={containerRef} style={{ width: "100%", opacity: loading ? 0 : 1, transition: "opacity 0.3s" }} />
      </div>
    </div>
  );
}

/* ══════════════════ MAIN PAGE ═════════════════════════════════ */
const IndexCharts = () => {
  const [timeframe, setTimeframe] = useState("5m");
  const [marketStatus, setMarketStatus] = useState("Market");

  useEffect(() => {
    axios.get(`${API_URL}/market/status`).then(r => {
      setMarketStatus(r.data?.isOpen ? "Market Open" : "Market Closed");
    }).catch(() => {});
  }, []);

  return (
    <div style={{ background: "#f7f8fa", minHeight: "100vh", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e8e8e8", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>Index Charts</div>
          <div style={{ fontSize: 11, color: "#aaa" }}>{marketStatus}</div>
        </div>

        {/* Timeframe selector */}
        <div style={{ display: "flex", gap: 4, background: "#f5f5f5", borderRadius: 8, padding: 4 }}>
          {TIMEFRAMES.map(tf => (
            <button key={tf.value} onClick={() => setTimeframe(tf.value)}
              style={{
                padding: "5px 10px", border: "none", borderRadius: 6, cursor: "pointer",
                fontSize: 12, fontWeight: 600,
                background: timeframe === tf.value ? "#fff" : "transparent",
                color: timeframe === tf.value ? KITE_BLUE : "#888",
                boxShadow: timeframe === tf.value ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                transition: "all 0.15s",
              }}>
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Charts grid */}
      <div style={{ padding: 16 }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 14,
        }}>
          {INDICES.map(idx => (
            <IndexChartCard key={idx.name} index={idx} timeframe={timeframe} />
          ))}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default IndexCharts;
