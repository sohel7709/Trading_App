import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { createChart, CandlestickSeries, LineSeries, AreaSeries, HistogramSeries } from "lightweight-charts";
import axios from "axios";

const API_URL = "http://localhost:8080";

const StockChart = () => {
  const [searchParams] = useSearchParams();
  const symbol = searchParams.get("symbol") || "INFY";
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const smaSeriesRef = useRef(null);
  const emaSeriesRef = useRef(null);
  const [interval, setInterval_] = useState("15m");
  const [chartType, setChartType] = useState("candlestick");
  const [indicators, setIndicators] = useState({ sma: true, ema: false, bollinger: false });
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState(null);

  useEffect(() => {
    fetchQuote();
    fetchCandles();
  }, [symbol, interval]);

  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  const fetchQuote = async () => {
    try {
      const res = await axios.get(`${API_URL}/market/quote/${symbol}`);
      setQuote(res.data);
    } catch (err) {
      // Use simulated quote from market data
      try {
        const liveRes = await axios.get(`${API_URL}/market/live`);
        if (liveRes.data.prices && liveRes.data.prices[symbol]) {
          setQuote(liveRes.data.prices[symbol]);
        }
      } catch {
        setQuote({ ltp: 0, changePercent: 0 });
      }
    }
  };

  const fetchCandles = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/market/candles/${symbol}?interval=${interval}`);
      if (res.data.candles) {
        renderChart(res.data.candles);
      }
    } catch (err) {
      console.error("Error fetching candles:", err);
      setLoading(false);
    }
  };

  const computeSMA = (data, period) => {
    const result = [];
    for (let i = period - 1; i < data.length; i++) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += data[j].close;
      }
      result.push({ time: data[i].time, value: Math.round((sum / period) * 100) / 100 });
    }
    return result;
  };

  const computeEMA = (data, period) => {
    const result = [];
    const multiplier = 2 / (period + 1);
    // First EMA = SMA for the first `period` candles
    let sum = 0;
    for (let i = 0; i < period; i++) sum += data[i].close;
    let ema = sum / period;
    result.push({ time: data[period - 1].time, value: Math.round(ema * 100) / 100 });
    for (let i = period; i < data.length; i++) {
      ema = (data[i].close - ema) * multiplier + ema;
      result.push({ time: data[i].time, value: Math.round(ema * 100) / 100 });
    }
    return result;
  };

  const computeBollingerBands = (data, period, multiplier) => {
    const sma = computeSMA(data, period);
    const upper = [];
    const lower = [];
    for (let i = 0; i < sma.length; i++) {
      const idx = period - 1 + i;
      let sumSq = 0;
      for (let j = idx - period + 1; j <= idx; j++) {
        sumSq += Math.pow(data[j].close - sma[i].value, 2);
      }
      const stdDev = Math.sqrt(sumSq / period);
      upper.push({ time: sma[i].time, value: Math.round((sma[i].value + multiplier * stdDev) * 100) / 100 });
      lower.push({ time: sma[i].time, value: Math.round((sma[i].value - multiplier * stdDev) * 100) / 100 });
    }
    return { sma, upper, lower };
  };

  const renderChart = (data) => {
    if (!chartContainerRef.current) return;

    // Clean up previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: "#ffffff" },
        textColor: "#333",
      },
      grid: {
        vertLines: { color: "#f0f0f0" },
        horzLines: { color: "#f0f0f0" },
      },
      crosshair: {
        mode: 0,
      },
      rightPriceScale: {
        borderColor: "#d1d4dc",
      },
      timeScale: {
        borderColor: "#d1d4dc",
        timeVisible: interval === "1m" || interval === "5m",
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
    });

    chartRef.current = chart;

    // Add volume series at bottom
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "#26a69a",
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.75, bottom: 0 },
    });
    volumeSeries.setData(
      data.map((d) => ({
        time: d.time,
        value: d.volume,
        color: d.close >= d.open ? "rgba(38,166,154,0.3)" : "rgba(239,83,80,0.3)",
      }))
    );
    volumeSeriesRef.current = volumeSeries;

    // Add main series based on chart type
    let mainSeries;
    if (chartType === "candlestick") {
      mainSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#26a69a",
        downColor: "#ef5350",
        borderDownColor: "#ef5350",
        borderUpColor: "#26a69a",
        wickDownColor: "#ef5350",
        wickUpColor: "#26a69a",
      });
      mainSeries.setData(
        data.map((d) => ({
          time: d.time,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        }))
      );
    } else if (chartType === "line") {
      mainSeries = chart.addSeries(LineSeries, { color: "#2962FF" });
      mainSeries.setData(data.map((d) => ({ time: d.time, value: d.close })));
    } else {
      mainSeries = chart.addSeries(AreaSeries, {
        topColor: "rgba(41,98,255,0.4)",
        bottomColor: "rgba(41,98,255,0.0)",
        lineColor: "#2962FF",
      });
      mainSeries.setData(data.map((d) => ({ time: d.time, value: d.close })));
    }
    candleSeriesRef.current = mainSeries;

    // Indicators
    if (indicators.sma) {
      const smaData = computeSMA(data, 20);
      if (smaData.length > 0) {
        const smaLine = chart.addSeries(LineSeries, { color: "#FF9800", lineWidth: 1 });
        smaLine.setData(smaData);
        smaSeriesRef.current = smaLine;
      }
    }

    if (indicators.ema) {
      const emaData = computeEMA(data, 20);
      if (emaData.length > 0) {
        const emaLine = chart.addSeries(LineSeries, { color: "#9C27B0", lineWidth: 1 });
        emaLine.setData(emaData);
        emaSeriesRef.current = emaLine;
      }
    }

    if (indicators.bollinger) {
      const bb = computeBollingerBands(data, 20, 2);
      if (bb.sma.length > 0) {
        const bbSma = chart.addSeries(LineSeries, { color: "#FF9800", lineWidth: 1, lineStyle: 2 });
        bbSma.setData(bb.sma);
        const bbUpper = chart.addSeries(LineSeries, { color: "#2196F3", lineWidth: 1, lineStyle: 2 });
        bbUpper.setData(bb.upper);
        const bbLower = chart.addSeries(LineSeries, { color: "#2196F3", lineWidth: 1, lineStyle: 2 });
        bbLower.setData(bb.lower);
      }
    }

    // Fit content
    chart.timeScale().fitContent();

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    setLoading(false);
  };

  const toggleIndicator = (name) => {
    setIndicators((prev) => ({ ...prev, [name]: !prev[name] }));
    // Re-fetch and re-render with new indicators
    fetchCandles();
  };

  const intervals = [
    { value: "1m", label: "1M" },
    { value: "5m", label: "5M" },
    { value: "15m", label: "15M" },
    { value: "1h", label: "1H" },
    { value: "1d", label: "1D" },
  ];

  const chartTypes = [
    { value: "candlestick", label: "🎯 Candle" },
    { value: "line", label: "📈 Line" },
    { value: "area", label: "📊 Area" },
  ];

  return (
    <div className="stock-chart-page">
      <div className="chart-header">
        <div className="chart-info">
          <h2>{symbol}</h2>
          {quote && (
            <span className={quote.changePercent >= 0 ? "profit" : "loss"}>
              ₹{quote.ltp?.toFixed(2) || "0.00"}{" "}
              <small>
                ({quote.changePercent >= 0 ? "+" : ""}
                {quote.changePercent?.toFixed(2) || "0.00"}%)
              </small>
            </span>
          )}
        </div>
        <div className="chart-controls">
          <div className="interval-buttons">
            {intervals.map((iv) => (
              <button
                key={iv.value}
                className={interval === iv.value ? "active" : ""}
                onClick={() => setInterval_(iv.value)}
              >
                {iv.label}
              </button>
            ))}
          </div>
          <div className="chart-type-buttons">
            {chartTypes.map((ct) => (
              <button
                key={ct.value}
                className={chartType === ct.value ? "active" : ""}
                onClick={() => setChartType(ct.value)}
              >
                {ct.label}
              </button>
            ))}
          </div>
          <div className="indicator-buttons">
            <button
              className={indicators.sma ? "active ind-on" : ""}
              onClick={() => toggleIndicator("sma")}
            >
              SMA 20
            </button>
            <button
              className={indicators.ema ? "active ind-on" : ""}
              onClick={() => toggleIndicator("ema")}
            >
              EMA 20
            </button>
            <button
              className={indicators.bollinger ? "active ind-on" : ""}
              onClick={() => toggleIndicator("bollinger")}
            >
              BB (20,2)
            </button>
          </div>
        </div>
      </div>

      {loading && <div className="chart-loading">Loading chart data...</div>}

      <div ref={chartContainerRef} className="chart-container" />

      <div className="chart-footer">
        {quote && (
          <div className="stock-stats">
            <div className="stat-item">
              <span className="stat-label">Open</span>
              <span className="stat-value">{quote.open?.toFixed(2) || "-"}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">High</span>
              <span className="stat-value">{quote.high?.toFixed(2) || "-"}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Low</span>
              <span className="stat-value">{quote.low?.toFixed(2) || "-"}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Prev Close</span>
              <span className="stat-value">{quote.previousClose?.toFixed(2) || "-"}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Volume</span>
              <span className="stat-value">{quote.volume?.toLocaleString("en-IN") || "-"}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StockChart;