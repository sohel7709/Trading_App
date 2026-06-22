# TODOS

## CRITICAL Foundation — From /autoplan Review (2026-06-18)

### TODO-F1: User Auth + Per-User Data Isolation ⚠️ BLOCKS ALL FEATURES
**What:** JWT login, `userId` on every schema (TradeSchema, HoldingsSchema, PLRecordSchema, WalletSchema), all queries scoped by userId.
**Why:** Every API endpoint currently serves one global dataset. P&L, Tax P&L, Holdings, Orders — all show the same data to every caller. Zero per-user isolation.
**How:** Add `userId` field to all schemas → middleware that extracts userId from JWT → filter every query with `{ userId }`. Use `passport-local-mongoose` (already installed in backend/package.json).
**Effort:** M (human ~1 day / CC ~20 min) | **Priority:** P1 — blocks all other features

### TODO-F2: Order → Trade Round-Trip Verification
**What:** Prove end-to-end: place order via BuyActionWindow → TradeModel document created → appears in PLStatement with correct P&L.
**Why:** P&L and Tax P&L work only on seeded demo data. Real user flow (place order → see it in P&L) has never been verified.
**How:** Trace `POST /newOrder` → verify TradeModel.create() is called → verify `/pnl` includes the new trade → verify FIFO P&L is correct.
**Effort:** S (human ~2h / CC ~10 min) | **Priority:** P1

### TODO-F3: LTP Real-time Updates via WebSocket
**What:** Push live prices from marketDataService → frontend via socket.io so Holdings/Positions show current unrealized P&L.
**Why:** All LTP values are static MongoDB snapshots. Positions show wrong P&L unless manually refreshed.
**How:** Emit `ltp-update` events from marketDataService → PLStatement + Holdings subscribe via socket.io-client.
**Effort:** M (human ~4h / CC ~15 min) | **Priority:** P1

## P&L Feature — Deferred from Kite Parity PR

### TODO-P1: FY Shortcuts
**What:** Add "FY 2025-26 / FY 2024-25 / FY 2023-24 / Custom" chips above the date bar in PLStatement.js.
**Why:** Kite has these — they let traders instantly jump to a financial year without manually entering dates.
**How:** `getFYRange(year)` helper returning `{from: '${year}-04-01', to: '${year+1}-03-31'}`. On click: setFromDate + setToDate + fetchPnl(segment, from, to).
**Effort:** S (human ~30 min / CC ~5 min) | **Priority:** P2

### TODO-P2: Sort Controls
**What:** Add sort dropdown (Realised P&L desc, Symbol A-Z, Date newest) next to the Download button.
**Why:** Kite lets you sort trades. For a large trade list, sorting by P&L lets you instantly see your best/worst positions.
**How:** `sortBy` state + `sortedTrades = [...pnlData.trades].sort(...)` BEFORE pagination. 3 options, no refetch.
**Effort:** S (human ~30 min / CC ~5 min) | **Priority:** P2

### TODO-P3: Win/Loss Stats Row
**What:** Add a row below the chart: "N trades | X winners | Y% win rate | Best: SYMBOL +₹Z | Worst: SYMBOL -₹W"
**Why:** Kite shows this. Gives instant performance summary without reading the trade table.
**How:** `computeStats(pnlData.trades)` helper. Each element in trades[] is one symbol aggregate. Winner = realizedPL > 0.
**Effort:** S (human ~20 min / CC ~5 min) | **Priority:** P3
