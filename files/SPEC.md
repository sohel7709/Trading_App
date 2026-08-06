# SPEC.md — Domain Model, Contracts & Algorithms

> Authoritative reference for schema, API shape, and core algorithms. `AGENTS.md` defines the rules; this file defines the system. Tickets in `BACKLOG.md` reference sections here.

---

## 1. Core concepts

**Tenant** — one institute. The isolation boundary for all data.
**Branch** — a physical location under a tenant. Optional; single-branch institutes have one implicit branch.
**Batch** — a cohort of students taught by one or more instructors, with its own virtual capital, risk rules, and market mode.
**Sim Session** — a period of simulated market time a batch trades in. Either `LIVE`, `DELAYED`, `REPLAY`, or `EOD`. Owns the clock.
**Assignment** — an instructor-defined task bound to a scenario and a deadline, producing a graded submission per student.

The critical modelling idea: **orders, positions and P&L belong to a `(student, batch)` pair, not to a student.** A student in two batches has two independent portfolios. Every trading table therefore carries `enrollmentId`, not `userId`.

---

## 2. Data model

All tenant-scoped tables carry `tenantId` (indexed, RLS-protected), plus `createdAt` / `updatedAt`. IDs are UUIDv7.

### 2.1 Identity & tenancy

```
Tenant            id, name, slug, status(TRIAL|ACTIVE|SUSPENDED|EXPIRED),
                  branding(logoUrl, primaryColor, subdomain), settings(jsonb)
Branch            id, tenantId, name, city
User              id, tenantId?, email, phone?, name, passwordHash,
                  status, emailVerifiedAt, lastLoginAt
                  -- tenantId null only for SUPER_ADMIN
Membership        id, tenantId, userId, branchId?, role(INSTITUTE_ADMIN|INSTRUCTOR|STUDENT),
                  status(ACTIVE|SUSPENDED)
Session           id, userId, refreshTokenHash, deviceLabel, ip, userAgent,
                  expiresAt, revokedAt
AuditLog          id, tenantId?, actorUserId, action, entityType, entityId,
                  before(jsonb), after(jsonb), ip, createdAt
ConsentRecord     id, tenantId, userId, consentType, version, grantedAt, revokedAt?
```

Unique: `(tenantId, email)` on User. The same email may exist under two institutes.

### 2.2 Teaching layer

```
Batch             id, tenantId, branchId?, name, code, startDate, endDate,
                  startingCapitalPaise, marketMode(LIVE|DELAYED|REPLAY|EOD),
                  status(DRAFT|ACTIVE|ARCHIVED)
BatchInstructor   id, tenantId, batchId, userId
Enrollment        id, tenantId, batchId, userId, joinedAt,
                  status(ACTIVE|REMOVED|COMPLETED)
RiskRule          id, tenantId, batchId, maxDailyLossPaise?, maxPositionValuePaise?,
                  maxOpenPositions?, mandatoryStopLoss(bool),
                  allowedSegments(string[]), maxLeverage?
Assignment        id, tenantId, batchId, title, description, scenarioPackId?,
                  startAt, dueAt, startingCapitalPaise, rubric(jsonb),
                  status(DRAFT|PUBLISHED|CLOSED)
Submission        id, tenantId, assignmentId, enrollmentId, submittedAt?,
                  metrics(jsonb), score?, feedback?, gradedByUserId?, gradedAt?
TradeJournal      id, tenantId, enrollmentId, orderId?, positionId?,
                  thesis, emotion?, mistakeTags(string[]), createdAt
AttendanceLog     id, tenantId, enrollmentId, date, activeMinutes,
                  ordersPlaced, sessionsCount
```

### 2.3 Market data

```
Instrument        id, exchange(NSE|BSE|MCX|NCDEX), segment(EQ|FO|CDS|COMM|IDX),
                  instrumentType(EQUITY|INDEX|FUTURE|OPTION), tradingSymbol, name,
                  isin?, lotSize, tickSize, priceScale, priceMultiplier,
                  quotationUnit?, expiry?, strike?, optionType(CE|PE)?,
                  underlyingId?, settlementType(CASH|PHYSICAL)?, isActive
                  -- global, NOT tenant-scoped
                  -- prices stored as scaled integers: actual = value / 10^priceScale
                  -- priceMultiplier converts quoted price to contract value
                  --   (e.g. MCX Gold quotes per 10g on a 1kg lot → multiplier 100)
Candle            instrumentId, interval(1m|5m|15m|1d), ts,
                  openPaise, highPaise, lowPaise, closePaise, volume, oi?
                  -- hypertable/partitioned by month; global
OptionChainSnap   underlyingId, expiry, ts, strikes(jsonb)
                  -- per-strike: ltp, bid, ask, oi, iv, volume; global
ScenarioPack      id, name, description, tradingDate, underlyingIds,
                  segments, priceInPaise?, isPublic
                  -- global catalog; access via Entitlement
MarketHoliday     date, exchange, description
```

Instruments and candles are global — the same NIFTY data serves every tenant. Only *access* is tenant-gated.

### 2.4 Trading

```
SimSession        id, tenantId, batchId, mode, scenarioPackId?,
                  simStartTs, simCurrentTs, speedMultiplier, status(IDLE|RUNNING|PAUSED|ENDED),
                  controlledByUserId, lastAdvancedAt
Wallet            id, tenantId, enrollmentId, balancePaise, marginUsedPaise,
                  marginAvailablePaise
LedgerEntry       id, tenantId, walletId, type(CREDIT|DEBIT), amountPaise,
                  reason, refType, refId, balanceAfterPaise, simTs
Order             id, tenantId, enrollmentId, instrumentId, side(BUY|SELL),
                  orderType(MARKET|LIMIT|SL|SL_M|BRACKET|AMO), product(CNC|MIS|NRML),
                  quantity, filledQuantity, limitPricePaise?, triggerPricePaise?,
                  status(PENDING|OPEN|PARTIAL|FILLED|CANCELLED|REJECTED),
                  rejectionReason?, parentOrderId?, basketId?,
                  placedSimTs, updatedSimTs
Trade             id, tenantId, enrollmentId, orderId, instrumentId, side,
                  quantity, pricePaise, chargesPaise(jsonb), simTs
Position          id, tenantId, enrollmentId, instrumentId, product,
                  netQuantity, avgPricePaise, realisedPnlPaise,
                  unrealisedPnlPaise, marginBlockedPaise, openedSimTs, closedSimTs?
Holding           id, tenantId, enrollmentId, instrumentId, quantity,
                  avgPricePaise, lastPricePaise
Basket            id, tenantId, enrollmentId, name, status
PriceAlert        id, tenantId, enrollmentId, instrumentId,
                  condition(ABOVE|BELOW), targetPricePaise, triggeredAt?
PnlRecord         id, tenantId, enrollmentId, date, realisedPaise,
                  unrealisedPaise, chargesPaise, turnoverPaise
CorporateAction   id, instrumentId, type(DIVIDEND|SPLIT|BONUS), exDate, ratio/amount
```

### 2.5 Commercial

```
Subscription      id, tenantId, plan(STARTER|STANDARD|MULTI_BRANCH),
                  seatLimit, startsAt, expiresAt,
                  status(TRIAL|ACTIVE|PAST_DUE|EXPIRED|CANCELLED),
                  razorpaySubscriptionId?
Entitlement       id, tenantId, feature(WHITE_LABEL|ON_PREM|CERTIFICATES|SCENARIO_PACK),
                  refId?, expiresAt?
Invoice           id, tenantId, number, amountPaise, gstPaise, status,
                  issuedAt, paidAt?, razorpayPaymentId?, pdfUrl?
UsageSnapshot     id, tenantId, date, activeStudents, ordersPlaced,
                  instructorMinutes, peakConcurrent
```

---

## 3. Tenant isolation

Two independent layers. Both are required.

**Layer 1 — application.** `packages/db` exports `getTenantClient(tenantId)`, a Prisma client extension that injects `tenantId` into every `where` and every `create` for tenant-scoped models. Direct `prisma.*` access to tenant models is blocked by an ESLint rule.

**Layer 2 — database.** RLS enabled on every tenant table:

```sql
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Order"
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

Each request opens a transaction and sets `app.tenant_id` from the verified JWT claim — never from a request body, query param, or header.

**Test requirement.** For every tenant model: seed Tenant A and Tenant B, authenticate as A, attempt read/update/delete of B's row by ID, assert not-found (never forbidden — forbidden leaks existence).

---

## 4. Auth

- Access token: JWT, 15 min, claims `{ sub, tenantId, role, enrollmentIds[] }`.
- Refresh token: opaque, 30 days, hashed in `Session`, rotated on use. Reuse of a rotated token revokes the whole family.
- Passwords: argon2id.
- Deny by default: every route declares required role explicitly. A route without a role declaration fails at startup.
- Seat enforcement: on login, count `ACTIVE` sessions for the tenant's students. Over `seatLimit` → reject with `SEAT_LIMIT_REACHED`. Institute admin can force-revoke sessions.

---

## 5. Market data abstraction

```ts
interface Quote {
  instrumentId: string; ltpPaise: number; bidPaise?: number; askPaise?: number;
  volume?: number; oi?: number; ts: Date;
}

interface MarketDataSource {
  readonly mode: 'LIVE' | 'DELAYED' | 'REPLAY' | 'EOD';
  getQuote(instrumentId: string, atSimTs: Date): Promise<Quote>;
  getQuotes(instrumentIds: string[], atSimTs: Date): Promise<Quote[]>;
  getCandles(instrumentId: string, interval: Interval,
             fromSimTs: Date, toSimTs: Date): Promise<Candle[]>;
  getOptionChain(underlyingId: string, expiry: Date,
                 atSimTs: Date): Promise<OptionChain>;
  subscribe(instrumentIds: string[], cb: (q: Quote) => void): Unsubscribe;
  isMarketOpen(atSimTs: Date): boolean;
}
```

**Every consumer takes `atSimTs`.** Nothing in the system may call `new Date()` to decide a market time. This single rule is what makes replay work.

Implementations:

- `VendorLiveSource` — adapters for TrueData / GFDL / Accelpix. Credentials from tenant settings (institute's own licence) or platform config.
- `DelayedSource` — wraps a live source, serves `ts - 15min`. Buffers in Redis.
- `ReplaySource` — reads `Candle` + `OptionChainSnap` from Postgres, driven by the `ReplayClock`.
- `EodSource` — NSE bhavcopy, settles once per simulated day. Zero data cost, for pilots.

**Option premium fallback.** When `OptionChainSnap` is unavailable for a replayed timestamp, synthesise premiums with Black-Scholes from the underlying's price, strike, time-to-expiry, and an IV curve fitted from the nearest available snapshot (or a configured default IV surface). Every synthesised quote is flagged `synthetic: true` and the UI shows a subtle "modelled premium" indicator. Never present synthetic data as actual traded prices.

---

## 6. Replay engine

**ReplayClock** — one per `SimSession`, owned by the API process, state in Redis so any instance can serve it.

```
tick():
  if status != RUNNING: return
  elapsedReal = now() - lastAdvancedAt
  simCurrentTs += elapsedReal * speedMultiplier
  if simCurrentTs crosses market close: pause, emit SESSION_DAY_ENDED
  persist simCurrentTs (throttled, every 5s)
  emit 'clock' to room batch:<batchId>
```

- Instructor controls: start, pause, resume, set speed (1x/2x/5x/10x), seek to timestamp, reset day.
- Students **cannot** control the clock. The student client receives `simCurrentTs` and renders from it; it never advances time itself.
- On reconnect the client requests `GET /sessions/:id/state` and re-syncs. Never trust client-reported time.
- Drift guard: if a client's reported time differs from server by >2s, force a resync.

**Order matching in replay.** An order placed at `simTs` fills against the candle containing `simTs`:

- MARKET → next candle's open, plus slippage (§7.3)
- LIMIT BUY → fills if `candle.low <= limitPrice`, at `min(limitPrice, candle.open)`
- LIMIT SELL → fills if `candle.high >= limitPrice`, at `max(limitPrice, candle.open)`
- SL / SL_M → arm when trigger crossed within the candle, then treat as LIMIT / MARKET

This is deliberately conservative — it should never fill better than reality plausibly allows.

---

## 7. Trading engine

### 7.1 Order validation (reject before accepting)

In order: instrument active → segment allowed by batch `RiskRule` → market open at `simTs` → quantity is a positive multiple of `lotSize` → price is a multiple of `tickSizePaise` → within circuit band → within freeze quantity → margin available → batch risk rules satisfied.

Rejections carry a specific `rejectionReason`. **Rejections are a teaching feature** — students learn exchange rules by hitting them. Show the reason clearly, never a generic error.

### 7.2 Charges (port formulas from old repo, re-verify rates against current NSE/SEBI circulars)

Compute per trade and store the breakdown as jsonb: brokerage, STT/CTT, exchange transaction charge, SEBI turnover fee, stamp duty, GST on (brokerage + transaction + SEBI). Rates live in a versioned config table with `effectiveFrom`, so historical replays use period-correct rates.

### 7.3 Slippage

`fillPrice = referencePrice × (1 ± slippageBps/10000)`, direction always against the trader. Base bps configurable per segment; scale up when order quantity is large relative to the candle's volume. Configurable per batch so instructors can teach with and without it.

### 7.4 Margin engine (F&O)

SPAN is not publicly replicable. Implement a documented **approximation** and label it as such in the UI:

- Futures: `max(scanRiskPct × contractValue, minimumMarginPct × contractValue)` + exposure margin
- Short options: `optionPremium + max(a% × underlyingValue − OTM_amount, b% × underlyingValue)` + exposure
- Long options: full premium debit, no margin
- Recognised spreads (vertical, calendar, straddle/strangle within same expiry) get a reduced net requirement

Parameters live in a config table, not in code. Add a UI note: *"Margins are approximated for training and will differ from your broker's SPAN."*

### 7.5 MTM, margin call, auto square-off

On each tick, per position: `unrealisedPnl = (ltp − avgPrice) × netQty × multiplier`. Wallet equity = balance + unrealised.

- Equity < 100% of margin required → `MARGIN_WARNING` event
- Equity < 50% → auto square-off MIS positions, worst-loss first, log to `LedgerEntry` with reason `AUTO_SQUARE_OFF`

Intraday (MIS) positions auto-square at 15:20 sim-time (equity) / 15:25 (F&O). Configurable per batch.

### 7.6 Expiry

At expiry sim-time: index options cash-settle at intrinsic value against the settlement price; futures settle at close. **Stock F&O positions held to expiry trigger a physical-settlement warning** starting 3 days before expiry, escalating daily — this is a real trap and one of the best teaching moments in the product.

---

## 8. Realtime contracts

Rooms: `batch:<batchId>`, `enrollment:<enrollmentId>`, `instrument:<instrumentId>`, `tenant:<tenantId>`.

**Server → client**

| Event | Room | Payload |
|---|---|---|
| `clock` | batch | `{ simCurrentTs, speed, status }` |
| `quote` | instrument | `{ instrumentId, ltpPaise, ts, synthetic? }` |
| `positionTick` | enrollment | `{ positions[], walletSummary }` |
| `orderUpdate` | enrollment | `{ order }` |
| `marginWarning` | enrollment | `{ level, equityPaise, requiredPaise }` |
| `instructorFeed` | batch | `{ enrollmentId, netPnlPaise, openPositions, lastOrderAt }` |
| `riskBreach` | batch | `{ enrollmentId, rule, value }` |
| `alertTriggered` | enrollment | `{ alert }` |
| `announcement` | batch | `{ message, from }` |

**Client → server:** `subscribeInstruments`, `unsubscribeInstruments`, `requestSync`.

Clock and instructor controls are **HTTP endpoints, not socket events** — they need auth, audit logging, and idempotency.

Throttle `positionTick` to 1/sec per enrollment; batch `quote` fan-out into 250ms windows. At 300 concurrent students this is the first thing that will break under load.

---

## 9. Privacy operations

- `GET /me/data-export` → queues a job, emails a signed URL to a JSON bundle of everything tied to that user.
- `DELETE /me/data` → soft-delete, 30-day grace, then hard purge. Anonymise, don't remove, rows the institute needs for aggregate reporting: replace identity fields with `deleted-user-<hash>`.
- Retention: trading data purged 24 months after batch end unless the institute extends it. Configurable per tenant.
- Consent captured at student signup, versioned in `ConsentRecord`.
- Under-18: `Batch.minorPolicy` = `BLOCK` (default) or `INSTITUTE_MANAGED` (institute attests it holds parental consent; attestation stored with timestamp and admin user).
- Audit logs retained 180 days minimum, stored in India.

---

## 10. API surface (representative, not exhaustive)

```
POST   /auth/login | /auth/refresh | /auth/logout | /auth/forgot | /auth/reset

# Institute admin
GET    /tenants/me                       PATCH /tenants/me/branding
GET    /branches                         POST  /branches
GET    /members                          POST  /members/invite
DELETE /members/:id                      POST  /members/:id/revoke-sessions
GET    /subscription                     GET   /invoices

# Instructor
GET    /batches                          POST  /batches
GET    /batches/:id                      PATCH /batches/:id
POST   /batches/:id/enroll               POST  /batches/:id/enroll/bulk   (CSV)
DELETE /batches/:id/enroll/:enrollmentId
PUT    /batches/:id/risk-rules
POST   /batches/:id/reset-capital
GET    /batches/:id/live                 -- instructor grid snapshot
POST   /batches/:id/announce

GET    /sessions/:id/state
POST   /sessions/:id/start | /pause | /resume | /seek | /speed | /reset-day

GET    /assignments                      POST  /assignments
POST   /assignments/:id/publish
GET    /assignments/:id/submissions      POST  /submissions/:id/grade

GET    /reports/batch/:id                GET   /reports/student/:enrollmentId
POST   /reports/batch/:id/export         -- queues PDF/XLSX job

# Student
GET    /market/instruments               GET   /market/quote
GET    /market/candles                   GET   /market/option-chain
POST   /orders                           PATCH /orders/:id     DELETE /orders/:id
GET    /orders  /trades  /positions  /holdings  /wallet  /pnl
POST   /positions/:id/square-off
POST   /baskets  /baskets/:id/execute
GET/POST/DELETE /alerts
POST   /journal                          GET   /journal
GET    /me/report

# Super admin
GET    /admin/tenants                    POST  /admin/tenants
POST   /admin/tenants/:id/subscription
GET    /admin/usage                      GET   /admin/health
```

Conventions: cursor pagination (`?cursor=&limit=`), zod validation at every boundary, idempotency key required on `POST /orders`, errors as `{ error: { code, message, details? } }` with stable machine-readable codes.

---

## 11. Background jobs (BullMQ)

| Queue | Trigger | Work |
|---|---|---|
| `clock-tick` | every 1s per running session | advance sim clock, emit |
| `mtm` | every 1s per active batch | recompute unrealised P&L, margin checks |
| `order-matcher` | on tick | evaluate pending SL/limit/GTT orders |
| `eod-settle` | daily / on sim day end | realise P&L, roll positions, write `PnlRecord` |
| `data-ingest` | nightly | pull vendor historical, upsert candles + chain snapshots |
| `report-gen` | on demand | PDF/XLSX generation, upload, email |
| `email` | on demand | transactional sends with retry |
| `usage-snapshot` | nightly | write `UsageSnapshot` per tenant |
| `licence-check` | hourly | flag expiring/expired subscriptions, notify |
| `data-purge` | daily | execute retention and deletion grace periods |

All job handlers are idempotent — assume every job can run twice.

---

## 12. Non-functional targets

| Metric | Target |
|---|---|
| Concurrent students per API instance | 300 |
| Quote fan-out latency (p95) | < 250ms |
| Order placement to confirmation (p95) | < 400ms |
| Instructor grid refresh | ≤ 1s |
| API availability during market hours | 99.5% |
| Replay clock drift across clients | < 500ms |

Load test at 2× target before the first batch of 100+ students. The `positionTick` broadcast is the known bottleneck.

---

## 13. Forward compatibility: MCX & currency segments

Not built now. But three things must be designed correctly from day one, because retrofitting them later means a migration across every trading table.

### 13.1 The three decisions that must be right now

**1. Price scale, not paise.** Prices are scaled integers with a per-instrument `priceScale`. INR instruments use `priceScale = 2` (paise). Cross-currency pairs quote to 4 decimals and would break a hardcoded paise assumption. Never write `/100` in shared code — always `/10^priceScale`.

**2. Market hours are data, not code.** NSE equity is 09:15–15:30. MCX runs a morning session plus an evening session ending 23:30 or 23:55 depending on US daylight saving. Currency derivatives run 09:00–17:00. Model this as a `TradingSession` table keyed by `(exchange, segment, effectiveFrom)` with open/close times and a seasonal variant flag — never as constants.

```
TradingSession    id, exchange, segment, name(MORNING|EVENING),
                  openTime, closeTime, effectiveFrom, effectiveTo?,
                  dstVariant(bool)
MarketHoliday     date, exchange, segment?, description
```

`isMarketOpen(atSimTs, instrument)` resolves through this table. If it takes only a timestamp and no instrument, it's wrong.

**3. Charges and margins are per-(exchange, segment) config.** Commodities attract CTT instead of STT, agri commodities are exempt, currency derivatives have no STT at all, and exchange transaction charges differ by exchange and by commodity group. The versioned rate config from §7.2 must be keyed by `(exchange, segment, instrumentGroup, effectiveFrom)` — not by segment alone.

### 13.2 What's genuinely new work later

| Area | MCX / commodities | Currency derivatives (CDS) |
|---|---|---|
| Instruments | Contract specs vary wildly — Gold 1kg lot quoted per 10g, Silver 30kg per kg, Crude 100 barrels per barrel | Straightforward: USDINR, EURINR, GBPINR, JPYINR plus cross pairs |
| Sessions | Two sessions daily, evening close shifts with US DST | Single 09:00–17:00 session |
| Settlement | Many contracts are physically delivered — tender period, delivery margin, staggered delivery | Cash-settled at RBI reference rate |
| Margins | MCX SPAN parameters differ per commodity; higher volatility scan ranges | Much lower margins than equity F&O |
| Data | Same vendors — TrueData and GFDL both cover MCX; add the segment to the subscription | Same vendors, NSE CDS segment |
| Teaching hooks | Seasonality, inventory reports, crude/gold correlation with USDINR | Interest rate parity, RBI policy impact, import/export hedging |

The data vendor story is the easy part — both TrueData and Global Datafeeds already carry MCX and NSE currency data. It's an added segment on the same subscription, not a new vendor relationship.

### 13.3 A caution on "forex"

When an institute says *forex*, confirm which one they mean. There are two very different things:

- **NSE/BSE currency derivatives (CDS segment)** — exchange-traded INR pairs and cross pairs. Legal, regulated, licensed data available from the same vendors. **This is what we build.**
- **Offshore spot FX / CFD trading** — trading with unauthorised offshore platforms is not permitted for Indian residents under FEMA, and RBI publishes an alert list of unauthorised forex platforms. **We do not build a simulator for this**, in any form, regardless of what an institute asks for. Teaching material that normalises it is a reputational and regulatory problem we don't need.

If an institute's curriculum centres on offshore FX, that's a client to decline, not a feature request. Say so plainly in the sales conversation and offer the CDS segment instead.

### 13.4 Cheap hooks to add now (do these during Phases 3–4)

None of these cost meaningful time today and each saves a migration later:

- `exchange`, `segment`, `instrumentType` as enums with MCX/NCDEX/CDS/COMM values already present, even though unused
- `priceScale`, `priceMultiplier`, `quotationUnit`, `settlementType` columns on `Instrument`
- `TradingSession` table driving `isMarketOpen()` from day one, seeded with NSE rows only
- Charges and margin config keyed by `(exchange, segment, group)` from the start
- `MarketDataSource` adapters take an `Instrument`, not a symbol string — vendor symbol formats differ per exchange
- UI segment selector built as a data-driven list, not a hardcoded EQ/FO toggle
