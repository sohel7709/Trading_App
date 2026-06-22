import React, { useState, useCallback, useMemo, useEffect } from "react";
import axios from "axios";
import {
  Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const API_URL = "http://localhost:8080";
const KITE_BLUE = "#387ed1";

/* ─── formatters ──────────────────────────────────────────────── */
const today = () => new Date().toISOString().slice(0, 10);
const lastNDays = (n) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
function getFYRange(year) {
  return { from: `${year}-04-01`, to: `${year + 1}-03-31` };
}
function getCurrentFY() {
  const now = new Date();
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

const fmtAmt = (v) => {
  const n = parseFloat(v) || 0;
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${n < 0 ? "-" : ""}${(abs / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `${n < 0 ? "-" : ""}${(abs / 1e5).toFixed(2)}L`;
  if (abs >= 1e3) return `${n < 0 ? "-" : ""}${(abs / 1e3).toFixed(2)}K`;
  return `${n < 0 ? "-" : ""}${abs.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
};
const fmtNum = (v) =>
  parseFloat(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const plColor = (v) => (parseFloat(v) >= 0 ? "#00b386" : "#eb5b3c");

/* ─── Monthly chart ───────────────────────────────────────────── */
function computeMonthlyData(trades, fromDate, toDate) {
  const map = {};
  const cursor = new Date(fromDate.slice(0, 7) + "-01");
  const end    = new Date(toDate.slice(0, 7)   + "-01");
  while (cursor <= end) {
    map[cursor.toISOString().slice(0, 7)] = 0;
    cursor.setMonth(cursor.getMonth() + 1);
  }
  (trades || []).forEach((t) => {
    if (!t.lastTrade) return;
    const month = new Date(t.lastTrade).toISOString().slice(0, 7);
    if (month in map) map[month] += t.realizedPL || 0;
  });
  return Object.entries(map).map(([month, pnl]) => ({ month, pnl }));
}

function MonthlyChart({ data }) {
  if (!data || data.length === 0) return null;
  const labels = data.map(d => {
    const [y, m] = d.month.split("-");
    return new Date(+y, +m - 1, 1).toLocaleString("en-IN", { month: "short", year: "2-digit" });
  });
  const values = data.map(d => d.pnl);
  const colors = values.map(v => v >= 0 ? "#00b386" : "#eb5b3c");
  return (
    <div style={{ padding: "0 16px 12px" }}>
      <div style={{ height: 140 }}>
        <Bar
          data={{ labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 3, barPercentage: 0.6 }] }}
          options={{
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ₹${fmtAmt(ctx.raw)}` } } },
            scales: {
              x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#999" } },
              y: { grid: { color: "#f5f5f5" }, ticks: { callback: v => fmtAmt(v), font: { size: 10 }, color: "#999" } },
            },
          }}
        />
      </div>
    </div>
  );
}

/* ─── Trade row ───────────────────────────────────────────────── */
function TradeItem({ trade }) {
  const pl   = trade.realizedPL || 0;
  const pct  = trade.realizedPct || 0;
  const col  = plColor(pl);
  const sign = pl >= 0 ? "+" : "";

  return (
    <div style={{ padding: "14px 16px", borderBottom: "1px solid #f0f0f0" }}>
      {/* Symbol + qty */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a", letterSpacing: "0.2px", flex: 1, marginRight: 12 }}>
          {trade.stockSymbol}
        </span>
        <span style={{ fontSize: 13, color: "#888", whiteSpace: "nowrap" }}>Qty.  {fmtNum(trade.quantity)}</span>
      </div>
      {/* Realised P&L row */}
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: "#888", marginRight: 6 }}>Realised</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: col }}>
          {sign}{fmtNum(pl)} <span style={{ fontSize: 12, fontWeight: 400 }}>({sign}{pct}%)</span>
        </span>
      </div>
      {/* Buy / Sell grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 0", fontSize: 12, color: "#555" }}>
        <div><span style={{ color: "#aaa" }}>Buy avg. </span>{fmtNum(trade.buyAvg)}</div>
        <div style={{ textAlign: "right" }}><span style={{ color: "#aaa" }}>Buy value  </span>{fmtNum(trade.buyValue)}</div>
        <div><span style={{ color: "#aaa" }}>Sell avg. </span>{fmtNum(trade.sellAvg)}</div>
        <div style={{ textAlign: "right" }}><span style={{ color: "#aaa" }}>Sell value  </span>{fmtNum(trade.sellValue)}</div>
      </div>
    </div>
  );
}

/* ─── Filter panel ────────────────────────────────────────────── */
const SEGMENTS = [
  { key: "combined", label: "Combined" },
  { key: "equity",   label: "Equity"   },
  { key: "fno",      label: "Futures & Options" },
  { key: "currency", label: "Currency" },
  { key: "commodity",label: "Commodity"},
];
const PNL_TYPES = [
  { key: "combined",  label: "Combined"   },
  { key: "realised",  label: "Realised"   },
  { key: "unrealised",label: "Unrealised" },
];

function FilterPanel({ segment, fromDate, toDate, symbol, onClose, onApply, onReset }) {
  const [seg,  setSeg]  = useState(segment);
  const [from, setFrom] = useState(fromDate);
  const [to,   setTo]   = useState(toDate);
  const [sym,  setSym]  = useState(symbol);
  const curFY = getCurrentFY();

  const applyShortcut = (f, t) => { setFrom(f); setTo(t); };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#fff", zIndex: 1000,
      display: "flex", flexDirection: "column", fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid #e8e8e8" }}>
        <button onClick={onClose}
          style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#333", marginRight: 12, padding: 0, lineHeight: 1 }}>
          ←
        </button>
        <span style={{ fontSize: 16, fontWeight: 600, color: "#1a1a1a" }}>Search and filter</span>
      </div>

      {/* Form */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {/* Segment */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Segment</label>
          <select value={seg} onChange={e => setSeg(e.target.value)} style={selectStyle}>
            {SEGMENTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>

        {/* P&L type */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>P&amp;L</label>
          <select style={selectStyle} defaultValue="combined">
            {PNL_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>

        {/* Symbol search */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Symbol</label>
          <input
            value={sym} onChange={e => setSym(e.target.value.toUpperCase())}
            placeholder="eg: INFY"
            style={{ ...selectStyle, fontFamily: "inherit" }}
          />
        </div>

        {/* Date range */}
        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>Date range</label>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input type="date" value={from} max={to}
              onChange={e => setFrom(e.target.value)}
              style={{ ...selectStyle, flex: 1 }} />
            <span style={{ alignSelf: "center", color: "#aaa", fontSize: 14 }}>—</span>
            <input type="date" value={to} min={from} max={today()}
              onChange={e => setTo(e.target.value)}
              style={{ ...selectStyle, flex: 1 }} />
          </div>

          {/* Shortcuts */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 0" }}>
            {[
              ["Last 7 days",  () => applyShortcut(lastNDays(7), today())],
              ["Last 30 days", () => applyShortcut(lastNDays(30), today())],
              ["Prev. FY",     () => { const r = getFYRange(curFY - 1); applyShortcut(r.from, r.to); }],
              ["Current FY",   () => { const r = getFYRange(curFY); applyShortcut(r.from, r.to > today() ? today() : r.to); }],
            ].map(([label, fn], i) => (
              <React.Fragment key={label}>
                <button onClick={fn}
                  style={{ background: "none", border: "none", color: KITE_BLUE, fontSize: 13, cursor: "pointer", padding: "4px 0", fontWeight: 500 }}>
                  {label}
                </button>
                {i < 3 && <span style={{ color: "#ccc", margin: "0 6px", fontSize: 13, alignSelf: "center" }}>•</span>}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Footer buttons */}
      <div style={{ padding: "16px", borderTop: "1px solid #e8e8e8" }}>
        <button onClick={() => onApply(seg, from, to, sym)}
          style={{ width: "100%", background: KITE_BLUE, color: "#fff", border: "none", borderRadius: 8, padding: "14px", fontSize: 16, cursor: "pointer", marginBottom: 10 }}>
          →
        </button>
        <button onClick={() => { setSeg("combined"); setFrom(getFYRange(curFY).from); setTo(today()); setSym(""); onReset(); }}
          style={{ width: "100%", background: "none", border: "none", color: KITE_BLUE, fontSize: 14, cursor: "pointer", padding: "8px", fontWeight: 600 }}>
          Reset
        </button>
      </div>
    </div>
  );
}

const labelStyle = {
  display: "block", fontSize: 12, color: "#999", marginBottom: 6, fontWeight: 500,
};
const selectStyle = {
  width: "100%", padding: "12px 14px", border: "1px solid #d9d9d9", borderRadius: 8,
  fontSize: 14, color: "#333", background: "#fff", outline: "none",
  appearance: "none", WebkitAppearance: "none", boxSizing: "border-box",
};

/* ══════════════════ MAIN COMPONENT ════════════════════════════ */
const PLStatement = () => {
  const curFY       = getCurrentFY();
  const defaultFrom = getFYRange(curFY).from;
  const defaultTo   = today();

  const [segment,    setSegment]    = useState("combined");
  const [fromDate,   setFromDate]   = useState(defaultFrom);
  const [toDate,     setToDate]     = useState(defaultTo);
  const [symFilter,  setSymFilter]  = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [dayDate,    setDayDate]    = useState("");
  const [charges,    setCharges]    = useState(null);
  const [showCharges,setShowCharges]= useState(false);
  const [chargesLoading, setChargesLoading] = useState(false);

  const [pnlData,    setPnlData]    = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [hasLoaded,  setHasLoaded]  = useState(false);
  const [page,       setPage]       = useState(1);
  const PAGE_SIZE = 20;

  const fetchPnl = useCallback(async (seg, from, to) => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ segment: seg, from, to, limit: 1000 });
      // Read from the seeded P&L history (imported trade log)
      const res    = await axios.get(`${API_URL}/pnl/records?${params}`);
      // Map record shape → the shape the trade list/chart expect
      const data = {
        ...res.data,
        trades: (res.data.trades || []).map(t => ({ ...t, lastTrade: t.tradeDate })),
      };
      setPnlData(data);
      setHasLoaded(true);
      setPage(1);
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to fetch P&L");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load current FY on mount
  useEffect(() => { fetchPnl("combined", defaultFrom, defaultTo); }, []); // eslint-disable-line

  const handleApplyFilter = (seg, from, to, sym) => {
    setSegment(seg);
    setFromDate(from);
    setToDate(to);
    setSymFilter(sym);
    setShowFilter(false);
    fetchPnl(seg, from, to);
  };

  const handleReset = () => {
    setSegment("combined");
    setFromDate(defaultFrom);
    setToDate(defaultTo);
    setSymFilter("");
    setDayDate("");
    setShowFilter(false);
    fetchPnl("combined", defaultFrom, defaultTo);
  };

  // Charges breakdown — real per-component charges from the trade sheet
  const openCharges = async () => {
    setShowCharges(true);
    setChargesLoading(true);
    try {
      const params = new URLSearchParams({ segment, from: fromDate, to: toDate });
      const res = await axios.get(`${API_URL}/pnl/charges?${params}`);
      setCharges(res.data);
    } catch {
      setCharges(null);
    } finally {
      setChargesLoading(false);
    }
  };

  // Calendar: jump to a single day's trades
  const handlePickDay = (d) => {
    if (!d) return;
    setDayDate(d);
    setSegment("combined");
    setFromDate(d);
    setToDate(d);
    setSymFilter("");
    setPage(1);
    fetchPnl("combined", d, d);
  };

  const trades = useMemo(() => {
    const all = pnlData?.trades || [];
    if (!symFilter.trim()) return all;
    return all.filter(t => t.stockSymbol.includes(symFilter.trim().toUpperCase()));
  }, [pnlData, symFilter]);

  const totalPages  = Math.ceil(trades.length / PAGE_SIZE);
  const pagedTrades = trades.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const monthlyData = useMemo(
    () => hasLoaded && trades.length > 0 ? computeMonthlyData(trades, fromDate, toDate) : [],
    [trades, fromDate, toDate, hasLoaded]
  );

  const exportCSV = () => {
    if (!trades.length) return;
    const rows = [
      ["Symbol","Qty","Buy Avg","Sell Avg","Buy Value","Sell Value","Realised P&L","P&L %","Charges"],
      ...trades.map(t => [t.stockSymbol, t.quantity, t.buyAvg, t.sellAvg, t.buyValue, t.sellValue, t.realizedPL, t.realizedPct, t.charges]),
    ];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.map(r => r.join(",")).join("\n")], { type: "text/csv" }));
    a.download = `pnl-${fromDate}_${toDate}.csv`;
    a.click();
  };

  const s = pnlData?.summary;
  const segLabel = SEGMENTS.find(sg => sg.key === segment)?.label || "Combined";

  const formatDateRange = (from, to) => {
    const fmt = d => {
      const [y, m, dd] = d.split("-");
      return `${y}-${m.padStart(2,"0")}-${dd.padStart(2,"0")}`;
    };
    return `${fmt(from)}  —  ${fmt(to)}`;
  };

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", background: "#fff", minHeight: "100vh", fontFamily: "system-ui, -apple-system, sans-serif", position: "relative" }}>

      {/* Filter panel overlay */}
      {showFilter && (
        <FilterPanel
          segment={segment}
          fromDate={fromDate}
          toDate={toDate}
          symbol={symFilter}
          onClose={() => setShowFilter(false)}
          onApply={handleApplyFilter}
          onReset={handleReset}
        />
      )}

      {/* Charges breakdown modal */}
      {showCharges && (
        <div onClick={() => setShowCharges(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", width: "100%", maxWidth: 600, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: "20px 20px 28px", boxShadow: "0 -4px 20px rgba(0,0,0,0.15)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>Charges breakdown</span>
              <button onClick={() => setShowCharges(false)} style={{ background: "none", border: "none", fontSize: 22, color: "#888", cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            {chargesLoading ? (
              <div style={{ textAlign: "center", padding: "32px", color: "#aaa", fontSize: 13 }}>Loading…</div>
            ) : charges ? (
              <>
                {charges.breakdown.map(b => (
                  <div key={b.label} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #f5f5f5" }}>
                    <span style={{ fontSize: 14, color: "#555" }}>{b.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 500, color: "#333" }}>₹{fmtNum(b.amount)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0 4px", marginTop: 4, borderTop: "2px solid #eee" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>Total charges</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>₹{fmtNum(charges.total)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, fontSize: 12, color: "#999" }}>
                  <span>Turnover</span>
                  <span>₹{fmtNum(charges.turnover)} · {charges.trades} trades</span>
                </div>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "32px", color: "#aaa", fontSize: 13 }}>No charges data available</div>
            )}
          </div>
        </div>
      )}

      {/* ── Top bar ─────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #f0f0f0" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: KITE_BLUE, display: "flex", alignItems: "center", justifyContent: "center", marginRight: 0 }}>
          <div style={{ width: 18, height: 18, borderRadius: "50%", border: "3px solid #fff" }} />
        </div>
        <span style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: 600, color: "#1a1a1a" }}>P&amp;L</span>
        <button onClick={() => setShowFilter(true)}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#333", padding: 0, lineHeight: 1 }}>
          ☰
        </button>
      </div>

      {/* ── Date range pill ─────────────────────────────────── */}
      <button onClick={() => setShowFilter(true)}
        style={{ display: "block", width: "calc(100% - 32px)", margin: "12px 16px 0", background: "#f5f5f5", border: "none", borderRadius: 24, padding: "10px 16px", cursor: "pointer", fontSize: 14, color: "#555", textAlign: "center" }}>
        {formatDateRange(fromDate, toDate)}
      </button>

      {/* ── Calendar: pick a single day ─────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 16px 0" }}>
        <span style={{ fontSize: 13, color: "#777", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5 }}>
          <span role="img" aria-label="calendar">📅</span> View a day
        </span>
        <input
          type="date"
          value={dayDate}
          max={today()}
          onChange={e => handlePickDay(e.target.value)}
          style={{
            flex: 1, padding: "9px 12px", border: `1px solid ${dayDate ? KITE_BLUE : "#d9d9d9"}`,
            borderRadius: 8, fontSize: 14, color: "#333", background: "#fff", outline: "none",
            fontFamily: "inherit",
          }}
        />
        {dayDate && (
          <button onClick={handleReset}
            style={{ background: "none", border: "none", color: KITE_BLUE, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "4px 6px", whiteSpace: "nowrap" }}>
            Clear
          </button>
        )}
      </div>
      {dayDate && (
        <div style={{ margin: "8px 16px 0", fontSize: 13, color: "#555" }}>
          Showing trades for <strong>{dayDate}</strong>
        </div>
      )}

      {/* ── Segment chips ───────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, padding: "12px 16px", overflowX: "auto" }}>
        {[...SEGMENTS.slice(1), { key: "combined", label: "Combined" }].map(sg => (
          <button key={sg.key}
            onClick={() => { setSegment(sg.key); if (hasLoaded) fetchPnl(sg.key, fromDate, toDate); }}
            style={{
              padding: "6px 14px", border: `1.5px solid ${segment === sg.key ? KITE_BLUE : "#d9d9d9"}`,
              borderRadius: 20, background: "#fff",
              color: segment === sg.key ? KITE_BLUE : "#666",
              fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
              fontWeight: segment === sg.key ? 600 : 400,
            }}>
            {sg.label}
          </button>
        ))}
      </div>

      {/* ── Loading ─────────────────────────────────────────── */}
      {loading && (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ width: 32, height: 32, border: "3px solid #e5e7eb", borderTop: `3px solid ${KITE_BLUE}`, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
          <div style={{ fontSize: 13, color: "#aaa" }}>Fetching P&amp;L…</div>
        </div>
      )}

      {/* ── Error ───────────────────────────────────────────── */}
      {error && !loading && (
        <div style={{ margin: "16px", background: "#fff0ee", borderRadius: 8, padding: "16px", textAlign: "center", color: "#eb5b3c", fontSize: 13 }}>
          {error}
          <button onClick={() => fetchPnl(segment, fromDate, toDate)}
            style={{ display: "block", margin: "10px auto 0", padding: "8px 20px", background: "#eb5b3c", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>
            Retry
          </button>
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────── */}
      {!hasLoaded && !loading && !error && (
        <div style={{ textAlign: "center", padding: "48px 24px" }}>
          {/* Robot illustration */}
          <svg width="140" height="120" viewBox="0 0 200 180" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginBottom: 20 }}>
            <circle cx="100" cy="100" r="65" fill="#1b5fe4" opacity="0.85"/>
            <circle cx="76" cy="116" r="20" fill="#3d7df8" opacity="0.7"/>
            <rect x="62" y="82" width="76" height="50" rx="8" fill="#FFD600" opacity="0.95"/>
            <rect x="74" y="90" width="18" height="14" rx="3" fill="#fff" opacity="0.9"/>
            <circle cx="83" cy="97" r="4" fill="#1b5fe4"/>
            <circle cx="83" cy="97" r="1.5" fill="#fff"/>
            <rect x="108" y="90" width="18" height="14" rx="3" fill="#fff" opacity="0.9"/>
            <circle cx="117" cy="97" r="4" fill="#1b5fe4"/>
            <circle cx="117" cy="97" r="1.5" fill="#fff"/>
            <rect x="80" y="112" width="40" height="8" rx="4" fill="#fff" opacity="0.9"/>
            <rect x="99" y="28" width="4" height="22" rx="2" fill="#1b5fe4"/>
            <circle cx="101" cy="28" r="5" fill="#FFD600"/>
          </svg>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#1a1a1a", marginBottom: 6 }}>Build a report</div>
          <div style={{ fontSize: 13, color: "#888" }}>Use the above form to generate a report</div>
          <button onClick={() => fetchPnl(segment, fromDate, toDate)}
            style={{ marginTop: 20, padding: "12px 28px", background: KITE_BLUE, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Generate Report
          </button>
        </div>
      )}

      {/* ── Data loaded ─────────────────────────────────────── */}
      {hasLoaded && !loading && s && (
        <>
          {/* Summary card */}
          <div style={{ margin: "12px 16px", background: "#fff", borderRadius: 12, border: "1px solid #ebebeb", padding: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            {/* Big numbers */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>Realised P&amp;L</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: plColor(s.realizedPL), letterSpacing: "-0.5px" }}>
                  {s.realizedPL >= 0 ? "" : "-"}₹{fmtAmt(Math.abs(s.realizedPL))}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>Unrealised P&amp;L</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: s.unrealizedPL === 0 ? "#1a1a1a" : plColor(s.unrealizedPL), letterSpacing: "-0.5px" }}>
                  {s.unrealizedPL === 0 ? "0" : `${s.unrealizedPL < 0 ? "-" : ""}₹${fmtAmt(Math.abs(s.unrealizedPL))}`}
                </div>
              </div>
            </div>

            <div style={{ height: 1, background: "#f0f0f0", margin: "12px 0" }} />

            {/* Detail rows */}
            {[
              ["Charges & taxes",        `₹${fmtAmt(s.chargesAndTaxes)}`],
              ["Other credits & debits",  s.otherCreditsDebits === 0 ? "0" : String(s.otherCreditsDebits)],
              ["Net realised P&L",        `${s.netRealizedPL < 0 ? "-" : ""}₹${fmtAmt(Math.abs(s.netRealizedPL))}`],
            ].map(([label, val], i) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0" }}>
                <span style={{ fontSize: 13, color: "#777", fontWeight: i === 2 ? 500 : 400 }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: i === 2 ? 700 : 500, color: i === 2 ? plColor(s.netRealizedPL) : "#333" }}>{val}</span>
              </div>
            ))}

            <button onClick={openCharges}
              style={{ background: "none", border: "none", color: KITE_BLUE, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "8px 0 0", display: "block" }}>
              View charges breakdown →
            </button>
          </div>

          {/* Monthly chart */}
          {monthlyData.some(d => d.pnl !== 0) && <MonthlyChart data={monthlyData} />}

          {/* Meta row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 16px 8px", flexWrap: "wrap", gap: 4 }}>
            <div>
              <div style={{ fontSize: 12, color: "#999" }}>
                <span style={{ marginRight: 4 }}>⏱</span>
                Last updated: {pnlData?.lastUpdated?.slice?.(0, 10) || today()}
              </div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                <span style={{ marginRight: 4 }}>📎</span>
                Page {page}/{totalPages || 1}
              </div>
            </div>
            <div style={{ display: "flex", gap: 16 }}>
              <button onClick={exportCSV}
                style={{ background: "none", border: "none", color: KITE_BLUE, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                <span>⬇</span> Download
              </button>
              <button onClick={() => setShowFilter(true)}
                style={{ background: "none", border: "none", color: KITE_BLUE, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                <span>↕</span> Sort
              </button>
            </div>
          </div>

          <div style={{ height: 1, background: "#ebebeb", margin: "0 16px" }} />

          {/* Trade list */}
          {trades.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 24px", color: "#aaa", fontSize: 13 }}>
              No trades found for the selected period.
            </div>
          ) : (
            <>
              {pagedTrades.map((t, i) => <TradeItem key={`${t.stockSymbol}-${i}`} trade={t} />)}

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", borderTop: "1px solid #f0f0f0" }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                    style={{ padding: "8px 18px", border: `1px solid ${page <= 1 ? "#ddd" : KITE_BLUE}`, borderRadius: 6, cursor: "pointer", fontSize: 13, background: "#fff", color: page <= 1 ? "#ccc" : KITE_BLUE, fontWeight: 600 }}>
                    ← Prev
                  </button>
                  <span style={{ fontSize: 13, color: "#555" }}>{page} / {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                    style={{ padding: "8px 18px", border: `1px solid ${page >= totalPages ? "#ddd" : KITE_BLUE}`, borderRadius: 6, cursor: "pointer", fontSize: 13, background: "#fff", color: page >= totalPages ? "#ccc" : KITE_BLUE, fontWeight: 600 }}>
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
};

export default PLStatement;
