# BACKLOG.md — Executable Ticket Backlog

> Zero to one, in dependency order. Each ticket is one branch, one PR. Read `AGENTS.md` §7 before starting any ticket, and the referenced `SPEC.md` section before writing code.
>
> `[needs-review]` = restate your plan and wait for approval before coding.
> Estimates assume one developer (human or agent) working on that ticket alone.

---

## Phase 0 — Foundation & Legal Unblock

*Nothing ships until this is done. ~2 weeks.*

**P0-01 · Monorepo scaffold** · 1d
Set up pnpm workspaces + Turborepo with the layout in AGENTS.md §3. TypeScript strict everywhere, shared tsconfig/eslint/prettier. `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm typecheck` all work from root.
*AC:* fresh clone → `pnpm install && pnpm build` succeeds with empty apps.

**P0-02 · Local infra via Docker Compose** · 0.5d
Postgres 16, Redis 7, MinIO. `.env.example` documenting every variable. Health-check script.
*AC:* `docker compose up` gives a working local stack; `pnpm db:push` connects.

**P0-03 · Prisma init + base migration** · 1d · Depends: P0-02
`packages/db` with Prisma, UUIDv7 default, BigInt money convention, `createdAt`/`updatedAt` on all models. Only `Tenant` and `User` for now.
*AC:* migration applies clean; generated client exported from `@repo/db`.

**P0-04 · Brand identity** · 2d · `[needs-review]`
New product name, logo, colour tokens, typography scale. Design tokens in `packages/ui`. **Zero Zerodha/Kite resemblance** — see AGENTS.md §4.4.
*AC:* token file + logo assets committed; a written note confirming no broker brand appears anywhere.

**P0-05 · Marketing site** · 3d · Depends: P0-01, P0-04
Next.js public site: home, product, pricing, for-institutes, contact, legal pages. Original layout and copy — do not mirror any broker's site.
*AC:* Lighthouse ≥ 90; disclaimer in footer of every page.

**P0-06 · Legal documents** · 1d · `[needs-review]`
Terms of Service, EULA, Privacy Policy, Data Processing Agreement template, and the global disclaimer component. Placeholder text is acceptable pending legal review, but structure and required clauses must be complete.
*AC:* rendered at `/legal/*`; `<Disclaimer />` component used in the app shell.

**P0-07 · Dependency licence gate** · 0.5d
`license-checker` in CI. Fail the build on GPL/AGPL/SSPL.
*AC:* CI fails when a GPL package is added; passes otherwise.

**P0-08 · CI pipeline** · 1d · Depends: P0-01
GitHub Actions: install → lint → typecheck → test → build. Branch protection on `main`.
*AC:* PR cannot merge with a failing check.

---

## Phase 1 — Identity, Tenancy & Access Control

*The foundation everything else sits on. ~5 weeks.*

**P1-01 · Identity schema** · 1d · Depends: P0-03 · SPEC §2.1
Tenant, Branch, User, Membership, Session, AuditLog, ConsentRecord.
*AC:* migration applies; `(tenantId, email)` unique on User.

**P1-02 · Tenant-scoped Prisma client** · 3d · `[needs-review]` · SPEC §3
`getTenantClient(tenantId)` Prisma extension injecting `tenantId` into every where/create for tenant models. ESLint rule blocking direct `prisma.<tenantModel>` access outside `packages/db`.
*AC:* unit tests prove injection on find/update/delete/create; lint rule fires on violation.

**P1-03 · Row-Level Security** · 2d · Depends: P1-02 · SPEC §3
RLS policies on every tenant table. Request-scoped transaction sets `app.tenant_id` from the verified JWT claim only.
*AC:* a raw query with the wrong `app.tenant_id` returns zero rows even bypassing the client extension.

**P1-04 · Password auth + JWT** · 3d · Depends: P1-01 · SPEC §4
argon2id hashing, access/refresh tokens, rotation with reuse detection, login/logout/refresh endpoints.
*AC:* reusing a rotated refresh token revokes the entire session family.

**P1-05 · RBAC middleware** · 2d · Depends: P1-04
Declarative role requirement per route. **A route registered without a role declaration throws at startup.**
*AC:* startup test asserts every registered route declares a role; cross-role access returns 403.

**P1-06 · Email infrastructure** · 2d
Provider integration, React Email templates, BullMQ `email` queue with retry. Templates: verify, reset, invite, report-ready.
*AC:* emails render and send in local dev via a catcher; retries on failure.

**P1-07 · Signup, verification, password reset** · 2d · Depends: P1-04, P1-06
Instructor/admin invite flow; student self-signup via batch invite code.
*AC:* full round trip works; tokens single-use and expiring.

**P1-08 · Session & seat enforcement** · 2d · Depends: P1-04 · SPEC §4
Session listing, device labels, forced revoke, concurrent-seat cap per tenant.
*AC:* exceeding `seatLimit` returns `SEAT_LIMIT_REACHED`; admin revoke immediately invalidates.

**P1-09 · Audit logging** · 1.5d · Depends: P1-01
Middleware capturing actor, action, entity, before/after for state-changing routes.
*AC:* a batch update writes an audit row with correct diff.

**P1-10 · Tenant isolation test suite** · 2d · `[needs-review]` · Depends: P1-02, P1-03
Reusable harness: seed two tenants, attempt cross-tenant read/update/delete on every tenant model, assert not-found. **This harness is extended by every future ticket that adds a tenant model.**
*AC:* suite runs in CI; a deliberately unscoped query makes it fail.

**P1-11 · Seed data** · 1d
Two institutes with deliberately overlapping batch names, instructor names, and student emails.
*AC:* `pnpm db:seed` produces the fixture; isolation tests run against it.

**P1-12 · App shell + auth UI** · 3d · Depends: P1-04, P0-04
Next.js authenticated shell: login, role-aware navigation, tenant branding, error boundary, toasts.
*AC:* all four roles land on their correct home route.

---

## Phase 2 — Institute & Instructor Layer

*This is the product. ~6 weeks.*

**P2-01 · Teaching schema** · 1.5d · Depends: P1-01 · SPEC §2.2
Batch, BatchInstructor, Enrollment, RiskRule, Assignment, Submission, TradeJournal, AttendanceLog. Extend the isolation suite.
*AC:* migration + isolation tests pass for all new models.

**P2-02 · Institute admin console** · 3d · Depends: P1-12
Tenant profile, branches CRUD, member invite/suspend/remove, role assignment.
*AC:* admin can onboard an instructor end to end.

**P2-03 · Batch CRUD** · 2.5d · Depends: P2-01
Create/edit/archive batches with starting capital, market mode, dates, instructors.
*AC:* instructor sees only their own batches; admin sees all in tenant.

**P2-04 · Student enrollment + bulk CSV import** · 3d · Depends: P2-03, P1-06
Individual add, invite-code join, and CSV import with row-level validation, a preview step, partial-success reporting, and duplicate detection.
*AC:* a 200-row CSV with 5 bad rows imports 195 and reports exactly which 5 failed and why.

**P2-05 · Risk rules per batch** · 2d · Depends: P2-01 · SPEC §2.2
Instructor sets max daily loss, max position value, max open positions, mandatory SL, allowed segments.
*AC:* rules persist and are readable by the order validator (enforcement lands in P4-02).

**P2-06 · Instructor live grid** · 5d · `[needs-review]` · Depends: P2-03 · SPEC §8
Every student in a batch on one screen: net P&L, open positions, margin used, last order time, risk-breach flags. Sortable, filterable, live over `instructorFeed`. Drill into any student's book.
*AC:* 60 students update within 1s; sorting and filtering hold under live updates.
*Note:* this is the demo-closing feature. Build it properly.

**P2-07 · Batch announcements** · 1d · Depends: P2-06
Instructor broadcasts a message to the batch room.
*AC:* delivered to all connected students within 1s.

**P2-08 · Assignments** · 4d · Depends: P2-01
Create/publish/close assignments with scenario, window, starting capital, rubric. Student view of assigned work and deadlines.
*AC:* publishing creates a Submission row per active enrollment.

**P2-09 · Submission metrics + grading** · 3d · Depends: P2-08
Auto-compute per submission: net P&L, win rate, max drawdown, trade count, rule adherence. Instructor grades against the rubric and leaves feedback.
*AC:* metrics match a hand-computed fixture exactly.

**P2-10 · Trade journal** · 2d · Depends: P2-01
Student records thesis, emotion, and mistake tags per trade. Instructor can read journals in the drill-down.
*AC:* journal entries link correctly to orders and positions.

**P2-11 · Batch leaderboard** · 1.5d · Depends: P2-06
Ranked by configurable metric (P&L, risk-adjusted return, rule adherence). **Non-monetary only — no rewards system.**
*AC:* updates live; instructor can hide it per batch.

**P2-12 · Progress reports** · 4d · Depends: P2-09
Per-student and per-batch reports: equity curve, win rate, R-multiple distribution, holding periods, rule adherence, journal completion. PDF and XLSX export via the `report-gen` queue.
*AC:* PDF renders identically for a fixed fixture across runs.

**P2-13 · Attendance & activity tracking** · 2d · Depends: P2-01
Active minutes, session count, orders placed per student per day.
*AC:* surfaced in the batch report; no keystroke or screen-level tracking.

**P2-14 · Virtual capital allocation & reset** · 1.5d · Depends: P2-03
Set starting capital per batch; reset a batch or an individual student, with confirmation and audit entry.
*AC:* reset clears positions/orders/wallet and writes an audit row.

---

## Phase 3 — Market Data Independence & Replay

*Removes the legal blocker, creates the teaching advantage. ~6 weeks.*

**P3-01 · Market data schema** · 1.5d · SPEC §2.3
Instrument, Candle (partitioned by month), OptionChainSnap, ScenarioPack, MarketHoliday. Global, not tenant-scoped.
*AC:* 10M candle rows insert and query by `(instrumentId, ts)` in <100ms.

**P3-02 · MarketDataSource interface** · 2d · `[needs-review]` · SPEC §5
Interface, a fixture-backed `MockSource`, and the factory that resolves mode → implementation. **Every method takes `atSimTs`.**
*AC:* an ESLint rule forbids `new Date()` in `packages/core` and `packages/market-data`.

**P3-03 · Instrument master + NSE holiday calendar** · 2d · Depends: P3-01
Daily instrument-master ingestion, expiry generation for F&O, holiday calendar, market-hours rules (09:15–15:30 equity, F&O session, pre/post windows).
*AC:* `isMarketOpen()` correct across a year of holidays including muhurat sessions.

**P3-04 · Vendor adapter: TrueData** · 3d · Depends: P3-02
REST + websocket adapter behind the interface. Credentials from tenant settings or platform config. Reconnect with backoff, subscription limits respected.
*AC:* adapter passes the shared `MarketDataSource` conformance test suite.

**P3-05 · Vendor adapter: Global Datafeeds** · 2.5d · Depends: P3-04
Same conformance suite.
*AC:* switching vendors requires only a config change.

**P3-06 · Institute-supplied credentials UI** · 1.5d · Depends: P3-04
Institute admin enters their own vendor credentials; encrypted at rest; connection test button.
*AC:* invalid credentials fail with a clear message and are never persisted in plaintext.

**P3-07 · DelayedSource** · 2d · Depends: P3-04 · SPEC §5
Wraps a live source, serves `ts − 15min`, buffered in Redis.
*AC:* served quotes are provably ≥15 min old; buffer survives a process restart.

**P3-08 · Historical data ingestion** · 3d · Depends: P3-01, P3-04
Nightly `data-ingest` job pulling 1-min candles for EQ + F&O and option chain snapshots. Idempotent upserts, gap detection, backfill command.
*AC:* re-running for the same date changes nothing; gaps are reported not silently skipped.

**P3-09 · ReplayClock** · 4d · `[needs-review]` · Depends: P3-02 · SPEC §6
Per-session clock, state in Redis, tick job, market-close handling, throttled persistence.
*AC:* two API instances serve identical `simCurrentTs` within 100ms; survives instance restart.

**P3-10 · ReplaySource** · 3d · Depends: P3-08, P3-09
Reads candles and chain snapshots at `simCurrentTs`. Prefetch window in Redis for tick performance.
*AC:* conformance suite passes; a full trading day replays without a query spike.

**P3-11 · Instructor clock controls** · 2.5d · Depends: P3-09
HTTP endpoints for start/pause/resume/speed/seek/reset-day, audit-logged. Student clients are read-only observers.
*AC:* a student calling a control endpoint gets 403; all clients resync within 500ms of a seek.

**P3-12 · Black-Scholes premium synthesis** · 3d · `[needs-review]` · Depends: P3-10 · SPEC §5
Generate option premiums and Greeks when chain history is missing. IV fitted from the nearest snapshot or a default surface. Flag `synthetic: true`.
*AC:* against a date where real chain data exists, synthesised premiums fall within a documented tolerance; UI shows the "modelled" indicator.

**P3-13 · EodSource (bhavcopy)** · 2.5d · Depends: P3-02
NSE bhavcopy ingestion, once-per-simulated-day settlement mode. Zero data cost — this is the pilot mode.
*AC:* a full week settles correctly with no vendor subscription configured.

**P3-14 · Scenario packs** · 3d · Depends: P3-10
Pack framework (catalog, entitlement gating, assignment binding) plus the first three: a budget day, a crash day, an expiry day.
*AC:* instructor assigns a pack; every student starts on the identical tick.

---

## Phase 4 — Simulation Realism

*What keeps clients after year one. ~5 weeks.*

**P4-01 · Trading schema** · 1.5d · Depends: P2-01 · SPEC §2.4
SimSession, Wallet, LedgerEntry, Order, Trade, Position, Holding, Basket, PriceAlert, PnlRecord, CorporateAction. Extend isolation suite.
*AC:* migration + isolation tests pass.

**P4-02 · Order validation pipeline** · 3d · `[needs-review]` · Depends: P4-01, P2-05 · SPEC §7.1
Full ordered validation chain with specific `rejectionReason` codes, including batch risk rules.
*AC:* each rejection path has a test; UI shows the human-readable reason, never a generic error.

**P4-03 · Charges engine** · 2.5d · Depends: P4-01 · SPEC §7.2
Port formulas from the old repo; versioned rate config with `effectiveFrom` so replays use period-correct rates.
*AC:* matches a real contract note for a known trade to the paisa.

**P4-04 · Order matching + fills** · 4d · `[needs-review]` · Depends: P3-10, P4-02 · SPEC §6
Market/limit/SL/SL-M fill logic against candles, partial fills, slippage model.
*AC:* fill logic never produces a better price than the candle's range allows.

**P4-05 · Positions, holdings, wallet ledger** · 3d · Depends: P4-04
Position netting, average price, realised/unrealised split, double-entry ledger. Every balance change writes a `LedgerEntry`.
*AC:* wallet balance always equals the ledger sum; property test over 1,000 random trade sequences.

**P4-06 · Margin engine** · 5d · `[needs-review]` · Depends: P4-05 · SPEC §7.4
SPAN approximation for futures and options, spread recognition, config-driven parameters, UI disclosure that margins are approximated.
*AC:* documented tolerance vs published broker margins for 20 reference positions.

**P4-07 · MTM, margin call, auto square-off** · 3d · Depends: P4-06 · SPEC §7.5
Per-tick MTM, warning thresholds, auto square-off worst-loss-first, intraday time-based square-off.
*AC:* a deliberately over-leveraged position triggers warning then square-off at the right thresholds.

**P4-08 · Full order type coverage** · 3d · Depends: P4-04
Bracket orders, AMO, GTT (with backend — mobile UI already exists), cover orders, basket orders.
*AC:* each type has a lifecycle test including cancel and partial-fill paths.

**P4-09 · Expiry & settlement** · 3.5d · `[needs-review]` · Depends: P4-06 · SPEC §7.6
Index option cash settlement at intrinsic, futures settlement, auto square-off at expiry, and the **escalating physical-settlement warning for stock F&O** starting 3 days out.
*AC:* a stock-option position held to expiry produces warnings on each of the 3 days and settles correctly.

**P4-10 · Option chain + Greeks UI** · 3d · Depends: P3-12
Chain with strikes, OI, IV, and Greeks; synthetic-data indicator; one-click order entry from a strike.
*AC:* renders 40 strikes with live updates without dropping frames.

**P4-11 · Options strategy builder** · 4d · Depends: P4-10
Multi-leg builder with payoff chart, breakevens, max profit/loss, net Greeks. Executes as a basket.
*AC:* payoff curve matches hand-computed values for straddle, iron condor, and calendar spread.

**P4-12 · Corporate actions** · 2d · Depends: P4-05
Dividends, splits, bonuses applied to holdings and positions on ex-date.
*AC:* a 1:5 split adjusts quantity and average price correctly with a ledger entry.

**P4-13 · P&L and Tax P&L reports** · 3d · Depends: P4-05
Realised/unrealised, charges, monthly breakdown, FY-based STCG/LTCG/speculative categorisation. Port logic from old repo.
*AC:* matches the old repo's output for an identical trade fixture.

**P4-14 · Price alerts** · 1.5d · Depends: P4-01
CRUD plus evaluation on tick, delivered via socket and push.
*AC:* fires exactly once per trigger; no duplicates across API instances.

---

## Phase 5 — Commercial Layer

*Makes revenue collectable and renewals enforceable. ~4 weeks.*

**P5-01 · Commercial schema** · 1d · SPEC §2.5
Subscription, Entitlement, Invoice, UsageSnapshot.

**P5-02 · Licence enforcement** · 2.5d · `[needs-review]` · Depends: P5-01, P1-08
Hard block on expiry, seat-limit block on enrollment and login, 14-day expiry warnings to institute admin. Grace period configurable.
*AC:* an expired tenant can log in and see billing only — all trading routes return `SUBSCRIPTION_EXPIRED`.

**P5-03 · Razorpay subscriptions** · 3d · Depends: P5-01
Plan creation, checkout, webhooks (payment captured, failed, subscription cancelled), signature verification, idempotent handling.
*AC:* replayed webhooks don't double-credit; failed payment moves tenant to `PAST_DUE`.

**P5-04 · GST invoicing** · 2.5d · Depends: P5-03
Sequential invoice numbering, correct CGST/SGST vs IGST by place of supply, PDF generation and storage.
*AC:* invoice numbers are gapless; interstate tenant gets IGST.

**P5-05 · Trial provisioning** · 1.5d · Depends: P5-02
Self-serve or admin-created trial with auto-expiry and conversion flow.
*AC:* trial expiry behaves identically to subscription expiry.

**P5-06 · Institute billing portal** · 2d · Depends: P5-04
Current plan, seat usage, invoice history and downloads, upgrade request.
*AC:* seat usage matches actual active enrollments.

**P5-07 · White-label theming** · 3d · Depends: P5-01, P1-12
Per-tenant logo, colours, product name, and subdomain routing. Gated by the `WHITE_LABEL` entitlement.
*AC:* two tenants render distinct branding from one deployment; no flash of default theme on load.

**P5-08 · Usage analytics per tenant** · 2d · Depends: P5-01
Nightly snapshots; institute-facing dashboard and super-admin view. Feeds renewal conversations.
*AC:* "students placed N trades this term" is accurate against raw data.

**P5-09 · Super admin console** · 2.5d · Depends: P5-02
Provision tenants, set plans and seats, extend expiry, impersonate for support (audit-logged, consent-gated, time-boxed).
*AC:* every impersonation writes an audit entry and expires automatically.

---

## Phase 6 — Mobile

*~4 weeks.*

**P6-01 · Mobile auth + tenancy** · 3d · Depends: P1-04
Login with institute code, secure token storage, refresh handling, biometric unlock optional.
*AC:* token refresh works after 24h backgrounded.

**P6-02 · Runtime theming** · 2d · Depends: P5-07
Institute branding fetched at login, applied without a rebuild. **One app, not per-institute builds.**
*AC:* two institute codes produce two distinct-looking apps from one binary.

**P6-03 · Trading screens** · 5d · Depends: P4-08
Markets, watchlist, order entry, option chain, orders, positions, holdings, funds. Port structure from old Expo app, restyle per P0-04.
*AC:* full order lifecycle completable on mobile alone.

**P6-04 · Replay support on mobile** · 2.5d · Depends: P3-11
Clock sync, session status, instructor-paused state clearly indicated.
*AC:* drift under 500ms; correct state after backgrounding.

**P6-05 · Push notification service** · 3d · Depends: P1-06
Server-side Expo push: alerts, margin warnings, assignment deadlines, announcements. Token registration and cleanup.
*AC:* delivery to iOS and Android; stale tokens pruned automatically.

**P6-06 · Offline & reconnect handling** · 2.5d · Depends: P6-03
Queue-and-retry, stale-data indicator, graceful socket reconnect. College wifi will drop constantly — assume it.
*AC:* a 30s network drop mid-session recovers without losing a placed order or duplicating one.

**P6-07 · Reports & journal on mobile** · 2d · Depends: P2-10, P2-12
Own report card, journal entry, assignment list.
*AC:* PDF report opens and shares from the device.

**P6-08 · Release pipeline** · 2.5d · Depends: P6-01
EAS build/submit, forced-update gating, versioning, store privacy declarations, deep links.
*AC:* a build below minimum version is blocked with an update prompt.

**P6-09 · Remove legacy KYC capture** · 0.5d
Delete image picker and camera permissions inherited from the old app. A simulator collects no photos. See AGENTS.md §4.5.
*AC:* no camera or photo-library permission in either app manifest.

---

## Phase 7 — Production Hardening

*Can run partly in parallel with Phases 5–6. ~4 weeks.*

**P7-01 · BullMQ queue infrastructure** · 2d · SPEC §11
All queues, workers, retry/backoff policies, dead-letter handling, idempotency helper.
*AC:* every handler passes a run-twice idempotency test.

**P7-02 · Socket.IO Redis adapter + horizontal scale** · 3d · `[needs-review]` · Depends: P7-01
Redis adapter, sticky sessions, room fan-out across instances, throttling per SPEC §8.
*AC:* three API instances behind a load balancer deliver every event exactly once.

**P7-03 · Rate limiting & hardening** · 2d
Per-user and per-IP limits, stricter on auth and order placement. Helmet, CORS allowlist, request size caps.
*AC:* order endpoint limits enforced without breaking legitimate rapid trading.

**P7-04 · Observability** · 2.5d
Sentry, structured JSON logging with request/tenant/user correlation IDs, Prometheus metrics, uptime checks. **Logs retained 180 days in an India region.**
*AC:* a thrown error is traceable end to end from log line to Sentry event.

**P7-05 · Backups & restore drill** · 2d
Automated Postgres backups, PITR, documented restore runbook, and an **actually executed** restore test.
*AC:* restore drill completed and timed; runbook committed.

**P7-06 · Staging environment + deploy pipeline** · 2.5d · Depends: P0-08
Staging with prod-shaped data, zero-downtime deploy, migration gating, rollback procedure.
*AC:* a deploy during an active simulated session drops no socket connection.

**P7-07 · Load test** · 3d · `[needs-review]` · Depends: P7-02 · SPEC §12
k6/artillery at 600 concurrent students (2× target) with live P&L ticks. Profile and fix the top three bottlenecks.
*AC:* targets in SPEC §12 met; results and fixes documented.

**P7-08 · E2E test suite** · 3d
Playwright covering: institute onboarding → batch creation → bulk enrollment → assignment → student trades → grading → report export. Runs against staging in CI.
*AC:* full journey green on every main-branch build.

**P7-09 · Health checks & graceful shutdown** · 1d
Liveness/readiness endpoints, in-flight request draining, socket reconnect grace.
*AC:* rolling restart loses no requests.

---

## Phase 8 — Compliance & Differentiation

*~4 weeks.*

**P8-01 · Consent capture** · 1.5d · Depends: P1-01 · SPEC §9
Versioned consent at signup, re-consent prompt on version bump.

**P8-02 · Data export** · 2d · Depends: P7-01 · SPEC §9
`GET /me/data-export` queues a job, emails a signed URL to a complete JSON bundle.
*AC:* export includes every table holding that user's data — verified against the schema.

**P8-03 · Data deletion & retention** · 3d · `[needs-review]` · Depends: P8-02 · SPEC §9
Soft-delete with 30-day grace, hard purge, anonymisation preserving aggregate reporting, configurable per-tenant retention, daily `data-purge` job.
*AC:* after purge, no personal identifier remains; batch aggregate reports still compute.

**P8-04 · Under-18 policy** · 2d · Depends: P8-01 · SPEC §9
`Batch.minorPolicy` of `BLOCK` or `INSTITUTE_MANAGED` with stored, timestamped institute attestation.
*AC:* default is `BLOCK`; switching requires explicit admin attestation, audit-logged.

**P8-05 · Immutable order audit trail** · 2d · Depends: P4-04
Append-only record of every order state transition with hash chaining for tamper evidence.
*AC:* modifying a historical row breaks chain verification.

**P8-06 · Mistake detection engine** · 5d · `[needs-review]` · Depends: P4-13, P2-12
Detect overtrading, missing stop-losses, revenge trading, position oversizing, averaging into losers, and holding losers while cutting winners. Surface in the student report card with explanations, not just labels.
*AC:* each pattern validated against hand-labelled fixture trade sequences; false-positive rate documented.

**P8-07 · Certificate generation** · 2d · Depends: P2-12
Institute-branded completion certificates with verification code and a public verification page. Gated by entitlement.

**P8-08 · Contest mode** · 3d · Depends: P2-11
Time-boxed competitions across batches or branches, with rules and rankings. **Non-monetary recognition only.**
*AC:* a contest window opens and closes automatically; no rewards system exists in the codebase.

**P8-09 · Advanced analytics** · 4d · Depends: P4-13
Win rate, R-multiple distribution, expectancy, max drawdown, Sharpe, holding-period distribution, per-setup performance, time-of-day analysis. Instructor and student views.
*AC:* metrics match hand-computed values on a reference fixture.

**P8-10 · On-premise packaging** · 3d · Depends: P5-02
Docker Compose bundle, offline licence key validation, upgrade path, install runbook.
*AC:* installs on a clean VM from the runbook alone, with no internet access beyond the data vendor.

---

## Phase 9 — MCX & Currency Segments (future)

*Not now. Scheduled after the product is stable with paying institutes — realistically 12+ months out. Listed so the hooks in Phases 3–4 are built correctly today. See SPEC §13.*

**P9-00 · Forward-compat hooks** · 1.5d · **DO THIS DURING PHASE 3, NOT LATER** · SPEC §13.4
Add `exchange`, `segment`, `instrumentType`, `priceScale`, `priceMultiplier`, `quotationUnit`, `settlementType` to Instrument. Create the `TradingSession` table and route `isMarketOpen()` through it, seeded with NSE rows only. Key charges and margin config by `(exchange, segment, group)`.
*AC:* NSE behaviour is unchanged; adding an MCX row to `TradingSession` requires no code change.
*Note:* this is the only Phase 9 ticket with real urgency. Everything below is cheap once this exists and expensive if it doesn't.

**P9-01 · MCX instrument master** · 3d · Depends: P9-00
Ingest MCX contract specs: lot sizes, quotation units, price multipliers, tick sizes, expiry cycles, tender periods. Gold/Silver/Crude/NatGas/Copper/Zinc to start.
*AC:* contract value computes correctly for Gold (quoted per 10g, 1kg lot) and Crude (per barrel, 100 barrel lot).

**P9-02 · MCX trading sessions & holidays** · 2d · Depends: P9-00
Morning and evening sessions, DST-shifted evening close (23:30 / 23:55), MCX holiday calendar.
*AC:* `isMarketOpen()` correct across a full year including both DST transitions.

**P9-03 · MCX data vendor segment** · 2d · Depends: P9-01
Add the MCX segment to the TrueData and GFDL adapters, including symbol format mapping.
*AC:* both adapters pass the conformance suite for MCX instruments.

**P9-04 · Commodity charges engine** · 2d · Depends: P9-01 · SPEC §7.2
CTT instead of STT, agri exemptions, MCX transaction charges by commodity group, stamp duty rates.
*AC:* matches a real MCX contract note to the paisa.

**P9-05 · Commodity margins** · 3d · Depends: P9-04
MCX SPAN approximation with per-commodity scan ranges, higher volatility parameters, tender-period margin escalation.
*AC:* documented tolerance against published broker margins for 10 reference contracts.

**P9-06 · Physical delivery simulation** · 4d · `[needs-review]` · Depends: P9-05
Tender period detection, delivery margin, escalating warnings before tender, and a simulated delivery outcome. The commodity equivalent of the stock-F&O physical settlement trap — and the same strong teaching moment.
*AC:* a position held into tender period produces daily escalating warnings and settles per contract spec.

**P9-07 · Currency derivatives (CDS) segment** · 3d · Depends: P9-00
USDINR, EURINR, GBPINR, JPYINR futures and options, plus cross pairs. 09:00–17:00 session. Cash settlement at RBI reference rate. Lower margin parameters.
*AC:* a EURUSD-style 4-decimal quote round-trips correctly through `priceScale` with no precision loss.

**P9-08 · Multi-segment UI** · 3d · Depends: P9-03, P9-07
Data-driven segment selector across web and mobile, segment-aware watchlists, option chains, and order tickets. Batch `RiskRule.allowedSegments` gates what a batch can trade.
*AC:* an instructor can restrict a batch to EQ + FO only, and MCX instruments become unsearchable for that batch.

**P9-09 · Commodity & currency scenario packs** · 3d · Depends: P9-06, P9-07
Replay packs: a crude oil crash, a gold spike, an RBI policy day on USDINR.
*AC:* each pack replays end to end including the relevant session structure.

**P9-10 · Segment entitlements** · 1.5d · Depends: P5-01
MCX and CDS as paid add-on entitlements per tenant, priced separately from the base licence.
*AC:* a tenant without the MCX entitlement sees no MCX instruments anywhere.

**Explicitly out of scope, permanently:** offshore spot forex and CFD simulation. See SPEC §13.3 — that's a client to decline, not a feature to build.


---

## Summary

| Phase | Focus | Tickets | Duration (1 dev) |
|---|---|---|---|
| 0 | Foundation & legal unblock | 8 | ~2 weeks |
| 1 | Identity & tenancy | 12 | ~5 weeks |
| 2 | Institute & instructor layer | 14 | ~6 weeks |
| 3 | Data independence & replay | 14 | ~6 weeks |
| 4 | Simulation realism | 14 | ~5 weeks |
| 5 | Commercial layer | 9 | ~4 weeks |
| 6 | Mobile | 9 | ~4 weeks |
| 7 | Production hardening | 9 | ~4 weeks |
| 8 | Compliance & differentiation | 10 | ~4 weeks |
| 9 | MCX & currency *(future)* | 11 | ~4 weeks |

**Phases 0–8: ~99 tickets, ~40 weeks single-developer.** With 2–3 working in parallel from Phase 2 onward: roughly 6–8 months.

Phase 9 is deliberately excluded from that total — it's a later expansion. The one exception is **P9-00**, which belongs in Phase 3 and should be treated as a Phase 3 ticket.

### Sellable checkpoint

**Phases 0 → 1 → 2 → 3 make the product sellable** (~19 weeks solo, ~12 with two people). At that point you have a legally clean, multi-tenant product with the instructor layer nobody else offers, running on legitimate data.

Sell 2–3 institutes at introductory pricing there. Build Phases 4–8 with their money and their feedback.

Expect Phase 4 to be pulled forward — an experienced F&O trainer will notice the missing margin engine within a week of the first pilot. Keep P4-06 and P4-09 ready to promote.

### Parallelisation

Once Phase 1 is complete, these tracks are largely independent:

- **Track A:** Phase 2 (instructor layer) — highest business value, do this first
- **Track B:** Phase 3 (data + replay) — most technically involved, start it in parallel
- **Track C:** Phase 7 (infrastructure) — can begin any time after Phase 1

Phase 4 depends on both A and B. Phases 5 and 6 depend on 4. Phase 8 is last.

### On Phase 9

Do not start Phase 9 until at least 5 institutes are paying and renewing on the equity/F&O product. Segment expansion is the classic way a small team stalls — it feels like progress while the thing that actually sells (the instructor layer) goes unpolished.

The one exception is **P9-00**. Build those hooks during Phase 3, when the schema is already being written. It costs about a day and a half then; retrofitting `priceScale` across every trading table after you have live client data is a multi-week migration with real risk of corrupting P&L history.

Commercially, MCX is the better first expansion: same data vendors, same exchange-traded model, and commodity trading is already taught at many institutes. Currency (CDS) is a smaller ask and usually comes bundled into a broader curriculum rather than requested on its own.
