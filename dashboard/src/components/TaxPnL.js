import React, { useState, useCallback, useMemo } from "react";
import axios from "axios";

const API_URL = "http://localhost:8080";

/* ─── helpers ──────────────────────────────────────────────────── */
const fmt = (v, decimals = 2) => {
  const n = parseFloat(v) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(decimals)}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(decimals)}L`;
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(decimals)}K`;
  return `${sign}₹${abs.toFixed(decimals)}`;
};

const fmtExact = (v) => {
  const n = parseFloat(v) || 0;
  return (n < 0 ? "−₹" : "₹") + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const CATEGORY_META = {
  stcg:        { label: "Short-term (STCG)",      color: "#e65c00", bg: "#fff7f0", badge: "#ffd4b3", note: "Equity held < 12 months · 20% tax" },
  ltcg:        { label: "Long-term (LTCG)",        color: "#1a6b3e", bg: "#f0fff7", badge: "#b3f0d0", note: "Equity held ≥ 12 months · 12.5% tax (₹1.25L exempt)" },
  fno:         { label: "F&O / Non-speculative",   color: "#1b3fa0", bg: "#f0f4ff", badge: "#c0d0ff", note: "Futures & Options · taxed at slab rate" },
  speculative: { label: "Speculative (Intraday)",  color: "#7b2d8b", bg: "#fdf0ff", badge: "#e5b8f5", note: "Intraday equity MIS · taxed at slab rate" },
};

function getCurrentFY() {
  const now = new Date();
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

/* ─── Summary card ──────────────────────────────────────────────── */
function SummaryCard({ category, data, tax }) {
  const meta = CATEGORY_META[category];
  const pl   = data?.realizedPL || 0;
  const net  = data?.netPL      || 0;
  return (
    <div style={{ background: meta.bg, border: `1px solid ${meta.badge}`, borderRadius: 10, padding: "16px 20px", flex: 1, minWidth: 200 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: meta.color, textTransform: "uppercase", letterSpacing: "0.5px" }}>{meta.label}</span>
        <span style={{ fontSize: 11, background: meta.badge, color: meta.color, borderRadius: 12, padding: "2px 8px", fontWeight: 600 }}>
          {data?.trades || 0} scrips
        </span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-1px", color: pl >= 0 ? "#00b386" : "#eb5b3c", marginBottom: 4 }}>
        {pl >= 0 ? "+" : ""}{fmt(pl)}
      </div>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>{meta.note}</div>
      <div style={{ borderTop: `1px solid ${meta.badge}`, paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, color: "#888" }}>Charges: <strong style={{ color: "#555" }}>−{fmt(data?.charges || 0)}</strong></span>
        <span style={{ fontSize: 12, color: "#888" }}>Net: <strong style={{ color: net >= 0 ? "#00b386" : "#eb5b3c" }}>{net >= 0 ? "+" : ""}{fmt(net)}</strong></span>
      </div>
      {tax && (
        <div style={{ marginTop: 8, background: "rgba(0,0,0,0.04)", borderRadius: 6, padding: "6px 10px", fontSize: 12 }}>
          {tax.rate ? (
            <span>Tax @ {tax.rate}%: <strong style={{ color: "#333" }}>{fmtExact(tax.tax)}</strong></span>
          ) : (
            <span style={{ color: "#777" }}>At income tax slab rate</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Trade row ─────────────────────────────────────────────────── */
function TradeRow({ trade }) {
  const [open, setOpen] = useState(false);
  const meta = CATEGORY_META[trade.category] || CATEGORY_META.fno;
  const pl   = trade.realizedPL;
  const pos  = pl >= 0;

  return (
    <>
      <tr onClick={() => setOpen(p => !p)} style={{ cursor: "pointer", borderBottom: "1px solid #f2f2f2" }}
        onMouseEnter={e => e.currentTarget.style.background = "#f8faff"}
        onMouseLeave={e => e.currentTarget.style.background = open ? "#fafafa" : "#fff"}>
        <td style={{ padding: "11px 16px" }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#1a1a1a" }}>{trade.stockSymbol}</div>
          <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>{trade.productType}</div>
        </td>
        <td style={{ padding: "11px 16px" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: meta.color, background: meta.badge, borderRadius: 4, padding: "2px 7px" }}>
            {meta.label.split(" ")[0]} {meta.label.split(" ")[1] || ""}
          </span>
        </td>
        <td style={{ padding: "11px 16px", fontSize: 12, color: "#555" }}>{trade.buyDate}</td>
        <td style={{ padding: "11px 16px", fontSize: 12, color: "#555" }}>{trade.sellDate}</td>
        <td style={{ padding: "11px 16px", textAlign: "right" }}>
          {trade.holdingDays >= 365
            ? <span style={{ color: "#1a6b3e", fontWeight: 600, fontSize: 12 }}>{Math.floor(trade.holdingDays / 365)}y {trade.holdingDays % 365}d</span>
            : <span style={{ color: trade.holdingDays === 0 ? "#888" : "#e65c00", fontSize: 12 }}>{trade.holdingDays}d</span>
          }
        </td>
        <td style={{ padding: "11px 16px", textAlign: "right", fontSize: 13 }}>{trade.qty.toLocaleString("en-IN")}</td>
        <td style={{ padding: "11px 16px", textAlign: "right", fontSize: 12, color: "#555" }}>₹{trade.buyPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
        <td style={{ padding: "11px 16px", textAlign: "right", fontSize: 12, color: "#555" }}>₹{trade.sellPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
        <td style={{ padding: "11px 16px", textAlign: "right", fontWeight: 700, fontSize: 13, color: pos ? "#00b386" : "#eb5b3c" }}>
          {pos ? "+" : ""}{fmt(pl)}
        </td>
        <td style={{ padding: "11px 16px", textAlign: "right", fontSize: 12, color: "#888" }}>{fmt(trade.charges)}</td>
        <td style={{ padding: "11px 16px", textAlign: "right", fontWeight: 700, fontSize: 13, color: trade.netPL >= 0 ? "#00b386" : "#eb5b3c" }}>
          {trade.netPL >= 0 ? "+" : ""}{fmt(trade.netPL)}
          <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 4 }}>{open ? "▲" : "▼"}</span>
        </td>
      </tr>
      {open && (
        <tr style={{ background: "#fafafa" }}>
          <td colSpan={11} style={{ padding: "10px 20px 14px", borderBottom: "1px solid #e8e8e8" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
              {[
                ["Buy qty",    trade.qty.toLocaleString("en-IN")],
                ["Buy price",  `₹${trade.buyPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`],
                ["Buy value",  fmt(trade.buyValue)],
                ["Sell price", `₹${trade.sellPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`],
                ["Sell value", fmt(trade.sellValue)],
                ["Holding",    trade.holdingDays === 0 ? "Intraday" : `${trade.holdingDays} days`],
              ].map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: 11, color: "#aaa", marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>{val}</div>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

const TH = ({ children, right }) => (
  <th style={{ padding: "9px 16px", textAlign: right ? "right" : "left", fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.4px", background: "#fafafa", borderBottom: "2px solid #e8e8e8", whiteSpace: "nowrap" }}>
    {children}
  </th>
);

/* ══════════════════ MAIN COMPONENT ════════════════════════════ */
const TaxPnL = () => {
  const curFY = getCurrentFY();
  const [activeFY,  setActiveFY]  = useState(curFY);
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [filter,    setFilter]    = useState("all");   // all | stcg | ltcg | fno | speculative
  const [search,    setSearch]    = useState("");
  const [page,      setPage]      = useState(1);
  const PAGE_SIZE = 30;

  const fetchTax = useCallback(async (fy) => {
    setLoading(true); setError(null);
    try {
      const res = await axios.get(`${API_URL}/tax-pnl?fy=${fy}`);
      setData(res.data);
      setHasLoaded(true);
      setPage(1);
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to fetch tax P&L");
    } finally {
      setLoading(false);
    }
  }, []);

  const selectFY = (fy) => { setActiveFY(fy); fetchTax(`${fy}-${String(fy + 1).slice(-2)}`); };

  const fyList = [curFY, curFY - 1, curFY - 2];

  const filteredTrades = useMemo(() => {
    if (!data?.trades) return [];
    let t = data.trades;
    if (filter !== "all") t = t.filter(tr => tr.category === filter);
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      t = t.filter(tr => tr.stockSymbol.includes(q));
    }
    return t;
  }, [data, filter, search]);

  const totalPages  = Math.ceil(filteredTrades.length / PAGE_SIZE);
  const pagedTrades = filteredTrades.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportCSV = () => {
    if (!data?.trades?.length) return;
    const rows = [
      ["Symbol","Category","Buy Date","Sell Date","Holding Days","Qty","Buy Price","Sell Price","Realized P&L","Charges","Net P&L"],
      ...data.trades.map(t => [
        t.stockSymbol, t.category, t.buyDate, t.sellDate, t.holdingDays,
        t.qty, t.buyPrice, t.sellPrice, t.realizedPL, t.charges, t.netPL,
      ]),
    ];
    const csv  = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = `tax-pnl-fy${activeFY}-${activeFY + 1}.csv`;
    a.click();
  };

  const te = data?.taxEstimate;
  const sm = data?.summaries;

  return (
    <div style={{ minHeight: "100vh", background: "#f7f8fa", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* ── Header ──────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e8e8e8", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 52 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>Tax P&amp;L</span>
          <span style={{ fontSize: 12, color: "#aaa", background: "#f5f5f5", borderRadius: 4, padding: "2px 8px" }}>For ITR filing</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {fyList.map(fy => (
            <button key={fy} onClick={() => selectFY(fy)}
              style={{ padding: "5px 12px", border: `1px solid ${activeFY === fy ? "#387ed1" : "#ddd"}`, borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: activeFY === fy ? 600 : 400, background: activeFY === fy ? "#387ed1" : "#fff", color: activeFY === fy ? "#fff" : "#555" }}>
              FY {fy}-{String(fy + 1).slice(-2)}
            </button>
          ))}
          <span style={{ color: "#ddd" }}>|</span>
          <button onClick={exportCSV} disabled={!hasLoaded}
            style={{ padding: "5px 14px", border: "1px solid #ddd", borderRadius: 6, cursor: hasLoaded ? "pointer" : "not-allowed", fontSize: 12, background: "#fff", color: "#555" }}>
            ⬇ Download CSV
          </button>
        </div>
      </div>

      <div style={{ padding: "20px 24px" }}>

        {/* ── Empty state ──────────────────────────────────── */}
        {!hasLoaded && !loading && (
          <div style={{ textAlign: "center", padding: "80px 20px" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🧾</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#555", marginBottom: 8 }}>Tax P&amp;L Report</div>
            <div style={{ fontSize: 13, color: "#aaa", marginBottom: 24 }}>STCG · LTCG · F&amp;O Income · Speculative Income — categorized for ITR filing</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 24 }}>
              {fyList.map(fy => (
                <button key={fy} onClick={() => selectFY(fy)}
                  style={{ padding: "8px 20px", border: "1px solid #387ed1", borderRadius: 20, cursor: "pointer", fontSize: 13, color: "#387ed1", background: "#fff", fontWeight: 600 }}>
                  FY {fy}-{String(fy + 1).slice(-2)}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div style={{ textAlign: "center", padding: "80px 20px" }}>
            <div style={{ width: 40, height: 40, border: "4px solid #e5e7eb", borderTop: "4px solid #387ed1", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
            <div style={{ fontSize: 14, color: "#aaa" }}>Computing tax P&amp;L…</div>
          </div>
        )}

        {error && !loading && (
          <div style={{ background: "#fff0ee", borderRadius: 8, padding: 20, textAlign: "center", color: "#eb5b3c" }}>
            {error}
            <button onClick={() => fetchTax(`${activeFY}-${String(activeFY + 1).slice(-2)}`)}
              style={{ marginLeft: 12, padding: "6px 16px", background: "#eb5b3c", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>
              Retry
            </button>
          </div>
        )}

        {hasLoaded && !loading && data && (
          <>
            {/* ── Tax notice banner ──────────────────────────── */}
            <div style={{ background: "#fffbea", border: "1px solid #ffe066", borderRadius: 8, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <span style={{ fontSize: 12, color: "#7a5c00" }}>
                <strong>Estimated tax only.</strong> Figures based on FY {data.fy} rates (STCG 20%, LTCG 12.5%). Consult a CA for final tax filing. F&amp;O and intraday income is taxed at your applicable income slab rate.
              </span>
            </div>

            {/* ── 4 category cards ───────────────────────────── */}
            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              {["stcg", "ltcg", "fno", "speculative"].map(cat => (
                <SummaryCard key={cat} category={cat} data={sm?.[cat]} tax={te?.[cat]} />
              ))}
            </div>

            {/* ── Total tax estimate card ─────────────────────── */}
            <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 8, padding: "16px 20px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: "#999", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Estimated Direct Tax Payable (STCG + LTCG)</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: te?.totalDirectTax > 0 ? "#eb5b3c" : "#00b386", letterSpacing: "-1px" }}>
                  {fmtExact(te?.totalDirectTax || 0)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 24 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#aaa", marginBottom: 4 }}>STCG Tax</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#e65c00" }}>{fmtExact(te?.stcg?.tax || 0)}</div>
                  <div style={{ fontSize: 11, color: "#aaa" }}>@ {te?.stcg?.rate}%</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#aaa", marginBottom: 4 }}>LTCG Tax</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#1a6b3e" }}>{fmtExact(te?.ltcg?.tax || 0)}</div>
                  <div style={{ fontSize: 11, color: "#aaa" }}>@ {te?.ltcg?.rate}% (after ₹1.25L exempt)</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#aaa", marginBottom: 4 }}>F&amp;O Income</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: sm?.fno?.realizedPL >= 0 ? "#1b3fa0" : "#eb5b3c" }}>{fmt(sm?.fno?.realizedPL || 0)}</div>
                  <div style={{ fontSize: 11, color: "#aaa" }}>At slab rate</div>
                </div>
              </div>
            </div>

            {/* ── Trade table ──────────────────────────────────── */}
            <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 8, overflow: "hidden" }}>
              {/* Toolbar */}
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 6 }}>
                  {[["all", "All"], ["stcg", "STCG"], ["ltcg", "LTCG"], ["fno", "F&O"], ["speculative", "Speculative"]].map(([key, label]) => (
                    <button key={key} onClick={() => { setFilter(key); setPage(1); }}
                      style={{ padding: "5px 12px", border: `1px solid ${filter === key ? "#387ed1" : "#ddd"}`, borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: filter === key ? 600 : 400, background: filter === key ? "#387ed1" : "#fff", color: filter === key ? "#fff" : "#555" }}>
                      {label}
                      {key !== "all" && sm?.[key]?.trades > 0 && (
                        <span style={{ marginLeft: 5, background: filter === key ? "rgba(255,255,255,0.25)" : "#f0f0f0", borderRadius: 10, padding: "1px 5px", fontSize: 10 }}>
                          {sm[key].trades}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input placeholder="Search symbol…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                    style={{ padding: "5px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 12, width: 160 }} />
                  <span style={{ fontSize: 12, color: "#aaa" }}>{filteredTrades.length} lots · Page {page}/{totalPages || 1}</span>
                </div>
              </div>

              {/* Table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <TH>Symbol</TH>
                      <TH>Category</TH>
                      <TH>Buy Date</TH>
                      <TH>Sell Date</TH>
                      <TH right>Holding</TH>
                      <TH right>Qty</TH>
                      <TH right>Buy Price</TH>
                      <TH right>Sell Price</TH>
                      <TH right>Realised P&amp;L</TH>
                      <TH right>Charges</TH>
                      <TH right>Net P&amp;L</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedTrades.length === 0 ? (
                      <tr><td colSpan={11} style={{ padding: 32, textAlign: "center", color: "#aaa", fontSize: 13 }}>No trades in this category</td></tr>
                    ) : (
                      pagedTrades.map((t, i) => <TradeRow key={`${t.stockSymbol}-${i}`} trade={t} />)
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ padding: "12px 16px", borderTop: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                    style={{ padding: "6px 16px", border: "1px solid #ddd", borderRadius: 6, cursor: "pointer", fontSize: 13, background: "#fff", color: page <= 1 ? "#ccc" : "#387ed1", fontWeight: 600 }}>
                    ← Prev
                  </button>
                  <div style={{ display: "flex", gap: 4 }}>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const p = page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i;
                      if (p < 1 || p > totalPages) return null;
                      return (
                        <button key={p} onClick={() => setPage(p)}
                          style={{ width: 32, height: 32, border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 13, background: page === p ? "#387ed1" : "#fff", color: page === p ? "#fff" : "#555", fontWeight: page === p ? 600 : 400 }}>
                          {p}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                    style={{ padding: "6px 16px", border: "1px solid #ddd", borderRadius: 6, cursor: "pointer", fontSize: 13, background: "#fff", color: page >= totalPages ? "#ccc" : "#387ed1", fontWeight: 600 }}>
                    Next →
                  </button>
                </div>
              )}
            </div>

            {/* ── ITR guide ──────────────────────────────────── */}
            <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 8, padding: "16px 20px", marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#333", marginBottom: 12 }}>📋 Where to report in ITR</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                {[
                  { label: "STCG (Equity < 12m)", itr: "ITR-2 / ITR-3 → Schedule CG → STCG at 20%", color: "#e65c00" },
                  { label: "LTCG (Equity > 12m)", itr: "ITR-2 / ITR-3 → Schedule CG → LTCG at 12.5%", color: "#1a6b3e" },
                  { label: "F&O Income",           itr: "ITR-3 → Schedule BP → Non-speculative business income", color: "#1b3fa0" },
                  { label: "Speculative (Intraday)",itr: "ITR-3 → Schedule BP → Speculative business income", color: "#7b2d8b" },
                ].map(item => (
                  <div key={item.label} style={{ borderLeft: `3px solid ${item.color}`, paddingLeft: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: item.color, marginBottom: 3 }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: "#777" }}>{item.itr}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default TaxPnL;
