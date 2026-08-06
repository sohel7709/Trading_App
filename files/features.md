# Features & Functionality

A complete inventory of features implemented across the Zerodha Web clone: `frontend/` (marketing site), `dashboard/` (trading app), `backend/` (API + real-time engine), and `mobile/` (Expo app).

## Marketing Site (`frontend/`)

| Page | Route | Description |
|---|---|---|
| Home | `/` | Landing page — hero, stats, pricing teaser, awards, education sections |
| Signup | `/signup` | Account opening form |
| About | `/about` | Company hero + team listing |
| Products | `/products` | Product overview and feature blurbs |
| Pricing | `/pricing` | Brokerage/pricing tables |
| Support | `/support` | FAQ/help center + support ticket creation |
| 404 | `*` | Not-found page |

Shared navbar/footer across all pages.

## Trading Dashboard (`dashboard/`)

| Page | Route | Description |
|---|---|---|
| Summary | `/` | Account overview — wallet balance, holdings/positions aggregation |
| Orders | `/orders` | Order book; modify/cancel orders |
| Holdings | `/holdings` | Long-term equity holdings with live P&L |
| Positions | `/positions` | Open equity + options positions with live tick-based P&L |
| Funds | `/funds` | View wallet balance; deposit/withdraw funds |
| Apps | `/apps` | Connected apps/API management |
| Market Movers | `/movers` | Live top gainers/losers |
| Stock Chart | `/chart` | Candlestick chart view |
| Trade Book | `/trades` | Executed trades list, exportable as PDF/CSV |
| P&L Statement | `/pl` | Realized/unrealized P&L over a date range or financial year |
| Tax P&L | `/tax-pnl` | Tax-categorized (STCG/LTCG/speculative) P&L report with charges |
| Index Charts | `/index-charts` | Index candle charts |
| Price Alerts | `/alerts` | Create/delete price alerts |
| Admin Dashboard | `/admin` | Ops view aggregating orders, trades, wallet, holdings, positions |
| TradingView Widget | `/tradingview` | Embedded TradingView chart |
| Historical Data | `/history` | Historical candle data viewer |
| Live Chat | `/chat` | Real-time support chat |

Shared: top bar/menu navigation, live index ticker, buy/sell order ticket with stock search, global app context.

## Backend API (`backend/`)

### Order & Trade Execution
- Place, modify, cancel orders (`/newOrder`, `PATCH/DELETE /orders/:id`, `/allOrders`)
- Cover orders with stop-loss (`/newCoverOrder`)
- Options orders and positions (`/newOptionOrder`, `/optionPositions`, square-off)
- Position square-off (equity and options)
- Day positions and day P&L (`/positions/day`, `/positions/dayPnl`)
- Closed positions history
- Brokerage/charges calculation engine
- Multi-leg **basket orders** (create, execute, delete)

### Holdings & Trades
- Holdings list with live valuation (`/allHoldings`)
- Trade history (`/trades`)

### P&L & Tax Reporting
- P&L records, summary, charges, monthly breakdown
- Tax P&L (equity, seedable) with FY-based categorization

### Funds & Wallet
- Wallet balance (`/wallet`, `/funds`)
- Deposit and withdraw funds with transaction ledger
- Real-time wallet updates pushed via WebSocket

### Watchlists
- Create/list watchlists
- Add/remove stocks from a watchlist

### Price Alerts
- Create, list, delete price alerts

### Corporate Actions
- Record and apply corporate actions (dividends, splits) to holdings/positions

### Live Market Data
- Symbol search, stock list, live prices, index data, market movers, IPOs
- Live quote and option chain per symbol
- Market status (open/closed, session type)
- Index and stock candle data, historical data
- **Dhan API** as primary live-data provider (LTP, quotes, option chain) for ~90 NSE symbols
- Yahoo Finance fallback for indexes
- Centralized market-hours/holiday rules (NSE holiday calendar, 09:15–15:30 equity / 15:40 F&O sessions, pre/post-market square-off windows)
- Dhan access-token lifecycle management with auto-renewal (scheduled cron, Mon–Sat 3am) and a token-postback endpoint

### Live Chat
- Chat history endpoint backing the dashboard/mobile chat UI

### Admin / Ops
- Prepare new trading day (resets day state) — scheduled daily at 08:45 IST on weekdays
- Web page to view/update the Dhan access token and its status
- Demo data seeding

### Real-Time Engine (Socket.IO)
- `marketData` — broadcast market data every 15s
- `positionsTick` — per-second live P&L ticks
- `orderModified`, `orderCancelled`, `coverOrderPlaced`, `optionOrderExecuted`
- `walletUpdated`, `corporateActionsApplied`, `chatMessage`
- Symbol-room subscriptions and `initialData` push on connect

### Data Model
Mongoose schemas for: Orders, Positions, Option Positions, Closed Positions, Holdings, Trades, Baskets, Watchlists, Price Alerts, Wallet, Fund Transactions, P&L Records, Corporate Actions, Chat.

### Auth
No JWT/session auth is currently wired up (`passport` is a dependency but unused) — the API is effectively single-tenant/open, consistent with a simulated-trading app.

## Mobile App (`mobile/`)

Fully-built Expo/React Native app with screens for: Login, Dashboard, Markets, Portfolio, Orders, Order Entry, Option Chain, Option Order, Funds, Add Funds, Withdraw, Alerts, GTT (good-till-triggered orders), IPO Bids, P&L, Stock Detail, Index Chart, Chat, Profile, Account, Settings, Connected Apps.

Also includes:
- Push notifications (via `expo-notifications`)
- Candlestick charting
- Buy/sell modal
- PDF export and sharing (`expo-print`, `expo-sharing`)
- Image picker/camera access (likely for profile/KYC photo capture — no server-side handling found yet)

## Cross-Cutting Features
- **Live chat support** — Socket.IO-based, available on both dashboard and mobile
- **Price alerts** — full CRUD across backend, dashboard, and mobile
- **Fund management** — deposit/withdraw with wallet ledger and real-time updates
- **Corporate actions engine** — applies dividends/splits to holdings automatically
- **Tax/P&L reporting** — FY-based tax categorization, exportable trade book (PDF/CSV)
- **Admin/ops tooling** — Dhan token management UI, day-prep automation, aggregate admin dashboard

## Known Gaps
- No authentication layer (open API)
- No email or server-side file-upload infrastructure (no nodemailer/multer/S3)
